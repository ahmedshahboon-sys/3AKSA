import { query } from '../../db.js';

export type PublishedReleaseRow={
  id:string;
  platform:'android';
  channel:'stable'|'beta';
  version_name:string;
  version_code:number;
  min_supported_version_code:number;
  file_name:string;
  file_bytes:string;
  sha256:string;
  notes:string|null;
  download_token:string;
  published_at:Date;
};

export async function latestAndroidRelease(channel:'stable'|'beta'='stable'){
  const result=await query<PublishedReleaseRow>(
    `SELECT id,platform,channel,version_name,version_code,min_supported_version_code,
            file_name,file_bytes,sha256,notes,download_token,published_at
     FROM app_releases
     WHERE platform='android' AND channel=$1 AND status='published'
     ORDER BY version_code DESC
     LIMIT 1`,
    [channel]
  );
  return result.rows[0]??null;
}

export async function downloadableAndroidRelease(token:string){
  const result=await query<PublishedReleaseRow&{storage_key:string}>(
    `SELECT id,platform,channel,version_name,version_code,min_supported_version_code,
            file_name,file_bytes,sha256,notes,download_token,published_at,storage_key
     FROM app_releases
     WHERE platform='android' AND status='published' AND download_token=$1
     LIMIT 1`,
    [token]
  );
  return result.rows[0]??null;
}
