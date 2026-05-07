import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import ActivityLogsPage from '../../features/activity-logs/pages/ActivityLogsPage';
import AdsLaunchPage from '../../features/ads-launch/pages/AdsLaunchPage';
import AdsMediaLibraryPage from '../../features/ads-launch/pages/AdsMediaLibraryPage';
import AdsTemplateBuilderPage from '../../features/ads-launch/pages/AdsTemplateBuilderPage';
import DynamicAdsLaunchPage from '../../features/ads-launch/pages/DynamicAdsLaunchPage';
import AdsManagePage from '../../features/ads-manage/pages/AdsManagePage';
import LoginPage from '../../features/auth/pages/LoginPage';
import DashboardPage from '../../features/dashboard/pages/DashboardPage';
import NotificationsPage from '../../features/notifications/pages/NotificationsPage';
import OverviewPage from '../../features/overview/pages/OverviewPage';
import ProfilePage from '../../features/profile/pages/ProfilePage';
import RoadmapPage from '../../features/roadmap/pages/RoadmapPage';
import TokenManagementPage from '../../features/token-management/pages/TokenManagementPage';
import UsersPage from '../../features/users/pages/UsersPage';
import { USER_ROLES, useAuth } from '../../features/auth/hooks/useAuth';

const LoadingScreen = () => (
  <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-white via-sky-50 to-blue-100">
    <div className="rounded-3xl border border-sky-100 bg-white px-8 py-6 text-center shadow-xl shadow-sky-100">
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-sky-600">Loading</p>
      <p className="mt-2 text-lg font-black text-slate-950">Preparing dashboard</p>
    </div>
  </div>
);

const ProtectedRoute = () => {
  const { initializing, isAuthenticated } = useAuth();

  if (initializing) {
    return <LoadingScreen />;
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

const PublicRoute = () => {
  const { initializing, isAuthenticated } = useAuth();

  if (initializing) {
    return <LoadingScreen />;
  }

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />;
};

const RoleRoute = ({ roles }) => {
  const { hasRole } = useAuth();

  return hasRole(roles) ? <Outlet /> : <Navigate to="/dashboard" replace />;
};

const AppRouter = () => {
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/notifications" element={<NotificationsPage />} />

          <Route element={<RoleRoute roles={[USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]} />}>
            <Route path="/ads-launch" element={<AdsLaunchPage />} />
            <Route path="/ads-templates" element={<AdsTemplateBuilderPage />} />
            <Route path="/ads-media-library" element={<AdsMediaLibraryPage />} />
            <Route path="/dynamic-ads-launch" element={<DynamicAdsLaunchPage />} />
            <Route path="/roadmap" element={<RoadmapPage />} />
            <Route path="/tokens" element={<TokenManagementPage />} />
          </Route>

          <Route element={<RoleRoute roles={[USER_ROLES.SUPER_ADMIN]} />}>
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/ads-manage" element={<AdsManagePage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/activity-logs" element={<ActivityLogsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default AppRouter;
