import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { api, getInstallationId, initializeRuntimeSecurity } from './runtime';

let pushInitialized=false;
let appLinksInitialized=false;

export function isNativeAndroid(){return Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';}

function routeFromPayload(data:Record<string,unknown>){
  const conversationId=typeof data.conversationId==='string'?data.conversationId:null;
  if(conversationId)return '/private/'+conversationId;
  const type=typeof data.type==='string'?data.type:'';
  if(type==='message_request')return '/private';
  if(['wallet_topup','wallet_transfer','purchase','gift_received'].includes(type))return '/wallet';
  if(type==='app_update')return '/account';
  return '/notifications';
}

function debugOptionalNativeFailure(area:string,error:unknown){
  if(import.meta.env.DEV)console.warn(`3AKSA optional native feature unavailable: ${area}`,error);
}

export async function initializeNativePush(onNavigate:(path:string)=>void){
  if(!isNativeAndroid()||pushInitialized)return;
  try{
    await initializeRuntimeSecurity();
    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener('registration',(token)=>{
      try{
        const installationId=getInstallationId();
        void api.registerAndroidPush(installationId,token.value).catch(()=>undefined);
      }catch(error){
        debugOptionalNativeFailure('push-registration-identity',error);
      }
    });
    await PushNotifications.addListener('registrationError',(error)=>{
      debugOptionalNativeFailure('push-registration',error);
    });
    await PushNotifications.addListener('pushNotificationActionPerformed',(action)=>{
      onNavigate(routeFromPayload(action.notification.data??{}));
    });
    const current=await PushNotifications.checkPermissions();
    if(current.receive==='granted'){
      await PushNotifications.register();
    }
  }catch(error){
    // Push is optional. Missing Firebase/google-services or plugin/runtime failures
    // must never block login, registration or the application shell.
    debugOptionalNativeFailure('push-startup',error);
  }finally{
    pushInitialized=true;
  }
}

export async function requestNativePushPermission(){
  if(!isNativeAndroid())return 'unsupported' as const;
  try{
    await initializeRuntimeSecurity();
    const current=await PushNotifications.checkPermissions();
    const permission=current.receive==='prompt'||current.receive==='prompt-with-rationale'
      ? await PushNotifications.requestPermissions()
      : current;
    if(permission.receive==='granted'){
      await PushNotifications.register();
      return 'granted' as const;
    }
    return permission.receive==='denied'?'denied' as const:'prompt' as const;
  }catch(error){
    debugOptionalNativeFailure('push-permission',error);
    return 'unavailable' as const;
  }
}

export async function initializeNativeAppLinks(onNavigate:(path:string)=>void){
  if(!isNativeAndroid()||appLinksInitialized)return;
  try{
    await App.addListener('appUrlOpen',(event)=>{
      try{const url=new URL(event.url);onNavigate(url.pathname.replace(/^\/3aksa/,'')||'/');}catch{/* invalid deep link */}
    });
  }catch(error){
    debugOptionalNativeFailure('app-links',error);
  }finally{
    appLinksInitialized=true;
  }
}

export async function nativeAppInfo(){
  if(!isNativeAndroid())return null;
  try{
    const info=await App.getInfo();
    const versionCode=Number.parseInt(info.build,10);
    return {versionName:info.version,versionCode:Number.isFinite(versionCode)?versionCode:0};
  }catch(error){
    debugOptionalNativeFailure('app-info',error);
    return null;
  }
}

export async function openExternalUrl(url:string){
  if(isNativeAndroid()){
    try{await Browser.open({url});return;}catch{/* fall back to a normal browser window */}
  }
  window.open(url,'_blank','noopener,noreferrer');
}

export async function nativeImpact(kind:'light'|'success'|'warning'='light'){
  if(!isNativeAndroid()){if('vibrate' in navigator)navigator.vibrate(kind==='light'?30:55);return;}
  try{
    if(kind==='success')await Haptics.notification({type:NotificationType.Success});
    else if(kind==='warning')await Haptics.notification({type:NotificationType.Warning});
    else await Haptics.impact({style:ImpactStyle.Light});
  }catch{/* haptics are optional */}
}
