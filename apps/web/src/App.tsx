import { lazy, Suspense } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Icon } from './icons';
import { AuthScreen } from './auth';
import { useSession } from './session';
import { LiveHomeScreen } from './live/home';
import { LiveRealtimeEffects } from './live/realtimeEffects';
import { PwaLifecycle } from './live/pwaLifecycle';
import { PublicInstallScreen } from './live/install';
import { PublicLegalScreen } from './live/legal';
import { getLanguage,t } from './i18n';


const LiveRoomsScreen=lazy(()=>import('./live/rooms').then(m=>({default:m.LiveRoomsScreen})));
const LiveRoomChatScreen=lazy(()=>import('./live/rooms').then(m=>({default:m.LiveRoomChatScreen})));
const LiveRoomManageScreen=lazy(()=>import('./live/roomManage').then(m=>({default:m.LiveRoomManageScreen})));
const LiveNearbyScreen=lazy(()=>import('./live/nearby').then(m=>({default:m.LiveNearbyScreen})));
const LivePrivateScreen=lazy(()=>import('./live/private').then(m=>({default:m.LivePrivateScreen})));
const LiveConversationScreen=lazy(()=>import('./live/private').then(m=>({default:m.LiveConversationScreen})));
const LiveNewConversationScreen=lazy(()=>import('./live/private').then(m=>({default:m.LiveNewConversationScreen})));
const LiveAccountScreen=lazy(()=>import('./live/account').then(m=>({default:m.LiveAccountScreen})));
const LiveWalletScreen=lazy(()=>import('./live/account').then(m=>({default:m.LiveWalletScreen})));
const LiveStoreScreen=lazy(()=>import('./live/account').then(m=>({default:m.LiveStoreScreen})));
const LiveDevicesScreen=lazy(()=>import('./live/devices').then(m=>({default:m.LiveDevicesScreen})));
const LiveTvScreen=lazy(()=>import('./live/tv').then(m=>({default:m.LiveTvScreen})));
const LiveTvAdminScreen=lazy(()=>import('./live/tvAdmin').then(m=>({default:m.LiveTvAdminScreen})));
const LiveNotificationsScreen=lazy(()=>import('./live/notifications').then(m=>({default:m.LiveNotificationsScreen})));
const LivePrayerSettingsScreen=lazy(()=>import('./live/prayer').then(m=>({default:m.LivePrayerSettingsScreen})));
const LiveReleaseAdminScreen=lazy(()=>import('./live/releaseAdmin').then(m=>({default:m.LiveReleaseAdminScreen})));
const LiveAdminScreen=lazy(()=>import('./live/admin').then(m=>({default:m.LiveAdminScreen})));
const LiveAdminStoreScreen=lazy(()=>import('./live/storeAdmin').then(m=>({default:m.LiveAdminStoreScreen})));
const LiveFriendsScreen=lazy(()=>import('./live/social').then(m=>({default:m.LiveFriendsScreen})));
const LiveProfileScreen=lazy(()=>import('./live/social').then(m=>({default:m.LiveProfileScreen})));
const OfflineScreen=lazy(()=>import('./screens').then(m=>({default:m.OfflineScreen})));

function RouteLoading(){
  return <main className="page-shell"><div className="route-loading" role="status" aria-live="polite">جاري فتح الصفحة...</div></main>;
}

const navItems=[
  { label: 'الرئيسية', translation:'home' as const, path: '/', icon: 'home' as const },
  { label: 'الغرف', translation:'rooms' as const, path: '/rooms', icon: 'rooms' as const },
  { label: 'القريبون', translation:'nearby' as const, path: '/nearby', icon: 'nearby' as const },
  { label: 'الخاص', translation:'private' as const, path: '/private', icon: 'private' as const },
  { label: 'حسابي', translation:'account' as const, path: '/account', icon: 'account' as const }
];

function BottomNavigation() {
  const language=getLanguage();
  return (
    <nav className="bottom-nav" aria-label={language==='ar'?'التنقل الرئيسي':'Main navigation'}>
      {navItems.map((item) => (
        <NavLink key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <Icon name={item.icon} size={22} />
          <span>{language==='ar'?item.label:t(item.translation,language)}</span>
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
      <Suspense fallback={<RouteLoading/>}>
      <Routes>
        <Route path="/" element={<LiveHomeScreen />} />
        <Route path="/rooms" element={<LiveRoomsScreen />} />
        <Route path="/rooms/:roomId" element={<LiveRoomChatScreen />} />
        <Route path="/rooms/:roomId/manage" element={<LiveRoomManageScreen />} />
        <Route path="/nearby" element={<LiveNearbyScreen />} />
        <Route path="/friends" element={<LiveFriendsScreen />} />
        <Route path="/profiles/:username" element={<LiveProfileScreen />} />
        <Route path="/private" element={<LivePrivateScreen />} />
        <Route path="/private/new/:username" element={<LiveNewConversationScreen />} />
        <Route path="/private/:conversationId" element={<LiveConversationScreen />} />
        <Route path="/account" element={<LiveAccountScreen />} />
        <Route path="/account/prayer" element={<LivePrayerSettingsScreen />} />
        <Route path="/account/devices" element={<LiveDevicesScreen />} />
        <Route path="/wallet" element={<LiveWalletScreen />} />
        <Route path="/store" element={<LiveStoreScreen />} />
        <Route path="/tv" element={<LiveTvScreen />} />
        <Route path="/notifications" element={<LiveNotificationsScreen />} />
        <Route path="/admin" element={<LiveAdminScreen />} />
        <Route path="/admin/store" element={<LiveAdminStoreScreen />} />
        <Route path="/admin/releases" element={<LiveReleaseAdminScreen />} />
        <Route path="/admin/tv" element={<LiveTvAdminScreen />} />
        <Route path="/offline" element={<OfflineScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      <LiveRealtimeEffects />
      <PwaLifecycle />
      {isImmersive ? null : <BottomNavigation />}
    </div>
  );
}

export function App() {
  const { status } = useSession();
  const location = useLocation();
  if (location.pathname === '/download') return <PublicInstallScreen />;
  if(location.pathname==='/privacy')return <PublicLegalScreen kind="privacy"/>;
  if(location.pathname==='/terms')return <PublicLegalScreen kind="terms"/>;
  if(location.pathname==='/about')return <PublicLegalScreen kind="about"/>;
  if(location.pathname==='/support')return <PublicLegalScreen kind="support"/>;
  if (status === 'loading') {
    return <main className="auth-page"><div className="boot-loader" role="status">{t('opening')}</div></main>;
  }
  if (status === 'anonymous') return <AuthScreen />;
  return <AppShell />;
}
