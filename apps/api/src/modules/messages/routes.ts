import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { query } from '../../db.js';
import { authenticateRequest, type AuthenticatedUser } from '../auth/session.js';
import { listRoomMessages, roomMessageDto, softDeleteRoomMessage } from './service.js';

type RoomAccessRow = {
  id: string;
  owner_id: string;
  visibility: 'public' | 'private';
  gender_policy: 'everyone' | 'boys' | 'girls';
  status: 'pending' | 'active' | 'hidden' | 'closed';
  is_moderator: boolean;
  is_invited: boolean;
  is_banned: boolean;
};

type HistoryQuery = { before?: string; limit?: string };

function unauthorized(reply: FastifyReply) {
  return reply.code(401).send({ error: 'UNAUTHORIZED' });
}

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await authenticateRequest(request);
  if (!user) unauthorized(reply);
  return user;
}

async function roomAccess(roomId: string, userId: string) {
  const result = await query<RoomAccessRow>(
    `SELECT r.id, r.owner_id, r.visibility, r.gender_policy, r.status,
            EXISTS (SELECT 1 FROM room_moderators rm WHERE rm.room_id = r.id AND rm.user_id = $2) AS is_moderator,
            EXISTS (
              SELECT 1 FROM room_invites ri
              WHERE ri.room_id = r.id AND ri.user_id = $2
                AND (ri.expires_at IS NULL OR ri.expires_at > now())
            ) AS is_invited,
            EXISTS (SELECT 1 FROM room_bans rb WHERE rb.room_id = r.id AND rb.user_id = $2) AS is_banned
     FROM rooms r WHERE r.id = $1 LIMIT 1`,
    [roomId, userId]
  );
  return result.rows[0] ?? null;
}

function accessError(room: RoomAccessRow, user: AuthenticatedUser) {
  if (room.status !== 'active') return 'ROOM_NOT_FOUND';
  if (room.is_banned) return 'ROOM_BANNED';
  if (room.gender_policy === 'boys' && user.gender !== 'boy') return 'ROOM_BOYS_ONLY';
  if (room.gender_policy === 'girls' && user.gender !== 'girl') return 'ROOM_GIRLS_ONLY';
  if (room.visibility === 'private' && user.id !== room.owner_id && !room.is_moderator && !room.is_invited) {
    return 'ROOM_PRIVATE';
  }
  return null;
}

export async function registerMessageRoutes(app: FastifyInstance, options: { basePath: string }) {
  const prefix = `${options.basePath}/rooms`;

  app.get<{ Params: { roomId: string }; Querystring: HistoryQuery }>(
    `${prefix}/:roomId/messages`,
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      const room = await roomAccess(request.params.roomId, user.id);
      if (!room) return reply.code(404).send({ error: 'ROOM_NOT_FOUND' });
      const error = accessError(room, user);
      if (error) return reply.code(error === 'ROOM_NOT_FOUND' ? 404 : 403).send({ error });

      const limitRaw = Number(request.query.limit ?? 50);
      const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
      let before: Date | undefined;
      if (request.query.before) {
        before = new Date(request.query.before);
        if (Number.isNaN(before.getTime())) return reply.code(400).send({ error: 'INVALID_CURSOR' });
      }

      const historyOptions = before ? { before, limit } : { limit };
      const messages = await listRoomMessages(room.id, user.id, historyOptions);
      return reply.send({ messages: messages.map(roomMessageDto) });
    }
  );

  app.delete<{ Params: { roomId: string; messageId: string } }>(
    `${prefix}/:roomId/messages/:messageId`,
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      const room = await roomAccess(request.params.roomId, user.id);
      if (!room) return reply.code(404).send({ error: 'ROOM_NOT_FOUND' });
      const error = accessError(room, user);
      if (error) return reply.code(error === 'ROOM_NOT_FOUND' ? 404 : 403).send({ error });

      const deleted = await softDeleteRoomMessage(request.params.messageId, user.id, 'manual');
      if (!deleted || deleted.room_id !== room.id) {
        return reply.code(404).send({ error: 'MESSAGE_NOT_FOUND_OR_FORBIDDEN' });
      }
      return reply.code(204).send();
    }
  );
}
