import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { createSessionToken } from './security.js';

export async function attachDevice(
  client:PoolClient,
  userId:string,
  installationId?:string,
  platform?:string
){
  if(!installationId)return;
  await client.query(
    `INSERT INTO user_devices (id,user_id,installation_id,platform)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id,installation_id)
     DO UPDATE SET platform=EXCLUDED.platform,last_seen_at=now()`,
    [randomUUID(),userId,installationId,platform?.slice(0,24)??null]
  );
}

export async function createSession(client:PoolClient,userId:string,deviceId?:string){
  const session=createSessionToken();
  await client.query(
    `INSERT INTO auth_sessions (id,user_id,token_hash,device_id,expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [randomUUID(),userId,session.tokenHash,deviceId??null,session.expiresAt]
  );
  return session;
}
