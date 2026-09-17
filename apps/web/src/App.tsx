import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Icon } from './icons';
import { type AppTheme, useAppTheme } from './theme';

const navItems = [
  { label: 'الرئيسية', path: '/', icon: 'home' as const },
  { label: 'الغرف', path: '/rooms', icon: 'rooms' as const },
  { label: 'القريبون', path: '/nearby', icon: 'nearby' as const },
  { label: 'الخاص', path: '/private', icon: 'private' as const },
  { label: 'حسابي', path: '/account', icon: 'account' as const },
];

const rooms = [
  { name: 'سهرة طرابلس', description: 'لمة خفيفة وسوالف على الجو الليبي', count: 34, tv: true, kind: 'للجميع' },
  { name: 'سوالف عامة', description: 'دردشة مفتوحة من غير تعقيد', count: 21, tv: false, kind: 'للجميع' },
  { name: 'لمة البنات', description: 'غرفة بنات فقط', count: 17, tv: false, kind: 'بنات' },
];

function Logo({ size = 52 }: { size?: number }) {
  return (
    <span className="brand-logo-wrap" style={{ width: size, height: size }}>
      <img className="brand-logo brand-logo-main" src={`${import.meta.env.BASE_URL}icons/logo-main-128.png`} width={size} height={size} alt="3AKSA" />
      <img className="brand-logo brand-logo-pink" src={`${import.meta.env.BASE_URL}icons/logo-pink-128.png`} width={size} height={size} alt="" aria-hidden="true" />
    </span>
  );
}

function Header() {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <Logo size={44} />
        <div>
          <strong>3AKSA</strong>
          <span>عكسة</span>
        </div>
      </div>
      <button className="icon-button" type="button" aria-label="الإشعارات">
        <Icon name="bell" />
        <span className="notification-dot" />
      </button>
    </header>
  );
}

function SectionTitle({ title, action }: { title: string; action?: string }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {action ? <button type="button" className="text-button">{action}</button> : null}
    </div>
  );
}

function Avatar({ name, online = true, gender }: { name: string; online?: boolean; gender?: 'male' | 'female' }) {
  return (
    <div className={`avatar ${gender ? `avatar-${gender}` : ''}`} aria-label={name}>
      <span>{name.slice(0, 1)}</span>
      {online ? <i className="presence-dot" aria-label="متصل" /> : null}
    </div>
  );
}

function HomeScreen() {
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

      <SectionTitle title="الغرف النشطة الآن" action="شوف الكل" />
      <div className="stack">
        {rooms.slice(0, 2).map((room) => <RoomCard key={room.name} room={room} />)}
      </div>

      <SectionTitle title="الأصدقاء Online" action="الأصدقاء" />
      <div className="friends-row" aria-label="الأصدقاء المتصلون">
        {['محمد', 'سارة', 'خالد', 'رهف', 'علي'].map((name, index) => (
          <div className="friend-mini" key={name}>
            <Avatar name={name} gender={index % 2 ? 'female' : 'male'} />
            <span>{name}</span>
          </div>
        ))}
      </div>

      <section className="feature-grid">
        <button type="button" className="feature-card tv-card">
          <span className="feature-icon"><Icon name="tv" size={25} /></span>
          <span><b>التلفزيون</b><small>شوف القنوات المتاحة</small></span>
          <Icon name="chevron" size={18} />
        </button>
        <button type="button" className="feature-card">
          <span className="feature-icon"><Icon name="users" size={25} /></span>
          <span><b>طلبات جديدة</b><small>2 صداقة · 1 مراسلة</small></span>
          <span className="count-badge">3</span>
        </button>
      </section>

      <section className="prayer-card">
        <span>🌙</span>
        <div><b>الصلاة القادمة</b><small>سيظهر الوقت بعد تفعيل بيانات المواقيت المحلية</small></div>
      </section>

      <section className="counter-grid" aria-label="عدادات عامة">
        <div><strong>128</strong><span>Online</span></div>
        <div><strong>2.4K</strong><span>مسجل</span></div>
        <div><strong>310</strong><span>زائر</span></div>
      </section>
    </main>
  );
}

function RoomCard({ room }: { room: (typeof rooms)[number] }) {
  return (
    <article className="room-card">
      <div className="room-card-main">
        <div className="room-icon"><Icon name="rooms" /></div>
        <div className="room-copy">
          <div className="room-title-row"><h3>{room.name}</h3>{room.tv ? <span className="tv-badge">TV</span> : null}</div>
          <p>{room.description}</p>
          <div className="meta-row"><span>● {room.count} موجود</span><span>{room.kind}</span></div>
        </div>
      </div>
      <button className="primary-button small" type="button">ادخل</button>
    </article>
  );
}

function RoomsScreen() {
  return (
    <main className="page-shell">
      <div className="screen-heading">
        <div><p className="eyebrow">3AKSA</p><h1>الغرف</h1></div>
        <button className="primary-button small" type="button"><Icon name="plus" size={18} /> إنشاء غرفة</button>
      </div>
      <label className="search-box">
        <Icon name="search" size={20} />
        <input aria-label="البحث عن غرفة" placeholder="دور على غرفة..." />
      </label>
      <div className="chips" role="group" aria-label="تصنيف الغرف">
        {['الكل', 'للجميع', 'أولاد', 'بنات', 'المفضلة'].map((item, index) => <button className={index === 0 ? 'chip active' : 'chip'} key={item} type="button">{item}</button>)}
      </div>
      <div className="sort-row"><span>الترتيب</span><button type="button">الأكثر ناس الآن⌄</button></div>
      <div className="stack">{rooms.map((room) => <RoomCard key={room.name} room={room} />)}</div>
    </main>
  );
}

function NearbyScreen() {
  const people = [
    { name: 'محمد', distance: '650 متر', mutual: '3 أصدقاء مشتركين', gender: 'male' as const },
    { name: 'سارة', distance: '1.2 كم', mutual: 'صديق مشترك', gender: 'female' as const },
    { name: 'خالد', distance: '2.4 كم', mutual: 'بدون أصدقاء مشتركين', gender: 'male' as const },
  ];
  return (
    <main className="page-shell">
      <div className="screen-heading"><div><p className="eyebrow">خصوصيتك أولًا</p><h1>القريبون</h1></div><span className="permission-pill">الموقع مفعّل</span></div>
      <section className="privacy-note"><Icon name="nearby" /><div><b>المسافة تقريبية فقط</b><p>ما نعرضوش خريطة أو إحداثيات أو موقعك الدقيق لأي مستخدم.</p></div></section>
      <div className="chips">{['الكل', 'أولاد', 'بنات'].map((item, index) => <button className={index === 0 ? 'chip active' : 'chip'} key={item} type="button">{item}</button>)}</div>
      <div className="stack">
        {people.map((person) => (
          <article className="person-card" key={person.name}>
            <Avatar name={person.name} gender={person.gender} />
            <div className="grow"><h3>{person.name} <span className="gender-symbol">{person.gender === 'male' ? '♂' : '♀'}</span></h3><p>{person.distance} · {person.mutual}</p></div>
            <button className="secondary-button" type="button">إضافة</button>
          </article>
        ))}
      </div>
    </main>
  );
}

function PrivateScreen() {
  const chats = [
    { name: 'أحمد', preview: 'تمام، نشوفك بكرة 😄', time: 'الآن', unread: 2 },
    { name: 'رهف', preview: '🎙️ تسجيل صوتي', time: '12 د', unread: 0 },
    { name: 'محمد', preview: 'خش للغرفة توا', time: '1 س', unread: 0 },
  ];
  return (
    <main className="page-shell">
      <div className="screen-heading"><div><p className="eyebrow">رسائلك</p><h1>الخاص</h1></div></div>
      <div className="segmented"><button className="active" type="button">المحادثات</button><button type="button">طلبات المراسلة <span>1</span></button></div>
      <div className="stack chat-list">
        {chats.map((chat) => (
          <article className="chat-row" key={chat.name}>
            <Avatar name={chat.name} />
            <div className="grow"><h3>{chat.name}</h3><p>{chat.preview}</p></div>
            <div className="chat-meta"><time>{chat.time}</time>{chat.unread ? <span>{chat.unread}</span> : null}</div>
          </article>
        ))}
      </div>
      <p className="v1-note">V1: نص · تسجيلات صوتية · ملصقات · تفاعلات · هدايا. بدون صور أو مكالمات.</p>
    </main>
  );
}

const themeOptions: Array<{ value: AppTheme; label: string }> = [
  { value: 'system', label: 'النظام' },
  { value: 'light', label: 'فاتح' },
  { value: 'dark', label: 'داكن' },
  { value: 'pink-light', label: 'وردي فاتح' },
  { value: 'pink-dark', label: 'وردي داكن' },
];

function AccountScreen() {
  const { theme, setTheme } = useAppTheme();
  return (
    <main className="page-shell">
      <section className="profile-card">
        <Avatar name="أحمد" />
        <div className="grow"><h1>أحمد</h1><p>● متصل · خلي الجو خفيف 😄</p></div>
        <button className="secondary-button" type="button">تعديل</button>
      </section>
      <section className="balance-card">
        <div><span>الرصيد</span><strong>12.500 <small>د.ل</small></strong></div>
        <div className="balance-actions"><button type="button"><Icon name="plus" size={18} /> شحن</button><button type="button"><Icon name="wallet" size={18} /> تحويل</button></div>
      </section>
      <SectionTitle title="الثيم" />
      <div className="theme-grid">
        {themeOptions.map((option) => <button className={theme === option.value ? 'theme-option active' : 'theme-option'} key={option.value} onClick={() => setTheme(option.value)} type="button">{option.label}</button>)}
      </div>
      <SectionTitle title="حسابك" />
      <div className="settings-list">
        {['الأصدقاء', 'طلبات الصداقة', 'المتجر', 'مشترياتي', 'الأصوات والاهتزاز', 'الإشعارات', 'الخصوصية', 'الأجهزة', 'الدعم وحول'].map((item) => (
          <button type="button" key={item}><span>{item}</span><Icon name="chevron" size={18} /></button>
        ))}
      </div>
    </main>
  );
}

function BottomNavigation() {
  return (
    <nav className="bottom-nav" aria-label="التنقل الرئيسي">
      {navItems.map((item) => (
        <NavLink key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <Icon name={item.icon} size={22} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/rooms" element={<RoomsScreen />} />
        <Route path="/nearby" element={<NearbyScreen />} />
        <Route path="/private" element={<PrivateScreen />} />
        <Route path="/account" element={<AccountScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNavigation />
    </div>
  );
}
