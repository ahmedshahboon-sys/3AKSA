import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest } from '../auth/session.js';
import { featureEnabled } from '../features/service.js';
import {
  deletePushSubscription,
  getNotificationPreferences,
  listNotifications,
  listPushSubscriptions,
  markAllNotificationsRead,
  markNotificationRead,
  notificationPushConfig,
  registerPushSubscription,
  soundPackContract,
  updateNotificationPreferences
} from './service.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function requireUser(request:FastifyRequest,reply:FastifyReply){
  const user=await authenticateRequest(request);
  if(!user)reply.code(401).send({error:'UNAUTHORIZED'});
  return user;
}
function mapError(error:unknown,reply:FastifyReply){
  const code=error instanceof Error?error.message:'';
  if(code==='PUSH_SUBSCRIPTION_NOT_FOUND'||code==='NOTIFICATION_NOT_FOUND')return reply.code(404).send({error:code});
  if(code==='PUSH_ENDPOINT_IN_USE')return reply.code(409).send({error:code});
  if(code==='DEVICE_NOT_REGISTERED')return reply.code(403).send({error:code});
  if([
    'INVALID_INSTALLATION_ID','INVALID_PUSH_SUBSCRIPTION','INVALID_PUSH_TOKEN',
    'PUSH_ENCRYPTION_KEY_REQUIRED','INVALID_NOTIFICATION'
  ].includes(code))return reply.code(400).send({error:code});
  throw error;
}

type PreferenceBody={
  pushEnabled?:boolean; privateMessages?:boolean; messageRequests?:boolean;
  friendRequests?:boolean; friendAccepts?:boolean; roomAlerts?:boolean;
  walletEvents?:boolean; adminAlerts?:boolean; appUpdates?:boolean;
  messageSounds?:boolean; uiSounds?:boolean; roomSounds?:boolean;
  vibration?:boolean; muteAll?:boolean;
};
type PushBody={
  platform?:'web'|'android'; installationId?:string;
  token?:string;
  subscription?:{endpoint?:string;keys?:{p256dh?:string;auth?:string}};
};

export async function registerNotificationRoutes(app:FastifyInstance,options:{basePath:string}){
  const prefix=`${options.basePath}/notifications`;

  app.get<{Querystring:{limit?:string}}>(prefix,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    return reply.send({notifications:await listNotifications(user.id,Number(request.query.limit??50))});
  });

  app.post<{Params:{id:string}}>(`${prefix}/:id/read`,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    if(!UUID_RE.test(request.params.id))return reply.code(404).send({error:'NOTIFICATION_NOT_FOUND'});
    try{return reply.send({notification:await markNotificationRead(user.id,request.params.id)});}
    catch(error){return mapError(error,reply);}
  });

  app.post(`${prefix}/read-all`,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    return reply.send(await markAllNotificationsRead(user.id));
  });

  app.get(`${prefix}/preferences`,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    return reply.send({preferences:await getNotificationPreferences(user.id)});
  });

  app.patch<{Body:PreferenceBody}>(`${prefix}/preferences`,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    const allowed=[
      'pushEnabled','privateMessages','messageRequests','friendRequests','friendAccepts',
      'roomAlerts','walletEvents','adminAlerts','appUpdates','messageSounds','uiSounds',
      'roomSounds','vibration','muteAll'
    ] as const;
    const patch:Record<string,boolean>={};
    for(const key of allowed){
      const value=request.body[key];
      if(value===undefined)continue;
      if(typeof value!=='boolean')return reply.code(400).send({error:'INVALID_NOTIFICATION_PREFERENCE'});
      patch[key]=value;
    }
    if(Object.keys(patch).length===0)return reply.code(400).send({error:'NO_NOTIFICATION_PREFERENCE_CHANGES'});
    if(patch.pushEnabled===true&&!(await featureEnabled('push').catch(()=>false)))return reply.code(409).send({error:'FEATURE_DISABLED'});
    return reply.send({preferences:await updateNotificationPreferences(user.id,patch)});
  });

  app.get(`${prefix}/sound-pack`,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    return reply.send(soundPackContract());
  });

  app.get(`${prefix}/push/config`,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    if(!(await featureEnabled('push').catch(()=>false)))return reply.send({webPushConfigured:false,androidFcmConfigured:false,webPushVapidPublicKey:null});
    return reply.send(notificationPushConfig());
  });

  app.get(`${prefix}/push/subscriptions`,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    if(!(await featureEnabled('push').catch(()=>false)))return reply.send({subscriptions:[]});
    return reply.send({subscriptions:await listPushSubscriptions(user.id)});
  });

  app.post<{Body:PushBody}>(`${prefix}/push/subscriptions`,async(request,reply)=>{
    if(!(await featureEnabled('push').catch(()=>false)))return reply.code(503).send({error:'FEATURE_DISABLED'});
    const user=await requireUser(request,reply); if(!user)return;
    const installationId=request.body.installationId?.trim()??'';
    try{
      if(request.body.platform==='web'){
        const s=request.body.subscription;
        if(!s?.endpoint||!s.keys?.p256dh||!s.keys.auth)return reply.code(400).send({error:'INVALID_PUSH_SUBSCRIPTION'});
        const subscription=await registerPushSubscription(user.id,{
          platform:'web',installationId,
          subscription:{endpoint:s.endpoint,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}}
        });
        return reply.code(201).send({subscription});
      }
      if(request.body.platform==='android'){
        const subscription=await registerPushSubscription(user.id,{
          platform:'android',installationId,token:request.body.token??''
        });
        return reply.code(201).send({subscription});
      }
      return reply.code(400).send({error:'INVALID_PUSH_PLATFORM'});
    }catch(error){return mapError(error,reply);}
  });

  app.delete<{Params:{id:string}}>(`${prefix}/push/subscriptions/:id`,async(request,reply)=>{
    const user=await requireUser(request,reply); if(!user)return;
    if(!UUID_RE.test(request.params.id))return reply.code(404).send({error:'PUSH_SUBSCRIPTION_NOT_FOUND'});
    try{
      await deletePushSubscription(user.id,request.params.id);
      return reply.code(204).send();
    }catch(error){return mapError(error,reply);}
  });
}
