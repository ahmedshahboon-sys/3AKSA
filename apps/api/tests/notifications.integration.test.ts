import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';
import { notificationEvents } from '../src/modules/notifications/events.js';
import {
  createNotification,
  processPendingNotificationDeliveries
} from '../src/modules/notifications/service.js';
import {
  approveManualTopupRequest,
  createManualTopupRequest
} from '../src/modules/economy/topups.js';

const a={username:'notify_a_ci',phone:'+218912345821',displayName:'أحمد إشعارات'};
const b={username:'notify_b_ci',phone:'+218912345822',displayName:'محمد إشعارات'};
const usernames=[a.username,b.username];

async function cleanup(){
  const users=await query<{id:string}>(
    'SELECT id FROM users WHERE username_normalized=ANY($1::text[])',[usernames]
  );
  const ids=users.rows.map((row)=>row.id);
  if(ids.length===0)return;

  await query('DELETE FROM manual_topup_requests WHERE user_id=ANY($1::uuid[])',[ids]);

  const accounts=await query<{id:string}>(
    'SELECT id FROM wallet_accounts WHERE owner_user_id=ANY($1::uuid[])',[ids]
  );
  const accountIds=accounts.rows.map((row)=>row.id);
  if(accountIds.length){
    const txs=await query<{transaction_id:string}>(
      'SELECT DISTINCT transaction_id FROM wallet_postings WHERE account_id=ANY($1::uuid[])',[accountIds]
    );
    const txIds=txs.rows.map((row)=>row.transaction_id);
    if(txIds.length){
      await query('DELETE FROM wallet_postings WHERE transaction_id=ANY($1::uuid[])',[txIds]);
      await query('DELETE FROM wallet_transactions WHERE id=ANY($1::uuid[])',[txIds]);
    }
    await query('DELETE FROM wallet_accounts WHERE id=ANY($1::uuid[])',[accountIds]);
  }
  await query(
    `UPDATE wallet_accounts a SET balance_milli=COALESCE(
       (SELECT sum(p.amount_milli) FROM wallet_postings p WHERE p.account_id=a.id),0
     ),updated_at=now() WHERE a.owner_user_id IS NULL`
  );

  await query('DELETE FROM private_messages WHERE sender_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM private_conversations WHERE user_low_id=ANY($1::uuid[]) OR user_high_id=ANY($1::uuid[])',[ids,ids]);
  await query('DELETE FROM friend_requests WHERE sender_id=ANY($1::uuid[]) OR receiver_id=ANY($1::uuid[])',[ids,ids]);
  await query('DELETE FROM friendships WHERE user_low_id=ANY($1::uuid[]) OR user_high_id=ANY($1::uuid[])',[ids,ids]);
  await query('DELETE FROM push_subscriptions WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM notifications WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM user_notification_preferences WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM user_devices WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
}

async function register(app:Awaited<ReturnType<typeof buildApp>>,info:typeof a){
  const response=await app.inject({
    method:'POST',url:'/3aksa/api/auth/register',
    payload:{
      username:info.username,displayName:info.displayName,phone:info.phone,gender:'boy',
      password:'StrongPass123!',deviceId:`ci-${info.username}`,platform:'ci'
    }
  });
  assert.equal(response.statusCode,201,response.body);
  return response.json<{accessToken:string;user:{id:string;username:string}}>();
}
function auth(token:string){return{authorization:`Bearer ${token}`};}

test('notification inbox, encrypted push, social, private and economy events integrate safely',async()=>{
  await cleanup();
  const app=await buildApp();
  try{
    const sa=await register(app,a);
    const sb=await register(app,b);

    const defaults=await app.inject({
      method:'GET',url:'/3aksa/api/notifications/preferences',headers:auth(sb.accessToken)
    });
    assert.equal(defaults.statusCode,200,defaults.body);
    assert.equal(defaults.json<{preferences:{pushEnabled:boolean;sounds:{muteAll:boolean}}}>().preferences.pushEnabled,true);
    assert.equal(defaults.json<{preferences:{sounds:{muteAll:boolean}}}>().preferences.sounds.muteAll,false);

    const preferences=await app.inject({
      method:'PATCH',url:'/3aksa/api/notifications/preferences',headers:auth(sb.accessToken),
      payload:{messageSounds:false,vibration:false,muteAll:false}
    });
    assert.equal(preferences.statusCode,200,preferences.body);
    assert.equal(preferences.json<{preferences:{sounds:{messages:boolean;vibration:boolean}}}>().preferences.sounds.messages,false);
    assert.equal(preferences.json<{preferences:{sounds:{vibration:boolean}}}>().preferences.sounds.vibration,false);

    const soundPack=await app.inject({
      method:'GET',url:'/3aksa/api/notifications/sound-pack',headers:auth(sb.accessToken)
    });
    assert.equal(soundPack.statusCode,200,soundPack.body);
    const sounds=soundPack.json<{sounds:Record<string,unknown>}>().sounds;
    for(const key of ['message_received','friend_request','friend_accepted','room_join','room_leave','purchase_success','wallet_topup','wallet_transfer','gift_received','admin_alert']){
      assert.ok(key in sounds,key);
    }

    const pushConfig=await app.inject({
      method:'GET',url:'/3aksa/api/notifications/push/config',headers:auth(sb.accessToken)
    });
    assert.equal(pushConfig.statusCode,200,pushConfig.body);
    const config=pushConfig.json<Record<string,unknown>>();
    assert.equal(config.webPushConfigured,false);
    assert.equal(config.androidFcmConfigured,false);
    assert.equal('webPushVapidPrivateKey' in config,false);
    assert.equal('fcmPrivateKey' in config,false);

    const endpoint='https://push.example.test/subscription/notify-b';
    const subscribe=await app.inject({
      method:'POST',url:'/3aksa/api/notifications/push/subscriptions',headers:auth(sb.accessToken),
      payload:{
        platform:'web',installationId:`ci-${b.username}`,
        subscription:{endpoint,keys:{p256dh:'fake-p256dh-value',auth:'fake-auth-value'}}
      }
    });
    assert.equal(subscribe.statusCode,201,subscribe.body);
    const subscriptionId=subscribe.json<{subscription:{id:string}}>().subscription.id;

    const stored=await query<{encrypted_payload:string;endpoint_hash:string}>(
      'SELECT encrypted_payload,endpoint_hash FROM push_subscriptions WHERE id=$1',[subscriptionId]
    );
    assert.ok(stored.rows[0]);
    assert.equal(stored.rows[0]!.encrypted_payload.includes(endpoint),false);
    assert.equal(stored.rows[0]!.encrypted_payload.includes('fake-auth-value'),false);
    assert.match(stored.rows[0]!.endpoint_hash,/^[0-9a-f]{64}$/);

    const publicSubscriptions=await app.inject({
      method:'GET',url:'/3aksa/api/notifications/push/subscriptions',headers:auth(sb.accessToken)
    });
    const subscriptionPublic=publicSubscriptions.json<{subscriptions:Array<Record<string,unknown>>}>().subscriptions[0]!;
    assert.equal('encryptedPayload' in subscriptionPublic,false);
    assert.equal('endpointHash' in subscriptionPublic,false);

    const friend=await app.inject({
      method:'POST',url:'/3aksa/api/friends/requests',headers:auth(sa.accessToken),
      payload:{username:b.username}
    });
    assert.equal(friend.statusCode,201,friend.body);
    const requestId=friend.json<{request:{id:string}}>().request.id;

    let bInbox=await app.inject({
      method:'GET',url:'/3aksa/api/notifications',headers:auth(sb.accessToken)
    });
    assert.ok(bInbox.json<{notifications:Array<{type:string}>}>().notifications.some((n)=>n.type==='friend_request'));

    const accept=await app.inject({
      method:'POST',url:`/3aksa/api/friends/requests/${requestId}/accept`,headers:auth(sb.accessToken)
    });
    assert.equal(accept.statusCode,200,accept.body);
    const aInbox=await app.inject({
      method:'GET',url:'/3aksa/api/notifications',headers:auth(sa.accessToken)
    });
    assert.ok(aInbox.json<{notifications:Array<{type:string}>}>().notifications.some((n)=>n.type==='friend_accepted'));

    const privateMessage=await app.inject({
      method:'POST',url:'/3aksa/api/private/messages',headers:auth(sa.accessToken),
      payload:{username:b.username,text:'رسالة اختبار الإشعارات'}
    });
    assert.equal(privateMessage.statusCode,201,privateMessage.body);
    bInbox=await app.inject({method:'GET',url:'/3aksa/api/notifications',headers:auth(sb.accessToken)});
    assert.ok(bInbox.json<{notifications:Array<{type:string}>}>().notifications.some((n)=>n.type==='private_message'));

    const topup=await createManualTopupRequest(sa.user.id,10_000,'notify-ci',null);
    const approved=await approveManualTopupRequest(topup.id,sa.user.id);
    assert.equal(approved.replayed,false);
    const aAfterTopup=await app.inject({method:'GET',url:'/3aksa/api/notifications',headers:auth(sa.accessToken)});
    assert.ok(aAfterTopup.json<{notifications:Array<{type:string}>}>().notifications.some((n)=>n.type==='wallet_topup'));

    const transferKey=randomUUID();
    const transfer=await app.inject({
      method:'POST',url:'/3aksa/api/wallet/transfers',
      headers:{...auth(sa.accessToken),'idempotency-key':transferKey},
      payload:{username:b.username,amountMilli:1500}
    });
    assert.equal(transfer.statusCode,201,transfer.body);

    const transferCount=await query<{count:string}>(
      "SELECT count(*)::text AS count FROM notifications WHERE user_id=$1 AND type='wallet_transfer'",[sb.user.id]
    );
    assert.equal(Number(transferCount.rows[0]!.count),1);

    const transferReplay=await app.inject({
      method:'POST',url:'/3aksa/api/wallet/transfers',
      headers:{...auth(sa.accessToken),'idempotency-key':transferKey},
      payload:{username:b.username,amountMilli:1500}
    });
    assert.equal(transferReplay.statusCode,200,transferReplay.body);
    const transferCountAfter=await query<{count:string}>(
      "SELECT count(*)::text AS count FROM notifications WHERE user_id=$1 AND type='wallet_transfer'",[sb.user.id]
    );
    assert.equal(Number(transferCountAfter.rows[0]!.count),1);

    const realtimeEvents:string[]=[];
    const unsubscribe=notificationEvents.onNew((event)=>{
      if(event.userId===sb.user.id)realtimeEvents.push(event.notification.type);
    });
    let generic;
    try{
      generic=await createNotification({
        userId:sb.user.id,type:'admin_alert',title:'تنبيه تجريبي',
        body:'هذا تنبيه لاختبار قناة الإشعارات',soundKey:'admin_alert'
      });
    }finally{
      unsubscribe();
    }
    assert.ok(generic);
    assert.deepEqual(realtimeEvents,['admin_alert']);

    const deliveries=await processPendingNotificationDeliveries(250);
    assert.ok(deliveries.processed>=1);
    assert.equal(deliveries.sent,0);
    const failed=await query<{status:string;error_code:string|null}>(
      `SELECT status,error_code FROM notification_deliveries
       WHERE notification_id=$1 AND subscription_id=$2`,[generic!.id,subscriptionId]
    );
    assert.equal(failed.rows[0]?.status,'failed');
    assert.equal(failed.rows[0]?.error_code,'WEB_PUSH_NOT_CONFIGURED');

    const currentInbox=await app.inject({method:'GET',url:'/3aksa/api/notifications',headers:auth(sb.accessToken)});
    const unread=currentInbox.json<{notifications:Array<{id:string;readAt:string|null}>}>().notifications;
    assert.ok(unread.length>0);
    const firstId=unread[0]!.id;
    const readOne=await app.inject({
      method:'POST',url:`/3aksa/api/notifications/${firstId}/read`,headers:auth(sb.accessToken)
    });
    assert.equal(readOne.statusCode,200,readOne.body);
    assert.ok(readOne.json<{notification:{readAt:string|null}}>().notification.readAt);

    const readAll=await app.inject({
      method:'POST',url:'/3aksa/api/notifications/read-all',headers:auth(sb.accessToken)
    });
    assert.equal(readAll.statusCode,200,readAll.body);

    const remove=await app.inject({
      method:'DELETE',url:`/3aksa/api/notifications/push/subscriptions/${subscriptionId}`,
      headers:auth(sb.accessToken)
    });
    assert.equal(remove.statusCode,204,remove.body);
  }finally{
    await cleanup();
    await app.close();
  }
});
