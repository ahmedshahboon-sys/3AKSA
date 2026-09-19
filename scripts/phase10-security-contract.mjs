import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8');}
function must(text,fragment,label){
  if(!text.includes(fragment))throw new Error(`${label} missing: ${fragment}`);
}
function mustNot(text,fragment,label){
  if(text.includes(fragment))throw new Error(`${label} must not contain: ${fragment}`);
}

const runtime=read('apps/web/src/runtime.ts');
const session=read('apps/web/src/session.tsx');
const cookie=read('apps/api/src/modules/auth/cookie.ts');
const httpSecurity=read('apps/api/src/security-http.ts');
const app=read('apps/api/src/app.ts');
const socket=read('apps/api/src/modules/realtime/socket.ts');
const nativeTemplate=read('apps/mobile/native/SecureStorePlugin.java.template');
const nativeInstaller=read('apps/mobile/scripts/install-secure-store.mjs');
const nginx=read('infra/nginx/3aksa-subpath.conf.example');
const apiUnit=read('infra/systemd/3aksa-api.service.example');
const workerUnit=read('infra/systemd/3aksa-worker.service.example');
const release=read('.github/workflows/trusted-release.yml');
const publicRepo=read('docs/security/PUBLIC_REPO.md');

mustNot(runtime,'3aksa:access-token','browser runtime');
mustNot(runtime,'localStorage.setItem(TOKEN_KEY','browser runtime');
must(runtime,"registerPlugin<SecureStorePlugin>('SecureStore')",'Android secure storage');
must(runtime,"if(getPlatform()==='android')",'Android platform split');
must(session,"sessionMode:platform==='web'?'cookie':'bearer'",'session mode split');

must(cookie,'HttpOnly','session cookie');
must(cookie,'SameSite=Strict','session cookie');
must(cookie,'Path=','session cookie path');

must(httpSecurity,'CSRF_ORIGIN_REJECTED','CSRF protection');
must(httpSecurity,'Strict-Transport-Security','production HSTS');
must(httpSecurity,'Content-Security-Policy','API CSP');
must(app,'env.TRUSTED_PROXY_CIDRS','explicit trusted proxy policy');
must(socket,'UNAUTHORIZED_ORIGIN','cookie WebSocket origin protection');

must(nativeTemplate,'AndroidKeyStore','Android Keystore');
must(nativeTemplate,'AES/GCM/NoPadding','Android token encryption');
must(nativeTemplate,'Settings.Secure.ANDROID_ID','Android device binding');
must(nativeInstaller,'android:allowBackup="false"','Android backup hardening');
must(nativeInstaller,'android:usesCleartextTraffic="false"','Android cleartext hardening');

must(nginx,'proxy_set_header X-Forwarded-For $remote_addr','spoof-resistant forwarded IP');
must(nginx,"frame-ancestors 'none'",'static clickjacking protection');
must(nginx,'Permissions-Policy','static permissions policy');

for(const [name,unit] of [['api',apiUnit],['worker',workerUnit]]){
  must(unit,'User=3aksa',`${name} unprivileged service`);
  must(unit,'NoNewPrivileges=true',`${name} service hardening`);
  must(unit,'ProtectSystem=strict',`${name} filesystem hardening`);
  must(unit,'ReadWritePaths=/var/lib/3aksa',`${name} writable scope`);
}

must(release,'workflow_dispatch:','manual-only release trigger');
mustNot(release,'pull_request:','release workflow');
mustNot(release,'\npush:','release workflow');
must(release,'ANDROID_KEYSTORE_BASE64','release signing secret');
must(release,'apksigner','release signature verification');
must(release,'pnpm install --frozen-lockfile','deterministic release install');

must(publicRepo,'APK signing keystores/passwords','public repository secret policy');

console.log('Phase 10 security contract passed.');
