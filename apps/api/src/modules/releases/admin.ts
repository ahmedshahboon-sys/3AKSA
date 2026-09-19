import { randomUUID } from 'node:crypto';
import type { FastifyInstance,FastifyReply,FastifyRequest } from 'fastify';
import { query } from '../../db.js';
import { consumeRateLimit } from '../../rate-limit.js';
import { deleteStoredFile,MAX_ANDROID_APK_BYTES,storeAndroidApk } from '../../storage.js';
import { adminContext,auditAdminAction,hasAdminRole,requireAdminMfa } from '../admin/security.js';

type ReleaseStatus='draft'|'published'|'retired';
type ReleaseChannel='stable'|'beta';
type ReleaseRow={
  id:string;platform:'android';channel:ReleaseChannel;version_name:string;version_code:number;
  min_supported_version_code:number;storage_key:string;file_name:string;file_bytes:string;sha256:string;
  notes:string|null;status:ReleaseStatus;download_token:string;created_by:string;
  published_at:Date|null;created_at:Date;updated_at:Date;
};
type UploadBody={
  base64?:string;fileName?:string;versionName?:string;versionCode?:number;
  minSupportedVersionCode?:number;channel?:ReleaseChannel;notes?:string|null;
};
type PatchBody={minSupportedVersionCode?:number;notes?:string|null};

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION_RE=/^[0-9A-Za-z][0-9A-Za-z._-]{0,39}$/;
const BASE64_MAX=Math.ceil(MAX_ANDROID_APK_BYTES/3)*4+8;

function dto(row:ReleaseRow){
  return {
    id:row.id,channel:row.channel,versionName:row.version_name,versionCode:row.version_code,
    minSupportedVersionCode:row.min_supported_version_code,fileName:row.file_name,
    fileBytes:Number(row.file_bytes),sha256:row.sha256,notes:row.notes,status:row.status,
    publishedAt:row.published_at,createdAt:row.created_at,updatedAt:row.updated_at
  };
}
async function flood(request:FastifyRequest,reply:FastifyReply,bucket:string,limit:number){
  const result=await consumeRateLimit(bucket,`ip:${request.ip}`,limit,60);
  if(result.allowed)return true;
  reply.header('Retry-After',String(result.retryAfterSeconds));
  reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:result.retryAfterSeconds});
  return false;
}
async function requireReleaseAdmin(request:FastifyRequest,reply:FastifyReply,bucket:string,limit:number){
  if(!(await flood(request,reply,`${bucket}-ip`,Math.max(limit*3,30))))return null;
  const context=await adminContext(request,reply);if(!context)return null;
  if(!hasAdminRole(context,'super_admin','release_admin')){
    reply.code(403).send({error:'RELEASE_ADMIN_REQUIRED'});return null;
  }
  if(!(await requireAdminMfa(context,request,reply)))return null;
  const userLimit=await consumeRateLimit(bucket,`user:${context.user.id}`,limit,60);
  if(!userLimit.allowed){
    reply.header('Retry-After',String(userLimit.retryAfterSeconds));
    reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:userLimit.retryAfterSeconds});
    return null;
  }
  return context;
}
function releaseError(reply:FastifyReply,error:unknown){
  const code=error instanceof Error?error.message:'RELEASE_ADMIN_FAILED';
  if(code==='RELEASE_NOT_FOUND')return reply.code(404).send({error:code});
  if(code==='RELEASE_VERSION_EXISTS')return reply.code(409).send({error:code});
  if([
    'INVALID_RELEASE_FILE','INVALID_VERSION_NAME','INVALID_VERSION_CODE','INVALID_MIN_SUPPORTED_VERSION',
    'INVALID_RELEASE_CHANNEL','INVALID_RELEASE_NOTES','APK_SIZE_INVALID','APK_FORMAT_INVALID'
  ].includes(code))return reply.code(400).send({error:code});
  throw error;
}
function validateUpload(body:UploadBody){
  const fileName=(body.fileName??'').trim();
  const safeName=fileName.replace(/[^A-Za-z0-9._-]/g,'_');
  if(!safeName||safeName.length>160||!safeName.toLowerCase().endsWith('.apk'))throw new Error('INVALID_RELEASE_FILE');
  const versionName=(body.versionName??'').trim();
  if(!VERSION_RE.test(versionName))throw new Error('INVALID_VERSION_NAME');
  const versionCode=body.versionCode;
  if(!Number.isSafeInteger(versionCode)||Number(versionCode)<=0)throw new Error('INVALID_VERSION_CODE');
  const min=body.minSupportedVersionCode??0;
  if(!Number.isSafeInteger(min)||min<0||min>versionCode!)throw new Error('INVALID_MIN_SUPPORTED_VERSION');
  const channel=body.channel??'beta';
  if(channel!=='stable'&&channel!=='beta')throw new Error('INVALID_RELEASE_CHANNEL');
  const notes=body.notes===null?null:body.notes?.trim()||null;
  if(notes&&notes.length>2000)throw new Error('INVALID_RELEASE_NOTES');
  const raw=body.base64?.trim()??'';
  if(!raw||raw.length>BASE64_MAX||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))throw new Error('INVALID_RELEASE_FILE');
  return {fileName:safeName,versionName,versionCode:versionCode!,min,channel,notes,raw};
}
async function releaseById(id:string){
  const result=await query<ReleaseRow>('SELECT * FROM app_releases WHERE id=$1 LIMIT 1',[id]);
  return result.rows[0]??null;
}

export async function registerAdminReleaseRoutes(app:FastifyInstance,options:{basePath:string}){
  const prefix=`${options.basePath}/admin/releases/android`;

  app.get(prefix,async(request,reply)=>{
    const context=await requireReleaseAdmin(request,reply,'admin-release-list',120);if(!context)return;
    const result=await query<ReleaseRow>(
      `SELECT * FROM app_releases WHERE platform='android'
       ORDER BY version_code DESC,created_at DESC LIMIT 200`
    );
    return reply.send({releases:result.rows.map(dto)});
  });

  app.post<{Body:UploadBody}>(
    prefix,
    {bodyLimit:90*1024*1024},
    async(request,reply)=>{
      const context=await requireReleaseAdmin(request,reply,'admin-release-upload',8);if(!context)return;
      let stored:{storageKey:string;bytes:number;sha256:string}|null=null;
      try{
        const input=validateUpload(request.body);
        const buffer=Buffer.from(input.raw,'base64');
        stored=await storeAndroidApk(buffer);
        const id=randomUUID();
        const result=await query<ReleaseRow>(
          `INSERT INTO app_releases(
             id,platform,channel,version_name,version_code,min_supported_version_code,
             storage_key,file_name,file_bytes,sha256,notes,status,download_token,created_by
           ) VALUES($1,'android',$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12)
           RETURNING *`,
          [id,input.channel,input.versionName,input.versionCode,input.min,stored.storageKey,
           input.fileName,stored.bytes,stored.sha256,input.notes,randomUUID(),context.user.id]
        );
        const created=result.rows[0]!;
        await auditAdminAction(null,context.user.id,'android_release_uploaded',{
          metadata:{releaseId:created.id,channel:created.channel,versionName:created.version_name,
            versionCode:created.version_code,fileBytes:Number(created.file_bytes),sha256:created.sha256}
        });
        return reply.code(201).send({release:dto(created)});
      }catch(error){
        if(stored)await deleteStoredFile(stored.storageKey);
        if((error as {code?:string}).code==='23505')return reply.code(409).send({error:'RELEASE_VERSION_EXISTS'});
        return releaseError(reply,error);
      }
    }
  );

  app.patch<{Params:{releaseId:string};Body:PatchBody}>(`${prefix}/:releaseId`,async(request,reply)=>{
    const context=await requireReleaseAdmin(request,reply,'admin-release-update',30);if(!context)return;
    if(!UUID_RE.test(request.params.releaseId))return reply.code(404).send({error:'RELEASE_NOT_FOUND'});
    const current=await releaseById(request.params.releaseId);
    if(!current)return reply.code(404).send({error:'RELEASE_NOT_FOUND'});
    const min=request.body.minSupportedVersionCode;
    if(min!==undefined&&(!Number.isSafeInteger(min)||min<0||min>current.version_code)){
      return reply.code(400).send({error:'INVALID_MIN_SUPPORTED_VERSION'});
    }
    const notes=request.body.notes===null?null:request.body.notes?.trim();
    if(notes!==undefined&&notes!==null&&notes.length>2000)return reply.code(400).send({error:'INVALID_RELEASE_NOTES'});
    const result=await query<ReleaseRow>(
      `UPDATE app_releases
       SET min_supported_version_code=COALESCE($2,min_supported_version_code),
           notes=CASE WHEN $3::boolean THEN $4 ELSE notes END,updated_at=now()
       WHERE id=$1 RETURNING *`,
      [current.id,min??null,request.body.notes!==undefined,notes??null]
    );
    const updated=result.rows[0]!;
    await auditAdminAction(null,context.user.id,'android_release_updated',{metadata:{
      releaseId:updated.id,minSupportedVersionCode:updated.min_supported_version_code
    }});
    return reply.send({release:dto(updated)});
  });

  app.post<{Params:{releaseId:string}}>(`${prefix}/:releaseId/publish`,async(request,reply)=>{
    const context=await requireReleaseAdmin(request,reply,'admin-release-publish',20);if(!context)return;
    if(!UUID_RE.test(request.params.releaseId))return reply.code(404).send({error:'RELEASE_NOT_FOUND'});
    const result=await query<ReleaseRow>(
      `UPDATE app_releases SET status='published',published_at=COALESCE(published_at,now()),updated_at=now()
       WHERE id=$1 AND status IN('draft','published') RETURNING *`,
      [request.params.releaseId]
    );
    const published=result.rows[0];if(!published)return reply.code(404).send({error:'RELEASE_NOT_FOUND'});
    await auditAdminAction(null,context.user.id,'android_release_published',{metadata:{
      releaseId:published.id,channel:published.channel,versionName:published.version_name,versionCode:published.version_code
    }});
    return reply.send({release:dto(published)});
  });

  app.post<{Params:{releaseId:string}}>(`${prefix}/:releaseId/retire`,async(request,reply)=>{
    const context=await requireReleaseAdmin(request,reply,'admin-release-retire',20);if(!context)return;
    if(!UUID_RE.test(request.params.releaseId))return reply.code(404).send({error:'RELEASE_NOT_FOUND'});
    const result=await query<ReleaseRow>(
      `UPDATE app_releases SET status='retired',updated_at=now() WHERE id=$1 AND status<>'retired' RETURNING *`,
      [request.params.releaseId]
    );
    const retired=result.rows[0];if(!retired)return reply.code(404).send({error:'RELEASE_NOT_FOUND'});
    await auditAdminAction(null,context.user.id,'android_release_retired',{metadata:{
      releaseId:retired.id,channel:retired.channel,versionName:retired.version_name,versionCode:retired.version_code
    }});
    return reply.send({release:dto(retired)});
  });
}
