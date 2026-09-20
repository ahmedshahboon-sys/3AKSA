import { useState,type ChangeEvent,type FormEvent } from 'react';
import type { StoreItem } from '@3aksa/api-client';
import { api } from '../runtime';
import { readableError,useApiResource } from '../useApiResource';
import { LiveState } from './common';
import { ScreenHeader,SectionTitle } from '../ui';

const types:StoreItem['type'][]=['frame','entry_sound','sticker_pack','badge','gift','reaction','theme'];

function parseMilli(value:string){
  const text=value.trim();
  if(!/^\\d+(?:\\.\\d{1,3})?$/.test(text))return null;
  const parts=text.split('.');const whole=parts[0]??'0';const fraction=parts[1]??'';
  const n=Number(whole)*1000+Number(fraction.padEnd(3,'0'));
  return Number.isSafeInteger(n)&&n>0?n:null;
}
function asLyd(value:number){return (value/1000).toFixed(3)+' LYD';}
function fileBase64(file:File){
  return new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('FILE_READ_FAILED'));
    reader.onload=()=>{const raw=String(reader.result??'');const index=raw.indexOf(',');resolve(index>=0?raw.slice(index+1):raw);};
    reader.readAsDataURL(file);
  });
}

export function LiveAdminStoreScreen(){
  const me=useApiResource(()=>api.adminMe(),[]);
  const [mfaCode,setMfaCode]=useState('');
  const [unlocked,setUnlocked]=useState('');
  const [items,setItems]=useState<StoreItem[]>([]);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);

  async function load(code=unlocked){if(!code)return;setItems((await api.adminStoreItems(code)).items);}
  async function unlock(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setNotice('');
    try{const code=mfaCode.trim();setItems((await api.adminStoreItems(code)).items);setUnlocked(code);}catch(err){setError(readableError(err));}finally{setBusy(false);}
  }
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setNotice('');
    const form=new FormData(event.currentTarget);
    const type=String(form.get('type')) as StoreItem['type'];
    const priceMilli=parseMilli(String(form.get('price')??''));
    const shareRaw=String(form.get('recipientShare')??'').trim();
    const recipientShareMilli=shareRaw?parseMilli(shareRaw):0;
    if(!priceMilli||recipientShareMilli===null){setBusy(false);setError('السعر أو حصة المستلم غير صالحة.');return;}
    try{
      const metadataText=String(form.get('metadata')??'').trim();
      const metadata=metadataText?JSON.parse(metadataText) as Record<string,unknown>:{};
      await api.adminCreateStoreItem(unlocked,{
        code:String(form.get('code')??'').trim().toLowerCase(),type,name:String(form.get('name')??'').trim(),
        description:String(form.get('description')??'').trim()||null,priceMilli,recipientShareMilli:recipientShareMilli||0,
        status:String(form.get('status')??'draft') as 'draft'|'active'|'hidden',metadata
      });
      setNotice('تم إنشاء العنصر ✅');event.currentTarget.reset();await load();
    }catch(err){setError(readableError(err));}finally{setBusy(false);}
  }
  async function setStatus(item:StoreItem,next:'active'|'hidden'){
    setBusy(true);setError('');setNotice('');
    try{await api.adminUpdateStoreItem(unlocked,item.id,{status:next});setNotice(next==='active'?'تم النشر ✅':'تم الإخفاء ✅');await load();}
    catch(err){setError(readableError(err));}finally{setBusy(false);}
  }
  async function retire(item:StoreItem){
    if(!window.confirm('إخفاء/تقاعد هذا العنصر؟ الملكيات القديمة لن تُحذف.'))return;
    setBusy(true);setError('');setNotice('');
    try{await api.adminRetireStoreItem(unlocked,item.id);setNotice('تم تقاعد العنصر بدون حذف ملكيات المستخدمين ✅');await load();}
    catch(err){setError(readableError(err));}finally{setBusy(false);}
  }
  async function upload(item:StoreItem,event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];if(!file)return;setBusy(true);setError('');setNotice('');
    try{if(file.size>1024*1024)throw new Error('الملف أكبر من 1MB.');await api.adminUploadStoreAsset(unlocked,item.id,await fileBase64(file));setNotice('تم رفع الأصل والتحقق منه ✅');await load();}
    catch(err){setError(readableError(err));}finally{event.target.value='';setBusy(false);}
  }

  const roles=me.data?.roles??[];
  if(!me.loading&&!roles.some(role=>role==='super_admin'||role==='finance_admin')){
    return <main className="page-shell"><ScreenHeader title="إدارة المتجر" backTo="/account"/><div className="live-error">صلاحية إدارة المتجر غير متاحة لهذا الحساب.</div></main>;
  }
  return <main className="page-shell">
    <ScreenHeader title="إدارة المتجر" eyebrow="Store Admin · MFA + Audit" backTo="/admin"/>
    {!unlocked?<form className="live-form" onSubmit={unlock}>
      <label><span>رمز MFA الحالي</span><input value={mfaCode} onChange={e=>setMfaCode(e.target.value)} inputMode="numeric" pattern="\\d{6}" maxLength={6} required/></label>
      <button className="primary-button small" disabled={busy}>فتح إدارة المتجر</button>
    </form>:<>
      {error?<div className="live-error" role="alert">{error}</div>:null}
      {notice?<div className="success-note" role="status">{notice}</div>:null}
      <SectionTitle title="إضافة عنصر"/>
      <form className="live-form" onSubmit={create}>
        <label><span>Code</span><input name="code" pattern="[a-z0-9][a-z0-9_-]{1,63}" dir="ltr" required/></label>
        <label><span>النوع</span><select name="type">{types.map(type=><option key={type} value={type}>{type}</option>)}</select></label>
        <label><span>الاسم</span><input name="name" maxLength={120} required/></label>
        <label><span>الوصف</span><textarea name="description" maxLength={500}/></label>
        <label><span>السعر LYD</span><input name="price" inputMode="decimal" placeholder="1.000" required/></label>
        <label><span>حصة المستلم LYD</span><input name="recipientShare" inputMode="decimal" placeholder="0.500"/></label>
        <label><span>الحالة</span><select name="status"><option value="draft">مسودة</option><option value="active">منشور</option><option value="hidden">مخفي</option></select></label>
        <label><span>Metadata JSON اختياري</span><textarea name="metadata" dir="ltr" placeholder='{"stickers":["😂","🌹"]}'/></label>
        <button className="primary-button small" disabled={busy}>إنشاء</button>
      </form>
      <SectionTitle title="العناصر"/>
      <LiveState loading={false} error="" empty={!items.length}>
        <div className="settings-list">{items.map(item=><article className="setting-static" key={item.id}>
          <div className="grow"><b>{item.name} <small>({item.code})</small></b><small>{item.type+' · '+asLyd(item.priceMilli)+' · '+(item.status??'')}</small>
            {item.recipientShareMilli?<small>{'حصة المستلم '+asLyd(item.recipientShareMilli)}</small>:null}
            {item.assetKey?<img src={api.storeAssetUrl(item.code)} alt="" className="store-admin-preview"/>:null}
          </div>
          <div className="admin-actions">
            {item.status!=='active'?<button className="primary-button small" disabled={busy} onClick={()=>void setStatus(item,'active')}>نشر</button>:<button className="secondary-button" disabled={busy} onClick={()=>void setStatus(item,'hidden')}>إخفاء</button>}
            <label className="secondary-button">رفع أصل<input type="file" hidden accept={item.type==='entry_sound'?'audio/mpeg,audio/ogg,audio/webm':'image/png,image/webp,image/gif'} onChange={e=>void upload(item,e)}/></label>
            <button className="secondary-button" disabled={busy} onClick={()=>void retire(item)}>تقاعد</button>
          </div>
        </article>)}</div>
      </LiveState>
    </>}
  </main>;
}
