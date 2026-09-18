import webPush from 'web-push';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { env } from '../../config.js';

export type PushMessage = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  soundKey: string | null;
};

export type WebPushPayload = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type AndroidPushPayload = {
  token: string;
};

export type PushSendResult = {
  status: 'sent' | 'failed' | 'expired' | 'disabled';
  errorCode?: string;
};

let vapidConfigured=false;
let firebaseApp:App|null=null;

function webPushReady(){
  return Boolean(
    env.WEB_PUSH_VAPID_PUBLIC_KEY &&
    env.WEB_PUSH_VAPID_PRIVATE_KEY &&
    env.WEB_PUSH_SUBJECT
  );
}

function configureVapid(){
  if(vapidConfigured || !webPushReady())return;
  webPush.setVapidDetails(
    env.WEB_PUSH_SUBJECT,
    env.WEB_PUSH_VAPID_PUBLIC_KEY!,
    env.WEB_PUSH_VAPID_PRIVATE_KEY!
  );
  vapidConfigured=true;
}

function fcmReady(){
  return Boolean(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY);
}

function getFirebaseApp(){
  if(firebaseApp)return firebaseApp;
  if(!fcmReady())return null;
  const existing=getApps().find((app)=>app.name==='3aksa-push');
  if(existing){
    firebaseApp=existing;
    return existing;
  }
  firebaseApp=initializeApp({
    credential:cert({
      projectId:env.FCM_PROJECT_ID!,
      clientEmail:env.FCM_CLIENT_EMAIL!,
      privateKey:env.FCM_PRIVATE_KEY!.replace(/\\n/g,'\n')
    })
  },'3aksa-push');
  return firebaseApp;
}

export function pushProviderStatus(){
  return {
    webPushConfigured:webPushReady(),
    androidFcmConfigured:fcmReady(),
    webPushVapidPublicKey:env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null
  };
}

export async function sendWebPush(
  subscription:WebPushPayload,
  message:PushMessage
):Promise<PushSendResult>{
  if(!webPushReady())return {status:'disabled',errorCode:'WEB_PUSH_NOT_CONFIGURED'};
  configureVapid();
  try{
    await webPush.sendNotification(subscription,JSON.stringify({
      id:message.id,
      type:message.type,
      title:message.title,
      body:message.body,
      data:message.data,
      soundKey:message.soundKey
    }),{
      TTL:24*60*60,
      urgency:'normal'
    });
    return {status:'sent'};
  }catch(error){
    const statusCode=(error as {statusCode?:number}).statusCode;
    if(statusCode===404 || statusCode===410){
      return {status:'expired',errorCode:`WEB_PUSH_${statusCode}`};
    }
    return {
      status:'failed',
      errorCode:statusCode ? `WEB_PUSH_${statusCode}` : 'WEB_PUSH_SEND_FAILED'
    };
  }
}

export async function sendAndroidPush(
  subscription:AndroidPushPayload,
  message:PushMessage
):Promise<PushSendResult>{
  const app=getFirebaseApp();
  if(!app)return {status:'disabled',errorCode:'FCM_NOT_CONFIGURED'};
  try{
    await getMessaging(app).send({
      token:subscription.token,
      notification:{title:message.title,body:message.body},
      data:{
        notificationId:message.id,
        type:message.type,
        payload:JSON.stringify(message.data),
        soundKey:message.soundKey ?? ''
      },
      android:{
        priority:'high',
        ...(message.soundKey ? { notification:{ sound:'default' } } : {})
      }
    });
    return {status:'sent'};
  }catch(error){
    const code=(error as {code?:string}).code ?? 'FCM_SEND_FAILED';
    if(code==='messaging/registration-token-not-registered' || code==='messaging/invalid-registration-token'){
      return {status:'expired',errorCode:code};
    }
    return {status:'failed',errorCode:code.slice(0,120)};
  }
}
