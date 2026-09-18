import { env } from '../../config.js';
import { query } from '../../db.js';
import { getRedis } from '../../redis.js';
import { prayerEvents, type PrayerName } from './events.js';
import {
  actualPrayerNames,
  dateInTimeZone,
  getPrayerSchedule,
  prayerMessage
} from './service.js';

type ReferenceUsersRow = {
  reference_key: string;
  name_ar: string;
  timezone: string;
};

type UserPreferenceRow = {
  user_id: string;
  prayer_sound_enabled: boolean;
};

const DUE_WINDOW_MS = 45_000;
const LOCK_TTL_SECONDS = 180;

export async function runPrayerSchedulerTick(now = new Date()) {
  const refs = await query<ReferenceUsersRow>(
    `SELECT DISTINCT p.reference_key,r.name_ar,r.timezone
     FROM user_prayer_preferences p
     JOIN prayer_references r ON r.key=p.reference_key AND r.active=true
     JOIN users u ON u.id=p.user_id AND u.status='active'
     WHERE p.prayer_alerts_enabled=true`
  );
  if(refs.rows.length===0) return {checkedReferences:0,emitted:0};

  const redis=await getRedis();
  let emitted=0;

  for(const ref of refs.rows){
    const date=dateInTimeZone(now,ref.timezone);
    const result=await getPrayerSchedule(ref.reference_key,date);

    for(const prayer of actualPrayerNames()){
      const item=result.schedule[prayer];
      const dueAt=new Date(item.instant);
      if(Math.abs(now.getTime()-dueAt.getTime())>DUE_WINDOW_MS) continue;

      const key=`${env.REDIS_KEY_PREFIX}prayer:due:${date}:${ref.reference_key}:${prayer}:r${result.settingsRevision}`;
      const claimed=await redis.set(key,'1',{NX:true,EX:LOCK_TTL_SECONDS});
      if(claimed!=='OK') continue;

      const users=await query<UserPreferenceRow>(
        `SELECT p.user_id,p.prayer_sound_enabled
         FROM user_prayer_preferences p
         JOIN users u ON u.id=p.user_id AND u.status='active'
         WHERE p.reference_key=$1 AND p.prayer_alerts_enabled=true`,
        [ref.reference_key]
      );

      for(const user of users.rows){
        prayerEvents.emitDue({
          userId:user.user_id,
          prayer:prayer as PrayerName,
          referenceKey:ref.reference_key,
          referenceName:ref.name_ar,
          scheduledAt:item.instant,
          message:prayerMessage(prayer as PrayerName),
          soundEnabled:user.prayer_sound_enabled
        });
        emitted+=1;
      }
    }
  }

  return {checkedReferences:refs.rows.length,emitted};
}

export function startPrayerScheduler() {
  let stopped=false;
  let running=false;

  const tick=async()=>{
    if(stopped || running)return;
    running=true;
    try{
      await runPrayerSchedulerTick();
    }catch(error){
      console.error('[prayer-scheduler]',error);
    }finally{
      running=false;
    }
  };

  const timer=setInterval(()=>{void tick();},30_000);
  timer.unref();
  void tick();

  return ()=>{
    stopped=true;
    clearInterval(timer);
  };
}
