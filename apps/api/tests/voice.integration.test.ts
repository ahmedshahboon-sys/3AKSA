import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { io as createSocket, type Socket } from 'socket.io-client';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';
import { deleteStoredVoice } from '../src/storage.js';

const owner = { username: 'voice_owner_ci', phone: '+218912345741', displayName: 'مسؤول الصوت' };
const peer = { username: 'voice_peer_ci', phone: '+218912345742', displayName: 'صديق الصوت' };
const usernames = [owner.username, peer.username];

const WEBM_SAMPLE = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86, 0x81, 0x01,
  0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04
]);

async function cleanup() {
  const storage = await query<{ storage_key: string | null }>(
    `SELECT storage_key FROM room_messages WHERE storage_key IS NOT NULL
     UNION ALL
     SELECT storage_key FROM private_messages WHERE storage_key IS NOT NULL`
  );
  for (const row of storage.rows) await deleteStoredVoice(row.storage_key);

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

async function register(app: Awaited<ReturnType<typeof buildApp>>, user: typeof owner) {
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

test('voice notes are private, expiring, validated and idempotent in rooms and private chat', async () => {
  await cleanup();
  const app = await buildApp();
  const sockets: Socket[] = [];

  try {
    const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
    const ownerSession = await register(app, owner);
    const peerSession = await register(app, peer);

    const roomResponse = await app.inject({
      method: 'POST',
      url: '/3aksa/api/rooms',
      headers: auth(ownerSession.accessToken),
      payload: { name: 'غرفة اختبار الصوت', genderPolicy: 'everyone', maxUsers: 10 }
    });
    assert.equal(roomResponse.statusCode, 201, roomResponse.body);
    const roomId = roomResponse.json<{ room: { id: string } }>().room.id;

    const ownerSocket = await connectSocket(baseUrl, ownerSession.accessToken);
    const peerSocket = await connectSocket(baseUrl, peerSession.accessToken);
    sockets.push(ownerSocket, peerSocket);

    assert.equal((await emitAck<{ ok: boolean }>(ownerSocket, 'room:join', { roomId })).ok, true);
    assert.equal((await emitAck<{ ok: boolean }>(peerSocket, 'room:join', { roomId })).ok, true);

    const roomClientMessageId = randomUUID();
    const sentRoom = await emitAck<{
      ok: boolean;
      message: {
        id: string;
        type: string;
        clientMessageId: string;
        voice: { mime: string; bytes: number; durationMs: number };
        createdAt: string;
        expiresAt: string;
      };
    }>(peerSocket, 'room:voice:send', {
      roomId,
      audio: WEBM_SAMPLE,
      durationMs: 1_200,
      clientMessageId: roomClientMessageId
    });
    assert.equal(sentRoom.ok, true);
    assert.equal(sentRoom.message.type, 'voice');
    assert.equal(sentRoom.message.clientMessageId, roomClientMessageId);
    assert.equal(sentRoom.message.voice.mime, 'audio/webm');
    assert.equal(sentRoom.message.voice.bytes, WEBM_SAMPLE.length);
    assert.equal(sentRoom.message.voice.durationMs, 1_200);
    assert.equal(
      new Date(sentRoom.message.expiresAt).getTime() - new Date(sentRoom.message.createdAt).getTime(),
      86_400_000
    );

    const duplicateRoom = await emitAck<{ ok: boolean; message: { id: string } }>(
      peerSocket,
      'room:voice:send',
      { roomId, audio: WEBM_SAMPLE, durationMs: 1_200, clientMessageId: roomClientMessageId }
    );
    assert.equal(duplicateRoom.ok, true);
    assert.equal(duplicateRoom.message.id, sentRoom.message.id);

    const roomCount = await query<{ count: string }>(
      'SELECT count(*)::text AS count FROM room_messages WHERE sender_id = $1 AND client_message_id = $2',
      [peerSession.user.id, roomClientMessageId]
    );
    assert.equal(roomCount.rows[0]?.count, '1');

    const roomPlayback = await app.inject({
      method: 'GET',
      url: `/3aksa/api/rooms/${roomId}/messages/${sentRoom.message.id}/voice`,
      headers: auth(ownerSession.accessToken)
    });
    assert.equal(roomPlayback.statusCode, 200, roomPlayback.body);
    assert.match(String(roomPlayback.headers['content-type']), /^audio\/webm/);
    assert.deepEqual(roomPlayback.rawPayload, WEBM_SAMPLE);

    const invalid = await emitAck<{ ok: boolean; error?: string }>(peerSocket, 'room:voice:send', {
      roomId,
      audio: Buffer.from('this is not audio'),
      durationMs: 1_000,
      clientMessageId: randomUUID()
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error, 'VOICE_FORMAT_INVALID');

    await query(
      `UPDATE room_messages
       SET created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour'
       WHERE id = $1`,
      [sentRoom.message.id]
    );
    const expiredPlayback = await app.inject({
      method: 'GET',
      url: `/3aksa/api/rooms/${roomId}/messages/${sentRoom.message.id}/voice`,
      headers: auth(ownerSession.accessToken)
    });
    assert.equal(expiredPlayback.statusCode, 404);

    await query(
      `INSERT INTO friendships (user_low_id, user_high_id)
       VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid))
       ON CONFLICT DO NOTHING`,
      [ownerSession.user.id, peerSession.user.id]
    );

    const started = await emitAck<{
      ok: boolean;
      conversation: { id: string; status: string };
    }>(ownerSocket, 'private:message:start', {
      username: peer.username,
      text: 'فتح محادثة الصوت',
      clientMessageId: randomUUID()
    });
    assert.equal(started.ok, true);
    assert.equal(started.conversation.status, 'active');

    assert.equal((await emitAck<{ ok: boolean }>(ownerSocket, 'private:conversation:join', {
      conversationId: started.conversation.id
    })).ok, true);
    assert.equal((await emitAck<{ ok: boolean }>(peerSocket, 'private:conversation:join', {
      conversationId: started.conversation.id
    })).ok, true);

    const privateClientMessageId = randomUUID();
    const sentPrivate = await emitAck<{
      ok: boolean;
      message: {
        id: string;
        type: string;
        clientMessageId: string;
        voice: { mime: string; durationMs: number };
      };
    }>(ownerSocket, 'private:voice:send', {
      conversationId: started.conversation.id,
      audio: WEBM_SAMPLE,
      durationMs: 2_000,
      clientMessageId: privateClientMessageId
    });
    assert.equal(sentPrivate.ok, true);
    assert.equal(sentPrivate.message.type, 'voice');
    assert.equal(sentPrivate.message.clientMessageId, privateClientMessageId);
    assert.equal(sentPrivate.message.voice.mime, 'audio/webm');

    const duplicatePrivate = await emitAck<{ ok: boolean; message: { id: string } }>(
      ownerSocket,
      'private:voice:send',
      {
        conversationId: started.conversation.id,
        audio: WEBM_SAMPLE,
        durationMs: 2_000,
        clientMessageId: privateClientMessageId
      }
    );
    assert.equal(duplicatePrivate.ok, true);
    assert.equal(duplicatePrivate.message.id, sentPrivate.message.id);

    const privatePlayback = await app.inject({
      method: 'GET',
      url: `/3aksa/api/private/conversations/${started.conversation.id}/messages/${sentPrivate.message.id}/voice`,
      headers: auth(peerSession.accessToken)
    });
    assert.equal(privatePlayback.statusCode, 200, privatePlayback.body);
    assert.deepEqual(privatePlayback.rawPayload, WEBM_SAMPLE);
  } finally {
    for (const socket of sockets) {
      if (socket.connected) socket.disconnect();
    }
    await cleanup();
    await app.close();
  }
});
