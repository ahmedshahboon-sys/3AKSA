import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from './icons';
import { nearbyPeople, notifications, privateChats, rooms, storeProducts, transactions } from './data';
import { Avatar, Header, ScreenHeader, SectionTitle, StatusCard, V1GuardNote } from './ui';
import { type AppTheme, useAppTheme } from './theme';

function RoomCard({ room }: { room: (typeof rooms)[number] }) {
  return (
    <article className="room-card">
      <div className="room-card-main">
        <div className="room-icon"><Icon name="rooms" /></div>
        <div className="room-copy">
          <div className="room-title-row">
            <h3>{room.name}</h3>
            {room.tv ? <span className="tv-badge">TV</span> : null}
            <button className="favorite-button" type="button" aria-label={room.favorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}><Icon name="heart" size={17} /></button>
          </div>
          <p>{room.description}</p>
          <div className="meta-row"><span>● {room.count} موجود</span><span>{room.kind}</span><span>المسؤول: {room.owner}</span></div>
        </div>
      </div>
      <Link className="primary-button small link-reset" to={`/rooms/${room.id}`}>ادخل</Link>
    </article>
  );
}

export function HomeScreen() {
  return (
    <main className="page-shell">
      <Header />
      <section className="welcome-card">
        <div>
          <p className="eyebrow">هلا بيك 👋</p>
          <h1>وين تبي تعكس اليوم؟</h1>
          <p className="muted compact">اختار غرفة، شوف أصحابك، أو خش للتلفزيون.</p>
        </div>
        <span className="online-pill">● متصل</span>
      </section>

      <SectionTitle title="الغرف النشطة الآن" action="شوف الكل" actionTo="/rooms" />
      <div className="stack">{rooms.slice(0, 2).map((room) => <RoomCard key={room.id} room={room} />)}</div>

      <SectionTitle title="الأصدقاء Online" action="الأصدقاء" />
      <div className="friends-row" aria-label="الأصدقاء المتصلون">
        {['محمد', 'سارة', 'خالد', 'رهف', 'علي'].map((name, index) => (
          <div className="friend-mini" key={name}><Avatar name={name} gender={index % 2 ? 'female' : 'male'} /><span>{name}</span></div>
        ))}
      </div>

      <section className="feature-grid">
        <Link className="feature-card tv-card link-reset" to="/tv">
          <span className="feature-icon"><Icon name="tv" size={25} /></span>
          <span><b>التلفزيون</b><small>شوف القنوات المتاحة</small></span>
          <Icon name="chevron" size={18} />
        </Link>
        <Link className="feature-card link-reset" to="/notifications">
          <span className="feature-icon"><Icon name="users" size={25} /></span>
          <span><b>طلبات جديدة</b><small>2 صداقة · 1 مراسلة</small></span>
          <span className="count-badge">3</span>
        </Link>
      </section>

      <section className="soft-ad" aria-label="إعلان"><span>إعلان</span><p>مساحة إعلان خفيفة بدون تعطيل تجربة الدردشة.</p></section>

      <section className="prayer-card"><span>🌙</span><div><b>الصلاة القادمة</b><small>المغرب · سيظهر الوقت بعد تفعيل بيانات المواقيت المحلية</small></div></section>
      <div className="toast-preview">وقت صلاة المغرب 🌙 نوض صلّي وتعالى</div>

      <section className="counter-grid" aria-label="عدادات عامة">
        <div><strong>128</strong><span>Online</span></div><div><strong>2.4K</strong><span>مسجل</span></div><div><strong>310</strong><span>زائر</span></div>
      </section>
    </main>
  );
}

export function RoomsScreen() {
  const [filter, setFilter] = useState('الكل');
  const [sort, setSort] = useState('الأكثر ناس الآن');
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => rooms
    .filter((room) => filter === 'الكل' || (filter === 'المفضلة' ? room.favorite : room.kind === filter))
    .filter((room) => room.name.includes(query) || room.description.includes(query))
    .toSorted((a, b) => sort === 'أبجدي' ? a.name.localeCompare(b.name, 'ar') : sort === 'الأحدث' ? b.id.localeCompare(a.id) : b.count - a.count), [filter, query, sort]);

  return (
    <main className="page-shell">
      <ScreenHeader title="الغرف" eyebrow="3AKSA" trailing={<button className="primary-button small" type="button"><Icon name="plus" size={18} /> إنشاء غرفة</button>} />
      <label className="search-box"><Icon name="search" size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="البحث عن غرفة" placeholder="دور على غرفة..." /></label>
      <div className="chips" role="group" aria-label="تصنيف الغرف">{['الكل', 'للجميع', 'أولاد', 'بنات', 'المفضلة'].map((item) => <button className={filter === item ? 'chip active' : 'chip'} key={item} onClick={() => setFilter(item)} type="button">{item}</button>)}</div>
      <label className="sort-select"><span>الترتيب</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option>الأكثر ناس الآن</option><option>الأكثر نشاطًا</option><option>أبجدي</option><option>الأحدث</option></select></label>
      <div className="stack">{filtered.length ? filtered.map((room) => <RoomCard key={room.id} room={room} />) : <StatusCard icon="empty" title="ما فيش غرف مطابقة" body="جرّب فلتر أو كلمة بحث ثانية." />}</div>
    </main>
  );
}

export function RoomChatScreen() {
  const { roomId } = useParams();
  const room = rooms.find((item) => item.id === roomId) ?? rooms[0];
  return (
    <main className="page-shell chat-screen">
      <ScreenHeader title={room.name} eyebrow={`${room.count} موجود الآن`} backTo="/rooms" trailing={<div className="header-actions"><button className="icon-button compact" type="button" aria-label="مفضلة"><Icon name="heart" /></button><button className="icon-button compact" type="button" aria-label="مشاركة"><Icon name="share" /></button><button className="icon-button compact" type="button" aria-label="المزيد"><Icon name="more" /></button></div>} />
      {room.tv ? <section className="tv-player compact-player"><div className="tv-stage"><Icon name="tv" size={34} /><span>بث تجريبي غير متصل في Phase 1</span></div><div className="tv-controls"><div><b>ليبيا الرياضية</b><small>مشاهدة فقط</small></div><div className="header-actions"><button type="button" className="icon-button compact" aria-label="الصوت"><Icon name="volume" /></button><button type="button" className="icon-button compact" aria-label="ملء الشاشة"><Icon name="fullscreen" /></button></div></div></section> : null}
      <section className="room-chat-feed" aria-label="رسائل الغرفة">
        <div className="system-message">محمد دخل الغرفة</div>
        <article className="message-row"><Avatar name="خالد" gender="male" /><div><div className="message-author"><b>خالد</b><span>♂</span><time>02:11</time></div><div className="message-bubble">مرحبا بالجميع 👋</div></div></article>
        <article className="message-row"><Avatar name="سارة" gender="female" /><div><div className="message-author"><b>سارة</b><span>♀</span><span className="role-badge">مشرفة</span><time>02:12</time></div><div className="message-bubble">سهرة نار 🔥</div><div className="reaction-line">🔥 3 · 😄 2</div></div></article>
        <article className="message-row mine"><div><div className="message-author"><b>أنت</b><time>02:13</time></div><div className="message-bubble">تمام 😄</div></div></article>
        <div className="gift-event">🎁 أحمد أرسل وردة ذهبية إلى سارة</div>
        <div className="system-message">علي خرج من الغرفة</div>
      </section>
      <section className="reaction-sheet-preview"><b>تفاعل سريع</b><div><button type="button">❤️</button><button type="button">😂</button><button type="button">🔥</button><button type="button">👏</button><button type="button">✨</button><button type="button">🎁 هدية</button></div></section>
      <form className="chat-composer" onSubmit={(event) => event.preventDefault()}><button type="button" className="composer-button" aria-label="ملصقات وتفاعلات"><Icon name="smile" /></button><input aria-label="نص الرسالة" placeholder="اكتب حاجة..." /><button type="button" className="composer-button" aria-label="تسجيل صوتي"><Icon name="mic" /></button><button type="submit" className="composer-button send" aria-label="إرسال"><Icon name="send" /></button></form>
      <V1GuardNote />
    </main>
  );
}

export function NearbyScreen() {
  return (
    <main className="page-shell">
      <ScreenHeader title="القريبون" eyebrow="خصوصيتك أولًا" trailing={<span className="permission-pill">الموقع مفعّل</span>} />
      <section className="privacy-note"><Icon name="nearby" /><div><b>المسافة تقريبية فقط</b><p>ما نعرضوش خريطة أو إحداثيات أو موقعك الدقيق لأي مستخدم.</p></div></section>
      <div className="chips">{['الكل', 'أولاد', 'بنات'].map((item, index) => <button className={index === 0 ? 'chip active' : 'chip'} key={item} type="button">{item}</button>)}</div>
      <div className="stack">{nearbyPeople.map((person) => <article className="person-card" key={person.name}><Avatar name={person.name} gender={person.gender} /><div className="grow"><h3>{person.name} <span className="gender-symbol">{person.gender === 'male' ? '♂' : '♀'}</span></h3><p>{person.distance} · {person.mutual}</p></div><div className="person-actions"><button className="secondary-button" type="button">إضافة</button><Link className="secondary-button link-reset" to={`/private/${person.name}`}>مراسلة</Link><button className="icon-button compact" type="button" aria-label="حظر أو إبلاغ"><Icon name="more" /></button></div></article>)}</div>
    </main>
  );
}

export function PrivateScreen() {
  return (
    <main className="page-shell">
      <ScreenHeader title="الخاص" eyebrow="رسائلك" />
      <div className="segmented"><button className="active" type="button">المحادثات</button><button type="button">طلبات المراسلة <span>1</span></button></div>
      <div className="stack chat-list">{privateChats.map((chat) => <Link className="chat-row link-reset" to={`/private/${chat.id}`} key={chat.id}><Avatar name={chat.name} /><div className="grow"><h3>{chat.name}</h3><p>{chat.voice ? '🎙️ ' : ''}{chat.preview}</p></div><div className="chat-meta"><time>{chat.time}</time>{chat.unread ? <span>{chat.unread}</span> : null}</div></Link>)}</div>
      <V1GuardNote />
    </main>
  );
}

export function ConversationScreen() {
  const { userId } = useParams();
  const chat = privateChats.find((item) => item.id === userId) ?? { name: userId || 'مستخدم' };
  return (
    <main className="page-shell chat-screen">
      <ScreenHeader title={chat.name} eyebrow="● متصل" backTo="/private" trailing={<button className="icon-button compact" type="button" aria-label="المزيد"><Icon name="more" /></button>} />
      <section className="room-chat-feed private-feed"><div className="day-divider">اليوم</div><article className="message-row"><Avatar name={chat.name} /><div><div className="message-author"><b>{chat.name}</b><time>02:01</time></div><div className="message-bubble">شن الجو؟ 😄</div></div></article><article className="message-row mine"><div><div className="message-author"><b>أنت</b><time>02:02</time></div><div className="message-bubble">تمام، نشوفك بكرة</div></div></article><article className="message-row"><Avatar name={chat.name} /><div><div className="message-author"><b>{chat.name}</b><time>02:03</time></div><div className="voice-note"><Icon name="mic" /><span>0:12</span><i /></div></div></article></section>
      <section className="reaction-sheet-preview"><b>تفاعلات وهدايا</b><div><button type="button">❤️</button><button type="button">😂</button><button type="button">🔥</button><button type="button">✨</button><button type="button">🎁</button></div></section>
      <form className="chat-composer" onSubmit={(event) => event.preventDefault()}><button type="button" className="composer-button" aria-label="ملصقات وتفاعلات"><Icon name="smile" /></button><input aria-label="نص الرسالة" placeholder="اكتب رسالة..." /><button type="button" className="composer-button" aria-label="تسجيل صوتي"><Icon name="mic" /></button><button type="submit" className="composer-button send" aria-label="إرسال"><Icon name="send" /></button></form>
      <V1GuardNote />
    </main>
  );
}

const themeOptions: Array<{ value: AppTheme; label: string }> = [
  { value: 'system', label: 'النظام' }, { value: 'light', label: 'فاتح' }, { value: 'dark', label: 'داكن' }, { value: 'pink-light', label: 'وردي فاتح' }, { value: 'pink-dark', label: 'وردي داكن' },
];

export function AccountScreen() {
  const { theme, setTheme } = useAppTheme();
  const settings = ['الأصدقاء', 'طلبات الصداقة', 'المحظورون', 'مشترياتي', 'الإطارات', 'الأصوات', 'التفاعلات', 'الملصقات', 'اللغة', 'الأصوات والاهتزاز', 'الإشعارات', 'الخصوصية', 'الأجهزة', 'الدعم وحول'];
  return (
    <main className="page-shell">
      <section className="profile-card"><Avatar name="أحمد" gender="male" /><div className="grow"><h1>أحمد <span className="gender-symbol">♂</span></h1><p>● متصل · خلي الجو خفيف 😄</p></div><button className="secondary-button" type="button">تعديل</button></section>
      <section className="balance-card"><div><span>الرصيد</span><strong>12.500 <small>د.ل</small></strong></div><div className="balance-actions"><button type="button"><Icon name="plus" size={18} /> شحن</button><button type="button"><Icon name="wallet" size={18} /> تحويل</button><Link className="link-reset" to="/wallet"><Icon name="history" size={18} /> السجل</Link></div></section>
      <section className="account-shortcuts"><Link to="/store" className="link-reset"><Icon name="store" /><span>المتجر</span></Link><Link to="/notifications" className="link-reset"><Icon name="bell" /><span>الإشعارات</span></Link></section>
      <SectionTitle title="الثيم" />
      <div className="theme-grid">{themeOptions.map((option) => <button className={theme === option.value ? 'theme-option active' : 'theme-option'} key={option.value} onClick={() => setTheme(option.value)} type="button">{option.label}</button>)}</div>
      <SectionTitle title="حسابك" />
      <div className="settings-list">{settings.map((item) => <button type="button" key={item}><span>{item}</span><Icon name="chevron" size={18} /></button>)}</div>
    </main>
  );
}

export function WalletScreen() {
  return (
    <main className="page-shell"><ScreenHeader title="الرصيد" eyebrow="محفظتك" backTo="/account" /><section className="wallet-hero"><span>الرصيد الحالي</span><strong>12.500 <small>د.ل</small></strong><div><button className="primary-button small" type="button">شحن</button><button className="secondary-button" type="button">تحويل</button></div></section><SectionTitle title="سجل العمليات" /><div className="transaction-list">{transactions.map((transaction) => <article key={`${transaction.label}-${transaction.meta}`}><div><b>{transaction.label}</b><small>{transaction.meta}</small></div><strong className={`amount-${transaction.tone}`}>{transaction.amount}</strong></article>)}</div></main>
  );
}

export function StoreScreen() {
  const [category, setCategory] = useState('مميز');
  const visible = category === 'مميز' ? storeProducts : storeProducts.filter((product) => product.category === category);
  return (
    <main className="page-shell"><ScreenHeader title="المتجر" eyebrow="خلّي حسابك بطابعك" backTo="/account" /><div className="chips">{['مميز', 'إطارات', 'ملصقات', 'تفاعلات', 'أصوات دخول', 'تجميلية'].map((item) => <button className={category === item ? 'chip active' : 'chip'} onClick={() => setCategory(item)} key={item} type="button">{item}</button>)}</div><div className="product-grid">{visible.map((product) => <article className="product-card" key={product.id}><div className="product-preview">{product.preview}</div><div><small>{product.category}</small><h3>{product.name}</h3><b>{product.price}</b></div><button className={product.owned ? 'secondary-button' : 'primary-button small'} type="button">{product.owned ? 'استخدم' : 'شراء'}</button></article>)}</div><StatusCard title="Entry Sounds" body="تشتغل فقط لو المنتج مملوك ومفعّل والغرفة تسمح وما فيش كتم، مع Cooldown يحمي من الإزعاج." /></main>
  );
}

export function TvScreen() {
  return (
    <main className="page-shell"><ScreenHeader title="التلفزيون" eyebrow="قسم مستقل" backTo="/" /><section className="tv-player"><div className="tv-stage large"><Icon name="tv" size={46} /><span>Player placeholder · الربط بالبث مرحلة لاحقة</span></div><div className="tv-controls"><div><b>ليبيا الرياضية</b><small>رياضة</small></div><div className="header-actions"><button type="button" className="icon-button compact" aria-label="الصوت"><Icon name="volume" /></button><button type="button" className="icon-button compact" aria-label="ملء الشاشة"><Icon name="fullscreen" /></button></div></div></section><div className="chips"><button className="chip active" type="button">الكل</button><button className="chip" type="button">رياضة</button><button className="chip" type="button">أخبار</button><button className="chip" type="button">منوعات</button></div><div className="channel-list"><button type="button" className="active"><span>📺</span><div><b>ليبيا الرياضية</b><small>يعمل الآن</small></div></button><button type="button"><span>📺</span><div><b>قناة منوعة</b><small>متاحة</small></div></button></div></main>
  );
}

export function NotificationsScreen() {
  return (
    <main className="page-shell"><ScreenHeader title="الإشعارات" eyebrow="كل الجديد" backTo="/" /><div className="notification-list">{notifications.map((item) => <article className={item.unread ? 'unread' : ''} key={`${item.title}-${item.time}`}><span className="notification-icon"><Icon name="bell" /></span><div className="grow"><b>{item.title}</b><p>{item.body}</p></div><time>{item.time}</time></article>)}</div></main>
  );
}

export function OfflineScreen() {
  return <main className="page-shell"><ScreenHeader title="بدون اتصال" backTo="/" /><StatusCard icon="offline" title="النت مقطوع" body="نخلي واجهة عكسة متاحة قدر الإمكان، ونرجّع البيانات الحية أول ما الاتصال يرجع." /></main>;
}
