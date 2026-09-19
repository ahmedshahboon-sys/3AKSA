import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Group 5 keeps rose split exact and ledger retry-safe',()=>{
  const migration=read('database/migrations/0010_store_topups_gifts.sql');
  const store=read('apps/api/src/modules/economy/store.ts');
  assert.match(migration,/['\"]rose['\"]/);
  assert.match(migration,/\n\s*1000,\s*\n\s*500,/);
  assert.match(migration,/platformShareMilli/);
  assert.match(store,/transactionByKey/);
  assert.match(store,/FOR UPDATE/);
  assert.match(store,/recipientShare/);
  assert.match(store,/platformShare/);
  assert.match(store,/IDEMPOTENCY_KEY_REUSED/);
});

test('Group 5 admin store requires MFA and audits writes',()=>{
  const source=read('apps/api/src/modules/economy/admin-store.ts');
  for(const fragment of [
    "hasAdminRole(context,'super_admin','finance_admin')",
    'requireAdminMfa(context,request,reply)',
    '/admin/store',
    '/items/:itemId/asset',
    'auditAdminAction',
    'store_item_created',
    'store_item_updated',
    'store_item_retired',
    'store_item_asset_uploaded',
    'admin-store-list','admin-store-create','admin-store-update','admin-store-retire','admin-store-asset',
    'admin-store-list-ip','admin-store-create-ip','admin-store-update-ip','admin-store-retire-ip','admin-store-asset-ip',
    'consumeRateLimit'
  ])assert.ok(source.includes(fragment),fragment);
});

test('Group 5 cosmetic uploads validate binary signatures and size',()=>{
  const storage=read('apps/api/src/storage.ts');
  assert.ok(storage.includes('MAX_STORE_ASSET_BYTES = 1024 * 1024'));
  assert.ok(storage.includes('sniffStoreAssetFormat'));
  assert.ok(storage.includes('STORE_ASSET_FORMAT_INVALID'));
  assert.ok(storage.includes('STORE_ASSET_TYPE_MISMATCH'));
  assert.ok(storage.includes('store/${randomUUID()}'));
});

test('Group 5 public cosmetics reach core social surfaces',()=>{
  const migration=read('database/migrations/0021_public_cosmetics_view.sql');
  const social=read('apps/api/src/modules/social/routes.ts');
  const nearby=read('apps/api/src/modules/nearby/routes.ts');
  const privateService=read('apps/api/src/modules/private/service.ts');
  const roomMessages=read('apps/api/src/modules/messages/service.ts');
  const ui=read('apps/web/src/ui.tsx');
  assert.ok(migration.includes('user_public_cosmetics'));
  assert.ok(migration.includes('frame_code'));
  assert.ok(migration.includes('badge_code'));
  for(const source of [social,nearby,privateService,roomMessages])assert.ok(source.includes('user_public_cosmetics'));
  assert.ok(ui.includes('avatar-frame'));
  assert.ok(ui.includes('avatar-badge'));
  assert.ok(ui.includes('storeAssetUrl'));
});

test('Group 5 supports entry sounds, owned stickers, gifts and paid reactions',()=>{
  const socket=read('apps/api/src/modules/realtime/socket.ts');
  const rooms=read('apps/web/src/live/rooms.tsx');
  const privateUi=read('apps/web/src/live/private.tsx');
  const profile=read('apps/web/src/live/social.tsx');
  const routes=read('apps/api/src/modules/economy/store-routes.ts');
  assert.ok(socket.includes('entrySoundCode'));
  assert.ok(rooms.includes('playEntrySound'));
  assert.ok(rooms.includes('prefs.sounds.muteAll'));
  assert.ok(rooms.includes('roomStickerTexts'));
  assert.ok(privateUi.includes('stickerTexts'));
  assert.ok(profile.includes('0.500 LYD recipient'));
  assert.ok(profile.includes('0.500 LYD platform'));
  assert.ok(privateUi.includes("type:'private_message'"));
  assert.ok(rooms.includes("type:'room_message'"));
  assert.ok(routes.includes("type:paidReaction?'paid_reaction':'gift_received'"));
});
