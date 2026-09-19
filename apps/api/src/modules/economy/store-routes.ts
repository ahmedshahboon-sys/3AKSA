import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest } from '../auth/session.js';
import { openStoredFile } from '../../storage.js';
import { createNotification } from '../notifications/service.js';
import { featureEnabled } from '../features/service.js';
import { formatLydFromMilli } from './service.js';
import {
  equipOwnedItem,
  listEquipment,
  listInventory,
  listReceivedGifts,
  listStoreItems,
  purchaseStoreItem,
  publicStoreAsset,
  sendPaidGift
} from './store.js';

type PurchaseBody={ code?:string };
type EquipBody={ code?:string };
type GiftBody={ recipientUsername?:string; giftCode?:string; contextType?:'profile'|'room'|'room_message'|'private_message'; contextId?:string };
type ItemQuery={ type?:string };

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_TYPES=new Set(['frame','entry_sound','theme','sticker_pack','badge','gift','reaction']);

async function requireUser(request:FastifyRequest,reply:FastifyReply){
  const user=await authenticateRequest(request);
  if(!user) reply.code(401).send({error:'UNAUTHORIZED'});
  return user;
}

function idempotencyKey(request:FastifyRequest){
  const raw=request.headers['idempotency-key'];
  const value=Array.isArray(raw)?raw[0]:raw;
  return typeof value==='string'?value.trim():'';
}

export async function registerStoreRoutes(app:FastifyInstance,options:{basePath:string}){
  const prefix=`${options.basePath}/store`;

  app.get<{Params:{code:string}}>(`${prefix}/assets/:code`,async(request,reply)=>{
    const code=request.params.code.trim().toLowerCase();
    if(!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(code))return reply.code(404).send({error:'STORE_ASSET_NOT_FOUND'});
    const asset=await publicStoreAsset(code);
    if(!asset)return reply.code(404).send({error:'STORE_ASSET_NOT_FOUND'});
    reply.header('Cache-Control','public, max-age=3600');
    reply.header('X-Content-Type-Options','nosniff');
    reply.type(asset.mime);
    return reply.send(openStoredFile(asset.storageKey));
  });

  app.get<{Querystring:ItemQuery}>(`${prefix}/items`,async(request,reply)=>{
    if(!(await featureEnabled('store').catch(()=>false)))return reply.code(503).send({error:'FEATURE_DISABLED'});
    const user=await requireUser(request,reply);
    if(!user) return;
    const type=request.query.type?.trim();
    if(type && !ITEM_TYPES.has(type)) return reply.code(400).send({error:'INVALID_ITEM_TYPE'});
    const paidEnabled=await featureEnabled('paid_features').catch(()=>false);
    if(type&&(type==='gift'||type==='reaction')&&!paidEnabled)return reply.send({items:[]});
    const items=type
      ? await listStoreItems(type as 'frame'|'entry_sound'|'theme'|'sticker_pack'|'badge'|'gift'|'reaction')
      : await listStoreItems();
    return reply.send({items:paidEnabled?items:items.filter(item=>item.type!=='gift'&&item.type!=='reaction')});
  });

  app.get(`${prefix}/inventory`,async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user) return;
    return reply.send({items:await listInventory(user.id)});
  });

  app.get(`${prefix}/equipment`,async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user) return;
    return reply.send({equipment:await listEquipment(user.id)});
  });

  app.put<{Body:EquipBody}>(`${prefix}/equipment`,async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user) return;
    const code=request.body.code?.trim() ?? '';
    if(!code) return reply.code(400).send({error:'INVALID_ITEM_CODE'});
    try{
      return reply.send({equipment:await equipOwnedItem(user.id,code)});
    }catch(error){
      const code=error instanceof Error?error.message:'';
      if(code==='ITEM_NOT_OWNED') return reply.code(404).send({error:code});
      if(code==='ITEM_NOT_EQUIPPABLE') return reply.code(409).send({error:code});
      throw error;
    }
  });

  app.post<{Body:PurchaseBody}>(`${prefix}/purchases`,async(request,reply)=>{
    if(!(await featureEnabled('store').catch(()=>false)))return reply.code(503).send({error:'FEATURE_DISABLED'});
    const user=await requireUser(request,reply);
    if(!user) return;
    const code=request.body.code?.trim() ?? '';
    const key=idempotencyKey(request);
    if(!UUID_RE.test(key)) return reply.code(400).send({error:'INVALID_IDEMPOTENCY_KEY'});
    if(!code) return reply.code(400).send({error:'INVALID_ITEM_CODE'});
    try{
      const result=await purchaseStoreItem(user.id,code,key);
      if(!result.replayed){
        await createNotification({
          userId:user.id,
          type:'purchase',
          title:'شراء ناجح',
          body:`تم شراء ${result.item.name} بنجاح`,
          data:{transactionId:result.transaction.id,itemId:result.item.id,itemCode:result.item.code},
          soundKey:'purchase_success'
        });
      }
      return reply.code(result.replayed?200:201).send({
        transaction:{id:result.transaction.id,kind:result.transaction.kind,createdAt:result.transaction.created_at},
        item:result.item,
        balanceMilli:result.balanceMilli,
        balanceLyd:formatLydFromMilli(result.balanceMilli),
        currency:'LYD',
        replayed:result.replayed
      });
    }catch(error){
      const code=error instanceof Error?error.message:'';
      if(code==='STORE_ITEM_NOT_FOUND') return reply.code(404).send({error:code});
      if(code==='ITEM_NOT_PURCHASABLE'||code==='ALREADY_OWNED'||code==='INSUFFICIENT_BALANCE'||code==='IDEMPOTENCY_KEY_REUSED'){
        return reply.code(409).send({error:code});
      }
      throw error;
    }
  });

  app.post<{Body:GiftBody}>(`${options.basePath}/gifts/send`,async(request,reply)=>{
    if(!(await featureEnabled('paid_features').catch(()=>false)))return reply.code(503).send({error:'FEATURE_DISABLED'});
    const user=await requireUser(request,reply);
    if(!user) return;
    const recipientUsername=request.body.recipientUsername?.trim() ?? '';
    const giftCode=request.body.giftCode?.trim() ?? '';
    const key=idempotencyKey(request);
    if(!UUID_RE.test(key)) return reply.code(400).send({error:'INVALID_IDEMPOTENCY_KEY'});
    if(!recipientUsername||!giftCode) return reply.code(400).send({error:'INVALID_GIFT'});
    try{
      const result=await sendPaidGift(user.id,recipientUsername,giftCode,key,request.body.contextType,request.body.contextId);
      if(!result.replayed){
        const paidReaction=result.item.type==='reaction';
        await createNotification({
          userId:result.recipient.id,
          type:paidReaction?'paid_reaction':'gift_received',
          title:paidReaction?'تفاعل مدفوع جديد':'هدية جديدة',
          body:paidReaction?`${user.display_name} تفاعل معاك بـ ${result.item.name}`:`${user.display_name} بعثلك ${result.item.name}`,
          data:{
            transactionId:result.transaction.id,
            itemId:result.item.id,
            itemCode:result.item.code,
            username:user.username
          },
          soundKey:'gift_received'
        });
      }
      return reply.code(result.replayed?200:201).send({
        transaction:{id:result.transaction.id,kind:result.transaction.kind,createdAt:result.transaction.created_at},
        item:result.item,
        recipient:{id:result.recipient.id,username:result.recipient.username,displayName:result.recipient.display_name},
        balanceMilli:result.balanceMilli,
        balanceLyd:formatLydFromMilli(result.balanceMilli),
        currency:'LYD',replayed:result.replayed
      });
    }catch(error){
      const code=error instanceof Error?error.message:'';
      if(code==='RECIPIENT_NOT_FOUND'||code==='GIFT_NOT_FOUND') return reply.code(404).send({error:code});
      if(code==='CANNOT_GIFT_SELF'||code==='RELATIONSHIP_BLOCKED'||code==='INSUFFICIENT_BALANCE'||code==='IDEMPOTENCY_KEY_REUSED'){
        return reply.code(409).send({error:code});
      }
      throw error;
    }
  });

  app.get(`${options.basePath}/gifts/received`,async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user) return;
    return reply.send({gifts:await listReceivedGifts(user.id)});
  });
}
