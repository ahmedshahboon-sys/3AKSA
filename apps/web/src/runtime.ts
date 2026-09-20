import { Capacitor, registerPlugin } from '@capacitor/core';
import { ApiClient } from '@3aksa/api-client';
import { RealtimeClient } from '@3aksa/realtime';
import { normalizeBasePath } from '@3aksa/config';

const USER_KEY='3aksa:cached-user';
const INSTALLATION_KEY='3aksa:installation-id';
const NATIVE_TOKEN_KEY='session-token';

type SecureStorePlugin={
  set(options:{key:string;value:string}):Promise<void>;
  get(options:{key:string}):Promise<{value:string|null}>;
  remove(options:{key:string}):Promise<void>;
  deviceId():Promise<{value:string}>;
};

const SecureStore=registerPlugin<SecureStorePlugin>('SecureStore');
let accessTokenMemory:string|null=null;
let nativeInstallationId:string|null=null;
let runtimeSecurityInit:Promise<void>|null=null;

function storage(){
  try{return window.localStorage;}catch{return null;}
}

export function getPlatform(){
  return Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android' ? 'android' : 'web';
}

export async function initializeRuntimeSecurity(){
  if(runtimeSecurityInit)return runtimeSecurityInit;
  runtimeSecurityInit=(async()=>{
    if(getPlatform()!=='android')return;
    try{
      const [token,device]=await Promise.all([
        SecureStore.get({key:NATIVE_TOKEN_KEY}),
        SecureStore.deviceId()
      ]);
      accessTokenMemory=token.value||null;
      nativeInstallationId=device.value||null;
    }catch{
      accessTokenMemory=null;
      nativeInstallationId=null;
    }
  })();
  return runtimeSecurityInit;
}

export function getAccessToken(){
  return accessTokenMemory;
}

export async function setAccessToken(token:string|null){
  accessTokenMemory=token;
  if(getPlatform()!=='android')return;
  try{
    if(token)await SecureStore.set({key:NATIVE_TOKEN_KEY,value:token});
    else await SecureStore.remove({key:NATIVE_TOKEN_KEY});
  }catch{
    // Keep the in-memory session usable; persistence failure will require login after restart.
  }
}

export function getCachedUser<T=unknown>():T|null{
  try{
    const raw=storage()?.getItem(USER_KEY);
    return raw?JSON.parse(raw) as T:null;
  }catch{return null;}
}

export function setCachedUser(user:unknown|null){
  const store=storage();
  if(!store)return;
  if(user)store.setItem(USER_KEY,JSON.stringify(user));
  else store.removeItem(USER_KEY);
}

export function getInstallationId(){
  if(getPlatform()==='android'){
    if(!nativeInstallationId)throw new Error('NATIVE_IDENTITY_NOT_READY');
    return nativeInstallationId;
  }
  const store=storage();
  const existing=store?.getItem(INSTALLATION_KEY);
  if(existing)return existing;
  const next=crypto.randomUUID();
  store?.setItem(INSTALLATION_KEY,next);
  return next;
}

const basePath=normalizeBasePath(import.meta.env.VITE_PUBLIC_BASE_PATH || '/3aksa/');
const defaultApiBase=`${basePath}api`;
const apiBase=import.meta.env.VITE_API_BASE_URL || defaultApiBase;
const socketUrl=import.meta.env.VITE_SOCKET_URL || window.location.origin;
const socketPath=import.meta.env.VITE_SOCKET_PATH || `${basePath}socket.io`;

export function resolveApiUrl(path:string){
  const base=new URL(apiBase,window.location.origin);
  return new URL(path,base.origin).toString();
}

export const api=new ApiClient({
  baseUrl:apiBase,
  getAccessToken
});

export const realtime=new RealtimeClient({
  url:socketUrl,
  path:socketPath,
  getAccessToken,
  allowCookieAuth:getPlatform()==='web'
});
