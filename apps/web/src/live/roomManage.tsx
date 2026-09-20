import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../runtime';
import { readableError,useApiResource } from '../useApiResource';
import { ScreenHeader,SectionTitle } from '../ui';
import { LiveState,relativeTime } from './common';

function expiryFrom(value:string){
  if(value==='permanent')return null;
  const hours=Number(value);
  return Number.isFinite(hours)&&hours>0?new Date(Date.now()+hours*60*60*1000).toISOString():undefined;
}

export function LiveRoomManageScreen(){
  const {roomId=''}=useParams();
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const resource=useApiResource(()=>api.roomManagement(roomId),[roomId]);
  const management=resource.data?.management;

  async function run(label:string,action:()=>Promise<unknown>){
    setBusy(label);setError('');setNotice('');
    try{await action();setNotice('تم الحفظ ✅');await resource.reload();}
    catch(err){setError(readableError(err));}
    finally{setBusy('');}
  }

  async function saveRoom(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    await run('room',()=>api.updateRoom(roomId,{
      name:String(form.get('name')??'').trim(),
      description:String(form.get('description')??'').trim()||null,
      visibility:String(form.get('visibility')??'public') as 'public'|'private',
      genderPolicy:String(form.get('genderPolicy')??'everyone') as 'everyone'|'boys'|'girls',
      maxUsers:Number(form.get('maxUsers')??50),
      status:String(form.get('status')??'active') as 'active'|'closed'
    }));
  }

  async function addModerator(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=new FormData(event.currentTarget);
    const username=String(form.get('username')??'').trim();
    await run('moderator',()=>api.addRoomModerator(roomId,username));
    if(!error)event.currentTarget.reset();
  }

  async function addBan(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=new FormData(event.currentTarget);
    const username=String(form.get('username')??'').trim();
    const reason=String(form.get('reason')??'').trim();
    const expiresAt=expiryFrom(String(form.get('duration')??'permanent'));
    await run('ban',()=>api.banRoomUser(roomId,{username,...(reason?{reason}:{}),...(expiresAt===undefined?{}:{expiresAt})}));
  }

  async function addInvite(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=new FormData(event.currentTarget);
    const username=String(form.get('username')??'').trim();
    const expiresAt=expiryFrom(String(form.get('duration')??'168'));
    await run('invite',()=>api.inviteRoomUser(roomId,{username,...(expiresAt===undefined?{}:{expiresAt})}));
  }

  return <main className="page-shell">
    <ScreenHeader title="إدارة الغرفة" eyebrow={management?.room.name||'غرفة'} backTo={'/rooms/'+roomId}/>
    {error?<div className="live-error" role="alert">{error}</div>:null}
    {notice?<div className="success-note" role="status">{notice}</div>:null}
    <LiveState loading={resource.loading} error={resource.error} empty={!management}>
      {management?.permissions.canEditRoom?<>
        <SectionTitle title="إعدادات الغرفة"/>
        <form className="live-form" onSubmit={saveRoom}>
          <label><span>الاسم</span><input name="name" defaultValue={management.room.name} minLength={2} maxLength={60} required/></label>
          <label><span>الوصف</span><textarea name="description" defaultValue={management.room.description??''} maxLength={240}/></label>
          <div className="form-grid">
            <label><span>الخصوصية</span><select name="visibility" defaultValue={management.room.visibility}><option value="public">عامة</option><option value="private">خاصة</option></select></label>
            <label><span>الفئة</span><select name="genderPolicy" defaultValue={management.room.genderPolicy}><option value="everyone">للجميع</option><option value="boys">أولاد فقط</option><option value="girls">بنات فقط</option></select></label>
            <label><span>الحد الأقصى</span><input name="maxUsers" type="number" min={2} max={500} defaultValue={management.room.maxUsers} required/></label>
            <label><span>الحالة</span><select name="status" defaultValue={management.room.status==='closed'?'closed':'active'}><option value="active">مفتوحة</option><option value="closed">مغلقة</option></select></label>
          </div>
          <button className="primary-button small" disabled={busy==='room'}>حفظ إعدادات الغرفة</button>
        </form>
      </>:null}

      {management?.permissions.canManageModerators?<>
        <SectionTitle title="المشرفون"/>
        <form className="live-form admin-inline-form" onSubmit={addModerator}>
          <input name="username" placeholder="Username" required/>
          <button className="secondary-button" disabled={busy==='moderator'}>إضافة مشرف</button>
        </form>
        <div className="settings-list">{management.moderators.length?management.moderators.map((item)=><article className="setting-static" key={item.username}><span><b>{item.displayName}</b><small>@{item.username} · {relativeTime(item.createdAt)}</small></span><button className="secondary-button" type="button" onClick={()=>void run('moderator:'+item.username,()=>api.removeRoomModerator(roomId,item.username))}>إزالة</button></article>):<div className="empty-state-inline">ما فيش مشرفين إضافيين.</div>}</div>
      </>:null}

      {management?.permissions.canModerate?<>
        <SectionTitle title="حظر من الغرفة"/>
        <form className="live-form" onSubmit={addBan}>
          <label><span>Username</span><input name="username" required/></label>
          <label><span>السبب</span><input name="reason" maxLength={240}/></label>
          <label><span>المدة</span><select name="duration" defaultValue="24"><option value="1">ساعة</option><option value="24">24 ساعة</option><option value="168">7 أيام</option><option value="720">30 يوم</option><option value="permanent">دائم</option></select></label>
          <button className="secondary-button" disabled={busy==='ban'}>حظر</button>
        </form>
        <div className="settings-list">{management.bans.length?management.bans.map((item)=><article className="setting-static" key={item.username}><span><b>@{item.username}</b><small>{item.reason||'بدون سبب'} · {item.expiresAt?'ينتهي '+new Date(item.expiresAt).toLocaleString('ar-LY'):'دائم'}</small></span><button className="secondary-button" type="button" onClick={()=>void run('unban:'+item.username,()=>api.unbanRoomUser(roomId,item.username))}>فك الحظر</button></article>):<div className="empty-state-inline">ما فيش حظر نشط.</div>}</div>

        <SectionTitle title="دعوات الغرفة الخاصة"/>
        {management.room.visibility==='private'?<>
          <form className="live-form" onSubmit={addInvite}>
            <label><span>Username</span><input name="username" required/></label>
            <label><span>مدة الدعوة</span><select name="duration" defaultValue="168"><option value="24">24 ساعة</option><option value="168">7 أيام</option><option value="720">30 يوم</option><option value="permanent">بدون انتهاء</option></select></label>
            <button className="secondary-button" disabled={busy==='invite'}>إرسال الدعوة</button>
          </form>
          <div className="settings-list">{management.invites.length?management.invites.map((item)=><article className="setting-static" key={item.username}><span><b>{item.displayName}</b><small>@{item.username}{item.expiresAt?' · حتى '+new Date(item.expiresAt).toLocaleString('ar-LY'):' · بدون انتهاء'}</small></span><button className="secondary-button" type="button" onClick={()=>void run('invite:'+item.username,()=>api.revokeRoomInvite(roomId,item.username))}>إلغاء الدعوة</button></article>):<div className="empty-state-inline">ما فيش دعوات نشطة.</div>}</div>
        </>:<div className="privacy-note"><span>🔒</span><div><b>الدعوات للغرف الخاصة فقط</b><p>حوّل الغرفة إلى خاصة من الإعدادات لإدارة الدعوات.</p></div></div>}
      </>:null}
    </LiveState>
  </main>;
}
