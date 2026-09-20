import type { FastifyReply, FastifyRequest } from 'fastify';
import { apiBasePath, env } from '../../config.js';

export const SESSION_COOKIE_NAME='3aksa_session';

function cookiePath(){
  const withoutApi=apiBasePath.replace(/\/api\/?$/,'');
  return withoutApi||'/';
}

export function parseCookieHeader(header:string|undefined){
  const out=new Map<string,string>();
  if(!header)return out;
  for(const entry of header.split(';')){
    const index=entry.indexOf('=');
    if(index<=0)continue;
    const key=entry.slice(0,index).trim();
    const value=entry.slice(index+1).trim();
    if(key)out.set(key,value);
  }
  return out;
}

export function sessionCookieTokenFromHeader(header:string|undefined){
  const raw=parseCookieHeader(header).get(SESSION_COOKIE_NAME);
  if(!raw)return null;
  try{return decodeURIComponent(raw);}catch{return null;}
}

export function requestWantsCookieSession(request:FastifyRequest){
  const mode=request.headers['x-3aksa-session-mode'];
  return (Array.isArray(mode)?mode[0]:mode)==='cookie';
}

export function setWebSessionCookie(reply:FastifyReply,token:string,expiresAt:Date){
  const maxAge=Math.max(0,Math.floor((expiresAt.getTime()-Date.now())/1000));
  const secure=env.NODE_ENV==='production'?'; Secure':'';
  reply.header(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=${cookiePath()}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Expires=${expiresAt.toUTCString()}; Priority=High${secure}`
  );
}

export function clearWebSessionCookie(reply:FastifyReply){
  const secure=env.NODE_ENV==='production'?'; Secure':'';
  reply.header(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=${cookiePath()}; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Priority=High${secure}`
  );
}
