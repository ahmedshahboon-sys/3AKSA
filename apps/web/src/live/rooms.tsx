import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ChatMessage, Room, TvChannel } from '@3aksa/api-client';
import { api, realtime } from '../runtime';
import { useSession } from '../session';
import { readableError, useApiResource } from '../useApiResource';
import { Avatar, ScreenHeader, V1GuardNote } from '../ui';
import { Icon } from '../icons';
import { LiveRoomCard, LiveState, genderToUi, localTime } from './common';
import { ProtectedVoicePlayer, VoiceRecorderButton } from './voice';
import { LiveTvPlayer } from './tvPlayer';

type RoomTvState={
  enabled:boolean;
  channel:TvChannel|null;
  updatedAt:string|null;
  canManage?:boolean;
  selectedChannel?:TvChannel|null;
};

function upsertMessage(list:ChatMessage[],message:ChatMessage){
  const index=list.findIndex((item)=>item.id===message.id);
  if(index>=0){
    const next=[...list];
    next[index]=message;
    return next;
  }
  return [...list,message].toSorted((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
}

export function LiveRoomsScreen(){
  const navigate=useNavigate();
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<'all'|'everyone'|'boys'|'girls'|'favorites'>('all');
  const [sort,setSort]=useState<'people'|'alphabetical'|'newest'>('people');
  const [createOpen,setCreateOpen]=useState(false);
  const [createBusy,setCreateBusy]=useState(false);
  const [createError,setCreateError]=useState('');

  const resource=useApiResource(async()=>{
    const response=await api.rooms({
      ...(query ? {search:query} : {}),
      ...(filter==='everyone'||filter==='boys'||filter==='girls' ? {genderPolicy:filter} : {}),
      ...(filter==='favorites' ? {favoritesOnly:true} : {}),
      sort:sort==='newest'?'newest':'alphabetical'
    });
    return response.rooms;
  },[query,filter,sort]);

  const rooms=useMemo(()=>{
    const list=resource.data??[];
    return sort==='people'
      ? [...list].sort((a,b)=>(b.onlineCount??0)-(a.onlineCount??0)||a.name.localeCompare(b.name,'ar'))
      : list;
  },[resource.data,sort]);

  async function favorite(room:Room){
    try{
      await api.favoriteRoom(room.id,!room.favorite);
      resource.setData((current)=>current?.map((item)=>item.id===room.id?{...item,favorite:!room.favorite}:item)??null);
    }catch(error){
      setCreateError(readableError(error));
    }
  }

  async function createRoom(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setCreateBusy(true);setCreateError('');
    const form=new FormData(event.currentTarget);
    try{
      const description=String(form.get('description')??'').trim();
      const response=await api.createRoom({
        name:String(form.get('name')??'').trim(),
        ...(description ? {description} : {}),
        visibility:String(form.get('visibility')??'public') as 'public'|'private',
        genderPolicy:String(form.get('genderPolicy')??'everyone') as Room['genderPolicy'],
        maxUsers:Number(form.get('maxUsers')??50)
      });
      setCreateOpen(false);
      navigate('/rooms/'+response.room.id);
    }catch(error){setCreateError(readableError(error));}
    finally{setCreateBusy(false);}
  }

  return (
    <main className="page-shell">
      <ScreenHeader title="الغرف" eyebrow="مباشر" trailing={<button className="primary-button small" type="button" onClick={()=>setCreateOpen((v)=>!v)}><Icon name="plus" size={18}/> إنشاء غرفة</button>} />
      {createOpen?(
        <form className="live-form create-room-form" onSubmit={createRoom}>
          <label><span>اسم الغرفة</span><input name="name" minLength={2} maxLength={60} required /></label>
          <label><span>الوصف</span><input name="description" maxLength={240} /></label>
          <div className="form-grid">
            <label><span>النوع</span><select name="genderPolicy" defaultValue="everyone"><option value="everyone">للجميع</option><option value="boys">أولاد فقط</option><option value="girls">بنات فقط</option></select></label>
            <label><span>الخصوصية</span><select name="visibility" defaultValue="public"><option value="public">عامة</option><option value="private">خاصة</option></select></label>
            <label><span>الحد الأقصى</span><input name="maxUsers" type="number" min={2} max={500} defaultValue={50}/></label>
          </div>
          {createError?<div className="live-error">{createError}</div>:null}
          <button className="primary-button small" disabled={createBusy} type="submit">{createBusy?'جاري الإنشاء...':'إنشاء'}</button>
        </form>
      ):null}

      <label className="search-box"><Icon name="search" size={20}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="دور على غرفة..." aria-label="البحث عن غرفة" /></label>
      <div className="chips">
        {[['all','الكل'],['everyone','للجميع'],['boys','أولاد'],['girls','بنات'],['favorites','المفضلة']].map(([value,label])=>(
          <button key={value} type="button" className={filter===value?'chip active':'chip'} onClick={()=>setFilter(value as typeof filter)}>{label}</button>
        ))}
      </div>
      <label className="sort-select"><span>الترتيب</span><select value={sort} onChange={(e)=>setSort(e.target.value as typeof sort)}><option value="people">الأكثر ناس الآن</option><option value="alphabetical">أبجدي</option><option value="newest">الأحدث</option></select></label>
      {createError&&!createOpen?<div className="live-error">{createError}</div>:null}
      <LiveState loading={resource.loading} error={resource.error} empty={!rooms.length}>
        <div className="stack">{rooms.map((room)=><LiveRoomCard key={room.id} room={room} onFavorite={(item)=>void favorite(item)}/>)}</div>
      </LiveState>
    </main>
  );
}

export function LiveRoomChatScreen(){
  const {roomId=''}=useParams();
  const {user}=useSession();
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [onlineCount,setOnlineCount]=useState(0);
  const [composer,setComposer]=useState('');
  const [actionError,setActionError]=useState('');
  const [sending,setSending]=useState(false);
  const [tv,setTv]=useState<RoomTvState|null>(null);

  const resource=useApiResource(async()=>{
    const roomResponse=await api.room(roomId);
    await api.joinCheck(roomId);
    const [messageResponse,tvResponse]=await Promise.all([api.roomMessages(roomId,{limit:100}),api.roomTv(roomId)]);
    let channels:TvChannel[]=[];
    const tvState=tvResponse.tv as RoomTvState;
    if(tvState.canManage){channels=(await api.tvChannels({sort:'manual',limit:500})).channels;}
    return {room:roomResponse.room,messages:messageResponse.messages,tv:tvState,channels};
  },[roomId]);

  useEffect(()=>{
    if(!resource.data)return;
    setMessages([...resource.data.messages].reverse());
    setOnlineCount(resource.data.room.onlineCount??0);
    setTv(resource.data.tv);
  },[resource.data]);

  useEffect(()=>{
    if(!roomId||!resource.data)return;
    let active=true;
    const offMessage=realtime.on('room:message',(payload)=>{
      const message=payload.message as ChatMessage & {roomId?:string};
      if(!active||(payload.roomId&&payload.roomId!==roomId)||(message.roomId&&message.roomId!==roomId))return;
      setMessages((current)=>upsertMessage(current,message));
    });
    const offDelete=realtime.on('room:message-deleted',(payload)=>{if(payload.roomId===roomId)setMessages((current)=>current.filter((item)=>item.id!==payload.messageId));});
    const offPresence=realtime.on('room:presence',(payload)=>{if(payload.roomId===roomId)setOnlineCount(payload.onlineCount);});
    const offReaction=realtime.on('room:reaction',(payload)=>{
      if(payload.roomId!==roomId)return;
      setMessages((current)=>current.map((item)=>item.id===payload.messageId?{...item,reactions:{like:{count:payload.count,reacted:item.reactions?.like.reacted??false}}}:item));
    });
    const offTv=realtime.on('room:tv-state',(payload)=>{
      if(payload.roomId!==roomId)return;
      setTv((current)=>{
        const base:RoomTvState=current??{enabled:false,channel:null,updatedAt:null};
        return {...base,...(payload.tv as Pick<RoomTvState,'enabled'|'channel'|'updatedAt'>)};
      });
    });
    void realtime.joinRoom(roomId).then((ack)=>{if(!ack.ok&&active)setActionError(readableError(new Error(String(ack.error??'REALTIME_ERROR'))));});
    return()=>{
      active=false;
      offMessage();offDelete();offPresence();offReaction();offTv();
      void realtime.leaveRoom(roomId);
    };
  },[roomId,resource.data]);

  async function sendText(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const text=composer.trim();
    if(!text||sending)return;
    setSending(true);setActionError('');
    try{
      const ack=await realtime.sendRoomText(roomId,text) as {ok?:boolean;error?:string;message?:ChatMessage;replayed?:boolean};
      if(!ack.ok)throw new Error(ack.error??'MESSAGE_SEND_FAILED');
      if(ack.message)setMessages((current)=>upsertMessage(current,ack.message!));
      setComposer('');
    }catch(error){setActionError(readableError(error));}
    finally{setSending(false);}
  }

  async function sendVoice(audio:ArrayBuffer,durationMs:number){
    setActionError('');
    const ack=await realtime.sendRoomVoice(roomId,audio,durationMs) as {ok?:boolean;error?:string;message?:ChatMessage};
    if(!ack.ok)throw new Error(ack.error??'VOICE_SEND_FAILED');
    if(ack.message)setMessages((current)=>upsertMessage(current,ack.message!));
  }

  async function toggleLike(message:ChatMessage){
    const current=message.reactions?.like.reacted??false;
    const ack=await realtime.setRoomLike(roomId,message.id,!current) as {ok?:boolean;error?:string;like?:{count:number}};
    if(!ack.ok){setActionError(ack.error??'REACTION_UPDATE_FAILED');return;}
    setMessages((items)=>items.map((item)=>item.id===message.id?{...item,reactions:{like:{count:ack.like?.count??item.reactions?.like.count??0,reacted:!current}}}:item));
  }

  async function removeMessage(messageId:string){
    try{await api.deleteRoomMessage(roomId,messageId);setMessages((items)=>items.filter((item)=>item.id!==messageId));}
    catch(error){setActionError(readableError(error));}
  }

  async function blockRoomMember(username:string){
    if(!window.confirm(`حظر @${username} وإلغاء العلاقة والتواصل المباشر؟`))return;
    setActionError('');
    try{
      await api.blockUser(username);
      setMessages((items)=>items.filter((item)=>item.sender?.username!==username));
    }catch(error){setActionError(readableError(error));}
  }
  async function shareRoom(){
    const url=window.location.href;
    try{
      if(navigator.share)await navigator.share({title:resource.data?.room.name||'عكسة',url});
      else await navigator.clipboard.writeText(url);
    }catch{/* cancelled share */}
  }

  async function updateTv(channelId:string|null,enabled:boolean){
    const ack=await realtime.setRoomTv(roomId,{channelId,enabled}) as {ok?:boolean;error?:string;tv?:RoomTvState};
    if(!ack.ok){setActionError(ack.error??'TV_UPDATE_FAILED');return;}
    if(ack.tv)setTv((current)=>{
      const base:RoomTvState=current??{enabled:false,channel:null,updatedAt:null};
      return {...base,...ack.tv};
    });
  }

  if(resource.loading)return <main className="page-shell"><div className="live-loading">جاري دخول الغرفة...</div></main>;
  if(resource.error||!resource.data)return <main className="page-shell"><ScreenHeader title="الغرفة" backTo="/rooms"/><div className="live-error">{resource.error||'تعذر فتح الغرفة'}</div></main>;
  const {room,channels}=resource.data;
  const canManageTv=Boolean(tv?.canManage||room.viewerRole==='owner'||room.viewerRole==='moderator');

  return (
    <main className="page-shell chat-screen">
      <ScreenHeader title={room.name} eyebrow={onlineCount+' موجود الآن'} backTo="/rooms" trailing={<div className="header-actions"><button className="icon-button compact" type="button" onClick={()=>void shareRoom()} aria-label="مشاركة"><Icon name="share"/></button></div>} />

      {tv?.enabled&&tv.channel?(
        <section className="tv-player compact-player">
          <div className="tv-stage"><LiveTvPlayer src={tv.channel.streamUrl} title={tv.channel.name}/></div>
          <div className="tv-controls"><div><b>{tv.channel.name}</b><small>{tv.channel.groupName||'بث مباشر'}</small></div></div>
        </section>
      ):null}

      {canManageTv?(
        <section className="room-tv-manager">
          <b>تحكم التلفزيون</b>
          <select value={tv?.channel?.id??tv?.selectedChannel?.id??''} onChange={(e)=>void updateTv(e.target.value||null,Boolean(e.target.value))}>
            <option value="">إيقاف التلفزيون</option>
            {channels.map((channel)=><option key={channel.id} value={channel.id}>{channel.name}</option>)}
          </select>
          {tv?.channel?<button type="button" className="secondary-button" onClick={()=>void updateTv(tv.channel?.id??null,!tv.enabled)}>{tv.enabled?'إيقاف':'تشغيل'}</button>:null}
        </section>
      ):null}

      {actionError?<div className="live-error">{actionError}</div>:null}
      <section className="room-chat-feed" aria-label="رسائل الغرفة">
        {messages.length?messages.map((message)=>{
          const mine=message.sender?.id===user?.id;
          return (
            <article className={mine?'message-row mine':'message-row'} key={message.id}>
              {!mine?<Avatar name={message.sender?.displayName||'مستخدم'} gender={genderToUi(message.sender?.gender)}/>:null}
              <div>
                <div className="message-author"><b>{mine?'أنت':message.sender?.displayName||'مستخدم'}</b><time>{localTime(message.createdAt)}</time></div>
                {message.type==='voice'?(
                  <ProtectedVoicePlayer load={()=>api.blob('/rooms/'+encodeURIComponent(roomId)+'/messages/'+encodeURIComponent(message.id)+'/voice')}/>
                ):<div className="message-bubble">{message.text||''}</div>}
                <div className="message-actions">
                  <button type="button" className={message.reactions?.like.reacted?'active':''} onClick={()=>void toggleLike(message)}>❤️ {message.reactions?.like.count??0}</button>
                  {(mine||room.viewerRole!=='viewer')?<button type="button" onClick={()=>void removeMessage(message.id)}>حذف</button>:null}
                  {!mine&&message.sender?.username?<><Link className="link-reset" to={'/profiles/'+encodeURIComponent(message.sender.username)}>الملف</Link><Link className="link-reset" to={'/profiles/'+encodeURIComponent(message.sender.username)+'?report=1'}>بلاغ</Link><button type="button" onClick={()=>void blockRoomMember(message.sender!.username)}>حظر</button></>:null}
                </div>
              </div>
            </article>
          );
        }):<div className="empty-state-inline">ابدأ أول رسالة في الغرفة 👋</div>}
      </section>

      <form className="chat-composer live-composer" onSubmit={sendText}>
        <input value={composer} onChange={(e)=>setComposer(e.target.value)} maxLength={2000} aria-label="نص الرسالة" placeholder="اكتب حاجة..." />
        <VoiceRecorderButton disabled={sending} onReady={sendVoice}/>
        <button type="submit" className="composer-button send" disabled={sending||!composer.trim()} aria-label="إرسال"><Icon name="send"/></button>
      </form>
      <V1GuardNote/>
    </main>
  );
}
