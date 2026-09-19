import { randomUUID } from 'node:crypto';
import type { FastifyInstance,FastifyReply,FastifyRequest } from 'fastify';
import { query } from '../../db.js';
import { consumeRateLimit } from '../../rate-limit.js';
import { deleteStoredFile,storeStoreAsset } from '../../storage.js';
import { adminContext,auditAdminAction,hasAdminRole,requireAdminMfa } from '../admin/security.js';

type ItemType='frame'|'entry_sound'|'theme'|'sticker_pack'|'badge'|'gift'|'reaction';
type ItemStatus='draft'|'active'|'hidden';
type ItemRow={
  id:string;code:string;item_type:ItemType;name:string;description:string|null;
  price_milli:string;recipient_share_milli:string;consumable:boolean;asset_key:string|null;
  metadata:Record<string,unknown>;status:ItemStatus;created_at:Date;updated_at:Date;
};
type ItemBody={
  code?:string;type?:ItemType;name?:string;description?:string|null;
  priceMilli?:number;recipientShareMilli?:number;status?:ItemStatus;
  metadata?:Record<string,unknown>;
};
type AssetBody={base64?:string};

const CODE_RE=/^[a-z0-9][a-z0-9_-]{1,63}$/;
const ITEM_TYPES=new Set<ItemType>(['frame','entry_sound','theme','sticker_pack','badge','gift','reaction']);
const STATUSES=new Set<ItemStatus>(['draft','active','hidden']);

function asInt(value:string|number){const n=Number(value);return Number.isSafeInteger(n)?n:0;}
function dto(row:ItemRow){
  return {
    id:row.id,code:row.code,type:row.item_type,name:row.name,description:row.description,
    priceMilli:asInt(row.price_milli),recipientShareMilli:asInt(row.recipient_share_milli),
    consumable:row.consumable,assetKey:row.asset_key,metadata:row.metadata,status:row.status,
    createdAt:row.created_at,updatedAt:row.updated_at
  };
}
async function requireStoreAdmin(request:FastifyRequest,reply:FastifyReply){
  const context=await adminContext(request,reply);
  if(!context)return null;
  if(!hasAdminRole(context,'super_admin','finance_admin')){
    reply.code(403).send({error:'FINANCE_ADMIN_REQUIRED'});
    return null;
  }
  if(!(await requireAdminMfa(context,request,reply)))return null;
  return context;
}
function validateMetadata(value:unknown){
  if(value===undefined)return undefined;
  if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('INVALID_STORE_METADATA');
  const serialized=JSON.stringify(value);
  if(serialized.length>10_000)throw new Error('STORE_METADATA_TOO_LARGE');
  return value as Record<string,unknown>;
}
function normalizeBody(body:ItemBody,partial=false){
  const code=body.code?.trim().toLowerCase();
  const type=body.type;
  const name=body.name?.trim();
  const description=body.description===null?null:body.description?.trim();
  const priceMilli=body.priceMilli;
  const recipientShareMilli=body.recipientShareMilli;
  const status=body.status;
  const metadata=validateMetadata(body.metadata);
  if(!partial||code!==undefined){if(!code||!CODE_RE.test(code))throw new Error('INVALID_ITEM_CODE');}
  if(!partial||type!==undefined){if(!type||!ITEM_TYPES.has(type))throw new Error('INVALID_ITEM_TYPE');}
  if(!partial||name!==undefined){if(!name||name.length>120)throw new Error('INVALID_ITEM_NAME');}
  if(description!==undefined&&description!==null&&description.length>500)throw new Error('INVALID_ITEM_DESCRIPTION');
  if(!partial||priceMilli!==undefined){
    if(!Number.isSafeInteger(priceMilli)||Number(priceMilli)<=0)throw new Error('INVALID_ITEM_PRICE');
  }
  if(recipientShareMilli!==undefined&&(!Number.isSafeInteger(recipientShareMilli)||recipientShareMilli<0))throw new Error('INVALID_RECIPIENT_SHARE');
  if(status!==undefined&&!STATUSES.has(status))throw new Error('INVALID_ITEM_STATUS');
  return {code,type,name,description,priceMilli,recipientShareMilli,status,metadata};
}
async function item(id:string){
  const result=await query<ItemRow>(
    `SELECT id,code,item_type,name,description,price_milli,recipient_share_milli,
            consumable,asset_key,metadata,status,created_at,updated_at
       FROM store_items WHERE id=$1 LIMIT 1`,[id]
  );
  return result.rows[0]??null;
}
function itemError(reply:FastifyReply,error:unknown){
  const code=error instanceof Error?error.message:'STORE_ADMIN_FAILED';
  if(code==='STORE_ITEM_NOT_FOUND')return reply.code(404).send({error:code});
  if(code==='STORE_ITEM_CODE_TAKEN')return reply.code(409).send({error:code});
  if([
    'INVALID_ITEM_CODE','INVALID_ITEM_TYPE','INVALID_ITEM_NAME','INVALID_ITEM_DESCRIPTION',
    'INVALID_ITEM_PRICE','INVALID_RECIPIENT_SHARE','INVALID_ITEM_STATUS',
    'INVALID_STORE_METADATA','STORE_METADATA_TOO_LARGE','STORE_ASSET_INVALID',
    'STORE_ASSET_SIZE_INVALID','STORE_ASSET_FORMAT_INVALID','STORE_ASSET_TYPE_MISMATCH'
  ].includes(code))return reply.code(400).send({error:code});
  throw error;
}

export async function registerAdminStoreRoutes(app:FastifyInstance,options:{basePath:string}){
  const prefix=`${options.basePath}/admin/store`;

  app.get(`${prefix}/items`,async(request,reply)=>{
    const flood=await consumeRateLimit('admin-store-list-ip',`ip:${request.ip}`,300,60);
    if(!flood.allowed){
      reply.header('Retry-After',String(flood.retryAfterSeconds));
      return reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:flood.retryAfterSeconds});
    }
    const context=await requireStoreAdmin(request,reply);if(!context)return;
    const limiter=await consumeRateLimit('admin-store-list',`user:${context.user.id}`,120,60);
    if(!limiter.allowed){
      reply.header('Retry-After',String(limiter.retryAfterSeconds));
      return reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:limiter.retryAfterSeconds});
    }
    const result=await query<ItemRow>(
      `SELECT id,code,item_type,name,description,price_milli,recipient_share_milli,
              consumable,asset_key,metadata,status,created_at,updated_at
         FROM store_items ORDER BY item_type,name,id`
    );
    return reply.send({items:result.rows.map(dto)});
  });

  app.post<{Body:ItemBody}>(`${prefix}/items`,async(request,reply)=>{
    const flood=await consumeRateLimit('admin-store-create-ip',`ip:${request.ip}`,90,60);
    if(!flood.allowed){
      reply.header('Retry-After',String(flood.retryAfterSeconds));
      return reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:flood.retryAfterSeconds});
    }
    const context=await requireStoreAdmin(request,reply);if(!context)return;
    try{
      const body=normalizeBody(request.body);
    const limiter=await consumeRateLimit('admin-store-create',`user:${context.user.id}`,30,60);
    if(!limiter.allowed){
      reply.header('Retry-After',String(limiter.retryAfterSeconds));
      return reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:limiter.retryAfterSeconds});
    }
      const type=body.type!;
      const recipientShare=type==='gift'||type==='reaction'?body.recipientShareMilli??0:0;
      if(recipientShare>body.priceMilli!)throw new Error('INVALID_RECIPIENT_SHARE');
      const result=await query<ItemRow>(
        `INSERT INTO store_items(
           id,code,item_type,name,description,price_milli,recipient_share_milli,consumable,metadata,status
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
         RETURNING id,code,item_type,name,description,price_milli,recipient_share_milli,
                   consumable,asset_key,metadata,status,created_at,updated_at`,
        [randomUUID(),body.code,type,body.name,body.description??null,body.priceMilli,recipientShare,
         type==='gift'||type==='reaction',JSON.stringify(body.metadata??{}),body.status??'draft']
      );
      const created=result.rows[0]!;
      await auditAdminAction(null,context.user.id,'store_item_created',{metadata:{itemId:created.id,code:created.code,type:created.item_type}});
      return reply.code(201).send({item:dto(created)});
    }catch(error){
      if((error as {code?:string}).code==='23505')return reply.code(409).send({error:'STORE_ITEM_CODE_TAKEN'});
      return itemError(reply,error);
    }
  });

  app.patch<{Params:{itemId:string};Body:ItemBody}>(`${prefix}/items/:itemId`,async(request,reply)=>{
    const flood=await consumeRateLimit('admin-store-update-ip',`ip:${request.ip}`,180,60);
    if(!flood.allowed){
      reply.header('Retry-After',String(flood.retryAfterSeconds));
      return reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:flood.retryAfterSeconds});
    }
    const context=await requireStoreAdmin(request,reply);if(!context)return;
    try{
      const current=await item(request.params.itemId);if(!current)throw new Error('STORE_ITEM_NOT_FOUND');
    const limiter=await consumeRateLimit('admin-store-update',`user:${context.user.id}`,60,60);
    if(!limiter.allowed){
      reply.header('Retry-After',String(limiter.retryAfterSeconds));
      return reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:limiter.retryAfterSeconds});
    }
      const body=normalizeBody(request.body,true);
      const nextType=body.type??current.item_type;
      const nextPrice=body.priceMilli??asInt(current.price_milli);
      const nextShare=(nextType==='gift'||nextType==='reaction')
        ? body.recipientShareMilli??asInt(current.recipient_share_milli)
        : 0;
      if(nextShare>nextPrice)throw new Error('INVALID_RECIPIENT_SHARE');
      const nextMetadata=body.metadata===undefined?current.metadata:body.metadata;
      const result=await query<ItemRow>(
        `UPDATE store_items SET
           code=COALESCE($2,code),item_type=COALESCE($3,item_type),name=COALESCE($4,name),
           description=CASE WHEN $5::boolean THEN $6 ELSE description END,
           price_milli=COALESCE($7,price_milli),recipient_share_milli=$8,
           consumable=$9,metadata=$10::jsonb,status=COALESCE($11,status),updated_at=now()
         WHERE id=$1
         RETURNING id,code,item_type,name,description,price_milli,recipient_share_milli,
                   consumable,asset_key,metadata,status,created_at,updated_at`,
        [current.id,body.code??null,body.type??null,body.name??null,request.body.description!==undefined,
         body.description??null,body.priceMilli??null,nextShare,nextType==='gift'||nextType==='reaction',
         JSON.stringify(nextMetadata),body.status??null]
      );
      const updated=result.rows[0]!;
      await auditAdminAction(null,context.user.id,'store_item_updated',{metadata:{itemId:updated.id,code:updated.code,status:updated.status}});
      return reply.send({item:dto(updated)});
    }catch(error){
      if((error as {code?:string}).code==='23505')return reply.code(409).send({error:'STORE_ITEM_CODE_TAKEN'});
      return itemError(reply,error);
    }
  });

  app.delete<{Params:{itemId:string}}>(`${prefix}/items/:itemId`,async(request,reply)=>{
    const flood=await consumeRateLimit('admin-store-retire-ip',`ip:${request.ip}`,90,60);
    if(!flood.allowed){
      reply.header('Retry-After',String(flood.retryAfterSeconds));
      return reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:flood.retryAfterSeconds});
    }
    const context=await requireStoreAdmin(request,reply);if(!context)return;
    const current=await item(request.params.itemId);
    const limiter=await consumeRateLimit('admin-store-retire',`user:${context.user.id}`,30,60);
    if(!limiter.allowed){
      reply.header('Retry-After',String(limiter.retryAfterSeconds));
      return reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:limiter.retryAfterSeconds});
    }
    if(!current)return reply.code(404).send({error:'STORE_ITEM_NOT_FOUND'});
    await query("UPDATE store_items SET status='hidden',updated_at=now() WHERE id=$1",[current.id]);
    await auditAdminAction(null,context.user.id,'store_item_retired',{metadata:{itemId:current.id,code:current.code}});
    return reply.code(204).send();
  });

  app.post<{Params:{itemId:string};Body:AssetBody}>(
    `${prefix}/items/:itemId/asset`,
    {bodyLimit:1500*1024},
    async(request,reply)=>{
    const flood=await consumeRateLimit('admin-store-asset-ip',`ip:${request.ip}`,60,60);
    if(!flood.allowed){
      reply.header('Retry-After',String(flood.retryAfterSeconds));
      return reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:flood.retryAfterSeconds});
    }
      const context=await requireStoreAdmin(request,reply);if(!context)return;
      const limiter=await consumeRateLimit('admin-store-asset',`user:${context.user.id}`,20,60);
      if(!limiter.allowed){
        reply.header('Retry-After',String(limiter.retryAfterSeconds));
        return reply.code(429).send({error:'RATE_LIMITED',retryAfterSeconds:limiter.retryAfterSeconds});
      }
      let stored:{storageKey:string;mime:string;bytes:number}|null=null;
      try{
        const current=await item(request.params.itemId);if(!current)throw new Error('STORE_ITEM_NOT_FOUND');
        const raw=request.body.base64?.trim()??'';
        if(!raw||raw.length>1_400_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))throw new Error('STORE_ASSET_INVALID');
        const buffer=Buffer.from(raw,'base64');
        stored=await storeStoreAsset(buffer,current.item_type);
        const metadata={...current.metadata,assetMime:stored.mime,assetBytes:stored.bytes};
        await query('UPDATE store_items SET asset_key=$2,metadata=$3::jsonb,updated_at=now() WHERE id=$1',
          [current.id,stored.storageKey,JSON.stringify(metadata)]);
        if(current.asset_key&&current.asset_key!==stored.storageKey)await deleteStoredFile(current.asset_key);
        await auditAdminAction(null,context.user.id,'store_item_asset_uploaded',{
          metadata:{itemId:current.id,code:current.code,mime:stored.mime,bytes:stored.bytes}
        });
        return reply.send({asset:{mime:stored.mime,bytes:stored.bytes}});
      }catch(error){
        if(stored)await deleteStoredFile(stored.storageKey);
        return itemError(reply,error);
      }
    }
  );
}
