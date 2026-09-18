import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppNotification, NotificationPreferences } from '@3aksa/api-client';
import { api, realtime } from '../runtime';
import { initializeNativeAppLinks, initializeNativePush, nativeImpact } from '../native';

type Toast={title:string;body:string;target:string;duration:number}|null;

function targetFor(notification:AppNotification){
  const conversationId=typeof notification.data.conversationId==='string'?notification.data.conversationId:null;
  if(conversationId)return '/private/'+conversationId;
  if(notification.type==='message_request')return '/private';
  if(['wallet_topup','wallet_transfer','purchase','gift_received'].includes(notification.type))return '/wallet';
  return '/notifications';
}

function soundGroup(soundKey:string|null){
  if(!soundKey)return 'interface';
  if(soundKey.startsWith('message_'))return 'messages';
  if(soundKey.startsWith('room_'))return 'rooms';
  return 'interface';
}

function playTone(){
  try{
    const AudioContextCtor=window.AudioContext||(window as typeof window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!AudioContextCtor)return;
    const ctx=new AudioContextCtor();
    const oscillator=ctx.createOscillator();const gain=ctx.createGain();
    oscillator.frequency.value=640;gain.gain.value=.035;
    oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start();
    gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.11);
    oscillator.stop(ctx.currentTime+.12);
    oscillator.onended=()=>void ctx.close();
  }catch{/* browser may require a prior user gesture */}
}

async function feedback(soundKey:string|null,prayerSound=false){
  let prefs:NotificationPreferences|null=null;
  try{prefs=(await api.notificationPreferences()).preferences;}catch{return;}
  if(prefs.sounds.muteAll)return;
  const group=soundGroup(soundKey);
  const soundAllowed=prayerSound||(group==='messages'?prefs.sounds.messages:group==='rooms'?prefs.sounds.rooms:prefs.sounds.interface);
  if(soundAllowed)playTone();
  if(prefs.sounds.vibration)void nativeImpact('light');
}

export function LiveRealtimeEffects(){
  const navigate=useNavigate();
  const [toast,setToast]=useState<Toast>(null);
  const timer=useRef<number|null>(null);
  useEffect(()=>{
    void initializeNativePush((path)=>navigate(path));
    void initializeNativeAppLinks((path)=>navigate(path));
    function show(next:NonNullable<Toast>){
      if(timer.current)window.clearTimeout(timer.current);
      setToast(next);timer.current=window.setTimeout(()=>setToast(null),next.duration);
    }
    const offNotification=realtime.on('notification:new',(payload)=>{
      const notification=payload.notification as AppNotification;
      show({title:notification.title,body:notification.body,target:targetFor(notification),duration:4200});
      void feedback(notification.soundKey);
    });
    const offPrayer=realtime.on('prayer:time',(payload)=>{
      show({title:'تنبيه الصلاة',body:payload.message,target:'/',duration:payload.displayDurationMs||3000});
      if(payload.soundEnabled)void feedback('prayer_alert',true);
    });
    const heartbeat=window.setInterval(()=>void realtime.heartbeat(),45_000);
    return()=>{offNotification();offPrayer();window.clearInterval(heartbeat);if(timer.current)window.clearTimeout(timer.current);};
  },[]);
  if(!toast)return null;
  return <button className="live-toast" type="button" onClick={()=>{const target=toast.target;setToast(null);navigate(target);}}><b>{toast.title}</b><span>{toast.body}</span></button>;
}
