import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ChatMessage, PrivateConversation } from '@3aksa/api-client';
import { api, realtime } from '../runtime';
import { useSession } from '../session';
import { readableError, useApiResource } from '../useApiResource';
import { Avatar, ScreenHeader, V1GuardNote } from '../ui';
import { Icon } from '../icons';
import { LiveState, genderToUi, localTime, relativeTime } from './common';
import { ProtectedVoicePlayer, VoiceRecorderButton } from './voice';

function upsert(list:ChatMessage[],message:ChatMessage){
  const found=list.findIndex((item)=>item.id===message.id);
  if(found>=0){const next=[...list];next[found]=message;return next;}
  return [...list,message].toSorted((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
}

export function LivePrivateScreen(){
  const [tab,setTab]=useState<'conversations'|'requests'>('conversations');
  const [actionError,setActionError]=useState('');
  const resource=useApiResource(async()=>{
    const [conversations,requests]=await Promise.all([api.privateConversations(),api.privateRequests()]);
    return {conversations:conversations.conversations,requests:requests.requests};
  },[]);

  async function accept(id:string){
    try{await api.acceptPrivateRequest(id);await resource.reload();}
    catch(error){setActionError(readableError(error));}
  }
  async function reject(id:string){
    try{await api.rejectPrivateRequest(id);await resource.reload();}
    catch(error){setActionError(readableError(error));}
  }

  const conversations=resource.data?.conversations??[];
  const requests=resource.data?.requests??[];
  return (
    <main className="page-shell">
      <ScreenHeader title="الخاص" eyebrow="رسائلك" />
      <div className="segmented"><button className={tab==='conversations'?'active':''} onClick={()=>setTab('conversations')} type="button">المحادثات</button><button className={tab==='requests'?'active':''} onClick={()=>setTab('requests')} type="button">طلبات المراسلة {requests.length?<span>{requests.length}</span>:null}</button></div>
      {actionError?<div className="live-error">{actionError}</div>:null}
      <LiveState loading={resource.loading} error={resource.error} empty={tab==='conversations'?!conversations.length:!requests.length}>
        {tab==='conversations'?(
          <div className="stack chat-list">{conversations.map((chat)=>(
            <Link className="chat-row link-reset" to={'/private/'+chat.id} key={chat.id}>
              <Avatar name={chat.peer.displayName} gender={genderToUi(chat.peer.gender)}/>
              <div className="grow"><h3>{chat.peer.displayName}</h3><p>{chat.lastText||'ابدأ المحادثة'}</p></div>
              <div className="chat-meta"><time>{relativeTime(chat.lastMessageAt)}</time></div>
            </Link>
          ))}</div>
        ):(
          <div className="stack">{requests.map((request)=>(
            <article className="request-card" key={request.id}>
              <Avatar name={request.peer.displayName} gender={genderToUi(request.peer.gender)}/>
              <div className="grow"><h3>{request.peer.displayName}</h3><p>{request.text||'طلب مراسلة'}</p><small>{relativeTime(request.createdAt)}</small></div>
              <div className="request-actions"><button className="primary-button small" type="button" onClick={()=>void accept(request.id)}>قبول</button><button className="secondary-button" type="button" onClick={()=>void reject(request.id)}>رفض</button></div>
            </article>
          ))}</div>
        )}
      </LiveState>
      <V1GuardNote/>
    </main>
  );
}

export function LiveConversationScreen(){
  const {conversationId=''}=useParams();
  const {user}=useSession();
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [composer,setComposer]=useState('');
  const [error,setError]=useState('');
  const [sending,setSending]=useState(false);
  const resource=useApiResource(async()=>{
    const conversations=await api.privateConversations();
    const conversation=conversations.conversations.find((item)=>item.id===conversationId);
    if(!conversation)throw new Error('CONVERSATION_NOT_FOUND');
    const history=await api.privateMessages(conversationId,{limit:100});
    return {conversation,messages:history.messages};
  },[conversationId]);

  useEffect(()=>{if(resource.data)setMessages([...resource.data.messages].reverse());},[resource.data]);
  useEffect(()=>{
    if(!conversationId||!resource.data)return;
    const offMessage=realtime.on('private:message',(payload)=>{if(payload.conversationId===conversationId)setMessages((current)=>upsert(current,payload.message as ChatMessage));});
    const offReaction=realtime.on('private:reaction',(payload)=>{
      if(payload.conversationId!==conversationId)return;
      setMessages((current)=>current.map((item)=>item.id===payload.messageId?{...item,reactions:{like:{count:payload.count,reacted:item.reactions?.like.reacted??false}}}:item));
    });
    void realtime.joinPrivate(conversationId).then((ack)=>{if(!ack.ok)setError(String(ack.error??'PRIVATE_JOIN_FAILED'));});
    return()=>{offMessage();offReaction();void realtime.leavePrivate(conversationId);};
  },[conversationId,resource.data]);

  async function send(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const text=composer.trim();if(!text||sending)return;
    setSending(true);setError('');
    try{
      const ack=await realtime.sendPrivateText(conversationId,text) as {ok?:boolean;error?:string;message?:ChatMessage};
      if(!ack.ok)throw new Error(ack.error??'PRIVATE_MESSAGE_SEND_FAILED');
      if(ack.message)setMessages((items)=>upsert(items,ack.message!));
      setComposer('');
    }catch(err){setError(readableError(err));}finally{setSending(false);}
  }
  async function sendVoice(audio:ArrayBuffer,durationMs:number){
    const ack=await realtime.sendPrivateVoice(conversationId,audio,durationMs) as {ok?:boolean;error?:string;message?:ChatMessage};
    if(!ack.ok)throw new Error(ack.error??'PRIVATE_VOICE_SEND_FAILED');
    if(ack.message)setMessages((items)=>upsert(items,ack.message!));
  }
  async function like(message:ChatMessage){
    const active=message.reactions?.like.reacted??false;
    const ack=await realtime.setPrivateLike(conversationId,message.id,!active) as {ok?:boolean;error?:string;like?:{count:number}};
    if(!ack.ok){setError(ack.error??'REACTION_UPDATE_FAILED');return;}
    setMessages((items)=>items.map((item)=>item.id===message.id?{...item,reactions:{like:{count:ack.like?.count??item.reactions?.like.count??0,reacted:!active}}}:item));
  }

  if(resource.loading)return <main className="page-shell"><div className="live-loading">جاري فتح المحادثة...</div></main>;
  if(resource.error||!resource.data)return <main className="page-shell"><ScreenHeader title="الخاص" backTo="/private"/><div className="live-error">{resource.error||'المحادثة مش موجودة'}</div></main>;
  const chat=resource.data.conversation;
  return (
    <main className="page-shell chat-screen">
      <ScreenHeader title={chat.peer.displayName} eyebrow={'@'+chat.peer.username} backTo="/private" trailing={<button className="icon-button compact" type="button" aria-label="المزيد"><Icon name="more"/></button>} />
      {error?<div className="live-error">{error}</div>:null}
      <section className="room-chat-feed private-feed">
        {messages.length?messages.map((message)=>{
          const mine=message.sender?.id===user?.id;
          return <article className={mine?'message-row mine':'message-row'} key={message.id}>
            {!mine?<Avatar name={message.sender?.displayName||chat.peer.displayName} gender={genderToUi(message.sender?.gender)}/>:null}
            <div><div className="message-author"><b>{mine?'أنت':message.sender?.displayName||chat.peer.displayName}</b><time>{localTime(message.createdAt)}</time></div>
              {message.type==='voice'?<ProtectedVoicePlayer load={()=>api.blob('/private/conversations/'+encodeURIComponent(conversationId)+'/messages/'+encodeURIComponent(message.id)+'/voice')}/>:<div className="message-bubble">{message.text||''}</div>}
              <div className="message-actions"><button className={message.reactions?.like.reacted?'active':''} type="button" onClick={()=>void like(message)}>❤️ {message.reactions?.like.count??0}</button></div>
            </div>
          </article>;
        }):<div className="empty-state-inline">ابدأ المحادثة 👋</div>}
      </section>
      <form className="chat-composer live-composer" onSubmit={send}><input value={composer} onChange={(e)=>setComposer(e.target.value)} maxLength={2000} placeholder="اكتب رسالة..." aria-label="نص الرسالة"/><VoiceRecorderButton disabled={sending} onReady={sendVoice}/><button className="composer-button send" disabled={sending||!composer.trim()} type="submit"><Icon name="send"/></button></form>
      <V1GuardNote/>
    </main>
  );
}

export function LiveNewConversationScreen(){
  const {username=''}=useParams();
  const navigate=useNavigate();
  const [text,setText]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const profile=useApiResource(()=>api.profile(username),[username]);
  async function send(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const value=text.trim();if(!value||busy)return;
    setBusy(true);setError('');
    try{
      const ack=await realtime.startPrivate(username,value) as {ok?:boolean;error?:string;conversation?:PrivateConversation;message?:ChatMessage};
      if(!ack.ok)throw new Error(ack.error??'PRIVATE_MESSAGE_START_FAILED');
      if(ack.conversation?.id&&ack.conversation.status!=='pending')navigate('/private/'+ack.conversation.id,{replace:true});
      else navigate('/private',{replace:true});
    }catch(err){setError(readableError(err));}finally{setBusy(false);}
  }
  return <main className="page-shell"><ScreenHeader title={profile.data?.profile.displayName||'مراسلة'} eyebrow={profile.data?'@'+profile.data.profile.username:'طلب مراسلة'} backTo="/private"/>
    <LiveState loading={profile.loading} error={profile.error} empty={false}>
      <form className="live-form" onSubmit={send}><p className="muted">لو مش من أصدقائك، أول رسالة توصل كطلب مراسلة.</p><textarea value={text} onChange={(e)=>setText(e.target.value)} maxLength={2000} rows={4} placeholder="اكتب أول رسالة..." required/>{error?<div className="live-error">{error}</div>:null}<button className="primary-button small" disabled={busy} type="submit">{busy?'جاري الإرسال...':'إرسال'}</button></form>
    </LiveState></main>;
}
