import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest } from '../auth/session.js';
import {
  getPrayerAdminSettings,
  getPrayerPreferences,
  getPrayerSchedule,
  listPrayerReferences,
  resolveAndSetPrayerReference,
  updatePrayerAdminSettings,
  updatePrayerPreferences
} from './service.js';

type ScheduleQuery = { reference?: string; date?: string };
type ResolveBody = { latitude?: number; longitude?: number };
type PreferencesBody = {
  referenceKey?: string;
  prayerAlertsEnabled?: boolean;
  prayerSoundEnabled?: boolean;
  gentleRemindersEnabled?: boolean;
};
type AdminOffsetsBody = {
  offsets?: Partial<Record<'fajr'|'sunrise'|'dhuhr'|'asr'|'sunset'|'maghrib'|'isha',number>>;
};

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user=await authenticateRequest(request);
  if(!user) reply.code(401).send({error:'UNAUTHORIZED'});
  return user;
}

function mapPrayerError(error: unknown, reply: FastifyReply) {
  const code=error instanceof Error ? error.message : '';
  if(code==='SUPER_ADMIN_REQUIRED') return reply.code(403).send({error:code});
  if(code==='PRAYER_REFERENCE_NOT_FOUND') return reply.code(404).send({error:code});
  if([
    'INVALID_PRAYER_DATE',
    'INVALID_LATITUDE',
    'INVALID_LONGITUDE',
    'INVALID_PRAYER_OFFSET',
    'NO_PRAYER_SETTINGS_CHANGES'
  ].includes(code)) return reply.code(400).send({error:code});
  throw error;
}

export async function registerPrayerRoutes(app: FastifyInstance, options:{basePath:string}) {
  const prefix=`${options.basePath}/prayer`;

  app.get(`${prefix}/references`,async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user)return;
    return reply.send({references:await listPrayerReferences()});
  });

  app.get<{Querystring:ScheduleQuery}>(`${prefix}/schedule`,async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user)return;
    try{
      const preferences=await getPrayerPreferences(user.id);
      const reference=request.query.reference?.trim() || preferences.referenceKey;
      return reply.send({
        prayer:await getPrayerSchedule(reference,request.query.date?.trim())
      });
    }catch(error){
      return mapPrayerError(error,reply);
    }
  });

  app.get(`${prefix}/preferences`,async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user)return;
    return reply.send({preferences:await getPrayerPreferences(user.id)});
  });

  app.patch<{Body:PreferencesBody}>(`${prefix}/preferences`,async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user)return;

    const patch:PreferencesBody={};
    if(request.body.referenceKey!==undefined) patch.referenceKey=request.body.referenceKey.trim();
    if(request.body.prayerAlertsEnabled!==undefined){
      if(typeof request.body.prayerAlertsEnabled!=='boolean') return reply.code(400).send({error:'INVALID_PRAYER_PREFERENCE'});
      patch.prayerAlertsEnabled=request.body.prayerAlertsEnabled;
    }
    if(request.body.prayerSoundEnabled!==undefined){
      if(typeof request.body.prayerSoundEnabled!=='boolean') return reply.code(400).send({error:'INVALID_PRAYER_PREFERENCE'});
      patch.prayerSoundEnabled=request.body.prayerSoundEnabled;
    }
    if(request.body.gentleRemindersEnabled!==undefined){
      if(typeof request.body.gentleRemindersEnabled!=='boolean') return reply.code(400).send({error:'INVALID_PRAYER_PREFERENCE'});
      patch.gentleRemindersEnabled=request.body.gentleRemindersEnabled;
    }
    if(Object.keys(patch).length===0) return reply.code(400).send({error:'NO_PRAYER_PREFERENCE_CHANGES'});

    try{
      return reply.send({preferences:await updatePrayerPreferences(user.id,patch)});
    }catch(error){
      return mapPrayerError(error,reply);
    }
  });

  app.post<{Body:ResolveBody}>(`${prefix}/reference/resolve`,async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user)return;
    try{
      return reply.send({
        resolved:await resolveAndSetPrayerReference(
          user.id,
          Number(request.body.latitude),
          Number(request.body.longitude)
        )
      });
    }catch(error){
      return mapPrayerError(error,reply);
    }
  });

  app.get(`${prefix}/admin/settings`,async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user)return;
    try{
      return reply.send({settings:await getPrayerAdminSettings(user.id)});
    }catch(error){
      return mapPrayerError(error,reply);
    }
  });

  app.patch<{Body:AdminOffsetsBody}>(`${prefix}/admin/settings`,async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user)return;
    const offsets=request.body.offsets;
    if(!offsets || typeof offsets!=='object' || Array.isArray(offsets)){
      return reply.code(400).send({error:'INVALID_PRAYER_OFFSETS'});
    }
    try{
      return reply.send({settings:await updatePrayerAdminSettings(user.id,offsets)});
    }catch(error){
      return mapPrayerError(error,reply);
    }
  });
}
