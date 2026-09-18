import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Icon } from './icons';
import { AuthScreen } from './auth';
import { useSession } from './session';
import {
  AccountScreen,
  ConversationScreen,
  HomeScreen,
  NearbyScreen,
  NotificationsScreen,
  OfflineScreen,
  PrivateScreen,
  RoomChatScreen,
  RoomsScreen,
  StoreScreen,
  TvScreen,
  WalletScreen,
} from './screens';

const navItems = [
  { label: 'الرئيسية', path: '/', icon: 'home' as const },
  { label: 'الغرف', path: '/rooms', icon: 'rooms' as const },
  { label: 'القريبون', path: '/nearby', icon: 'nearby' as const },
  { label: 'الخاص', path: '/private', icon: 'private' as const },
  { label: 'حسابي', path: '/account', icon: 'account' as const },
];

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

function AppShell() {
  const location = useLocation();
  const isImmersive = /^\/rooms\/[^/]+$/.test(location.pathname) || /^\/private\/[^/]+$/.test(location.pathname);
  return (
    <div className={isImmersive ? 'app-shell immersive-shell' : 'app-shell'}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/rooms" element={<RoomsScreen />} />
        <Route path="/rooms/:roomId" element={<RoomChatScreen />} />
        <Route path="/nearby" element={<NearbyScreen />} />
        <Route path="/private" element={<PrivateScreen />} />
        <Route path="/private/:userId" element={<ConversationScreen />} />
        <Route path="/account" element={<AccountScreen />} />
        <Route path="/wallet" element={<WalletScreen />} />
        <Route path="/store" element={<StoreScreen />} />
        <Route path="/tv" element={<TvScreen />} />
        <Route path="/notifications" element={<NotificationsScreen />} />
        <Route path="/offline" element={<OfflineScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {isImmersive ? null : <BottomNavigation />}
    </div>
  );
}

export function App() {
  const { status } = useSession();
  if (status === 'loading') {
    return <main className="auth-page"><div className="boot-loader" role="status">جاري فتح عكسة...</div></main>;
  }
  if (status === 'anonymous') return <AuthScreen />;
  return <AppShell />;
}
