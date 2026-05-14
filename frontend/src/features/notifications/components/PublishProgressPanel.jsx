import { CheckCircle2, Clock3, LoaderCircle, PauseCircle, Play, Trash2, XCircle } from 'lucide-react';

export const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined) {
    return 'Estimating';
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
};

const getProgressTone = (status) => {
  if (status === 'completed') {
    return 'bg-emerald-50 text-emerald-700';
  }

  if (status === 'queued') {
    return 'bg-amber-50 text-amber-700';
  }

  if (status === 'paused' || status === 'pausing') {
    return 'bg-orange-50 text-orange-700';
  }

  if (status === 'failed' || status === 'stopped') {
    return 'bg-red-50 text-red-700';
  }

  return 'bg-sky-50 text-sky-700';
};

const getStatusIcon = (status) => {
  if (status === 'completed') {
    return CheckCircle2;
  }

  if (status === 'queued') {
    return Clock3;
  }

  if (status === 'paused') {
    return PauseCircle;
  }

  if (status === 'failed' || status === 'stopped') {
    return XCircle;
  }

  return LoaderCircle;
};

const getEventTime = (event) => {
  const timestamp = new Date(event?.timestamp || 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const PublishProgressPanel = ({
  canPause = false,
  canForceStop = false,
  canDelete = false,
  canResume = false,
  events,
  label = 'Live publish process',
  latestError,
  latestResult,
  onPause = null,
  onForceStop = null,
  onDelete = null,
  onResume = null,
  pauseBusy = false,
  progress,
  resumeBusy = false,
  stopBusy = false,
  deleteBusy = false,
}) => {
  if (!progress && !events.length && !latestResult && !latestError) {
    return null;
  }

  const progressData = progress?.progress || {};
  const percent = progressData.percent || 0;
  const StatusIcon = getStatusIcon(progress?.status);
  const accountIndex = Number(progress?.accountIndex || 0);
  const totalAccounts = Number(progress?.totalAccounts || 0);
  const remainingAfterCurrentAccount = totalAccounts ? totalAccounts - Math.max(accountIndex || 1, 1) : 1;
  const hasPauseTarget = remainingAfterCurrentAccount > 0;
  const waitingBetweenAccounts = progress?.step === 'account-interval' || progress?.status === 'waiting';
  const showPause = Boolean(onPause && canPause && hasPauseTarget && (progress?.status === 'active' || waitingBetweenAccounts));
  const showForceStop = Boolean(onForceStop && canForceStop && ['active', 'pausing', 'waiting', 'queued'].includes(progress?.status));
  const showDelete = Boolean(onDelete && canDelete);
  const showResume = Boolean(onResume && canResume && progress?.status === 'paused');
  const visibleEvents = [...events]
    .filter((event) => event.step !== 'account-interval')
    .sort((first, second) => getEventTime(second) - getEventTime(first));
  const pauseRequestedEvent = visibleEvents.find((event) => event.status === 'pausing' || event.step === 'pause-requested');
  const latestErrorTone =
    progress?.status === 'queued'
      ? 'border-amber-100 bg-amber-50 text-amber-700'
      : 'border-red-100 bg-red-50 text-red-700';
  const resumeNotices = Array.isArray(latestResult?.results)
    ? latestResult.results.flatMap((result) => (Array.isArray(result.resumeNotices) ? result.resumeNotices : []))
    : [];

  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">{label}</p>
          <div className="mt-2 flex items-center gap-2">
            <StatusIcon
              size={18}
              strokeWidth={2.4}
              className={
                progress?.status === 'active' || progress?.status === 'pausing' || progress?.status === 'waiting'
                  ? 'animate-spin text-sky-600'
                  : progress?.status === 'failed'
                    ? 'text-red-600'
                    : progress?.status === 'queued'
                      ? 'text-amber-600'
                      : progress?.status === 'paused' || progress?.status === 'pausing'
                        ? 'text-orange-600'
                        : progress?.status === 'stopped'
                          ? 'text-red-600'
                          : 'text-emerald-600'
              }
            />
            <p className="text-sm font-black text-slate-950">{progress?.message || latestResult?.message || latestError || 'No active publish'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showPause ? (
            <button
              type="button"
              onClick={onPause}
              disabled={pauseBusy}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-orange-100 bg-orange-50 px-3 text-xs font-black uppercase tracking-[0.12em] text-orange-700 transition hover:bg-orange-100 disabled:opacity-60"
            >
              {pauseBusy ? <LoaderCircle size={14} className="animate-spin" /> : <PauseCircle size={14} />}
              {waitingBetweenAccounts ? 'Pause before next' : 'Pause after current'}
            </button>
          ) : null}
          {showForceStop ? (
            <button
              type="button"
              onClick={onForceStop}
              disabled={stopBusy}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 text-xs font-black uppercase tracking-[0.12em] text-red-700 transition hover:bg-red-100 disabled:opacity-60"
              title="Use only when a Meta request is stuck and the normal pause cannot finish."
            >
              {stopBusy ? <LoaderCircle size={14} className="animate-spin" /> : <XCircle size={14} />}
              Force stop
            </button>
          ) : null}
          {showDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleteBusy}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              title="Super admin only. Deletes this publish session from the database and clears the live panel."
            >
              {deleteBusy ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete
            </button>
          ) : null}
          {showResume ? (
            <button
              type="button"
              onClick={onResume}
              disabled={resumeBusy}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-sky-700 disabled:opacity-60"
            >
              {resumeBusy ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
              Continue
            </button>
          ) : null}
          <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
            <Clock3 size={13} strokeWidth={2.4} />
            ETA {formatDuration(progressData.etaSeconds)}
          </span>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-3 overflow-hidden rounded-full bg-sky-50">
          <div className="h-full rounded-full bg-lime-500 transition-all duration-300" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs font-bold text-slate-500">
          <span>
            {progressData.completed || 0} of {progressData.total || 0} steps
          </span>
          <span>{percent}% complete</span>
          <span>Elapsed {formatDuration(progressData.elapsedSeconds || 0)}</span>
        </div>
      </div>

      {latestResult ? (
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800">
          Published {latestResult.summary?.published || 0} of {latestResult.summary?.requested || 0} requested accounts.
          {latestResult.summary?.queued ? ` ${latestResult.summary.queued} queued for automatic retry.` : ''}
        </div>
      ) : null}

      {latestError ? (
        <div className={`mt-4 rounded-xl border px-3 py-3 text-sm font-semibold ${latestErrorTone}`}>{latestError}</div>
      ) : null}

      {pauseRequestedEvent ? (
        <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50 px-3 py-3 text-sm font-semibold text-orange-800">
          <p className="font-black">Pause requested</p>
        </div>
      ) : null}

      {resumeNotices.length ? (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-800">
          <p className="font-black">Resume notes</p>
          <div className="mt-2 space-y-1">
            {resumeNotices.slice(0, 4).map((notice, index) => (
              <p key={`${notice}-${index}`}>{notice}</p>
            ))}
          </div>
        </div>
      ) : null}

      {visibleEvents.length ? (
        <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
          {visibleEvents.map((event, index) => (
            <div key={`${event.timestamp}-${event.step}-${index}`} className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-3">
              <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${getProgressTone(event.status)}`}>
                {event.status || 'active'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-bold text-slate-800">{event.message}</p>
                {event.error ? <p className="mt-1 break-words text-xs font-semibold text-red-600">{event.error}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default PublishProgressPanel;
