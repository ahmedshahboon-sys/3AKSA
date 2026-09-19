import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';

function cookiePair(setCookie:string|string[]|undefined){
  const raw=Array.isArray(setCookie)?setCookie[0]:setCookie;
  assert.ok(raw,'missing Set-Cookie');
  return raw.split(';',1)[0]!;
}

test('Phase 10 browser cookie auth, CSRF hardening and native bearer auth',async()=>{
  const app=await buildApp();
  const suffix=randomUUID().replaceAll('-','').slice(0,8);
  const webUser=`p10_web_${suffix}`;
  const androidUser=`p10_android_${suffix}`;
  const phoneSeed=String(parseInt(suffix,16)).padStart(8,'0').slice(-8);
  try{
    const register=await app.inject({
      method:'POST',
      url:'/3aksa/api/auth/register',
      headers:{'x-3aksa-session-mode':'cookie'},
      payload:{
        username:webUser,
        displayName:'Phase 10 Web',
        phone:`+21891${phoneSeed}`,
        gender:'boy',
        password:'StrongPass123!',
        deviceId:`phase10-web-${suffix}`,
        platform:'web'
      }
    });
    assert.equal(register.statusCode,201,register.body);
    assert.equal(register.json<{accessToken:string|null}>().accessToken,null);

    const setCookie=register.headers['set-cookie'];
    const raw=Array.isArray(setCookie)?setCookie[0]:setCookie;
    assert.ok(raw?.includes('HttpOnly'));
    assert.ok(raw?.includes('SameSite=Strict'));
    assert.ok(raw?.includes('Path=/3aksa'));
    const cookie=cookiePair(setCookie);

    const me=await app.inject({
      method:'GET',
      url:'/3aksa/api/auth/me',
      headers:{cookie}
    });
    assert.equal(me.statusCode,200,me.body);
    assert.equal(me.json<{user:{username:string}}>().user.username,webUser);
    assert.equal(me.headers['x-content-type-options'],'nosniff');
    assert.equal(me.headers['x-frame-options'],'DENY');
    assert.match(String(me.headers['content-security-policy']),/default-src 'none'/);

    const csrfMissing=await app.inject({
      method:'POST',
      url:'/3aksa/api/auth/logout',
      headers:{cookie}
    });
    assert.equal(csrfMissing.statusCode,403,csrfMissing.body);
    assert.equal(csrfMissing.json<{error:string}>().error,'CSRF_ORIGIN_REJECTED');

    const csrfBad=await app.inject({
      method:'POST',
      url:'/3aksa/api/auth/logout',
      headers:{cookie,origin:'https://evil.example'}
    });
    assert.equal(csrfBad.statusCode,403,csrfBad.body);

    const logout=await app.inject({
      method:'POST',
      url:'/3aksa/api/auth/logout',
      headers:{cookie,origin:'http://localhost:5173'}
    });
    assert.equal(logout.statusCode,204,logout.body);
    const cleared=logout.headers['set-cookie'];
    const clearedRaw=Array.isArray(cleared)?cleared[0]:cleared;
    assert.ok(clearedRaw?.includes('Max-Age=0'));

    const expired=await app.inject({
      method:'GET',
      url:'/3aksa/api/auth/me',
      headers:{cookie}
    });
    assert.equal(expired.statusCode,401,expired.body);

    const androidRegister=await app.inject({
      method:'POST',
      url:'/3aksa/api/auth/register',
      payload:{
        username:androidUser,
        displayName:'Phase 10 Android',
        phone:`+21892${phoneSeed}`,
        gender:'boy',
        password:'StrongPass123!',
        deviceId:`android:${suffix.repeat(8).slice(0,64)}`,
        platform:'android'
      }
    });
    assert.equal(androidRegister.statusCode,201,androidRegister.body);
    const token=androidRegister.json<{accessToken:string|null}>().accessToken;
    assert.ok(token);

    const androidLogout=await app.inject({
      method:'POST',
      url:'/3aksa/api/auth/logout',
      headers:{authorization:`Bearer ${token}`}
    });
    assert.equal(androidLogout.statusCode,204,androidLogout.body);
  }finally{
    await query('DELETE FROM users WHERE username=ANY($1::text[])',[[webUser,androidUser]]).catch(()=>undefined);
    await app.close();
  }
});
