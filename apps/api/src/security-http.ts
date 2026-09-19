import type { FastifyInstance } from 'fastify';
import { env } from './config.js';
import { sessionCookieTokenFromHeader } from './modules/auth/cookie.js';

const SAFE_METHODS=new Set(['GET','HEAD','OPTIONS']);
const DEFAULT_DEV_ORIGINS=['http://localhost:5173','http://127.0.0.1:5173'];

function allowedOrigins(){
  const configured=env.WEB_ALLOWED_ORIGINS?.split(',').map((value)=>value.trim()).filter(Boolean)??[];
  if(env.NODE_ENV==='production'&&configured.length===0){
    throw new Error('WEB_ALLOWED_ORIGINS_REQUIRED');
  }
  return new Set(configured.length?configured:DEFAULT_DEV_ORIGINS);
}

export function registerHttpSecurity(app:FastifyInstance){
  const trustedOrigins=allowedOrigins();

  app.addHook('preHandler',async(request,reply)=>{
    if(SAFE_METHODS.has(request.method))return;
    if(request.headers.authorization)return;
    if(!sessionCookieTokenFromHeader(request.headers.cookie))return;

    const origin=request.headers.origin?.trim();
    if(!origin||!trustedOrigins.has(origin)){
      return reply.code(403).send({error:'CSRF_ORIGIN_REJECTED'});
    }
  });

  app.addHook('onSend',async(_request,reply,payload)=>{
    reply.header('X-Content-Type-Options','nosniff');
    reply.header('X-Frame-Options','DENY');
    reply.header('Referrer-Policy','strict-origin-when-cross-origin');
    reply.header('Permissions-Policy','camera=(), geolocation=(self), microphone=(self), payment=(), usb=()');
    reply.header('Cross-Origin-Opener-Policy','same-origin');
    reply.header('Cross-Origin-Resource-Policy','same-site');
    reply.header(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    );
    if(env.NODE_ENV==='production'){
      reply.header('Strict-Transport-Security','max-age=31536000');
    }
    return payload;
  });
}
