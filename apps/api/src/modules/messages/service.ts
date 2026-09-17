import { randomUUID } from 'node:crypto';
import { query } from '../../db.js';

export type RoomMessageRow = {
  id: string;
  room_id: string;
  sender_id: string;
  sender_username: string;
  sender_display_name: string;
  sender_gender: 'boy' | 'girl';
  message_type: 'text';
  text_content: string;
  created_at: Date;
  expires_at: Date;
};

export function roomMessageDto(message: RoomMessageRow) {
  return {
    id: message.id,
    roomId: message.room_id,
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

export async function createRoomTextMessage(roomId: string, senderId: string, text: string) {
  const result = await query<RoomMessageRow>(
    `WITH ts AS (SELECT clock_timestamp() AS created_at),
          inserted AS (
            INSERT INTO room_messages (
              id, room_id, sender_id, message_type, text_content, created_at, expires_at
            )
            SELECT $1, $2, $3, 'text', $4, ts.created_at, ts.created_at + interval '24 hours'
            FROM ts
            RETURNING id, room_id, sender_id, message_type, text_content, created_at, expires_at
          )
     SELECT i.id, i.room_id, i.sender_id, u.username AS sender_username,
            u.display_name AS sender_display_name, u.gender AS sender_gender,
            i.message_type, i.text_content, i.created_at, i.expires_at
     FROM inserted i
     JOIN users u ON u.id = i.sender_id`,
    [randomUUID(), roomId, senderId, text]
  );
  return result.rows[0]!;
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
    `SELECT m.id, m.room_id, m.sender_id, u.username AS sender_username,
            u.display_name AS sender_display_name, u.gender AS sender_gender,
            m.message_type, m.text_content, m.created_at, m.expires_at
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

export async function softDeleteRoomMessage(messageId: string, actorId: string, reason: string) {
  const result = await query<{ id: string; room_id: string }>(
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
     RETURNING m.id, m.room_id`,
    [messageId, actorId, reason]
  );
  return result.rows[0] ?? null;
}
