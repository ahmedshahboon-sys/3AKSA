import {randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify';
import {query} from '../../db.js';
import {consumeRateLimit} from '../../rate-limit.js';
import {adminContext,hasAdminRole,requireAdminMfa} from '../admin/security.js';
import {featureEnabled} from '../features/service.js';

type EventInput={
  eventType?:string;route?:string;appVersion?:string;platform?:string;
  context?:Record<string,unknown>;
};
type BatchBody={events?:EventInput[]};

const EVENT_RE=/^[a-z][a-z0-9_.-]{2,63}$/;
const VERSION_RE=/^[0-9A-Za-z._-]{1,40}$/;
const PLATFORMS=new Set(['web','android']);
const CONTEXT_KEYS=new Set(['errorName','errorCode','component','networkState','operation','source']);

function cleanRoute(value:unknown){
  if(typeof value!=='string')return '/';
  const raw=value.trim().slice(0,160);
  const noQuery=raw.split(/[?#]/,1)[0]??'/';
  return noQuery.startsWith('/')?noQuery:'/';
}
function cleanContext(value:unknown){
  const result:Record<string,string|number|boolean>={};
  if(!value||Array.isArray(value)||typeof value!=='object')return result;
  for(const [key,raw] of Object.entries(value)){
    if(!CONTEXT_KEYS.has(key))continue;
    if(typeof raw==='string')result[key]=raw.replace(/[\r\n\t]/g,' ').slice(0,120);
    else if(typeof raw==='number'&&Number.isFinite(raw))result[key]=raw;
    else if(typeof raw==='boolean')result[key]=raw;
  }
  return result;
}
function cleanEvent(input:EventInput){
  const eventType=input.eventType?.trim().toLowerCase()??'';
  if(!EVENT_RE.test(eventType))throw new Error('INVALID_TELEMETRY_EVENT');
  const appVersion=input.appVersion?.trim()??'';
  if(!VERSION_RE.test(appVersion))throw new Error('INVALID_TELEMETRY_VERSION');
  const platform=input.platform?.trim().toLowerCase()??'';
  if(!PLATFORMS.has(platform))throw new Error('INVALID_TELEMETRY_PLATFORM');
  return {eventType,route:cleanRoute(input.route),appVersion,platform,context:cleanContext(input.context)};
}
async function flood(request:FastifyRequest,reply:FastifyReply,bucket:string,limit:number){
  const result=await consumeRateLimit(bucket,`ip:${request.ip}`,limit,60);
  if(result.allowed)return true;
  reply.header('Retry-After',String(result.retryAfterSeconds));
  reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:result.retryAfterSeconds});
  return false;
}
async function telemetryAdmin(request:FastifyRequest,reply:FastifyReply){
  if(!(await flood(request,reply,'admin-telemetry-ip',120)))return null;
  const context=await adminContext(request,reply);if(!context)return null;
  if(!hasAdminRole(context,'super_admin')){
    reply.code(403).send({error:'SUPER_ADMIN_REQUIRED'});return null;
  }
  if(!(await requireAdminMfa(context,request,reply)))return null;
  const limit=await consumeRateLimit('admin-telemetry',`user:${context.user.id}`,60,60);
  if(!limit.allowed){
    reply.header('Retry-After',String(limit.retryAfterSeconds));
    reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:limit.retryAfterSeconds});
    return null;
  }
  return context;
}

export async function registerTelemetryRoutes(app:FastifyInstance,options:{basePath:string}){
  app.post<{Body:BatchBody}>(
    `${options.basePath}/telemetry/events`,
    {bodyLimit:32*1024},
    async(request,reply)=>{
      if(!(await featureEnabled('telemetry').catch(()=>false)))return reply.code(204).send();
      if(!(await flood(request,reply,'telemetry-ingest',120)))return;
      const events=request.body.events;
      if(!Array.isArray(events)||events.length<1||events.length>25){
        return reply.code(400).send({error:'INVALID_TELEMETRY_BATCH'});
      }
      let cleaned:ReturnType<typeof cleanEvent>[];
      try{cleaned=events.map(cleanEvent);}
      catch(error){
        const code=error instanceof Error?error.message:'INVALID_TELEMETRY_EVENT';
        return reply.code(400).send({error:code});
      }
      for(const event of cleaned){
        await query(
          `INSERT INTO telemetry_events(
             id,event_type,route,app_version,platform,context,created_at,expires_at
           ) VALUES($1,$2,$3,$4,$5,$6::jsonb,now(),now()+interval '24 hours')`,
          [randomUUID(),event.eventType,event.route,event.appVersion,event.platform,JSON.stringify(event.context)]
        );
      }
      return reply.code(202).send({accepted:cleaned.length});
    }
  );

  app.get<{Querystring:{limit?:string}}>(`${options.basePath}/admin/telemetry`,async(request,reply)=>{
    const context=await telemetryAdmin(request,reply);if(!context)return;
    const raw=Number(request.query.limit??50);
    const limit=Number.isInteger(raw)?Math.min(Math.max(raw,1),100):50;
    const result=await query<{
      event_type:string;app_version:string;platform:string;frequency:string;
      first_seen:Date;last_seen:Date;
    }>(
      `SELECT event_type,app_version,platform,count(*)::text AS frequency,
              min(created_at) AS first_seen,max(created_at) AS last_seen
       FROM telemetry_events
       WHERE expires_at>now()
       GROUP BY event_type,app_version,platform
       ORDER BY count(*) DESC,max(created_at) DESC
       LIMIT $1`,[limit]
    );
    return reply.send({errors:result.rows.map(row=>({
      error:row.event_type,frequency:Number(row.frequency),version:row.app_version,
      platform:row.platform,firstSeen:row.first_seen,lastSeen:row.last_seen
    }))});
  });
}
