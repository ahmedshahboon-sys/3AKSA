import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Group 6 stores APKs with server-computed SHA and APK validation',()=>{
  const storage=read('apps/api/src/storage.ts');
  assert.ok(storage.includes('MAX_ANDROID_APK_BYTES'));
  assert.ok(storage.includes("Buffer.from('AndroidManifest.xml')"));
  assert.ok(storage.includes("createHash('sha256')"));
  assert.ok(storage.includes('releases/android/${randomUUID()}.apk'));
});

test('Group 6 release admin is role/MFA/rate-limit/audit protected',()=>{
  const source=read('apps/api/src/modules/releases/admin.ts');
  for(const fragment of [
    "hasAdminRole(context,'super_admin','release_admin')",
    'requireAdminMfa(context,request,reply)',
    'consumeRateLimit',
    'admin-release-upload',
    'android_release_uploaded',
    'android_release_published',
    'android_release_retired',
    "status='published'",
    "status='retired'"
  ])assert.ok(source.includes(fragment),fragment);
  assert.ok(!source.includes('sha256?:'));
});

test('Group 6 install page works before auth and exposes release proof',()=>{
  const app=read('apps/web/src/App.tsx');
  const install=read('apps/web/src/live/install.tsx');
  const auth=read('apps/web/src/auth.tsx');
  assert.ok(app.includes("location.pathname === '/download'"));
  assert.ok(app.indexOf("location.pathname === '/download'")<app.indexOf("status === 'loading'"));
  assert.ok(install.includes("api.androidRelease(0,'stable')"));
  assert.ok(install.includes("api.androidRelease(0,'beta')"));
  assert.ok(install.includes('SHA-256:'));
  assert.ok(install.includes('Add to Home Screen'));
  assert.ok(install.includes('beforeinstallprompt'));
  assert.ok(auth.includes('to="/download"'));
});

test('Group 6 service worker never caches API or Socket.IO',()=>{
  const sw=read('apps/web/public/sw.js');
  assert.ok(sw.includes("url.pathname.startsWith(`${scopePath}api/`)"));
  assert.ok(sw.includes("url.pathname.startsWith(`${scopePath}socket.io/`)"));
});

test('Group 6 manifest declares installable any and maskable icons',()=>{
  const manifest=JSON.parse(read('apps/web/public/manifest.webmanifest'));
  assert.equal(manifest.display,'standalone');
  assert.ok(manifest.icons.some((icon)=>icon.sizes==='192x192'&&icon.purpose==='any'));
  assert.ok(manifest.icons.some((icon)=>icon.sizes==='512x512'&&icon.purpose==='any'));
  assert.ok(manifest.icons.some((icon)=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
});

test('Group 6 trusted release requires official secrets and retains signature proof',()=>{
  const workflow=read('.github/workflows/trusted-release.yml');
  for(const secret of ['ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD'])assert.ok(workflow.includes(secret));
  assert.ok(workflow.includes('apksigner'));
  assert.ok(workflow.includes('verify --verbose --print-certs'));
  assert.ok(workflow.includes('.apk.cert.txt'));
  assert.ok(workflow.includes('sha256sum'));
  assert.ok(workflow.includes('Verify release source'));
});

test('Group 6 push credentials remain external and optional to core startup',()=>{
  const env=read('.env.example');
  const providers=read('apps/api/src/modules/notifications/providers.ts');
  const native=read('apps/web/src/native.ts');
  for(const key of ['WEB_PUSH_VAPID_PUBLIC_KEY','WEB_PUSH_VAPID_PRIVATE_KEY','WEB_PUSH_SUBJECT','FCM_PROJECT_ID','FCM_CLIENT_EMAIL','FCM_PRIVATE_KEY'])assert.ok(env.includes(key));
  assert.ok(providers.includes("status:'disabled'"));
  assert.ok(native.includes('Push is optional'));
});
