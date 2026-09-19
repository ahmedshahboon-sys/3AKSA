import { useState } from 'react';
import { api } from '../runtime';
import { readableError,useApiResource } from '../useApiResource';
import { ScreenHeader } from '../ui';
import { LiveState,relativeTime } from './common';

export function LiveDevicesScreen(){
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const resource=useApiResource(()=>api.devices(),[]);

  async function revokeDevice(installationId:string){
    setBusy(installationId);setError('');setNotice('');
    try{
      const result=await api.revokeDeviceSessions(installationId);
      setNotice(`تم تسجيل الخروج من الجهاز (${result.revoked} جلسة) ✅`);
      await resource.reload();
    }catch(err){setError(readableError(err));}
    finally{setBusy('');}
  }

  async function revokeOthers(){
    setBusy('others');setError('');setNotice('');
    try{
      const result=await api.revokeOtherSessions();
      setNotice(`تم تسجيل الخروج من باقي الأجهزة (${result.revoked} جلسة) ✅`);
      await resource.reload();
    }catch(err){setError(readableError(err));}
    finally{setBusy('');}
  }

  const devices=resource.data?.devices??[];
  return <main className="page-shell">
    <ScreenHeader title="أجهزتي" eyebrow="الجلسات النشطة" backTo="/account"/>
    <section className="privacy-note">
      <span>🔐</span>
      <div><b>تحكم في دخول حسابك</b><p>تقدر تقفل جلسات جهاز قديم بدون ما تسجل خروج من جهازك الحالي.</p></div>
    </section>
    {error?<div className="live-error" role="alert">{error}</div>:null}
    {notice?<div className="success-note" role="status">{notice}</div>:null}
    <button className="secondary-button" type="button" disabled={busy==='others'} onClick={()=>void revokeOthers()}>
      {busy==='others'?'جاري...':'تسجيل خروج من باقي الأجهزة'}
    </button>
    <LiveState loading={resource.loading} error={resource.error} empty={!devices.length}>
      <div className="settings-list">
        {devices.map(device=><article className="setting-static" key={device.installationId}>
          <span>
            <b>{device.current?'هذا الجهاز':device.platform||'جهاز'}</b>
            <small>{device.platform||'غير معروف'} · آخر نشاط {relativeTime(device.latestSessionAt||device.lastSeenAt)}</small>
            <small>أول ظهور {relativeTime(device.firstSeenAt)} · جلسات نشطة {device.activeSessions}</small>
          </span>
          {device.current
            ?<strong>حالي</strong>
            :<button className="secondary-button" type="button" disabled={busy===device.installationId||device.activeSessions===0} onClick={()=>void revokeDevice(device.installationId)}>
              {busy===device.installationId?'...':'تسجيل خروج'}
            </button>}
        </article>)}
      </div>
    </LiveState>
  </main>;
}
