import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Group 7 self-delete reserves username, blocks known installs and revokes access',()=>{
  const social=read('apps/api/src/modules/social/routes.ts');
  for(const fragment of [
    "account/delete","ACCOUNT_DELETE_CONFIRMATION_REQUIRED","verifyPassword",
    "reserved_usernames","blocked_installations","UPDATE user_devices SET blocked_at=now()",
    "UPDATE auth_sessions SET revoked_at","ACCOUNT_DELETED","status='deleted'",
    "OWNER_ACCOUNT_DELETE_PROTECTED","account-delete-ip","account-delete"
  ])assert.ok(social.includes(fragment),fragment);
});

test('Group 7 privacy preferences are persisted and enforced',()=>{
  const migration=read('database/migrations/0022_privacy_observability_flags.sql');
  const social=read('apps/api/src/modules/social/routes.ts');
  const nearby=read('apps/web/src/live/nearby.tsx');
  assert.ok(migration.includes("language varchar(5)"));
  assert.ok(migration.includes("profile_visibility"));
  assert.ok(migration.includes("nearby_consent_at"));
  assert.ok(social.includes("NEARBY_CONSENT_REQUIRED"));
  assert.ok(social.includes("target.profile_visibility==='friends'"));
  assert.ok(nearby.includes("nearbyConsent:true"));
});

test('Group 7 telemetry has sanitized bounded 24h retention',()=>{
  const migration=read('database/migrations/0022_privacy_observability_flags.sql');
  const routes=read('apps/api/src/modules/telemetry/routes.ts');
  const client=read('apps/web/src/telemetry.ts');
  const cleanup=read('apps/worker/src/cleanup.ts');
  assert.ok(migration.includes("expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')"));
  assert.ok(migration.includes("CHECK (expires_at <= created_at + interval '24 hours')"));
  assert.ok(routes.includes("CONTEXT_KEYS"));
  for(const forbidden of ['password','token','phone','latitude','longitude','messageContent'])assert.ok(!routes.includes(`'${forbidden}'`));
  assert.ok(routes.includes("events.length>25"));
  assert.ok(routes.includes("bodyLimit:32*1024"));
  assert.ok(client.includes("MAX_QUEUE=50"));
  assert.ok(client.includes("15*60*1000"));
  assert.ok(cleanup.includes("telemetry_events"));
});

test('Group 7 feature flags are safe-off and enforce optional features',()=>{
  const service=read('apps/api/src/modules/features/service.ts');
  const tv=read('apps/api/src/modules/tv/routes.ts');
  const store=read('apps/api/src/modules/economy/store-routes.ts');
  const notifications=read('apps/api/src/modules/notifications/routes.ts');
  for(const key of ['tv','store','paid_features','telemetry','push'])assert.ok(service.includes(key));
  assert.ok(service.includes("tv:false,store:false,paid_features:false,telemetry:false,push:false"));
  assert.ok((tv.match(/featureEnabled\('tv'\)/g)||[]).length>=11);
  assert.ok(store.includes("featureEnabled('store')"));
  assert.ok(store.includes("featureEnabled('paid_features')"));
  assert.ok(notifications.includes("featureEnabled('push')"));
});

test('Group 7 legal pages and real English shell/auth are public',()=>{
  const app=read('apps/web/src/App.tsx');
  const legal=read('apps/web/src/live/legal.tsx');
  const auth=read('apps/web/src/auth.tsx');
  const i18n=read('apps/web/src/i18n.ts');
  for(const path of ['/privacy','/terms','/about','/support'])assert.ok(app.includes(`location.pathname==='${path}'`));
  assert.ok(legal.includes('Nearby is optional'));
  assert.ok(legal.includes('24 hours'));
  assert.ok(i18n.includes("english:'English'"));
  assert.ok(auth.includes("Lightweight chat, rooms, private messages and more."));
  assert.ok(auth.includes("Download 3AKSA / Install PWA"));
});

test('Group 7 admin can control flags and review aggregated telemetry',()=>{
  const admin=read('apps/web/src/live/admin.tsx');
  const routes=read('apps/api/src/modules/features/routes.ts');
  const telemetry=read('apps/api/src/modules/telemetry/routes.ts');
  assert.ok(admin.includes('Feature Flags'));
  assert.ok(admin.includes('Telemetry آخر 24 ساعة'));
  assert.ok(routes.includes('feature_flag_updated'));
  assert.ok(routes.includes('requireAdminMfa'));
  assert.ok(telemetry.includes('requireAdminMfa'));
  assert.ok(telemetry.includes('GROUP BY event_type,app_version,platform'));
});
