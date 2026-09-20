import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance,FastifyReply } from 'fastify';
import { query,withTransaction } from '../../db.js';
import { consumeRateLimit } from '../../rate-limit.js';
import { clearWebSessionCookie,requestWantsCookieSession,setWebSessionCookie } from './cookie.js';
import { attachDevice,createSession } from './session-service.js';
import { hashPassword,normalizePhone,normalizeUsername,validatePassword } from './security.js';

const REQUEST_TTL_MS=24*60*60*1000;
const APPROVED_TTL_MS=30*60*1000;

type RecoveryUser={
  id:string;username:string;display_name:string;phone_e164:string;
  gender:'boy'|'girl';status:'active'|'banned'|'deleted';created_at:Date;
};

function userDto(user:RecoveryUser){
  return {
    id:user.id,username:user.username,displayName:user.display_name,phone:user.phone_e164,
    gender:user.gender,status:user.status,createdAt:user.created_at
  };
}

function tokenHash(value:string){
  return createHash('sha256').update(value).digest('hex');
}

function limited(reply:FastifyReply,retryAfterSeconds:number){
  reply.header('Retry-After',String(retryAfterSeconds));
  return reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds});
}

export async function listPendingRecoveryRequests(limit=100){
  const result=await query<{
    public_id:string;user_id:string;username:string;display_name:string;
    created_at:Date;expires_at:Date;
  }>(
    `SELECT r.public_id,r.user_id,u.username,u.display_name,r.created_at,r.expires_at
     FROM password_recovery_requests r
     JOIN users u ON u.id=r.user_id
     WHERE r.status='pending' AND r.expires_at>now() AND u.status='active'
     ORDER BY r.created_at ASC
     LIMIT $1`,[Math.min(Math.max(limit,1),200)]
  );
  return result.rows.map(row=>({
    requestId:row.public_id,userId:row.user_id,username:row.username,
    displayName:row.display_name,createdAt:row.created_at,expiresAt:row.expires_at
  }));
}

export async function approveRecoveryRequest(actorUserId:string,publicId:string){
  const rawCode=randomBytes(18).toString('base64url');
  const hash=tokenHash(rawCode);
  const expiresAt=new Date(Date.now()+APPROVED_TTL_MS);
  const result=await query<{public_id:string;user_id:string;username:string}>(
    `UPDATE password_recovery_requests r
     SET status='approved',token_hash=$3,approved_by=$1,approved_at=now(),
         expires_at=$4,updated_at=now()
     FROM users u
     WHERE r.public_id=$2 AND r.user_id=u.id AND r.status='pending'
       AND r.expires_at>now() AND u.status='active'
     RETURNING r.public_id,r.user_id,u.username`,
    [actorUserId,publicId,hash,expiresAt]
  );
  const row=result.rows[0];
  if(!row)throw new Error('RECOVERY_REQUEST_NOT_FOUND');
  return {requestId:row.public_id,userId:row.user_id,username:row.username,recoveryCode:rawCode,expiresAt};
}

export async function rejectRecoveryRequest(actorUserId:string,publicId:string){
  const result=await query<{public_id:string;user_id:string}>(
    `UPDATE password_recovery_requests
     SET status='rejected',approved_by=$1,updated_at=now()
     WHERE public_id=$2 AND status='pending' AND expires_at>now()
       AND user_id IS NOT NULL
     RETURNING public_id,user_id`,
    [actorUserId,publicId]
  );
  if(!result.rows[0])throw new Error('RECOVERY_REQUEST_NOT_FOUND');
  return {requestId:result.rows[0].public_id,userId:result.rows[0].user_id,rejected:true as const};
}

export async function registerAuthRecoveryRoutes(app:FastifyInstance,options:{basePath:string}){
  const prefix=`${options.basePath}/auth/recovery`;

  app.post<{Body:{login?:string}}>(`${prefix}/request`,async(request,reply)=>{
    const raw=request.body.login?.trim()??'';
    const normalizedUsername=normalizeUsername(raw);
    const normalizedPhone=normalizePhone(raw);
    const subject=normalizedUsername||normalizedPhone||'empty';

    const ipLimit=await consumeRateLimit('auth-recovery-ip',`ip:${request.ip}`,12,60*60);
    if(!ipLimit.allowed)return limited(reply,ipLimit.retryAfterSeconds);
    const idLimit=await consumeRateLimit('auth-recovery-identity',subject,4,60*60);
    if(!idLimit.allowed)return limited(reply,idLimit.retryAfterSeconds);

    const found=await query<{id:string}>(
      `SELECT id FROM users
       WHERE status='active' AND (username_normalized=$1 OR phone_e164=$2)
       LIMIT 1`,[normalizedUsername,normalizedPhone]
    );
    const publicId=randomUUID();
    await query(
      `INSERT INTO password_recovery_requests(id,public_id,user_id,expires_at)
       VALUES($1,$2,$3,$4)`,
      [randomUUID(),publicId,found.rows[0]?.id??null,new Date(Date.now()+REQUEST_TTL_MS)]
    );

    return reply.code(202).send({
      accepted:true,
      requestId:publicId,
      message:'إذا كانت البيانات مرتبطة بحساب صالح، يمكن للدعم متابعة طلب الاسترجاع.'
    });
  });

  app.post<{Body:{
    requestId?:string;recoveryCode?:string;newPassword?:string;
    deviceId?:string;platform?:string;
  }}>(`${prefix}/confirm`,async(request,reply)=>{
    const requestId=request.body.requestId?.trim()??'';
    const recoveryCode=request.body.recoveryCode?.trim()??'';
    const newPassword=request.body.newPassword??'';
    const deviceId=request.body.deviceId?.trim().slice(0,128)||undefined;
    const platform=request.body.platform?.trim().slice(0,24)||undefined;

    if(!requestId||!recoveryCode)return reply.code(400).send({error:'INVALID_RECOVERY'});
    if(!validatePassword(newPassword))return reply.code(400).send({error:'WEAK_PASSWORD'});

    const rate=await consumeRateLimit('auth-recovery-confirm',`${request.ip}:${requestId}`,10,15*60);
    if(!rate.allowed)return limited(reply,rate.retryAfterSeconds);

    const passwordHash=await hashPassword(newPassword);
    try{
      const result=await withTransaction(async(client)=>{
        const found=await client.query<RecoveryUser & {request_row_id:string}>(
          `SELECT u.id,u.username,u.display_name,u.phone_e164,u.gender,u.status,u.created_at,
                  r.id AS request_row_id
           FROM password_recovery_requests r
           JOIN users u ON u.id=r.user_id
           WHERE r.public_id=$1 AND r.status='approved' AND r.token_hash=$2
             AND r.expires_at>now() AND u.status='active'
           LIMIT 1 FOR UPDATE OF r,u`,
          [requestId,tokenHash(recoveryCode)]
        );
        const user=found.rows[0];
        if(!user)throw new Error('INVALID_RECOVERY');

        await client.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',[user.id,passwordHash]);
        await client.query(
          'UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1 AND revoked_at IS NULL',
          [user.id]
        );
        await client.query(
          `UPDATE password_recovery_requests
           SET status='used',used_at=now(),token_hash=NULL,updated_at=now()
           WHERE id=$1`,[user.request_row_id]
        );
        await attachDevice(client,user.id,deviceId,platform);
        const session=await createSession(client,user.id,deviceId);
        return {user,session};
      });

      const cookieSession=requestWantsCookieSession(request);
      if(cookieSession)setWebSessionCookie(reply,result.session.token,result.session.expiresAt);
      return reply.send({
        user:userDto(result.user),
        accessToken:cookieSession?null:result.session.token,
        expiresAt:result.session.expiresAt
      });
    }catch(error){
      if(error instanceof Error&&error.message==='INVALID_RECOVERY'){
        clearWebSessionCookie(reply);
        return reply.code(400).send({error:'INVALID_RECOVERY'});
      }
      throw error;
    }
  });
}
