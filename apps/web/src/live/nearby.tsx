import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Gender } from '@3aksa/api-client';
import { api } from '../runtime';
import { readableError, useApiResource } from '../useApiResource';
import { Avatar, ScreenHeader } from '../ui';
import { LiveState, genderToUi } from './common';

export function LiveNearbyScreen(){
  const navigate=useNavigate();
  const [gender,setGender]=useState<'all'|Gender>('all');
  const [actionError,setActionError]=useState('');
  const [locating,setLocating]=useState(false);
  const resource=useApiResource(async()=>{
    const profile=await api.profileMe();
    if(!profile.profile.nearbyEnabled)return {profile:profile.profile,people:[]};
    try{
      const response=await api.nearby(gender==='all'?undefined:gender);
      return {profile:profile.profile,people:response.nearby};
    }catch(error){
      return {profile:profile.profile,people:[],nearbyError:readableError(error)};
    }
  },[gender]);

  async function setEnabled(enabled:boolean){
    setActionError('');
    try{
      await api.updateProfile({nearbyEnabled:enabled});
      await resource.reload();
    }catch(error){setActionError(readableError(error));}
  }

  async function refreshLocation(){
    setLocating(true);setActionError('');
    try{
      const profile=resource.data?.profile;
      if(!profile?.nearbyEnabled)await api.updateProfile({nearbyEnabled:true});
      const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,()=>reject(new Error('GEOLOCATION_DENIED')),{enableHighAccuracy:true,timeout:15000,maximumAge:60_000}));
      await api.updateNearbyLocation(position.coords.latitude,position.coords.longitude,Math.round(position.coords.accuracy));
      await api.resolvePrayerReference(position.coords.latitude,position.coords.longitude).catch(()=>undefined);
      await resource.reload();
    }catch(error){
      setActionError(readableError(error));
    }finally{setLocating(false);}
  }

  async function addFriend(username:string){
    try{await api.createFriendRequest(username);setActionError('تم إرسال طلب الصداقة ✅');}
    catch(error){setActionError(readableError(error));}
  }

  const enabled=Boolean(resource.data?.profile.nearbyEnabled);
  const people=resource.data?.people??[];
  return (
    <main className="page-shell">
      <ScreenHeader title="القريبون" eyebrow="المسافة تقريبية فقط" trailing={<button className="secondary-button" type="button" onClick={()=>void setEnabled(!enabled)}>{enabled?'إيقاف':'تفعيل'}</button>} />
      <section className="privacy-note"><span>📍</span><div><b>خصوصيتك أولًا</b><p>نستخدم موقعك لإيجاد القريبين، لكن المستخدمين يشوفوا مسافة تقريبية فقط وما يشوفوش الإحداثيات.</p></div></section>
      <button className="primary-button small nearby-refresh" type="button" disabled={locating} onClick={()=>void refreshLocation()}>{locating?'جاري تحديد الموقع...':'تحديث موقعي'}</button>
      <div className="chips">
        {[['all','الكل'],['boy','أولاد'],['girl','بنات']].map(([value,label])=><button key={value} type="button" className={gender===value?'chip active':'chip'} onClick={()=>setGender(value as typeof gender)}>{label}</button>)}
      </div>
      {actionError?<div className={actionError.includes('✅')?'success-note':'live-error'}>{actionError}</div>:null}
      {!enabled&&!resource.loading?<div className="empty-state-inline">فعّل القريبون وحدّث موقعك باش تشوف الناس القريبة.</div>:null}
      {resource.data?.nearbyError?<div className="live-error">{resource.data.nearbyError} — اضغط «تحديث موقعي».</div>:null}
      <LiveState loading={resource.loading} error={resource.error} empty={enabled&&!resource.data?.nearbyError&&!people.length}>
        <div className="stack">{people.map((person)=>(
          <article className="person-card" key={person.id}>
            <Avatar name={person.displayName} gender={genderToUi(person.gender)}/>
            <div className="grow"><h3>{person.displayName} <span className="gender-symbol">{person.gender==='boy'?'♂':'♀'}</span></h3><p>{person.distanceLabel}{person.bio?' · '+person.bio:''}</p></div>
            <div className="person-actions"><button className="secondary-button" type="button" onClick={()=>void addFriend(person.username)}>إضافة</button><button className="secondary-button" type="button" onClick={()=>navigate('/private/new/'+encodeURIComponent(person.username))}>مراسلة</button></div>
          </article>
        ))}</div>
      </LiveState>
    </main>
  );
}
