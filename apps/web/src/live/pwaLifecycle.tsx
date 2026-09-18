import { useEffect, useState } from 'react';

type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};

export function PwaLifecycle(){
  const [install,setInstall]=useState<InstallPromptEvent|null>(null);
  const [update,setUpdate]=useState<ServiceWorkerRegistration|null>(null);
  useEffect(()=>{
    const beforeInstall=(event:Event)=>{event.preventDefault();setInstall(event as InstallPromptEvent);};
    window.addEventListener('beforeinstallprompt',beforeInstall);
    let mounted=true;
    if('serviceWorker' in navigator){
      void navigator.serviceWorker.ready.then((registration)=>{
        if(!mounted)return;
        const inspect=()=>{const worker=registration.waiting;if(worker)setUpdate(registration);};
        inspect();
        registration.addEventListener('updatefound',()=>{
          const worker=registration.installing;
          worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)setUpdate(registration);});
        });
      });
      const controller=()=>window.location.reload();
      navigator.serviceWorker.addEventListener('controllerchange',controller,{once:true});
    }
    return()=>{mounted=false;window.removeEventListener('beforeinstallprompt',beforeInstall);};
  },[]);

  async function installApp(){
    if(!install)return;
    await install.prompt();
    const choice=await install.userChoice;
    if(choice.outcome==='accepted')setInstall(null);
  }
  function applyUpdate(){
    update?.waiting?.postMessage({type:'SKIP_WAITING'});
    setUpdate(null);
  }

  if(!install&&!update)return null;
  return <div className="pwa-actions">{update?<button type="button" onClick={applyUpdate}>نسخة جديدة متاحة — حدّث توا</button>:null}{install?<button type="button" onClick={()=>void installApp()}>ثبّت عكسة على جهازك</button>:null}</div>;
}
