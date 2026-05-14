import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Clock3, LoaderCircle, Play, RefreshCw, Trash2 } from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { adsLaunchApi } from '../../ads-launch/api/adsLaunchApi';
import { useMetaKeySettings } from '../../settings/MetaKeySettingsContext';
import { tokensApi } from '../../token-management/api/tokensApi';
import PublishHistoryList from '../components/PublishHistoryList';
import PublishProgressPanel from '../components/PublishProgressPanel';
import { usePublishProgress } from '../PublishProgressContext';

const notifications = [
  {
    id: 1,
    title: 'Session active',
    body: 'Your current login session is valid.',
    time: 'Now',
  },
  {
    id: 2,
    title: 'Admin workspace ready',
    body: 'Profile and dashboard screens are available.',
    time: 'Today',
  },
];

const isQueuedPublishSession = (item) => item.rawStatus === 'PENDING' || item.queue?.status === 'PENDING';
const isLivePublishSession = (item) => ['active', 'pausing'].includes(item.status) || item.queue?.status === 'RUNNING';

const NotificationsPage = () => {
  const {
    applyPublishSessions,
    clearPublishHistory,
    currentPublishId,
    events,
    focusPublishSession,
    forceStopPublish,
    latestError,
    latestResult,
    markPublishHistorySeen,
    pauseBusy,
    progress,
    publishHistory,
    requestPausePublish,
    refreshPublishSessions,
    resumeBusy,
    resumePausedPublish,
    stopBusy,
  } = usePublishProgress();
  const { publishTokenType } = useMetaKeySettings();
  const [retryingRecordId, setRetryingRecordId] = useState('');
  const [publishQueue, setPublishQueue] = useState({ queue: [], state: { running: false, counts: {} } });
  const [tokens, setTokens] = useState([]);
  const [retryTokenId, setRetryTokenId] = useState('');
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueRunning, setQueueRunning] = useState(false);
  const [queueClearing, setQueueClearing] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyClearing, setHistoryClearing] = useState(false);
  const hasPublishNotice = Boolean(progress || events.length || latestResult || latestError);
  const currentPublishItem = publishHistory.find((item) => item.id === currentPublishId) || null;
  const parallelPublishItems = publishHistory.filter(
    (item) => item.id !== currentPublishId && isLivePublishSession(item)
  ).sort((first, second) => String(first.queue?.startedAt || first.startedAt || '').localeCompare(String(second.queue?.startedAt || second.startedAt || '')));
  const queuedPublishItems = publishHistory.filter(
    (item) => item.id !== currentPublishId && isQueuedPublishSession(item)
  ).sort((first, second) => String(first.queue?.queuedAt || first.startedAt || '').localeCompare(String(second.queue?.queuedAt || second.startedAt || '')));
  const savedHistory = publishHistory.filter(
    (item) => (!hasPublishNotice || item.id !== currentPublishId) && !isQueuedPublishSession(item) && !isLivePublishSession(item)
  );
  const historyPageSize = 5;
  const historyPageCount = Math.max(Math.ceil(savedHistory.length / historyPageSize), 1);
  const safeHistoryPage = Math.min(historyPage, historyPageCount);
  const visibleHistory = useMemo(
    () => savedHistory.slice((safeHistoryPage - 1) * historyPageSize, safeHistoryPage * historyPageSize),
    [safeHistoryPage, savedHistory]
  );
  const queueItems = publishQueue.queue || [];
  const queueHasRunningItem = queueItems.some((item) => item.publishQueue?.status === 'RUNNING');
  const queueIsRunning = Boolean(publishQueue.state?.running || queueRunning || queueHasRunningItem);
  const activeTokens = tokens.filter((token) => token.status === 'ACTIVE');

  useEffect(() => {
    markPublishHistorySeen();
  }, [markPublishHistorySeen]);

  const handleClearPublishHistory = async () => {
    setHistoryClearing(true);
    try {
      const result = await clearPublishHistory();
      setHistoryPage(1);
      toast.success(result?.message || 'Publish history cleared');
    } catch (error) {
      toast.error(error.message || 'Failed to clear publish history');
    } finally {
      setHistoryClearing(false);
    }
  };

  const loadPublishQueue = async ({ silent = false } = {}) => {
    if (!silent) {
      setQueueLoading(true);
    }

    try {
      const data = await adsLaunchApi.getPublishQueue();
      setPublishQueue(data);
    } catch (requestError) {
      if (!silent) {
        toast.error(requestError.message);
      }
    } finally {
      if (!silent) {
        setQueueLoading(false);
      }
    }
  };

  useEffect(() => {
    loadPublishQueue({ silent: true });
  }, []);

  useEffect(() => {
    let mounted = true;

    tokensApi
      .getTokens()
      .then((data) => {
        if (mounted) {
          setTokens(Array.isArray(data.tokens) ? data.tokens : []);
        }
      })
      .catch(() => {
        if (mounted) {
          setTokens([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!publishQueue.state?.running && !queueHasRunningItem) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      loadPublishQueue({ silent: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [publishQueue.state?.running, queueHasRunningItem]);

  useEffect(() => {
    setHistoryPage(1);
  }, [savedHistory.length]);

  const retryFailedAccount = async (failure) => {
    if (!failure?.campaignId || !failure?.tokenId) {
      toast.error('Retry data is missing for this failed account');
      return;
    }

    setRetryingRecordId(failure.historyRecordId || failure.campaignId);
    try {
      const data = await adsLaunchApi.retryFailedLaunch(failure.campaignId, {
        tokenId: failure.tokenId,
        tokenType: publishTokenType,
        retryTokenId: retryTokenId || undefined,
      });
      const resumeNotice = data.result?.results
        ?.flatMap((result) => (Array.isArray(result.resumeNotices) ? result.resumeNotices : []))
        ?.find(Boolean);
      toast.success(data.message || 'Retry completed');
      if (resumeNotice) {
        toast(resumeNotice);
      }
      if (Array.isArray(data.publishSessions) && data.publishSessions.length) {
        applyPublishSessions(data.publishSessions);
      } else {
        await refreshPublishSessions();
      }
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setRetryingRecordId('');
      loadPublishQueue({ silent: true });
    }
  };

  const runQueue = async () => {
    setQueueRunning(true);
    try {
      const data = await adsLaunchApi.runPublishQueue({
        tokenType: publishTokenType,
        retryTokenId: retryTokenId || undefined,
        force: true,
      });
      const resumeNotice = data.processed
        ?.flatMap((item) => (Array.isArray(item.resumeNotices) ? item.resumeNotices : []))
        ?.find(Boolean);
      setPublishQueue(data);
      toast.success(data.message || 'Publish queue processed');
      if (resumeNotice) {
        toast(resumeNotice);
      }
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setQueueRunning(false);
      loadPublishQueue({ silent: true });
    }
  };

  const clearQueue = async () => {
    setQueueClearing(true);
    try {
      const data = await adsLaunchApi.clearPublishQueue();
      setPublishQueue(data);
      toast.success(data.message || 'Publish queue cleared');
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setQueueClearing(false);
      loadPublishQueue({ silent: true });
    }
  };

  const pauseLivePublish = async () => {
    try {
      const data = await requestPausePublish();
      toast.success(data.message || 'Pause requested');
    } catch (requestError) {
      toast.error(requestError.message);
    }
  };

  const forceStopLivePublish = async () => {
    const confirmed = window.confirm(
      'Force stop this publish? This stops the local worker and releases the publish lane. Any Meta request already in-flight may still finish inside Meta.'
    );

    if (!confirmed) {
      return;
    }

    try {
      const data = await forceStopPublish(currentPublishId);
      toast.success(data.message || 'Publish force-stopped');
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
    <div>
      <DashboardHeader title="Notifications" description="Account updates and dashboard messages." />

      {hasPublishNotice ? (
        <div className="mb-4">
          <PublishProgressPanel
            canForceStop={Boolean(currentPublishItem?.canForceStop || ['active', 'pausing', 'waiting', 'queued'].includes(progress?.status))}
            canPause={Boolean(currentPublishItem?.canPause)}
            canResume={Boolean(currentPublishItem?.canResume)}
            events={events}
            latestError={latestError}
            latestResult={latestResult}
            onForceStop={forceStopLivePublish}
            onPause={pauseLivePublish}
            onResume={() => resumePublish(currentPublishId)}
            pauseBusy={pauseBusy}
            progress={progress}
            resumeBusy={resumeBusy}
            stopBusy={stopBusy}
          />
        </div>
      ) : null}

      {parallelPublishItems.length || queuedPublishItems.length ? (
        <DashboardPanel title="Parallel publish lanes" className="mb-4">
          <div className="space-y-3">
            <p className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-slate-600">
              Different token/key lanes can run at the same time. Publishes using the same token or ad account wait here until that lane is free.
            </p>
            {parallelPublishItems.map((item, index) => {
              const progressData = item.progress?.progress || {};

              return (
                <div key={item.id || `${item.title}-${index}`} className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm shadow-emerald-100/60">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{item.title || 'Running publish'}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                        {item.progress?.message || 'Publishing in a parallel lane'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-emerald-700">
                        <LoaderCircle size={13} className="animate-spin" />
                        Running
                      </span>
                      <button
                        type="button"
                        onClick={() => focusPublishSession(item.id)}
                        className="h-8 rounded-lg border border-sky-100 bg-white px-3 text-xs font-black uppercase tracking-[0.12em] text-sky-700 transition hover:bg-sky-50"
                      >
                        View
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-sky-50">
                    <div className="h-full rounded-full bg-lime-500 transition-all duration-300" style={{ width: `${progressData.percent || 0}%` }} />
                  </div>
                </div>
              );
            })}
            {queuedPublishItems.map((item, index) => (
              <div key={item.id || `${item.title}-${index}`} className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{index + 1}. {item.title || 'Queued publish'}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                      {item.progress?.message || 'Waiting for its token/ad-account lane to become free'}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-amber-700">
                    <Clock3 size={13} />
                    Waiting
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-500 sm:grid-cols-3">
                  <span>Queue position: {index + 1}</span>
                  <span>Source: {item.source || 'Meta publish'}</span>
                  <span>
                    Queued:{' '}
                    {item.queue?.queuedAt || item.startedAt
                      ? new Date(item.queue?.queuedAt || item.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                      : 'Waiting'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </DashboardPanel>
      ) : null}

      <DashboardPanel
        title="Publish queue"
        className="mb-4"
        headerAction={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => loadPublishQueue()}
              disabled={queueLoading}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-sky-100 bg-white px-3 text-xs font-black uppercase tracking-[0.14em] text-sky-700 transition hover:bg-sky-50 disabled:opacity-50"
            >
              {queueLoading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
            <button
              type="button"
              onClick={runQueue}
              disabled={!queueItems.length || queueIsRunning}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-3 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {queueIsRunning ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
              Resume
            </button>
            <button
              type="button"
              onClick={clearQueue}
              disabled={!queueItems.length || queueIsRunning || queueClearing}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-100 bg-white px-3 text-xs font-black uppercase tracking-[0.14em] text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={queueIsRunning ? 'Wait until the queue stops before clearing it' : 'Clear queued publish retries'}
            >
              {queueClearing ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Clear queue
            </button>
          </div>
        }
      >
        <div className="mb-4 grid gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Retry API key</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Leave automatic to try the saved token first, then any same-brand assigned token that passes access checks.
            </p>
          </div>
          <select
            value={retryTokenId}
            onChange={(event) => setRetryTokenId(event.target.value)}
            className="h-11 w-full rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          >
            <option value="">Automatic or original saved token</option>
            {activeTokens.map((token) => (
              <option key={token.id} value={token.id}>
                {token.label}
                {token.brand?.name ? ` - ${token.brand.name}` : ''}
              </option>
            ))}
          </select>
        </div>
        {queueItems.length ? (
          <div className="space-y-3">
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {queueIsRunning ? 'The queue is running now. Clear is locked until it stops.' : 'Queued blocked publishes will retry automatically, and you can resume immediately when Meta/API access is back.'}
            </div>
            {queueItems.map((item) => (
              <div key={`${item.campaignId}-${item.publishQueue?.status}`} className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/50">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950">{item.adAccount?.name || item.adAccount?.id || item.name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{item.name || item.campaignId}</p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-amber-700">
                    <Clock3 size={13} />
                    {item.publishQueue?.status || 'PENDING'}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-500 sm:grid-cols-3">
                  <span>Attempts: {item.publishQueue?.attemptCount || 0}</span>
                  <span>Token: {item.tokenLabel || item.tokenId}</span>
                  <span>
                    Next:{' '}
                    {item.publishQueue?.nextAttemptAt
                      ? new Date(item.publishQueue.nextAttemptAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                      : 'Waiting'}
                  </span>
                </div>
                {item.publishQueue?.lastError || item.lastMetaError ? (
                  <p className="mt-3 break-words rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    {item.publishQueue?.lastError || item.lastMetaError}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-sky-50 px-4 py-5 text-sm font-semibold text-slate-500">
            No queued publish retries. If Meta blocks an API publish, the failed row will stay here until it resumes or you clear it.
          </p>
        )}
      </DashboardPanel>

      <DashboardPanel
        title="Publish history"
        className="mb-4"
        headerAction={
          savedHistory.length ? (
            <button
              type="button"
              onClick={handleClearPublishHistory}
              disabled={historyClearing}
              className="rounded-lg border border-red-100 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {historyClearing ? 'Clearing...' : 'Clear history'}
            </button>
          ) : null
        }
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sky-50 px-4 py-3">
          <p className="text-sm font-bold text-slate-600">
            Showing {visibleHistory.length ? (safeHistoryPage - 1) * historyPageSize + 1 : 0}-{Math.min(safeHistoryPage * historyPageSize, savedHistory.length)} of {savedHistory.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryPage((page) => Math.max(page - 1, 1))}
              disabled={safeHistoryPage <= 1}
              className="h-9 rounded-lg border border-sky-100 bg-white px-3 text-xs font-black uppercase tracking-[0.14em] text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <span className="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-500">
              {safeHistoryPage}/{historyPageCount}
            </span>
            <button
              type="button"
              onClick={() => setHistoryPage((page) => Math.min(page + 1, historyPageCount))}
              disabled={safeHistoryPage >= historyPageCount}
              className="h-9 rounded-lg border border-sky-100 bg-white px-3 text-xs font-black uppercase tracking-[0.14em] text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
        <PublishHistoryList
          history={visibleHistory}
          limit={historyPageSize}
          onResumePublish={resumePublish}
          onRetryFailed={retryFailedAccount}
          resumingSessionId={resumeBusy ? currentPublishId : ''}
          retryingRecordId={retryingRecordId}
        />
      </DashboardPanel>

      <DashboardPanel>
        <div className="divide-y divide-sky-50">
          {notifications.map((notification) => (
            <div key={notification.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black text-slate-950">{notification.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{notification.body}</p>
              </div>
              <span className="inline-flex w-fit rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
                {notification.time}
              </span>
            </div>
          ))}
        </div>
      </DashboardPanel>
    </div>
  );
};

export default NotificationsPage;
