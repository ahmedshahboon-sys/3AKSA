import { useEffect,useMemo,useState } from 'react';
import type { AndroidRelease } from '@3aksa/api-client';
import { api,resolveApiUrl } from '../runtime';
import { readableError } from '../useApiResource';

type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};

function size(value:number){
  if(value>=1024*1024)return (value/1024/1024).toFixed(1)+' MB';
  return Math.max(1,Math.round(value/1024))+' KB';
}

export function PublicInstallScreen(){
  const [releases,setReleases]=useState<AndroidRelease[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null);
  const standalone=useMemo(()=>window.matchMedia?.('(display-mode: standalone)').matches===true,[]);
  const isiPhone=/iPhone|iPad|iPod/i.test(navigator.userAgent);

  useEffect(()=>{
    let active=true;
    void Promise.allSettled([api.androidRelease(0,'stable'),api.androidRelease(0,'beta')]).then(results=>{
      if(!active)return;
      const unique=new Map<string,AndroidRelease>();
      for(const result of results){if(result.status==='fulfilled'&&result.value.release)unique.set(result.value.release.id,result.value.release);}
      setReleases([...unique.values()].sort((a,b)=>b.versionCode-a.versionCode));
      if(results.every(result=>result.status==='rejected'))setError('تعذر تحميل معلومات الإصدارات توا.');
      setLoading(false);
    });
    const beforeInstall=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPromptEvent);};
    window.addEventListener('beforeinstallprompt',beforeInstall);
    return()=>{active=false;window.removeEventListener('beforeinstallprompt',beforeInstall);};
  },[]);

  async function installPwa(){
    if(!prompt)return;
    try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted')setPrompt(null);}
    catch(err){setError(readableError(err));}
  }

  return <main className="install-page">
    <section className="install-hero">
      <img src={`${import.meta.env.BASE_URL}icons/logo-main-192.png`} alt="عكسة"/>
      <div><p className="eyebrow">3AKSA</p><h1>تنزيل عكسة</h1><p>اختار APK لأندرويد أو ثبّت نسخة PWA مباشرة من المتصفح.</p></div>
      <a className="secondary-button link-reset" href={import.meta.env.BASE_URL}>فتح عكسة</a>
    </section>

    <section className="install-grid">
      <article className="install-card">
        <h2>Android APK</h2>
        {loading?<div className="live-loading">جاري جلب آخر إصدار...</div>:null}
        {error?<div className="live-error" role="alert">{error}</div>:null}
        {!loading&&!releases.length?<div className="empty-state-inline">ما فيش APK منشور توا.</div>:null}
        {releases.map(release=><div className="release-download-card" key={release.id}>
          <div><b>{release.channel==='stable'?'Stable':'Beta'} · {release.versionName}</b><small>versionCode {release.versionCode} · {size(release.fileBytes)}</small></div>
          <p>{release.notes||'بدون ملاحظات إضافية.'}</p>
          <code className="wrap-code">SHA-256: {release.sha256}</code>
          <a className="primary-button small link-reset" href={resolveApiUrl(release.downloadPath)} download={release.fileName}>تنزيل APK</a>
        </div>)}
      </article>

      <article className="install-card">
        <h2>PWA</h2>
        <p>نسخة الويب القابلة للتثبيت تستخدم نفس الحساب ونفس الـBackend.</p>
        {standalone?<div className="success-note">عكسة مفتوحة كتطبيق PWA بالفعل ✅</div>:prompt?<button className="primary-button" type="button" onClick={()=>void installPwa()}>تثبيت عكسة</button>:<div className="muted">لو زر التثبيت ما ظهرش، استخدم قائمة المتصفح واختر تثبيت التطبيق/إضافة للشاشة الرئيسية.</div>}
      </article>

      <article className="install-card">
        <h2>iPhone / iPad</h2>
        <ol className="ios-install-steps"><li>افتح عكسة في Safari.</li><li>اضغط Share / مشاركة.</li><li>اختر Add to Home Screen / إضافة إلى الشاشة الرئيسية.</li><li>أكد الإضافة.</li></ol>
        {isiPhone?<div className="success-note">أنت على جهاز iOS — اتبع الخطوات اللي فوق.</div>:null}
      </article>
    </section>
  </main>;
}
