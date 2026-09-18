import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Icon } from './icons';
import { AuthScreen } from './auth';
import { useSession } from './session';
import { OfflineScreen } from './screens';
import { LiveHomeScreen } from './live/home';
import { LiveRoomsScreen, LiveRoomChatScreen } from './live/rooms';
import { LiveNearbyScreen } from './live/nearby';
import { LivePrivateScreen, LiveConversationScreen, LiveNewConversationScreen } from './live/private';
import { LiveAccountScreen, LiveWalletScreen, LiveStoreScreen } from './live/account';
import { LiveTvScreen } from './live/tv';
import { LiveNotificationsScreen } from './live/notifications';
import { LivePrayerSettingsScreen } from './live/prayer';
import { LiveRealtimeEffects } from './live/realtimeEffects';

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
  const isImmersive = location.pathname.startsWith('/rooms/') || location.pathname.startsWith('/private/');
  return (
    <div className={isImmersive ? 'app-shell immersive-shell' : 'app-shell'}>
      <Routes>
        <Route path="/" element={<LiveHomeScreen />} />
        <Route path="/rooms" element={<LiveRoomsScreen />} />
        <Route path="/rooms/:roomId" element={<LiveRoomChatScreen />} />
        <Route path="/nearby" element={<LiveNearbyScreen />} />
        <Route path="/private" element={<LivePrivateScreen />} />
        <Route path="/private/new/:username" element={<LiveNewConversationScreen />} />
        <Route path="/private/:conversationId" element={<LiveConversationScreen />} />
        <Route path="/account" element={<LiveAccountScreen />} />
        <Route path="/account/prayer" element={<LivePrayerSettingsScreen />} />
        <Route path="/wallet" element={<LiveWalletScreen />} />
        <Route path="/store" element={<LiveStoreScreen />} />
        <Route path="/tv" element={<LiveTvScreen />} />
        <Route path="/notifications" element={<LiveNotificationsScreen />} />
        <Route path="/offline" element={<OfflineScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <LiveRealtimeEffects />
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
