import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { approveRecoveryRequest } from '../src/modules/auth/recovery.js';

test('recovery is non-enumerating, single-use and revokes old sessions; device controls revoke selectively',async()=>{
  const suffix=randomUUID().replaceAll('-','').slice(0,10);
  const username=`g2_${suffix}`;
  const phone=`+21891${String(Date.now()).slice(-7)}`;
  const app=await buildApp();
  try{
    const weak=await app.inject({
      method:'POST',url:'/3aksa/api/auth/register',
      payload:{username:`w_${suffix}`,displayName:'Weak',phone:`+21892${String(Date.now()+1).slice(-7)}`,gender:'boy',password:'abcdefgh'}
    });
    assert.equal(weak.statusCode,400,weak.body);
    assert.equal(weak.json<{error:string}>().error,'WEAK_PASSWORD');

    const registered=await app.inject({
      method:'POST',url:'/3aksa/api/auth/register',
      payload:{
        username,displayName:'Group 2 Recovery',phone,gender:'boy',password:'StrongPass123',
        deviceId:'device-A',platform:'ci'
      }
    });
    assert.equal(registered.statusCode,201,registered.body);
    const first=registered.json<{accessToken:string;user:{id:string}}>();

    const requestReal=await app.inject({
      method:'POST',url:'/3aksa/api/auth/recovery/request',payload:{login:username}
    });
    const requestFake=await app.inject({
      method:'POST',url:'/3aksa/api/auth/recovery/request',payload:{login:`missing_${suffix}`}
    });
    assert.equal(requestReal.statusCode,202,requestReal.body);
    assert.equal(requestFake.statusCode,202,requestFake.body);
    const realBody=requestReal.json<{accepted:boolean;requestId:string;message:string}>();
    const fakeBody=requestFake.json<{accepted:boolean;requestId:string;message:string}>();
    assert.deepEqual(Object.keys(realBody).sort(),Object.keys(fakeBody).sort());
    assert.equal(realBody.accepted,true);
    assert.equal(fakeBody.accepted,true);
    assert.notEqual(realBody.requestId,fakeBody.requestId);

    const approved=await approveRecoveryRequest(first.user.id,realBody.requestId);
    assert.equal(approved.username,username);
    assert.ok(approved.recoveryCode.length>=20);

    const recovered=await app.inject({
      method:'POST',url:'/3aksa/api/auth/recovery/confirm',
      payload:{
        requestId:realBody.requestId,recoveryCode:approved.recoveryCode,newPassword:'NewStrong456',
        deviceId:'device-C',platform:'ci'
      }
    });
    assert.equal(recovered.statusCode,200,recovered.body);
    const recoveredBody=recovered.json<{accessToken:string}>();

    const oldSession=await app.inject({
      method:'GET',url:'/3aksa/api/auth/me',headers:{authorization:`Bearer ${first.accessToken}`}
    });
    assert.equal(oldSession.statusCode,401,oldSession.body);

    const currentSession=await app.inject({
      method:'GET',url:'/3aksa/api/auth/me',headers:{authorization:`Bearer ${recoveredBody.accessToken}`}
    });
    assert.equal(currentSession.statusCode,200,currentSession.body);

    const replay=await app.inject({
      method:'POST',url:'/3aksa/api/auth/recovery/confirm',
      payload:{requestId:realBody.requestId,recoveryCode:approved.recoveryCode,newPassword:'Another789Pass',deviceId:'device-X',platform:'ci'}
    });
    assert.equal(replay.statusCode,400,replay.body);
    assert.equal(replay.json<{error:string}>().error,'INVALID_RECOVERY');

    const secondLogin=await app.inject({
      method:'POST',url:'/3aksa/api/auth/login',
      payload:{login:username,password:'NewStrong456',deviceId:'device-D',platform:'ci'}
    });
    assert.equal(secondLogin.statusCode,200,secondLogin.body);
    const second=secondLogin.json<{accessToken:string}>();

    const devices=await app.inject({
      method:'GET',url:'/3aksa/api/auth/devices',headers:{authorization:`Bearer ${recoveredBody.accessToken}`}
    });
    assert.equal(devices.statusCode,200,devices.body);
    const list=devices.json<{devices:Array<{installationId:string;current:boolean;activeSessions:number}>}>().devices;
    assert.equal(list.find((d)=>d.installationId==='device-C')?.current,true);
    assert.equal(list.find((d)=>d.installationId==='device-D')?.activeSessions,1);

    const revokeDevice=await app.inject({
      method:'DELETE',url:'/3aksa/api/auth/devices/device-D/sessions',
      headers:{authorization:`Bearer ${recoveredBody.accessToken}`}
    });
    assert.equal(revokeDevice.statusCode,200,revokeDevice.body);
    assert.equal(revokeDevice.json<{revoked:number}>().revoked,1);

    const revokedCheck=await app.inject({
      method:'GET',url:'/3aksa/api/auth/me',headers:{authorization:`Bearer ${second.accessToken}`}
    });
    assert.equal(revokedCheck.statusCode,401,revokedCheck.body);

    const thirdLogin=await app.inject({
      method:'POST',url:'/3aksa/api/auth/login',
      payload:{login:username,password:'NewStrong456',deviceId:'device-E',platform:'ci'}
    });
    assert.equal(thirdLogin.statusCode,200,thirdLogin.body);
    const third=thirdLogin.json<{accessToken:string}>();

    const revokeOthers=await app.inject({
      method:'POST',url:'/3aksa/api/auth/sessions/revoke-others',
      headers:{authorization:`Bearer ${recoveredBody.accessToken}`}
    });
    assert.equal(revokeOthers.statusCode,200,revokeOthers.body);
    assert.ok(revokeOthers.json<{revoked:number}>().revoked>=1);

    const thirdRevoked=await app.inject({
      method:'GET',url:'/3aksa/api/auth/me',headers:{authorization:`Bearer ${third.accessToken}`}
    });
    assert.equal(thirdRevoked.statusCode,401,thirdRevoked.body);

    const currentStillValid=await app.inject({
      method:'GET',url:'/3aksa/api/auth/me',headers:{authorization:`Bearer ${recoveredBody.accessToken}`}
    });
    assert.equal(currentStillValid.statusCode,200,currentStillValid.body);
  }finally{
    await app.close();
  }
});
