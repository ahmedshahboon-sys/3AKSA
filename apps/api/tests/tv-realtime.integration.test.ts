import test from 'node:test';
import assert from 'node:assert/strict';
import { io as createSocket, type Socket } from 'socket.io-client';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';

const admin={username:'tv_rt_admin_ci',phone:'+218912345795',displayName:'مدير بث مباشر'};
const owner={username:'tv_rt_owner_ci',phone:'+218912345796',displayName:'مسؤول بث مباشر'};
const viewer={username:'tv_rt_viewer_ci',phone:'+218912345797',displayName:'مشاهد بث مباشر'};
const usernames=[admin.username,owner.username,viewer.username];

async function cleanup(){
  const found=await query<{id:string}>(
    'SELECT id FROM users WHERE username_normalized=ANY($1::text[])',
    [usernames]
  );
  const ids=found.rows.map((row)=>row.id);
  if(ids.length===0)return;

  await query('DELETE FROM rooms WHERE owner_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM tv_admin_actions WHERE actor_user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM tv_channels WHERE created_by=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM tv_import_batches WHERE created_by=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM staff_roles WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM user_devices WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
}

async function register(app:Awaited<ReturnType<typeof buildApp>>,user:typeof admin){
  const response=await app.inject({
    method:'POST',
    url:'/3aksa/api/auth/register',
    payload:{
      username:user.username,
      displayName:user.displayName,
      phone:user.phone,
      gender:'boy',
      password:'StrongPass123!',
      deviceId:`ci-${user.username}`,
      platform:'ci'
    }
  });
  assert.equal(response.statusCode,201,response.body);
  return response.json<{accessToken:string;user:{id:string}}>();
}

function auth(token:string){return{authorization:`Bearer ${token}`};}

async function connectSocket(baseUrl:string,accessToken:string){
  const socket=createSocket(baseUrl,{
    path:'/3aksa/socket.io',
    transports:['websocket'],
    reconnection:false,
    forceNew:true,
    auth:{accessToken}
  });
  await new Promise<void>((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('socket connect timeout')),5000);
    socket.once('connect',()=>{clearTimeout(timeout);resolve();});
    socket.once('connect_error',(error)=>{clearTimeout(timeout);reject(error);});
  });
  return socket;
}

function emitAck<T>(socket:Socket,event:string,payload?:unknown):Promise<T>{
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error(`${event} ack timeout`)),5000);
    const callback=(response:T)=>{clearTimeout(timeout);resolve(response);};
    if(payload===undefined)socket.emit(event,callback);
    else socket.emit(event,payload,callback);
  });
}

function onceEvent<T>(socket:Socket,event:string):Promise<T>{
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error(`${event} event timeout`)),5000);
    socket.once(event,(payload:T)=>{clearTimeout(timeout);resolve(payload);});
  });
}

test('room TV changes broadcast in realtime and viewers cannot control playback',async()=>{
  await cleanup();
  const app=await buildApp();
  const sockets:Socket[]=[];
  try{
    const baseUrl=await app.listen({host:'127.0.0.1',port:0});
    const adminSession=await register(app,admin);
    const ownerSession=await register(app,owner);
    const viewerSession=await register(app,viewer);

    await query(
      "INSERT INTO staff_roles (user_id,role,granted_by) VALUES ($1,'tv_admin',$1)",
      [adminSession.user.id]
    );

    const channelResponse=await app.inject({
      method:'POST',
      url:'/3aksa/api/tv/admin/channels',
      headers:auth(adminSession.accessToken),
      payload:{
        name:'قناة مباشرة CI',
        streamUrl:'https://media.example.com/realtime/master.m3u8',
        rightsAttested:true
      }
    });
    assert.equal(channelResponse.statusCode,201,channelResponse.body);
    const channel=channelResponse.json<{channel:{id:string;name:string;streamUrl:string}}>().channel;

    const roomResponse=await app.inject({
      method:'POST',
      url:'/3aksa/api/rooms',
      headers:auth(ownerSession.accessToken),
      payload:{
        name:'غرفة التلفزيون المباشر',
        visibility:'public',
        genderPolicy:'everyone',
        maxUsers:20,
        tvEnabled:false
      }
    });
    assert.equal(roomResponse.statusCode,201,roomResponse.body);
    const roomId=roomResponse.json<{room:{id:string}}>().room.id;

    const ownerSocket=await connectSocket(baseUrl,ownerSession.accessToken);
    const viewerSocket=await connectSocket(baseUrl,viewerSession.accessToken);
    sockets.push(ownerSocket,viewerSocket);

    assert.equal(
      (await emitAck<{ok:boolean}>(ownerSocket,'room:join',{roomId})).ok,
      true
    );
    assert.equal(
      (await emitAck<{ok:boolean}>(viewerSocket,'room:join',{roomId})).ok,
      true
    );

    const enabledEvent=onceEvent<{
      roomId:string;
      tv:{enabled:boolean;channel:{id:string;streamUrl:string}|null};
    }>(viewerSocket,'room:tv-state');

    const ownerEnable=await emitAck<{
      ok:boolean;
      tv:{enabled:boolean;channel:{id:string}|null};
    }>(ownerSocket,'room:tv:set',{
      roomId,
      enabled:true,
      channelId:channel.id
    });
    assert.equal(ownerEnable.ok,true);
    assert.equal(ownerEnable.tv.enabled,true);
    assert.equal(ownerEnable.tv.channel?.id,channel.id);

    const enabledBroadcast=await enabledEvent;
    assert.equal(enabledBroadcast.roomId,roomId);
    assert.equal(enabledBroadcast.tv.enabled,true);
    assert.equal(enabledBroadcast.tv.channel?.id,channel.id);
    assert.equal(enabledBroadcast.tv.channel?.streamUrl,'https://media.example.com/realtime/master.m3u8');

    const viewerDenied=await emitAck<{ok:boolean;error?:string}>(
      viewerSocket,
      'room:tv:set',
      {roomId,enabled:false}
    );
    assert.equal(viewerDenied.ok,false);
    assert.equal(viewerDenied.error,'ROOM_TV_MANAGER_REQUIRED');

    const disabledEvent=onceEvent<{
      roomId:string;
      tv:{enabled:boolean;channel:unknown};
    }>(viewerSocket,'room:tv-state');

    const hidden=await app.inject({
      method:'PATCH',
      url:`/3aksa/api/tv/admin/channels/${channel.id}`,
      headers:auth(adminSession.accessToken),
      payload:{status:'hidden'}
    });
    assert.equal(hidden.statusCode,200,hidden.body);

    const hiddenBroadcast=await disabledEvent;
    assert.equal(hiddenBroadcast.roomId,roomId);
    assert.equal(hiddenBroadcast.tv.enabled,false);
    assert.equal(hiddenBroadcast.tv.channel,null);

    const persisted=await app.inject({
      method:'GET',
      url:`/3aksa/api/rooms/${roomId}/tv`,
      headers:auth(viewerSession.accessToken)
    });
    assert.equal(persisted.statusCode,200,persisted.body);
    assert.equal(persisted.json<{tv:{enabled:boolean;channel:unknown}}>().tv.enabled,false);
    assert.equal(persisted.json<{tv:{enabled:boolean;channel:unknown}}>().tv.channel,null);
  }finally{
    for(const socket of sockets){
      if(socket.connected)socket.disconnect();
    }
    await cleanup();
    await app.close();
  }
});
