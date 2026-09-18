import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db.js';
import type { AuthenticatedUser } from '../auth/session.js';

type ReactionSummary={count:number;reacted:boolean};

async function liveRoomMessage(
  client:PoolClient,user:AuthenticatedUser,roomId:string,messageId:string
){
  const result=await client.query<{id:string}>(
    `SELECT m.id
     FROM room_messages m
     JOIN rooms r ON r.id=m.room_id
     WHERE m.id=$1 AND m.room_id=$2
       AND m.deleted_at IS NULL AND m.expires_at>now()
       AND r.status='active'
       AND NOT EXISTS (SELECT 1 FROM room_bans rb WHERE rb.room_id=r.id AND rb.user_id=$3)
       AND (
         r.gender_policy='everyone'
         OR (r.gender_policy='boys' AND $4='boy')
         OR (r.gender_policy='girls' AND $4='girl')
       )
       AND (
         r.visibility='public'
         OR r.owner_id=$3
         OR EXISTS (SELECT 1 FROM room_moderators rm WHERE rm.room_id=r.id AND rm.user_id=$3)
         OR EXISTS (
           SELECT 1 FROM room_invites ri
           WHERE ri.room_id=r.id AND ri.user_id=$3
             AND (ri.expires_at IS NULL OR ri.expires_at>now())
         )
       )
       AND NOT EXISTS (
         SELECT 1 FROM user_blocks b
         WHERE (b.blocker_id=$3 AND b.blocked_id=m.sender_id)
            OR (b.blocker_id=m.sender_id AND b.blocked_id=$3)
       )
     LIMIT 1`,
    [messageId,roomId,user.id,user.gender]
  );
  return result.rows[0] ?? null;
}

async function livePrivateMessage(
  client:PoolClient,userId:string,conversationId:string,messageId:string
){
  const result=await client.query<{id:string}>(
    `SELECT m.id
     FROM private_messages m
     JOIN private_conversations c ON c.id=m.conversation_id
     WHERE m.id=$1 AND m.conversation_id=$2
       AND c.status='active'
       AND (c.user_low_id=$3 OR c.user_high_id=$3)
       AND m.deleted_at IS NULL AND m.expires_at>now()
       AND NOT EXISTS (
         SELECT 1 FROM user_blocks b
         WHERE (b.blocker_id=$3 AND b.blocked_id=m.sender_id)
            OR (b.blocker_id=m.sender_id AND b.blocked_id=$3)
       )
     LIMIT 1`,
    [messageId,conversationId,userId]
  );
  return result.rows[0] ?? null;
}

async function roomSummary(client:PoolClient,messageId:string,userId:string):Promise<ReactionSummary>{
  const result=await client.query<{count:string;reacted:boolean}>(
    `SELECT count(*)::text AS count,
            bool_or(reactor_user_id=$2) AS reacted
     FROM message_reactions
     WHERE room_message_id=$1 AND reaction_code='like'`,
    [messageId,userId]
  );
  return {count:Number(result.rows[0]?.count ?? 0),reacted:Boolean(result.rows[0]?.reacted)};
}

async function privateSummary(client:PoolClient,messageId:string,userId:string):Promise<ReactionSummary>{
  const result=await client.query<{count:string;reacted:boolean}>(
    `SELECT count(*)::text AS count,
            bool_or(reactor_user_id=$2) AS reacted
     FROM message_reactions
     WHERE private_message_id=$1 AND reaction_code='like'`,
    [messageId,userId]
  );
  return {count:Number(result.rows[0]?.count ?? 0),reacted:Boolean(result.rows[0]?.reacted)};
}

export async function putRoomLike(user:AuthenticatedUser,roomId:string,messageId:string){
  return withTransaction(async(client)=>{
    if(!await liveRoomMessage(client,user,roomId,messageId)) throw new Error('MESSAGE_NOT_FOUND');
    await client.query(
      `INSERT INTO message_reactions (id,reactor_user_id,reaction_code,room_message_id)
       VALUES ($1,$2,'like',$3)
       ON CONFLICT (room_message_id,reactor_user_id,reaction_code)
         WHERE room_message_id IS NOT NULL
       DO NOTHING`,
      [randomUUID(),user.id,messageId]
    );
    return roomSummary(client,messageId,user.id);
  });
}

export async function deleteRoomLike(user:AuthenticatedUser,roomId:string,messageId:string){
  return withTransaction(async(client)=>{
    if(!await liveRoomMessage(client,user,roomId,messageId)) throw new Error('MESSAGE_NOT_FOUND');
    await client.query(
      `DELETE FROM message_reactions
       WHERE room_message_id=$1 AND reactor_user_id=$2 AND reaction_code='like'`,
      [messageId,user.id]
    );
    return roomSummary(client,messageId,user.id);
  });
}

export async function getRoomLikeSummary(user:AuthenticatedUser,roomId:string,messageId:string){
  return withTransaction(async(client)=>{
    if(!await liveRoomMessage(client,user,roomId,messageId)) throw new Error('MESSAGE_NOT_FOUND');
    return roomSummary(client,messageId,user.id);
  });
}

export async function putPrivateLike(userId:string,conversationId:string,messageId:string){
  return withTransaction(async(client)=>{
    if(!await livePrivateMessage(client,userId,conversationId,messageId)) throw new Error('MESSAGE_NOT_FOUND');
    await client.query(
      `INSERT INTO message_reactions (id,reactor_user_id,reaction_code,private_message_id)
       VALUES ($1,$2,'like',$3)
       ON CONFLICT (private_message_id,reactor_user_id,reaction_code)
         WHERE private_message_id IS NOT NULL
       DO NOTHING`,
      [randomUUID(),userId,messageId]
    );
    return privateSummary(client,messageId,userId);
  });
}

export async function deletePrivateLike(userId:string,conversationId:string,messageId:string){
  return withTransaction(async(client)=>{
    if(!await livePrivateMessage(client,userId,conversationId,messageId)) throw new Error('MESSAGE_NOT_FOUND');
    await client.query(
      `DELETE FROM message_reactions
       WHERE private_message_id=$1 AND reactor_user_id=$2 AND reaction_code='like'`,
      [messageId,userId]
    );
    return privateSummary(client,messageId,userId);
  });
}

export async function getPrivateLikeSummary(userId:string,conversationId:string,messageId:string){
  return withTransaction(async(client)=>{
    if(!await livePrivateMessage(client,userId,conversationId,messageId)) throw new Error('MESSAGE_NOT_FOUND');
    return privateSummary(client,messageId,userId);
  });
}
