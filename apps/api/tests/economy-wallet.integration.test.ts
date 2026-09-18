import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { query, withTransaction } from '../src/db.js';

const sender = { username: 'wallet_sender_ci', phone: '+218912345761', displayName: 'مرسل الرصيد' };
const recipient = { username: 'wallet_recipient_ci', phone: '+218912345762', displayName: 'مستلم الرصيد' };
const usernames = [sender.username, recipient.username];

async function cleanup() {
  const users = await query<{ id: string }>(
    'SELECT id FROM users WHERE username_normalized = ANY($1::text[])',
    [usernames]
  );
  const userIds = users.rows.map((row) => row.id);
  if (userIds.length === 0) return;

  const accounts = await query<{ id: string }>(
    'SELECT id FROM wallet_accounts WHERE owner_user_id = ANY($1::uuid[])',
    [userIds]
  );
  const accountIds = accounts.rows.map((row) => row.id);
  if (accountIds.length > 0) {
    const txs = await query<{ transaction_id: string }>(
      'SELECT DISTINCT transaction_id FROM wallet_postings WHERE account_id = ANY($1::uuid[])',
      [accountIds]
    );
    const txIds = txs.rows.map((row) => row.transaction_id);
    if (txIds.length > 0) {
      await query('DELETE FROM wallet_postings WHERE transaction_id = ANY($1::uuid[])', [txIds]);
      await query('DELETE FROM wallet_transactions WHERE id = ANY($1::uuid[])', [txIds]);
    }
    await query('DELETE FROM wallet_accounts WHERE id = ANY($1::uuid[])', [accountIds]);
  }

  await query(
    `UPDATE wallet_accounts a
     SET balance_milli = COALESCE((
       SELECT sum(p.amount_milli) FROM wallet_postings p WHERE p.account_id = a.id
     ), 0),
         updated_at = now()
     WHERE a.owner_user_id IS NULL`
  );

  await query('DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])', [userIds]);
  await query('DELETE FROM user_devices WHERE user_id = ANY($1::uuid[])', [userIds]);
  await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
}

async function register(app: Awaited<ReturnType<typeof buildApp>>, user: typeof sender) {
  const response = await app.inject({
    method: 'POST',
    url: '/3aksa/api/auth/register',
    payload: {
      username: user.username,
      displayName: user.displayName,
      phone: user.phone,
      gender: 'boy',
      password: 'StrongPass123!',
      deviceId: `ci-${user.username}`,
      platform: 'ci'
    }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json<{ accessToken: string; user: { id: string; username: string } }>();
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function seedBalance(userId: string, amountMilli: number) {
  await withTransaction(async (client) => {
    const userAccount = await client.query<{ id: string }>(
      'SELECT id FROM wallet_accounts WHERE owner_user_id = $1 LIMIT 1',
      [userId]
    );
    const clearing = await client.query<{ id: string }>(
      "SELECT id FROM wallet_accounts WHERE system_code = 'topup_clearing' LIMIT 1"
    );
    assert.ok(userAccount.rows[0]?.id);
    assert.ok(clearing.rows[0]?.id);

    const transactionId = randomUUID();
    await client.query(
      `INSERT INTO wallet_transactions (id, kind, initiator_user_id, metadata)
       VALUES ($1, 'manual_topup', NULL, $2::jsonb)`,
      [transactionId, JSON.stringify({ testSeed: true, amountMilli })]
    );
    await client.query(
      `INSERT INTO wallet_postings (id, transaction_id, account_id, amount_milli)
       VALUES ($1, $2, $3, $4), ($5, $2, $6, $7)`,
      [
        randomUUID(), transactionId, clearing.rows[0]!.id, -amountMilli,
        randomUUID(), userAccount.rows[0]!.id, amountMilli
      ]
    );
    await client.query(
      'UPDATE wallet_accounts SET balance_milli = balance_milli - $2, updated_at = now() WHERE id = $1',
      [clearing.rows[0]!.id, amountMilli]
    );
    await client.query(
      'UPDATE wallet_accounts SET balance_milli = balance_milli + $2, updated_at = now() WHERE id = $1',
      [userAccount.rows[0]!.id, amountMilli]
    );
  });
}

test('wallet transfer is balanced, non-negative and idempotent', async () => {
  await cleanup();
  const app = await buildApp();
  try {
    const senderSession = await register(app, sender);
    const recipientSession = await register(app, recipient);

    const senderWallet = await app.inject({
      method: 'GET',
      url: '/3aksa/api/wallet',
      headers: auth(senderSession.accessToken)
    });
    assert.equal(senderWallet.statusCode, 200, senderWallet.body);
    assert.equal(senderWallet.json<{ balanceMilli: number }>().balanceMilli, 0);

    const recipientWallet = await app.inject({
      method: 'GET',
      url: '/3aksa/api/wallet',
      headers: auth(recipientSession.accessToken)
    });
    assert.equal(recipientWallet.statusCode, 200, recipientWallet.body);

    await seedBalance(senderSession.user.id, 5_000);

    const key = randomUUID();
    const transfer = await app.inject({
      method: 'POST',
      url: '/3aksa/api/wallet/transfers',
      headers: { ...auth(senderSession.accessToken), 'idempotency-key': key },
      payload: { username: recipient.username, amountMilli: 1_500 }
    });
    assert.equal(transfer.statusCode, 201, transfer.body);
    const first = transfer.json<{
      transaction: { id: string };
      balanceMilli: number;
      balanceLyd: string;
      replayed: boolean;
    }>();
    assert.equal(first.balanceMilli, 3_500);
    assert.equal(first.balanceLyd, '3.500');
    assert.equal(first.replayed, false);

    const replay = await app.inject({
      method: 'POST',
      url: '/3aksa/api/wallet/transfers',
      headers: { ...auth(senderSession.accessToken), 'idempotency-key': key },
      payload: { username: recipient.username, amountMilli: 1_500 }
    });
    assert.equal(replay.statusCode, 200, replay.body);
    const replayBody = replay.json<{ transaction: { id: string }; balanceMilli: number; replayed: boolean }>();
    assert.equal(replayBody.transaction.id, first.transaction.id);
    assert.equal(replayBody.balanceMilli, 3_500);
    assert.equal(replayBody.replayed, true);

    const keyReuse = await app.inject({
      method: 'POST',
      url: '/3aksa/api/wallet/transfers',
      headers: { ...auth(senderSession.accessToken), 'idempotency-key': key },
      payload: { username: recipient.username, amountMilli: 1_000 }
    });
    assert.equal(keyReuse.statusCode, 409, keyReuse.body);
    assert.equal(keyReuse.json<{ error: string }>().error, 'IDEMPOTENCY_KEY_REUSED');

    const insufficient = await app.inject({
      method: 'POST',
      url: '/3aksa/api/wallet/transfers',
      headers: { ...auth(senderSession.accessToken), 'idempotency-key': randomUUID() },
      payload: { username: recipient.username, amountMilli: 99_000 }
    });
    assert.equal(insufficient.statusCode, 409, insufficient.body);
    assert.equal(insufficient.json<{ error: string }>().error, 'INSUFFICIENT_BALANCE');

    const selfTransfer = await app.inject({
      method: 'POST',
      url: '/3aksa/api/wallet/transfers',
      headers: { ...auth(senderSession.accessToken), 'idempotency-key': randomUUID() },
      payload: { username: sender.username, amountMilli: 100 }
    });
    assert.equal(selfTransfer.statusCode, 409, selfTransfer.body);
    assert.equal(selfTransfer.json<{ error: string }>().error, 'CANNOT_TRANSFER_TO_SELF');

    const senderAfter = await app.inject({
      method: 'GET',
      url: '/3aksa/api/wallet',
      headers: auth(senderSession.accessToken)
    });
    assert.equal(senderAfter.json<{ balanceMilli: number }>().balanceMilli, 3_500);

    const recipientAfter = await app.inject({
      method: 'GET',
      url: '/3aksa/api/wallet',
      headers: auth(recipientSession.accessToken)
    });
    assert.equal(recipientAfter.json<{ balanceMilli: number }>().balanceMilli, 1_500);

    const senderHistory = await app.inject({
      method: 'GET',
      url: '/3aksa/api/wallet/history',
      headers: auth(senderSession.accessToken)
    });
    assert.equal(senderHistory.statusCode, 200, senderHistory.body);
    const history = senderHistory.json<{ history: Array<{ kind: string; amountMilli: number }> }>().history;
    assert.ok(history.some((item) => item.kind === 'transfer' && item.amountMilli === -1_500));
    assert.ok(history.some((item) => item.kind === 'manual_topup' && item.amountMilli === 5_000));

    const recipientHistory = await app.inject({
      method: 'GET',
      url: '/3aksa/api/wallet/history',
      headers: auth(recipientSession.accessToken)
    });
    assert.ok(
      recipientHistory.json<{ history: Array<{ kind: string; amountMilli: number }> }>().history
        .some((item) => item.kind === 'transfer' && item.amountMilli === 1_500)
    );

    const duplicateCount = await query<{ count: string }>(
      'SELECT count(*)::text AS count FROM wallet_transactions WHERE initiator_user_id = $1 AND idempotency_key = $2',
      [senderSession.user.id, key]
    );
    assert.equal(duplicateCount.rows[0]?.count, '1');

    await assert.rejects(
      () => withTransaction(async (client) => {
        const clearing = await client.query<{ id: string }>(
          "SELECT id FROM wallet_accounts WHERE system_code = 'topup_clearing' LIMIT 1"
        );
        assert.ok(clearing.rows[0]?.id);
        const txId = randomUUID();
        await client.query(
          "INSERT INTO wallet_transactions (id, kind, metadata) VALUES ($1, 'refund', '{}'::jsonb)",
          [txId]
        );
        await client.query(
          'INSERT INTO wallet_postings (id, transaction_id, account_id, amount_milli) VALUES ($1, $2, $3, $4)',
          [randomUUID(), txId, clearing.rows[0]!.id, 1]
        );
      }),
      (error: unknown) => (error as { code?: string }).code === '23514'
    );

    const unbalanced = await query<{ transaction_id: string }>(
      `SELECT transaction_id
       FROM wallet_postings
       GROUP BY transaction_id
       HAVING sum(amount_milli) <> 0`
    );
    assert.equal(unbalanced.rows.length, 0);

    const negativeUsers = await query<{ id: string }>(
      "SELECT id FROM wallet_accounts WHERE account_kind = 'user' AND balance_milli < 0"
    );
    assert.equal(negativeUsers.rows.length, 0);
  } finally {
    await cleanup();
    await app.close();
  }
});
