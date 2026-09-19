import type { FastifyInstance } from 'fastify';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { env } from '../../config.js';
import { query } from '../../db.js';
import { closeRedis } from '../../redis.js';
import { consumeRateLimit } from '../../rate-limit.js';
import { normalizeVoiceBinary } from '../../storage.js';
import { authenticateToken, touchSessionToken, type AuthenticatedUser } from '../auth/session.js';
import { sessionCookieTokenFromHeader } from '../auth/cookie.js';
import { normalizeUsername } from '../auth/security.js';
import { prayerEvents } from '../prayer/events.js';
import { notificationEvents } from '../notifications/events.js';
import { createNotification } from '../notifications/service.js';
import { tvEvents } from '../tv/events.js';
import { setRoomTvState } from '../tv/service.js';
import { webOriginAllowed } from '../../security-http.js';
import {
  createRoomTextMessage,
  createRoomVoiceMessage,
  roomMessageDto,
  softDeleteRoomMessage
} from '../messages/service.js';
import {
  deletePrivateLike,
  deleteRoomLike,
  putPrivateLike,
  putRoomLike
} from '../reactions/service.js';
import {
  areBlocked,
  privateMessageDto,
  sendActivePrivateText,
  sendActivePrivateVoice,
  startPrivateText,
  type PrivateConversationRow
} from '../private/service.js';
import {
  refreshRoomPresence,
  removeRoomPresence,
  roomPresenceSnapshot,
  tryJoinRoomPresence
} from './presence.js';

type RoomPolicyRow = {
  id: string;
  owner_id: string;
  visibility: 'public' | 'private';
  gender_policy: 'everyone' | 'boys' | 'girls';
  max_users: number;
  status: 'pending' | 'active' | 'hidden' | 'closed';
  is_moderator: boolean;
  is_invited: boolean;
  is_banned: boolean;
};

type SocketUserData = {
  user: AuthenticatedUser;
  accessToken: string;
};

type Ack = (payload: Record<string, unknown>) => void;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function roomChannel(roomId: string) {
  return `room:${roomId}`;
}

function privateChannel(conversationId: string) {
  return `private:${conversationId}`;
}

function userChannel(userId: string) {
  return `user:${userId}`;
}

function safeAck(callback: unknown, payload: Record<string, unknown>) {
  if (typeof callback === 'function') (callback as Ack)(payload);
}

async function getRoomPolicy(roomId: string, userId: string) {
  if (!UUID_RE.test(roomId)) return null;
  const result = await query<RoomPolicyRow>(
    `SELECT r.id, r.owner_id, r.visibility, r.gender_policy, r.max_users, r.status,
            EXISTS (SELECT 1 FROM room_moderators rm WHERE rm.room_id = r.id AND rm.user_id = $2) AS is_moderator,
            EXISTS (
              SELECT 1 FROM room_invites ri
              WHERE ri.room_id = r.id AND ri.user_id = $2
                AND (ri.expires_at IS NULL OR ri.expires_at > now())
            ) AS is_invited,
            EXISTS (SELECT 1 FROM room_bans rb WHERE rb.room_id = r.id AND rb.user_id = $2 AND (rb.expires_at IS NULL OR rb.expires_at > now())) AS is_banned
     FROM rooms r
     WHERE r.id = $1
     LIMIT 1`,
    [roomId, userId]
  );
  return result.rows[0] ?? null;
}

function roomPolicyError(room: RoomPolicyRow, user: AuthenticatedUser): string | null {
  if (room.status !== 'active') return 'ROOM_NOT_FOUND';
  if (room.is_banned) return 'ROOM_BANNED';
  if (room.gender_policy === 'boys' && user.gender !== 'boy') return 'ROOM_BOYS_ONLY';
  if (room.gender_policy === 'girls' && user.gender !== 'girl') return 'ROOM_GIRLS_ONLY';
  if (room.visibility === 'private' && user.id !== room.owner_id && !room.is_moderator && !room.is_invited) {
    return 'ROOM_PRIVATE';
  }
  return null;
}

async function blockedPeerIds(userId: string) {
  const result = await query<{ peer_id: string }>(
    `SELECT CASE WHEN blocker_id = $1 THEN blocked_id ELSE blocker_id END AS peer_id
     FROM user_blocks
     WHERE blocker_id = $1 OR blocked_id = $1`,
    [userId]
  );
  return new Set(result.rows.map((row) => row.peer_id));
}

async function privateConversationForUser(conversationId: string, userId: string) {
  if (!UUID_RE.test(conversationId)) return null;
  const result = await query<PrivateConversationRow>(
    `SELECT * FROM private_conversations
     WHERE id = $1
       AND status = 'active'
       AND (user_low_id = $2 OR user_high_id = $2)
     LIMIT 1`,
    [conversationId, userId]
  );
  return result.rows[0] ?? null;
}

async function lookupMessageTarget(username: string) {
  const result = await query<{ id: string; username: string; display_name: string; gender: 'boy' | 'girl' }>(
    `SELECT id, username, display_name, gender
     FROM users
     WHERE username_normalized = $1 AND status = 'active'
     LIMIT 1`,
    [normalizeUsername(username)]
  );
  return result.rows[0] ?? null;
}

export function attachRealtime(app: FastifyInstance) {
  const io = new SocketIOServer(app.server, {
    path: env.SOCKET_PATH,
    serveClient: false,
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 4 * 1024 * 1024
  });

  const unsubscribeTv = tvEvents.onRoomState(({ roomId, state }) => {
    io.to(roomChannel(roomId)).emit('room:tv-state', {
      roomId,
      tv: state
    });
  });

  const unsubscribePrayer = prayerEvents.onDue((event) => {
    io.to(userChannel(event.userId)).emit('prayer:time', {
      prayer: event.prayer,
      referenceKey: event.referenceKey,
      referenceName: event.referenceName,
      scheduledAt: event.scheduledAt,
      message: event.message,
      soundEnabled: event.soundEnabled,
      displayDurationMs: 3000
    });
  });

  const unsubscribeNotifications = notificationEvents.onNew((event) => {
    io.to(userChannel(event.userId)).emit('notification:new', {
      notification: event.notification
    });
  });

  async function emitMessageRespectingBlocks(roomId: string, senderId: string, message: unknown) {
    const blocked = await blockedPeerIds(senderId);
    const sockets = await io.in(roomChannel(roomId)).fetchSockets();
    for (const memberSocket of sockets) {
      const member = memberSocket.data as SocketUserData;
      if (!blocked.has(member.user.id)) memberSocket.emit('room:message', { message });
    }
  }

  io.use(async (socket, next) => {
    try {
      const bearer = typeof socket.handshake.auth?.accessToken === 'string'
        ? socket.handshake.auth.accessToken.trim()
        : '';
      const cookieToken=sessionCookieTokenFromHeader(socket.request.headers.cookie) || '';
      if(!bearer&&cookieToken&&!webOriginAllowed(socket.handshake.headers.origin)){
        return next(new Error('UNAUTHORIZED_ORIGIN'));
      }
      const accessToken = bearer || cookieToken;
      if (!accessToken) return next(new Error('UNAUTHORIZED'));
      const user = await authenticateToken(accessToken);
      if (!user) return next(new Error('UNAUTHORIZED'));
      (socket.data as SocketUserData).user = user;
      (socket.data as SocketUserData).accessToken = accessToken;
      void touchSessionToken(accessToken).catch(() => undefined);
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketUserData;
    const user = data.user;
    const joinedRooms = new Set<string>();
    const joinedPrivateConversations = new Set<string>();
    void socket.join(userChannel(user.id));

    async function allowRealtime(bucket: string, limit: number, windowSeconds: number, callback?: Ack) {
      const rate = await consumeRateLimit(bucket, user.id, limit, windowSeconds);
      if (rate.allowed) return true;
      safeAck(callback, {
        ok: false,
        error: 'RATE_LIMITED',
        retryAfterSeconds: rate.retryAfterSeconds
      });
      return false;
    }

    async function leaveRoom(roomId: string) {
      if (!joinedRooms.has(roomId)) return;
      joinedRooms.delete(roomId);
      await removeRoomPresence(roomId, user.id, socket.id);
      await socket.leave(roomChannel(roomId));
      const snapshot = await roomPresenceSnapshot(roomId);
      io.to(roomChannel(roomId)).emit('room:presence', {
        roomId,
        onlineCount: snapshot.onlineCount
      });
      if (!snapshot.userIds.includes(user.id)) {
        io.to(roomChannel(roomId)).emit('room:member-left', {
          roomId,
          user: { id: user.id, username: user.username, displayName: user.display_name, gender: user.gender }
        });
      }
    }

    socket.on('room:join', async (payload: { roomId?: string } | undefined, callback?: Ack) => {
      try {
        const roomId = payload?.roomId?.trim() ?? '';
        const room = await getRoomPolicy(roomId, user.id);
        if (!room) return safeAck(callback, { ok: false, error: 'ROOM_NOT_FOUND' });
        const policyError = roomPolicyError(room, user);
        if (policyError) return safeAck(callback, { ok: false, error: policyError });

        const before = await roomPresenceSnapshot(room.id);
        const joined = await tryJoinRoomPresence(room.id, user.id, socket.id, room.max_users);
        if (!joined.allowed) return safeAck(callback, { ok: false, error: 'ROOM_FULL', onlineCount: joined.onlineCount });

        joinedRooms.add(room.id);
        await socket.join(roomChannel(room.id));
        io.to(roomChannel(room.id)).emit('room:presence', {
          roomId: room.id,
          onlineCount: joined.onlineCount
        });
        if (!before.userIds.includes(user.id)) {
          const cosmetics=await query<{entry_sound_code:string|null}>(
            'SELECT entry_sound_code FROM user_public_cosmetics WHERE user_id=$1 LIMIT 1',
            [user.id]
          );
          io.to(roomChannel(room.id)).emit('room:member-joined', {
            roomId: room.id,
            user: {
              id:user.id,username:user.username,displayName:user.display_name,gender:user.gender,
              entrySoundCode:cosmetics.rows[0]?.entry_sound_code??null
            }
          });
        }
        safeAck(callback, { ok: true, roomId: room.id, onlineCount: joined.onlineCount });
      } catch (error) {
        socket.data.lastRealtimeError = error instanceof Error ? error.message : 'unknown';
        safeAck(callback, { ok: false, error: 'REALTIME_ERROR' });
      }
    });

    socket.on(
      'room:message:send',
      async (payload: { roomId?: string; text?: string; clientMessageId?: string } | undefined, callback?: Ack) => {
        try {
          const roomId = payload?.roomId?.trim() ?? '';
          const text = payload?.text?.trim() ?? '';
          const clientMessageId = payload?.clientMessageId?.trim();
          if (clientMessageId && !UUID_RE.test(clientMessageId)) {
            return safeAck(callback, { ok: false, error: 'INVALID_CLIENT_MESSAGE_ID' });
          }
          if (!joinedRooms.has(roomId)) return safeAck(callback, { ok: false, error: 'ROOM_NOT_JOINED' });
          if (text.length < 1 || text.length > 2000) {
            return safeAck(callback, { ok: false, error: 'INVALID_MESSAGE_TEXT' });
          }
          if (!(await allowRealtime('room-text', 40, 10, callback))) return;

          const room = await getRoomPolicy(roomId, user.id);
          if (!room) return safeAck(callback, { ok: false, error: 'ROOM_NOT_FOUND' });
          const policyError = roomPolicyError(room, user);
          if (policyError) return safeAck(callback, { ok: false, error: policyError });

          const presence = await tryJoinRoomPresence(room.id, user.id, socket.id, room.max_users);
          if (!presence.allowed) return safeAck(callback, { ok: false, error: 'ROOM_FULL' });

          const message = await createRoomTextMessage(room.id, user.id, text, clientMessageId);
          const dto = roomMessageDto(message);
          if (!message._idempotentReplay) {
            await emitMessageRespectingBlocks(room.id, user.id, dto);
          }
          safeAck(callback, { ok: true, message: dto, replayed: Boolean(message._idempotentReplay) });
        } catch (error) {
          const code = error instanceof Error ? error.message : '';
          if (code === 'CLIENT_MESSAGE_ID_REUSED') {
            return safeAck(callback, { ok: false, error: code });
          }
          socket.data.lastRealtimeError = code || 'unknown';
          safeAck(callback, { ok: false, error: 'MESSAGE_SEND_FAILED' });
        }
      }
    );

    socket.on(
      'room:voice:send',
      async (
        payload: { roomId?: string; audio?: unknown; durationMs?: number; clientMessageId?: string } | undefined,
        callback?: Ack
      ) => {
        try {
          const roomId = payload?.roomId?.trim() ?? '';
          const clientMessageId = payload?.clientMessageId?.trim();
          if (clientMessageId && !UUID_RE.test(clientMessageId)) {
            return safeAck(callback, { ok: false, error: 'INVALID_CLIENT_MESSAGE_ID' });
          }
          if (!joinedRooms.has(roomId)) return safeAck(callback, { ok: false, error: 'ROOM_NOT_JOINED' });
          if (!(await allowRealtime('room-voice', 8, 60, callback))) return;

          const audio = normalizeVoiceBinary(payload?.audio);
          if (!audio) return safeAck(callback, { ok: false, error: 'VOICE_FORMAT_INVALID' });
          const durationMs = Number(payload?.durationMs);

          const room = await getRoomPolicy(roomId, user.id);
          if (!room) return safeAck(callback, { ok: false, error: 'ROOM_NOT_FOUND' });
          const policyError = roomPolicyError(room, user);
          if (policyError) return safeAck(callback, { ok: false, error: policyError });

          const presence = await tryJoinRoomPresence(room.id, user.id, socket.id, room.max_users);
          if (!presence.allowed) return safeAck(callback, { ok: false, error: 'ROOM_FULL' });

          const message = await createRoomVoiceMessage(
            room.id,
            user.id,
            audio,
            durationMs,
            clientMessageId
          );
          const dto = roomMessageDto(message);
          if (!message._idempotentReplay) {
            await emitMessageRespectingBlocks(room.id, user.id, dto);
          }
          safeAck(callback, { ok: true, message: dto, replayed: Boolean(message._idempotentReplay) });
        } catch (error) {
          const code = error instanceof Error ? error.message : '';
          if (
            code === 'CLIENT_MESSAGE_ID_REUSED' ||
            code === 'VOICE_SIZE_INVALID' ||
            code === 'VOICE_DURATION_INVALID' ||
            code === 'VOICE_FORMAT_INVALID' ||
            code === 'STORAGE_DRIVER_UNSUPPORTED'
          ) {
            return safeAck(callback, { ok: false, error: code });
          }
          socket.data.lastRealtimeError = code || 'unknown';
          safeAck(callback, { ok: false, error: 'VOICE_SEND_FAILED' });
        }
      }
    );

    socket.on(
      'room:reaction:like:set',
      async (
        payload: { roomId?: string; messageId?: string; active?: boolean } | undefined,
        callback?: Ack
      ) => {
        try {
          const roomId = payload?.roomId?.trim() ?? '';
          const messageId = payload?.messageId?.trim() ?? '';
          if (!UUID_RE.test(roomId) || !UUID_RE.test(messageId)) {
            return safeAck(callback, { ok: false, error: 'MESSAGE_NOT_FOUND' });
          }
          if (!joinedRooms.has(roomId)) {
            return safeAck(callback, { ok: false, error: 'ROOM_NOT_JOINED' });
          }
          if (!(await allowRealtime('room-like', 60, 60, callback))) return;

          const summary = payload?.active === false
            ? await deleteRoomLike(user, roomId, messageId)
            : await putRoomLike(user, roomId, messageId);

          io.to(roomChannel(roomId)).emit('room:reaction', {
            roomId,
            messageId,
            reaction: 'like',
            count: summary.count
          });
          safeAck(callback, { ok: true, like: summary });
        } catch (error) {
          const code = error instanceof Error ? error.message : '';
          if (code === 'MESSAGE_NOT_FOUND') {
            return safeAck(callback, { ok: false, error: code });
          }
          socket.data.lastRealtimeError = code || 'unknown';
          safeAck(callback, { ok: false, error: 'REACTION_UPDATE_FAILED' });
        }
      }
    );

    socket.on(
      'room:tv:set',
      async (
        payload: { roomId?: string; enabled?: boolean; channelId?: string | null } | undefined,
        callback?: Ack
      ) => {
        try {
          const roomId = payload?.roomId?.trim() ?? '';
          const channelId = payload?.channelId === null
            ? null
            : payload?.channelId?.trim();

          if (!UUID_RE.test(roomId)) {
            return safeAck(callback, { ok: false, error: 'ROOM_NOT_FOUND' });
          }
          if (!joinedRooms.has(roomId)) {
            return safeAck(callback, { ok: false, error: 'ROOM_NOT_JOINED' });
          }
          if (payload?.enabled !== undefined && typeof payload.enabled !== 'boolean') {
            return safeAck(callback, { ok: false, error: 'INVALID_TV_SETTING' });
          }
          if (channelId !== undefined && channelId !== null && !UUID_RE.test(channelId)) {
            return safeAck(callback, { ok: false, error: 'INVALID_TV_CHANNEL_ID' });
          }
          if (!(await allowRealtime('room-tv-control', 60, 60, callback))) return;

          const tv = await setRoomTvState(user, roomId, {
            enabled: payload?.enabled,
            channelId
          });
          safeAck(callback, { ok: true, tv });
        } catch (error) {
          const code = error instanceof Error ? error.message : '';
          if (
            code === 'ROOM_NOT_FOUND' ||
            code === 'ROOM_TV_MANAGER_REQUIRED' ||
            code === 'TV_CHANNEL_NOT_AVAILABLE' ||
            code === 'TV_CHANNEL_REQUIRED' ||
            code === 'NO_TV_STATE_CHANGES'
          ) {
            return safeAck(callback, { ok: false, error: code });
          }
          socket.data.lastRealtimeError = code || 'unknown';
          safeAck(callback, { ok: false, error: 'TV_UPDATE_FAILED' });
        }
      }
    );

    socket.on(
      'room:message:delete',
      async (payload: { roomId?: string; messageId?: string } | undefined, callback?: Ack) => {
        try {
          const roomId = payload?.roomId?.trim() ?? '';
          const messageId = payload?.messageId?.trim() ?? '';
          if (!joinedRooms.has(roomId)) return safeAck(callback, { ok: false, error: 'ROOM_NOT_JOINED' });
          if (!UUID_RE.test(messageId)) return safeAck(callback, { ok: false, error: 'MESSAGE_NOT_FOUND_OR_FORBIDDEN' });

          const deleted = await softDeleteRoomMessage(messageId, user.id, 'manual');
          if (!deleted || deleted.room_id !== roomId) {
            return safeAck(callback, { ok: false, error: 'MESSAGE_NOT_FOUND_OR_FORBIDDEN' });
          }
          io.to(roomChannel(roomId)).emit('room:message-deleted', { roomId, messageId });
          safeAck(callback, { ok: true, roomId, messageId });
        } catch {
          safeAck(callback, { ok: false, error: 'MESSAGE_DELETE_FAILED' });
        }
      }
    );

    socket.on(
      'private:message:start',
      async (payload: { username?: string; text?: string; clientMessageId?: string } | undefined, callback?: Ack) => {
        try {
          const username = payload?.username?.trim() ?? '';
          const text = payload?.text?.trim() ?? '';
          const clientMessageId = payload?.clientMessageId?.trim();
          if (clientMessageId && !UUID_RE.test(clientMessageId)) {
            return safeAck(callback, { ok: false, error: 'INVALID_CLIENT_MESSAGE_ID' });
          }
          if (text.length < 1 || text.length > 2000) {
            return safeAck(callback, { ok: false, error: 'INVALID_MESSAGE_TEXT' });
          }
          if (!(await allowRealtime('private-text', 30, 10, callback))) return;
          const target = await lookupMessageTarget(username);
          if (!target) return safeAck(callback, { ok: false, error: 'USER_NOT_FOUND' });
          if (target.id === user.id) return safeAck(callback, { ok: false, error: 'CANNOT_MESSAGE_SELF' });

          const result = await startPrivateText(user.id, target.id, text, clientMessageId);
          const message = privateMessageDto(result.message);
          const conversation = {
            id: result.conversation.id,
            status: result.conversation.status,
            peer: {
              id: target.id,
              username: target.username,
              displayName: target.display_name,
              gender: target.gender
            }
          };

          if (!result.message._idempotentReplay) {
            await createNotification({
              userId: target.id,
              type: result.conversation.status === 'pending' ? 'message_request' : 'private_message',
              title: result.conversation.status === 'pending' ? 'طلب مراسلة جديد' : 'رسالة خاصة',
              body: result.conversation.status === 'pending'
                ? `${user.display_name} يبي يراسلك`
                : `${user.display_name} بعتلك رسالة جديدة`,
              data: { conversationId: result.conversation.id, username: user.username },
              soundKey: 'message_received'
            });
          }

          if (result.conversation.status === 'active') {
            joinedPrivateConversations.add(result.conversation.id);
            await socket.join(privateChannel(result.conversation.id));
            if (!result.message._idempotentReplay) {
              io.to([
                privateChannel(result.conversation.id),
                userChannel(user.id),
                userChannel(target.id)
              ]).emit('private:message', { conversationId: result.conversation.id, message });
            }
          } else if (!result.message._idempotentReplay) {
            io.to(userChannel(target.id)).emit('private:request', {
              conversationId: result.conversation.id,
              peer: {
                id: user.id,
                username: user.username,
                displayName: user.display_name,
                gender: user.gender
              },
              message
            });
          }
          safeAck(callback, {
            ok: true,
            conversation,
            message,
            replayed: Boolean(result.message._idempotentReplay)
          });
        } catch (error) {
          const code = error instanceof Error ? error.message : '';
          if (
            code === 'CLIENT_MESSAGE_ID_REUSED' ||
            code === 'RELATIONSHIP_BLOCKED' ||
            code === 'MESSAGE_REQUEST_PENDING' ||
            code === 'INCOMING_REQUEST_PENDING' ||
            code === 'MESSAGE_REQUEST_REJECTED'
          ) {
            return safeAck(callback, { ok: false, error: code });
          }
          socket.data.lastRealtimeError = code || 'unknown';
          safeAck(callback, { ok: false, error: 'PRIVATE_MESSAGE_START_FAILED' });
        }
      }
    );

    socket.on(
      'private:conversation:join',
      async (payload: { conversationId?: string } | undefined, callback?: Ack) => {
        try {
          const conversationId = payload?.conversationId?.trim() ?? '';
          const conversation = await privateConversationForUser(conversationId, user.id);
          if (!conversation) return safeAck(callback, { ok: false, error: 'CONVERSATION_NOT_FOUND' });
          const peerId = conversation.user_low_id === user.id ? conversation.user_high_id : conversation.user_low_id;
          if (await areBlocked(user.id, peerId)) {
            return safeAck(callback, { ok: false, error: 'CONVERSATION_NOT_FOUND' });
          }
          joinedPrivateConversations.add(conversation.id);
          await socket.join(privateChannel(conversation.id));
          safeAck(callback, { ok: true, conversationId: conversation.id });
        } catch {
          safeAck(callback, { ok: false, error: 'PRIVATE_JOIN_FAILED' });
        }
      }
    );

    socket.on(
      'private:reaction:like:set',
      async (
        payload: { conversationId?: string; messageId?: string; active?: boolean } | undefined,
        callback?: Ack
      ) => {
        try {
          const conversationId = payload?.conversationId?.trim() ?? '';
          const messageId = payload?.messageId?.trim() ?? '';
          if (!UUID_RE.test(conversationId) || !UUID_RE.test(messageId)) {
            return safeAck(callback, { ok: false, error: 'MESSAGE_NOT_FOUND' });
          }
          if (!joinedPrivateConversations.has(conversationId)) {
            return safeAck(callback, { ok: false, error: 'CONVERSATION_NOT_JOINED' });
          }
          if (!(await allowRealtime('private-like', 60, 60, callback))) return;

          const summary = payload?.active === false
            ? await deletePrivateLike(user.id, conversationId, messageId)
            : await putPrivateLike(user.id, conversationId, messageId);

          io.to(privateChannel(conversationId)).emit('private:reaction', {
            conversationId,
            messageId,
            reaction: 'like',
            count: summary.count
          });
          safeAck(callback, { ok: true, like: summary });
        } catch (error) {
          const code = error instanceof Error ? error.message : '';
          if (code === 'MESSAGE_NOT_FOUND') {
            return safeAck(callback, { ok: false, error: code });
          }
          socket.data.lastRealtimeError = code || 'unknown';
          safeAck(callback, { ok: false, error: 'REACTION_UPDATE_FAILED' });
        }
      }
    );

    socket.on(
      'private:message:send',
      async (
        payload: { conversationId?: string; text?: string; clientMessageId?: string } | undefined,
        callback?: Ack
      ) => {
        try {
          const conversationId = payload?.conversationId?.trim() ?? '';
          const text = payload?.text?.trim() ?? '';
          const clientMessageId = payload?.clientMessageId?.trim();
          if (clientMessageId && !UUID_RE.test(clientMessageId)) {
            return safeAck(callback, { ok: false, error: 'INVALID_CLIENT_MESSAGE_ID' });
          }
          if (!joinedPrivateConversations.has(conversationId)) {
            return safeAck(callback, { ok: false, error: 'CONVERSATION_NOT_JOINED' });
          }
          if (text.length < 1 || text.length > 2000) {
            return safeAck(callback, { ok: false, error: 'INVALID_MESSAGE_TEXT' });
          }
          if (!(await allowRealtime('private-text', 30, 10, callback))) return;

          const result = await sendActivePrivateText(conversationId, user.id, text, clientMessageId);
          const message = privateMessageDto(result.message);
          if (!result.message._idempotentReplay) {
            io.to([
              privateChannel(result.conversation.id),
              userChannel(user.id),
              userChannel(result.peerId)
            ]).emit('private:message', { conversationId: result.conversation.id, message });
            await createNotification({
              userId: result.peerId,
              type: 'private_message',
              title: 'رسالة خاصة',
              body: `${user.display_name} بعتلك رسالة جديدة`,
              data: { conversationId: result.conversation.id, username: user.username },
              soundKey: 'message_received'
            });
          }
          safeAck(callback, {
            ok: true,
            message,
            replayed: Boolean(result.message._idempotentReplay)
          });
        } catch (error) {
          const code = error instanceof Error ? error.message : '';
          if (code === 'RELATIONSHIP_BLOCKED' || code === 'CLIENT_MESSAGE_ID_REUSED') {
            return safeAck(callback, { ok: false, error: code });
          }
          if (code === 'CONVERSATION_NOT_ACTIVE') {
            return safeAck(callback, { ok: false, error: 'CONVERSATION_NOT_FOUND' });
          }
          socket.data.lastRealtimeError = code || 'unknown';
          safeAck(callback, { ok: false, error: 'PRIVATE_MESSAGE_SEND_FAILED' });
        }
      }
    );

    socket.on(
      'private:voice:send',
      async (
        payload: { conversationId?: string; audio?: unknown; durationMs?: number; clientMessageId?: string } | undefined,
        callback?: Ack
      ) => {
        try {
          const conversationId = payload?.conversationId?.trim() ?? '';
          const clientMessageId = payload?.clientMessageId?.trim();
          if (clientMessageId && !UUID_RE.test(clientMessageId)) {
            return safeAck(callback, { ok: false, error: 'INVALID_CLIENT_MESSAGE_ID' });
          }
          if (!joinedPrivateConversations.has(conversationId)) {
            return safeAck(callback, { ok: false, error: 'CONVERSATION_NOT_JOINED' });
          }
          if (!(await allowRealtime('private-voice', 8, 60, callback))) return;

          const audio = normalizeVoiceBinary(payload?.audio);
          if (!audio) return safeAck(callback, { ok: false, error: 'VOICE_FORMAT_INVALID' });
          const durationMs = Number(payload?.durationMs);

          const result = await sendActivePrivateVoice(
            conversationId,
            user.id,
            audio,
            durationMs,
            clientMessageId
          );
          const message = privateMessageDto(result.message);
          if (!result.message._idempotentReplay) {
            io.to([
              privateChannel(result.conversation.id),
              userChannel(user.id),
              userChannel(result.peerId)
            ]).emit('private:message', { conversationId: result.conversation.id, message });
            await createNotification({
              userId: result.peerId,
              type: 'private_message',
              title: 'رسالة خاصة',
              body: `${user.display_name} بعتلك رسالة جديدة`,
              data: { conversationId: result.conversation.id, username: user.username },
              soundKey: 'message_received'
            });
          }
          safeAck(callback, {
            ok: true,
            message,
            replayed: Boolean(result.message._idempotentReplay)
          });
        } catch (error) {
          const code = error instanceof Error ? error.message : '';
          if (
            code === 'CLIENT_MESSAGE_ID_REUSED' ||
            code === 'VOICE_SIZE_INVALID' ||
            code === 'VOICE_DURATION_INVALID' ||
            code === 'VOICE_FORMAT_INVALID' ||
            code === 'STORAGE_DRIVER_UNSUPPORTED' ||
            code === 'RELATIONSHIP_BLOCKED'
          ) {
            return safeAck(callback, { ok: false, error: code });
          }
          if (code === 'CONVERSATION_NOT_ACTIVE') {
            return safeAck(callback, { ok: false, error: 'CONVERSATION_NOT_FOUND' });
          }
          socket.data.lastRealtimeError = code || 'unknown';
          safeAck(callback, { ok: false, error: 'PRIVATE_VOICE_SEND_FAILED' });
        }
      }
    );

    socket.on(
      'private:conversation:leave',
      async (payload: { conversationId?: string } | undefined, callback?: Ack) => {
        const conversationId = payload?.conversationId?.trim() ?? '';
        if (!joinedPrivateConversations.has(conversationId)) {
          return safeAck(callback, { ok: true, conversationId });
        }
        joinedPrivateConversations.delete(conversationId);
        await socket.leave(privateChannel(conversationId));
        safeAck(callback, { ok: true, conversationId });
      }
    );

    socket.on('room:leave', async (payload: { roomId?: string } | undefined, callback?: Ack) => {
      try {
        const roomId = payload?.roomId?.trim() ?? '';
        if (!UUID_RE.test(roomId)) return safeAck(callback, { ok: false, error: 'ROOM_NOT_FOUND' });
        await leaveRoom(roomId);
        safeAck(callback, { ok: true, roomId });
      } catch {
        safeAck(callback, { ok: false, error: 'REALTIME_ERROR' });
      }
    });

    socket.on('presence:heartbeat', async (callback?: Ack) => {
      try {
        await Promise.all([...joinedRooms].map((roomId) => refreshRoomPresence(roomId, user.id, socket.id)));
        void touchSessionToken(data.accessToken).catch(() => undefined);
        safeAck(callback, { ok: true, rooms: joinedRooms.size });
      } catch {
        safeAck(callback, { ok: false, error: 'REALTIME_ERROR' });
      }
    });

    socket.on('disconnect', () => {
      void Promise.all([...joinedRooms].map((roomId) => leaveRoom(roomId))).catch(() => undefined);
    });
  });

  app.addHook('onClose', async () => {
    unsubscribeTv();
    unsubscribePrayer();
    unsubscribeNotifications();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await closeRedis();
  });

  return io;
}
