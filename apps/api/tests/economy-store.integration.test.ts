import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { query, withTransaction } from '../src/db.js';

const buyer={username:'store_buyer_ci',phone:'+218912345771',displayName:'مشتري المتجر'};
const receiver={username:'store_receiver_ci',phone:'+218912345772',displayName:'مستلم الهدية'};
const usernames=[buyer.username,receiver.username];
const frameCode='ci_neon_frame';

async function cleanup(){
  const users=await query<{id:string}>('SELECT id FROM users WHERE username_normalized=ANY($1::text[])',[usernames]);
  const userIds=users.rows.map((r)=>r.id);
  if(userIds.length>0){
    await query('DELETE FROM gift_events WHERE sender_user_id=ANY($1::uuid[]) OR recipient_user_id=ANY($1::uuid[])',[userIds]);
    await query('DELETE FROM user_equipment WHERE user_id=ANY($1::uuid[])',[userIds]);
    await query('DELETE FROM user_entitlements WHERE user_id=ANY($1::uuid[])',[userIds]);
    await query('DELETE FROM manual_topup_requests WHERE user_id=ANY($1::uuid[])',[userIds]);
    const accounts=await query<{id:string}>('SELECT id FROM wallet_accounts WHERE owner_user_id=ANY($1::uuid[])',[userIds]);
    const accountIds=accounts.rows.map((r)=>r.id);
    if(accountIds.length>0){
      const txs=await query<{transaction_id:string}>('SELECT DISTINCT transaction_id FROM wallet_postings WHERE account_id=ANY($1::uuid[])',[accountIds]);
      const txIds=txs.rows.map((r)=>r.transaction_id);
      if(txIds.length>0){
        await query('DELETE FROM wallet_postings WHERE transaction_id=ANY($1::uuid[])',[txIds]);
        await query('DELETE FROM wallet_transactions WHERE id=ANY($1::uuid[])',[txIds]);
      }
      await query('DELETE FROM wallet_accounts WHERE id=ANY($1::uuid[])',[accountIds]);
    }
    await query(
      `UPDATE wallet_accounts a SET balance_milli=COALESCE((
         SELECT sum(p.amount_milli) FROM wallet_postings p WHERE p.account_id=a.id
       ),0),updated_at=now() WHERE a.owner_user_id IS NULL`
    );
    await query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[userIds]);
    await query('DELETE FROM user_devices WHERE user_id=ANY($1::uuid[])',[userIds]);
    await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[userIds]);
  }
  await query('DELETE FROM store_items WHERE code=$1',[frameCode]);
}

async function register(app:Awaited<ReturnType<typeof buildApp>>,user:typeof buyer){
  const response=await app.inject({method:'POST',url:'/3aksa/api/auth/register',payload:{
    username:user.username,displayName:user.displayName,phone:user.phone,gender:'boy',
    password:'StrongPass123!',deviceId:`ci-${user.username}`,platform:'ci'
  }});
  assert.equal(response.statusCode,201,response.body);
  return response.json<{accessToken:string;user:{id:string;username:string}}>();
}

function auth(token:string){return{authorization:`Bearer ${token}`};}

async function seedBalance(userId:string,amountMilli:number){
  await withTransaction(async(client)=>{
    const ua=await client.query<{id:string}>('SELECT id FROM wallet_accounts WHERE owner_user_id=$1 LIMIT 1',[userId]);
    const ca=await client.query<{id:string}>("SELECT id FROM wallet_accounts WHERE system_code='topup_clearing' LIMIT 1");
    assert.ok(ua.rows[0]?.id); assert.ok(ca.rows[0]?.id);
    const tx=randomUUID();
    await client.query("INSERT INTO wallet_transactions (id,kind,metadata) VALUES ($1,'manual_topup',$2::jsonb)",[tx,JSON.stringify({testSeed:true,amountMilli})]);
    await client.query(
      'INSERT INTO wallet_postings (id,transaction_id,account_id,amount_milli) VALUES ($1,$2,$3,$4),($5,$2,$6,$7)',
      [randomUUID(),tx,ca.rows[0]!.id,-amountMilli,randomUUID(),ua.rows[0]!.id,amountMilli]
    );
    await client.query('UPDATE wallet_accounts SET balance_milli=balance_milli-$2 WHERE id=$1',[ca.rows[0]!.id,amountMilli]);
    await client.query('UPDATE wallet_accounts SET balance_milli=balance_milli+$2 WHERE id=$1',[ua.rows[0]!.id,amountMilli]);
  });
}

test('topups stay pending while store purchases and gifts settle atomically',async()=>{
  await cleanup();
  const app=await buildApp();
  try{
    const b=await register(app,buyer);
    const r=await register(app,receiver);
    for(const session of [b,r]){
      const wallet=await app.inject({method:'GET',url:'/3aksa/api/wallet',headers:auth(session.accessToken)});
      assert.equal(wallet.statusCode,200,wallet.body);
      assert.equal(wallet.json<{balanceMilli:number}>().balanceMilli,0);
    }

    const topup=await app.inject({method:'POST',url:'/3aksa/api/wallet/topups',headers:auth(b.accessToken),payload:{
      amountMilli:20_000,paymentReference:'CI-REF-001',note:'اختبار طلب شحن'
    }});
    assert.equal(topup.statusCode,201,topup.body);
    const topupBody=topup.json<{topup:{id:string;status:string}}>();
    assert.equal(topupBody.topup.status,'pending');
    const balanceAfterRequest=await app.inject({method:'GET',url:'/3aksa/api/wallet',headers:auth(b.accessToken)});
    assert.equal(balanceAfterRequest.json<{balanceMilli:number}>().balanceMilli,0);

    const secondPending=await app.inject({method:'POST',url:'/3aksa/api/wallet/topups',headers:auth(b.accessToken),payload:{amountMilli:10_000}});
    assert.equal(secondPending.statusCode,409,secondPending.body);
    assert.equal(secondPending.json<{error:string}>().error,'TOPUP_REQUEST_ALREADY_PENDING');

    const cancel=await app.inject({method:'DELETE',url:`/3aksa/api/wallet/topups/${topupBody.topup.id}`,headers:auth(b.accessToken)});
    assert.equal(cancel.statusCode,200,cancel.body);
    assert.equal(cancel.json<{topup:{status:string}}>().topup.status,'cancelled');

    await query(
      `INSERT INTO store_items (id,code,item_type,name,description,price_milli,recipient_share_milli,consumable,status)
       VALUES ($1,$2,'frame','إطار CI','اختبار',2000,0,false,'active')`,
      [randomUUID(),frameCode]
    );
    await seedBalance(b.user.id,10_000);

    const frameList=await app.inject({method:'GET',url:'/3aksa/api/store/items?type=frame',headers:auth(b.accessToken)});
    assert.equal(frameList.statusCode,200,frameList.body);
    assert.ok(frameList.json<{items:Array<{code:string}>}>().items.some((i)=>i.code===frameCode));

    const purchaseKey=randomUUID();
    const purchase=await app.inject({method:'POST',url:'/3aksa/api/store/purchases',headers:{...auth(b.accessToken),'idempotency-key':purchaseKey},payload:{code:frameCode}});
    assert.equal(purchase.statusCode,201,purchase.body);
    const purchaseBody=purchase.json<{transaction:{id:string};balanceMilli:number;replayed:boolean}>();
    assert.equal(purchaseBody.balanceMilli,8_000);
    assert.equal(purchaseBody.replayed,false);

    const purchaseReplay=await app.inject({method:'POST',url:'/3aksa/api/store/purchases',headers:{...auth(b.accessToken),'idempotency-key':purchaseKey},payload:{code:frameCode}});
    assert.equal(purchaseReplay.statusCode,200,purchaseReplay.body);
    const purchaseReplayBody=purchaseReplay.json<{transaction:{id:string};balanceMilli:number;replayed:boolean}>();
    assert.equal(purchaseReplayBody.transaction.id,purchaseBody.transaction.id);
    assert.equal(purchaseReplayBody.balanceMilli,8_000);
    assert.equal(purchaseReplayBody.replayed,true);

    const inventory=await app.inject({method:'GET',url:'/3aksa/api/store/inventory',headers:auth(b.accessToken)});
    assert.ok(inventory.json<{items:Array<{code:string}>}>().items.some((i)=>i.code===frameCode));
    const equip=await app.inject({method:'PUT',url:'/3aksa/api/store/equipment',headers:auth(b.accessToken),payload:{code:frameCode}});
    assert.equal(equip.statusCode,200,equip.body);
    assert.equal(equip.json<{equipment:{slot:string;item:{code:string}}}>().equipment.slot,'frame');
    assert.equal(equip.json<{equipment:{slot:string;item:{code:string}}}>().equipment.item.code,frameCode);

    const giftKey=randomUUID();
    const gift=await app.inject({method:'POST',url:'/3aksa/api/gifts/send',headers:{...auth(b.accessToken),'idempotency-key':giftKey},payload:{
      recipientUsername:receiver.username,giftCode:'rose'
    }});
    assert.equal(gift.statusCode,201,gift.body);
    const giftBody=gift.json<{transaction:{id:string};balanceMilli:number;replayed:boolean}>();
    assert.equal(giftBody.balanceMilli,7_000);
    assert.equal(giftBody.replayed,false);

    const giftReplay=await app.inject({method:'POST',url:'/3aksa/api/gifts/send',headers:{...auth(b.accessToken),'idempotency-key':giftKey},payload:{
      recipientUsername:receiver.username,giftCode:'rose'
    }});
    assert.equal(giftReplay.statusCode,200,giftReplay.body);
    assert.equal(giftReplay.json<{transaction:{id:string}}>().transaction.id,giftBody.transaction.id);

    const receiverWallet=await app.inject({method:'GET',url:'/3aksa/api/wallet',headers:auth(r.accessToken)});
    assert.equal(receiverWallet.json<{balanceMilli:number}>().balanceMilli,500);
    const buyerWallet=await app.inject({method:'GET',url:'/3aksa/api/wallet',headers:auth(b.accessToken)});
    assert.equal(buyerWallet.json<{balanceMilli:number}>().balanceMilli,7_000);

    const gifts=await app.inject({method:'GET',url:'/3aksa/api/gifts/received',headers:auth(r.accessToken)});
    const received=gifts.json<{gifts:Array<{item:{code:string};recipientShareMilli:number;platformShareMilli:number}>}>().gifts;
    assert.ok(received.some((g)=>g.item.code==='rose'&&g.recipientShareMilli===500&&g.platformShareMilli===500));

    const sameItemAgain=await app.inject({method:'POST',url:'/3aksa/api/store/purchases',headers:{...auth(b.accessToken),'idempotency-key':randomUUID()},payload:{code:frameCode}});
    assert.equal(sameItemAgain.statusCode,409,sameItemAgain.body);
    assert.equal(sameItemAgain.json<{error:string}>().error,'ALREADY_OWNED');

    const unbalanced=await query<{transaction_id:string}>(
      'SELECT transaction_id FROM wallet_postings GROUP BY transaction_id HAVING sum(amount_milli)<>0'
    );
    assert.equal(unbalanced.rows.length,0);
  }finally{
    await cleanup();
    await app.close();
  }
});
