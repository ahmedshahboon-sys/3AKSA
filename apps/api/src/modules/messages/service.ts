import { randomUUID } from 'node:crypto';
import { query } from '../../db.js';
import { deleteStoredVoice, storeVoiceBinary } from '../../storage.js';

export type RoomMessageRow = {
  id: string;
  room_id: string;
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
  like_count?: string | number;
  viewer_liked?: boolean;
  created_at: Date;
  expires_at: Date;
};

const MESSAGE_SELECT = `
  m.id, m.room_id, m.sender_id, u.username AS sender_username,
  u.display_name AS sender_display_name, u.gender AS sender_gender,
  m.message_type, m.text_content, m.storage_key, m.media_mime,
  m.media_bytes, m.media_duration_ms, m.client_message_id,
  m.created_at, m.expires_at
`;

export function roomMessageDto(message: RoomMessageRow) {
  return {
    id: message.id,
    roomId: message.room_id,
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
    reactions: {
      like: {
        count: Number(message.like_count ?? 0),
        reacted: Boolean(message.viewer_liked)
      }
    },
    sender: {
      id: message.sender_id,
      username: message.sender_username,
      displayName: message.sender_display_name,
      gender: message.sender_gender
    }
  };
}

async function existingRoomMessage(
  roomId: string,
  senderId: string,
  clientMessageId: string | undefined,
  expectedType: 'text' | 'voice',
  expectedText?: string
) {
  if (!clientMessageId) return null;
  const result = await query<RoomMessageRow>(
    `SELECT ${MESSAGE_SELECT},
            (SELECT count(*)::int
             FROM message_reactions mr
             WHERE mr.room_message_id = m.id AND mr.reaction_code = 'like') AS like_count,
            EXISTS (
              SELECT 1 FROM message_reactions mr
              WHERE mr.room_message_id = m.id
                AND mr.reaction_code = 'like'
                AND mr.reactor_user_id = $1
            ) AS viewer_liked
     FROM room_messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.sender_id = $1 AND m.client_message_id = $2
     LIMIT 1`,
    [senderId, clientMessageId]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (
    row.room_id !== roomId ||
    row.message_type !== expectedType ||
    (expectedType === 'text' && row.text_content !== expectedText)
  ) {
    throw new Error('CLIENT_MESSAGE_ID_REUSED');
  }
  return { ...row, _idempotentReplay: true };
}

export async function createRoomTextMessage(
  roomId: string,
  senderId: string,
  text: string,
  clientMessageId?: string
) {
  const existing = await existingRoomMessage(roomId, senderId, clientMessageId, 'text', text);
  if (existing) return existing;

  try {
    const result = await query<RoomMessageRow>(
      `WITH ts AS (SELECT clock_timestamp() AS created_at),
            inserted AS (
              INSERT INTO room_messages (
                id, room_id, sender_id, message_type, text_content, client_message_id, created_at, expires_at
              )
              SELECT $1, $2, $3, 'text', $4, $5, ts.created_at, ts.created_at + interval '24 hours'
              FROM ts
              RETURNING *
            )
       SELECT i.id, i.room_id, i.sender_id, u.username AS sender_username,
              u.display_name AS sender_display_name, u.gender AS sender_gender,
              i.message_type, i.text_content, i.storage_key, i.media_mime,
              i.media_bytes, i.media_duration_ms, i.client_message_id,
              i.created_at, i.expires_at
       FROM inserted i
       JOIN users u ON u.id = i.sender_id`,
      [randomUUID(), roomId, senderId, text, clientMessageId ?? null]
    );
    return { ...result.rows[0]!, _idempotentReplay: false };
  } catch (error) {
    if ((error as { code?: string }).code === '23505' && clientMessageId) {
      const duplicate = await existingRoomMessage(roomId, senderId, clientMessageId, 'text', text);
      if (duplicate) return duplicate;
    }
    throw error;
  }
}

export async function createRoomVoiceMessage(
  roomId: string,
  senderId: string,
  audio: Buffer,
  durationMs: number,
  clientMessageId?: string
) {
  const existing = await existingRoomMessage(roomId, senderId, clientMessageId, 'voice');
  if (existing) return existing;

  const stored = await storeVoiceBinary(audio, durationMs);
  try {
    const result = await query<RoomMessageRow>(
      `WITH ts AS (SELECT clock_timestamp() AS created_at),
            inserted AS (
              INSERT INTO room_messages (
                id, room_id, sender_id, message_type, text_content,
                storage_key, media_mime, media_bytes, media_duration_ms,
                client_message_id, created_at, expires_at
              )
              SELECT $1, $2, $3, 'voice', NULL, $4, $5, $6, $7, $8,
                     ts.created_at, ts.created_at + interval '24 hours'
              FROM ts
              RETURNING *
            )
       SELECT i.id, i.room_id, i.sender_id, u.username AS sender_username,
              u.display_name AS sender_display_name, u.gender AS sender_gender,
              i.message_type, i.text_content, i.storage_key, i.media_mime,
              i.media_bytes, i.media_duration_ms, i.client_message_id,
              i.created_at, i.expires_at
       FROM inserted i
       JOIN users u ON u.id = i.sender_id`,
      [
        randomUUID(),
        roomId,
        senderId,
        stored.storageKey,
        stored.mime,
        stored.bytes,
        stored.durationMs,
        clientMessageId ?? null
      ]
    );
    return { ...result.rows[0]!, _idempotentReplay: false };
  } catch (error) {
    await deleteStoredVoice(stored.storageKey);
    if ((error as { code?: string }).code === '23505' && clientMessageId) {
      const duplicate = await existingRoomMessage(roomId, senderId, clientMessageId, 'voice');
      if (duplicate) return duplicate;
    }
    throw error;
  }
}

export async function listRoomMessages(
  roomId: string,
  viewerId: string,
  options: { before?: Date; limit: number }
) {
  const values: unknown[] = [roomId, viewerId, options.limit];
  let beforeClause = '';
  if (options.before) {
    values.push(options.before);
    beforeClause = `AND m.created_at < $${values.length}`;
  }

  const result = await query<RoomMessageRow>(
    `SELECT ${MESSAGE_SELECT},
            (SELECT count(*)::int
             FROM message_reactions mr
             WHERE mr.room_message_id = m.id AND mr.reaction_code = 'like') AS like_count,
            EXISTS (
              SELECT 1 FROM message_reactions mr
              WHERE mr.room_message_id = m.id
                AND mr.reaction_code = 'like'
                AND mr.reactor_user_id = $2
            ) AS viewer_liked
     FROM room_messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.room_id = $1
       AND m.deleted_at IS NULL
       AND m.expires_at > now()
       AND u.status = 'active'
       ${beforeClause}
       AND NOT EXISTS (
         SELECT 1 FROM user_blocks b
         WHERE (b.blocker_id = $2 AND b.blocked_id = m.sender_id)
            OR (b.blocker_id = m.sender_id AND b.blocked_id = $2)
       )
     ORDER BY m.created_at DESC
     LIMIT $3`,
    values
  );

  return result.rows;
}

export async function getLiveRoomVoice(messageId: string, roomId: string, viewerId: string) {
  const result = await query<RoomMessageRow>(
    `SELECT ${MESSAGE_SELECT}
     FROM room_messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.id = $1 AND m.room_id = $2
       AND m.message_type = 'voice'
       AND m.deleted_at IS NULL
       AND m.expires_at > now()
       AND NOT EXISTS (
         SELECT 1 FROM user_blocks b
         WHERE (b.blocker_id = $3 AND b.blocked_id = m.sender_id)
            OR (b.blocker_id = m.sender_id AND b.blocked_id = $3)
       )
     LIMIT 1`,
    [messageId, roomId, viewerId]
  );
  return result.rows[0] ?? null;
}

export async function softDeleteRoomMessage(messageId: string, actorId: string, reason: string) {
  const result = await query<{ id: string; room_id: string; storage_key: string | null }>(
    `UPDATE room_messages m
     SET deleted_at = now(), deleted_by = $2, delete_reason = $3
     WHERE m.id = $1
       AND m.deleted_at IS NULL
       AND m.expires_at > now()
       AND (
         m.sender_id = $2
         OR EXISTS (SELECT 1 FROM rooms r WHERE r.id = m.room_id AND r.owner_id = $2)
         OR EXISTS (SELECT 1 FROM room_moderators rm WHERE rm.room_id = m.room_id AND rm.user_id = $2)
       )
     RETURNING m.id, m.room_id, m.storage_key`,
    [messageId, actorId, reason]
  );
  const deleted = result.rows[0] ?? null;
  if (deleted?.storage_key) await deleteStoredVoice(deleted.storage_key);
  return deleted;
}
