import { api, getInstallationId } from '../runtime';

function vapidKey(value:string){
  const padding='='.repeat((4-value.length%4)%4);
  const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map((char)=>char.charCodeAt(0)));
}

export async function enableWebPush(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window))throw new Error('PUSH_NOT_SUPPORTED');
  const config=await api.pushConfig();
  if(!config.webPushConfigured||!config.webPushVapidPublicKey)throw new Error('WEB_PUSH_NOT_CONFIGURED');
  const permission=await Notification.requestPermission();
  if(permission!=='granted')throw new Error('PUSH_PERMISSION_DENIED');
  const registration=await navigator.serviceWorker.ready;
  let subscription=await registration.pushManager.getSubscription();
  if(!subscription){
    subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:vapidKey(config.webPushVapidPublicKey)});
  }
  await api.registerWebPush(getInstallationId(),subscription.toJSON());
  return subscription;
}

export async function webPushState(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window))return {supported:false,permission:'unsupported' as const,subscribed:false};
  const registration=await navigator.serviceWorker.ready;
  const subscription=await registration.pushManager.getSubscription();
  return {supported:true,permission:Notification.permission,subscribed:Boolean(subscription)};
}
