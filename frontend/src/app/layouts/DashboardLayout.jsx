import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Boxes,
  BookOpen,
  FolderKanban,
  Gauge,
  ImageIcon,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Megaphone,
  Route,
  Settings2,
  SlidersHorizontal,
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
import { settingsApi } from '../../features/settings/api/settingsApi';
import { decryptFooterPackage, systemIntegrityApi } from '../../features/system-integrity/api/systemIntegrityApi';
import brandLogo from '../../assets/200m-logo.png';
import sriLankaFlag from '../../assets/Flag_of_Sri_Lanka.svg.png';

const GUIDE_URL = 'https://guide.host-8ce.workers.dev/';
const HEADER_ACTION_BUTTON_CLASS =
  'flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50';

const navGroupsConfig = [
  {
    id: 'main',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    id: 'setup',
    label: 'Setup',
    items: [
      { to: '/meta-connection', label: 'Meta Connection', icon: KeyRound, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
      { to: '/roadmap', label: 'Roadmap', icon: Route, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
      { to: '/overview', label: 'Overview', icon: BarChart3, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      
      { to: '/performance', label: 'Performance', icon: Gauge, roles: [USER_ROLES.SUPER_ADMIN] },
      { to: '/analysis', label: 'Analysis', icon: SlidersHorizontal, roles: [USER_ROLES.SUPER_ADMIN] },
      { to: '/ads-manage', label: 'Ads Manage', icon: FolderKanban, roles: [USER_ROLES.SUPER_ADMIN] },
    ],
  },
  {
    id: 'ads-creation',
    label: 'Ads Creation',
    items: [
      { to: '/ads-launch', label: 'Ads Launch', icon: Megaphone, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
      { to: '/dynamic-ads-launch', label: 'Dynamic Ads Launch', icon: Megaphone, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
      
    ],
  },
  {
    id: 'ads-templates',
    label: 'Ads Templates',
    items: [
      { to: '/ads-templates', label: 'Ads Templates', icon: Boxes, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
      { to: '/ads-media-library', label: 'Media Library', icon: ImageIcon, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
      
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { to: '/errors', label: 'Errors', icon: AlertTriangle, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
      { to: '/notifications', label: 'Notifications', icon: Bell, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
      { to: '/users', label: 'Users', icon: Users, roles: [USER_ROLES.SUPER_ADMIN] },
      { to: '/activity-logs', label: 'Activity Logs', icon: ClipboardList, roles: [USER_ROLES.SUPER_ADMIN] },
    ],
  },
];

const accountItemsConfig = [
  
  { to: '/profile', label: 'Profile', icon: UserCircle },
];

const filterByRole = (items, hasRole) => items.filter((item) => !item.roles || hasRole(item.roles));

const NavItem = ({ item }) => {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.to === '/dashboard'}
      className={({ isActive }) =>
        [
          'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-semibold transition-all duration-150',
          isActive
            ? 'bg-gradient-to-r from-sky-600 to-sky-500 text-white shadow-sm shadow-sky-300/50'
            : 'text-slate-600 hover:bg-sky-50/80 hover:text-slate-900',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full bg-white/90 w-0.5" aria-hidden />
          ) : null}
          <Icon
            size={17}
            strokeWidth={2.1}
            className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-sky-600'}
          />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
};

const NavGroup = ({ group, items }) => {
  const [open, setOpen] = useState(true);

  if (!group.label) {
    return (
      <div className="space-y-1">
        {items.map((item) => (
          <NavItem key={item.to} item={item} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 transition hover:text-slate-600"
      >
        <span>{group.label}</span>
        <ChevronDown
          size={13}
          strokeWidth={2.5}
          className={`transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
        />
      </button>
      <div
        className={`grid transition-all duration-200 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-1 pt-1">
            {items.map((item) => (
              <NavItem key={item.to} item={item} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const PublishStatusControl = () => {
  const {
    currentPublishId,
    dismissStartPopup,
    events,
    isPublishing,
    latestError,
    latestResult,
    pauseBusy,
    progress,
    publishHistory,
    requestPausePublish,
    resumeBusy,
    resumePausedPublish,
    showStartPopup,
  } = usePublishProgress();
  const [panelOpen, setPanelOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const controlRef = useRef(null);
  const percent = progress?.progress?.percent || 0;
  const hasPublishState = Boolean(isPublishing || progress || latestResult || latestError);
  const currentPublishItem = publishHistory.find((item) => item.id === currentPublishId) || null;
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

  const pauseLivePublish = async () => {
    try {
      const data = await requestPausePublish();
      toast.success(data.message || 'Pause requested');
    } catch (requestError) {
      toast.error(requestError.message);
    }
  };

  const resumePublish = async (sessionId = currentPublishId) => {
    try {
      const data = await resumePausedPublish(sessionId);
      toast.success(data.message || 'Publish is continuing');
    } catch (requestError) {
      toast.error(requestError.message);
    }
  };

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
        <div className="absolute right-0 top-14 z-50 max-h-[min(80vh,720px)] w-[min(92vw,520px)] overflow-y-auto rounded-2xl border border-sky-100 bg-white p-3 shadow-xl shadow-sky-200/70">
          {hasPublishState ? (
            <PublishProgressPanel
              canPause={Boolean(currentPublishItem?.canPause)}
              canResume={Boolean(currentPublishItem?.canResume)}
              events={events}
              latestError={latestError}
              latestResult={latestResult}
              onPause={pauseLivePublish}
              onResume={() => resumePublish(currentPublishId)}
              pauseBusy={pauseBusy}
              progress={progress}
              resumeBusy={resumeBusy}
              compact
            />
          ) : null}
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

const NotificationsControl = () => {
  const navigate = useNavigate();
  const { markPublishHistorySeen, publishHistory, publishHistoryUnreadCount } = usePublishProgress();
  const [open, setOpen] = useState(false);
  const controlRef = useRef(null);
  const failedCount = publishHistory.filter((item) => item.status === 'failed').length;

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

  const toggleOpen = () => {
    setOpen((current) => {
      const nextOpen = !current;

      if (nextOpen) {
        markPublishHistorySeen();
      }

      return nextOpen;
    });
  };

  return (
    <div className="relative" ref={controlRef}>
      <button
        type="button"
        onClick={toggleOpen}
        className={`relative ${HEADER_ACTION_BUTTON_CLASS}`}
      >
        <Bell size={17} strokeWidth={2.2} />
        Notifications
        {publishHistoryUnreadCount ? (
          <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-black ${failedCount ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-700'}`}>
            {publishHistoryUnreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-14 z-50 max-h-[min(80vh,720px)] w-[min(92vw,520px)] overflow-y-auto rounded-2xl border border-sky-100 bg-white p-4 shadow-xl shadow-sky-200/70">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">Latest notifications</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Open the Notifications page for publish history and retry actions.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('/notifications');
              }}
              className="rounded-lg border border-sky-100 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-sky-700 transition hover:bg-sky-50"
            >
              Open
            </button>
          </div>
          <div className="rounded-2xl bg-sky-50 px-4 py-4">
            <p className="text-sm font-bold text-slate-700">
              {publishHistoryUnreadCount
                ? `${publishHistoryUnreadCount} publish update${publishHistoryUnreadCount === 1 ? '' : 's'} waiting.`
                : 'No new publish updates.'}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              History stays on the full Notifications page to keep this popup light.
            </p>
          </div>
        </div>
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
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [publishIntervalSaving, setPublishIntervalSaving] = useState(false);
  const [telegramForm, setTelegramForm] = useState({
    enabled: false,
    botToken: '',
    botTokenMasked: '',
    botTokenSet: false,
    chatId: '',
  });
  const [publishIntervalForm, setPublishIntervalForm] = useState({
    enabled: true,
    minMinutes: '0.167',
    maxMinutes: '10',
  });
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

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    let mounted = true;
    setTelegramLoading(true);
    Promise.all([settingsApi.getTelegramSettings(), settingsApi.getPublishIntervalSettings()])
      .then(([telegramData, intervalData]) => {
        if (!mounted) {
          return;
        }

        setTelegramForm({
          enabled: Boolean(telegramData.telegram?.enabled),
          botToken: '',
          botTokenMasked: telegramData.telegram?.botTokenMasked || '',
          botTokenSet: Boolean(telegramData.telegram?.botTokenSet),
          chatId: telegramData.telegram?.chatId || '',
        });
        setPublishIntervalForm({
          enabled: intervalData.publishInterval?.enabled !== false,
          minMinutes: String(intervalData.publishInterval?.minMinutes ?? 0.167),
          maxMinutes: String(intervalData.publishInterval?.maxMinutes ?? 10),
        });
      })
      .catch((requestError) => toast.error(requestError.message))
      .finally(() => {
        if (mounted) {
          setTelegramLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [open]);

  const updateTelegramForm = (field, value) => {
    setTelegramForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updatePublishIntervalForm = (field, value) => {
    setPublishIntervalForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveTelegramSettings = async () => {
    setTelegramSaving(true);
    try {
      const payload = {
        enabled: telegramForm.enabled,
        chatId: telegramForm.chatId,
      };

      if (telegramForm.botToken.trim()) {
        payload.botToken = telegramForm.botToken.trim();
      }

      const data = await settingsApi.updateTelegramSettings(payload);
      setTelegramForm({
        enabled: Boolean(data.telegram?.enabled),
        botToken: '',
        botTokenMasked: data.telegram?.botTokenMasked || '',
        botTokenSet: Boolean(data.telegram?.botTokenSet),
        chatId: data.telegram?.chatId || '',
      });
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setTelegramSaving(false);
    }
  };

  const testTelegramSettings = async () => {
    setTelegramTesting(true);
    try {
      const data = await settingsApi.testTelegramSettings();
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setTelegramTesting(false);
    }
  };

  const savePublishIntervalSettings = async () => {
    setPublishIntervalSaving(true);
    try {
      const data = await settingsApi.updatePublishIntervalSettings({
        enabled: publishIntervalForm.enabled,
        minMinutes: publishIntervalForm.minMinutes,
        maxMinutes: publishIntervalForm.maxMinutes,
      });
      setPublishIntervalForm({
        enabled: data.publishInterval?.enabled !== false,
        minMinutes: String(data.publishInterval?.minMinutes ?? 0.167),
        maxMinutes: String(data.publishInterval?.maxMinutes ?? 10),
      });
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setPublishIntervalSaving(false);
    }
  };

  return (
    <div className="relative" ref={controlRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={HEADER_ACTION_BUTTON_CLASS}
      >
        <Settings2 size={17} strokeWidth={2.2} />
        Settings
      </button>

      {open ? (
        <div className="absolute right-0 top-14 z-50 max-h-[min(84vh,760px)] w-[min(92vw,520px)] overflow-y-auto rounded-2xl border border-sky-100 bg-white p-4 shadow-xl shadow-sky-200/70">
          <div className="space-y-4">
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

            <div className="border-t border-sky-50 pt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950">Ad account interval</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Random wait between accounts during Ads Launch and Dynamic Ads Launch.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-lime-50 px-3 py-2 text-xs font-black text-lime-700">
                  <input
                    type="checkbox"
                    checked={publishIntervalForm.enabled}
                    onChange={(event) => updatePublishIntervalForm('enabled', event.target.checked)}
                    className="h-4 w-4 rounded border-lime-200 text-lime-600 focus:ring-lime-500"
                  />
                  Enabled
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="publish-interval-min" className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    Min minutes
                  </label>
                  <input
                    id="publish-interval-min"
                    value={publishIntervalForm.minMinutes}
                    onChange={(event) => updatePublishIntervalForm('minMinutes', event.target.value)}
                    className="h-11 w-full rounded-xl border border-sky-100 px-3 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    min="0.167"
                    max="10"
                    step="0.001"
                    type="number"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="publish-interval-max" className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    Max minutes
                  </label>
                  <input
                    id="publish-interval-max"
                    value={publishIntervalForm.maxMinutes}
                    onChange={(event) => updatePublishIntervalForm('maxMinutes', event.target.value)}
                    className="h-11 w-full rounded-xl border border-sky-100 px-3 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    min="0.167"
                    max="10"
                    step="0.001"
                    type="number"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                Allowed range is 10 seconds (0.167 min) to 10 minutes. Example: 0.667 minutes waits about 40 seconds.
              </p>
              <button
                type="button"
                onClick={savePublishIntervalSettings}
                disabled={telegramLoading || publishIntervalSaving}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-lime-600 px-4 text-sm font-bold text-white transition hover:bg-lime-700 disabled:opacity-60"
              >
                {publishIntervalSaving ? <LoaderCircle size={16} className="animate-spin" /> : <Settings2 size={16} />}
                Save interval
              </button>
            </div>

            <div className="border-t border-sky-50 pt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950">Telegram publish summary</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Send a compact summary to Telegram when Meta publish completes.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-sky-50 px-3 py-2 text-xs font-black text-sky-700">
                  <input
                    type="checkbox"
                    checked={telegramForm.enabled}
                    onChange={(event) => updateTelegramForm('enabled', event.target.checked)}
                    className="h-4 w-4 rounded border-sky-200 text-sky-600 focus:ring-sky-500"
                  />
                  Enabled
                </label>
              </div>

              <div className="mt-3 grid gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="telegram-bot-token" className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    Bot token
                  </label>
                  <input
                    id="telegram-bot-token"
                    value={telegramForm.botToken}
                    onChange={(event) => updateTelegramForm('botToken', event.target.value)}
                    className="h-11 w-full rounded-xl border border-sky-100 px-3 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder={telegramForm.botTokenSet ? `Saved: ${telegramForm.botTokenMasked}` : '123456:ABC...'}
                    type="password"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="telegram-chat-id" className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    Chat id
                  </label>
                  <input
                    id="telegram-chat-id"
                    value={telegramForm.chatId}
                    onChange={(event) => updateTelegramForm('chatId', event.target.value)}
                    className="h-11 w-full rounded-xl border border-sky-100 px-3 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="-1001234567890 or @channelusername"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveTelegramSettings}
                  disabled={telegramLoading || telegramSaving}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {telegramSaving ? <LoaderCircle size={16} className="animate-spin" /> : <Settings2 size={16} />}
                  Save Telegram
                </button>
                <button
                  type="button"
                  onClick={testTelegramSettings}
                  disabled={telegramLoading || telegramTesting || !telegramForm.botTokenSet}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-sky-700 transition hover:bg-sky-50 disabled:opacity-60"
                >
                  {telegramTesting ? <LoaderCircle size={16} className="animate-spin" /> : <Bell size={16} />}
                  Test
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

function isProtectedFooterDomValid(footer) {
  const footerNode = document.getElementById(footer.domId);
  const proofNode = document.getElementById(footer.proofId);
  const footerText = footerNode?.textContent || '';
  const requiredText = [
    footer.copyrightLabel,
    String(footer.startYear),
    String(footer.currentYear),
    footer.company,
    footer.rightsText,
    footer.developedByLabel,
    footer.team,
    footer.productFromLabel,
  ];
  const hasRequiredText = requiredText.every((value) => value && footerText.includes(value));
  const hasFlag = Boolean(footerNode?.querySelector('img[data-footer-flag="true"]'));
  const proofMatches = proofNode?.dataset.integrityProof === footer.renderProof;

  return Boolean(footerNode && hasRequiredText && hasFlag && proofMatches);
}

const ProtectedFooter = ({ footer, flagSrc }) => {
  if (!footer) {
    return null;
  }

  return (
    <footer
      id={footer.domId}
      data-protected-footer={footer.marker}
      className="fixed bottom-0 left-0 right-0 z-30 flex h-8 items-center justify-between gap-3 border-t border-sky-100 bg-white/95 px-4 text-[11px] font-semibold text-slate-950 shadow-[0_-8px_24px_rgba(14,165,233,0.08)] backdrop-blur lg:left-64"
    >
      <span className="min-w-0 truncate">
        {footer.copyrightLabel} {footer.copyrightSymbol} {footer.startYear} - {footer.currentYear} {footer.company}.{' '}
        {footer.rightsText} {footer.developedByLabel} <span className="text-sky-700">{footer.team}</span>
      </span>
      <span className="inline-flex h-full shrink-0 items-center gap-2 text-slate-950" title={footer.flagAlt}>
        {footer.productFromLabel}
        <img
          src={flagSrc}
          alt={footer.flagAlt}
          data-footer-flag="true"
          className="h-5 w-auto object-contain shadow-sm ring-1 ring-slate-200"
        />
      </span>
      <span id={footer.proofId} data-integrity-proof={footer.renderProof} hidden />
    </footer>
  );
};

const DashboardShell = () => {
  const navigate = useNavigate();
  const { user, logout, hasRole } = useAuth();
  const footerServerValidatedRef = useRef(false);
  const [protectedFooter, setProtectedFooter] = useState(null);
  const [footerIntegrityFailed, setFooterIntegrityFailed] = useState(false);

  const visibleGroups = navGroupsConfig
    .map((group) => ({ ...group, items: filterByRole(group.items, hasRole) }))
    .filter((group) => group.items.length > 0);
  const visibleAccountItems = filterByRole(accountItemsConfig, hasRole);

  useEffect(() => {
    let mounted = true;

    async function loadProtectedFooter() {
      try {
        const data = await systemIntegrityApi.getFooterPackage();
        const footer = await decryptFooterPackage(data.footerPackage);

        if (!footer?.marker || !footer?.renderProof || !footer?.domId || !footer?.proofId) {
          throw new Error('Protected footer payload is incomplete');
        }

        if (mounted) {
          setProtectedFooter(footer);
        }
      } catch (_error) {
        if (mounted) {
          setFooterIntegrityFailed(true);
        }
      }
    }

    loadProtectedFooter();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!protectedFooter) {
      return undefined;
    }

    const failFooterIntegrity = () => {
      setFooterIntegrityFailed(true);
    };

    const validateFooter = () => {
      if (!isProtectedFooterDomValid(protectedFooter)) {
        failFooterIntegrity();
        return;
      }

      if (!footerServerValidatedRef.current) {
        footerServerValidatedRef.current = true;
        systemIntegrityApi.validateFooterProof(protectedFooter.renderProof).catch(failFooterIntegrity);
      }
    };

    const animationFrameId = window.requestAnimationFrame(validateFooter);
    const intervalId = window.setInterval(validateFooter, 1500);
    const observer = new MutationObserver(validateFooter);
    observer.observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearInterval(intervalId);
      observer.disconnect();
    };
  }, [protectedFooter]);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login', { replace: true });
  };

  const initials = (user?.name || 'U')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (footerIntegrityFailed) {
    throw new Error('Protected footer integrity check failed.');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-sky-50 to-blue-100 text-slate-900 lg:flex">
      <aside className="flex max-h-screen flex-col border-b border-slate-200/70 bg-white/95 shadow-sm backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-b-0 lg:border-r">
        {/* Brand */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-md shadow-sky-100 ring-1 ring-slate-100">
            <img src={brandLogo} alt="200M logo" className="h-full w-full rounded-lg bg-white object-contain" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold leading-tight text-slate-900">Account Manager</p>
            <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-600">
              {user?.role?.replace('_', ' ') || 'Workspace'}
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-4 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200 hover:[&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent">
          {visibleGroups.map((group) => (
            <NavGroup key={group.id} group={group} items={group.items} />
          ))}

          {visibleAccountItems.length > 0 ? (
            <>
              <div className="mx-3 my-2 h-px bg-slate-100" />
              <div className="space-y-1">
                {visibleAccountItems.map((item) => (
                  <NavItem key={item.to} item={item} />
                ))}
              </div>
            </>
          ) : null}
        </nav>

        {/* User footer */}
        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-2.5 rounded-xl bg-slate-50/80 p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-xs font-bold text-white shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-slate-900">{user?.name || 'User'}</p>
              <p className="truncate text-[11px] font-medium text-slate-500">{user?.email || ''}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={15} strokeWidth={2.2} />
            </button>
          </div>
        </div>
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
                onClick={() => window.open(GUIDE_URL, '_blank', 'noopener,noreferrer')}
                className={HEADER_ACTION_BUTTON_CLASS}
              >
                <BookOpen size={17} strokeWidth={2.2} />
                Guide
              </button>
              <NotificationsControl />
              <MetaKeySettingsControl />
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className={HEADER_ACTION_BUTTON_CLASS}
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

        <main className="w-full px-3 pb-12 pt-4 sm:px-4 lg:px-4 lg:pb-12 lg:pt-5">
          <Outlet />
        </main>

        <ProtectedFooter
          footer={protectedFooter}
          flagSrc={sriLankaFlag}
        />
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

