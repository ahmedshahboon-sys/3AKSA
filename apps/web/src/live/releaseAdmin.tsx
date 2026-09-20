import { useState,type FormEvent } from 'react';
import type { AdminAndroidRelease } from '@3aksa/api-client';
import { api } from '../runtime';
import { readableError,useApiResource } from '../useApiResource';
import { LiveState,relativeTime } from './common';
import { ScreenHeader,SectionTitle } from '../ui';

const MAX_APK_BYTES=64*1024*1024;

function fileBase64(file:File){
  return new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('FILE_READ_FAILED'));
    reader.onload=()=>{const raw=String(reader.result??'');const comma=raw.indexOf(',');resolve(comma>=0?raw.slice(comma+1):raw);};
    reader.readAsDataURL(file);
  });
}
function bytes(value:number){
  if(value>=1024*1024)return (value/1024/1024).toFixed(1)+' MB';
  return Math.max(1,Math.round(value/1024))+' KB';
}

export function LiveReleaseAdminScreen(){
  const me=useApiResource(()=>api.adminMe(),[]);
  const [mfa,setMfa]=useState('');
  const [unlocked,setUnlocked]=useState('');
  const [releases,setReleases]=useState<AdminAndroidRelease[]>([]);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  async function load(code=unlocked){if(!code)return;setReleases((await api.adminAndroidReleases(code)).releases);}
  async function unlock(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy('unlock');setError('');
    try{const code=mfa.trim();setReleases((await api.adminAndroidReleases(code)).releases);setUnlocked(code);}catch(err){setError(readableError(err));}finally{setBusy('');}
  }
  async function upload(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy('upload');setError('');setNotice('');
    const form=new FormData(event.currentTarget);
    try{
      const file=form.get('apk');
      if(!(file instanceof File)||!file.size)throw new Error('اختار ملف APK موقّع.');
      if(file.size>MAX_APK_BYTES)throw new Error('حجم APK أكبر من 64MB.');
      if(!file.name.toLowerCase().endsWith('.apk'))throw new Error('الملف لازم يكون APK.');
      const versionCode=Number(form.get('versionCode'));
      const minSupportedVersionCode=Number(form.get('minSupportedVersionCode')??0);
      await api.adminUploadAndroidRelease(unlocked,{
        base64:await fileBase64(file),fileName:file.name,versionName:String(form.get('versionName')??'').trim(),
        versionCode,minSupportedVersionCode,channel:String(form.get('channel')??'beta') as 'stable'|'beta',
        notes:String(form.get('notes')??'').trim()||null
      });
      setNotice('تم رفع APK وحساب SHA-256 على السيرفر ✅');event.currentTarget.reset();await load();
    }catch(err){setError(readableError(err));}finally{setBusy('');}
  }
  async function publish(item:AdminAndroidRelease){
    if(!window.confirm(`نشر الإصدار ${item.versionName} (${item.versionCode}) على قناة ${item.channel}؟`))return;
    setBusy('publish:'+item.id);setError('');setNotice('');
    try{await api.adminPublishAndroidRelease(unlocked,item.id);setNotice('تم نشر الإصدار ✅');await load();}catch(err){setError(readableError(err));}finally{setBusy('');}
  }
  async function retire(item:AdminAndroidRelease){
    if(!window.confirm(`تقاعد الإصدار ${item.versionName}؟ رابط التنزيل العام سيتوقف.`))return;
    setBusy('retire:'+item.id);setError('');setNotice('');
    try{await api.adminRetireAndroidRelease(unlocked,item.id);setNotice('تم تقاعد الإصدار ✅');await load();}catch(err){setError(readableError(err));}finally{setBusy('');}
  }
  async function editMinimum(item:AdminAndroidRelease){
    const raw=window.prompt('أقل versionCode مسموح له بالاستمرار بدون تحديث',String(item.minSupportedVersionCode));
    if(raw===null)return;const value=Number(raw);
    if(!Number.isInteger(value)||value<0||value>item.versionCode){setError('قيمة minSupportedVersionCode غير صالحة.');return;}
    setBusy('edit:'+item.id);setError('');
    try{await api.adminUpdateAndroidRelease(unlocked,item.id,{minSupportedVersionCode:value});await load();}catch(err){setError(readableError(err));}finally{setBusy('');}
  }

  const roles=me.data?.roles??[];
  if(!me.loading&&!roles.some(role=>role==='super_admin'||role==='release_admin')){
    return <main className="page-shell"><ScreenHeader title="إدارة الإصدارات" backTo="/account"/><div className="live-error">صلاحية release_admin مطلوبة.</div></main>;
  }
  return <main className="page-shell">
    <ScreenHeader title="إدارة الإصدارات" eyebrow="Android Release Management" backTo="/account"/>
    {!unlocked?<form className="live-form" onSubmit={unlock}>
      <label><span>رمز MFA الحالي</span><input value={mfa} onChange={e=>setMfa(e.target.value)} inputMode="numeric" pattern="\d{6}" maxLength={6} required/></label>
      <button className="primary-button small" disabled={busy==='unlock'}>فتح الإدارة</button>
    </form>:<>
      {error?<div className="live-error" role="alert">{error}</div>:null}
      {notice?<div className="success-note" role="status">{notice}</div>:null}
      <SectionTitle title="رفع APK موقّع"/>
      <form className="live-form" onSubmit={upload}>
        <label><span>APK</span><input name="apk" type="file" accept=".apk,application/vnd.android.package-archive" required/></label>
        <div className="form-grid">
          <label><span>versionName</span><input name="versionName" placeholder="1.0.2" dir="ltr" required/></label>
          <label><span>versionCode</span><input name="versionCode" type="number" min={1} step={1} required/></label>
          <label><span>minSupportedVersionCode</span><input name="minSupportedVersionCode" type="number" min={0} step={1} defaultValue={0} required/></label>
        </div>
        <label><span>القناة</span><select name="channel" defaultValue="beta"><option value="beta">Beta</option><option value="stable">Stable</option></select></label>
        <label><span>Release notes</span><textarea name="notes" maxLength={2000}/></label>
        <p className="muted compact">السيرفر يعيد حساب SHA-256 ولا يثق بأي checksum من المتصفح. التوقيع الرسمي يجب أن يأتي من Trusted Release Workflow.</p>
        <button className="primary-button small" disabled={busy==='upload'}>{busy==='upload'?'جاري الرفع...':'رفع كمسودة'}</button>
      </form>
      <SectionTitle title="الإصدارات"/>
      <LiveState loading={false} error="" empty={!releases.length}>
        <div className="settings-list">{releases.map(item=><article className="setting-static release-row" key={item.id}>
          <span className="grow"><b>{item.versionName} · code {item.versionCode} · {item.channel}</b>
            <small>{item.status} · {bytes(item.fileBytes)} · min {item.minSupportedVersionCode} · {relativeTime(item.createdAt)}</small>
            <code className="wrap-code">SHA-256: {item.sha256}</code>
            {item.notes?<small>{item.notes}</small>:null}
          </span>
          <div className="admin-actions">
            <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={()=>void editMinimum(item)}>Minimum</button>
            {item.status==='draft'?<button type="button" className="primary-button small" disabled={Boolean(busy)} onClick={()=>void publish(item)}>نشر</button>:null}
            {item.status==='published'?<button type="button" className="logout-button" disabled={Boolean(busy)} onClick={()=>void retire(item)}>تقاعد</button>:null}
          </div>
        </article>)}</div>
      </LiveState>
    </>}
  </main>;
}
