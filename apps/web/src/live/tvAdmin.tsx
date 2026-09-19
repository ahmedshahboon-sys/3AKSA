import { useMemo,useState,type FormEvent } from 'react';
import type { TvAdminChannel } from '@3aksa/api-client';
import { api } from '../runtime';
import { readableError,useApiResource } from '../useApiResource';
import { ScreenHeader,SectionTitle } from '../ui';
import { LiveState,relativeTime } from './common';

const MAX_PLAYLIST_BYTES=2*1024*1024;

export function LiveTvAdminScreen(){
  const [search,setSearch]=useState('');
  const [editing,setEditing]=useState<TvAdminChannel|null>(null);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const resource=useApiResource(async()=>{
    const me=await api.adminMe();
    if(!me.roles.some((role)=>role==='super_admin'||role==='tv_admin'))throw new Error('TV_ADMIN_REQUIRED');
    const [channels,imports]=await Promise.all([api.adminTvChannels(),api.adminTvImports()]);
    return {channels:channels.channels,imports:imports.imports};
  },[]);
  const visible=useMemo(()=>(resource.data?.channels??[]).filter((channel)=>!search||channel.name.toLowerCase().includes(search.toLowerCase())||channel.groupName?.toLowerCase().includes(search.toLowerCase())),[resource.data,search]);

  async function run(label:string,action:()=>Promise<unknown>){
    setBusy(label);setError('');setNotice('');
    try{await action();setNotice('تم تنفيذ العملية ✅');setEditing(null);await resource.reload();}
    catch(err){setError(readableError(err));}
    finally{setBusy('');}
  }

  async function saveChannel(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=new FormData(event.currentTarget);
    const input={
      name:String(form.get('name')??'').trim(),
      groupName:String(form.get('groupName')??'').trim()||null,
      streamUrl:String(form.get('streamUrl')??'').trim(),
      logoUrl:String(form.get('logoUrl')??'').trim()||null,
      status:String(form.get('status')??'active') as 'active'|'hidden',
      rightsAttested:form.get('rightsAttested')==='on',
      rightsNote:String(form.get('rightsNote')??'').trim()||null
    };
    if(!input.rightsAttested){setError('لازم تأكد أن عندك حق إضافة وتشغيل البث.');return;}
    await run('channel',()=>editing?api.updateAdminTvChannel(editing.id,input):api.createAdminTvChannel(input));
  }

  async function importPlaylist(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=new FormData(event.currentTarget);
    const mode=String(form.get('mode')??'url');
    const rightsAttested=form.get('rightsAttested')==='on';
    if(!rightsAttested){setError('تأكيد حقوق البث مطلوب قبل الاستيراد.');return;}
    let content=String(form.get('content')??'');
    const sourceUrl=String(form.get('sourceUrl')??'').trim();
    if(mode==='file'){
      const file=form.get('file');
      if(!(file instanceof File)||!file.size){setError('اختار ملف M3U/M3U8.');return;}
      if(file.size>MAX_PLAYLIST_BYTES){setError('الملف أكبر من 2MB.');return;}
      content=await file.text();
    }
    await run('import',()=>api.importAdminM3u({
      ...(mode==='url'?{sourceUrl}:{content}),
      sourceLabel:String(form.get('sourceLabel')??'').trim()||null,
      rightsAttested:true,
      rightsNote:String(form.get('rightsNote')??'').trim()||null
    }));
  }

  async function move(channel:TvAdminChannel,direction:-1|1){
    const channels=resource.data?.channels??[];
    const index=channels.findIndex((item)=>item.id===channel.id);
    const target=index+direction;
    if(index<0||target<0||target>=channels.length)return;
    const ids=channels.map((item)=>item.id);
    [ids[index],ids[target]]=[ids[target]!,ids[index]!];
    await run('order',()=>api.reorderAdminTvChannels(ids));
  }

  async function alphabetical(){
    const ids=[...(resource.data?.channels??[])].sort((a,b)=>a.name.localeCompare(b.name,'ar')).map((item)=>item.id);
    if(ids.length)await run('order',()=>api.reorderAdminTvChannels(ids));
  }

  async function remove(channel:TvAdminChannel){
    if(!window.confirm(`حذف قناة «${channel.name}»؟`))return;
    await run('delete:'+channel.id,()=>api.deleteAdminTvChannel(channel.id));
  }

  async function removeAll(){
    const confirmation=window.prompt('عملية خطيرة: اكتب DELETE ALL TV للتأكيد');
    if(confirmation!=='DELETE ALL TV')return;
    await run('delete-all',()=>api.deleteAllAdminTvChannels());
  }

  return <main className="page-shell">
    <ScreenHeader title="إدارة التلفزيون" eyebrow="TV Admin" backTo="/account"/>
    {error?<div className="live-error" role="alert">{error}</div>:null}
    {notice?<div className="success-note" role="status">{notice}</div>:null}
    <LiveState loading={resource.loading} error={resource.error} empty={!resource.data}>
      <SectionTitle title={editing?'تعديل القناة':'إضافة قناة'}/>
      <form className="live-form" onSubmit={saveChannel} key={editing?.id??'new'}>
        <div className="form-grid">
          <label><span>الاسم</span><input name="name" defaultValue={editing?.name??''} required maxLength={120}/></label>
          <label><span>المجموعة</span><input name="groupName" defaultValue={editing?.groupName??''} maxLength={120}/></label>
        </div>
        <label><span>رابط البث</span><input name="streamUrl" type="url" defaultValue={editing?.streamUrl??''} required dir="ltr"/></label>
        <label><span>رابط اللوقو - اختياري</span><input name="logoUrl" type="url" defaultValue={editing?.logoUrl??''} dir="ltr"/></label>
        <label><span>الحالة</span><select name="status" defaultValue={editing?.status??'active'}><option value="active">منشورة</option><option value="hidden">مخفية</option></select></label>
        <label><span>ملاحظة الحقوق</span><textarea name="rightsNote" defaultValue={editing?.rightsNote??''} maxLength={500}/></label>
        <label className="check-row"><input name="rightsAttested" type="checkbox" defaultChecked={editing?.rightsConfirmed??false}/><span>أؤكد أن لدي الحق في إضافة وتشغيل هذا البث</span></label>
        <div className="admin-actions"><button className="primary-button small" disabled={busy==='channel'}>{editing?'حفظ التعديل':'إضافة القناة'}</button>{editing?<button className="secondary-button" type="button" onClick={()=>setEditing(null)}>إلغاء</button>:null}</div>
      </form>

      <SectionTitle title="القنوات"/>
      <div className="admin-actions"><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="بحث باسم القناة أو المجموعة"/><button className="secondary-button" type="button" disabled={busy==='order'} onClick={()=>void alphabetical()}>ترتيب أبجدي</button><button className="logout-button" type="button" disabled={busy==='delete-all'} onClick={()=>void removeAll()}>حذف الكل</button></div>
      <div className="settings-list">{visible.length?visible.map((channel,index)=><article className="setting-static" key={channel.id}>
        <span><b>{channel.name}</b><small>{channel.groupName||'بدون مجموعة'} · {channel.status==='active'?'منشورة':'مخفية'} · ترتيب {channel.sortOrder}</small></span>
        <div className="admin-actions">
          <button type="button" className="secondary-button" disabled={index===0||busy==='order'} onClick={()=>void move(channel,-1)}>↑</button>
          <button type="button" className="secondary-button" disabled={index===visible.length-1||busy==='order'} onClick={()=>void move(channel,1)}>↓</button>
          <button type="button" className="secondary-button" onClick={()=>setEditing(channel)}>تعديل</button>
          <button type="button" className="secondary-button" onClick={()=>void run('status:'+channel.id,()=>api.updateAdminTvChannel(channel.id,{status:channel.status==='active'?'hidden':'active',rightsAttested:true}))}>{channel.status==='active'?'إخفاء':'نشر'}</button>
          <button type="button" className="logout-button" onClick={()=>void remove(channel)}>حذف</button>
        </div>
      </article>):<div className="empty-state-inline">ما فيش قنوات مطابقة.</div>}</div>

      <SectionTitle title="استيراد M3U / M3U8"/>
      <form className="live-form" onSubmit={importPlaylist}>
        <label><span>طريقة الاستيراد</span><select name="mode" defaultValue="url"><option value="url">رابط URL</option><option value="paste">لصق المحتوى</option><option value="file">رفع ملف</option></select></label>
        <label><span>رابط الاستيراد</span><input name="sourceUrl" type="url" dir="ltr" placeholder="https://.../playlist.m3u8"/></label>
        <label><span>أو الصق المحتوى</span><textarea name="content" rows={6} placeholder="#EXTM3U"/></label>
        <label><span>أو اختر ملف</span><input name="file" type="file" accept=".m3u,.m3u8,application/vnd.apple.mpegurl,audio/x-mpegurl"/></label>
        <label><span>اسم المصدر</span><input name="sourceLabel" maxLength={160}/></label>
        <label><span>ملاحظة الحقوق</span><textarea name="rightsNote" maxLength={500}/></label>
        <label className="check-row"><input name="rightsAttested" type="checkbox"/><span>أؤكد حقوق استخدام القنوات المستوردة</span></label>
        <button className="primary-button small" disabled={busy==='import'}>استيراد</button>
      </form>

      <SectionTitle title="سجل الاستيراد"/>
      <div className="settings-list">{resource.data?.imports.length?resource.data.imports.map((batch)=><article className="setting-static" key={batch.id}><span><b>{batch.sourceLabel||batch.sourceHost||batch.sourceType}</b><small>مضاف {batch.importedCount} · متجاوز {batch.skippedCount} · {relativeTime(batch.createdAt)}</small></span></article>):<div className="empty-state-inline">ما فيش عمليات استيراد بعد.</div>}</div>
    </LiveState>
  </main>;
}
