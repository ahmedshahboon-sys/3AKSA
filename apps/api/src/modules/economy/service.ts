import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db.js';
import { normalizeUsername } from '../auth/security.js';

export const MILLI_PER_LYD = 1000;

export type WalletAccountRow = {
  id: string;
  owner_user_id: string | null;
  balance_milli: string;
};

export type WalletTransactionRow = {
  id: string;
  kind: 'transfer' | 'purchase' | 'gift' | 'manual_topup' | 'refund';
  initiator_user_id: string | null;
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

type WalletHistoryRow = WalletTransactionRow & {
  amount_milli: string;
};

type ActiveUserRow = {
  id: string;
  username: string;
  display_name: string;
};

export type TransferResult = {
  transaction: WalletTransactionRow;
  senderBalanceMilli: number;
  replayed: boolean;
};

export function asSafeInteger(value: string | number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(numeric)) throw new Error('WALLET_AMOUNT_OUT_OF_RANGE');
  return numeric;
}

export function formatLydFromMilli(amountMilli: number) {
  const sign = amountMilli < 0 ? '-' : '';
  const absolute = Math.abs(amountMilli);
  const whole = Math.floor(absolute / MILLI_PER_LYD);
  const fraction = String(absolute % MILLI_PER_LYD).padStart(3, '0');
  return `${sign}${whole}.${fraction}`;
}

export async function ensureUserWallet(client: PoolClient, userId: string) {
  await client.query(
    `INSERT INTO wallet_accounts (
       id, owner_user_id, account_kind, system_code, allow_negative, balance_milli
     ) VALUES ($1, $2, 'user', NULL, false, 0)
     ON CONFLICT (owner_user_id) DO NOTHING`,
    [randomUUID(), userId]
  );

  const result = await client.query<WalletAccountRow>(
    'SELECT id, owner_user_id, balance_milli FROM wallet_accounts WHERE owner_user_id = $1 LIMIT 1',
    [userId]
  );
  const account = result.rows[0];
  if (!account) throw new Error('WALLET_NOT_FOUND');
  return account;
}

export async function activeUserByUsername(client: PoolClient, username: string) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  const result = await client.query<ActiveUserRow>(
    `SELECT id, username, display_name
     FROM users
     WHERE username_normalized = $1 AND status = 'active'
     LIMIT 1`,
    [normalized]
  );
  return result.rows[0] ?? null;
}

async function existingTransfer(initiatorUserId: string, idempotencyKey: string) {
  const result = await query<WalletTransactionRow>(
    `SELECT id, kind, initiator_user_id, idempotency_key, metadata, created_at
     FROM wallet_transactions
     WHERE initiator_user_id = $1 AND idempotency_key = $2
     LIMIT 1`,
    [initiatorUserId, idempotencyKey]
  );
  return result.rows[0] ?? null;
}

function assertTransferReplay(
  transaction: WalletTransactionRow,
  recipientUserId: string,
  amountMilli: number
) {
  const metadata = transaction.metadata ?? {};
  if (
    transaction.kind !== 'transfer' ||
    metadata.recipientUserId !== recipientUserId ||
    metadata.amountMilli !== amountMilli
  ) {
    throw new Error('IDEMPOTENCY_KEY_REUSED');
  }
}

export async function walletSummary(userId: string) {
  return withTransaction(async (client) => {
    const account = await ensureUserWallet(client, userId);
    const balanceMilli = asSafeInteger(account.balance_milli);
    return {
      balanceMilli,
      balanceLyd: formatLydFromMilli(balanceMilli),
      currency: 'LYD' as const
    };
  });
}

export async function walletHistory(userId: string, limit: number, before?: Date) {
  await walletSummary(userId);
  const values: unknown[] = [userId, limit];
  let beforeClause = '';
  if (before) {
    values.push(before);
    beforeClause = `AND t.created_at < $${values.length}`;
  }

  const result = await query<WalletHistoryRow>(
    `SELECT t.id, t.kind, t.initiator_user_id, t.idempotency_key, t.metadata, t.created_at,
            p.amount_milli
     FROM wallet_accounts a
     JOIN wallet_postings p ON p.account_id = a.id
     JOIN wallet_transactions t ON t.id = p.transaction_id
     WHERE a.owner_user_id = $1
       ${beforeClause}
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT $2`,
    values
  );

  return result.rows.map((row) => {
    const amountMilli = asSafeInteger(row.amount_milli);
    return {
      id: row.id,
      kind: row.kind,
      amountMilli,
      amountLyd: formatLydFromMilli(amountMilli),
      currency: 'LYD' as const,
      metadata: row.metadata,
      createdAt: row.created_at
    };
  });
}

export async function transferWalletBalance(
  senderUserId: string,
  recipientUsername: string,
  amountMilli: number,
  idempotencyKey: string
): Promise<TransferResult> {
  if (!Number.isSafeInteger(amountMilli) || amountMilli <= 0) {
    throw new Error('INVALID_TRANSFER_AMOUNT');
  }

  try {
    return await withTransaction(async (client) => {
      const recipient = await activeUserByUsername(client, recipientUsername);
      if (!recipient) throw new Error('RECIPIENT_NOT_FOUND');
      if (recipient.id === senderUserId) throw new Error('CANNOT_TRANSFER_TO_SELF');

      const prior = await client.query<WalletTransactionRow>(
        `SELECT id, kind, initiator_user_id, idempotency_key, metadata, created_at
         FROM wallet_transactions
         WHERE initiator_user_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [senderUserId, idempotencyKey]
      );
      if (prior.rows[0]) {
        assertTransferReplay(prior.rows[0], recipient.id, amountMilli);
        const sender = await ensureUserWallet(client, senderUserId);
        return {
          transaction: prior.rows[0],
          senderBalanceMilli: asSafeInteger(sender.balance_milli),
          replayed: true
        };
      }

      const senderAccount = await ensureUserWallet(client, senderUserId);
      const recipientAccount = await ensureUserWallet(client, recipient.id);

      const locked = await client.query<WalletAccountRow>(
        `SELECT id, owner_user_id, balance_milli
         FROM wallet_accounts
         WHERE id = ANY($1::uuid[])
         ORDER BY id
         FOR UPDATE`,
        [[senderAccount.id, recipientAccount.id]]
      );
      const senderLocked = locked.rows.find((row) => row.id === senderAccount.id);
      if (!senderLocked) throw new Error('WALLET_NOT_FOUND');

      const senderBalance = asSafeInteger(senderLocked.balance_milli);
      if (senderBalance < amountMilli) throw new Error('INSUFFICIENT_BALANCE');

      const transactionId = randomUUID();
      const metadata = {
        senderUserId,
        recipientUserId: recipient.id,
        recipientUsername: recipient.username,
        recipientDisplayName: recipient.display_name,
        amountMilli
      };
      const inserted = await client.query<WalletTransactionRow>(
        `INSERT INTO wallet_transactions (
           id, kind, initiator_user_id, idempotency_key, metadata
         ) VALUES ($1, 'transfer', $2, $3, $4::jsonb)
         RETURNING id, kind, initiator_user_id, idempotency_key, metadata, created_at`,
        [transactionId, senderUserId, idempotencyKey, JSON.stringify(metadata)]
      );

      await client.query(
        `INSERT INTO wallet_postings (id, transaction_id, account_id, amount_milli)
         VALUES
           ($1, $2, $3, $4),
           ($5, $2, $6, $7)`,
        [
          randomUUID(), transactionId, senderAccount.id, -amountMilli,
          randomUUID(), recipientAccount.id, amountMilli
        ]
      );

      await client.query(
        `UPDATE wallet_accounts
         SET balance_milli = balance_milli - $2, updated_at = now()
         WHERE id = $1`,
        [senderAccount.id, amountMilli]
      );
      await client.query(
        `UPDATE wallet_accounts
         SET balance_milli = balance_milli + $2, updated_at = now()
         WHERE id = $1`,
        [recipientAccount.id, amountMilli]
      );

      return {
        transaction: inserted.rows[0]!,
        senderBalanceMilli: senderBalance - amountMilli,
        replayed: false
      };
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      const prior = await existingTransfer(senderUserId, idempotencyKey);
      if (prior) {
        const recipientResult = await query<ActiveUserRow>(
          `SELECT id, username, display_name
           FROM users
           WHERE username_normalized = $1 AND status = 'active'
           LIMIT 1`,
          [normalizeUsername(recipientUsername)]
        );
        const recipient = recipientResult.rows[0];
        if (!recipient) throw new Error('RECIPIENT_NOT_FOUND');
        assertTransferReplay(prior, recipient.id, amountMilli);
        const summary = await walletSummary(senderUserId);
        return {
          transaction: prior,
          senderBalanceMilli: summary.balanceMilli,
          replayed: true
        };
      }
    }
    throw error;
  }
}
