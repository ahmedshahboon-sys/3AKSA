import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { io as createSocket, type Socket } from 'socket.io-client';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';
import { roomPresenceSnapshot } from '../src/modules/realtime/presence.js';

const owner = { username: 'rt_owner_ci', phone: '+218912345701', displayName: 'مسؤول مباشر' };
const boy = { username: 'rt_boy_ci', phone: '+218912345702', displayName: 'ولد مباشر' };
const girl = { username: 'rt_girl_ci', phone: '+218912345703', displayName: 'بنت مباشرة' };
const usernames = [owner.username, boy.username, girl.username];

async function cleanup() {
  const users = await query<{ id: string }>(
    'SELECT id FROM users WHERE username_normalized = ANY($1::text[])',
    [usernames]
  );
  const ids = users.rows.map((row) => row.id);
  if (ids.length === 0) return;
  await query('DELETE FROM rooms WHERE owner_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM user_devices WHERE user_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
}

async function register(
  app: Awaited<ReturnType<typeof buildApp>>,
  user: typeof owner,
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

async function waitForCount(roomId: string, expected: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const snapshot = await roomPresenceSnapshot(roomId);
    if (snapshot.onlineCount === expected) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const snapshot = await roomPresenceSnapshot(roomId);
  assert.equal(snapshot.onlineCount, expected);
  return snapshot;
}

test('realtime presence and 24-hour room text messaging work without permanent membership', async () => {
  await cleanup();
  const app = await buildApp();
  const sockets: Socket[] = [];

  try {
    const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
    const ownerSession = await register(app, owner, 'boy');
    const boySession = await register(app, boy, 'boy');
    const girlSession = await register(app, girl, 'girl');

    const boysRoomResponse = await app.inject({
      method: 'POST',
      url: '/3aksa/api/rooms',
      headers: auth(ownerSession.accessToken),
      payload: { name: 'غرفة مباشرة للأولاد', genderPolicy: 'boys', maxUsers: 10 }
    });
    assert.equal(boysRoomResponse.statusCode, 201, boysRoomResponse.body);
    const boysRoomId = boysRoomResponse.json<{ room: { id: string } }>().room.id;

    const capacityRoomResponse = await app.inject({
      method: 'POST',
      url: '/3aksa/api/rooms',
      headers: auth(ownerSession.accessToken),
      payload: { name: 'غرفة السعة المباشرة', genderPolicy: 'everyone', maxUsers: 2 }
    });
    assert.equal(capacityRoomResponse.statusCode, 201, capacityRoomResponse.body);
    const capacityRoomId = capacityRoomResponse.json<{ room: { id: string } }>().room.id;

    const ownerSocket = await connectSocket(baseUrl, ownerSession.accessToken);
    let boySocket = await connectSocket(baseUrl, boySession.accessToken);
    const girlSocket = await connectSocket(baseUrl, girlSession.accessToken);
    sockets.push(ownerSocket, boySocket, girlSocket);

    const girlDenied = await emitAck<{ ok: boolean; error?: string }>(girlSocket, 'room:join', { roomId: boysRoomId });
    assert.equal(girlDenied.ok, false);
    assert.equal(girlDenied.error, 'ROOM_BOYS_ONLY');

    const ownerJoinedBoys = await emitAck<{ ok: boolean; onlineCount: number }>(ownerSocket, 'room:join', { roomId: boysRoomId });
    assert.equal(ownerJoinedBoys.ok, true);
    const boyJoined = await emitAck<{ ok: boolean; onlineCount: number }>(boySocket, 'room:join', { roomId: boysRoomId });
    assert.equal(boyJoined.ok, true);
    assert.equal(boyJoined.onlineCount, 2);

    const clientMessageId = randomUUID();
    const deliveredPromise = onceEvent<{ message: { id: string; text: string; createdAt: string; expiresAt: string } }>(
      ownerSocket,
      'room:message'
    );
    const sent = await emitAck<{
      ok: boolean;
      message: { id: string; text: string; createdAt: string; expiresAt: string };
    }>(boySocket, 'room:message:send', {
      roomId: boysRoomId,
      text: 'رسالة مؤقتة',
      clientMessageId
    });
    assert.equal(sent.ok, true);
    assert.equal(sent.message.text, 'رسالة مؤقتة');
    assert.equal((await deliveredPromise).message.id, sent.message.id);
    assert.equal(new Date(sent.message.expiresAt).getTime() - new Date(sent.message.createdAt).getTime(), 86_400_000);

    const reactionEventPromise = onceEvent<{
      roomId: string;
      messageId: string;
      reaction: 'like';
      count: number;
    }>(ownerSocket, 'room:reaction');
    const reactionAck = await emitAck<{
      ok: boolean;
      like: { count: number; reacted: boolean };
    }>(boySocket, 'room:reaction:like:set', {
      roomId: boysRoomId,
      messageId: sent.message.id,
      active: true
    });
    assert.equal(reactionAck.ok, true);
    assert.deepEqual(reactionAck.like, { count: 1, reacted: true });
    assert.deepEqual(await reactionEventPromise, {
      roomId: boysRoomId,
      messageId: sent.message.id,
      reaction: 'like',
      count: 1
    });

    boySocket.disconnect();
    boySocket = await connectSocket(baseUrl, boySession.accessToken);
    sockets.push(boySocket);
    assert.equal(
      (await emitAck<{ ok: boolean }>(boySocket, 'room:join', { roomId: boysRoomId })).ok,
      true
    );

    const retried = await emitAck<{
      ok: boolean;
      replayed?: boolean;
      message: {
        id: string;
        reactions: { like: { count: number; reacted: boolean } };
      };
    }>(
      boySocket,
      'room:message:send',
      { roomId: boysRoomId, text: 'رسالة مؤقتة', clientMessageId }
    );
    assert.equal(retried.ok, true);
    assert.equal(retried.replayed, true);
    assert.equal(retried.message.id, sent.message.id);
    assert.deepEqual(retried.message.reactions.like, { count: 1, reacted: true });

    for (let index = 0; index < 38; index += 1) {
      const retry = await emitAck<{ ok: boolean }>(boySocket, 'room:message:send', {
        roomId: boysRoomId,
        text: 'رسالة مؤقتة',
        clientMessageId
      });
      assert.equal(retry.ok, true);
    }
    const limited = await emitAck<{ ok: boolean; error?: string; retryAfterSeconds?: number }>(
      boySocket,
      'room:message:send',
      { roomId: boysRoomId, text: 'رسالة مؤقتة', clientMessageId }
    );
    assert.equal(limited.ok, false);
    assert.equal(limited.error, 'RATE_LIMITED');
    assert.ok((limited.retryAfterSeconds ?? 0) > 0);

    const idempotentCount = await query<{ count: string }>(
      'SELECT count(*)::text AS count FROM room_messages WHERE sender_id = $1 AND client_message_id = $2',
      [boySession.user.id, clientMessageId]
    );
    assert.equal(idempotentCount.rows[0]?.count, '1');

    const history = await app.inject({
      method: 'GET',
      url: `/3aksa/api/rooms/${boysRoomId}/messages`,
      headers: auth(ownerSession.accessToken)
    });
    assert.equal(history.statusCode, 200, history.body);
    const historyMessage = history.json<{
      messages: Array<{
        id: string;
        reactions: { like: { count: number; reacted: boolean } };
      }>;
    }>().messages[0];
    assert.equal(historyMessage?.id, sent.message.id);
    assert.deepEqual(historyMessage?.reactions.like, { count: 1, reacted: false });

    await query(
      "UPDATE room_messages SET created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' WHERE id = $1",
      [sent.message.id]
    );
    const expiredHistory = await app.inject({
      method: 'GET',
      url: `/3aksa/api/rooms/${boysRoomId}/messages`,
      headers: auth(ownerSession.accessToken)
    });
    assert.deepEqual(expiredHistory.json<{ messages: unknown[] }>().messages, []);

    const heartbeat = await emitAck<{ ok: boolean; rooms: number }>(boySocket, 'presence:heartbeat');
    assert.equal(heartbeat.ok, true);
    assert.equal(heartbeat.rooms, 1);

    const ownerCapacity = await emitAck<{ ok: boolean; onlineCount: number }>(ownerSocket, 'room:join', { roomId: capacityRoomId });
    assert.equal(ownerCapacity.ok, true);
    const boyCapacity = await emitAck<{ ok: boolean; onlineCount: number }>(boySocket, 'room:join', { roomId: capacityRoomId });
    assert.equal(boyCapacity.ok, true);
    assert.equal(boyCapacity.onlineCount, 2);

    const full = await emitAck<{ ok: boolean; error?: string; onlineCount?: number }>(girlSocket, 'room:join', { roomId: capacityRoomId });
    assert.equal(full.ok, false);
    assert.equal(full.error, 'ROOM_FULL');
    assert.equal(full.onlineCount, 2);

    boySocket.disconnect();
    await waitForCount(capacityRoomId, 1);

    const girlAfterSlot = await emitAck<{ ok: boolean; onlineCount: number }>(girlSocket, 'room:join', { roomId: capacityRoomId });
    assert.equal(girlAfterSlot.ok, true);
    assert.equal(girlAfterSlot.onlineCount, 2);
  } finally {
    for (const socket of sockets) {
      if (socket.connected) socket.disconnect();
    }
    await cleanup();
    await app.close();
  }
});
