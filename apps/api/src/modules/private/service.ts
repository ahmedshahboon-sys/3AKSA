import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db.js';

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
  message_type: 'text';
  text_content: string;
  created_at: Date;
  expires_at: Date;
};

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

async function insertTextMessage(client: PoolClient, conversationId: string, senderId: string, text: string) {
  const result = await client.query<PrivateMessageRow>(
    `WITH ts AS (SELECT clock_timestamp() AS created_at),
          inserted AS (
            INSERT INTO private_messages (
              id, conversation_id, sender_id, message_type, text_content, created_at, expires_at
            )
            SELECT $1, $2, $3, 'text', $4, ts.created_at, ts.created_at + interval '24 hours'
            FROM ts
            RETURNING id, conversation_id, sender_id, message_type, text_content, created_at, expires_at
          )
     SELECT i.id, i.conversation_id, i.sender_id, u.username AS sender_username,
            u.display_name AS sender_display_name, u.gender AS sender_gender,
            i.message_type, i.text_content, i.created_at, i.expires_at
     FROM inserted i JOIN users u ON u.id = i.sender_id`,
    [randomUUID(), conversationId, senderId, text]
  );
  await client.query('UPDATE private_conversations SET updated_at = now() WHERE id = $1', [conversationId]);
  return result.rows[0]!;
}

export function privateMessageDto(message: PrivateMessageRow) {
  return {
    id: message.id,
    conversationId: message.conversation_id,
    type: message.message_type,
    text: message.text_content,
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

export async function startPrivateText(senderId: string, targetId: string, text: string) {
  return withTransaction(async (client) => {
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

    const message = await insertTextMessage(client, conversation.id, senderId, text);
    return { conversation, message };
  });
}

export async function sendActivePrivateText(conversationId: string, senderId: string, text: string) {
  return withTransaction(async (client) => {
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
    const message = await insertTextMessage(client, conversation.id, senderId, text);
    return { conversation, message, peerId };
  });
}

export async function listPrivateMessages(conversationId: string, viewerId: string, limit: number, before?: Date) {
  const values: unknown[] = [conversationId, viewerId, limit];
  let beforeClause = '';
  if (before) {
    values.push(before);
    beforeClause = `AND m.created_at < $${values.length}`;
  }
  const result = await query<PrivateMessageRow>(
    `SELECT m.id, m.conversation_id, m.sender_id, u.username AS sender_username,
            u.display_name AS sender_display_name, u.gender AS sender_gender,
            m.message_type, m.text_content, m.created_at, m.expires_at
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
