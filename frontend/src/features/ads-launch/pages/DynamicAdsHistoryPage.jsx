import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  LoaderCircle,
  Megaphone,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { adsManageApi } from '../../ads-manage/api/adsManageApi';
import { useTokens } from '../../token-management/hooks/useTokens';

const statusOptions = [
  { value: '', label: 'All states' },
  { value: 'SUCCESS', label: 'Successful' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'PENDING', label: 'Pending queue' },
  { value: 'BLOCKED', label: 'Blocked queue' },
];

const limitOptions = [10, 25, 50];

const zeroDecimalCurrencies = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'IDR',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

const numberFormatter = new Intl.NumberFormat('en');
const currencyFormatter = new Intl.NumberFormat('en', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const historyTone = {
  SUCCESS: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  PAUSED: 'bg-amber-50 text-amber-700 ring-amber-100',
  FAILED: 'bg-red-50 text-red-700 ring-red-100',
  DELETED: 'bg-red-50 text-red-700 ring-red-100',
  RETRIED: 'bg-sky-50 text-sky-700 ring-sky-100',
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-100',
  BLOCKED: 'bg-orange-50 text-orange-700 ring-orange-100',
  RUNNING: 'bg-sky-50 text-sky-700 ring-sky-100',
};

const formatDateTime = (value) => {
  if (!value) {
    return 'Not saved';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const formatShortId = (value) => {
  const text = String(value || '').trim();

  if (!text) {
    return 'Not saved';
  }

  if (text.length <= 22) {
    return text;
  }

  return `${text.slice(0, 8)}...${text.slice(-8)}`;
};

const formatBudget = (item) => {
  const budget = item.budget || {};
  const currency = budget.currency || item.adAccount?.currency || '';
  const rawAmount = budget.amount || item.launch?.dailyBudget;

  if (!rawAmount) {
    return 'Not saved';
  }

  const divisor = budget.amount ? (zeroDecimalCurrencies.has(currency) ? 1 : 100) : 1;
  const amount = Number(rawAmount) / divisor;

  if (!Number.isFinite(amount)) {
    return String(rawAmount);
  }

  return `${budget.type || 'Ad set daily'} ${currencyFormatter.format(amount)} ${currency}`.trim();
};

const DetailLine = ({ label, value }) => (
  <div className="rounded-xl bg-sky-50/70 px-3 py-2">
    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
    <p className="mt-1 break-words text-sm font-bold text-slate-800">{value || 'Not saved'}</p>
  </div>
);

const StatCard = ({ icon: Icon, label, value, tone = 'sky', detail }) => {
  const tones = {
    sky: 'bg-sky-50 text-sky-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
  };

  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/70">
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone] || tones.sky}`}>
          <Icon size={19} strokeWidth={2.4} />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{numberFormatter.format(Number(value || 0))}</p>
        </div>
      </div>
      {detail ? <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
};

const StatusBadge = ({ value }) => {
  const status = String(value || 'UNKNOWN').toUpperCase();

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${historyTone[status] || 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
      {status}
    </span>
  );
};

const MiniLine = ({ label, value }) =>
  value ? (
    <p className="truncate text-xs font-semibold text-slate-500">
      <span className="font-black text-slate-700">{label}:</span> {value}
    </p>
  ) : null;

const DynamicAdsHistoryPage = () => {
  const { tokens } = useTokens();
  const [filters, setFilters] = useState({
    tokenId: '',
    brandId: '',
    status: '',
    search: '',
    page: 1,
    limit: 25,
  });
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    success: 0,
    failed: 0,
    active: 0,
    paused: 0,
    queued: 0,
    adAccounts: 0,
    brands: 0,
    bulks: 0,
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [detailItem, setDetailItem] = useState(null);

  const brandOptions = useMemo(() => {
    const brandsById = new Map();

    tokens.forEach((token) => {
      if (!token.brand?.id || brandsById.has(token.brand.id)) {
        return;
      }

      brandsById.set(token.brand.id, {
        id: token.brand.id,
        name: token.brand.name || token.brand.id,
      });
    });

    return Array.from(brandsById.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [tokens]);

  const updateFilter = (field, value) => {
    setFilters((current) => ({
      ...current,
      [field]: value,
      page: field === 'page' ? value : 1,
    }));
  };

  const loadHistory = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const data = await adsManageApi.getDynamicHistory(filters);
      setHistory(data.history || []);
      setSummary(data.summary || {});
      setPagination(data.pagination || { page: filters.page, limit: filters.limit, total: 0, pages: 1 });
    } catch (requestError) {
      toast.error(requestError.message);
      setHistory([]);
      setSummary({});
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadHistory();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [filters.tokenId, filters.brandId, filters.status, filters.search, filters.page, filters.limit]);

  const pageStart = pagination.total ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const pageEnd = Math.min((pagination.page || 1) * (pagination.limit || 25), pagination.total || 0);

  return (
    <div>
      <DashboardHeader
        title="Dynamic Ads History"
        description="Review every dynamic ad publish saved in Mongo, including the selected campaign template, media template, media asset, page, pixel, Meta IDs, errors, and queue state."
        action={
          <button
            type="button"
            onClick={() => loadHistory()}
            disabled={loading}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={17} />}
            Refresh
          </button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Database} label="History rows" value={summary.total} detail="Saved dynamic campaign rows" />
        <StatCard icon={Megaphone} label="Bulk launches" value={summary.bulks} tone="sky" detail={`${summary.queued || 0} queued rows`} />
        <StatCard icon={CheckCircle2} label="Successful" value={summary.success} tone="emerald" />
        <StatCard icon={AlertTriangle} label="Failed" value={summary.failed} tone="red" />
        <StatCard icon={BarChart3} label="Ad accounts" value={summary.adAccounts} tone="slate" detail={`${summary.active || 0} active, ${summary.paused || 0} paused`} />
      </div>

      <DashboardPanel className="mb-4">
        <div className="grid gap-3 xl:grid-cols-[1.3fr_1fr_1fr_1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={17} />
            <input
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              className="h-11 w-full rounded-xl border border-sky-100 bg-white pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              placeholder="Search bulk, campaign, account, template, media, Meta id..."
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
            value={filters.brandId}
            onChange={(event) => updateFilter('brandId', event.target.value)}
            className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          >
            <option value="">All brands</option>
            {brandOptions.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
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
          <select
            value={filters.limit}
            onChange={(event) => updateFilter('limit', Number(event.target.value))}
            className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          >
            {limitOptions.map((limit) => (
              <option key={limit} value={limit}>
                {limit} rows
              </option>
            ))}
          </select>
        </div>
      </DashboardPanel>

      <DashboardPanel
        title="Saved dynamic publish history"
        headerAction={
          <div className="flex items-center gap-2">
            <span className="hidden rounded-lg bg-sky-50 px-3 py-2 text-xs font-black text-slate-500 sm:inline-flex">
              Showing {pageStart}-{pageEnd} of {pagination.total || 0}
            </span>
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
            Loading dynamic ads history
          </div>
        ) : history.length ? (
          <div className="overflow-x-auto rounded-2xl border border-sky-100">
            <table className="min-w-[1340px] w-full divide-y divide-sky-100 bg-white text-left">
              <thead className="bg-sky-50/80">
                <tr className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Bulk</th>
                  <th className="px-3 py-3">Launch / status</th>
                  <th className="px-3 py-3">Ad account / brand</th>
                  <th className="px-3 py-3">Templates / media</th>
                  <th className="px-3 py-3">Meta objects</th>
                  <th className="px-3 py-3">Setup</th>
                  <th className="px-3 py-3 text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-50">
                {history.map((item, index) => {
                  const rowNumber = pageStart + index;

                  return (
                    <tr key={item.id} className="align-top transition hover:bg-sky-50/40">
                      <td className="px-3 py-3 text-sm font-black text-slate-400">{rowNumber}</td>
                      <td className="px-3 py-3">
                        <p className="max-w-48 break-words text-sm font-black text-slate-950">
                          {item.launch?.bulkLabel || item.launch?.launchLabel || 'Bulk launch'}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{formatShortId(item.launch?.bulkId)}</p>
                        {item.launch?.bulkSource ? (
                          <span className="mt-2 inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-700">
                            {item.launch.bulkSource}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <p className="max-w-64 break-words text-sm font-black text-slate-950">{item.campaignName || item.launch?.launchLabel}</p>
                        <p className="mt-1 max-w-64 break-words text-xs font-semibold text-slate-500">{item.launch?.launchLabel || 'Dynamic launch'}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <StatusBadge value={item.historyStatus} />
                          <StatusBadge value={item.status} />
                          {item.queue?.status && item.queue.status !== 'NONE' ? <StatusBadge value={item.queue.status} /> : null}
                        </div>
                        {item.lastMetaError ? (
                          <p className="mt-2 line-clamp-2 max-w-72 text-xs font-semibold leading-5 text-red-700">{item.lastMetaError}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <p className="max-w-56 break-words text-sm font-black text-slate-950">{item.adAccount?.name || 'Ad account'}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{item.adAccount?.id || item.adAccount?.accountId || 'Not saved'}</p>
                        <div className="mt-2 space-y-1">
                          <MiniLine label="Brand" value={item.brandName} />
                          <MiniLine label="Agency" value={item.agencyName} />
                          <MiniLine label="Key" value={item.tokenLabel} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <MiniLine label="Campaign template" value={formatShortId(item.launch?.campaignTemplateId)} />
                          <MiniLine label="Media template" value={formatShortId(item.launch?.mediaTemplateId)} />
                          <MiniLine label="Launch item" value={item.launch?.launchItemId || 'primary'} />
                          <MiniLine label="Media" value={item.launch?.media?.name || formatShortId(item.launch?.mediaAssetId)} />
                          <MiniLine label="Thumbnail" value={item.launch?.thumbnail?.name || formatShortId(item.launch?.thumbnailAssetId)} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <MiniLine label="Campaign" value={formatShortId(item.meta?.campaignId || item.campaignId)} />
                          <MiniLine label="Ad set" value={formatShortId(item.meta?.adSetId)} />
                          <MiniLine label="Creative" value={formatShortId(item.meta?.creativeId)} />
                          <MiniLine label="Ad" value={formatShortId(item.meta?.adId)} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <MiniLine label="Objective" value={item.objective} />
                          <MiniLine label="Budget" value={formatBudget(item)} />
                          <MiniLine label="Countries" value={item.launch?.countryLabel || item.launch?.countries?.join(', ')} />
                          <MiniLine label="Page" value={item.launch?.page?.name || item.launch?.page?.id} />
                          <MiniLine label="Pixel" value={item.launch?.pixel?.name || item.launch?.pixel?.id} />
                          <MiniLine label="Updated" value={formatDateTime(item.updatedAt)} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setDetailItem(item)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-100 bg-white text-sky-700 transition hover:bg-sky-50"
                            title="View details"
                            aria-label="View details"
                          >
                            <Eye size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-sky-100 bg-sky-50/70 px-4 py-10 text-center">
            <p className="text-sm font-black text-slate-700">No dynamic ads history found</p>
            <p className="mt-2 text-sm font-semibold text-slate-500">Run Dynamic Ads Launch with campaign and media templates, then saved history will appear here.</p>
          </div>
        )}
      </DashboardPanel>

      {detailItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-3 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-sky-100 bg-white p-5 shadow-2xl shadow-slate-900/20">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sky-50 pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Dynamic history detail</p>
                <h3 className="mt-2 max-w-3xl break-words text-2xl font-black text-slate-950">{detailItem.campaignName || detailItem.launch?.launchLabel}</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge value={detailItem.historyStatus} />
                  <StatusBadge value={detailItem.status} />
                  {detailItem.queue?.status && detailItem.queue.status !== 'NONE' ? <StatusBadge value={detailItem.queue.status} /> : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-100 bg-white text-slate-500 transition hover:bg-sky-50 hover:text-slate-900"
                aria-label="Close detail"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <DetailLine label="Ad account" value={`${detailItem.adAccount?.name || ''} ${detailItem.adAccount?.id || ''}`.trim()} />
              <DetailLine label="Brand" value={detailItem.brandName} />
              <DetailLine label="Agency" value={detailItem.agencyName} />
              <DetailLine label="Token key" value={detailItem.tokenLabel} />
              <DetailLine label="AdsPower profile" value={detailItem.adsPowerProfile} />
              <DetailLine label="Bulk label" value={detailItem.launch?.bulkLabel} />
              <DetailLine label="Bulk ID" value={detailItem.launch?.bulkId} />
              <DetailLine label="Bulk source" value={detailItem.launch?.bulkSource} />
              <DetailLine label="Objective" value={detailItem.objective} />
              <DetailLine label="Budget" value={formatBudget(detailItem)} />
              <DetailLine label="Countries" value={detailItem.launch?.countryLabel || detailItem.launch?.countries?.join(', ')} />
              <DetailLine label="Page" value={detailItem.launch?.page?.name || detailItem.launch?.page?.id} />
              <DetailLine label="Pixel" value={detailItem.launch?.pixel?.name || detailItem.launch?.pixel?.id} />
              <DetailLine label="Website event" value={detailItem.launch?.websiteEvent} />
              <DetailLine label="Call to action" value={detailItem.launch?.callToAction} />
              <DetailLine label="Campaign template" value={detailItem.launch?.campaignTemplateId} />
              <DetailLine label="Media template" value={detailItem.launch?.mediaTemplateId} />
              <DetailLine label="Launch item" value={detailItem.launch?.launchItemId || 'primary'} />
              <DetailLine label="Media asset" value={detailItem.launch?.media?.name || detailItem.launch?.mediaAssetId} />
              <DetailLine label="Thumbnail asset" value={detailItem.launch?.thumbnail?.name || detailItem.launch?.thumbnailAssetId} />
              <DetailLine label="Schedule start" value={detailItem.launch?.scheduleStart ? formatDateTime(detailItem.launch.scheduleStart) : ''} />
              <DetailLine label="Schedule end" value={detailItem.launch?.scheduleEnd ? formatDateTime(detailItem.launch.scheduleEnd) : ''} />
              <DetailLine label="Campaign ID" value={detailItem.meta?.campaignId || detailItem.campaignId} />
              <DetailLine label="Ad set ID" value={detailItem.meta?.adSetId} />
              <DetailLine label="Creative ID" value={detailItem.meta?.creativeId} />
              <DetailLine label="Ad ID" value={detailItem.meta?.adId} />
              <DetailLine label="Created" value={formatDateTime(detailItem.createdAt)} />
              <DetailLine label="Updated" value={formatDateTime(detailItem.updatedAt)} />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Copy and URL</p>
                <div className="mt-3 space-y-2 text-sm font-semibold text-slate-700">
                  <p><span className="font-black text-slate-950">Headline:</span> {detailItem.launch?.headline || 'Not saved'}</p>
                  <p><span className="font-black text-slate-950">Primary text:</span> {detailItem.launch?.primaryText || 'Not saved'}</p>
                  <p><span className="font-black text-slate-950">Description:</span> {detailItem.launch?.description || 'Not saved'}</p>
                  <p className="break-words"><span className="font-black text-slate-950">Destination URL:</span> {detailItem.launch?.websiteUrl || 'Not saved'}</p>
                  <p className="break-words"><span className="font-black text-slate-950">Display URL:</span> {detailItem.launch?.displayUrl || 'Not saved'}</p>
                  <p className="break-words"><span className="font-black text-slate-950">URL parameters:</span> {detailItem.launch?.urlParameters || 'Not saved'}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-sky-100 bg-white p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Last actions</p>
                <div className="mt-3 space-y-2">
                  {(detailItem.actionHistory || []).length ? (
                    detailItem.actionHistory.slice(-6).reverse().map((action, index) => (
                      <div key={`${action.action}-${action.at}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-sm font-black text-slate-800">{action.action || 'Action'}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{action.message || action.status || 'No message saved'}</p>
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{formatDateTime(action.at)}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm font-semibold text-slate-500">No actions saved yet.</p>
                  )}
                </div>
              </div>
            </div>

            {detailItem.lastMetaError ? (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-red-700">Last Meta error</p>
                <p className="mt-2 break-words text-sm font-semibold leading-6 text-red-800">{detailItem.lastMetaError}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DynamicAdsHistoryPage;
