import { useEffect, useRef, useState } from 'react';

export function LiveTvPlayer({src,title}:{src:string;title:string}){
  const ref=useRef<HTMLVideoElement|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    const video=ref.current;if(!video||!src)return;
    setError('');
    let disposed=false;
    let destroyPlayer:(()=>void)|null=null;
    const isHls=/\.m3u8(?:$|[?#])/i.test(src);

    if(isHls){
      if(video.canPlayType('application/vnd.apple.mpegurl')){
        video.src=src;
      }else{
        void import('hls.js').then(({default:Hls})=>{
          if(disposed)return;
          if(!Hls.isSupported()){setError('المتصفح هذا ما يدعمش HLS.');return;}
          const hls=new Hls({enableWorker:true,lowLatencyMode:true,backBufferLength:30});
          destroyPlayer=()=>hls.destroy();
          hls.loadSource(src);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR,(_event,data)=>{
            if(!data.fatal)return;
            if(data.type===Hls.ErrorTypes.NETWORK_ERROR)hls.startLoad();
            else if(data.type===Hls.ErrorTypes.MEDIA_ERROR)hls.recoverMediaError();
            else{setError('تعذر تشغيل البث على الجهاز هذا.');hls.destroy();}
          });
        }).catch(()=>{if(!disposed)setError('تعذر تحميل مشغل HLS.');});
      }
    }else video.src=src;

    return()=>{
      disposed=true;
      destroyPlayer?.();
      video.removeAttribute('src');
      video.load();
    };
  },[src]);

  return <div className="live-tv-player">
    <video ref={ref} controls playsInline preload="metadata" aria-label={title}/>
    {error?<div className="live-error" role="alert">{error}</div>:null}
  </div>;
}
