import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify';
import {consumeRateLimit} from '../../rate-limit.js';
import {adminContext,auditAdminAction,hasAdminRole,requireAdminMfa} from '../admin/security.js';
import {adminFeatureFlags,FEATURE_KEYS,featureSnapshot,type FeatureKey,updateFeatureFlag} from './service.js';

async function admin(request:FastifyRequest,reply:FastifyReply,bucket:string){
  const flood=await consumeRateLimit(bucket+'-ip',`ip:${request.ip}`,120,60);
  if(!flood.allowed){
    reply.header('Retry-After',String(flood.retryAfterSeconds));
    reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:flood.retryAfterSeconds});
    return null;
  }
  const context=await adminContext(request,reply);if(!context)return null;
  if(!hasAdminRole(context,'super_admin')){
    reply.code(403).send({error:'SUPER_ADMIN_REQUIRED'});return null;
  }
  if(!(await requireAdminMfa(context,request,reply)))return null;
  const limit=await consumeRateLimit(bucket,`user:${context.user.id}`,60,60);
  if(!limit.allowed){
    reply.header('Retry-After',String(limit.retryAfterSeconds));
    reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:limit.retryAfterSeconds});
    return null;
  }
  return context;
}

export async function registerFeatureFlagRoutes(app:FastifyInstance,options:{basePath:string}){
  app.get(`${options.basePath}/app/feature-flags`,async(_request,reply)=>{
    try{return reply.send({flags:await featureSnapshot()});}
    catch{return reply.send({flags:{tv:false,store:false,paid_features:false,telemetry:false,push:false}});}
  });

  app.get(`${options.basePath}/admin/feature-flags`,async(request,reply)=>{
    const context=await admin(request,reply,'admin-feature-flags-read');if(!context)return;
    return reply.send({flags:await adminFeatureFlags()});
  });

  app.patch<{Params:{key:string};Body:{enabled?:boolean}}>(
    `${options.basePath}/admin/feature-flags/:key`,
    async(request,reply)=>{
      const context=await admin(request,reply,'admin-feature-flags-write');if(!context)return;
      const key=request.params.key as FeatureKey;
      if(!FEATURE_KEYS.includes(key))return reply.code(404).send({error:'FEATURE_FLAG_NOT_FOUND'});
      if(typeof request.body.enabled!=='boolean')return reply.code(400).send({error:'INVALID_FEATURE_FLAG'});
      const flag=await updateFeatureFlag(key,request.body.enabled,context.user.id);
      await auditAdminAction(null,context.user.id,'feature_flag_updated',{
        metadata:{key:flag.key,enabled:flag.enabled}
      });
      return reply.send({flag});
    }
  );
}
