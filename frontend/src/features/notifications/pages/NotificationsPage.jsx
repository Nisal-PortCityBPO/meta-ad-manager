import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { adsLaunchApi } from '../../ads-launch/api/adsLaunchApi';
import { useMetaKeySettings } from '../../settings/MetaKeySettingsContext';
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

const NotificationsPage = () => {
  const {
    clearPublishHistory,
    currentPublishId,
    events,
    latestError,
    latestResult,
    markPublishHistorySeen,
    progress,
    publishHistory,
  } = usePublishProgress();
  const { publishTokenType } = useMetaKeySettings();
  const [retryingRecordId, setRetryingRecordId] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const hasPublishNotice = Boolean(progress || events.length || latestResult || latestError);
  const savedHistory = publishHistory.filter((item) => !hasPublishNotice || item.id !== currentPublishId);
  const historyPageSize = 5;
  const historyPageCount = Math.max(Math.ceil(savedHistory.length / historyPageSize), 1);
  const safeHistoryPage = Math.min(historyPage, historyPageCount);
  const visibleHistory = useMemo(
    () => savedHistory.slice((safeHistoryPage - 1) * historyPageSize, safeHistoryPage * historyPageSize),
    [safeHistoryPage, savedHistory]
  );

  useEffect(() => {
    markPublishHistorySeen();
  }, [markPublishHistorySeen]);

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
      });
      toast.success(data.message || 'Retry completed');
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setRetryingRecordId('');
    }
  };

  return (
    <div>
      <DashboardHeader title="Notifications" description="Account updates and dashboard messages." />

      {hasPublishNotice ? (
        <div className="mb-4">
          <PublishProgressPanel events={events} latestError={latestError} latestResult={latestResult} progress={progress} />
        </div>
      ) : null}

      <DashboardPanel
        title="Publish history"
        className="mb-4"
        headerAction={
          publishHistory.length ? (
            <button
              type="button"
              onClick={() => {
                clearPublishHistory();
                setHistoryPage(1);
              }}
              className="rounded-lg border border-red-100 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-red-600 transition hover:bg-red-50"
            >
              Clear
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
          onRetryFailed={retryFailedAccount}
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
