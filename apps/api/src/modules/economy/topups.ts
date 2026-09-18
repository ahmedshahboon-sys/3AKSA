import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../../db.js';
import { ensureUserWallet, formatLydFromMilli, type WalletAccountRow } from './service.js';

type TopupRow = {
  id: string;
  user_id: string;
  amount_milli: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  payment_reference: string | null;
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  ledger_transaction_id: string | null;
  created_at: Date;
  updated_at: Date;
};

function amount(value: string) {
  const n=Number(value);
  if(!Number.isSafeInteger(n)) throw new Error('WALLET_AMOUNT_OUT_OF_RANGE');
  return n;
}

function dto(row: TopupRow) {
  const amountMilli=amount(row.amount_milli);
  return {
    id: row.id,
    amountMilli,
    amountLyd: formatLydFromMilli(amountMilli),
    currency: 'LYD' as const,
    status: row.status,
    paymentReference: row.payment_reference,
    note: row.note,
    reviewedAt: row.reviewed_at,
    ledgerTransactionId: row.ledger_transaction_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function createManualTopupRequest(
  userId: string,
  amountMilli: number,
  paymentReference?: string | null,
  note?: string | null
) {
  if (!Number.isSafeInteger(amountMilli) || amountMilli <= 0) {
    throw new Error('INVALID_TOPUP_AMOUNT');
  }
  const pending=await query<{ id: string }>(
    `SELECT id FROM manual_topup_requests
     WHERE user_id=$1 AND status='pending'
     LIMIT 1`,
    [userId]
  );
  if(pending.rows[0]) throw new Error('TOPUP_REQUEST_ALREADY_PENDING');

  const result=await query<TopupRow>(
    `INSERT INTO manual_topup_requests (
       id,user_id,amount_milli,payment_reference,note
     ) VALUES ($1,$2,$3,$4,$5)
     RETURNING id,user_id,amount_milli,status,payment_reference,note,reviewed_by,reviewed_at,ledger_transaction_id,created_at,updated_at`,
    [randomUUID(),userId,amountMilli,paymentReference ?? null,note ?? null]
  );
  return dto(result.rows[0]!);
}

export async function listManualTopupRequests(userId: string, limit=30) {
  const result=await query<TopupRow>(
    `SELECT id,user_id,amount_milli,status,payment_reference,note,reviewed_by,reviewed_at,ledger_transaction_id,created_at,updated_at
     FROM manual_topup_requests
     WHERE user_id=$1
     ORDER BY created_at DESC,id DESC
     LIMIT $2`,
    [userId,limit]
  );
  return result.rows.map(dto);
}

export async function cancelManualTopupRequest(userId: string, requestId: string) {
  const result=await query<TopupRow>(
    `UPDATE manual_topup_requests
     SET status='cancelled',updated_at=now()
     WHERE id=$1 AND user_id=$2 AND status='pending'
     RETURNING id,user_id,amount_milli,status,payment_reference,note,reviewed_by,reviewed_at,ledger_transaction_id,created_at,updated_at`,
    [requestId,userId]
  );
  return result.rows[0] ? dto(result.rows[0]) : null;
}


export async function approveManualTopupRequest(requestId: string, reviewerUserId: string) {
  return withTransaction(async (client) => {
    const found = await client.query<TopupRow>(
      `SELECT id,user_id,amount_milli,status,payment_reference,note,
              reviewed_by,reviewed_at,ledger_transaction_id,created_at,updated_at
       FROM manual_topup_requests
       WHERE id=$1
       FOR UPDATE`,
      [requestId]
    );
    const topup = found.rows[0];
    if (!topup) throw new Error('TOPUP_REQUEST_NOT_FOUND');
    if (topup.status === 'approved') {
      return { topup: dto(topup), replayed: true };
    }
    if (topup.status !== 'pending') throw new Error('TOPUP_REQUEST_NOT_PENDING');

    const amountMilli = amount(topup.amount_milli);
    const userAccount = await ensureUserWallet(client, topup.user_id);
    const clearingResult = await client.query<WalletAccountRow>(
      `SELECT id,owner_user_id,balance_milli
       FROM wallet_accounts
       WHERE system_code='topup_clearing'
       LIMIT 1`
    );
    const clearing = clearingResult.rows[0];
    if (!clearing) throw new Error('SYSTEM_WALLET_NOT_FOUND');

    await client.query(
      `SELECT id FROM wallet_accounts
       WHERE id=ANY($1::uuid[])
       ORDER BY id
       FOR UPDATE`,
      [[userAccount.id, clearing.id]]
    );

    const transactionId = randomUUID();
    await client.query(
      `INSERT INTO wallet_transactions (
         id,kind,initiator_user_id,reference_type,reference_id,metadata
       ) VALUES ($1,'manual_topup',$2,'manual_topup_request',$3,$4::jsonb)`,
      [
        transactionId,
        reviewerUserId,
        topup.id,
        JSON.stringify({ userId: topup.user_id, amountMilli, requestId: topup.id })
      ]
    );
    await client.query(
      `INSERT INTO wallet_postings (id,transaction_id,account_id,amount_milli)
       VALUES ($1,$2,$3,$4),($5,$2,$6,$7)`,
      [
        randomUUID(), transactionId, clearing.id, -amountMilli,
        randomUUID(), userAccount.id, amountMilli
      ]
    );
    await client.query(
      'UPDATE wallet_accounts SET balance_milli=balance_milli-$2,updated_at=now() WHERE id=$1',
      [clearing.id, amountMilli]
    );
    await client.query(
      'UPDATE wallet_accounts SET balance_milli=balance_milli+$2,updated_at=now() WHERE id=$1',
      [userAccount.id, amountMilli]
    );

    const updated = await client.query<TopupRow>(
      `UPDATE manual_topup_requests
       SET status='approved',reviewed_by=$2,reviewed_at=now(),
           ledger_transaction_id=$3,updated_at=now()
       WHERE id=$1
       RETURNING id,user_id,amount_milli,status,payment_reference,note,
                 reviewed_by,reviewed_at,ledger_transaction_id,created_at,updated_at`,
      [topup.id, reviewerUserId, transactionId]
    );
    return { topup: dto(updated.rows[0]!), replayed: false };
  });
}

export async function rejectManualTopupRequest(requestId: string, reviewerUserId: string) {
  return withTransaction(async (client) => {
    const found = await client.query<TopupRow>(
      `SELECT id,user_id,amount_milli,status,payment_reference,note,
              reviewed_by,reviewed_at,ledger_transaction_id,created_at,updated_at
       FROM manual_topup_requests
       WHERE id=$1
       FOR UPDATE`,
      [requestId]
    );
    const topup = found.rows[0];
    if (!topup) throw new Error('TOPUP_REQUEST_NOT_FOUND');
    if (topup.status === 'rejected') return { topup: dto(topup), replayed: true };
    if (topup.status !== 'pending') throw new Error('TOPUP_REQUEST_NOT_PENDING');

    const updated = await client.query<TopupRow>(
      `UPDATE manual_topup_requests
       SET status='rejected',reviewed_by=$2,reviewed_at=now(),updated_at=now()
       WHERE id=$1
       RETURNING id,user_id,amount_milli,status,payment_reference,note,
                 reviewed_by,reviewed_at,ledger_transaction_id,created_at,updated_at`,
      [topup.id, reviewerUserId]
    );
    return { topup: dto(updated.rows[0]!), replayed: false };
  });
}
