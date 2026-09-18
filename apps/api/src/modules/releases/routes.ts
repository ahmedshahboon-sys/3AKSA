import type { FastifyInstance } from 'fastify';
import { openStoredFile } from '../../storage.js';
import { downloadableAndroidRelease,latestAndroidRelease } from './service.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function registerReleaseRoutes(app:FastifyInstance,options:{basePath:string}){
  const prefix=`${options.basePath}/app/releases/android`;

  app.get<{Querystring:{currentVersionCode?:string;channel?:string}}>(`${prefix}/latest`,async(request,reply)=>{
    const currentRaw=Number(request.query.currentVersionCode??0);
    if(!Number.isInteger(currentRaw)||currentRaw<0)return reply.code(400).send({error:'INVALID_VERSION_CODE'});
    const channel=request.query.channel==='beta'?'beta':'stable';
    const release=await latestAndroidRelease(channel);
    if(!release)return reply.send({release:null,updateAvailable:false,required:false});
    return reply.send({
      release:{
        id:release.id,
        channel:release.channel,
        versionName:release.version_name,
        versionCode:release.version_code,
        minSupportedVersionCode:release.min_supported_version_code,
        fileName:release.file_name,
        fileBytes:Number(release.file_bytes),
        sha256:release.sha256,
        notes:release.notes,
        publishedAt:release.published_at,
        downloadPath:`${prefix}/download/${release.download_token}`
      },
      updateAvailable:release.version_code>currentRaw,
      required:currentRaw>0&&currentRaw<release.min_supported_version_code
    });
  });

  app.get<{Params:{token:string}}>(`${prefix}/download/:token`,async(request,reply)=>{
    if(!UUID_RE.test(request.params.token))return reply.code(404).send({error:'RELEASE_NOT_FOUND'});
    const release=await downloadableAndroidRelease(request.params.token);
    if(!release)return reply.code(404).send({error:'RELEASE_NOT_FOUND'});
    reply.header('Content-Type','application/vnd.android.package-archive');
    reply.header('Content-Length',release.file_bytes);
    reply.header('Content-Disposition',`attachment; filename="${release.file_name.replace(/["\\]/g,'_')}"`);
    reply.header('Cache-Control','public,max-age=86400,immutable');
    reply.header('X-Content-Type-Options','nosniff');
    reply.header('X-APK-SHA256',release.sha256);
    return reply.send(openStoredFile(release.storage_key));
  });
}
