import { useState,type FormEvent } from 'react';
import { Link,useNavigate,useParams,useSearchParams } from 'react-router-dom';
import type { FriendRequest,ReportReason } from '@3aksa/api-client';
import { api } from '../runtime';
import { Avatar,ScreenHeader,SectionTitle } from '../ui';
import { readableError,useApiResource } from '../useApiResource';
import { LiveState,genderToUi,relativeTime } from './common';

const reportReasons:Array<{value:ReportReason;label:string}>=[
  {value:'spam',label:'سبام'},
  {value:'harassment',label:'مضايقة'},
  {value:'impersonation',label:'انتحال شخصية'},
  {value:'inappropriate',label:'محتوى غير مناسب'},
  {value:'other',label:'سبب آخر'}
];

export function LiveFriendsScreen(){
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState('');
  const resource=useApiResource(async()=>{
    const [friends,requests,blocked]=await Promise.all([
      api.friends(),api.friendRequests(),api.blockedUsers()
    ]);
    return {friends:friends.friends,requests:requests.requests,blocked:blocked.blocked};
  },[]);

  async function act(key:string,fn:()=>Promise<unknown>,noticeText:string){
    setBusy(key);setError('');setNotice('');
    try{await fn();setNotice(noticeText);await resource.reload();}
    catch(err){setError(readableError(err));}
    finally{setBusy('');}
  }

  const incoming=resource.data?.requests.filter(r=>r.direction==='incoming')??[];
  const outgoing=resource.data?.requests.filter(r=>r.direction==='outgoing')??[];
  const friends=resource.data?.friends??[];
  const blocked=resource.data?.blocked??[];

  function requestCard(request:FriendRequest){
    return <article className="setting-static" key={request.id}>
      <span><b>{request.user.displayName}</b><small>@{request.user.username} · {relativeTime(request.createdAt)}</small></span>
      <div className="admin-actions">
        {request.direction==='incoming'?<>
          <button className="primary-button small" disabled={busy===request.id} onClick={()=>void act(request.id,()=>api.acceptFriendRequest(request.id),'تم قبول الصداقة ✅')}>قبول</button>
          <button className="secondary-button" disabled={busy===request.id} onClick={()=>void act(request.id,()=>api.rejectFriendRequest(request.id),'تم رفض الطلب')}>رفض</button>
        </>:<button className="secondary-button" disabled={busy===request.id} onClick={()=>void act(request.id,()=>api.cancelFriendRequest(request.id),'تم إلغاء الطلب')}>إلغاء</button>}
      </div>
    </article>;
  }

  return <main className="page-shell">
    <ScreenHeader title="الأصدقاء" eyebrow="الطلبات والمحظورون" backTo="/account"/>
    {error?<div className="live-error" role="alert">{error}</div>:null}
    {notice?<div className="success-note" role="status">{notice}</div>:null}

    <SectionTitle title="طلبات واردة"/>
    <div className="settings-list">{incoming.length?incoming.map(requestCard):<div className="empty-state-inline">ما فيش طلبات واردة.</div>}</div>

    <SectionTitle title="طلبات مرسلة"/>
    <div className="settings-list">{outgoing.length?outgoing.map(requestCard):<div className="empty-state-inline">ما فيش طلبات مرسلة.</div>}</div>

    <SectionTitle title="أصدقائي"/>
    <LiveState loading={resource.loading} error={resource.error} empty={!friends.length}>
      <div className="settings-list">{friends.map(friend=><article className="setting-static" key={friend.id}>
        <Link className="link-reset grow" to={'/profiles/'+encodeURIComponent(friend.username)}>
          <b>{friend.displayName}</b><small>@{friend.username}</small>
        </Link>
        <div className="admin-actions">
          <Link className="secondary-button link-reset" to={'/private/new/'+encodeURIComponent(friend.username)}>مراسلة</Link>
          <button className="secondary-button" disabled={busy===friend.username} onClick={()=>void act(friend.username,()=>api.removeFriend(friend.username),'تم حذف الصداقة')}>حذف</button>
        </div>
      </article>)}</div>
    </LiveState>

    <SectionTitle title="المحظورون"/>
    <div className="settings-list">{blocked.length?blocked.map(person=><article className="setting-static" key={person.id}>
      <span><b>{person.displayName}</b><small>@{person.username}</small></span>
      <button className="secondary-button" disabled={busy===person.username} onClick={()=>void act(person.username,()=>api.unblockUser(person.username),'تم فك الحظر ✅')}>فك الحظر</button>
    </article>):<div className="empty-state-inline">قائمة الحظر فاضية.</div>}</div>
  </main>;
}

export function UserSafetyActions({username,onChanged,initialReportOpen=false}:{username:string;onChanged?:()=>void;initialReportOpen?:boolean}){
  const [showReport,setShowReport]=useState(initialReportOpen);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);

  async function block(){
    setBusy(true);setError('');setNotice('');
    try{await api.blockUser(username);setNotice('تم الحظر. انلغت العلاقة والتواصل غير المسموح ✅');onChanged?.();}
    catch(err){setError(readableError(err));}
    finally{setBusy(false);}
  }
  async function report(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setNotice('');
    const form=new FormData(event.currentTarget);
    try{
      await api.reportUser(username,String(form.get('reason')) as ReportReason,String(form.get('details')??'').trim()||undefined);
      setNotice('تم إرسال البلاغ للمراجعة ✅');setShowReport(false);
    }catch(err){setError(readableError(err));}
    finally{setBusy(false);}
  }

  return <div className="live-form">
    <div className="admin-actions">
      <button className="secondary-button" type="button" disabled={busy} onClick={()=>void block()}>حظر</button>
      <button className="secondary-button" type="button" disabled={busy} onClick={()=>setShowReport(v=>!v)}>إبلاغ</button>
    </div>
    {showReport?<form className="live-form" onSubmit={report}>
      <label><span>سبب البلاغ</span><select name="reason" defaultValue="spam">{reportReasons.map(reason=><option value={reason.value} key={reason.value}>{reason.label}</option>)}</select></label>
      <label><span>تفاصيل اختيارية</span><textarea name="details" maxLength={500} rows={3}/></label>
      <button className="primary-button small" disabled={busy}>إرسال البلاغ</button>
    </form>:null}
    {error?<div className="live-error" role="alert">{error}</div>:null}
    {notice?<div className="success-note" role="status">{notice}</div>:null}
  </div>;
}

export function LiveProfileScreen(){
  const {username=''}=useParams();
  const navigate=useNavigate();
  const [searchParams]=useSearchParams();
  const [actionError,setActionError]=useState('');
  const [notice,setNotice]=useState('');
  const resource=useApiResource(()=>api.profile(username),[username]);
  const profile=resource.data?.profile;

  async function addFriend(){
    setActionError('');setNotice('');
    try{await api.createFriendRequest(username);setNotice('تم إرسال طلب الصداقة ✅');}
    catch(err){setActionError(readableError(err));}
  }

  return <main className="page-shell">
    <ScreenHeader title={profile?.displayName||'الملف الشخصي'} eyebrow={profile?'@'+profile.username:'Profile'} backTo="/"/>
    <LiveState loading={resource.loading} error={resource.error} empty={!profile}>
      {profile?<section className="profile-card">
        <Avatar name={profile.displayName} gender={genderToUi(profile.gender)}/>
        <div className="grow"><h1>{profile.displayName}</h1><p>@{profile.username}{profile.bio?' · '+profile.bio:''}</p></div>
      </section>:null}
      {profile?<div className="live-form">
        <div className="admin-actions">
          <button className="primary-button small" type="button" onClick={()=>void addFriend()}>إضافة صديق</button>
          <button className="secondary-button" type="button" onClick={()=>navigate('/private/new/'+encodeURIComponent(profile.username))}>مراسلة</button>
        </div>
        <UserSafetyActions username={profile.username} initialReportOpen={searchParams.get('report')==='1'} onChanged={()=>navigate('/friends')}/>
      </div>:null}
      {actionError?<div className="live-error">{actionError}</div>:null}
      {notice?<div className="success-note">{notice}</div>:null}
    </LiveState>
  </main>;
}
