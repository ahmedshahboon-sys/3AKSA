import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';
import { usernameReservationKey } from '../src/modules/auth/security.js';

type Session={accessToken:string;user:{id:string;username:string}};

function auth(token:string){return {authorization:`Bearer ${token}`};}

async function register(
  app:Awaited<ReturnType<typeof buildApp>>,
  input:{username:string;phone:string;gender:'boy'|'girl';deviceId:string;platform:string}
){
  const response=await app.inject({
    method:'POST',
    url:'/3aksa/api/auth/register',
    payload:{
      username:input.username,
      displayName:input.username,
      phone:input.phone,
      gender:input.gender,
      password:'StrongPass123!',
      deviceId:input.deviceId,
      platform:input.platform
    }
  });
  assert.equal(response.statusCode,201,response.body);
  return response.json<Session>();
}

async function setNearby(
  app:Awaited<ReturnType<typeof buildApp>>,
  token:string,
  latitude:number,
  longitude:number
){
  const enabled=await app.inject({
    method:'PATCH',url:'/3aksa/api/profile/me',headers:auth(token),payload:{nearbyEnabled:true}
  });
  assert.equal(enabled.statusCode,200,enabled.body);
  const location=await app.inject({
    method:'PUT',url:'/3aksa/api/nearby/location',headers:auth(token),
    payload:{latitude,longitude,accuracyM:20}
  });
  assert.equal(location.statusCode,200,location.body);
}

test('Phase 9 final acceptance: cross-platform auth, block privacy, temporary room bans and security gates',async()=>{
  const app=await buildApp();
  const suffix=randomUUID().replaceAll('-','').slice(0,8);
  const webUser=`qa_web_${suffix}`;
  const peerUser=`qa_peer_${suffix}`;
  const ownerUser=`qa_owner_${suffix}`;
  const girlUser=`qa_girl_${suffix}`;
  const reservedUser=`qa_reserved_${suffix}`;
  const blockedUser=`qa_blocked_${suffix}`;
  const blockedDevice=`qa-blocked-device-${suffix}`;

  try{
    const web=await register(app,{
      username:webUser,phone:`+2189100${suffix.slice(0,6)}`,gender:'boy',
      deviceId:`qa-web-${suffix}`,platform:'web'
    });

    const androidLogin=await app.inject({
      method:'POST',url:'/3aksa/api/auth/login',
      payload:{
        login:webUser,password:'StrongPass123!',
        deviceId:`qa-android-${suffix}`,platform:'android'
      }
    });
    assert.equal(androidLogin.statusCode,200,androidLogin.body);
    const android=androidLogin.json<Session>();
    assert.equal(android.user.id,web.user.id);

    const webMe=await app.inject({method:'GET',url:'/3aksa/api/auth/me',headers:auth(web.accessToken)});
    const androidMe=await app.inject({method:'GET',url:'/3aksa/api/auth/me',headers:auth(android.accessToken)});
    assert.equal(webMe.statusCode,200,webMe.body);
    assert.equal(androidMe.statusCode,200,androidMe.body);
    assert.equal(webMe.json<{user:{id:string}}>().user.id,androidMe.json<{user:{id:string}}>().user.id);

    const nonAdmin=await app.inject({method:'GET',url:'/3aksa/api/admin/me',headers:auth(web.accessToken)});
    assert.equal(nonAdmin.statusCode,403,nonAdmin.body);

    const peer=await register(app,{
      username:peerUser,phone:`+2189200${suffix.slice(0,6)}`,gender:'boy',
      deviceId:`qa-peer-${suffix}`,platform:'android'
    });
    const owner=await register(app,{
      username:ownerUser,phone:`+2189300${suffix.slice(0,6)}`,gender:'boy',
      deviceId:`qa-owner-${suffix}`,platform:'web'
    });
    const girl=await register(app,{
      username:girlUser,phone:`+2189400${suffix.slice(0,6)}`,gender:'girl',
      deviceId:`qa-girl-${suffix}`,platform:'android'
    });

    await setNearby(app,web.accessToken,32.8872,13.1913);
    await setNearby(app,peer.accessToken,32.8880,13.1920);

    const beforeBlock=await app.inject({
      method:'GET',url:'/3aksa/api/nearby?maxDistanceKm=10',headers:auth(web.accessToken)
    });
    assert.equal(beforeBlock.statusCode,200,beforeBlock.body);
    assert.ok(beforeBlock.json<{nearby:Array<{username:string}>}>().nearby.some((person)=>person.username===peerUser));

    const block=await app.inject({
      method:'POST',url:'/3aksa/api/blocks',headers:auth(web.accessToken),payload:{username:peerUser}
    });
    assert.equal(block.statusCode,201,block.body);

    const afterBlockWeb=await app.inject({
      method:'GET',url:'/3aksa/api/nearby?maxDistanceKm=10',headers:auth(web.accessToken)
    });
    const afterBlockPeer=await app.inject({
      method:'GET',url:'/3aksa/api/nearby?maxDistanceKm=10',headers:auth(peer.accessToken)
    });
    assert.ok(!afterBlockWeb.json<{nearby:Array<{username:string}>}>().nearby.some((person)=>person.username===peerUser));
    assert.ok(!afterBlockPeer.json<{nearby:Array<{username:string}>}>().nearby.some((person)=>person.username===webUser));

    const room=await app.inject({
      method:'POST',url:'/3aksa/api/rooms',headers:auth(owner.accessToken),
      payload:{name:`QA temp ban ${suffix}`,genderPolicy:'everyone',maxUsers:10}
    });
    assert.equal(room.statusCode,201,room.body);
    const roomId=room.json<{room:{id:string}}>().room.id;

    const expiresAt=new Date(Date.now()+60_000).toISOString();
    const ban=await app.inject({
      method:'POST',url:`/3aksa/api/rooms/${roomId}/bans`,headers:auth(owner.accessToken),
      payload:{username:peerUser,reason:'Phase 9 temporary ban',expiresAt}
    });
    assert.equal(ban.statusCode,201,ban.body);

    const bannedJoin=await app.inject({
      method:'POST',url:`/3aksa/api/rooms/${roomId}/join-check`,headers:auth(peer.accessToken)
    });
    assert.equal(bannedJoin.statusCode,403,bannedJoin.body);
    assert.equal(bannedJoin.json<{error:string}>().error,'ROOM_BANNED');

    await query(
      "UPDATE room_bans SET expires_at=now()-interval '1 second' WHERE room_id=$1 AND user_id=$2",
      [roomId,peer.user.id]
    );
    const afterExpiry=await app.inject({
      method:'POST',url:`/3aksa/api/rooms/${roomId}/join-check`,headers:auth(peer.accessToken)
    });
    assert.equal(afterExpiry.statusCode,200,afterExpiry.body);

    const girlsRoom=await app.inject({
      method:'POST',url:'/3aksa/api/rooms',headers:auth(owner.accessToken),
      payload:{name:`QA girls room ${suffix}`,genderPolicy:'girls',maxUsers:10}
    });
    assert.equal(girlsRoom.statusCode,201,girlsRoom.body);
    const girlsRoomId=girlsRoom.json<{room:{id:string}}>().room.id;

    const boyDenied=await app.inject({
      method:'POST',url:`/3aksa/api/rooms/${girlsRoomId}/join-check`,headers:auth(peer.accessToken)
    });
    assert.equal(boyDenied.statusCode,403,boyDenied.body);
    assert.equal(boyDenied.json<{error:string}>().error,'ROOM_GIRLS_ONLY');

    const girlAllowed=await app.inject({
      method:'POST',url:`/3aksa/api/rooms/${girlsRoomId}/join-check`,headers:auth(girl.accessToken)
    });
    assert.equal(girlAllowed.statusCode,200,girlAllowed.body);

    await query(
      'INSERT INTO reserved_usernames(username_key,reason) VALUES($1,$2) ON CONFLICT(username_key) DO UPDATE SET reason=EXCLUDED.reason',
      [usernameReservationKey(reservedUser),'phase9 acceptance']
    );
    const reservedAttempt=await app.inject({
      method:'POST',url:'/3aksa/api/auth/register',
      payload:{
        username:reservedUser,displayName:'Reserved QA',phone:`+2189500${suffix.slice(0,6)}`,
        gender:'boy',password:'StrongPass123!',deviceId:`qa-reserved-${suffix}`,platform:'android'
      }
    });
    assert.equal(reservedAttempt.statusCode,409,reservedAttempt.body);
    assert.equal(reservedAttempt.json<{error:string}>().error,'USERNAME_RESERVED');

    await query(
      'INSERT INTO blocked_installations(installation_id,reason) VALUES($1,$2) ON CONFLICT(installation_id) DO NOTHING',
      [blockedDevice,'phase9 acceptance']
    );
    const blockedAttempt=await app.inject({
      method:'POST',url:'/3aksa/api/auth/register',
      payload:{
        username:blockedUser,displayName:'Blocked device QA',phone:`+2189600${suffix.slice(0,6)}`,
        gender:'boy',password:'StrongPass123!',deviceId:blockedDevice,platform:'android'
      }
    });
    assert.equal(blockedAttempt.statusCode,403,blockedAttempt.body);
    assert.equal(blockedAttempt.json<{error:string}>().error,'DEVICE_BLOCKED');
  }finally{
    await query('DELETE FROM reserved_usernames WHERE reason=$1',['phase9 acceptance']).catch(()=>undefined);
    await query('DELETE FROM blocked_installations WHERE reason=$1',['phase9 acceptance']).catch(()=>undefined);
    await query(
      "DELETE FROM users WHERE username LIKE $1",
      [`qa_%_${suffix}`]
    ).catch(()=>undefined);
    await app.close();
  }
});
