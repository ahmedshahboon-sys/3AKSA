import type {TelemetryEvent} from '@3aksa/api-client';
import {api,getPlatform} from './runtime';

const KEY='3aksa:telemetry-queue';
const MAX_QUEUE=50;
const SYNC_MS=15*60*1000;
let installed=false;
let flushing=false;

function appVersion(){
  return (import.meta.env.VITE_APP_VERSION||'web').slice(0,40);
}
function route(){
  return window.location.pathname.slice(0,160)||'/';
}
function readQueue():TelemetryEvent[]{
  try{
    const parsed=JSON.parse(localStorage.getItem(KEY)||'[]');
    return Array.isArray(parsed)?parsed.slice(-MAX_QUEUE):[];
  }catch{return [];}
}
function writeQueue(items:TelemetryEvent[]){
  try{localStorage.setItem(KEY,JSON.stringify(items.slice(-MAX_QUEUE)));}catch{/* optional */}
}
export function captureClientError(eventType:string,context:TelemetryEvent['context']={}){
  const event:TelemetryEvent={
    eventType:eventType.toLowerCase().replace(/[^a-z0-9_.-]/g,'_').slice(0,64)||'client_error',
    route:route(),appVersion:appVersion(),platform:getPlatform(),context
  };
  const queue=readQueue();queue.push(event);writeQueue(queue);
}
export async function flushTelemetry(){
  if(flushing||!navigator.onLine)return;
  const queue=readQueue();if(!queue.length)return;
  flushing=true;
  try{
    const flags=await api.featureFlags().catch(()=>({flags:{telemetry:false,tv:false,store:false,paid_features:false,push:false}}));
    if(!flags.flags.telemetry){writeQueue([]);return;}
    await api.telemetryEvents(queue.slice(0,25));
    writeQueue(queue.slice(25));
  }catch{/* telemetry is strictly best effort */}
  finally{flushing=false;}
}
export function installTelemetry(){
  if(installed)return;installed=true;
  window.addEventListener('error',(event)=>{
    captureClientError('window_error',{
      errorName:event.error instanceof Error?event.error.name:'Error',
      errorCode:event.message?.slice(0,120)||'window-error',
      source:'window'
    });
  });
  window.addEventListener('unhandledrejection',(event)=>{
    const reason=event.reason;
    captureClientError('unhandled_rejection',{
      errorName:reason instanceof Error?reason.name:'PromiseRejection',
      errorCode:reason instanceof Error?reason.message.slice(0,120):'promise-rejection',
      source:'promise'
    });
  });
  window.addEventListener('online',()=>void flushTelemetry());
  window.setInterval(()=>void flushTelemetry(),SYNC_MS);
  void flushTelemetry();
}
