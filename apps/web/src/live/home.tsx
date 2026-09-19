import { Link } from 'react-router-dom';
import { api } from '../runtime';
import { useSession } from '../session';
import { useApiResource } from '../useApiResource';
import { Avatar, Header, SectionTitle } from '../ui';
import { Icon } from '../icons';
import { LiveRoomCard, LiveState, genderToUi } from './common';

export function LiveHomeScreen(){
  const {user,offline}=useSession();
  const resource=useApiResource(async()=>{
    const [rooms,friends,wallet,prayer,notifications]=await Promise.all([
      api.rooms({sort:'alphabetical'}),
      api.friends(),
      api.wallet(),
      api.prayerSchedule(),
      api.notifications(20)
    ]);
    return {rooms:rooms.rooms,friends:friends.friends,wallet,prayer:prayer.prayer,notifications:notifications.notifications};
  },[]);

  const data=resource.data;
  const unread=data?.notifications.filter((item)=>!item.readAt).length??0;
  const prayer=data?.prayer;
  const nextPrayer=prayer ? ([
    ['fajr','الفجر'],['dhuhr','الظهر'],['asr','العصر'],['maghrib','المغرب'],['isha','العشاء']
  ] as const)
    .map(([key,label])=>({key,label,...prayer.schedule[key]}))
    .find((item)=>new Date(item.instant).getTime()>Date.now()) : undefined;

  return (
    <main className="page-shell">
      <Header />
      {offline?<div className="offline-banner">أنت توا Offline — نعرض آخر واجهة محفوظة، والبيانات الحية ترجع لما يرجع النت.</div>:null}

      <section className="welcome-card">
        <div>
          <p className="eyebrow">هلا {user?.displayName||'بيك'} 👋</p>
          <h1>وين تبي تعكس اليوم؟</h1>
          <p className="muted compact">الغرف والخاص والتلفزيون مربوطين بالسيرفر الحقيقي.</p>
        </div>
        <span className="online-pill">● {offline?'Offline':'متصل'}</span>
      </section>

      <SectionTitle title="الغرف النشطة الآن" action="شوف الكل" actionTo="/rooms" />
      <LiveState loading={resource.loading} error={resource.error} empty={!data?.rooms.length}>
        <div className="stack">{data?.rooms.slice(0,3).map((room)=><LiveRoomCard key={room.id} room={room}/>)}</div>
      </LiveState>

      <SectionTitle title="الأصدقاء" action="إدارة" actionTo="/friends" />
      <div className="friends-row" aria-label="الأصدقاء">
        {data?.friends.slice(0,8).map((friend)=>(
          <Link className="friend-mini link-reset" to={'/profiles/'+encodeURIComponent(friend.username)} key={friend.id}>
            <Avatar name={friend.displayName} gender={genderToUi(friend.gender)} />
            <span>{friend.displayName}</span>
          </Link>
        ))}
        {!resource.loading && !data?.friends.length?<span className="muted">ما عندكش أصدقاء توا.</span>:null}
      </div>

      <section className="feature-grid">
        <Link className="feature-card tv-card link-reset" to="/tv">
          <span className="feature-icon"><Icon name="tv" size={25}/></span>
          <span><b>التلفزيون</b><small>القنوات المرخصة المتاحة</small></span>
          <Icon name="chevron" size={18}/>
        </Link>
        <Link className="feature-card link-reset" to="/notifications">
          <span className="feature-icon"><Icon name="bell" size={25}/></span>
          <span><b>الإشعارات</b><small>{unread?`${unread} جديد`:'ما فيش جديد'}</small></span>
          {unread?<span className="count-badge">{Math.min(unread,99)}</span>:null}
        </Link>
      </section>

      <section className="prayer-card">
        <span>🌙</span>
        <div>
          <b>الصلاة القادمة</b>
          <small>{nextPrayer?`${nextPrayer.label} · ${nextPrayer.localTime} · ${prayer?.reference.name}`:'راجع مواقيت الصلاة'}</small>
        </div>
      </section>

      <section className="counter-grid" aria-label="ملخص الحساب">
        <div><strong>{data?.rooms.reduce((sum,room)=>sum+(room.onlineCount??0),0)??0}</strong><span>بالغرف</span></div>
        <div><strong>{data?.friends.length??0}</strong><span>أصدقاء</span></div>
        <div><strong>{data?.wallet.balanceLyd??'0.000'}</strong><span>د.ل</span></div>
      </section>
    </main>
  );
}
