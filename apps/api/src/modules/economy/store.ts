import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db.js';
import { normalizeUsername } from '../auth/security.js';
import {
  activeUserByUsername,
  asSafeInteger,
  ensureUserWallet,
  formatLydFromMilli,
  type WalletAccountRow,
  type WalletTransactionRow
} from './service.js';

type StoreItemType = 'frame' | 'entry_sound' | 'theme' | 'sticker_pack' | 'badge' | 'gift' | 'reaction';
type EquipSlot = 'frame' | 'entry_sound' | 'theme' | 'badge';

type StoreItemRow = {
  id: string;
  code: string;
  item_type: StoreItemType;
  name: string;
  description: string | null;
  price_milli: string;
  recipient_share_milli: string;
  consumable: boolean;
  asset_key: string | null;
  metadata: Record<string, unknown>;
  status: 'draft' | 'active' | 'hidden';
};

type EntitlementRow = StoreItemRow & { acquired_at: Date };
type EquipmentRow = StoreItemRow & { slot: EquipSlot; equipped_at: Date };

function itemDto(row: StoreItemRow) {
  const priceMilli = asSafeInteger(row.price_milli);
  return {
    id: row.id,
    code: row.code,
    type: row.item_type,
    name: row.name,
    description: row.description,
    priceMilli,
    priceLyd: formatLydFromMilli(priceMilli),
    currency: 'LYD' as const,
    consumable: row.consumable,
    metadata: row.metadata
  };
}

async function itemByCode(client: PoolClient, code: string, activeOnly=true) {
  const result=await client.query<StoreItemRow>(
    `SELECT id,code,item_type,name,description,price_milli,recipient_share_milli,
            consumable,asset_key,metadata,status
     FROM store_items
     WHERE code=$1 ${activeOnly ? "AND status='active'" : ''}
     LIMIT 1`,
    [code]
  );
  return result.rows[0] ?? null;
}

async function itemById(client: PoolClient, id: string) {
  const result=await client.query<StoreItemRow>(
    `SELECT id,code,item_type,name,description,price_milli,recipient_share_milli,
            consumable,asset_key,metadata,status
     FROM store_items
     WHERE id=$1
     LIMIT 1`,
    [id]
  );
  return result.rows[0] ?? null;
}

async function systemAccount(client: PoolClient, code: string) {
  const result=await client.query<WalletAccountRow>(
    `SELECT id,owner_user_id,balance_milli
     FROM wallet_accounts
     WHERE system_code=$1
     LIMIT 1`,
    [code]
  );
  const account=result.rows[0];
  if(!account) throw new Error('SYSTEM_WALLET_NOT_FOUND');
  return account;
}

async function transactionByKey(client: PoolClient, userId: string, key: string) {
  const result=await client.query<WalletTransactionRow>(
    `SELECT id,kind,initiator_user_id,idempotency_key,metadata,created_at
     FROM wallet_transactions
     WHERE initiator_user_id=$1 AND idempotency_key=$2
     LIMIT 1`,
    [userId,key]
  );
  return result.rows[0] ?? null;
}

async function lockAccounts(client: PoolClient, ids: string[]) {
  return client.query<WalletAccountRow>(
    `SELECT id,owner_user_id,balance_milli
     FROM wallet_accounts
     WHERE id=ANY($1::uuid[])
     ORDER BY id
     FOR UPDATE`,
    [ids]
  );
}

export async function listStoreItems(type?: StoreItemType) {
  const values: unknown[]=[];
  let typeClause='';
  if(type){ values.push(type); typeClause='AND item_type=$1'; }
  const result=await query<StoreItemRow>(
    `SELECT id,code,item_type,name,description,price_milli,recipient_share_milli,
            consumable,asset_key,metadata,status
     FROM store_items
     WHERE status='active' ${typeClause}
     ORDER BY item_type,name,id`,
    values
  );
  return result.rows.map(itemDto);
}

export async function listInventory(userId: string) {
  const result=await query<EntitlementRow>(
    `SELECT i.id,i.code,i.item_type,i.name,i.description,i.price_milli,
            i.recipient_share_milli,i.consumable,i.asset_key,i.metadata,i.status,
            e.acquired_at
     FROM user_entitlements e
     JOIN store_items i ON i.id=e.item_id
     WHERE e.user_id=$1
     ORDER BY e.acquired_at DESC,e.id DESC`,
    [userId]
  );
  return result.rows.map((row)=>({ ...itemDto(row), acquiredAt: row.acquired_at }));
}

export async function listEquipment(userId: string) {
  const result=await query<EquipmentRow>(
    `SELECT i.id,i.code,i.item_type,i.name,i.description,i.price_milli,
            i.recipient_share_milli,i.consumable,i.asset_key,i.metadata,i.status,
            e.slot,e.equipped_at
     FROM user_equipment e
     JOIN store_items i ON i.id=e.item_id
     WHERE e.user_id=$1
     ORDER BY e.slot`,
    [userId]
  );
  return result.rows.map((row)=>({ slot: row.slot, item: itemDto(row), equippedAt: row.equipped_at }));
}

function assertPurchaseReplay(tx: WalletTransactionRow, requestedCode: string) {
  if(tx.kind!=='purchase' || tx.metadata.itemCode!==requestedCode){
    throw new Error('IDEMPOTENCY_KEY_REUSED');
  }
}

async function purchaseReplayResult(
  client: PoolClient,
  userId: string,
  requestedCode: string,
  tx: WalletTransactionRow
) {
  assertPurchaseReplay(tx, requestedCode);
  const itemId=typeof tx.metadata.itemId==='string' ? tx.metadata.itemId : '';
  const item=itemId ? await itemById(client,itemId) : null;
  if(!item) throw new Error('STORE_ITEM_NOT_FOUND');
  const account=await ensureUserWallet(client,userId);
  return {
    transaction:tx,
    item:itemDto(item),
    balanceMilli:asSafeInteger(account.balance_milli),
    replayed:true
  };
}

export async function purchaseStoreItem(userId: string, code: string, key: string) {
  return withTransaction(async (client)=>{
    const prior=await transactionByKey(client,userId,key);
    if(prior) return purchaseReplayResult(client,userId,code,prior);

    const item=await itemByCode(client,code,true);
    if(!item) throw new Error('STORE_ITEM_NOT_FOUND');
    if(item.consumable || item.item_type==='gift' || item.item_type==='reaction'){
      throw new Error('ITEM_NOT_PURCHASABLE');
    }
    const priceMilli=asSafeInteger(item.price_milli);
    const userAccount=await ensureUserWallet(client,userId);
    const platform=await systemAccount(client,'platform_revenue');
    const locked=await lockAccounts(client,[userAccount.id,platform.id]);
    const lockedUser=locked.rows.find((row)=>row.id===userAccount.id);
    if(!lockedUser) throw new Error('WALLET_NOT_FOUND');

    const racedPrior=await transactionByKey(client,userId,key);
    if(racedPrior) return purchaseReplayResult(client,userId,code,racedPrior);

    const owned=await client.query<{ id: string }>(
      'SELECT id FROM user_entitlements WHERE user_id=$1 AND item_id=$2 LIMIT 1',
      [userId,item.id]
    );
    if(owned.rows[0]) throw new Error('ALREADY_OWNED');

    const balance=asSafeInteger(lockedUser.balance_milli);
    if(balance<priceMilli) throw new Error('INSUFFICIENT_BALANCE');

    const txId=randomUUID();
    const metadata={ itemId:item.id,itemCode:item.code,itemType:item.item_type,priceMilli };
    const inserted=await client.query<WalletTransactionRow>(
      `INSERT INTO wallet_transactions (
         id,kind,initiator_user_id,idempotency_key,reference_type,reference_id,metadata
       ) VALUES ($1,'purchase',$2,$3,'store_item',$4,$5::jsonb)
       RETURNING id,kind,initiator_user_id,idempotency_key,metadata,created_at`,
      [txId,userId,key,item.id,JSON.stringify(metadata)]
    );
    await client.query(
      `INSERT INTO wallet_postings (id,transaction_id,account_id,amount_milli)
       VALUES ($1,$2,$3,$4),($5,$2,$6,$7)`,
      [randomUUID(),txId,userAccount.id,-priceMilli,randomUUID(),platform.id,priceMilli]
    );
    await client.query(
      'UPDATE wallet_accounts SET balance_milli=balance_milli-$2,updated_at=now() WHERE id=$1',
      [userAccount.id,priceMilli]
    );
    await client.query(
      'UPDATE wallet_accounts SET balance_milli=balance_milli+$2,updated_at=now() WHERE id=$1',
      [platform.id,priceMilli]
    );
    await client.query(
      `INSERT INTO user_entitlements (id,user_id,item_id,acquired_transaction_id)
       VALUES ($1,$2,$3,$4)`,
      [randomUUID(),userId,item.id,txId]
    );
    return { transaction: inserted.rows[0]!,item:itemDto(item),balanceMilli:balance-priceMilli,replayed:false };
  });
}

export async function equipOwnedItem(userId: string, code: string) {
  return withTransaction(async (client)=>{
    const result=await client.query<StoreItemRow>(
      `SELECT i.id,i.code,i.item_type,i.name,i.description,i.price_milli,
              i.recipient_share_milli,i.consumable,i.asset_key,i.metadata,i.status
       FROM user_entitlements e
       JOIN store_items i ON i.id=e.item_id
       WHERE e.user_id=$1 AND i.code=$2
       LIMIT 1`,
      [userId,code]
    );
    const item=result.rows[0];
    if(!item) throw new Error('ITEM_NOT_OWNED');
    if(!['frame','entry_sound','theme','badge'].includes(item.item_type)){
      throw new Error('ITEM_NOT_EQUIPPABLE');
    }
    const slot=item.item_type as EquipSlot;
    const equipped=await client.query<{ equipped_at: Date }>(
      `INSERT INTO user_equipment (user_id,slot,item_id,equipped_at)
       VALUES ($1,$2,$3,now())
       ON CONFLICT (user_id,slot)
       DO UPDATE SET item_id=EXCLUDED.item_id,equipped_at=now()
       RETURNING equipped_at`,
      [userId,slot,item.id]
    );
    return { slot,item:itemDto(item),equippedAt:equipped.rows[0]!.equipped_at };
  });
}

function assertGiftReplay(
  tx: WalletTransactionRow,
  recipientUsername: string,
  giftCode: string
) {
  const storedRecipient=typeof tx.metadata.recipientUsername==='string' ? tx.metadata.recipientUsername : '';
  if(
    tx.kind!=='gift' ||
    tx.metadata.itemCode!==giftCode ||
    normalizeUsername(storedRecipient)!==normalizeUsername(recipientUsername)
  ){
    throw new Error('IDEMPOTENCY_KEY_REUSED');
  }
}

async function giftReplayResult(
  client: PoolClient,
  senderUserId: string,
  recipientUsername: string,
  giftCode: string,
  tx: WalletTransactionRow
) {
  assertGiftReplay(tx,recipientUsername,giftCode);
  const itemId=typeof tx.metadata.itemId==='string' ? tx.metadata.itemId : '';
  const recipientId=typeof tx.metadata.recipientUserId==='string' ? tx.metadata.recipientUserId : '';
  const item=itemId ? await itemById(client,itemId) : null;
  if(!item) throw new Error('GIFT_NOT_FOUND');
  const recipientResult=recipientId
    ? await client.query<{id:string;username:string;display_name:string}>(
        'SELECT id,username,display_name FROM users WHERE id=$1 LIMIT 1',
        [recipientId]
      )
    : null;
  const recipient=recipientResult?.rows[0] ?? null;
  if(!recipient) throw new Error('RECIPIENT_NOT_FOUND');
  const sender=await ensureUserWallet(client,senderUserId);
  return {
    transaction:tx,
    item:itemDto(item),
    recipient,
    balanceMilli:asSafeInteger(sender.balance_milli),
    replayed:true
  };
}

export async function sendPaidGift(
  senderUserId: string,
  recipientUsername: string,
  giftCode: string,
  key: string,
  contextType?: 'profile'|'room'|'room_message'|'private_message',
  contextId?: string
) {
  return withTransaction(async (client)=>{
    const prior=await transactionByKey(client,senderUserId,key);
    if(prior) return giftReplayResult(client,senderUserId,recipientUsername,giftCode,prior);

    const recipient=await activeUserByUsername(client,recipientUsername);
    if(!recipient) throw new Error('RECIPIENT_NOT_FOUND');
    if(recipient.id===senderUserId) throw new Error('CANNOT_GIFT_SELF');
    const blocked=await client.query(
      `SELECT 1 FROM user_blocks
       WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)
       LIMIT 1`,
      [senderUserId,recipient.id]
    );
    if((blocked.rowCount ?? 0)>0) throw new Error('RELATIONSHIP_BLOCKED');

    const item=await itemByCode(client,giftCode,true);
    if(!item || !item.consumable || !['gift','reaction'].includes(item.item_type)){
      throw new Error('GIFT_NOT_FOUND');
    }
    const priceMilli=asSafeInteger(item.price_milli);
    const recipientShare=asSafeInteger(item.recipient_share_milli);
    const platformShare=priceMilli-recipientShare;

    const sender=await ensureUserWallet(client,senderUserId);
    const receiver=await ensureUserWallet(client,recipient.id);
    const platform=await systemAccount(client,'platform_revenue');
    const locked=await lockAccounts(client,[sender.id,receiver.id,platform.id]);
    const senderLocked=locked.rows.find((row)=>row.id===sender.id);
    if(!senderLocked) throw new Error('WALLET_NOT_FOUND');

    const racedPrior=await transactionByKey(client,senderUserId,key);
    if(racedPrior) return giftReplayResult(client,senderUserId,recipientUsername,giftCode,racedPrior);

    const balance=asSafeInteger(senderLocked.balance_milli);
    if(balance<priceMilli) throw new Error('INSUFFICIENT_BALANCE');
    const txId=randomUUID();
    const metadata={
      itemId:item.id,itemCode:item.code,recipientUserId:recipient.id,
      recipientUsername:recipient.username,amountMilli:priceMilli,recipientShareMilli:recipientShare,platformShareMilli:platformShare
    };
    const tx=await client.query<WalletTransactionRow>(
      `INSERT INTO wallet_transactions (
         id,kind,initiator_user_id,idempotency_key,reference_type,reference_id,metadata
       ) VALUES ($1,'gift',$2,$3,'store_item',$4,$5::jsonb)
       RETURNING id,kind,initiator_user_id,idempotency_key,metadata,created_at`,
      [txId,senderUserId,key,item.id,JSON.stringify(metadata)]
    );

    await client.query(
      'INSERT INTO wallet_postings (id,transaction_id,account_id,amount_milli) VALUES ($1,$2,$3,$4)',
      [randomUUID(),txId,sender.id,-priceMilli]
    );
    if(recipientShare>0){
      await client.query(
        'INSERT INTO wallet_postings (id,transaction_id,account_id,amount_milli) VALUES ($1,$2,$3,$4)',
        [randomUUID(),txId,receiver.id,recipientShare]
      );
    }
    if(platformShare>0){
      await client.query(
        'INSERT INTO wallet_postings (id,transaction_id,account_id,amount_milli) VALUES ($1,$2,$3,$4)',
        [randomUUID(),txId,platform.id,platformShare]
      );
    }

    await client.query(
      'UPDATE wallet_accounts SET balance_milli=balance_milli-$2,updated_at=now() WHERE id=$1',
      [sender.id,priceMilli]
    );
    if(recipientShare>0) await client.query(
      'UPDATE wallet_accounts SET balance_milli=balance_milli+$2,updated_at=now() WHERE id=$1',
      [receiver.id,recipientShare]
    );
    if(platformShare>0) await client.query(
      'UPDATE wallet_accounts SET balance_milli=balance_milli+$2,updated_at=now() WHERE id=$1',
      [platform.id,platformShare]
    );

    await client.query(
      `INSERT INTO gift_events (
         id,transaction_id,sender_user_id,recipient_user_id,item_id,amount_milli,
         recipient_share_milli,platform_share_milli,context_type,context_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [randomUUID(),txId,senderUserId,recipient.id,item.id,priceMilli,recipientShare,platformShare,contextType ?? null,contextId ?? null]
    );
    return { transaction:tx.rows[0]!,item:itemDto(item),recipient,balanceMilli:balance-priceMilli,replayed:false };
  });
}

export async function listReceivedGifts(userId: string, limit=50) {
  const result=await query<StoreItemRow & {
    gift_id:string;sender_id:string;sender_username:string;sender_display_name:string;
    amount_milli:string;recipient_share_milli_event:string;platform_share_milli:string;
    context_type:string|null;context_id:string|null;gift_created_at:Date;
  }>(
    `SELECT i.id,i.code,i.item_type,i.name,i.description,i.price_milli,
            i.recipient_share_milli,i.consumable,i.asset_key,i.metadata,i.status,
            g.id AS gift_id,g.sender_user_id AS sender_id,u.username AS sender_username,
            u.display_name AS sender_display_name,g.amount_milli,
            g.recipient_share_milli::text AS recipient_share_milli_event,
            g.platform_share_milli::text AS platform_share_milli,
            g.context_type,g.context_id,g.created_at AS gift_created_at
     FROM gift_events g
     JOIN store_items i ON i.id=g.item_id
     JOIN users u ON u.id=g.sender_user_id
     WHERE g.recipient_user_id=$1
     ORDER BY g.created_at DESC,g.id DESC
     LIMIT $2`,
    [userId,limit]
  );
  return result.rows.map((row)=>({
    id:row.gift_id,item:itemDto(row),
    sender:{id:row.sender_id,username:row.sender_username,displayName:row.sender_display_name},
    amountMilli:asSafeInteger(row.amount_milli),
    recipientShareMilli:asSafeInteger(row.recipient_share_milli_event),
    platformShareMilli:asSafeInteger(row.platform_share_milli),
    contextType:row.context_type,contextId:row.context_id,createdAt:row.gift_created_at
  }));
}
