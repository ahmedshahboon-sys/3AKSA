import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8');}
function must(text,fragment,label){
  if(!text.includes(fragment))throw new Error(`${label} missing: ${fragment}`);
}

const main=read('apps/web/src/main.tsx');
const native=read('apps/web/src/native.ts');
const installer=read('apps/mobile/scripts/install-secure-store.mjs');

must(main,'<AppErrorBoundary>','top-level ErrorBoundary');
must(main,"import { AppErrorBoundary } from './ErrorBoundary';",'ErrorBoundary import');
must(native,'export async function initializeNativePush','native push initializer');
must(native,'export async function requestNativePushPermission','deferred push permission API');
must(native,"debugOptionalNativeFailure('push-startup'","push fail-safe");
const initStart=native.indexOf('export async function initializeNativePush');
const requestStart=native.indexOf('export async function requestNativePushPermission');
if(initStart<0||requestStart<0||requestStart<=initStart)throw new Error('Unable to isolate native push startup block');
const startupBlock=native.slice(initStart,requestStart);
if(startupBlock.includes('requestPermissions(')){
  throw new Error('Native push startup must not request notification permission automatically');
}
for(const permission of [
  'android.permission.RECORD_AUDIO',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.POST_NOTIFICATIONS'
]){
  must(installer,permission,'Android generated manifest permission');
}
console.log('Android startup safety contract passed.');
