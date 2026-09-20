import { query } from '../../db.js';

export const FEATURE_KEYS=['tv','store','paid_features','telemetry','push'] as const;
export type FeatureKey=(typeof FEATURE_KEYS)[number];
export type FeatureSnapshot=Record<FeatureKey,boolean>;

const SAFE_DEFAULTS:FeatureSnapshot={
  tv:false,store:false,paid_features:false,telemetry:false,push:false
};

let cache:{expiresAt:number;value:FeatureSnapshot}|null=null;
const CACHE_MS=30_000;

export function safeFeatureDefaults():FeatureSnapshot{return {...SAFE_DEFAULTS};}

export async function featureSnapshot(force=false):Promise<FeatureSnapshot>{
  if(!force&&cache&&cache.expiresAt>Date.now())return {...cache.value};
  const result=await query<{key:FeatureKey;enabled:boolean}>(
    'SELECT key,enabled FROM feature_flags WHERE key=ANY($1::text[])',
    [FEATURE_KEYS]
  );
  const value=safeFeatureDefaults();
  for(const row of result.rows){
    if(FEATURE_KEYS.includes(row.key))value[row.key]=Boolean(row.enabled);
  }
  cache={expiresAt:Date.now()+CACHE_MS,value};
  return {...value};
}

export async function featureEnabled(key:FeatureKey){
  return (await featureSnapshot())[key];
}

export async function updateFeatureFlag(key:FeatureKey,enabled:boolean,userId:string){
  if(!FEATURE_KEYS.includes(key))throw new Error('FEATURE_FLAG_NOT_FOUND');
  const result=await query<{key:FeatureKey;enabled:boolean;metadata:Record<string,unknown>;updated_at:Date}>(
    `UPDATE feature_flags SET enabled=$2,updated_by=$3,updated_at=now()
     WHERE key=$1
     RETURNING key,enabled,metadata,updated_at`,
    [key,enabled,userId]
  );
  const row=result.rows[0];
  if(!row)throw new Error('FEATURE_FLAG_NOT_FOUND');
  cache=null;
  return {key:row.key,enabled:row.enabled,metadata:row.metadata,updatedAt:row.updated_at};
}

export async function adminFeatureFlags(){
  const result=await query<{key:FeatureKey;enabled:boolean;metadata:Record<string,unknown>;updated_at:Date}>(
    `SELECT key,enabled,metadata,updated_at FROM feature_flags
     WHERE key=ANY($1::text[]) ORDER BY key`,[FEATURE_KEYS]
  );
  return result.rows.map(row=>({key:row.key,enabled:row.enabled,metadata:row.metadata,updatedAt:row.updated_at}));
}
