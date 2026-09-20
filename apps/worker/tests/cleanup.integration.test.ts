import { mkdtemp, mkdir, writeFile, access, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { purgeExpiredEphemeralData } from '../src/cleanup.js';

const databaseUrl=process.env.DATABASE_URL?.trim();
if(!databaseUrl)throw new Error('DATABASE_URL is required for worker cleanup tests');

async function exists(filePath:string){
  try{await access(filePath);return true;}catch{return false;}
}

test('expired voice rows are deleted only after local voice files are removed',async()=>{
  const db=new Pool({connectionString:databaseUrl,max:2});
  const storageRoot=await mkdtemp(path.join(os.tmpdir(),'3aksa-worker-'));
  const userA=randomUUID();
  const userB=randomUUID();
  const roomId=randomUUID();
  const conversationId=randomUUID();
  const roomMessageId=randomUUID();
  const privateMessageId=randomUUID();
  const roomKey=`voice/${randomUUID()}.webm`;
  const privateKey=`voice/${randomUUID()}.ogg`;

  const [low,high]=[userA,userB].sort();
  const suffix=randomUUID().replaceAll('-','').slice(0,10);

  try{
    await db.query(
      `INSERT INTO users(
        id,username,username_normalized,display_name,phone_e164,gender,password_hash
      ) VALUES
        ($1,$2,$2,$2,$3,'boy','worker-test'),
        ($4,$5,$5,$5,$6,'girl','worker-test')`,
      [
        userA,`worker_a_${suffix}`,`+21891${suffix.slice(0,7)}1`,
        userB,`worker_b_${suffix}`,`+21892${suffix.slice(0,7)}2`
      ]
    );

    await db.query(
      `INSERT INTO rooms(id,slug,name,owner_id,visibility,gender_policy,max_users)
       VALUES($1,$2,'Worker cleanup room',$3,'public','everyone',10)`,
      [roomId,`worker-${suffix}`,userA]
    );

    await db.query(
      `INSERT INTO private_conversations(
         id,user_low_id,user_high_id,requested_by,status,accepted_at
       ) VALUES($1,$2,$3,$4,'active',now())`,
      [conversationId,low,high,userA]
    );

    await mkdir(path.join(storageRoot,'voice'),{recursive:true});
    await writeFile(path.join(storageRoot,roomKey),Buffer.from([1,2,3,4]));
    await writeFile(path.join(storageRoot,privateKey),Buffer.from([5,6,7,8]));

    await db.query(
      `INSERT INTO room_messages(
         id,room_id,sender_id,message_type,text_content,storage_key,media_mime,
         media_bytes,media_duration_ms,created_at,expires_at
       ) VALUES(
         $1,$2,$3,'voice',NULL,$4,'audio/webm',4,1000,
         now()-interval '25 hours',now()-interval '1 hour'
       )`,
      [roomMessageId,roomId,userA,roomKey]
    );

    await db.query(
      `INSERT INTO private_messages(
         id,conversation_id,sender_id,message_type,text_content,storage_key,media_mime,
         media_bytes,media_duration_ms,created_at,expires_at
       ) VALUES(
         $1,$2,$3,'voice',NULL,$4,'audio/ogg',4,1000,
         now()-interval '25 hours',now()-interval '1 hour'
       )`,
      [privateMessageId,conversationId,userB,privateKey]
    );

    assert.equal(await exists(path.join(storageRoot,roomKey)),true);
    assert.equal(await exists(path.join(storageRoot,privateKey)),true);

    const result=await purgeExpiredEphemeralData({
      db,
      storageDriver:'local',
      storageRoot,
      batchSize:50
    });

    assert.equal(result.roomDeleted,1);
    assert.equal(result.privateDeleted,1);
    assert.equal(await exists(path.join(storageRoot,roomKey)),false);
    assert.equal(await exists(path.join(storageRoot,privateKey)),false);

    const remaining=await db.query<{count:string}>(
      `SELECT (
        (SELECT count(*) FROM room_messages WHERE id=$1)+
        (SELECT count(*) FROM private_messages WHERE id=$2)
       )::text AS count`,
      [roomMessageId,privateMessageId]
    );
    assert.equal(remaining.rows[0]?.count,'0');
  }finally{
    await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[[userA,userB]]).catch(()=>undefined);
    await db.end();
    await rm(storageRoot,{recursive:true,force:true});
  }
});
