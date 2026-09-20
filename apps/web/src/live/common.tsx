import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Room } from '@3aksa/api-client';
import { Icon } from '../icons';

export function genderToUi(gender:'boy'|'girl'|undefined){
  return gender==='girl'?'female':'male';
}

export function localTime(value:string|Date|undefined|null){
  if(!value)return '';
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  return new Intl.DateTimeFormat('ar-LY',{hour:'2-digit',minute:'2-digit'}).format(date);
}

export function relativeTime(value:string|undefined|null){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  const seconds=Math.max(0,Math.floor((Date.now()-date.getTime())/1000));
  if(seconds<60)return 'الآن';
  if(seconds<3600)return `${Math.floor(seconds/60)} د`;
  if(seconds<86400)return `${Math.floor(seconds/3600)} س`;
  return `${Math.floor(seconds/86400)} ي`;
}

export function LiveState({loading,error,empty,onRetry,children}:{
  loading:boolean;error:string;empty?:boolean;onRetry?:()=>void;children:ReactNode;
}){
  if(loading)return <div className="live-loading" role="status" aria-live="polite">جاري التحميل...</div>;
  if(error)return <div className="live-error" role="alert"><span>{error}</span>{onRetry?<button type="button" className="secondary-button" onClick={onRetry}>إعادة المحاولة</button>:null}</div>;
  if(empty)return <div className="empty-state-inline" role="status">ما فيش بيانات توا.</div>;
  return <>{children}</>;
}

export function LiveRoomCard({room,onFavorite}:{room:Room;onFavorite?:(room:Room)=>void}){
  const kind=room.genderPolicy==='boys'?'أولاد':room.genderPolicy==='girls'?'بنات':'للجميع';
  return (
    <article className="room-card">
      <div className="room-card-main">
        <div className="room-icon"><Icon name="rooms" /></div>
        <div className="room-copy">
          <div className="room-title-row">
            <h3>{room.name}</h3>
            {room.tvEnabled?<span className="tv-badge">TV</span>:null}
            {onFavorite?(
              <button className={room.favorite?'favorite-button active':'favorite-button'} type="button" aria-label={room.favorite?'إزالة من المفضلة':'إضافة للمفضلة'} onClick={()=>onFavorite(room)}>
                <Icon name="heart" size={17} />
              </button>
            ):null}
          </div>
          <p>{room.description||'غرفة دردشة عكسة'}</p>
          <div className="meta-row">
            <span>● {room.onlineCount??0} موجود</span>
            <span>{kind}</span>
            <span>المسؤول: {room.owner.displayName}</span>
          </div>
        </div>
      </div>
      <Link className="primary-button small link-reset" to={`/rooms/${room.id}`}>ادخل</Link>
    </article>
  );
}
