import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { readableError } from '../useApiResource';

export function VoiceRecorderButton({onReady,disabled=false}:{onReady:(audio:ArrayBuffer,durationMs:number)=>Promise<void>;disabled?:boolean}){
  const [recording,setRecording]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const recorderRef=useRef<MediaRecorder|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const chunksRef=useRef<Blob[]>([]);
  const startedRef=useRef(0);

  useEffect(()=>()=>{streamRef.current?.getTracks().forEach((track)=>track.stop());},[]);

  async function start(){
    setError('');
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      streamRef.current=stream;
      const preferred=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder=new MediaRecorder(stream,preferred?{mimeType:preferred}:undefined);
      chunksRef.current=[];
      recorder.ondataavailable=(event)=>{if(event.data.size>0)chunksRef.current.push(event.data);};
      recorderRef.current=recorder;
      startedRef.current=Date.now();
      recorder.start(250);
      setRecording(true);
    }catch(err){
      setError(readableError(err) || 'ما قدرناش نفتح الميكروفون.');
    }
  }

  async function stop(){
    const recorder=recorderRef.current;
    if(!recorder || recorder.state==='inactive')return;
    setBusy(true);
    const durationMs=Math.max(0,Date.now()-startedRef.current);
    const result=new Promise<Blob>((resolve)=>{
      recorder.onstop=()=>resolve(new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'}));
    });
    recorder.stop();
    streamRef.current?.getTracks().forEach((track)=>track.stop());
    streamRef.current=null;
    setRecording(false);
    try{
      const blob=await result;
      if(durationMs<250)throw new Error('التسجيل قصير هلبة.');
      if(durationMs>120_000)throw new Error('أقصى تسجيل دقيقتين.');
      if(blob.size>3*1024*1024)throw new Error('التسجيل أكبر من 3MB.');
      await onReady(await blob.arrayBuffer(),durationMs);
    }catch(err){
      setError(readableError(err));
    }finally{
      setBusy(false);
      chunksRef.current=[];
      recorderRef.current=null;
    }
  }

  return (
    <>
      <button
        type="button"
        className={recording?'composer-button recording':'composer-button'}
        aria-label={recording?'إيقاف التسجيل':'تسجيل صوتي'}
        disabled={disabled||busy}
        onClick={()=>{void(recording?stop():start());}}
      >
        <Icon name="mic" />
      </button>
      {error?<span className="composer-error">{error}</span>:null}
    </>
  );
}

export function ProtectedVoicePlayer({load}:{load:()=>Promise<Blob>}){
  const [url,setUrl]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);

  async function open(){
    setBusy(true);setError('');
    try{
      const blob=await load();
      const next=URL.createObjectURL(blob);
      setUrl((previous)=>{if(previous)URL.revokeObjectURL(previous);return next;});
    }catch(err){setError(readableError(err));}
    finally{setBusy(false);}
  }

  if(url)return <audio className="voice-audio" controls autoPlay src={url} />;
  return (
    <span className="voice-loader">
      <button type="button" onClick={()=>void open()} disabled={busy}>{busy?'جاري...':'▶ تسجيل صوتي'}</button>
      {error?<small>{error}</small>:null}
    </span>
  );
}
