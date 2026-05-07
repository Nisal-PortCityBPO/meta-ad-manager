import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  BarChart3,
  Bell,
  CheckCircle2,
  ClipboardList,
  Boxes,
  FolderKanban,
  ImageIcon,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Megaphone,
  Route,
  Settings2,
  UserCircle,
  Users,
  XCircle,
} from 'lucide-react';
import { USER_ROLES, useAuth } from '../../features/auth/hooks/useAuth';
import { MetaSyncProvider } from '../../features/dashboard/context/MetaSyncContext';
import { PublishProgressProvider, usePublishProgress } from '../../features/notifications/PublishProgressContext';
import PublishProgressPanel, { formatDuration } from '../../features/notifications/components/PublishProgressPanel';
import {
  getMetaKeyTypeLabel,
  META_KEY_TYPES,
  MetaKeySettingsProvider,
  useMetaKeySettings,
} from '../../features/settings/MetaKeySettingsContext';
import brandLogo from '../../assets/200m-logo.png';

const navItemsConfig = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/meta-connection', label: 'Meta Connection', icon: KeyRound, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
  { to: '/roadmap', label: 'Roadmap', icon: Route, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
  { to: '/overview', label: 'Overview', icon: BarChart3, roles: [USER_ROLES.SUPER_ADMIN] },
  { to: '/ads-launch', label: 'Ads Launch', icon: Megaphone, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
  { to: '/ads-templates', label: 'Ads Templates', icon: Boxes, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
  { to: '/ads-media-library', label: 'Ads Media Library', icon: ImageIcon, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
  { to: '/dynamic-ads-launch', label: 'Dynamic Ads Launch', icon: Megaphone, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
  { to: '/ads-manage', label: 'Ads Manage', icon: FolderKanban, roles: [USER_ROLES.SUPER_ADMIN] },
  { to: '/users', label: 'Users', icon: Users, roles: [USER_ROLES.SUPER_ADMIN] },
  { to: '/activity-logs', label: 'Activity Logs', icon: ClipboardList, roles: [USER_ROLES.SUPER_ADMIN] },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/profile', label: 'Profile', icon: UserCircle },
];

const PublishStatusControl = () => {
  const { dismissStartPopup, events, isPublishing, latestError, latestResult, progress, showStartPopup } = usePublishProgress();
  const [panelOpen, setPanelOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const controlRef = useRef(null);
  const percent = progress?.progress?.percent || 0;
  const hasPublishState = Boolean(isPublishing || progress || latestResult || latestError);
  const statusLabel = isPublishing ? 'Publishing ads' : latestError ? 'Publish failed' : latestResult ? 'Publish complete' : 'Publish status';
  const statusMessage = progress?.message || latestResult?.message || latestError || 'No active publish';
  const progressData = progress?.progress || {};
  const ringStyle = {
    background: `conic-gradient(#84cc16 ${percent * 3.6}deg, #e2e8f0 0deg)`,
  };

  useEffect(() => {
    if (!showStartPopup) {
      return undefined;
    }

    const timeoutId = window.setTimeout(dismissStartPopup, 6000);
    return () => window.clearTimeout(timeoutId);
  }, [dismissStartPopup, showStartPopup]);

  useEffect(() => {
    if (!panelOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!controlRef.current?.contains(event.target)) {
        setPanelOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [panelOpen]);

  return (
    <div
      className="relative"
      ref={controlRef}
      onMouseEnter={() => setPreviewOpen(true)}
      onMouseLeave={() => setPreviewOpen(false)}
    >
      {hasPublishState ? (
        <button
          type="button"
          onClick={() => {
            dismissStartPopup();
            setPreviewOpen(false);
            setPanelOpen((current) => !current);
          }}
          className="relative flex h-11 w-11 items-center justify-center rounded-full border border-sky-100 bg-white shadow-sm transition hover:bg-sky-50"
          aria-label={statusLabel}
          title={statusLabel}
        >
          <span className="absolute inset-1 rounded-full" style={ringStyle} />
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-900 shadow-inner">
            {isPublishing ? (
              <LoaderCircle size={17} strokeWidth={2.4} className="animate-spin text-lime-600" />
            ) : latestError ? (
              <XCircle size={17} strokeWidth={2.4} className="text-red-600" />
            ) : (
              <CheckCircle2 size={17} strokeWidth={2.4} className="text-emerald-600" />
            )}
          </span>
        </button>
      ) : null}

      {hasPublishState && previewOpen && !panelOpen && !showStartPopup ? (
        <div className="absolute right-0 top-14 z-40 w-72 rounded-2xl border border-sky-100 bg-white p-4 text-left shadow-xl shadow-sky-200/70">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime-50 text-lime-700">
              {isPublishing ? (
                <LoaderCircle size={18} strokeWidth={2.4} className="animate-spin" />
              ) : latestError ? (
                <XCircle size={18} strokeWidth={2.4} className="text-red-600" />
              ) : (
                <CheckCircle2 size={18} strokeWidth={2.4} className="text-emerald-600" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-950">{statusLabel}</p>
              <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{statusMessage}</p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-sky-50">
            <div className="h-full rounded-full bg-lime-500 transition-all duration-300" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
            <span>{percent}%</span>
            <span>ETA {formatDuration(progressData.etaSeconds)}</span>
          </div>
        </div>
      ) : null}

      {hasPublishState && panelOpen ? (
        <div className="absolute right-0 top-14 z-50 w-[min(92vw,460px)]">
          <PublishProgressPanel events={events} latestError={latestError} latestResult={latestResult} progress={progress} compact />
        </div>
      ) : null}

      {showStartPopup ? (
        <button
          type="button"
          onClick={() => {
            dismissStartPopup();
            setPanelOpen(true);
          }}
          className="absolute right-0 top-14 z-30 w-72 rounded-2xl border border-sky-100 bg-white p-4 text-left shadow-xl shadow-sky-200/70"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime-50 text-lime-700">
              <LoaderCircle size={18} strokeWidth={2.4} className="animate-spin" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-950">Ad publish started</p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-500">{progress?.message || 'Preparing Meta publish process'}</p>
            </div>
          </div>
        </button>
      ) : null}
    </div>
  );
};

const KeyTypeToggle = ({ value, onChange }) => (
  <div className="grid w-64 grid-cols-2 rounded-xl border border-sky-100 bg-sky-50 p-1">
    {Object.values(META_KEY_TYPES).map((tokenType) => {
      const isActive = value === tokenType;
      const label = tokenType === META_KEY_TYPES.PROFILE ? 'Profile Access' : 'System User';

      return (
        <button
          key={tokenType}
          type="button"
          onClick={() => onChange(tokenType)}
          className={[
            'h-9 rounded-lg text-xs font-black transition',
            isActive ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-900',
          ].join(' ')}
          title={getMetaKeyTypeLabel(tokenType)}
        >
          {label}
        </button>
      );
    })}
  </div>
);

const MetaKeySettingsControl = () => {
  const { fetchTokenType, publishTokenType, setFetchTokenType, setPublishTokenType } = useMetaKeySettings();
  const [open, setOpen] = useState(false);
  const controlRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!controlRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <div className="relative" ref={controlRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
      >
        <Settings2 size={17} strokeWidth={2.2} />
        Settings
      </button>

      {open ? (
        <div className="absolute right-0 top-14 z-50 w-[min(92vw,420px)] rounded-2xl border border-sky-100 bg-white p-4 shadow-xl shadow-sky-200/70">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black text-slate-950">Fetch data</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{getMetaKeyTypeLabel(fetchTokenType)}</p>
              </div>
              <KeyTypeToggle value={fetchTokenType} onChange={setFetchTokenType} />
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-sky-50 pt-3">
              <div>
                <p className="text-sm font-black text-slate-950">Publish data</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{getMetaKeyTypeLabel(publishTokenType)}</p>
              </div>
              <KeyTypeToggle value={publishTokenType} onChange={setPublishTokenType} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const DashboardShell = () => {
  const navigate = useNavigate();
  const { user, logout, hasRole } = useAuth();
  const navItems = navItemsConfig.filter((item) => !item.roles || hasRole(item.roles));

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-sky-50 to-blue-100 text-slate-900 lg:flex">
      <aside className="border-b border-sky-100 bg-white/85 px-4 py-4 shadow-sm backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-lg shadow-sky-200 ring-1 ring-sky-100">
            <img src={brandLogo} alt="200M logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-lg font-black text-slate-950">Account Manager</p>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>

        <nav className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-bold transition',
                  isActive
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-200'
                    : 'text-slate-600 hover:bg-sky-50 hover:text-slate-950',
                ].join(' ')
              }
            >
              {({ isActive }) => {
                const Icon = item.icon;

                return (
                  <>
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        isActive ? 'bg-white/20' : 'bg-sky-50 text-sky-700'
                      }`}
                    >
                      <Icon size={18} strokeWidth={2.2} />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </>
                );
              }}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-sky-100 bg-white/80 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">Signed in as</p>
              <h1 className="text-xl font-black text-slate-950">{user?.name}</h1>
            </div>
            <div className="flex items-center gap-2">
              <PublishStatusControl />
              <button
                type="button"
                onClick={() => navigate('/notifications')}
                className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
              >
                <Bell size={17} strokeWidth={2.2} />
                Notifications
              </button>
              <MetaKeySettingsControl />
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
              >
                <UserCircle size={17} strokeWidth={2.2} />
                Profile
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                <LogOut size={17} strokeWidth={2.2} />
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="w-full px-3 py-4 sm:px-4 lg:px-4 lg:py-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

const DashboardLayout = () => (
  <MetaKeySettingsProvider>
    <PublishProgressProvider>
      <MetaSyncProvider>
        <DashboardShell />
      </MetaSyncProvider>
    </PublishProgressProvider>
  </MetaKeySettingsProvider>
);

export default DashboardLayout;
