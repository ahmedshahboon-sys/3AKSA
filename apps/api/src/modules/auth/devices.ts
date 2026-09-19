import type { FastifyInstance,FastifyReply } from 'fastify';
import { query } from '../../db.js';
import { hashSessionToken } from './security.js';
import { sessionTokenFromRequest } from './session.js';

function unauthorized(reply:FastifyReply){
  return reply.code(401).send({error:'UNAUTHORIZED'});
}

export async function registerAuthDeviceRoutes(app:FastifyInstance,options:{basePath:string}){
  const prefix=`${options.basePath}/auth`;

  app.get(`${prefix}/devices`,async(request,reply)=>{
    const token=sessionTokenFromRequest(request);
    if(!token)return unauthorized(reply);
    const tokenHash=hashSessionToken(token);
    const current=await query<{user_id:string;device_id:string|null}>(
      `SELECT user_id,device_id FROM auth_sessions
       WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()
       LIMIT 1`,[tokenHash]
    );
    const session=current.rows[0];
    if(!session)return unauthorized(reply);

    const result=await query<{
      installation_id:string;platform:string|null;first_seen_at:Date;last_seen_at:Date;
      active_sessions:string;latest_session_at:Date|null;
    }>(
      `SELECT d.installation_id,d.platform,d.first_seen_at,d.last_seen_at,
              COUNT(s.id) FILTER (WHERE s.revoked_at IS NULL AND s.expires_at>now())::text AS active_sessions,
              MAX(s.last_seen_at) FILTER (WHERE s.revoked_at IS NULL AND s.expires_at>now()) AS latest_session_at
       FROM user_devices d
       LEFT JOIN auth_sessions s
         ON s.user_id=d.user_id AND s.device_id=d.installation_id
       WHERE d.user_id=$1
       GROUP BY d.installation_id,d.platform,d.first_seen_at,d.last_seen_at
       ORDER BY d.last_seen_at DESC,d.installation_id`,
      [session.user_id]
    );

    return reply.send({devices:result.rows.map(row=>({
      installationId:row.installation_id,
      platform:row.platform,
      firstSeenAt:row.first_seen_at,
      lastSeenAt:row.last_seen_at,
      activeSessions:Number(row.active_sessions)||0,
      current:row.installation_id===session.device_id,
      latestSessionAt:row.latest_session_at
    }))});
  });

  app.delete<{Params:{installationId:string}}>(`${prefix}/devices/:installationId/sessions`,async(request,reply)=>{
    const token=sessionTokenFromRequest(request);
    if(!token)return unauthorized(reply);
    const tokenHash=hashSessionToken(token);
    const current=await query<{user_id:string;device_id:string|null}>(
      `SELECT user_id,device_id FROM auth_sessions
       WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()
       LIMIT 1`,[tokenHash]
    );
    const session=current.rows[0];
    if(!session)return unauthorized(reply);
    const installationId=request.params.installationId.slice(0,128);
    if(!installationId)return reply.code(400).send({error:'INVALID_DEVICE'});
    if(session.device_id===installationId){
      return reply.code(409).send({error:'CURRENT_DEVICE'});
    }
    const revoked=await query(
      `UPDATE auth_sessions
       SET revoked_at=COALESCE(revoked_at,now())
       WHERE user_id=$1 AND device_id=$2 AND revoked_at IS NULL`,
      [session.user_id,installationId]
    );
    return reply.send({revoked:revoked.rowCount??0});
  });

  app.post(`${prefix}/sessions/revoke-others`,async(request,reply)=>{
    const token=sessionTokenFromRequest(request);
    if(!token)return unauthorized(reply);
    const tokenHash=hashSessionToken(token);
    const current=await query<{id:string;user_id:string}>(
      `SELECT id,user_id FROM auth_sessions
       WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()
       LIMIT 1`,[tokenHash]
    );
    const session=current.rows[0];
    if(!session)return unauthorized(reply);
    const revoked=await query(
      `UPDATE auth_sessions
       SET revoked_at=COALESCE(revoked_at,now())
       WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL`,
      [session.user_id,session.id]
    );
    return reply.send({revoked:revoked.rowCount??0});
  });
}
