import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID
} from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { env } from '../../config.js';
import { query, withTransaction } from '../../db.js';
import { authenticateRequest } from '../auth/session.js';
import { verifyPassword } from '../auth/security.js';

export type AdminRole='super_admin'|'tv_admin'|'moderation_admin'|'finance_admin'|'release_admin';
export type AdminContext={
  user:{id:string;username:string;displayName:string};
  roles:AdminRole[];
};

const BASE32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const MFA_PERIOD_SECONDS=30;
const MFA_DIGITS=6;

function mfaEncryptionKey(){
  if(env.NODE_ENV==='production'&&!env.ADMIN_MFA_ENCRYPTION_KEY){
    throw new Error('ADMIN_MFA_ENCRYPTION_KEY_REQUIRED');
  }
  return createHash('sha256')
    .update(env.ADMIN_MFA_ENCRYPTION_KEY??env.SESSION_SECRET)
    .digest();
}

function encryptSecret(value:string){
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',mfaEncryptionKey(),iv);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),encrypted].map((part)=>part.toString('base64url')).join('.');
}

function decryptSecret(value:string){
  const [ivRaw,tagRaw,dataRaw]=value.split('.');
  if(!ivRaw||!tagRaw||!dataRaw)throw new Error('ADMIN_MFA_SECRET_INVALID');
  const decipher=createDecipheriv('aes-256-gcm',mfaEncryptionKey(),Buffer.from(ivRaw,'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw,'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataRaw,'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function base32Encode(buffer:Buffer){
  let bits=0,value=0,out='';
  for(const byte of buffer){
    value=(value<<8)|byte;
    bits+=8;
    while(bits>=5){
      out+=BASE32[(value>>>(bits-5))&31];
      bits-=5;
    }
  }
  if(bits>0)out+=BASE32[(value<<(5-bits))&31];
  return out;
}

function base32Decode(input:string){
  let bits=0,value=0;
  const bytes:number[]=[];
  for(const char of input.toUpperCase().replace(/=+$/,'')){
    const index=BASE32.indexOf(char);
    if(index<0)throw new Error('ADMIN_MFA_SECRET_INVALID');
    value=(value<<5)|index;
    bits+=5;
    if(bits>=8){
      bytes.push((value>>>(bits-8))&255);
      bits-=8;
    }
  }
  return Buffer.from(bytes);
}

export function totpCodeForSecret(secret:string,nowMs=Date.now()){
  const counter=Math.floor(nowMs/1000/MFA_PERIOD_SECONDS);
  const counterBytes=Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest=createHmac('sha1',base32Decode(secret)).update(counterBytes).digest();
  const offset=digest[digest.length-1]!&0x0f;
  const binary=(
    ((digest[offset]!&0x7f)<<24)|
    ((digest[offset+1]!&0xff)<<16)|
    ((digest[offset+2]!&0xff)<<8)|
    (digest[offset+3]!&0xff)
  )>>>0;
  return String(binary%(10**MFA_DIGITS)).padStart(MFA_DIGITS,'0');
}

export function verifyTotpCode(secret:string,code:string,nowMs=Date.now()){
  if(!/^\d{6}$/.test(code))return false;
  for(const offset of [-1,0,1]){
    if(totpCodeForSecret(secret,nowMs+offset*MFA_PERIOD_SECONDS*1000)===code)return true;
  }
  return false;
}

export async function adminContext(request:FastifyRequest,reply:FastifyReply){
  const user=await authenticateRequest(request);
  if(!user){
    reply.code(401).send({error:'UNAUTHORIZED'});
    return null;
  }
  const result=await query<{role:AdminRole}>(
    'SELECT role FROM staff_roles WHERE user_id=$1 ORDER BY role',
    [user.id]
  );
  if(!result.rows.length){
    reply.code(403).send({error:'ADMIN_REQUIRED'});
    return null;
  }
  return {
    user:{id:user.id,username:user.username,displayName:user.display_name},
    roles:result.rows.map((row)=>row.role)
  } satisfies AdminContext;
}

export function hasAdminRole(context:AdminContext,...roles:AdminRole[]){
  return roles.some((role)=>context.roles.includes(role));
}

export function adminMfaHeader(request:FastifyRequest){
  const raw=request.headers['x-admin-mfa-code'];
  return (Array.isArray(raw)?raw[0]:raw)?.trim()??'';
}

export async function adminMfaState(userId:string){
  const result=await query<{enabled_at:Date}>(
    'SELECT enabled_at FROM admin_mfa_credentials WHERE user_id=$1 LIMIT 1',
    [userId]
  );
  return {
    enabled:Boolean(result.rows[0]),
    enabledAt:result.rows[0]?.enabled_at??null
  };
}

export async function verifyAdminMfa(userId:string,code:string){
  const result=await query<{secret_encrypted:string}>(
    'SELECT secret_encrypted FROM admin_mfa_credentials WHERE user_id=$1 LIMIT 1',
    [userId]
  );
  const row=result.rows[0];
  if(!row)throw new Error('ADMIN_MFA_SETUP_REQUIRED');
  if(!verifyTotpCode(decryptSecret(row.secret_encrypted),code)){
    throw new Error('ADMIN_MFA_INVALID');
  }
}

export async function requireAdminMfa(context:AdminContext,request:FastifyRequest,reply:FastifyReply){
  try{
    await verifyAdminMfa(context.user.id,adminMfaHeader(request));
    return true;
  }catch(error){
    const code=error instanceof Error?error.message:'ADMIN_MFA_INVALID';
    if(code==='ADMIN_MFA_SETUP_REQUIRED'){
      reply.code(428).send({error:code});
      return false;
    }
    reply.code(403).send({error:'ADMIN_MFA_INVALID'});
    return false;
  }
}

export async function beginMfaEnrollment(userId:string,password:string){
  const found=await query<{username:string;password_hash:string}>(
    "SELECT username,password_hash FROM users WHERE id=$1 AND status='active' LIMIT 1",
    [userId]
  );
  const user=found.rows[0];
  if(!user||!(await verifyPassword(password,user.password_hash))){
    throw new Error('INVALID_CREDENTIALS');
  }
  const secret=base32Encode(randomBytes(20));
  const expiresAt=new Date(Date.now()+10*60*1000);
  await query(
    `INSERT INTO admin_mfa_pending(user_id,secret_encrypted,expires_at)
     VALUES($1,$2,$3)
     ON CONFLICT(user_id)
     DO UPDATE SET secret_encrypted=EXCLUDED.secret_encrypted,
                   expires_at=EXCLUDED.expires_at,created_at=now()`,
    [userId,encryptSecret(secret),expiresAt]
  );
  const issuer='3AKSA';
  const label=`${issuer}:${user.username}`;
  const otpauth=`otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return {secret,otpauth,expiresAt};
}

export async function confirmMfaEnrollment(userId:string,code:string){
  const found=await query<{secret_encrypted:string;expires_at:Date}>(
    'SELECT secret_encrypted,expires_at FROM admin_mfa_pending WHERE user_id=$1 LIMIT 1',
    [userId]
  );
  const pending=found.rows[0];
  if(!pending||pending.expires_at.getTime()<=Date.now())throw new Error('ADMIN_MFA_SETUP_EXPIRED');
  const secret=decryptSecret(pending.secret_encrypted);
  if(!verifyTotpCode(secret,code))throw new Error('ADMIN_MFA_INVALID');

  await withTransaction(async(client)=>{
    await client.query(
      `INSERT INTO admin_mfa_credentials(user_id,secret_encrypted)
       VALUES($1,$2)
       ON CONFLICT(user_id)
       DO UPDATE SET secret_encrypted=EXCLUDED.secret_encrypted,
                     enabled_at=now(),updated_at=now()`,
      [userId,encryptSecret(secret)]
    );
    await client.query('DELETE FROM admin_mfa_pending WHERE user_id=$1',[userId]);
    await auditAdminAction(client,userId,'admin_mfa_enabled',{});
  });
  return {enabled:true};
}

export async function auditAdminAction(
  client:PoolClient|null,
  actorUserId:string,
  action:string,
  options:{targetUserId?:string|null;reason?:string|null;metadata?:Record<string,unknown>}={}
){
  const id=randomUUID();
  const values=[
    id,
    actorUserId,
    action.slice(0,80),
    options.targetUserId??null,
    options.reason?.trim().slice(0,500)??null,
    JSON.stringify(options.metadata??{})
  ];
  if(client){
    await client.query(
      `INSERT INTO admin_audit_log(id,actor_user_id,action,target_user_id,reason,metadata)
       VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
      values
    );
  }else{
    await query(
      `INSERT INTO admin_audit_log(id,actor_user_id,action,target_user_id,reason,metadata)
       VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
      values
    );
  }
}
