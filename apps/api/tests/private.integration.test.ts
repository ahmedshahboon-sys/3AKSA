import test from 'node:test';
import assert from 'node:assert/strict';
import { io as createSocket, type Socket } from 'socket.io-client';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';

const alice = { username: 'private_alice_ci', phone: '+218912345711', displayName: 'أليس الخاص' };
const bob = { username: 'private_bob_ci', phone: '+218912345712', displayName: 'بوب الخاص' };
const usernames = [alice.username, bob.username];

async function cleanup() {
  const users = await query<{ id: string }>(
    'SELECT id FROM users WHERE username_normalized = ANY($1::text[])',
    [usernames]
  );
  const ids = users.rows.map((row) => row.id);
  if (ids.length === 0) return;
  await query('DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM user_devices WHERE user_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
}

async function register(
  app: Awaited<ReturnType<typeof buildApp>>,
  user: typeof alice,
  gender: 'boy' | 'girl'
) {
  const response = await app.inject({
    method: 'POST',
    url: '/3aksa/api/auth/register',
    payload: {
      username: user.username,
      displayName: user.displayName,
      phone: user.phone,
      gender,
      password: 'StrongPass123!',
      deviceId: `ci-${user.username}`,
      platform: 'ci'
    }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json<{ accessToken: string; user: { id: string } }>();
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function connectSocket(baseUrl: string, accessToken: string) {
  const socket = createSocket(baseUrl, {
    path: '/3aksa/socket.io',
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    auth: { accessToken }
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('socket connect timeout')), 5_000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  return socket;
}

function emitAck<T>(socket: Socket, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} ack timeout`)), 5_000);
    const callback = (response: T) => {
      clearTimeout(timeout);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, callback);
    else socket.emit(event, payload, callback);
  });
}

function onceEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} event timeout`)), 5_000);
    socket.once(event, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

test('private messaging: request -> accept -> realtime -> 24h expiry -> block', async () => {
  await cleanup();
  const app = await buildApp();
  const sockets: Socket[] = [];

  try {
    const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
    const aliceSession = await register(app, alice, 'girl');
    const bobSession = await register(app, bob, 'boy');

    const aliceSocket = await connectSocket(baseUrl, aliceSession.accessToken);
    const bobSocket = await connectSocket(baseUrl, bobSession.accessToken);
    sockets.push(aliceSocket, bobSocket);

    const requestEvent = onceEvent<{
      conversationId: string;
      message: { id: string; text: string; createdAt: string; expiresAt: string };
    }>(bobSocket, 'private:request');

    const started = await emitAck<{
      ok: boolean;
      conversation: { id: string; status: string };
      message: { id: string; text: string; createdAt: string; expiresAt: string };
    }>(aliceSocket, 'private:message:start', {
      username: bob.username,
      text: 'السلام عليكم من طلب المراسلة'
    });

    assert.equal(started.ok, true);
    assert.equal(started.conversation.status, 'pending');
    assert.equal(started.message.text, 'السلام عليكم من طلب المراسلة');
    assert.equal(
      new Date(started.message.expiresAt).getTime() - new Date(started.message.createdAt).getTime(),
      86_400_000
    );

    const receivedRequest = await requestEvent;
    assert.equal(receivedRequest.conversationId, started.conversation.id);
    assert.equal(receivedRequest.message.id, started.message.id);

    const requests = await app.inject({
      method: 'GET',
      url: '/3aksa/api/private/requests',
      headers: auth(bobSession.accessToken)
    });
    assert.equal(requests.statusCode, 200, requests.body);
    assert.equal(requests.json<{ requests: Array<{ id: string }> }>().requests[0]?.id, started.conversation.id);

    const accepted = await app.inject({
      method: 'POST',
      url: `/3aksa/api/private/requests/${started.conversation.id}/accept`,
      headers: auth(bobSession.accessToken)
    });
    assert.equal(accepted.statusCode, 200, accepted.body);

    const aliceJoined = await emitAck<{ ok: boolean }>(aliceSocket, 'private:conversation:join', {
      conversationId: started.conversation.id
    });
    const bobJoined = await emitAck<{ ok: boolean }>(bobSocket, 'private:conversation:join', {
      conversationId: started.conversation.id
    });
    assert.equal(aliceJoined.ok, true);
    assert.equal(bobJoined.ok, true);

    const delivered = onceEvent<{
      conversationId: string;
      message: { id: string; text: string; createdAt: string; expiresAt: string };
    }>(bobSocket, 'private:message');

    const sent = await emitAck<{
      ok: boolean;
      message: { id: string; text: string; createdAt: string; expiresAt: string };
    }>(aliceSocket, 'private:message:send', {
      conversationId: started.conversation.id,
      text: 'رسالة بعد قبول الطلب'
    });
    assert.equal(sent.ok, true);
    assert.equal(sent.message.text, 'رسالة بعد قبول الطلب');
    assert.equal(
      new Date(sent.message.expiresAt).getTime() - new Date(sent.message.createdAt).getTime(),
      86_400_000
    );
    assert.equal((await delivered).message.id, sent.message.id);

    const history = await app.inject({
      method: 'GET',
      url: `/3aksa/api/private/conversations/${started.conversation.id}/messages`,
      headers: auth(bobSession.accessToken)
    });
    assert.equal(history.statusCode, 200, history.body);
    const liveIds = history.json<{ messages: Array<{ id: string }> }>().messages.map((message) => message.id);
    assert.ok(liveIds.includes(started.message.id));
    assert.ok(liveIds.includes(sent.message.id));

    await query(
      `UPDATE private_messages
       SET created_at = created_at - interval '25 hours',
           expires_at = expires_at - interval '25 hours'
       WHERE id = $1`,
      [sent.message.id]
    );

    const afterExpiry = await app.inject({
      method: 'GET',
      url: `/3aksa/api/private/conversations/${started.conversation.id}/messages`,
      headers: auth(bobSession.accessToken)
    });
    assert.equal(afterExpiry.statusCode, 200, afterExpiry.body);
    const afterExpiryIds = afterExpiry.json<{ messages: Array<{ id: string }> }>().messages.map((message) => message.id);
    assert.ok(!afterExpiryIds.includes(sent.message.id));
    assert.ok(afterExpiryIds.includes(started.message.id));

    const blocked = await app.inject({
      method: 'POST',
      url: '/3aksa/api/blocks',
      headers: auth(bobSession.accessToken),
      payload: { username: alice.username }
    });
    assert.equal(blocked.statusCode, 201, blocked.body);

    const blockedSend = await emitAck<{ ok: boolean; error?: string }>(aliceSocket, 'private:message:send', {
      conversationId: started.conversation.id,
      text: 'هذه يجب أن تُمنع'
    });
    assert.equal(blockedSend.ok, false);
    assert.equal(blockedSend.error, 'RELATIONSHIP_BLOCKED');

    const hiddenHistory = await app.inject({
      method: 'GET',
      url: `/3aksa/api/private/conversations/${started.conversation.id}/messages`,
      headers: auth(aliceSession.accessToken)
    });
    assert.equal(hiddenHistory.statusCode, 404, hiddenHistory.body);

    const hiddenConversations = await app.inject({
      method: 'GET',
      url: '/3aksa/api/private/conversations',
      headers: auth(bobSession.accessToken)
    });
    assert.equal(hiddenConversations.statusCode, 200, hiddenConversations.body);
    assert.deepEqual(hiddenConversations.json<{ conversations: unknown[] }>().conversations, []);
  } finally {
    for (const socket of sockets) {
      if (socket.connected) socket.disconnect();
    }
    await cleanup();
    await app.close();
  }
});
