import type { PoolClient } from 'pg';
import { query,withTransaction } from '../../db.js';
import { hashPassword,usernameReservationKey,validatePassword } from '../auth/security.js';
import { approveManualTopupRequest,rejectManualTopupRequest } from '../economy/topups.js';
import { auditAdminAction } from './security.js';

type UserStatus='active'|'banned'|'deleted';

async function targetUser(client:PoolClient,userId:string){
  const result=await client.query<{
    id:string;username:string;username_normalized:string;display_name:string;
    phone_e164:string;gender:'boy'|'girl';status:UserStatus;
  }>(
    `SELECT id,username,username_normalized,display_name,phone_e164,gender,status
     FROM users WHERE id=$1 LIMIT 1 FOR UPDATE`,
    [userId]
  );
  const user=result.rows[0];
  if(!user)throw new Error('ADMIN_USER_NOT_FOUND');
  const protectedRole=await client.query(
    "SELECT 1 FROM staff_roles WHERE user_id=$1 AND role='super_admin' LIMIT 1",
    [userId]
  );
  if((protectedRole.rowCount??0)>0)throw new Error('SUPER_ADMIN_TARGET_PROTECTED');
  return user;
}

async function reserveUserName(client:PoolClient,username:string,reason:string){
  await client.query(
    `INSERT INTO reserved_usernames(username_key,reason)
     VALUES($1,$2)
     ON CONFLICT(username_key) DO UPDATE SET reason=EXCLUDED.reason`,
    [usernameReservationKey(username),reason.slice(0,120)]
  );
}

async function blockKnownDevices(client:PoolClient,userId:string,actorUserId:string,reason:string){
  await client.query(
    `INSERT INTO blocked_installations(installation_id,reason,blocked_by)
     SELECT installation_id,$3,$2
     FROM user_devices WHERE user_id=$1
     ON CONFLICT(installation_id)
     DO UPDATE SET reason=EXCLUDED.reason,blocked_at=now(),blocked_by=EXCLUDED.blocked_by`,
    [userId,actorUserId,reason.slice(0,240)]
  );
  await client.query(
    'UPDATE user_devices SET blocked_at=now(),last_seen_at=now() WHERE user_id=$1',
    [userId]
  );
}

async function revokeUserAccess(client:PoolClient,userId:string){
  await client.query(
    'UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1 AND revoked_at IS NULL',
    [userId]
  );
  await client.query(
    'UPDATE push_subscriptions SET enabled=false,last_error=$2,updated_at=now() WHERE user_id=$1',
    [userId,'ADMIN_ACCOUNT_DISABLED']
  );
}

export async function adminOverview(){
  const [users,reports,topups,rooms]=await Promise.all([
    query<{active:string;banned:string;deleted:string}>(
      `SELECT
         count(*) FILTER(WHERE status='active')::text AS active,
         count(*) FILTER(WHERE status='banned')::text AS banned,
         count(*) FILTER(WHERE status='deleted')::text AS deleted
       FROM users`
    ),
    query<{count:string}>("SELECT count(*)::text AS count FROM user_reports WHERE status IN ('open','reviewing')"),
    query<{count:string}>("SELECT count(*)::text AS count FROM manual_topup_requests WHERE status='pending'"),
    query<{count:string}>("SELECT count(*)::text AS count FROM rooms WHERE status='active'")
  ]);
  return {
    users:{
      active:Number(users.rows[0]?.active??0),
      banned:Number(users.rows[0]?.banned??0),
      deleted:Number(users.rows[0]?.deleted??0)
    },
    openReports:Number(reports.rows[0]?.count??0),
    pendingTopups:Number(topups.rows[0]?.count??0),
    activeRooms:Number(rooms.rows[0]?.count??0)
  };
}

export async function adminListUsers(options:{search?:string;status?:UserStatus;limit?:number}={}){
  const values:unknown[]=[];
  const where:string[]=[];
  const search=options.search?.trim().slice(0,100);
  if(search){
    values.push(`%${search}%`);
    where.push(`(username ILIKE $${values.length} OR display_name ILIKE $${values.length} OR phone_e164 ILIKE $${values.length})`);
  }
  if(options.status){
    values.push(options.status);
    where.push(`status=$${values.length}`);
  }
  values.push(Math.min(Math.max(options.limit??50,1),100));
  const result=await query<{
    id:string;username:string;display_name:string;phone_e164:string;gender:'boy'|'girl';
    status:UserStatus;created_at:Date;moderation_reason:string|null;moderated_at:Date|null;
  }>(
    `SELECT id,username,display_name,phone_e164,gender,status,created_at,
            moderation_reason,moderated_at
     FROM users
     ${where.length?`WHERE ${where.join(' AND ')}`:''}
     ORDER BY created_at DESC,id DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map((row)=>({
    id:row.id,username:row.username,displayName:row.display_name,phone:row.phone_e164,
    gender:row.gender,status:row.status,createdAt:row.created_at,
    moderationReason:row.moderation_reason,moderatedAt:row.moderated_at
  }));
}

export async function adminUserDetail(userId:string){
  const userResult=await query<{
    id:string;username:string;display_name:string;phone_e164:string;gender:'boy'|'girl';
    status:UserStatus;bio:string|null;nearby_enabled:boolean;created_at:Date;
    moderation_reason:string|null;moderated_at:Date|null;
  }>(
    `SELECT id,username,display_name,phone_e164,gender,status,bio,nearby_enabled,
            created_at,moderation_reason,moderated_at
     FROM users WHERE id=$1 LIMIT 1`,[userId]
  );
  const user=userResult.rows[0];
  if(!user)throw new Error('ADMIN_USER_NOT_FOUND');
  const [devices,location,roles]=await Promise.all([
    query<{installation_id:string;platform:string|null;first_seen_at:Date;last_seen_at:Date;blocked_at:Date|null}>(
      `SELECT installation_id,platform,first_seen_at,last_seen_at,blocked_at
       FROM user_devices WHERE user_id=$1 ORDER BY last_seen_at DESC`,[userId]
    ),
    query<{latitude:number;longitude:number;accuracy_m:number|null;updated_at:Date}>(
      'SELECT latitude,longitude,accuracy_m,updated_at FROM user_locations WHERE user_id=$1 LIMIT 1',[userId]
    ),
    query<{role:string}>('SELECT role FROM staff_roles WHERE user_id=$1 ORDER BY role',[userId])
  ]);
  return {
    id:user.id,username:user.username,displayName:user.display_name,phone:user.phone_e164,
    gender:user.gender,status:user.status,bio:user.bio,nearbyEnabled:user.nearby_enabled,
    createdAt:user.created_at,moderationReason:user.moderation_reason,moderatedAt:user.moderated_at,
    roles:roles.rows.map((row)=>row.role),
    devices:devices.rows.map((row)=>({
      installationId:row.installation_id,platform:row.platform,firstSeenAt:row.first_seen_at,
      lastSeenAt:row.last_seen_at,blockedAt:row.blocked_at
    })),
    lastLocation:location.rows[0]?{
      latitude:location.rows[0].latitude,longitude:location.rows[0].longitude,
      accuracyM:location.rows[0].accuracy_m,updatedAt:location.rows[0].updated_at
    }:null
  };
}

export async function adminBanUser(actorUserId:string,userId:string,reason:string){
  const clean=reason.trim().slice(0,500);
  if(clean.length<3)throw new Error('ADMIN_REASON_REQUIRED');
  return withTransaction(async(client)=>{
    const user=await targetUser(client,userId);
    if(user.status==='deleted')throw new Error('ADMIN_USER_ALREADY_DELETED');
    await client.query(
      `UPDATE users SET status='banned',nearby_enabled=false,moderation_reason=$2,
             moderated_by=$3,moderated_at=now(),updated_at=now()
       WHERE id=$1`,
      [user.id,clean,actorUserId]
    );
    await reserveUserName(client,user.username,'reserved after account ban');
    await blockKnownDevices(client,user.id,actorUserId,`admin account ban: ${clean}`);
    await revokeUserAccess(client,user.id);
    await auditAdminAction(client,actorUserId,'user_banned',{
      targetUserId:user.id,reason:clean,metadata:{username:user.username}
    });
    return {id:user.id,status:'banned' as const};
  });
}

export async function adminUnbanUser(actorUserId:string,userId:string,reason:string){
  const clean=reason.trim().slice(0,500);
  if(clean.length<3)throw new Error('ADMIN_REASON_REQUIRED');
  return withTransaction(async(client)=>{
    const user=await targetUser(client,userId);
    if(user.status==='deleted')throw new Error('ADMIN_USER_ALREADY_DELETED');
    await client.query(
      `UPDATE users SET status='active',moderation_reason=NULL,moderated_by=$2,
             moderated_at=now(),updated_at=now() WHERE id=$1`,
      [user.id,actorUserId]
    );
    await client.query(
      `DELETE FROM blocked_installations
       WHERE installation_id IN (SELECT installation_id FROM user_devices WHERE user_id=$1)`,
      [user.id]
    );
    await client.query('UPDATE user_devices SET blocked_at=NULL WHERE user_id=$1',[user.id]);
    await auditAdminAction(client,actorUserId,'user_unbanned',{
      targetUserId:user.id,reason:clean,metadata:{username:user.username}
    });
    return {id:user.id,status:'active' as const};
  });
}

export async function adminDeleteUser(actorUserId:string,userId:string,reason:string){
  const clean=reason.trim().slice(0,500);
  if(clean.length<3)throw new Error('ADMIN_REASON_REQUIRED');
  return withTransaction(async(client)=>{
    const user=await targetUser(client,userId);
    await client.query(
      `UPDATE users SET status='deleted',nearby_enabled=false,moderation_reason=$2,
             moderated_by=$3,moderated_at=now(),updated_at=now()
       WHERE id=$1`,
      [user.id,clean,actorUserId]
    );
    await reserveUserName(client,user.username,'reserved after account deletion');
    await blockKnownDevices(client,user.id,actorUserId,`admin account deletion: ${clean}`);
    await revokeUserAccess(client,user.id);
    await auditAdminAction(client,actorUserId,'user_deleted',{
      targetUserId:user.id,reason:clean,metadata:{username:user.username}
    });
    return {id:user.id,status:'deleted' as const};
  });
}

export async function adminResetPassword(
  actorUserId:string,userId:string,newPassword:string,reason:string
){
  if(!validatePassword(newPassword))throw new Error('WEAK_PASSWORD');
  const clean=reason.trim().slice(0,500);
  if(clean.length<3)throw new Error('ADMIN_REASON_REQUIRED');
  const passwordHash=await hashPassword(newPassword);
  return withTransaction(async(client)=>{
    const user=await targetUser(client,userId);
    if(user.status!=='active')throw new Error('ADMIN_USER_NOT_ACTIVE');
    await client.query(
      'UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',
      [user.id,passwordHash]
    );
    await client.query(
      'UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1 AND revoked_at IS NULL',
      [user.id]
    );
    await auditAdminAction(client,actorUserId,'password_reset',{
      targetUserId:user.id,reason:clean,metadata:{username:user.username}
    });
    return {id:user.id,reset:true};
  });
}

export async function adminListReports(status?:'open'|'reviewing'|'closed',limit=100){
  const result=await query<{
    id:string;reason:string;details:string|null;status:'open'|'reviewing'|'closed';
    created_at:Date;updated_at:Date;review_note:string|null;
    reporter_id:string;reporter_username:string;target_user_id:string;target_username:string;
  }>(
    `SELECT r.id,r.reason,r.details,r.status,r.created_at,r.updated_at,r.review_note,
            r.reporter_id,ru.username AS reporter_username,
            r.target_user_id,tu.username AS target_username
     FROM user_reports r
     JOIN users ru ON ru.id=r.reporter_id
     JOIN users tu ON tu.id=r.target_user_id
     WHERE ($1::text IS NULL OR r.status=$1)
     ORDER BY r.created_at DESC,r.id DESC
     LIMIT $2`,
    [status??null,Math.min(Math.max(limit,1),200)]
  );
  return result.rows.map((row)=>({
    id:row.id,reason:row.reason,details:row.details,status:row.status,
    reporter:{id:row.reporter_id,username:row.reporter_username},
    target:{id:row.target_user_id,username:row.target_username},
    reviewNote:row.review_note,createdAt:row.created_at,updatedAt:row.updated_at
  }));
}

export async function adminReviewReport(
  actorUserId:string,reportId:string,status:'reviewing'|'closed',note:string|null
){
  const result=await withTransaction(async(client)=>{
    const updated=await client.query<{id:string;target_user_id:string}>(
      `UPDATE user_reports SET status=$2,reviewed_by=$3,review_note=$4,updated_at=now()
       WHERE id=$1
       RETURNING id,target_user_id`,
      [reportId,status,actorUserId,note?.trim().slice(0,500)??null]
    );
    const row=updated.rows[0];
    if(!row)throw new Error('ADMIN_REPORT_NOT_FOUND');
    await auditAdminAction(client,actorUserId,'report_reviewed',{
      targetUserId:row.target_user_id,
      metadata:{reportId:row.id,status}
    });
    return row;
  });
  return {id:result.id,status};
}

export async function adminListPendingTopups(limit=100){
  const result=await query<{
    id:string;user_id:string;username:string;display_name:string;amount_milli:string;
    payment_reference:string|null;note:string|null;created_at:Date;
  }>(
    `SELECT t.id,t.user_id,u.username,u.display_name,t.amount_milli,
            t.payment_reference,t.note,t.created_at
     FROM manual_topup_requests t
     JOIN users u ON u.id=t.user_id
     WHERE t.status='pending'
     ORDER BY t.created_at ASC,t.id ASC
     LIMIT $1`,
    [Math.min(Math.max(limit,1),200)]
  );
  return result.rows.map((row)=>({
    id:row.id,user:{id:row.user_id,username:row.username,displayName:row.display_name},
    amountMilli:Number(row.amount_milli),paymentReference:row.payment_reference,
    note:row.note,createdAt:row.created_at
  }));
}

export async function adminApproveTopup(actorUserId:string,requestId:string){
  const result=await approveManualTopupRequest(requestId,actorUserId);
  await auditAdminAction(null,actorUserId,'topup_approved',{
    metadata:{requestId,replayed:result.replayed}
  });
  return result;
}

export async function adminRejectTopup(actorUserId:string,requestId:string){
  const result=await rejectManualTopupRequest(requestId,actorUserId);
  await auditAdminAction(null,actorUserId,'topup_rejected',{
    metadata:{requestId,replayed:result.replayed}
  });
  return result;
}

export async function adminBreakGlassPrivateMessages(
  actorUserId:string,conversationId:string,reason:string,limit=100
){
  const clean=reason.trim().slice(0,500);
  if(clean.length<10)throw new Error('BREAK_GLASS_REASON_REQUIRED');
  const conversation=await query<{
    id:string;user_low_id:string;user_high_id:string;status:string;
    low_username:string;high_username:string;
  }>(
    `SELECT c.id,c.user_low_id,c.user_high_id,c.status,
            lu.username AS low_username,hu.username AS high_username
     FROM private_conversations c
     JOIN users lu ON lu.id=c.user_low_id
     JOIN users hu ON hu.id=c.user_high_id
     WHERE c.id=$1 LIMIT 1`,[conversationId]
  );
  const found=conversation.rows[0];
  if(!found)throw new Error('CONVERSATION_NOT_FOUND');
  const messages=await query<{
    id:string;sender_id:string;username:string;display_name:string;message_type:'text'|'voice';
    text_content:string|null;media_mime:string|null;media_bytes:number|null;
    media_duration_ms:number|null;created_at:Date;expires_at:Date;
  }>(
    `SELECT m.id,m.sender_id,u.username,u.display_name,m.message_type,m.text_content,
            m.media_mime,m.media_bytes,m.media_duration_ms,m.created_at,m.expires_at
     FROM private_messages m
     JOIN users u ON u.id=m.sender_id
     WHERE m.conversation_id=$1
       AND m.deleted_at IS NULL
       AND m.expires_at>now()
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [conversationId,Math.min(Math.max(limit,1),200)]
  );
  await auditAdminAction(null,actorUserId,'break_glass_private_messages',{
    reason:clean,
    metadata:{
      conversationId,
      participants:[found.user_low_id,found.user_high_id],
      returnedMessages:messages.rows.length
    }
  });
  return {
    conversation:{
      id:found.id,status:found.status,
      participants:[
        {id:found.user_low_id,username:found.low_username},
        {id:found.user_high_id,username:found.high_username}
      ]
    },
    messages:messages.rows.map((row)=>({
      id:row.id,type:row.message_type,text:row.text_content,
      voice:row.message_type==='voice'?{
        mime:row.media_mime,bytes:row.media_bytes,durationMs:row.media_duration_ms
      }:null,
      sender:{id:row.sender_id,username:row.username,displayName:row.display_name},
      createdAt:row.created_at,expiresAt:row.expires_at
    }))
  };
}

export async function adminAuditLog(limit=100){
  const result=await query<{
    id:string;actor_user_id:string;actor_username:string;action:string;
    target_user_id:string|null;target_username:string|null;reason:string|null;
    metadata:Record<string,unknown>;created_at:Date;
  }>(
    `SELECT a.id,a.actor_user_id,actor.username AS actor_username,a.action,
            a.target_user_id,target.username AS target_username,a.reason,a.metadata,a.created_at
     FROM admin_audit_log a
     JOIN users actor ON actor.id=a.actor_user_id
     LEFT JOIN users target ON target.id=a.target_user_id
     ORDER BY a.created_at DESC,a.id DESC
     LIMIT $1`,
    [Math.min(Math.max(limit,1),250)]
  );
  return result.rows.map((row)=>({
    id:row.id,actor:{id:row.actor_user_id,username:row.actor_username},
    action:row.action,
    target:row.target_user_id?{id:row.target_user_id,username:row.target_username}:null,
    reason:row.reason,metadata:row.metadata,createdAt:row.created_at
  }));
}
