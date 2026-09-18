import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';
import { env } from '../src/config.js';
import { getRedis } from '../src/redis.js';
import { prayerEvents } from '../src/modules/prayer/events.js';
import { dateInTimeZone } from '../src/modules/prayer/service.js';
import { runPrayerSchedulerTick } from '../src/modules/prayer/scheduler.js';

const admin={username:'prayer_admin_ci',phone:'+218912345811',displayName:'مدير الصلاة'};
const user={username:'prayer_user_ci',phone:'+218912345812',displayName:'مستخدم الصلاة'};
const usernames=[admin.username,user.username];

async function cleanup(){
  const found=await query<{id:string}>(
    'SELECT id FROM users WHERE username_normalized=ANY($1::text[])',
    [usernames]
  );
  const ids=found.rows.map((row)=>row.id);
  if(ids.length===0)return;
  await query('DELETE FROM prayer_admin_actions WHERE actor_user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM user_prayer_preferences WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM staff_roles WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM user_devices WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
  await query(
    `UPDATE prayer_settings SET
       fajr_offset_minutes=0,sunrise_offset_minutes=0,dhuhr_offset_minutes=0,
       asr_offset_minutes=0,sunset_offset_minutes=0,maghrib_offset_minutes=0,
       isha_offset_minutes=0,revision=1,updated_by=NULL,updated_at=now()
     WHERE singleton=true`
  );
  await query('DELETE FROM prayer_schedule_cache');
}

async function register(app:Awaited<ReturnType<typeof buildApp>>,info:typeof admin){
  const response=await app.inject({
    method:'POST',
    url:'/3aksa/api/auth/register',
    payload:{
      username:info.username,
      displayName:info.displayName,
      phone:info.phone,
      gender:'boy',
      password:'StrongPass123!',
      deviceId:`ci-${info.username}`,
      platform:'ci'
    }
  });
  assert.equal(response.statusCode,201,response.body);
  return response.json<{accessToken:string;user:{id:string}}>();
}
function auth(token:string){return{authorization:`Bearer ${token}`};}

test('prayer schedules preferences offsets and scheduler are private cached and deduplicated',async()=>{
  await cleanup();
  const app=await buildApp();
  try{
    const adminSession=await register(app,admin);
    const userSession=await register(app,user);
    await query(
      "INSERT INTO staff_roles (user_id,role,granted_by) VALUES ($1,'super_admin',$1)",
      [adminSession.user.id]
    );

    const refs=await app.inject({
      method:'GET',url:'/3aksa/api/prayer/references',headers:auth(userSession.accessToken)
    });
    assert.equal(refs.statusCode,200,refs.body);
    assert.ok(refs.json<{references:Array<{key:string}>}>().references.some((item)=>item.key==='tripoli'));

    const resolved=await app.inject({
      method:'POST',
      url:'/3aksa/api/prayer/reference/resolve',
      headers:auth(userSession.accessToken),
      payload:{latitude:32.89,longitude:13.19}
    });
    assert.equal(resolved.statusCode,200,resolved.body);
    assert.equal(resolved.json<{resolved:{reference:{key:string}}}>().resolved.reference.key,'tripoli');

    const prefs=await app.inject({
      method:'PATCH',
      url:'/3aksa/api/prayer/preferences',
      headers:auth(userSession.accessToken),
      payload:{prayerAlertsEnabled:true,prayerSoundEnabled:true,gentleRemindersEnabled:false}
    });
    assert.equal(prefs.statusCode,200,prefs.body);
    const prefBody=prefs.json<{preferences:{referenceKey:string;prayerSoundEnabled:boolean;gentleRemindersEnabled:boolean}}>().preferences;
    assert.equal(prefBody.referenceKey,'tripoli');
    assert.equal(prefBody.prayerSoundEnabled,true);
    assert.equal(prefBody.gentleRemindersEnabled,false);

    const date='2026-09-18';
    const first=await app.inject({
      method:'GET',
      url:`/3aksa/api/prayer/schedule?date=${date}`,
      headers:auth(userSession.accessToken)
    });
    assert.equal(first.statusCode,200,first.body);
    const firstPrayer=first.json<{prayer:{date:string;timezone:string;cached:boolean;settingsRevision:number;schedule:Record<string,{instant:string;localTime:string}>}}>().prayer;
    assert.equal(firstPrayer.date,date);
    assert.equal(firstPrayer.timezone,'Africa/Tripoli');
    assert.equal(firstPrayer.cached,false);
    assert.equal(firstPrayer.settingsRevision,1);
    for(const key of ['fajr','sunrise','dhuhr','asr','sunset','maghrib','isha']){
      assert.match(firstPrayer.schedule[key]!.localTime,/^\d{2}:\d{2}$/);
      assert.ok(Number.isFinite(Date.parse(firstPrayer.schedule[key]!.instant)));
    }

    const second=await app.inject({
      method:'GET',
      url:`/3aksa/api/prayer/schedule?date=${date}`,
      headers:auth(userSession.accessToken)
    });
    assert.equal(second.statusCode,200,second.body);
    assert.equal(second.json<{prayer:{cached:boolean}}>().prayer.cached,true);

    const denied=await app.inject({
      method:'GET',
      url:'/3aksa/api/prayer/admin/settings',
      headers:auth(userSession.accessToken)
    });
    assert.equal(denied.statusCode,403,denied.body);

    const offsets=await app.inject({
      method:'PATCH',
      url:'/3aksa/api/prayer/admin/settings',
      headers:auth(adminSession.accessToken),
      payload:{offsets:{maghrib:2,fajr:-1}}
    });
    assert.equal(offsets.statusCode,200,offsets.body);
    const offsetBody=offsets.json<{settings:{revision:number;offsets:{maghrib:number;fajr:number}}}>().settings;
    assert.equal(offsetBody.revision,2);
    assert.equal(offsetBody.offsets.maghrib,2);
    assert.equal(offsetBody.offsets.fajr,-1);

    const revised=await app.inject({
      method:'GET',
      url:`/3aksa/api/prayer/schedule?date=${date}`,
      headers:auth(userSession.accessToken)
    });
    assert.equal(revised.statusCode,200,revised.body);
    const revisedPrayer=revised.json<{prayer:{cached:boolean;settingsRevision:number;schedule:Record<string,{instant:string}>}}>().prayer;
    assert.equal(revisedPrayer.cached,false);
    assert.equal(revisedPrayer.settingsRevision,2);
    assert.equal(
      Date.parse(revisedPrayer.schedule.maghrib!.instant)-Date.parse(revisedPrayer.schedule.sunset!.instant),
      120_000
    );

    const now=new Date();
    const today=dateInTimeZone(now,'Africa/Tripoli');
    const nearNow=new Date(now);
    nearNow.setUTCSeconds(0,0);
    const far=new Date(nearNow.getTime()+60*60_000);
    const forcedSchedule={
      fajr:{instant:nearNow.toISOString(),localTime:'00:00'},
      sunrise:{instant:far.toISOString(),localTime:'00:00'},
      dhuhr:{instant:far.toISOString(),localTime:'00:00'},
      asr:{instant:far.toISOString(),localTime:'00:00'},
      sunset:{instant:far.toISOString(),localTime:'00:00'},
      maghrib:{instant:far.toISOString(),localTime:'00:00'},
      isha:{instant:far.toISOString(),localTime:'00:00'}
    };
    await query(
      `INSERT INTO prayer_schedule_cache(reference_key,prayer_date,settings_revision,schedule)
       VALUES('tripoli',$1,2,$2::jsonb)
       ON CONFLICT(reference_key,prayer_date,settings_revision)
       DO UPDATE SET schedule=EXCLUDED.schedule,generated_at=now()`,
      [today,JSON.stringify(forcedSchedule)]
    );
    const redis=await getRedis();
    await redis.del(`${env.REDIS_KEY_PREFIX}prayer:due:${today}:tripoli:fajr:r2`);

    const events:Array<{userId:string;prayer:string;soundEnabled:boolean}>=[];
    const unsubscribe=prayerEvents.onDue((event)=>events.push(event));
    try{
      const tickNow=new Date(nearNow.getTime()+10_000);
      const one=await runPrayerSchedulerTick(tickNow);
      const two=await runPrayerSchedulerTick(tickNow);
      assert.equal(one.emitted,1);
      assert.equal(two.emitted,0);
      assert.equal(events.length,1);
      assert.equal(events[0]!.userId,userSession.user.id);
      assert.equal(events[0]!.prayer,'fajr');
      assert.equal(events[0]!.soundEnabled,true);
    }finally{
      unsubscribe();
    }
  }finally{
    await cleanup();
    await app.close();
  }
});
