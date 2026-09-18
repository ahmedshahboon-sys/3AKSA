import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { query, withTransaction } from '../../db.js';
import { openStoredVoice } from '../../storage.js';
import { authenticateRequest } from '../auth/session.js';
import { normalizeUsername } from '../auth/security.js';
import {
  areBlocked,
  getLivePrivateVoice,
  listPrivateMessages,
  privateMessageDto,
  startPrivateText,
  type PrivateConversationRow
} from './service.js';

type MessageBody = { username?: string; text?: string };
type HistoryQuery = { before?: string; limit?: string };

type ConversationListRow = PrivateConversationRow & {
  peer_id: string;
  peer_username: string;
  peer_display_name: string;
  peer_gender: 'boy' | 'girl';
  last_text: string | null;
  last_message_at: Date | null;
};

type RequestListRow = ConversationListRow & {
  request_text: string | null;
  request_expires_at: Date | null;
};

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await authenticateRequest(request);
  if (!user) reply.code(401).send({ error: 'UNAUTHORIZED' });
  return user;
}

async function lookupUser(username: string) {
  const result = await query<{ id: string; username: string; display_name: string; gender: 'boy' | 'girl' }>(
    `SELECT id, username, display_name, gender
     FROM users WHERE username_normalized = $1 AND status = 'active' LIMIT 1`,
    [normalizeUsername(username)]
  );
  return result.rows[0] ?? null;
}

function peerDto(row: ConversationListRow) {
  return {
    id: row.peer_id,
    username: row.peer_username,
    displayName: row.peer_display_name,
    gender: row.peer_gender
  };
}

export async function registerPrivateRoutes(app: FastifyInstance, options: { basePath: string }) {
  const prefix = `${options.basePath}/private`;

  app.post<{ Body: MessageBody }>(`${prefix}/messages`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const username = request.body.username?.trim() ?? '';
    const text = request.body.text?.trim() ?? '';
    if (text.length < 1 || text.length > 2000) return reply.code(400).send({ error: 'INVALID_MESSAGE_TEXT' });

    const target = await lookupUser(username);
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    if (target.id === user.id) return reply.code(400).send({ error: 'CANNOT_MESSAGE_SELF' });

    try {
      const result = await startPrivateText(user.id, target.id, text);
      return reply.code(201).send({
        conversation: {
          id: result.conversation.id,
          status: result.conversation.status,
          peer: {
            id: target.id,
            username: target.username,
            displayName: target.display_name,
            gender: target.gender
          }
        },
        message: privateMessageDto(result.message)
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'RELATIONSHIP_BLOCKED') return reply.code(409).send({ error: code });
      if (code === 'MESSAGE_REQUEST_PENDING' || code === 'INCOMING_REQUEST_PENDING') {
        return reply.code(409).send({ error: code });
      }
      if (code === 'MESSAGE_REQUEST_REJECTED') return reply.code(403).send({ error: code });
      throw error;
    }
  });

  app.get(`${prefix}/requests`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const result = await query<RequestListRow>(
      `SELECT c.*,
              peer.id AS peer_id, peer.username AS peer_username,
              peer.display_name AS peer_display_name, peer.gender AS peer_gender,
              preview.text_content AS request_text,
              preview.created_at AS last_message_at,
              preview.expires_at AS request_expires_at,
              preview.text_content AS last_text
       FROM private_conversations c
       JOIN users peer ON peer.id = CASE WHEN c.user_low_id = $1 THEN c.user_high_id ELSE c.user_low_id END
       LEFT JOIN LATERAL (
         SELECT m.text_content, m.created_at, m.expires_at
         FROM private_messages m
         WHERE m.conversation_id = c.id AND m.deleted_at IS NULL AND m.expires_at > now()
         ORDER BY m.created_at ASC
         LIMIT 1
       ) preview ON true
       WHERE c.status = 'pending'
         AND (c.user_low_id = $1 OR c.user_high_id = $1)
         AND c.requested_by <> $1
         AND preview.created_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_id = $1 AND b.blocked_id = peer.id)
              OR (b.blocker_id = peer.id AND b.blocked_id = $1)
         )
       ORDER BY c.created_at DESC`,
      [user.id]
    );
    return reply.send({
      requests: result.rows.map((row) => ({
        id: row.id,
        peer: peerDto(row),
        text: row.request_text,
        expiresAt: row.request_expires_at,
        createdAt: row.created_at
      }))
    });
  });

  app.post<{ Params: { conversationId: string } }>(`${prefix}/requests/:conversationId/accept`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    try {
      await withTransaction(async (client) => {
        const found = await client.query<PrivateConversationRow>(
          `SELECT * FROM private_conversations c
           WHERE c.id = $1 AND c.status = 'pending'
             AND (c.user_low_id = $2 OR c.user_high_id = $2)
             AND c.requested_by <> $2
             AND EXISTS (
               SELECT 1 FROM private_messages m
               WHERE m.conversation_id = c.id
                 AND m.deleted_at IS NULL
                 AND m.expires_at > now()
             )
           FOR UPDATE`,
          [request.params.conversationId, user.id]
        );
        const conversation = found.rows[0];
        if (!conversation) throw new Error('REQUEST_NOT_FOUND');
        const peerId = conversation.user_low_id === user.id ? conversation.user_high_id : conversation.user_low_id;
        if (await areBlocked(user.id, peerId, client)) throw new Error('RELATIONSHIP_BLOCKED');
        await client.query(
          `UPDATE private_conversations
           SET status = 'active', accepted_at = now(), updated_at = now()
           WHERE id = $1`,
          [conversation.id]
        );
      });
      return reply.send({ ok: true });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'REQUEST_NOT_FOUND') return reply.code(404).send({ error: 'MESSAGE_REQUEST_NOT_FOUND' });
      if (code === 'RELATIONSHIP_BLOCKED') return reply.code(409).send({ error: code });
      throw error;
    }
  });

  app.post<{ Params: { conversationId: string } }>(`${prefix}/requests/:conversationId/reject`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const result = await query(
      `UPDATE private_conversations c
       SET status = 'rejected', updated_at = now()
       WHERE c.id = $1 AND c.status = 'pending'
         AND (c.user_low_id = $2 OR c.user_high_id = $2)
         AND c.requested_by <> $2
         AND EXISTS (
           SELECT 1 FROM private_messages m
           WHERE m.conversation_id = c.id
             AND m.deleted_at IS NULL
             AND m.expires_at > now()
         )`,
      [request.params.conversationId, user.id]
    );
    if ((result.rowCount ?? 0) === 0) return reply.code(404).send({ error: 'MESSAGE_REQUEST_NOT_FOUND' });
    return reply.send({ ok: true });
  });

  app.get(`${prefix}/conversations`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const result = await query<ConversationListRow>(
      `SELECT c.*,
              peer.id AS peer_id, peer.username AS peer_username,
              peer.display_name AS peer_display_name, peer.gender AS peer_gender,
              last_message.text_content AS last_text,
              last_message.created_at AS last_message_at
       FROM private_conversations c
       JOIN users peer ON peer.id = CASE WHEN c.user_low_id = $1 THEN c.user_high_id ELSE c.user_low_id END
       LEFT JOIN LATERAL (
         SELECT m.text_content, m.created_at
         FROM private_messages m
         WHERE m.conversation_id = c.id AND m.deleted_at IS NULL AND m.expires_at > now()
         ORDER BY m.created_at DESC LIMIT 1
       ) last_message ON true
       WHERE c.status = 'active'
         AND (c.user_low_id = $1 OR c.user_high_id = $1)
         AND peer.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_id = $1 AND b.blocked_id = peer.id)
              OR (b.blocker_id = peer.id AND b.blocked_id = $1)
         )
       ORDER BY COALESCE(last_message.created_at, c.updated_at) DESC`,
      [user.id]
    );
    return reply.send({
      conversations: result.rows.map((row) => ({
        id: row.id,
        peer: peerDto(row),
        lastText: row.last_text,
        lastMessageAt: row.last_message_at,
        updatedAt: row.updated_at
      }))
    });
  });

  app.get<{ Params: { conversationId: string }; Querystring: HistoryQuery }>(
    `${prefix}/conversations/:conversationId/messages`,
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      const conversation = await query<PrivateConversationRow>(
        `SELECT * FROM private_conversations
         WHERE id = $1 AND status = 'active'
           AND (user_low_id = $2 OR user_high_id = $2)
         LIMIT 1`,
        [request.params.conversationId, user.id]
      );
      const found = conversation.rows[0];
      if (!found) return reply.code(404).send({ error: 'CONVERSATION_NOT_FOUND' });
      const peerId = found.user_low_id === user.id ? found.user_high_id : found.user_low_id;
      if (await areBlocked(user.id, peerId)) return reply.code(404).send({ error: 'CONVERSATION_NOT_FOUND' });

      const limitRaw = Number(request.query.limit ?? 50);
      const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
      let before: Date | undefined;
      if (request.query.before) {
        before = new Date(request.query.before);
        if (Number.isNaN(before.getTime())) return reply.code(400).send({ error: 'INVALID_CURSOR' });
      }
      const messages = await listPrivateMessages(found.id, user.id, limit, before);
      return reply.send({ messages: messages.map(privateMessageDto) });
    }
  );

  app.get<{ Params: { conversationId: string; messageId: string } }>(
    `${prefix}/conversations/:conversationId/messages/:messageId/voice`,
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const conversation = await query<PrivateConversationRow>(
        `SELECT * FROM private_conversations
         WHERE id = $1 AND status = 'active'
           AND (user_low_id = $2 OR user_high_id = $2)
         LIMIT 1`,
        [request.params.conversationId, user.id]
      );
      const found = conversation.rows[0];
      if (!found) return reply.code(404).send({ error: 'CONVERSATION_NOT_FOUND' });
      const peerId = found.user_low_id === user.id ? found.user_high_id : found.user_low_id;
      if (await areBlocked(user.id, peerId)) {
        return reply.code(404).send({ error: 'CONVERSATION_NOT_FOUND' });
      }

      const message = await getLivePrivateVoice(found.id, request.params.messageId, user.id);
      if (!message?.storage_key || !message.media_mime) {
        return reply.code(404).send({ error: 'VOICE_NOT_FOUND' });
      }

      reply.header('Cache-Control', 'private, no-store');
      reply.header('X-Content-Type-Options', 'nosniff');
      if (message.media_bytes) reply.header('Content-Length', String(message.media_bytes));
      reply.type(message.media_mime);
      return reply.send(openStoredVoice(message.storage_key));
    }
  );

}
