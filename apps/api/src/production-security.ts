import path from 'node:path';
import type { ServerEnv } from '@3aksa/config';

function isPlaceholder(value:string|undefined){
  if(!value)return false;
  return /CHANGE_ME|placeholder|example|local-secret/i.test(value);
}

function splitOrigins(value:string|undefined){
  return (value??'').split(',').map((item)=>item.trim()).filter(Boolean);
}

export function productionSecurityErrors(env:ServerEnv){
  if(env.NODE_ENV!=='production')return [] as string[];
  const errors:string[]=[];

  if(env.API_BIND_MODE==='loopback'){
    if(env.API_HOST!=='127.0.0.1'&&env.API_HOST!=='::1'){
      errors.push('API_HOST must stay on loopback when API_BIND_MODE=loopback');
    }
  }else if(env.API_HOST!=='0.0.0.0'&&env.API_HOST!=='::'){
    errors.push('API_HOST must bind the container interface when API_BIND_MODE=container');
  }

  const trustedProxies=env.TRUSTED_PROXY_CIDRS.split(',').map((value)=>value.trim()).filter(Boolean);
  if(!trustedProxies.includes('127.0.0.1')&&!trustedProxies.includes('::1')){
    errors.push('TRUSTED_PROXY_CIDRS must retain a loopback proxy entry');
  }
  if(env.STORAGE_DRIVER!=='local'){
    errors.push('Only local storage is implemented in this release');
  }
  if(!path.isAbsolute(env.STORAGE_LOCAL_ROOT)){
    errors.push('STORAGE_LOCAL_ROOT must be absolute in production');
  }

  const origins=splitOrigins(env.WEB_ALLOWED_ORIGINS);
  if(origins.length===0)errors.push('WEB_ALLOWED_ORIGINS is required');
  for(const origin of origins){
    try{
      const parsed=new URL(origin);
      if(parsed.protocol!=='https:')errors.push(`Trusted origin must use HTTPS: ${origin}`);
      if(parsed.origin!==origin.replace(/\/$/,''))errors.push(`Trusted origin must be an origin only: ${origin}`);
    }catch{
      errors.push(`Invalid trusted origin: ${origin}`);
    }
  }

  for(const [name,value] of [
    ['SESSION_SECRET',env.SESSION_SECRET],
    ['PASSWORD_PEPPER',env.PASSWORD_PEPPER],
    ['ADMIN_MFA_ENCRYPTION_KEY',env.ADMIN_MFA_ENCRYPTION_KEY],
    ['PUSH_ENCRYPTION_KEY',env.PUSH_ENCRYPTION_KEY]
  ] as const){
    if(!value)errors.push(`${name} is required in production`);
    else if(isPlaceholder(value))errors.push(`${name} still looks like a placeholder`);
  }

  const vapidPublic=Boolean(env.WEB_PUSH_VAPID_PUBLIC_KEY);
  const vapidPrivate=Boolean(env.WEB_PUSH_VAPID_PRIVATE_KEY);
  if(vapidPublic!==vapidPrivate)errors.push('Web Push VAPID public/private keys must be configured together');
  if(vapidPublic&&/3aksa\.local/i.test(env.WEB_PUSH_SUBJECT)){
    errors.push('WEB_PUSH_SUBJECT must use a real production contact');
  }

  const fcm=[env.FCM_PROJECT_ID,env.FCM_CLIENT_EMAIL,env.FCM_PRIVATE_KEY];
  const fcmConfigured=fcm.filter(Boolean).length;
  if(fcmConfigured!==0&&fcmConfigured!==3){
    errors.push('FCM_PROJECT_ID, FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY must be configured together');
  }

  return errors;
}

export function assertProductionSecurity(env:ServerEnv){
  const errors=productionSecurityErrors(env);
  if(errors.length)throw new Error(`PRODUCTION_SECURITY_INVALID:\n- ${errors.join('\n- ')}`);
}
