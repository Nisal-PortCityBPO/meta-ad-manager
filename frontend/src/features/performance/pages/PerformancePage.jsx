import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  BadgeDollarSign,
  BarChart3,
  Download,
  FileText,
  LoaderCircle,
  MousePointerClick,
  Percent,
  PieChart,
  Radio,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import brandLogo from '../../../assets/200m-logo.png';
import { defaultPerformanceFilters, usePerformanceReport } from '../hooks/usePerformanceReport';
import { downloadPerformancePdf } from '../utils/performancePdf';

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-US');

const emptyOptions = {
  brands: [],
  tokens: [],
  adAccounts: [],
  detailLevels: [
    { value: 'campaign', label: 'Campaign Level' },
    { value: 'ad_set', label: 'Ad Set Level' },
    { value: 'ad', label: 'Ad Level' },
  ],
  dateRanges: [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'one_week', label: 'One week' },
    { value: 'one_month', label: 'One month' },
  ],
  selected: defaultPerformanceFilters,
};

const formatMoney = (value, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  } catch {
    return moneyFormatter.format(Number(value) || 0);
  }
};

const formatNumber = (value) => numberFormatter.format(Math.round(Number(value) || 0));
const formatPercent = (value) => `${(Number(value) || 0).toFixed(2)}%`;

const formatDate = (value) => {
  if (!value) {
    return 'Not fetched yet';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const Sparkline = ({ values = [], color = '#0ea5e9' }) => {
  const numericValues = values.map((value) => Number(value) || 0);
  const max = Math.max(...numericValues, 1);
  const points = numericValues.map((value, index) => {
    const x = numericValues.length === 1 ? 60 : (index / (numericValues.length - 1)) * 120;
    const y = 34 - (value / max) * 28;
    return `${x},${Math.max(4, Math.min(34, y))}`;
  });

  return (
    <svg viewBox="0 0 120 38" className="h-11 w-32 overflow-visible" role="img" aria-label="Metric trend">
      <path d={`M ${points.join(' L ')}`} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M ${points.join(' L ')} L 120,38 L 0,38 Z`} fill={color} opacity="0.08" />
    </svg>
  );
};

const MetricCard = ({ icon: Icon, label, value, trend, tone, color }) => (
  <DashboardPanel>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">{label}</p>
        <p className="mt-3 truncate text-3xl font-black text-slate-950">{value}</p>
        <p className="mt-2 text-xs font-semibold text-slate-500">Saved metric variation</p>
      </div>
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
        <Icon size={22} strokeWidth={2.2} />
      </div>
    </div>
    <div className="mt-4">
      <Sparkline values={trend} color={color} />
    </div>
  </DashboardPanel>
);

const SelectField = ({ label, value, onChange, options, placeholder, disabled = false }) => (
  <label className="grid gap-1.5">
    <span className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">{label}</span>
    <select
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="h-12 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value || option.id} value={option.value || option.id}>
          {option.label || option.name}
        </option>
      ))}
    </select>
  </label>
);

const BarChart = ({ title, items = [], currency }) => {
  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);

  return (
    <DashboardPanel title={title}>
      <div className="space-y-4">
        {items.length ? (
          items.map((item) => (
            <div key={item.label} className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-black text-slate-800">{item.label}</p>
                <p className="shrink-0 text-sm font-black text-slate-950">{formatMoney(item.value, currency)}</p>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-sky-50">
                <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(3, (Number(item.value) / max) * 100)}%` }} />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-sky-100 bg-sky-50/70 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            No spend data available.
          </p>
        )}
      </div>
    </DashboardPanel>
  );
};

const StatusBreakdown = ({ items = [] }) => {
  const total = items.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
  const colors = ['#10b981', '#f59e0b', '#ef4444', '#64748b', '#0ea5e9'];
  let currentPercent = 0;
  const gradient = items.length
    ? items
        .map((item, index) => {
          const value = total ? ((Number(item.count) || 0) / total) * 100 : 0;
          const start = currentPercent;
          currentPercent += value;
          return `${colors[index % colors.length]} ${start}% ${currentPercent}%`;
        })
        .join(', ')
    : '#e0f2fe 0% 100%';

  return (
    <DashboardPanel title="Status Breakdown">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div
          className="mx-auto h-44 w-44 shrink-0 rounded-full border-[18px] border-white shadow-inner ring-1 ring-sky-100"
          style={{ background: `conic-gradient(${gradient})` }}
        />
        <div className="min-w-0 flex-1 space-y-3">
          {items.length ? (
            items.map((item, index) => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl bg-sky-50/60 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                  <span className="truncate text-sm font-black text-slate-700">{item.label}</span>
                </div>
                <span className="text-sm font-black text-slate-950">{formatNumber(item.count)}</span>
              </div>
            ))
          ) : (
            <p className="text-sm font-semibold text-slate-500">No status data available.</p>
          )}
        </div>
      </div>
    </DashboardPanel>
  );
};

const DualLineChart = ({ items = [] }) => {
  const max = Math.max(...items.flatMap((item) => [Number(item.clicks) || 0, Number(item.reach) || 0]), 1);
  const buildPath = (key) =>
    items
      .map((item, index) => {
        const x = items.length === 1 ? 250 : (index / (items.length - 1)) * 500;
        const y = 160 - ((Number(item[key]) || 0) / max) * 130;
        return `${index ? 'L' : 'M'} ${x} ${Math.max(12, Math.min(160, y))}`;
      })
      .join(' ');

  return (
    <DashboardPanel title="Clicks And Reach">
      <div className="rounded-2xl bg-sky-50/60 p-4">
        <svg viewBox="0 0 500 180" className="h-56 w-full" role="img" aria-label="Clicks and reach trend">
          <path d="M0 160 H500" stroke="#dbeafe" strokeWidth="2" />
          <path d="M0 110 H500" stroke="#dbeafe" strokeWidth="1" />
          <path d="M0 60 H500" stroke="#dbeafe" strokeWidth="1" />
          {items.length ? (
            <>
              <path d={buildPath('reach')} fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <path d={buildPath('clicks')} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : null}
        </svg>
        <div className="flex flex-wrap gap-4 text-xs font-black uppercase tracking-[0.14em]">
          <span className="text-blue-700">Clicks</span>
          <span className="text-emerald-700">Reach</span>
        </div>
      </div>
    </DashboardPanel>
  );
};

const CtrComparison = ({ items = [] }) => {
  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);

  return (
    <DashboardPanel title="CTR Comparison">
      <div className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_80px] items-center gap-3">
              <p className="truncate text-sm font-black text-slate-700">{item.label}</p>
              <p className="text-right text-sm font-black text-slate-950">{formatPercent(item.value)}</p>
              <div className="col-span-2 h-3 overflow-hidden rounded-full bg-violet-50">
                <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(3, (Number(item.value) / max) * 100)}%` }} />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-sky-100 bg-sky-50/70 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            No CTR data available.
          </p>
        )}
      </div>
    </DashboardPanel>
  );
};

const ImpressionPieChart = ({ items = [] }) => {
  const total = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const colors = ['#0ea5e9', '#2563eb', '#10b981', '#7c3aed', '#f59e0b', '#ef4444', '#64748b'];
  let currentPercent = 0;
  const gradient = items.length
    ? items
        .map((item, index) => {
          const value = total ? ((Number(item.value) || 0) / total) * 100 : 0;
          const start = currentPercent;
          currentPercent += value;
          return `${colors[index % colors.length]} ${start}% ${currentPercent}%`;
        })
        .join(', ')
    : '#e0f2fe 0% 100%';

  return (
    <DashboardPanel title="Impressions Share">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="relative mx-auto h-44 w-44 shrink-0 rounded-full shadow-inner ring-1 ring-sky-100" style={{ background: `conic-gradient(${gradient})` }}>
          <div className="absolute inset-10 flex flex-col items-center justify-center rounded-full bg-white text-center shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Total</p>
            <p className="mt-1 text-lg font-black text-slate-950">{formatNumber(total)}</p>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          {items.length ? (
            items.map((item, index) => {
              const percent = total ? ((Number(item.value) || 0) / total) * 100 : 0;

              return (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl bg-sky-50/60 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                    <span className="truncate text-sm font-black text-slate-700">{item.label}</span>
                  </div>
                  <span className="shrink-0 text-sm font-black text-slate-950">
                    {formatNumber(item.value)} <span className="text-xs text-slate-400">({percent.toFixed(1)}%)</span>
                  </span>
                </div>
              );
            })
          ) : (
            <p className="text-sm font-semibold text-slate-500">No impression data available.</p>
          )}
        </div>
      </div>
    </DashboardPanel>
  );
};

const CampaignBudgetVerticalChart = ({ items = [], currency }) => {
  const visibleItems = items.slice(0, 8);
  const max = Math.max(...visibleItems.map((item) => Number(item.value) || 0), 1);

  return (
    <DashboardPanel title="Campaign Budget Allocation">
      <div className="flex min-h-72 items-end gap-3 overflow-x-auto rounded-2xl bg-sky-50/60 px-4 pb-4 pt-6">
        {visibleItems.length ? (
          visibleItems.map((item, index) => {
            const height = Math.max(10, ((Number(item.value) || 0) / max) * 190);
            const colors = ['bg-sky-500', 'bg-blue-600', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-slate-500'];

            return (
              <div key={`${item.label}-${index}`} className="flex min-w-24 flex-1 flex-col items-center justify-end gap-2">
                <p className="text-center text-xs font-black text-slate-950">{formatMoney(item.value, currency)}</p>
                <div className="flex h-48 w-full items-end justify-center">
                  <div
                    className={`w-12 rounded-t-2xl shadow-sm ${colors[index % colors.length]}`}
                    style={{ height: `${height}px` }}
                    title={`${item.label}: ${formatMoney(item.value, currency)}`}
                  />
                </div>
                <p className="line-clamp-2 min-h-9 text-center text-xs font-bold leading-tight text-slate-600">{item.label}</p>
              </div>
            );
          })
        ) : (
          <p className="m-auto rounded-2xl border border-dashed border-sky-100 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
            No campaign budget data available.
          </p>
        )}
      </div>
    </DashboardPanel>
  );
};

const DetailRowsTable = ({ rows = [], currency }) => (
  <DashboardPanel title="Performance Details">
    <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-sky-50">
          <thead className="bg-sky-50/80">
            <tr>
              {['Name', 'Status', 'Spend', 'Clicks', 'Reach', 'CTR', 'CPR'].map((heading) => (
                <th key={heading} className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sky-50">
            {rows.slice(0, 25).map((row) => (
              <tr key={`${row.type}-${row.id}`} className="align-top">
                <td className="px-5 py-4">
                  <p className="font-black text-slate-950">{row.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {[row.campaignName, row.adSetName, row.pageName].filter(Boolean).join(' / ') || row.type}
                  </p>
                </td>
                <td className="px-5 py-4">
                  <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-black uppercase tracking-[0.1em] text-sky-700">
                    {row.statusLabel || row.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-sm font-black text-slate-800">{formatMoney(row.spend, currency)}</td>
                <td className="px-5 py-4 text-sm font-black text-slate-800">{formatNumber(row.clicks)}</td>
                <td className="px-5 py-4 text-sm font-black text-slate-800">{formatNumber(row.reach)}</td>
                <td className="px-5 py-4 text-sm font-black text-slate-800">{formatPercent(row.ctr)}</td>
                <td className="px-5 py-4 text-sm font-black text-slate-800">{formatMoney(row.cpr, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? (
        <p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">No saved performance rows for this selection.</p>
      ) : null}
    </div>
  </DashboardPanel>
);

const PerformancePage = () => {
  const [filters, setFilters] = useState(defaultPerformanceFilters);
  const [pdfLoading, setPdfLoading] = useState(false);
  const { error, loading, reload, report } = usePerformanceReport(filters);
  const options = report?.options || emptyOptions;
  const selected = options.selected || filters;
  const currency = report?.context?.currency || 'USD';

  const updateFilters = (patch) => {
    setFilters((current) => ({
      ...current,
      ...patch,
    }));
  };

  const handleDownloadPdf = async () => {
    if (!report) {
      return;
    }

    setPdfLoading(true);
    try {
      await downloadPerformancePdf(report, brandLogo);
      toast.success('Performance PDF downloaded');
    } catch (requestError) {
      toast.error(requestError.message || 'Could not generate PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const summary = report?.summary || {
    spend: 0,
    clicks: 0,
    reach: 0,
    ctr: 0,
    trends: {
      spend: [],
      clicks: [],
      reach: [],
      ctr: [],
    },
  };
  const charts = report?.charts || {
    topSpend: [],
    statusBreakdown: [],
    clicksReach: [],
    ctrComparison: [],
    campaignBudget: [],
    impressionBreakdown: [],
  };
  const rows = report?.rows || [];

  return (
    <div>
      <DashboardHeader
        title="Performance"
        description="Analyze saved Meta performance snapshots by brand, token key, ad account, level, and date range."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => reload({ showLoading: true })}
              className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
            >
              <RefreshCw size={17} strokeWidth={2.2} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!report || pdfLoading}
              className="flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {pdfLoading ? <LoaderCircle size={17} className="animate-spin" /> : <Download size={17} strokeWidth={2.2} />}
              Download PDF
            </button>
          </div>
        }
      />

      {error ? <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <DashboardPanel title="Performance Overview">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SelectField
            label="Brand"
            value={selected.brandId}
            onChange={(value) => updateFilters({ brandId: value, tokenId: '', adAccountKey: '' })}
            options={options.brands}
            placeholder="Select brand"
            disabled={loading}
          />
          <SelectField
            label="Token Key"
            value={selected.tokenId}
            onChange={(value) => updateFilters({ tokenId: value, adAccountKey: '' })}
            options={options.tokens}
            placeholder="Select token"
            disabled={loading || !options.tokens.length}
          />
          <SelectField
            label="Ad Account"
            value={selected.adAccountKey}
            onChange={(value) => updateFilters({ adAccountKey: value })}
            options={options.adAccounts.map((account) => ({ value: account.value, label: account.name }))}
            placeholder="Select ad account"
            disabled={loading || !options.adAccounts.length}
          />
          <SelectField
            label="Detail Level"
            value={selected.detailLevel}
            onChange={(value) => updateFilters({ detailLevel: value })}
            options={options.detailLevels}
            placeholder="Select level"
            disabled={loading}
          />
          <SelectField
            label="Date Range"
            value={selected.dateRange}
            onChange={(value) => updateFilters({ dateRange: value })}
            options={options.dateRanges}
            placeholder="Select range"
            disabled={loading}
          />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-2xl bg-sky-50/70 px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-sky-700">
              <FileText size={15} strokeWidth={2.2} />
              Scope
            </p>
            <p className="mt-2 text-sm font-bold text-slate-800">
              {report?.context?.socialAccount?.name || 'No social account'} / {report?.context?.businessProfile?.name || 'No business profile'}
            </p>
          </div>
          <div className="rounded-2xl bg-sky-50/70 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">AdsPower profile</p>
            <p className="mt-2 text-sm font-bold text-slate-800">{report?.context?.token?.adsPowerProfile || 'Not available'}</p>
          </div>
          <div className="rounded-2xl bg-sky-50/70 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Last fetched</p>
            <p className="mt-2 text-sm font-bold text-slate-800">{formatDate(report?.context?.lastFetchedAt)}</p>
          </div>
        </div>
      </DashboardPanel>

      {loading ? (
        <div className="mt-4 h-96 animate-pulse rounded-2xl bg-sky-50" />
      ) : (
        <>
          <div className="mt-4 grid gap-4 xl:grid-cols-4">
            <MetricCard
              icon={BadgeDollarSign}
              label="Spend"
              value={formatMoney(summary.spend, currency)}
              trend={summary.trends?.spend}
              tone="bg-sky-50 text-sky-700"
              color="#0ea5e9"
            />
            <MetricCard
              icon={MousePointerClick}
              label="Clicks"
              value={formatNumber(summary.clicks)}
              trend={summary.trends?.clicks}
              tone="bg-blue-50 text-blue-700"
              color="#2563eb"
            />
            <MetricCard
              icon={Radio}
              label="Reach"
              value={formatNumber(summary.reach)}
              trend={summary.trends?.reach}
              tone="bg-emerald-50 text-emerald-700"
              color="#10b981"
            />
            <MetricCard
              icon={Percent}
              label="CTR"
              value={formatPercent(summary.ctr)}
              trend={summary.trends?.ctr}
              tone="bg-violet-50 text-violet-700"
              color="#7c3aed"
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <BarChart title="Spend Leaders" items={charts.topSpend} currency={currency} />
            <StatusBreakdown items={charts.statusBreakdown} />
            <DualLineChart items={charts.clicksReach} />
            <CtrComparison items={charts.ctrComparison} />
            <ImpressionPieChart items={charts.impressionBreakdown} />
            <CampaignBudgetVerticalChart items={charts.campaignBudget} currency={currency} />
          </div>

          <div className="mt-4">
            <DetailRowsTable rows={rows} currency={currency} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <DashboardPanel>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                  <BarChart3 size={20} strokeWidth={2.2} />
                </span>
                <div>
                  <p className="text-sm font-black text-slate-950">{rows.length} rows analyzed</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{report?.context?.detailLevel?.label || 'Campaign Level'}</p>
                </div>
              </div>
            </DashboardPanel>
            <DashboardPanel>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                  <PieChart size={20} strokeWidth={2.2} />
                </span>
                <div>
                  <p className="text-sm font-black text-slate-950">{report?.context?.dateRange?.label || 'One week'}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Selected report range</p>
                </div>
              </div>
            </DashboardPanel>
            <DashboardPanel>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <TrendingUp size={20} strokeWidth={2.2} />
                </span>
                <div>
                  <p className="text-sm font-black text-slate-950">{report?.context?.dataWindowNote}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Analytics source</p>
                </div>
              </div>
            </DashboardPanel>
          </div>
        </>
      )}
    </div>
  );
};

export default PerformancePage;
