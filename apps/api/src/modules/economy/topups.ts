import { randomUUID } from 'node:crypto';
import { query } from '../../db.js';
import { formatLydFromMilli } from './service.js';

type TopupRow = {
  id: string;
  user_id: string;
  amount_milli: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  payment_reference: string | null;
  note: string | null;
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
     RETURNING id,user_id,amount_milli,status,payment_reference,note,created_at,updated_at`,
    [randomUUID(),userId,amountMilli,paymentReference ?? null,note ?? null]
  );
  return dto(result.rows[0]!);
}

export async function listManualTopupRequests(userId: string, limit=30) {
  const result=await query<TopupRow>(
    `SELECT id,user_id,amount_milli,status,payment_reference,note,created_at,updated_at
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
     RETURNING id,user_id,amount_milli,status,payment_reference,note,created_at,updated_at`,
    [requestId,userId]
  );
  return result.rows[0] ? dto(result.rows[0]) : null;
}
