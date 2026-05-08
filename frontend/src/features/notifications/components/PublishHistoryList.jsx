import { CheckCircle2, ChevronDown, LoaderCircle, RotateCcw, XCircle } from 'lucide-react';
import PublishProgressPanel from './PublishProgressPanel';

const formatHistoryTime = (value) => {
  if (!value) {
    return 'Unknown time';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const getHistoryIcon = (status) => {
  if (status === 'completed') {
    return CheckCircle2;
  }

  if (status === 'failed') {
    return XCircle;
  }

  return LoaderCircle;
};

const getHistoryTone = (status) => {
  if (status === 'completed') {
    return 'bg-emerald-50 text-emerald-700';
  }

  if (status === 'failed') {
    return 'bg-red-50 text-red-700';
  }

  return 'bg-sky-50 text-sky-700';
};

const PublishHistoryList = ({ history = [], limit = 8, onRetryFailed = null, retryingRecordId = '' }) => {
  const visibleHistory = history.slice(0, limit);

  if (!visibleHistory.length) {
    return (
      <p className="rounded-xl bg-sky-50 px-4 py-5 text-sm font-semibold text-slate-500">
        No saved publish history yet. Start a publish and the live process will be saved here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {visibleHistory.map((item) => {
        const Icon = getHistoryIcon(item.status);
        const progressData = item.progress?.progress || {};
        const percent = progressData.percent || 0;
        const failedAccounts = Array.isArray(item.latestResult?.failed) ? item.latestResult.failed : [];
        const retryableAccounts = failedAccounts.filter((failure) => failure.canRetry && failure.campaignId && failure.tokenId);

        return (
          <details key={item.id} className="group overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm shadow-sky-100/60">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-sky-50/70">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${getHistoryTone(item.status)}`}>
                  <Icon size={18} strokeWidth={2.4} className={item.status === 'active' ? 'animate-spin' : ''} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{item.title || 'Ads publish'}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                    {item.progress?.message || item.latestError || item.latestResult?.message || 'Publish process saved'}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden rounded-full bg-sky-50 px-3 py-1 text-[11px] font-black text-sky-700 sm:inline-flex">
                  {percent}%
                </span>
                <span className="hidden text-xs font-bold text-slate-400 md:inline">
                  {formatHistoryTime(item.completedAt || item.startedAt)}
                </span>
                <ChevronDown size={17} strokeWidth={2.4} className="text-slate-400 transition group-open:rotate-180" />
              </div>
            </summary>
            <div className="border-t border-sky-50 bg-sky-50/30 p-3">
              {failedAccounts.length ? (
                <div className="mb-3 rounded-2xl border border-red-100 bg-red-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-red-700">Failed accounts</p>
                      <p className="mt-1 text-xs font-semibold text-red-700">
                        Meta/API errors are saved here so you can retry only the broken account rows.
                      </p>
                    </div>
                    {onRetryFailed && retryableAccounts.length > 1 ? (
                      <button
                        type="button"
                        onClick={async () => {
                          for (const failure of retryableAccounts) {
                            await onRetryFailed(failure);
                          }
                        }}
                        disabled={Boolean(retryingRecordId)}
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-red-700 disabled:opacity-60"
                      >
                        <RotateCcw size={14} strokeWidth={2.4} />
                        Retry all
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-2">
                    {failedAccounts.map((failure, index) => {
                      const retrying = retryingRecordId === failure.historyRecordId;
                      const canRetry = Boolean(onRetryFailed && failure.canRetry && failure.campaignId && failure.tokenId);

                      return (
                        <div key={`${failure.historyRecordId || failure.adAccountId}-${index}`} className="rounded-xl bg-white px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-black text-slate-950">{failure.adAccountName || failure.adAccountId || 'Ad account'}</p>
                              <p className="mt-1 break-words text-xs font-semibold text-red-600">{failure.message || 'Publish failed'}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-black text-slate-500">
                                {failure.resumeFromStep ? (
                                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                                    Continue from {failure.resumeFromStep}
                                  </span>
                                ) : null}
                                {failure.partialMeta?.campaignId ? (
                                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                                    Campaign {failure.partialMeta.campaignId}
                                  </span>
                                ) : null}
                                {failure.partialMeta?.adSetId ? (
                                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                                    Ad set {failure.partialMeta.adSetId}
                                  </span>
                                ) : null}
                                {failure.partialMeta?.creativeId ? (
                                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                                    Creative {failure.partialMeta.creativeId}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {onRetryFailed ? (
                              <button
                                type="button"
                                onClick={() => onRetryFailed(failure)}
                                disabled={!canRetry || retrying}
                                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 text-xs font-black uppercase tracking-[0.12em] text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                                title={canRetry ? 'Continue failed publish' : 'Retry data is not available for this failure'}
                              >
                                {retrying ? <LoaderCircle size={14} strokeWidth={2.4} className="animate-spin" /> : <RotateCcw size={14} strokeWidth={2.4} />}
                                {failure.resumeFromStep && failure.resumeFromStep !== 'campaign creation' ? 'Continue' : 'Retry'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <PublishProgressPanel
                events={item.events || []}
                label="Saved publish process"
                latestError={item.latestError || ''}
                latestResult={item.latestResult || null}
                progress={item.progress || null}
              />
            </div>
          </details>
        );
      })}
    </div>
  );
};

export default PublishHistoryList;
