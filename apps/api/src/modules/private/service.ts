import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db.js';
import { deleteStoredVoice, storeVoiceBinary } from '../../storage.js';

export type PrivateConversationRow = {
  id: string;
  user_low_id: string;
  user_high_id: string;
  requested_by: string;
  status: 'pending' | 'active' | 'rejected';
  accepted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PrivateMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_username: string;
  sender_display_name: string;
  sender_gender: 'boy' | 'girl';
  message_type: 'text' | 'voice';
  text_content: string | null;
  storage_key: string | null;
  media_mime: 'audio/webm' | 'audio/ogg' | 'audio/mp4' | null;
  media_bytes: number | null;
  media_duration_ms: number | null;
  client_message_id: string | null;
  _idempotentReplay?: boolean;
  created_at: Date;
  expires_at: Date;
};

const PRIVATE_MESSAGE_SELECT = `
  m.id, m.conversation_id, m.sender_id, u.username AS sender_username,
  u.display_name AS sender_display_name, u.gender AS sender_gender,
  m.message_type, m.text_content, m.storage_key, m.media_mime,
  m.media_bytes, m.media_duration_ms, m.client_message_id,
  m.created_at, m.expires_at
`;

export function orderedUserIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function areBlocked(a: string, b: string, client?: PoolClient) {
  const sql = `SELECT 1 FROM user_blocks
               WHERE (blocker_id = $1 AND blocked_id = $2)
                  OR (blocker_id = $2 AND blocked_id = $1)
               LIMIT 1`;
  const result = client
    ? await client.query(sql, [a, b])
    : await query(sql, [a, b]);
  return (result.rowCount ?? 0) > 0;
}

async function areFriends(a: string, b: string, client: PoolClient) {
  const [low, high] = orderedUserIds(a, b);
  const result = await client.query(
    'SELECT 1 FROM friendships WHERE user_low_id = $1 AND user_high_id = $2 LIMIT 1',
    [low, high]
  );
  return (result.rowCount ?? 0) > 0;
}

async function existingPrivateMessage(
  senderId: string,
  clientMessageId: string | undefined,
  expected: {
    type: 'text' | 'voice';
    conversationId?: string;
    targetId?: string;
    text?: string;
  }
) {
  if (!clientMessageId) return null;
  const result = await query<PrivateMessageRow & PrivateConversationRow & { conversation_created_at: Date }>(
    `SELECT ${PRIVATE_MESSAGE_SELECT},
            c.user_low_id, c.user_high_id, c.requested_by, c.status,
            c.accepted_at, c.created_at AS conversation_created_at, c.updated_at
     FROM private_messages m
     JOIN private_conversations c ON c.id = m.conversation_id
     JOIN users u ON u.id = m.sender_id
     WHERE m.sender_id = $1 AND m.client_message_id = $2
     LIMIT 1`,
    [senderId, clientMessageId]
  );
  const row = result.rows[0];
  if (!row) return null;

  const peerId = row.user_low_id === senderId ? row.user_high_id : row.user_low_id;
  if (
    row.message_type !== expected.type ||
    (expected.conversationId !== undefined && row.conversation_id !== expected.conversationId) ||
    (expected.targetId !== undefined && peerId !== expected.targetId) ||
    (expected.type === 'text' && row.text_content !== expected.text)
  ) {
    throw new Error('CLIENT_MESSAGE_ID_REUSED');
  }

  const conversation: PrivateConversationRow = {
    id: row.conversation_id,
    user_low_id: row.user_low_id,
    user_high_id: row.user_high_id,
    requested_by: row.requested_by,
    status: row.status,
    accepted_at: row.accepted_at,
    created_at: row.conversation_created_at,
    updated_at: row.updated_at
  };
  return { conversation, message: { ...(row as PrivateMessageRow), _idempotentReplay: true } };
}

async function insertTextMessage(
  client: PoolClient,
  conversationId: string,
  senderId: string,
  text: string,
  clientMessageId?: string
) {
  const result = await client.query<PrivateMessageRow>(
    `WITH ts AS (SELECT clock_timestamp() AS created_at),
          inserted AS (
            INSERT INTO private_messages (
              id, conversation_id, sender_id, message_type, text_content,
              client_message_id, created_at, expires_at
            )
            SELECT $1, $2, $3, 'text', $4, $5, ts.created_at, ts.created_at + interval '24 hours'
            FROM ts
            RETURNING *
          )
     SELECT i.id, i.conversation_id, i.sender_id, u.username AS sender_username,
            u.display_name AS sender_display_name, u.gender AS sender_gender,
            i.message_type, i.text_content, i.storage_key, i.media_mime,
            i.media_bytes, i.media_duration_ms, i.client_message_id,
            i.created_at, i.expires_at
     FROM inserted i JOIN users u ON u.id = i.sender_id`,
    [randomUUID(), conversationId, senderId, text, clientMessageId ?? null]
  );
  await client.query('UPDATE private_conversations SET updated_at = now() WHERE id = $1', [conversationId]);
  return { ...result.rows[0]!, _idempotentReplay: false };
}

async function insertVoiceMessage(
  client: PoolClient,
  conversationId: string,
  senderId: string,
  audio: Buffer,
  durationMs: number,
  clientMessageId?: string
) {
  const stored = await storeVoiceBinary(audio, durationMs);
  try {
    const result = await client.query<PrivateMessageRow>(
      `WITH ts AS (SELECT clock_timestamp() AS created_at),
            inserted AS (
              INSERT INTO private_messages (
                id, conversation_id, sender_id, message_type, text_content,
                storage_key, media_mime, media_bytes, media_duration_ms,
                client_message_id, created_at, expires_at
              )
              SELECT $1, $2, $3, 'voice', NULL, $4, $5, $6, $7, $8,
                     ts.created_at, ts.created_at + interval '24 hours'
              FROM ts
              RETURNING *
            )
       SELECT i.id, i.conversation_id, i.sender_id, u.username AS sender_username,
              u.display_name AS sender_display_name, u.gender AS sender_gender,
              i.message_type, i.text_content, i.storage_key, i.media_mime,
              i.media_bytes, i.media_duration_ms, i.client_message_id,
              i.created_at, i.expires_at
       FROM inserted i JOIN users u ON u.id = i.sender_id`,
      [
        randomUUID(),
        conversationId,
        senderId,
        stored.storageKey,
        stored.mime,
        stored.bytes,
        stored.durationMs,
        clientMessageId ?? null
      ]
    );
    await client.query('UPDATE private_conversations SET updated_at = now() WHERE id = $1', [conversationId]);
    return { ...result.rows[0]!, _idempotentReplay: false };
  } catch (error) {
    await deleteStoredVoice(stored.storageKey);
    throw error;
  }
}

export function privateMessageDto(message: PrivateMessageRow) {
  return {
    id: message.id,
    conversationId: message.conversation_id,
    type: message.message_type,
    text: message.message_type === 'text' ? message.text_content : null,
    voice: message.message_type === 'voice'
      ? {
          mime: message.media_mime,
          bytes: message.media_bytes,
          durationMs: message.media_duration_ms
        }
      : null,
    clientMessageId: message.client_message_id,
    createdAt: message.created_at,
    expiresAt: message.expires_at,
    sender: {
      id: message.sender_id,
      username: message.sender_username,
      displayName: message.sender_display_name,
      gender: message.sender_gender
    }
  };
}

export async function startPrivateText(
  senderId: string,
  targetId: string,
  text: string,
  clientMessageId?: string
) {
  const prior = await existingPrivateMessage(senderId, clientMessageId, { type: 'text', targetId, text });
  if (prior) return prior;

  try {
    return await withTransaction(async (client) => {
      if (await areBlocked(senderId, targetId, client)) throw new Error('RELATIONSHIP_BLOCKED');
      const [low, high] = orderedUserIds(senderId, targetId);
      const existing = await client.query<PrivateConversationRow>(
        `SELECT * FROM private_conversations
         WHERE user_low_id = $1 AND user_high_id = $2
         FOR UPDATE`,
        [low, high]
      );
      let conversation = existing.rows[0];

      if (!conversation) {
        const friends = await areFriends(senderId, targetId, client);
        const status = friends ? 'active' : 'pending';
        const created = await client.query<PrivateConversationRow>(
          `INSERT INTO private_conversations (
             id, user_low_id, user_high_id, requested_by, status, accepted_at
           ) VALUES (
             $1, $2, $3, $4, $5::varchar(16),
             CASE WHEN $5::varchar(16) = 'active' THEN now() ELSE NULL END
           )
           RETURNING *`,
          [randomUUID(), low, high, senderId, status]
        );
        conversation = created.rows[0]!;
      } else if (conversation.status === 'pending') {
        if (conversation.requested_by === senderId) throw new Error('MESSAGE_REQUEST_PENDING');
        throw new Error('INCOMING_REQUEST_PENDING');
      } else if (conversation.status === 'rejected') {
        throw new Error('MESSAGE_REQUEST_REJECTED');
      }

      const message = await insertTextMessage(client, conversation.id, senderId, text, clientMessageId);
      return { conversation, message };
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505' && clientMessageId) {
      const duplicate = await existingPrivateMessage(senderId, clientMessageId, { type: 'text', targetId, text });
      if (duplicate) return duplicate;
    }
    throw error;
  }
}

export async function sendActivePrivateText(
  conversationId: string,
  senderId: string,
  text: string,
  clientMessageId?: string
) {
  const prior = await existingPrivateMessage(senderId, clientMessageId, { type: 'text', conversationId, text });
  if (prior) {
    const peerId = prior.conversation.user_low_id === senderId
      ? prior.conversation.user_high_id
      : prior.conversation.user_low_id;
    return { ...prior, peerId };
  }

  try {
    return await withTransaction(async (client) => {
      const found = await client.query<PrivateConversationRow>(
        `SELECT * FROM private_conversations
         WHERE id = $1 AND (user_low_id = $2 OR user_high_id = $2)
         FOR UPDATE`,
        [conversationId, senderId]
      );
      const conversation = found.rows[0];
      if (!conversation || conversation.status !== 'active') throw new Error('CONVERSATION_NOT_ACTIVE');
      const peerId = conversation.user_low_id === senderId ? conversation.user_high_id : conversation.user_low_id;
      if (await areBlocked(senderId, peerId, client)) throw new Error('RELATIONSHIP_BLOCKED');
      const message = await insertTextMessage(client, conversation.id, senderId, text, clientMessageId);
      return { conversation, message, peerId };
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505' && clientMessageId) {
      const duplicate = await existingPrivateMessage(senderId, clientMessageId, { type: 'text', conversationId, text });
      if (duplicate) {
        const peerId = duplicate.conversation.user_low_id === senderId
          ? duplicate.conversation.user_high_id
          : duplicate.conversation.user_low_id;
        return { ...duplicate, peerId };
      }
    }
    throw error;
  }
}

export async function sendActivePrivateVoice(
  conversationId: string,
  senderId: string,
  audio: Buffer,
  durationMs: number,
  clientMessageId?: string
) {
  const prior = await existingPrivateMessage(senderId, clientMessageId, { type: 'voice', conversationId });
  if (prior) {
    const peerId = prior.conversation.user_low_id === senderId
      ? prior.conversation.user_high_id
      : prior.conversation.user_low_id;
    return { ...prior, peerId };
  }

  try {
    return await withTransaction(async (client) => {
      const found = await client.query<PrivateConversationRow>(
        `SELECT * FROM private_conversations
         WHERE id = $1 AND (user_low_id = $2 OR user_high_id = $2)
         FOR UPDATE`,
        [conversationId, senderId]
      );
      const conversation = found.rows[0];
      if (!conversation || conversation.status !== 'active') throw new Error('CONVERSATION_NOT_ACTIVE');
      const peerId = conversation.user_low_id === senderId ? conversation.user_high_id : conversation.user_low_id;
      if (await areBlocked(senderId, peerId, client)) throw new Error('RELATIONSHIP_BLOCKED');
      const message = await insertVoiceMessage(
        client,
        conversation.id,
        senderId,
        audio,
        durationMs,
        clientMessageId
      );
      return { conversation, message, peerId };
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505' && clientMessageId) {
      const duplicate = await existingPrivateMessage(senderId, clientMessageId, { type: 'voice', conversationId });
      if (duplicate) {
        const peerId = duplicate.conversation.user_low_id === senderId
          ? duplicate.conversation.user_high_id
          : duplicate.conversation.user_low_id;
        return { ...duplicate, peerId };
      }
    }
    throw error;
  }
}

export async function listPrivateMessages(conversationId: string, viewerId: string, limit: number, before?: Date) {
  const values: unknown[] = [conversationId, viewerId, limit];
  let beforeClause = '';
  if (before) {
    values.push(before);
    beforeClause = `AND m.created_at < $${values.length}`;
  }
  const result = await query<PrivateMessageRow>(
    `SELECT ${PRIVATE_MESSAGE_SELECT}
     FROM private_messages m
     JOIN private_conversations c ON c.id = m.conversation_id
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1
       AND c.status = 'active'
       AND (c.user_low_id = $2 OR c.user_high_id = $2)
       AND m.deleted_at IS NULL
       AND m.expires_at > now()
       ${beforeClause}
     ORDER BY m.created_at DESC
     LIMIT $3`,
    values
  );
  return result.rows;
}

export async function getLivePrivateVoice(conversationId: string, messageId: string, viewerId: string) {
  const result = await query<PrivateMessageRow>(
    `SELECT ${PRIVATE_MESSAGE_SELECT}
     FROM private_messages m
     JOIN private_conversations c ON c.id = m.conversation_id
     JOIN users u ON u.id = m.sender_id
     WHERE m.id = $1 AND m.conversation_id = $2
       AND m.message_type = 'voice'
       AND c.status = 'active'
       AND (c.user_low_id = $3 OR c.user_high_id = $3)
       AND m.deleted_at IS NULL
       AND m.expires_at > now()
     LIMIT 1`,
    [messageId, conversationId, viewerId]
  );
  return result.rows[0] ?? null;
}
