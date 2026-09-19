import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

export function LiveTvPlayer({src,title}:{src:string;title:string}){
  const ref=useRef<HTMLVideoElement|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    const video=ref.current;if(!video||!src)return;
    setError('');
    let hls:Hls|null=null;
    const isHls=/\.m3u8(?:$|[?#])/i.test(src);
    if(isHls){
      if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=src;}
      else if(Hls.isSupported()){
        hls=new Hls({enableWorker:true,lowLatencyMode:true,backBufferLength:30});
        hls.loadSource(src);hls.attachMedia(video);
        hls.on(Hls.Events.ERROR,(_event,data)=>{
          if(!data.fatal)return;
          if(data.type===Hls.ErrorTypes.NETWORK_ERROR){hls?.startLoad();}
          else if(data.type===Hls.ErrorTypes.MEDIA_ERROR){hls?.recoverMediaError();}
          else{setError('تعذر تشغيل البث على الجهاز هذا.');hls?.destroy();}
        });
      }else setError('المتصفح هذا ما يدعمش HLS.');
    }else{video.src=src;}
    return()=>{hls?.destroy();video.removeAttribute('src');video.load();};
  },[src]);
  return <div className="live-tv-player"><video ref={ref} controls playsInline preload="metadata" aria-label={title}/>{error?<div className="live-error">{error}</div>:null}</div>;
}
