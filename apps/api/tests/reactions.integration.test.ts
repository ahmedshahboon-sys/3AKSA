import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';

const author={username:'reaction_author_ci',phone:'+218912345781',displayName:'كاتب التفاعل'};
const viewer={username:'reaction_viewer_ci',phone:'+218912345782',displayName:'صاحب اللايك'};
const usernames=[author.username,viewer.username];

async function cleanup(){
  const users=await query<{id:string}>('SELECT id FROM users WHERE username_normalized=ANY($1::text[])',[usernames]);
  const ids=users.rows.map((r)=>r.id);
  if(ids.length===0)return;
  await query('DELETE FROM rooms WHERE owner_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM private_conversations WHERE user_low_id=ANY($1::uuid[]) OR user_high_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM user_blocks WHERE blocker_id=ANY($1::uuid[]) OR blocked_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM user_devices WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
}

async function register(app:Awaited<ReturnType<typeof buildApp>>,u:typeof author){
  const response=await app.inject({method:'POST',url:'/3aksa/api/auth/register',payload:{
    username:u.username,displayName:u.displayName,phone:u.phone,gender:'boy',
    password:'StrongPass123!',deviceId:`ci-${u.username}`,platform:'ci'
  }});
  assert.equal(response.statusCode,201,response.body);
  return response.json<{accessToken:string;user:{id:string}}>();
}
function auth(token:string){return{authorization:`Bearer ${token}`};}

test('free likes are permission-aware, idempotent and limited to live messages',async()=>{
  await cleanup();
  const app=await buildApp();
  try{
    const a=await register(app,author);
    const v=await register(app,viewer);

    const roomResponse=await app.inject({method:'POST',url:'/3aksa/api/rooms',headers:auth(a.accessToken),payload:{
      name:'غرفة اللايك',genderPolicy:'everyone',visibility:'public',maxUsers:10
    }});
    assert.equal(roomResponse.statusCode,201,roomResponse.body);
    const roomId=roomResponse.json<{room:{id:string}}>().room.id;
    const roomMessageId=randomUUID();
    await query(
      `INSERT INTO room_messages (id,room_id,sender_id,message_type,text_content,expires_at)
       VALUES ($1,$2,$3,'text','رسالة للتفاعل',now()+interval '24 hours')`,
      [roomMessageId,roomId,a.user.id]
    );

    const roomLikePath=`/3aksa/api/rooms/${roomId}/messages/${roomMessageId}/reactions/like`;
    const first=await app.inject({method:'PUT',url:roomLikePath,headers:auth(v.accessToken)});
    assert.equal(first.statusCode,200,first.body);
    assert.deepEqual(first.json<{like:{count:number;reacted:boolean}}>().like,{count:1,reacted:true});
    const duplicate=await app.inject({method:'PUT',url:roomLikePath,headers:auth(v.accessToken)});
    assert.equal(duplicate.statusCode,200,duplicate.body);
    assert.equal(duplicate.json<{like:{count:number}}>().like.count,1);
    const summary=await app.inject({method:'GET',url:roomLikePath,headers:auth(v.accessToken)});
    assert.deepEqual(summary.json<{like:{count:number;reacted:boolean}}>().like,{count:1,reacted:true});
    const unlike=await app.inject({method:'DELETE',url:roomLikePath,headers:auth(v.accessToken)});
    assert.deepEqual(unlike.json<{like:{count:number;reacted:boolean}}>().like,{count:0,reacted:false});

    await query('INSERT INTO user_blocks (blocker_id,blocked_id) VALUES ($1,$2)',[a.user.id,v.user.id]);
    const blocked=await app.inject({method:'PUT',url:roomLikePath,headers:auth(v.accessToken)});
    assert.equal(blocked.statusCode,404,blocked.body);
    await query('DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2',[a.user.id,v.user.id]);

    await query(
      `UPDATE room_messages
       SET created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour'
       WHERE id=$1`,[roomMessageId]
    );
    const expired=await app.inject({method:'PUT',url:roomLikePath,headers:auth(v.accessToken)});
    assert.equal(expired.statusCode,404,expired.body);

    const [low,high]=[a.user.id,v.user.id].sort();
    const conversationId=randomUUID();
    await query(
      `INSERT INTO private_conversations (id,user_low_id,user_high_id,requested_by,status,accepted_at)
       VALUES ($1,$2,$3,$2,'active',now())`,
      [conversationId,low,high]
    );
    const privateMessageId=randomUUID();
    await query(
      `INSERT INTO private_messages (id,conversation_id,sender_id,message_type,text_content,expires_at)
       VALUES ($1,$2,$3,'text','رسالة خاصة للتفاعل',now()+interval '24 hours')`,
      [privateMessageId,conversationId,a.user.id]
    );
    const privatePath=`/3aksa/api/private/conversations/${conversationId}/messages/${privateMessageId}/reactions/like`;
    const privateLike=await app.inject({method:'PUT',url:privatePath,headers:auth(v.accessToken)});
    assert.equal(privateLike.statusCode,200,privateLike.body);
    assert.deepEqual(privateLike.json<{like:{count:number;reacted:boolean}}>().like,{count:1,reacted:true});
    const privateAgain=await app.inject({method:'PUT',url:privatePath,headers:auth(v.accessToken)});
    assert.equal(privateAgain.json<{like:{count:number}}>().like.count,1);
    const privateUnlike=await app.inject({method:'DELETE',url:privatePath,headers:auth(v.accessToken)});
    assert.deepEqual(privateUnlike.json<{like:{count:number;reacted:boolean}}>().like,{count:0,reacted:false});
  }finally{
    await cleanup();
    await app.close();
  }
});
