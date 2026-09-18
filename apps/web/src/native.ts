import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { App } from '@capacitor/app';
import { api, getInstallationId } from './runtime';

let pushInitialized=false;
let appLinksInitialized=false;

export function isNativeAndroid(){return Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';}

function routeFromPayload(data:Record<string,unknown>){
  const conversationId=typeof data.conversationId==='string'?data.conversationId:null;
  if(conversationId)return '/private/'+conversationId;
  const type=typeof data.type==='string'?data.type:'';
  if(type==='message_request')return '/private';
  if(['wallet_topup','wallet_transfer','purchase','gift_received'].includes(type))return '/wallet';
  return '/notifications';
}

export async function initializeNativePush(onNavigate:(path:string)=>void){
  if(!isNativeAndroid()||pushInitialized)return;
  pushInitialized=true;
  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener('registration',(token)=>{
    void api.registerAndroidPush(getInstallationId(),token.value).catch(()=>undefined);
  });
  await PushNotifications.addListener('registrationError',()=>undefined);
  await PushNotifications.addListener('pushNotificationActionPerformed',(action)=>{
    onNavigate(routeFromPayload(action.notification.data??{}));
  });
  const current=await PushNotifications.checkPermissions();
  const permission=current.receive==='prompt'||current.receive==='prompt-with-rationale'
    ? await PushNotifications.requestPermissions()
    : current;
  if(permission.receive==='granted')await PushNotifications.register();
}

export async function initializeNativeAppLinks(onNavigate:(path:string)=>void){
  if(!isNativeAndroid()||appLinksInitialized)return;
  appLinksInitialized=true;
  await App.addListener('appUrlOpen',(event)=>{
    try{const url=new URL(event.url);onNavigate(url.pathname.replace(/^\/3aksa/,'')||'/');}catch{/* invalid deep link */}
  });
}

export async function nativeImpact(kind:'light'|'success'|'warning'='light'){
  if(!isNativeAndroid()){if('vibrate' in navigator)navigator.vibrate(kind==='light'?30:55);return;}
  try{
    if(kind==='success')await Haptics.notification({type:NotificationType.Success});
    else if(kind==='warning')await Haptics.notification({type:NotificationType.Warning});
    else await Haptics.impact({style:ImpactStyle.Light});
  }catch{/* haptics are optional */}
}
