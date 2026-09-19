import { useState, type FormEvent } from 'react';
import type {
  AdminAuditEntry, AdminOverview, AdminRecoveryRequest, AdminReport, AdminTopup, AdminUserDetail, AdminUserSummary
} from '@3aksa/api-client';
import { api } from '../runtime';
import { readableError, useApiResource } from '../useApiResource';
import { LiveState, relativeTime } from './common';
import { ScreenHeader, SectionTitle } from '../ui';

type AdminData={
  overview:AdminOverview;
  users:AdminUserSummary[];
  reports:AdminReport[];
  topups:AdminTopup[];
  audit:AdminAuditEntry[];
  recovery:AdminRecoveryRequest[];
};

export function LiveAdminScreen(){
  const me=useApiResource(()=>api.adminMe(),[]);
  const [setupSecret,setSetupSecret]=useState<{secret:string;otpauth:string}|null>(null);
  const [mfaCode,setMfaCode]=useState('');
  const [unlockedCode,setUnlockedCode]=useState('');
  const [data,setData]=useState<AdminData|null>(null);
  const [selected,setSelected]=useState<AdminUserDetail|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState('');
  const [moderationReason,setModerationReason]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [breakGlass,setBreakGlass]=useState<Awaited<ReturnType<typeof api.adminBreakGlassPrivate>>|null>(null);
  const [recoveryCode,setRecoveryCode]=useState<{username:string;requestId:string;code:string;expiresAt:string}|null>(null);

  async function load(code=unlockedCode){
    if(!code)return;
    const [overview,users,reports,topups,audit,recovery]=await Promise.all([
      api.adminOverview(code),api.adminUsers(code,{limit:50}),api.adminReports(code),
      api.adminTopups(code),api.adminAudit(code,100),api.adminRecoveryRequests(code)
    ]);
    setData({
      overview:overview.overview,users:users.users,reports:reports.reports,
      topups:topups.topups,audit:audit.audit,recovery:recovery.requests
    });
  }

  async function beginSetup(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');
    const form=new FormData(event.currentTarget);
    try{
      setSetupSecret(await api.adminMfaSetup(String(form.get('password')??'')));
    }catch(err){setError(readableError(err));}finally{setBusy(false);}
  }

  async function confirmSetup(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');
    const form=new FormData(event.currentTarget);
    try{
      await api.adminMfaConfirm(String(form.get('code')??'').trim());
      setSetupSecret(null);setNotice('تم تفعيل التحقق بخطوتين ✅');await me.reload();
    }catch(err){setError(readableError(err));}finally{setBusy(false);}
  }

  async function unlock(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setNotice('');
    try{
      const code=mfaCode.trim();
      const overview=await api.adminOverview(code);
      const [users,reports,topups,audit,recovery]=await Promise.all([
        api.adminUsers(code,{limit:50}),api.adminReports(code),api.adminTopups(code),api.adminAudit(code,100),api.adminRecoveryRequests(code)
      ]);
      setUnlockedCode(code);
      setData({overview:overview.overview,users:users.users,reports:reports.reports,topups:topups.topups,audit:audit.audit,recovery:recovery.requests});
    }catch(err){setError(readableError(err));}finally{setBusy(false);}
  }

  async function searchUsers(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!unlockedCode)return;
    setBusy(true);setError('');
    try{
      const query=search.trim();
      const result=await api.adminUsers(unlockedCode,{...(query?{search:query}:{}),limit:100});
      setData((current)=>current?{...current,users:result.users}:current);
    }catch(err){setError(readableError(err));}finally{setBusy(false);}
  }

  async function openUser(userId:string){
    setBusy(true);setError('');
    try{setSelected((await api.adminUser(unlockedCode,userId)).user);}
    catch(err){setError(readableError(err));}finally{setBusy(false);}
  }

  async function moderate(action:'ban'|'unban'|'delete'|'reset'){
    if(!selected)return;
    const reason=moderationReason.trim();
    if(reason.length<3){setError('اكتب سبب واضح للعملية الإدارية.');return;}
    setBusy(true);setError('');setNotice('');
    try{
      if(action==='ban')await api.adminBanUser(unlockedCode,selected.id,reason);
      if(action==='unban')await api.adminUnbanUser(unlockedCode,selected.id,reason);
      if(action==='delete')await api.adminDeleteUser(unlockedCode,selected.id,reason);
      if(action==='reset'){
        if(newPassword.length<8){setError('كلمة المرور الجديدة قصيرة.');setBusy(false);return;}
        await api.adminResetPassword(unlockedCode,selected.id,newPassword,reason);
      }
      setNotice('تم تنفيذ العملية وتسجيلها في سجل التدقيق ✅');
      setModerationReason('');setNewPassword('');
      await Promise.all([load(),openUser(selected.id)]);
    }catch(err){setError(readableError(err));}finally{setBusy(false);}
  }

  async function reviewRecovery(request:AdminRecoveryRequest,approve:boolean){
    setBusy(true);setError('');setNotice('');setRecoveryCode(null);
    try{
      if(approve){
        const result=await api.adminApproveRecovery(unlockedCode,request.requestId);
        setRecoveryCode({
          username:result.recovery.username,
          requestId:result.recovery.requestId,
          code:result.recovery.recoveryCode,
          expiresAt:result.recovery.expiresAt
        });
        setNotice('تمت الموافقة. سلّم الرمز للمستخدم عبر قناة موثوقة؛ الرمز مؤقت ويظهر هنا الآن فقط.');
      }else{
        await api.adminRejectRecovery(unlockedCode,request.requestId);
        setNotice('تم رفض طلب الاسترجاع وتسجيل العملية ✅');
      }
      await load();
    }catch(err){setError(readableError(err));}
    finally{setBusy(false);}
  }

  async function reviewTopup(id:string,approve:boolean){
    setBusy(true);setError('');
    try{
      if(approve)await api.adminApproveTopup(unlockedCode,id);
      else await api.adminRejectTopup(unlockedCode,id);
      await load();
    }catch(err){setError(readableError(err));}finally{setBusy(false);}
  }

  async function closeReport(id:string){
    setBusy(true);setError('');
    try{await api.adminReviewReport(unlockedCode,id,'closed','تمت المراجعة من لوحة الإدارة');await load();}
    catch(err){setError(readableError(err));}finally{setBusy(false);}
  }

  async function inspectPrivate(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');
    const form=new FormData(event.currentTarget);
    const conversationId=String(form.get('conversationId')??'').trim();
    const reason=String(form.get('reason')??'').trim();
    try{setBreakGlass(await api.adminBreakGlassPrivate(unlockedCode,conversationId,reason,100));await load();}
    catch(err){setError(readableError(err));}finally{setBusy(false);}
  }

  if(me.loading)return <main className="page-shell"><div className="boot-loader" role="status">جاري فتح لوحة الإدارة...</div></main>;
  if(me.error||!me.data){
    return <main className="page-shell"><ScreenHeader title="لوحة الإدارة" backTo="/account"/><div className="live-error">هذه الصفحة مخصصة للإدارة.</div></main>;
  }
  if(!me.data.roles.includes('super_admin')){
    return <main className="page-shell"><ScreenHeader title="لوحة الإدارة" backTo="/account"/><div className="live-error">صلاحية Super Admin مطلوبة.</div></main>;
  }

  if(!me.data.mfa.enabled){
    return <main className="page-shell">
      <ScreenHeader title="تأمين لوحة الإدارة" eyebrow="Super Admin" backTo="/account"/>
      <section className="notification-settings"><div><b>التحقق بخطوتين إجباري</b><small>قبل فتح بيانات الإدارة لازم تربط تطبيق Authenticator.</small></div></section>
      {error?<div className="live-error">{error}</div>:null}{notice?<div className="success-note">{notice}</div>:null}
      {!setupSecret?
        <form className="live-form" onSubmit={beginSetup}>
          <label><span>كلمة مرور حسابك</span><input name="password" type="password" required/></label>
          <button className="primary-button small" disabled={busy}>بدء إعداد MFA</button>
        </form>:
        <>
          <section className="live-form">
            <h3>أضف الحساب في تطبيق Authenticator</h3>
            <label><span>المفتاح</span><input readOnly value={setupSecret.secret}/></label>
            <details><summary>رابط الإعداد</summary><code className="wrap-code">{setupSecret.otpauth}</code></details>
          </section>
          <form className="live-form" onSubmit={confirmSetup}>
            <label><span>رمز الـ6 أرقام</span><input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required/></label>
            <button className="primary-button small" disabled={busy}>تأكيد وتفعيل MFA</button>
          </form>
        </>}
    </main>;
  }

  if(!unlockedCode||!data){
    return <main className="page-shell">
      <ScreenHeader title="لوحة الإدارة" eyebrow="محمية بـ MFA" backTo="/account"/>
      {error?<div className="live-error">{error}</div>:null}
      <form className="live-form" onSubmit={unlock}>
        <label><span>رمز Authenticator</span><input value={mfaCode} onChange={(e)=>setMfaCode(e.target.value)} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required/></label>
        <button className="primary-button small" disabled={busy}>فتح اللوحة</button>
      </form>
    </main>;
  }

  const mapsUrl=selected?.lastLocation
    ?`https://www.google.com/maps/search/?api=1&query=${selected.lastLocation.latitude},${selected.lastLocation.longitude}`
    :'';

  return <main className="page-shell">
    <ScreenHeader title="لوحة الإدارة" eyebrow="Super Admin" backTo="/account"/>
    {error?<div className="live-error">{error}</div>:null}{notice?<div className="success-note">{notice}</div>:null}

    <div className="admin-metrics">
      <article><small>الحسابات النشطة</small><strong>{data.overview.users.active}</strong></article>
      <article><small>المحظورة</small><strong>{data.overview.users.banned}</strong></article>
      <article><small>البلاغات المفتوحة</small><strong>{data.overview.openReports}</strong></article>
      <article><small>طلبات الشحن</small><strong>{data.overview.pendingTopups}</strong></article>
      <article><small>الغرف النشطة</small><strong>{data.overview.activeRooms}</strong></article>
    </div>

    <SectionTitle title="إدارة المستخدمين"/>
    <form className="live-form admin-inline-form" onSubmit={searchUsers}>
      <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Username أو الاسم أو الهاتف"/>
      <button className="secondary-button" disabled={busy}>بحث</button>
    </form>
    <div className="settings-list">
      {data.users.map((user)=><button className="setting-static admin-user-row" type="button" key={user.id} onClick={()=>void openUser(user.id)}>
        <span><b>{user.displayName}</b><small>@{user.username} · {user.phone}</small></span><strong>{user.status}</strong>
      </button>)}
    </div>

    {selected?<section className="live-form admin-user-detail">
      <h3>{selected.displayName} <small>@{selected.username}</small></h3>
      <p>الحالة: <b>{selected.status}</b> · الهاتف: {selected.phone}</p>
      <p>الأجهزة المسجلة: {selected.devices.length}</p>
      {selected.lastLocation?<div className="notification-settings"><div><b>آخر موقع متاح</b><small>{selected.lastLocation.latitude}, {selected.lastLocation.longitude} · دقة {selected.lastLocation.accuracyM??'—'}م · {relativeTime(selected.lastLocation.updatedAt)}</small></div><a className="secondary-button link-reset" href={mapsUrl} target="_blank" rel="noreferrer">Google Maps</a></div>:<p className="muted">لا يوجد موقع محفوظ.</p>}
      <label><span>سبب العملية</span><textarea value={moderationReason} onChange={(e)=>setModerationReason(e.target.value)} maxLength={500}/></label>
      <div className="admin-actions">
        {selected.status==='active'?<button className="secondary-button" type="button" disabled={busy} onClick={()=>void moderate('ban')}>حظر الحساب والجهاز</button>:null}
        {selected.status==='banned'?<button className="secondary-button" type="button" disabled={busy} onClick={()=>void moderate('unban')}>فك الحظر</button>:null}
        {selected.status!=='deleted'?<button className="logout-button" type="button" disabled={busy} onClick={()=>void moderate('delete')}>حذف الحساب</button>:null}
      </div>
      {selected.status==='active'?<><label><span>كلمة مرور جديدة للاستعادة</span><input type="password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} minLength={8}/></label><button className="secondary-button" type="button" disabled={busy} onClick={()=>void moderate('reset')}>إعادة تعيين كلمة المرور</button></>:null}
    </section>:null}

    <SectionTitle title="طلبات استرجاع الحساب"/>
    {recoveryCode?<section className="live-form danger-zone" role="status">
      <b>رمز استرجاع مؤقت لـ @{recoveryCode.username}</b>
      <label><span>Request ID</span><input readOnly value={recoveryCode.requestId} dir="ltr"/></label>
      <label><span>Recovery Code</span><input readOnly value={recoveryCode.code} dir="ltr"/></label>
      <small>ينتهي: {new Date(recoveryCode.expiresAt).toLocaleString('ar-LY')}</small>
      <p className="muted">لا ترسل الرمز علنًا ولا تحفظه في ملاحظات غير آمنة.</p>
    </section>:null}
    <div className="settings-list">{data.recovery.length?data.recovery.map((request)=><article className="setting-static" key={request.requestId}>
      <span><b>@{request.username}</b><small>{request.displayName} · {relativeTime(request.createdAt)}</small><small dir="ltr">{request.requestId}</small></span>
      <div className="admin-actions"><button className="primary-button small" disabled={busy} onClick={()=>void reviewRecovery(request,true)}>موافقة</button><button className="secondary-button" disabled={busy} onClick={()=>void reviewRecovery(request,false)}>رفض</button></div>
    </article>):<div className="empty-state-inline">لا توجد طلبات استرجاع معلقة.</div>}</div>

    <SectionTitle title="طلبات شحن الرصيد"/>
    <div className="settings-list">{data.topups.length?data.topups.map((topup)=><article className="setting-static" key={topup.id}><span><b>@{topup.user.username}</b><small>{(topup.amountMilli/1000).toFixed(3)} د.ل · {relativeTime(topup.createdAt)}</small></span><div className="admin-actions"><button className="primary-button small" disabled={busy} onClick={()=>void reviewTopup(topup.id,true)}>قبول</button><button className="secondary-button" disabled={busy} onClick={()=>void reviewTopup(topup.id,false)}>رفض</button></div></article>):<div className="empty-state-inline">لا توجد طلبات معلقة.</div>}</div>

    <SectionTitle title="البلاغات"/>
    <div className="settings-list">{data.reports.filter((r)=>r.status!=='closed').map((report)=><article className="setting-static" key={report.id}><span><b>{report.reason} ضد @{report.target.username}</b><small>{report.details||'بدون تفاصيل'} · {relativeTime(report.createdAt)}</small></span><button className="secondary-button" disabled={busy} onClick={()=>void closeReport(report.id)}>إغلاق بعد المراجعة</button></article>)}</div>

    <SectionTitle title="Break‑Glass للخاص"/>
    <form className="live-form danger-zone" onSubmit={inspectPrivate}>
      <p className="muted">استخدمه فقط عند الحاجة. السبب، العملية، وعدد الرسائل تُسجل في Audit Log.</p>
      <label><span>Conversation ID</span><input name="conversationId" required/></label>
      <label><span>سبب الاطلاع</span><textarea name="reason" minLength={10} maxLength={500} required/></label>
      <button className="logout-button" disabled={busy}>فتح الرسائل المؤقتة المتاحة</button>
    </form>
    {breakGlass?<div className="settings-list">{breakGlass.messages.map((message)=><article className="setting-static" key={message.id}><span><b>@{message.sender.username}</b><small>{message.type==='text'?message.text:`رسالة صوتية · ${message.voice?.durationMs??0}ms`} · {relativeTime(message.createdAt)}</small></span></article>)}</div>:null}

    <SectionTitle title="سجل التدقيق"/>
    <div className="settings-list">{data.audit.slice(0,50).map((entry)=><article className="setting-static" key={entry.id}><span><b>{entry.action}</b><small>@{entry.actor.username}{entry.target?' → @'+(entry.target.username??entry.target.id):''} · {relativeTime(entry.createdAt)}</small>{entry.reason?<small>{entry.reason}</small>:null}</span></article>)}</div>
  </main>;
}
