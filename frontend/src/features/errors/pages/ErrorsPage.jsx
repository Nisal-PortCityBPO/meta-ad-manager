import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { usePublishProgress } from '../../notifications/PublishProgressContext';
import { useMetaKeySettings } from '../../settings/MetaKeySettingsContext';
import { useTokens } from '../../token-management/hooks/useTokens';
import { errorsApi } from '../api/errorsApi';

const typeOptions = [
  { value: '', label: 'All error types' },
  { value: 'AUTH', label: 'Authentication' },
  { value: 'BLOCKED', label: 'Blocked / rate limit' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'CREATIVE', label: 'Creative' },
  { value: 'VALIDATION', label: 'Validation' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const statusOptions = [
  { value: '', label: 'All states' },
  { value: 'OPEN', label: 'Open only' },
  { value: 'SUCCESS', label: 'Success / recovered' },
  { value: 'RETRYABLE', label: 'Retryable' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'PENDING', label: 'Pending queue' },
  { value: 'AUTH', label: 'Auth/key issue' },
  { value: 'WITH_ERROR', label: 'Action error' },
];

const typeTone = {
  AUTH: 'bg-red-50 text-red-700 ring-red-100',
  BLOCKED: 'bg-orange-50 text-orange-700 ring-orange-100',
  MEDIA: 'bg-sky-50 text-sky-700 ring-sky-100',
  CREATIVE: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100',
  VALIDATION: 'bg-amber-50 text-amber-700 ring-amber-100',
  UNKNOWN: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const statusTone = {
  SUCCESS: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  BLOCKED: 'bg-orange-50 text-orange-700',
  PENDING: 'bg-amber-50 text-amber-700',
  RUNNING: 'bg-sky-50 text-sky-700',
  AUTH: 'bg-red-50 text-red-700',
  WITH_ERROR: 'bg-slate-100 text-slate-600',
};

const formatDateTime = (value) => {
  if (!value) {
    return 'Not saved';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const getErrorTitle = (item) => item.adAccount?.name || item.tokenLabel || item.campaignName || item.campaignId || 'Saved error';

const StatCard = ({ label, value, tone = 'sky' }) => {
  const tones = {
    sky: 'bg-sky-50 text-sky-700',
    red: 'bg-red-50 text-red-700',
    orange: 'bg-orange-50 text-orange-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  };

  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/70">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className={`mt-3 inline-flex rounded-xl px-3 py-1 text-2xl font-black ${tones[tone] || tones.sky}`}>{value || 0}</p>
    </div>
  );
};

const DetailLine = ({ label, value }) => (
  <div className="rounded-xl bg-sky-50/70 px-3 py-2">
    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
    <p className="mt-1 break-words text-sm font-bold text-slate-800">{value || 'Not saved'}</p>
  </div>
);

const ContextLine = ({ label, value }) =>
  value ? (
    <p className="truncate text-xs font-semibold text-slate-500">
      <span className="font-black text-slate-700">{label}:</span> {value}
    </p>
  ) : null;

const ErrorMessagePreview = ({ expanded, message, onToggle, recovered = false }) => {
  const text = String(message || '');
  const canToggle = text.length > 220;
  const clampStyle = expanded
    ? undefined
    : {
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 4,
        overflow: 'hidden',
      };

  return (
    <div className="mt-1 max-w-sm">
      <p
        className={`break-words text-xs font-semibold leading-5 ${recovered ? 'text-slate-600' : 'text-red-700'}`}
        style={clampStyle}
      >
        {text || 'Saved Meta action error'}
      </p>
      {canToggle ? (
        <button
          type="button"
          onClick={onToggle}
          className="mt-1 text-[11px] font-black uppercase tracking-[0.12em] text-sky-700 transition hover:text-sky-900"
        >
          {expanded ? 'Read less' : 'Read more'}
        </button>
      ) : null}
    </div>
  );
};

const ErrorsPage = () => {
  const navigate = useNavigate();
  const { applyPublishSessions, refreshPublishSessions } = usePublishProgress();
  const { publishTokenType } = useMetaKeySettings();
  const { tokens } = useTokens();
  const [filters, setFilters] = useState({
    tokenId: '',
    type: '',
    status: '',
    search: '',
    page: 1,
    limit: 25,
  });
  const [retryTokenId, setRetryTokenId] = useState('');
  const [errors, setErrors] = useState([]);
  const [summary, setSummary] = useState({ total: 0, open: 0, success: 0, retryable: 0, blocked: 0, auth: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState('');
  const [clearingSuccess, setClearingSuccess] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [expandedErrorIds, setExpandedErrorIds] = useState(() => new Set());

  const activeTokens = useMemo(() => tokens.filter((token) => token.status === 'ACTIVE'), [tokens]);

  const updateFilter = (field, value) => {
    setFilters((current) => ({
      ...current,
      [field]: value,
      page: field === 'page' ? value : 1,
    }));
  };

  const loadErrors = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const data = await errorsApi.getErrors(filters);
      setErrors(data.errors || []);
      setSummary(data.summary || {});
      setPagination(data.pagination || { page: 1, limit: filters.limit, total: 0, pages: 1 });
    } catch (requestError) {
      toast.error(requestError.message);
      setErrors([]);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadErrors({ silent: true });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [filters.tokenId, filters.type, filters.status, filters.search, filters.page, filters.limit]);

  const checkAccess = async (item) => {
    setActionId(`${item.id}:check`);

    try {
      const data = await errorsApi.checkAccess(item.campaignId, {
        tokenId: item.tokenId,
        tokenType: publishTokenType,
        retryTokenId: retryTokenId || undefined,
      });
      toast.success(data.message || 'Access check passed');
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setActionId('');
    }
  };

  const retryError = async (item) => {
    setActionId(`${item.id}:retry`);

    try {
      const data = await errorsApi.retryError(item.campaignId, {
        tokenId: item.tokenId,
        tokenType: publishTokenType,
        retryTokenId: retryTokenId || undefined,
      });
      toast.success(data.message || 'Retry completed');

      if (Array.isArray(data.publishSessions) && data.publishSessions.length) {
        applyPublishSessions(data.publishSessions);
      } else {
        await refreshPublishSessions();
      }

      await loadErrors({ silent: true });
      setDetailItem(null);
    } catch (requestError) {
      toast.error(requestError.message);
      await loadErrors({ silent: true });
    } finally {
      setActionId('');
    }
  };

  const toggleErrorMessage = (itemId) => {
    setExpandedErrorIds((current) => {
      const next = new Set(current);

      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }

      return next;
    });
  };

  const clearSuccessRows = async () => {
    if (!summary.success) {
      return;
    }

    setClearingSuccess(true);
    try {
      const data = await errorsApi.clearSuccess();
      toast.success(data.message || 'Recovered errors cleared');
      await loadErrors({ silent: true });
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setClearingSuccess(false);
    }
  };

  return (
    <div>
      <DashboardHeader
        title="Errors"
        description="One place for stopped ad-account publishes, Meta API blocks, auth problems, and retryable launch faults. Use Check access before retrying when you updated a key."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={clearSuccessRows}
              disabled={!summary.success || clearingSuccess}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-100 bg-white px-4 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {clearingSuccess ? <LoaderCircle size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
              Clear success
            </button>
            <button
              type="button"
              onClick={() => loadErrors()}
              disabled={loading}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={17} />}
              Refresh
            </button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="All faults" value={summary.total} tone="sky" />
        <StatCard label="Open errors" value={summary.open ?? summary.total} tone="red" />
        <StatCard label="Retryable" value={summary.retryable} tone="emerald" />
        <StatCard label="Success" value={summary.success} tone="emerald" />
        <StatCard label="Blocked/API" value={summary.blocked} tone="orange" />
      </div>

      <DashboardPanel className="mb-4">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={17} />
            <input
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              className="h-11 w-full rounded-xl border border-sky-100 bg-white pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              placeholder="Search account, campaign, error, token..."
            />
          </div>
          <select
            value={filters.tokenId}
            onChange={(event) => updateFilter('tokenId', event.target.value)}
            className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          >
            <option value="">All tokens</option>
            {tokens.map((token) => (
              <option key={token.id} value={token.id}>
                {token.label}
                {token.brand?.name ? ` - ${token.brand.name}` : ''}
              </option>
            ))}
          </select>
          <select
            value={filters.type}
            onChange={(event) => updateFilter('type', event.target.value)}
            className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          >
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(event) => updateFilter('status', event.target.value)}
            className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid gap-3 rounded-2xl bg-sky-50/80 p-3 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Retry API key</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Automatic uses the saved token first, then a same-brand token that passes ad account/page/pixel checks.
            </p>
          </div>
          <select
            value={retryTokenId}
            onChange={(event) => setRetryTokenId(event.target.value)}
            className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
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
      </DashboardPanel>

      <DashboardPanel
        title="Fault table"
        headerAction={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateFilter('page', Math.max((pagination.page || 1) - 1, 1))}
              disabled={(pagination.page || 1) <= 1 || loading}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-sky-100 bg-white text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={17} />
            </button>
            <span className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-black text-slate-500">
              {pagination.page || 1}/{pagination.pages || 1}
            </span>
            <button
              type="button"
              onClick={() => updateFilter('page', Math.min((pagination.page || 1) + 1, pagination.pages || 1))}
              disabled={(pagination.page || 1) >= (pagination.pages || 1) || loading}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-sky-100 bg-white text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center rounded-2xl bg-sky-50 py-14 text-sm font-bold text-sky-700">
            <LoaderCircle size={18} className="mr-2 animate-spin" />
            Loading errors
          </div>
        ) : errors.length ? (
          <div className="overflow-x-auto rounded-2xl border border-sky-100">
            <table className="min-w-[980px] w-full divide-y divide-sky-100 bg-white text-left">
              <thead className="bg-sky-50/80">
                <tr className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  <th className="px-3 py-3">Fault</th>
                  <th className="px-3 py-3">Ad account / error</th>
                  <th className="px-3 py-3">Brand / key</th>
                  <th className="px-3 py-3">Recovery</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-50">
                {errors.map((item) => {
                  const checking = actionId === `${item.id}:check`;
                  const retrying = actionId === `${item.id}:retry`;
                  const messageExpanded = expandedErrorIds.has(item.id);

                  return (
                    <tr key={item.id} className="align-top transition hover:bg-sky-50/40">
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${typeTone[item.errorType] || typeTone.UNKNOWN}`}>
                          {item.errorType}
                        </span>
                        <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${statusTone[item.status] || statusTone.WITH_ERROR}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <p className="max-w-56 break-words text-sm font-black text-slate-950">{getErrorTitle(item)}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{item.adAccount?.id || item.tokenLabel || item.tokenId}</p>
                        <ErrorMessagePreview
                          expanded={messageExpanded}
                          recovered={item.status === 'SUCCESS'}
                          message={item.message}
                          onToggle={() => toggleErrorMessage(item.id)}
                        />
                        <div className="mt-2 flex max-w-sm flex-wrap gap-1.5 text-[11px] font-black text-slate-500">
                          {item.partialMeta?.campaignId ? <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">Campaign {item.partialMeta.campaignId}</span> : null}
                          {item.partialMeta?.adSetId ? <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">Ad set {item.partialMeta.adSetId}</span> : null}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <ContextLine label="Brand" value={item.brandName || item.token?.brand?.name} />
                        <ContextLine label="Agency" value={item.agencyName || item.token?.agency?.name} />
                        <ContextLine label="AdsPower" value={item.adsPowerProfile || item.token?.adsPowerProfile} />
                        <ContextLine label="Key" value={item.tokenLabel} />
                      </td>
                      <td className="px-3 py-3">
                        {item.status === 'SUCCESS' ? (
                          <>
                            <p className="text-sm font-black text-emerald-700">Recovered successfully</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {item.successMessage || 'The stopped publish was continued and saved.'}
                            </p>
                            {item.recoveredAt ? (
                              <p className="mt-1 text-xs font-semibold text-emerald-700">Recovered {formatDateTime(item.recoveredAt)}</p>
                            ) : null}
                          </>
                        ) : item.canRetry ? (
                          <>
                            <p className="text-sm font-black text-emerald-700">{item.retryLabel || 'Retry'} ready</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {item.resumeFromStep ? `Continues from ${item.resumeFromStep}` : 'Runs saved retry payload'}
                            </p>
                            {item.queue?.nextAttemptAt ? (
                              <p className="mt-1 text-xs font-semibold text-amber-700">Next auto: {formatDateTime(item.queue.nextAttemptAt)}</p>
                            ) : null}
                          </>
                        ) : item.kind === 'TOKEN' ? (
                          <>
                            <p className="text-sm font-black text-red-700">Update API key</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">Retry rows will pass once access is restored.</p>
                          </>
                        ) : (
                          <p className="text-sm font-semibold text-slate-500">No saved retry payload</p>
                        )}
                        <p className="mt-2 text-xs font-bold text-slate-500">{formatDateTime(item.updatedAt)}</p>
                        {item.queue?.attemptCount ? <p className="mt-1 text-xs font-semibold text-amber-700">Attempts {item.queue.attemptCount}</p> : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailItem(item)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-100 bg-white text-sky-700 transition hover:bg-sky-50"
                            title="View details"
                          >
                            <Eye size={15} />
                          </button>
                          {item.canCheckAccess ? (
                            <button
                              type="button"
                              onClick={() => checkAccess(item)}
                              disabled={Boolean(actionId)}
                              className="inline-flex h-9 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 text-xs font-black uppercase tracking-[0.12em] text-sky-700 transition hover:bg-sky-50 disabled:opacity-50"
                              title="Check token access before retry"
                            >
                              {checking ? <LoaderCircle size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                              Check
                            </button>
                          ) : null}
                          {item.canRetry ? (
                            <button
                              type="button"
                              onClick={() => retryError(item)}
                              disabled={Boolean(actionId)}
                              className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-emerald-700 disabled:opacity-50"
                              title="Continue or retry this stopped publish"
                            >
                              {retrying ? <LoaderCircle size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                              {item.retryLabel || 'Retry'}
                            </button>
                          ) : item.status === 'SUCCESS' ? (
                            <span className="inline-flex h-9 items-center rounded-xl bg-emerald-50 px-3 text-xs font-black uppercase tracking-[0.12em] text-emerald-700">
                              Success
                            </span>
                          ) : item.kind === 'TOKEN' ? (
                            <button
                              type="button"
                              onClick={() => navigate('/meta-connection')}
                              className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-slate-800"
                            >
                              <KeyRound size={14} />
                              Key
                            </button>
                          ) : (
                            <span className="inline-flex h-9 items-center rounded-xl bg-slate-100 px-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                              Saved
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-sky-100 bg-sky-50/80 px-4 py-12 text-center">
            <CheckCircle2 className="mx-auto text-emerald-600" size={34} />
            <p className="mt-3 text-sm font-black text-slate-950">No open errors found</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">When a publish stops or a Meta key is blocked, it will appear here.</p>
          </div>
        )}
      </DashboardPanel>

      {detailItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-sky-100 bg-white p-5 shadow-2xl shadow-slate-900/20">
            <div className="flex items-start justify-between gap-4 border-b border-sky-50 pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Fault details</p>
                <h3 className="mt-2 text-2xl font-black text-slate-950">{getErrorTitle(detailItem)}</h3>
                {detailItem.status === 'SUCCESS' ? (
                  <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">
                    {detailItem.successMessage || 'Recovered successfully'}
                  </p>
                ) : null}
                <p className="mt-2 break-words text-sm font-semibold leading-6 text-red-700">{detailItem.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-100 bg-white text-slate-500 transition hover:bg-sky-50 hover:text-slate-950"
                aria-label="Close details"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <DetailLine label="Error type" value={`${detailItem.errorType} / ${detailItem.status}`} />
              <DetailLine label="Brand" value={detailItem.brandName || detailItem.token?.brand?.name} />
              <DetailLine label="Agency" value={detailItem.agencyName || detailItem.token?.agency?.name} />
              <DetailLine label="AdsPower profile" value={detailItem.adsPowerProfile || detailItem.token?.adsPowerProfile} />
              <DetailLine label="Token key" value={detailItem.tokenLabel || detailItem.token?.label} />
              <DetailLine label="Token id" value={detailItem.tokenId} />
              <DetailLine label="Ad account" value={detailItem.adAccount?.name} />
              <DetailLine label="Ad account id" value={detailItem.adAccount?.id} />
              <DetailLine label="Campaign name" value={detailItem.campaignName} />
              <DetailLine label="Campaign id" value={detailItem.partialMeta?.campaignId || detailItem.campaignId} />
              <DetailLine label="Ad set id" value={detailItem.partialMeta?.adSetId} />
              <DetailLine label="Creative id" value={detailItem.partialMeta?.creativeId} />
              <DetailLine label="Ad id" value={detailItem.partialMeta?.adId} />
              <DetailLine label="Page" value={detailItem.page?.name || detailItem.page?.id} />
              <DetailLine label="Pixel" value={detailItem.pixel?.name || detailItem.pixel?.id} />
              <DetailLine label="Resume step" value={detailItem.resumeFromStep} />
              <DetailLine label="Recovered at" value={detailItem.recoveredAt ? formatDateTime(detailItem.recoveredAt) : ''} />
              <DetailLine label="Queue status" value={detailItem.queue?.status} />
              <DetailLine label="Queue attempts" value={detailItem.queue?.attemptCount} />
              <DetailLine label="Next retry" value={detailItem.queue?.nextAttemptAt ? formatDateTime(detailItem.queue.nextAttemptAt) : ''} />
              <DetailLine label="Latest action" value={detailItem.latestAction?.action} />
              <DetailLine label="Recovery action" value={detailItem.recoveryAction?.action} />
              <DetailLine label="Latest action time" value={detailItem.latestAction?.at ? formatDateTime(detailItem.latestAction.at) : ''} />
              <DetailLine label="Updated" value={formatDateTime(detailItem.updatedAt)} />
              <DetailLine label="Source" value={detailItem.source} />
              <DetailLine label="Record id" value={detailItem.recordId} />
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {detailItem.canCheckAccess ? (
                <button
                  type="button"
                  onClick={() => checkAccess(detailItem)}
                  disabled={Boolean(actionId)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-xs font-black uppercase tracking-[0.12em] text-sky-700 transition hover:bg-sky-50 disabled:opacity-50"
                >
                  {actionId === `${detailItem.id}:check` ? <LoaderCircle size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                  Check access
                </button>
              ) : null}
              {detailItem.canRetry ? (
                <button
                  type="button"
                  onClick={() => retryError(detailItem)}
                  disabled={Boolean(actionId)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {actionId === `${detailItem.id}:retry` ? <LoaderCircle size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                  {detailItem.retryLabel || 'Retry'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ErrorsPage;
