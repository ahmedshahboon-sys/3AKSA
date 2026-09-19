import { ApiClient } from '@3aksa/api-client';
import { RealtimeClient } from '@3aksa/realtime';
import { normalizeBasePath } from '@3aksa/config';

const TOKEN_KEY='3aksa:access-token';
const USER_KEY='3aksa:cached-user';
const INSTALLATION_KEY='3aksa:installation-id';

function storage(){
  try{return window.localStorage;}catch{return null;}
}

export function getAccessToken(){
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

export function setAccessToken(token:string|null){
  const store=storage();
  if(!store)return;
  if(token)store.setItem(TOKEN_KEY,token);
  else store.removeItem(TOKEN_KEY);
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
  const store=storage();
  const existing=store?.getItem(INSTALLATION_KEY);
  if(existing)return existing;
  const next=crypto.randomUUID();
  store?.setItem(INSTALLATION_KEY,next);
  return next;
}

export function getPlatform(){
  const capacitor=(window as Window & {Capacitor?:{getPlatform?:()=>string}}).Capacitor;
  return capacitor?.getPlatform?.() === 'android' ? 'android' : 'web';
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
  getAccessToken
});
