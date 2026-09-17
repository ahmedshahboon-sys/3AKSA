import type { FastifyInstance } from 'fastify';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { env } from '../../config.js';
import { query } from '../../db.js';
import { closeRedis } from '../../redis.js';
import { authenticateToken, touchSessionToken, type AuthenticatedUser } from '../auth/session.js';
import {
  createRoomTextMessage,
  roomMessageDto,
  softDeleteRoomMessage
} from '../messages/service.js';
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
            EXISTS (SELECT 1 FROM room_bans rb WHERE rb.room_id = r.id AND rb.user_id = $2) AS is_banned
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

export function attachRealtime(app: FastifyInstance) {
  const io = new SocketIOServer(app.server, {
    path: env.SOCKET_PATH,
    serveClient: false,
    transports: ['websocket', 'polling']
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
      const accessToken = typeof socket.handshake.auth?.accessToken === 'string'
        ? socket.handshake.auth.accessToken.trim()
        : '';
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
          io.to(roomChannel(room.id)).emit('room:member-joined', {
            roomId: room.id,
            user: { id: user.id, username: user.username, displayName: user.display_name, gender: user.gender }
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
      async (payload: { roomId?: string; text?: string } | undefined, callback?: Ack) => {
        try {
          const roomId = payload?.roomId?.trim() ?? '';
          const text = payload?.text?.trim() ?? '';
          if (!joinedRooms.has(roomId)) return safeAck(callback, { ok: false, error: 'ROOM_NOT_JOINED' });
          if (text.length < 1 || text.length > 2000) {
            return safeAck(callback, { ok: false, error: 'INVALID_MESSAGE_TEXT' });
          }

          const room = await getRoomPolicy(roomId, user.id);
          if (!room) return safeAck(callback, { ok: false, error: 'ROOM_NOT_FOUND' });
          const policyError = roomPolicyError(room, user);
          if (policyError) return safeAck(callback, { ok: false, error: policyError });

          const presence = await tryJoinRoomPresence(room.id, user.id, socket.id, room.max_users);
          if (!presence.allowed) return safeAck(callback, { ok: false, error: 'ROOM_FULL' });

          const message = await createRoomTextMessage(room.id, user.id, text);
          const dto = roomMessageDto(message);
          await emitMessageRespectingBlocks(room.id, user.id, dto);
          safeAck(callback, { ok: true, message: dto });
        } catch (error) {
          socket.data.lastRealtimeError = error instanceof Error ? error.message : 'unknown';
          safeAck(callback, { ok: false, error: 'MESSAGE_SEND_FAILED' });
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
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await closeRedis();
  });

  return io;
}
