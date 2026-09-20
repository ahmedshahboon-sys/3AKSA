import { randomUUID } from 'node:crypto';
import { env } from '../../config.js';
import { query } from '../../db.js';
import { getRedis } from '../../redis.js';
import { decryptPushPayload, encryptPushPayload, pushEndpointHash } from './crypto.js';
import { notificationEvents } from './events.js';
import {
  pushProviderStatus,
  sendAndroidPush,
  sendWebPush,
  type AndroidPushPayload,
  type PushMessage,
  type WebPushPayload
} from './providers.js';

type NotificationRow={
  id:string; user_id:string; type:string; title:string; body:string;
  data:Record<string,unknown>; sound_key:string|null; read_at:Date|null;
  created_at:Date; expires_at:Date;
};
type PreferenceRow={
  user_id:string; push_enabled:boolean; private_messages:boolean; message_requests:boolean;
  friend_requests:boolean; friend_accepts:boolean; room_alerts:boolean; wallet_events:boolean;
  admin_alerts:boolean; app_updates:boolean; message_sounds:boolean; ui_sounds:boolean;
  room_sounds:boolean; vibration_enabled:boolean; mute_all:boolean; updated_at:Date;
};
type SubscriptionRow={
  id:string; user_id:string; installation_id:string; platform:'web'|'android';
  endpoint_hash:string; encrypted_payload:string; enabled:boolean; last_error:string|null;
  last_success_at:Date|null; created_at:Date; updated_at:Date;
};

export const SOUND_PACK={
  message_sent:{group:'messages',haptic:'light'},
  message_received:{group:'messages',haptic:'light'},
  friend_request:{group:'interface',haptic:'light'},
  friend_accepted:{group:'interface',haptic:'light'},
  room_join:{group:'rooms',haptic:'light'},
  room_leave:{group:'rooms',haptic:'none'},
  purchase_success:{group:'interface',haptic:'success'},
  wallet_topup:{group:'interface',haptic:'success'},
  wallet_transfer:{group:'interface',haptic:'success'},
  gift_received:{group:'interface',haptic:'success'},
  admin_alert:{group:'interface',haptic:'warning'},
  prayer_alert:{group:'interface',haptic:'light'},
  button_important:{group:'interface',haptic:'light'}
} as const;

function dto(row:NotificationRow){
  return {
    id:row.id,type:row.type,title:row.title,body:row.body,data:row.data,
    soundKey:row.sound_key,readAt:row.read_at,createdAt:row.created_at,expiresAt:row.expires_at
  };
}

async function ensurePreferences(userId:string){
  const result=await query<PreferenceRow>(
    `INSERT INTO user_notification_preferences(user_id) VALUES($1)
     ON CONFLICT(user_id) DO UPDATE SET user_id=EXCLUDED.user_id
     RETURNING *`,[userId]
  );
  return result.rows[0]!;
}

function preferenceDto(row:PreferenceRow){
  return {
    pushEnabled:row.push_enabled,
    categories:{
      privateMessages:row.private_messages,
      messageRequests:row.message_requests,
      friendRequests:row.friend_requests,
      friendAccepts:row.friend_accepts,
      roomAlerts:row.room_alerts,
      walletEvents:row.wallet_events,
      adminAlerts:row.admin_alerts,
      appUpdates:row.app_updates
    },
    sounds:{
      messages:row.message_sounds,
      interface:row.ui_sounds,
      rooms:row.room_sounds,
      vibration:row.vibration_enabled,
      muteAll:row.mute_all
    },
    updatedAt:row.updated_at
  };
}

function categoryEnabled(row:PreferenceRow,type:string){
  if(!row.push_enabled)return false;
  if(type==='private_message')return row.private_messages;
  if(type==='message_request')return row.message_requests;
  if(type==='friend_request')return row.friend_requests;
  if(type==='friend_accepted')return row.friend_accepts;
  if(type==='room_alert')return row.room_alerts;
  if(['wallet_topup','wallet_transfer','purchase','gift_received'].includes(type))return row.wallet_events;
  if(type==='admin_alert')return row.admin_alerts;
  if(type==='app_update')return row.app_updates;
  return true;
}

export async function getNotificationPreferences(userId:string){
  return preferenceDto(await ensurePreferences(userId));
}

export async function updateNotificationPreferences(userId:string,patch:{
  pushEnabled?:boolean|undefined;
  privateMessages?:boolean|undefined; messageRequests?:boolean|undefined;
  friendRequests?:boolean|undefined; friendAccepts?:boolean|undefined;
  roomAlerts?:boolean|undefined; walletEvents?:boolean|undefined;
  adminAlerts?:boolean|undefined; appUpdates?:boolean|undefined;
  messageSounds?:boolean|undefined; uiSounds?:boolean|undefined;
  roomSounds?:boolean|undefined; vibration?:boolean|undefined; muteAll?:boolean|undefined;
}){
  const current=await ensurePreferences(userId);
  const result=await query<PreferenceRow>(
    `UPDATE user_notification_preferences SET
       push_enabled=$2,private_messages=$3,message_requests=$4,friend_requests=$5,
       friend_accepts=$6,room_alerts=$7,wallet_events=$8,admin_alerts=$9,app_updates=$10,
       message_sounds=$11,ui_sounds=$12,room_sounds=$13,vibration_enabled=$14,mute_all=$15,
       updated_at=now()
     WHERE user_id=$1 RETURNING *`,
    [userId,
      patch.pushEnabled??current.push_enabled,
      patch.privateMessages??current.private_messages,
      patch.messageRequests??current.message_requests,
      patch.friendRequests??current.friend_requests,
      patch.friendAccepts??current.friend_accepts,
      patch.roomAlerts??current.room_alerts,
      patch.walletEvents??current.wallet_events,
      patch.adminAlerts??current.admin_alerts,
      patch.appUpdates??current.app_updates,
      patch.messageSounds??current.message_sounds,
      patch.uiSounds??current.ui_sounds,
      patch.roomSounds??current.room_sounds,
      patch.vibration??current.vibration_enabled,
      patch.muteAll??current.mute_all]
  );
  return preferenceDto(result.rows[0]!);
}

export function soundPackContract(){
  return {version:1,sounds:SOUND_PACK};
}

async function assertInstallation(userId:string,installationId:string){
  const result=await query(
    `SELECT 1 FROM user_devices
     WHERE user_id=$1 AND installation_id=$2 AND blocked_at IS NULL LIMIT 1`,
    [userId,installationId]
  );
  if((result.rowCount??0)===0)throw new Error('DEVICE_NOT_REGISTERED');
}

export async function registerPushSubscription(userId:string,input:
  |{platform:'web';installationId:string;subscription:WebPushPayload}
  |{platform:'android';installationId:string;token:string}
){
  const installationId=input.installationId.trim();
  if(!installationId || installationId.length>128)throw new Error('INVALID_INSTALLATION_ID');
  await assertInstallation(userId,installationId);

  let endpoint:string;
  let payload:WebPushPayload|AndroidPushPayload;
  if(input.platform==='web'){
    const webEndpoint=input.subscription.endpoint;
    const keys=input.subscription.keys;
    if(!webEndpoint || webEndpoint.length>4096 || !webEndpoint.startsWith('https://'))throw new Error('INVALID_PUSH_SUBSCRIPTION');
    if(!keys?.p256dh || !keys.auth || keys.p256dh.length>1024 || keys.auth.length>512)throw new Error('INVALID_PUSH_SUBSCRIPTION');
    payload={endpoint:webEndpoint,keys:{p256dh:keys.p256dh,auth:keys.auth}};
    endpoint=webEndpoint;
  }else{
    const token=input.token.trim();
    if(token.length<20 || token.length>4096)throw new Error('INVALID_PUSH_TOKEN');
    endpoint=token;
    payload={token};
  }
  const hash=pushEndpointHash(endpoint);
  const encrypted=encryptPushPayload(payload);
  try{
    const result=await query<SubscriptionRow>(
      `INSERT INTO push_subscriptions(
         id,user_id,installation_id,platform,endpoint_hash,encrypted_payload
       ) VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(user_id,installation_id,platform)
       DO UPDATE SET endpoint_hash=EXCLUDED.endpoint_hash,encrypted_payload=EXCLUDED.encrypted_payload,
                     enabled=true,last_error=NULL,updated_at=now()
       RETURNING *`,
      [randomUUID(),userId,installationId,input.platform,hash,encrypted]
    );
    const row=result.rows[0]!;
    return {id:row.id,platform:row.platform,installationId:row.installation_id,enabled:row.enabled,updatedAt:row.updated_at};
  }catch(error){
    if((error as {code?:string}).code==='23505')throw new Error('PUSH_ENDPOINT_IN_USE');
    throw error;
  }
}

export async function listPushSubscriptions(userId:string){
  const result=await query<SubscriptionRow>(
    `SELECT * FROM push_subscriptions WHERE user_id=$1 ORDER BY updated_at DESC`,[userId]
  );
  return result.rows.map((row)=>({
    id:row.id,platform:row.platform,installationId:row.installation_id,enabled:row.enabled,
    lastError:row.last_error,lastSuccessAt:row.last_success_at,updatedAt:row.updated_at
  }));
}

export async function deletePushSubscription(userId:string,id:string){
  const result=await query('DELETE FROM push_subscriptions WHERE id=$1 AND user_id=$2',[id,userId]);
  if((result.rowCount??0)===0)throw new Error('PUSH_SUBSCRIPTION_NOT_FOUND');
}

export async function listNotifications(userId:string,limit=50){
  const safe=Math.min(Math.max(Math.trunc(limit)||50,1),100);
  const result=await query<NotificationRow>(
    `SELECT * FROM notifications
     WHERE user_id=$1 AND expires_at>now()
     ORDER BY created_at DESC,id DESC LIMIT $2`,[userId,safe]
  );
  return result.rows.map(dto);
}

export async function markNotificationRead(userId:string,id:string){
  const result=await query<NotificationRow>(
    `UPDATE notifications SET read_at=COALESCE(read_at,now())
     WHERE id=$1 AND user_id=$2 AND expires_at>now()
     RETURNING *`,[id,userId]
  );
  if(!result.rows[0])throw new Error('NOTIFICATION_NOT_FOUND');
  return dto(result.rows[0]);
}

export async function markAllNotificationsRead(userId:string){
  const result=await query(
    `UPDATE notifications SET read_at=COALESCE(read_at,now())
     WHERE user_id=$1 AND read_at IS NULL AND expires_at>now()`,[userId]
  );
  return {updated:result.rowCount??0};
}

export async function createNotification(input:{
  userId:string;type:string;title:string;body:string;
  data?:Record<string,unknown>|undefined;soundKey?:keyof typeof SOUND_PACK|null|undefined;
  push?:boolean|undefined;emitRealtime?:boolean|undefined;
}){
  const title=input.title.trim().slice(0,120);
  const body=input.body.trim().slice(0,500);
  if(!title || !body)throw new Error('INVALID_NOTIFICATION');
  const id=randomUUID();
  const result=await query<NotificationRow>(
    `INSERT INTO notifications(id,user_id,type,title,body,data,sound_key)
     SELECT $1,u.id,$2,$3,$4,$5::jsonb,$6
     FROM users u WHERE u.id=$7 AND u.status='active'
     RETURNING *`,
    [id,input.type.slice(0,40),title,body,JSON.stringify(input.data??{}),input.soundKey??null,input.userId]
  );
  const row=result.rows[0];
  if(!row)return null;

  const prefs=await ensurePreferences(input.userId);
  if(input.push!==false && categoryEnabled(prefs,input.type)){
    await query(
      `INSERT INTO notification_deliveries(notification_id,subscription_id,status)
       SELECT $1,id,'pending' FROM push_subscriptions
       WHERE user_id=$2 AND enabled=true
       ON CONFLICT DO NOTHING`,[row.id,input.userId]
    );
  }

  if(input.emitRealtime!==false){
    notificationEvents.emitNew({userId:input.userId,notification:dto(row)});
  }
  return dto(row);
}

type PendingDeliveryRow={
  notification_id:string;subscription_id:string;platform:'web'|'android';
  encrypted_payload:string; type:string;title:string;body:string;data:Record<string,unknown>;sound_key:string|null;
};

export async function processPendingNotificationDeliveries(limit=100){
  const pending=await query<PendingDeliveryRow>(
    `SELECT d.notification_id,d.subscription_id,s.platform,s.encrypted_payload,
            n.type,n.title,n.body,n.data,n.sound_key
     FROM notification_deliveries d
     JOIN push_subscriptions s ON s.id=d.subscription_id AND s.enabled=true
     JOIN notifications n ON n.id=d.notification_id AND n.expires_at>now()
     WHERE d.status IN ('pending','failed')
       AND (d.attempted_at IS NULL OR d.attempted_at < now()-interval '60 seconds')
     ORDER BY COALESCE(d.attempted_at,to_timestamp(0)),n.created_at
     LIMIT $1`,[Math.min(Math.max(limit,1),250)]
  );
  if(pending.rows.length===0)return {processed:0,sent:0};

  const redis=await getRedis();
  let processed=0,sent=0;
  for(const row of pending.rows){
    const lockKey=`${env.REDIS_KEY_PREFIX}push:delivery:${row.notification_id}:${row.subscription_id}`;
    const claimed=await redis.set(lockKey,'1',{NX:true,EX:60});
    if(claimed!=='OK')continue;
    processed++;
    const message:PushMessage={
      id:row.notification_id,type:row.type,title:row.title,body:row.body,
      data:row.data,soundKey:row.sound_key
    };
    let delivery;
    try{
      delivery=row.platform==='web'
        ? await sendWebPush(decryptPushPayload<WebPushPayload>(row.encrypted_payload),message)
        : await sendAndroidPush(decryptPushPayload<AndroidPushPayload>(row.encrypted_payload),message);
    }catch{
      delivery={status:'failed' as const,errorCode:'PUSH_PAYLOAD_DECRYPT_FAILED'};
    }
    const dbStatus=delivery.status==='sent'?'sent':delivery.status==='expired'?'expired':'failed';
    await query(
      `UPDATE notification_deliveries
       SET status=$3,error_code=$4,attempted_at=now()
       WHERE notification_id=$1 AND subscription_id=$2`,
      [row.notification_id,row.subscription_id,dbStatus,delivery.errorCode??null]
    );
    await query(
      `UPDATE push_subscriptions SET
         enabled=CASE WHEN $2='expired' THEN false ELSE enabled END,
         last_error=$3,
         last_success_at=CASE WHEN $2='sent' THEN now() ELSE last_success_at END,
         updated_at=now()
       WHERE id=$1`,
      [row.subscription_id,delivery.status,delivery.status==='sent'?null:delivery.errorCode??delivery.status]
    );
    if(delivery.status==='sent')sent++;
  }
  return {processed,sent};
}

export function startNotificationDispatcher(){
  let stopped=false,running=false;
  const tick=async()=>{
    if(stopped||running)return;
    running=true;
    try{await processPendingNotificationDeliveries();}
    catch(error){console.error('[notification-dispatcher]',error);}
    finally{running=false;}
  };
  const timer=setInterval(()=>void tick(),10_000);
  timer.unref();
  void tick();
  return ()=>{stopped=true;clearInterval(timer);};
}

export function notificationPushConfig(){
  return pushProviderStatus();
}
