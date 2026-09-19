import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8');}
function must(text,fragment,label){
  if(!text.includes(fragment))throw new Error(`${label} missing: ${fragment}`);
}
function mustNot(text,fragment,label){
  if(text.includes(fragment))throw new Error(`${label} must not contain: ${fragment}`);
}

const compose=read('infra/docker/compose.server.yml');
const dockerfile=read('infra/docker/Dockerfile.server');
const envScript=read('infra/server/create-production-env.sh');
const dbScript=read('infra/server/bootstrap-database.sh');
const nginxInstall=read('infra/server/install-nginx-subpath.sh');
const deploy=read('infra/server/deploy-trial.sh');
const productionSecurity=read('apps/api/src/production-security.ts');
const app=read('apps/api/src/app.ts');

must(compose,'127.0.0.1:3101:3101','loopback-only published API');
must(compose,'name: marbo3a_default','existing external Docker network');
must(compose,'/var/lib/3aksa:/var/lib/3aksa','isolated storage');
mustNot(compose,'POSTGRES_PASSWORD','compose');
mustNot(compose,'SESSION_SECRET=','compose');
must(compose,'read_only: true','runtime filesystem');
must(compose,'cap_drop:','capability hardening');
must(compose,'no-new-privileges:true','container hardening');

mustNot(compose,'command: ["pnpm","--filter","@3aksa/api","start"]','API runtime command');
mustNot(compose,'command: ["pnpm","--filter","@3aksa/worker","start"]','worker runtime command');
mustNot(compose,'command: ["pnpm","--filter","@3aksa/api","db:migrate"]','migration runtime command');
must(compose,'/app/apps/api/node_modules/.bin/tsx','direct API/migration runtime');
must(compose,'/app/apps/worker/node_modules/.bin/tsx','direct worker runtime');

must(dockerfile,'pnpm install --frozen-lockfile','deterministic image install');
must(dockerfile,'dumb-init','signal handling');
must(dockerfile,'apk add --no-cache bash dumb-init','bash required by visual asset scripts');

must(envScript,'API_BIND_MODE=container','container bind declaration');
must(envScript,'TRUSTED_PROXY_CIDRS=127.0.0.1,::1,','trusted Docker gateway');
must(envScript,'REDIS_KEY_PREFIX=3aksa:','Redis isolation');
must(envScript,'WEB_ALLOWED_ORIGINS=https://marbo3a.ly,https://www.marbo3a.ly','browser origin allowlist');
mustNot(envScript,'VAPID_PRIVATE_KEY=','generated production env');
mustNot(envScript,'FCM_PRIVATE_KEY=','generated production env');

must(dbScript,'CREATE DATABASE threeaksa OWNER threeaksa_app','separate database');
must(dbScript,'Password was not printed','secret handling');

must(nginxInstall,'cp -a "${SITE}" "${BACKUP}"','Nginx backup');
must(nginxInstall,'nginx -t','Nginx validation');
must(nginxInstall,'systemctl reload nginx','graceful Nginx reload');

must(deploy,'/3aksa/api/ready','readiness gate');
must(deploy,'docker compose -f "${COMPOSE}" --profile ops run --rm migrate','migration gate');
must(deploy,'--profile build run --rm web-build','subpath web build');
must(compose,'set -eu','fail-fast Web/PWA build');
must(compose,'test -f apps/web/dist/index.html','Web/PWA dist verification');
must(compose,'VITE_API_BASE_URL: /3aksa/api','same-origin Web API');
mustNot(compose,'VITE_SOCKET_URL: https://marbo3a.ly','hardcoded Web socket origin');
must(deploy,"CURRENT_VERSION=\"$(git rev-parse --short=12 HEAD)\"",'deployment version refresh');

must(productionSecurity,"API_BIND_MODE==='loopback'",'explicit bind policy');
must(app,'env.TRUSTED_PROXY_CIDRS','configurable trusted proxies');

console.log('Phase 11 MARBO3A server integration contract passed.');
