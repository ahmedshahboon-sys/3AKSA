import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AndroidRelease, StoreItem, WalletHistoryItem } from '@3aksa/api-client';
import { api, resolveApiUrl } from '../runtime';
import { useSession } from '../session';
import { readableError, useApiResource } from '../useApiResource';
import { Avatar, ScreenHeader, SectionTitle } from '../ui';
import { Icon } from '../icons';
import { type AppTheme, useAppTheme } from '../theme';
import { LiveState, genderToUi, relativeTime } from './common';
import { isNativeAndroid, nativeAppInfo, openExternalUrl } from '../native';

function parseLyd(value:string){
  const text=value.trim();
  if(!/^\d+(?:\.\d{1,3})?$/.test(text))return null;
  const [whole,fraction='']=text.split('.');
  const milli=Number(whole)*1000+Number(fraction.padEnd(3,'0'));
  return Number.isSafeInteger(milli)&&milli>0?milli:null;
}

function historyLabel(item:WalletHistoryItem){
  if(item.kind==='manual_topup')return 'شحن رصيد';
  if(item.kind==='transfer')return item.amountMilli>0?'تحويل وارد':'تحويل صادر';
  if(item.kind==='purchase')return 'شراء من المتجر';
  if(item.kind==='gift')return item.amountMilli>0?'هدية واردة':'هدية مرسلة';
  if(item.kind==='refund')return 'استرداد';
  return item.kind;
}

const themeOptions:Array<{value:AppTheme;label:string}>=[
  {value:'system',label:'النظام'},{value:'light',label:'فاتح'},{value:'dark',label:'داكن'},
  {value:'pink-light',label:'وردي فاتح'},{value:'pink-dark',label:'وردي داكن'}
];

export function LiveAccountScreen(){
  const {user,logout,refresh}=useSession();
  const {theme,setTheme}=useAppTheme();
  const [editing,setEditing]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const resource=useApiResource(async()=>{
    const [profile,wallet,equipment]=await Promise.all([api.profileMe(),api.wallet(),api.equipment()]);
    let androidUpdate:null|{release:AndroidRelease;required:boolean;versionName:string;versionCode:number}=null;
    if(isNativeAndroid()){
      try{
        const info=await nativeAppInfo();
        if(info){
          const check=await api.androidRelease(info.versionCode);
          if(check.updateAvailable&&check.release){
            androidUpdate={release:check.release,required:check.required,versionName:info.versionName,versionCode:info.versionCode};
          }
        }
      }catch{/* update checks must not block the account screen */}
    }
    return {profile:profile.profile,wallet,equipment:equipment.equipment,androidUpdate};
  },[]);

  async function downloadAndroidUpdate(){
    const release=resource.data?.androidUpdate?.release;
    if(!release)return;
    await openExternalUrl(resolveApiUrl(release.downloadPath));
  }

  async function saveProfile(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');
    const form=new FormData(event.currentTarget);
    try{
      await api.updateProfile({displayName:String(form.get('displayName')??'').trim(),bio:String(form.get('bio')??'').trim()||null});
      await Promise.all([resource.reload(),refresh()]);setEditing(false);
    }catch(err){setError(readableError(err));}finally{setBusy(false);}
  }

  const profile=resource.data?.profile;
  return (
    <main className="page-shell">
      <section className="profile-card">
        <Avatar name={profile?.displayName||user?.displayName||'م'} gender={genderToUi(user?.gender)}/>
        <div className="grow"><h1>{profile?.displayName||user?.displayName} <span className="gender-symbol">{user?.gender==='girl'?'♀':'♂'}</span></h1><p>@{user?.username}{profile?.bio?' · '+profile.bio:''}</p></div>
        <button className="secondary-button" type="button" onClick={()=>setEditing((v)=>!v)}>تعديل</button>
      </section>
      {editing?<form className="live-form" onSubmit={saveProfile}><label><span>الاسم</span><input name="displayName" defaultValue={profile?.displayName||user?.displayName} minLength={2} maxLength={80} required/></label><label><span>النبذة</span><textarea name="bio" defaultValue={profile?.bio||''} maxLength={240} rows={3}/></label>{error?<div className="live-error">{error}</div>:null}<button className="primary-button small" disabled={busy} type="submit">حفظ</button></form>:null}

      <section className="balance-card"><div><span>الرصيد</span><strong>{resource.data?.wallet.balanceLyd??'0.000'} <small>د.ل</small></strong></div><div className="balance-actions"><Link className="link-reset" to="/wallet"><Icon name="wallet" size={18}/> المحفظة</Link><Link className="link-reset" to="/store"><Icon name="store" size={18}/> المتجر</Link></div></section>
      <section className="account-shortcuts"><Link to="/notifications" className="link-reset"><Icon name="bell"/><span>الإشعارات</span></Link><Link to="/store" className="link-reset"><Icon name="store"/><span>مشترياتي</span></Link><Link to="/account/prayer" className="link-reset"><span>🌙</span><span>الصلاة</span></Link></section>
      {resource.data?.androidUpdate?<section className="notification-settings"><div><b>{resource.data.androidUpdate.required?'تحديث عكسة مطلوب':'في تحديث جديد لعكسة'}</b><small>الإصدار {resource.data.androidUpdate.release.versionName} متاح بدل {resource.data.androidUpdate.versionName}</small>{resource.data.androidUpdate.release.notes?<small>{resource.data.androidUpdate.release.notes}</small>:null}</div><button className="primary-button small" type="button" onClick={()=>void downloadAndroidUpdate()}>تحديث التطبيق</button></section>:null}

      <SectionTitle title="الثيم"/>
      <div className="theme-grid">{themeOptions.map((option)=><button className={theme===option.value?'theme-option active':'theme-option'} key={option.value} onClick={()=>setTheme(option.value)} type="button">{option.label}</button>)}</div>
      <SectionTitle title="المفعّل من المتجر"/>
      <div className="settings-list">{resource.data?.equipment.length?resource.data.equipment.map((entry)=><div className="setting-static" key={entry.slot}><span>{entry.slot}</span><b>{entry.item.name}</b></div>):<div className="empty-state-inline">ما فيش تجهيزات مفعلة.</div>}</div>
      <button className="logout-button" type="button" onClick={()=>void logout()}>تسجيل الخروج</button>
    </main>
  );
}

export function LiveWalletScreen(){
  const [mode,setMode]=useState<'none'|'topup'|'transfer'>('none');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const resource=useApiResource(async()=>{
    const [wallet,history,instructions,topups]=await Promise.all([api.wallet(),api.walletHistory(100),api.topupInstructions(),api.topups()]);
    return {wallet,history:history.history,instructions,topups:topups.topups};
  },[]);

  async function submitTopup(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setNotice('');
    const form=new FormData(event.currentTarget);const amount=parseLyd(String(form.get('amount')??''));
    if(!amount){setBusy(false);setError('اكتب مبلغ صحيح بحد أقصى 3 أرقام بعد الفاصلة.');return;}
    try{await api.createTopup(amount,String(form.get('reference')??'').trim()||undefined,String(form.get('note')??'').trim()||undefined);setNotice('تم إرسال طلب الشحن للمراجعة ✅');setMode('none');await resource.reload();}
    catch(err){setError(readableError(err));}finally{setBusy(false);}
  }

  async function submitTransfer(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setNotice('');
    const form=new FormData(event.currentTarget);const amount=parseLyd(String(form.get('amount')??''));
    if(!amount){setBusy(false);setError('المبلغ غير صالح.');return;}
    try{await api.transfer(String(form.get('username')??'').trim(),amount,crypto.randomUUID());setNotice('تم التحويل بنجاح ✅');setMode('none');await resource.reload();}
    catch(err){setError(readableError(err));}finally{setBusy(false);}
  }

  const whatsapp=resource.data?.instructions.contactNumber??'';
  const waNumber=whatsapp.startsWith('0')?'218'+whatsapp.slice(1):whatsapp.replace(/^\+/,'');
  return (
    <main className="page-shell">
      <ScreenHeader title="الرصيد" eyebrow="محفظتك" backTo="/account"/>
      <section className="wallet-hero"><span>الرصيد الحالي</span><strong>{resource.data?.wallet.balanceLyd??'0.000'} <small>د.ل</small></strong><div><button className="primary-button small" type="button" onClick={()=>setMode('topup')}>شحن</button><button className="secondary-button" type="button" onClick={()=>setMode('transfer')}>تحويل</button></div></section>
      {error?<div className="live-error">{error}</div>:null}{notice?<div className="success-note">{notice}</div>:null}
      {mode==='topup'?<form className="live-form" onSubmit={submitTopup}><h3>طلب شحن يدوي</h3><p className="muted">بعد إرسال الطلب تواصل على واتساب {whatsapp} لإتمام المراجعة.</p>{waNumber?<a className="secondary-button link-reset" href={'https://wa.me/'+waNumber} target="_blank" rel="noreferrer">فتح واتساب</a>:null}<label><span>المبلغ بالدينار</span><input name="amount" inputMode="decimal" placeholder="10.000" required/></label><label><span>مرجع الدفع - اختياري</span><input name="reference" maxLength={160}/></label><label><span>ملاحظة - اختياري</span><textarea name="note" maxLength={500}/></label><button className="primary-button small" disabled={busy}>إرسال الطلب</button></form>:null}
      {mode==='transfer'?<form className="live-form" onSubmit={submitTransfer}><h3>تحويل رصيد</h3><label><span>Username المستلم</span><input name="username" required/></label><label><span>المبلغ بالدينار</span><input name="amount" inputMode="decimal" placeholder="1.000" required/></label><button className="primary-button small" disabled={busy}>تحويل</button></form>:null}

      <SectionTitle title="طلبات الشحن"/>
      <div className="transaction-list">{resource.data?.topups.slice(0,5).map((topup)=><article key={topup.id}><div><b>شحن {topup.status}</b><small>{relativeTime(topup.createdAt)}</small></div><strong>{topup.amountLyd} د.ل</strong></article>)}</div>
      <SectionTitle title="سجل العمليات"/>
      <LiveState loading={resource.loading} error={resource.error} empty={!resource.data?.history.length}>
        <div className="transaction-list">{resource.data?.history.map((item)=><article key={item.id}><div><b>{historyLabel(item)}</b><small>{relativeTime(item.createdAt)}</small></div><strong className={item.amountMilli>=0?'amount-positive':'amount-negative'}>{item.amountMilli>=0?'+':''}{item.amountLyd??(item.amountMilli/1000).toFixed(3)} د.ل</strong></article>)}</div>
      </LiveState>
    </main>
  );
}

const categoryMap:Array<{label:string;type?:StoreItem['type']}>=[];
categoryMap.push({label:'الكل'},{label:'إطارات',type:'frame'},{label:'ملصقات',type:'sticker_pack'},{label:'تفاعلات',type:'reaction'},{label:'أصوات دخول',type:'entry_sound'},{label:'ثيمات',type:'theme'},{label:'شارات',type:'badge'},{label:'هدايا',type:'gift'});

export function LiveStoreScreen(){
  const [category,setCategory]=useState<StoreItem['type']|undefined>();
  const [busyCode,setBusyCode]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const resource=useApiResource(async()=>{
    const [items,inventory,equipment,wallet]=await Promise.all([api.storeItems(),api.inventory(),api.equipment(),api.wallet()]);
    return {items:items.items,inventory:inventory.items,equipment:equipment.equipment,wallet};
  },[]);
  const owned=useMemo(()=>new Set(resource.data?.inventory.map((item)=>item.code)??[]),[resource.data]);
  const equipped=useMemo(()=>new Set(resource.data?.equipment.map((entry)=>entry.item.code)??[]),[resource.data]);
  const visible=(resource.data?.items??[]).filter((item)=>!category||item.type===category);

  async function action(item:StoreItem){
    setBusyCode(item.code);setError('');setNotice('');
    try{
      if(owned.has(item.code)){
        if(['frame','entry_sound','theme','badge'].includes(item.type)){await api.equip(item.code);setNotice('تم التفعيل ✅');}
        else setNotice('المنتج موجود عندك ✅');
      }else{
        if(item.consumable){setNotice(item.type==='gift'?'الهدايا تُرسل من حساب المستخدم أو المحادثة.':'هذا العنصر يُستخدم وقت التفاعل.');}
        else{await api.purchase(item.code,crypto.randomUUID());setNotice('تم الشراء ✅');}
      }
      await resource.reload();
    }catch(err){setError(readableError(err));}finally{setBusyCode('');}
  }

  return (
    <main className="page-shell">
      <ScreenHeader title="المتجر" eyebrow={'رصيدك '+(resource.data?.wallet.balanceLyd??'0.000')+' د.ل'} backTo="/account"/>
      <div className="chips">{categoryMap.map((entry)=><button key={entry.label} className={category===entry.type?'chip active':'chip'} onClick={()=>setCategory(entry.type)} type="button">{entry.label}</button>)}</div>
      {error?<div className="live-error">{error}</div>:null}{notice?<div className="success-note">{notice}</div>:null}
      <LiveState loading={resource.loading} error={resource.error} empty={!visible.length}>
        <div className="product-grid">{visible.map((item)=>{const isOwned=owned.has(item.code);const isEquipped=equipped.has(item.code);return <article className="product-card" key={item.id}><div className="product-preview">{item.type==='frame'?'🟢':item.type==='entry_sound'?'🔊':item.type==='theme'?'🎨':item.type==='badge'?'👑':item.type==='gift'?'🌹':item.type==='reaction'?'🔥':'😄'}</div><div><small>{item.type}</small><h3>{item.name}</h3><b>{item.priceLyd??(item.priceMilli/1000).toFixed(3)} د.ل</b>{item.description?<p>{item.description}</p>:null}</div><button className={isOwned?'secondary-button':'primary-button small'} disabled={busyCode===item.code} type="button" onClick={()=>void action(item)}>{busyCode===item.code?'...':isEquipped?'مفعّل':isOwned?'استخدم':item.consumable?'استخدام':'شراء'}</button></article>;})}</div>
      </LiveState>
    </main>
  );
}
