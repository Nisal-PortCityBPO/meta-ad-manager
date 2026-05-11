import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  Clock3,
  ClipboardList,
  CopyPlus,
  Edit3,
  FilterX,
  GitBranch,
  KeyRound,
  ListChecks,
  LoaderCircle,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { useAnalysis } from '../hooks/useAnalysis';

const actionStyles = {
  START: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    icon: Play,
    text: 'text-emerald-700',
  },
  PAUSE: {
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    icon: Pause,
    text: 'text-amber-700',
  },
  DUPLICATE: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-100',
    icon: CopyPlus,
    text: 'text-indigo-700',
  },
  KILL: {
    bg: 'bg-red-50',
    border: 'border-red-100',
    icon: ShieldAlert,
    text: 'text-red-700',
  },
};

const getAdStatusStyle = (status = '') => {
  const normalizedStatus = String(status || 'UNKNOWN').toUpperCase();

  if (normalizedStatus.includes('DISAPPROVED') || normalizedStatus.includes('REJECTED')) {
    return {
      badge: 'bg-red-100 text-red-700 ring-red-200',
      card: 'border-red-200 bg-red-50 shadow-red-100',
    };
  }

  if (normalizedStatus.includes('BLOCK') || normalizedStatus.includes('DISABLED') || normalizedStatus.includes('WITH_ISSUES')) {
    return {
      badge: 'bg-orange-100 text-orange-700 ring-orange-200',
      card: 'border-orange-200 bg-orange-50 shadow-orange-100',
    };
  }

  if (['ACTIVE', 'ENABLED'].includes(normalizedStatus)) {
    return {
      badge: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
      card: 'border-emerald-200 bg-emerald-50 shadow-emerald-100',
    };
  }

  if (normalizedStatus.includes('PAUSED')) {
    return {
      badge: 'bg-amber-100 text-amber-700 ring-amber-200',
      card: 'border-amber-200 bg-amber-50 shadow-amber-100',
    };
  }

  if (normalizedStatus.includes('PENDING') || normalizedStatus.includes('REVIEW')) {
    return {
      badge: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
      card: 'border-indigo-200 bg-indigo-50 shadow-indigo-100',
    };
  }

  return {
    badge: 'bg-slate-100 text-slate-700 ring-slate-200',
    card: 'border-slate-200 bg-slate-50 shadow-slate-100',
  };
};

const AD_STATUS_FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'disapproved', label: 'Disapproved' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'review', label: 'In review' },
  { value: 'others', label: 'Others' },
];

const getAdStatusFilterGroup = (status = '') => {
  const normalizedStatus = String(status || 'UNKNOWN').toUpperCase();

  if (normalizedStatus.includes('DISAPPROVED') || normalizedStatus.includes('REJECTED')) {
    return 'disapproved';
  }

  if (normalizedStatus.includes('BLOCK') || normalizedStatus.includes('DISABLED') || normalizedStatus.includes('WITH_ISSUES')) {
    return 'blocked';
  }

  if (normalizedStatus.includes('PENDING') || normalizedStatus.includes('REVIEW')) {
    return 'review';
  }

  if (['ACTIVE', 'ENABLED'].includes(normalizedStatus)) {
    return 'active';
  }

  return 'others';
};

const defaultRuleForm = {
  action: 'PAUSE',
  conditions: [{ metric: 'ctr', operator: 'LT', value: 0.3 }],
  enabled: true,
  logicMode: 'ALL',
  name: '',
};

const AGE_METRIC = 'adAgeHours';
const AGE_UNITS = {
  HOURS: 'hours',
  DAYS: 'days',
};

const numberFormatter = new Intl.NumberFormat('en-US');
const moneyFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 2,
  style: 'currency',
});

const formatMetricValue = (metricConfig, value) => {
  if (metricConfig?.format === 'status') {
    const statusValue = String(value || 'UNKNOWN').trim().toUpperCase();
    const label = metricConfig.options?.find((option) => option.value === statusValue)?.label;
    return label || statusValue.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  const numericValue = Number(value) || 0;

  if (metricConfig?.format === 'currency') {
    return moneyFormatter.format(numericValue);
  }

  if (metricConfig?.format === 'percent') {
    return `${numericValue.toFixed(2)}%`;
  }

  if (metricConfig?.format === 'hours') {
    return `${numericValue.toFixed(1)}h`;
  }

  if (metricConfig?.format === 'decimal') {
    return numericValue.toFixed(2);
  }

  return numberFormatter.format(Math.round(numericValue));
};

const formatAgeValue = (value, unit = AGE_UNITS.HOURS) => {
  const numericValue = Number(value) || 0;

  if (unit === AGE_UNITS.DAYS) {
    return `${numericValue.toFixed(1)} days`;
  }

  return `${numericValue.toFixed(1)} hours`;
};

const formatConditionValue = (metricConfig, condition) => {
  if (condition.metric === AGE_METRIC) {
    return formatAgeValue(condition.value, condition.unit || AGE_UNITS.HOURS);
  }

  return formatMetricValue(metricConfig, condition.value);
};

const formatActualConditionValue = (metricConfig, condition) => {
  if (condition.metric === AGE_METRIC && condition.expectedUnit === AGE_UNITS.DAYS) {
    return formatAgeValue((Number(condition.actualValue) || 0) / 24, AGE_UNITS.DAYS);
  }

  if (condition.metric === AGE_METRIC) {
    return formatAgeValue(condition.actualValue, AGE_UNITS.HOURS);
  }

  return formatMetricValue(metricConfig, condition.actualValue);
};

const formatDatePart = (value) => {
  if (!value) {
    return '--';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
  }).format(new Date(value));
};

const formatTimePart = (value) => {
  if (!value) {
    return '--';
  }

  return new Intl.DateTimeFormat('en', {
    timeStyle: 'short',
  }).format(new Date(value));
};

const getMetricConfig = (metrics, metric) => metrics.find((item) => item.value === metric) || null;
const getOperatorLabel = (operators, operator) => operators.find((item) => item.value === operator)?.label || operator;
const getOperatorsForMetric = (operators, metricConfig) => {
  if (!metricConfig?.operators?.length) {
    return operators;
  }

  return operators.filter((operator) => metricConfig.operators.includes(operator.value));
};

const getDefaultConditionValue = (metricConfig, currentValue = 0) => {
  if (metricConfig?.format === 'status') {
    return metricConfig.options?.[0]?.value || 'ACTIVE';
  }

  return Number.isFinite(Number(currentValue)) ? currentValue : 0;
};

const RuleConditionSummary = ({ condition, metrics, operators }) => {
  const metric = getMetricConfig(metrics, condition.metric);

  return (
    <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-700 ring-1 ring-sky-100">
      {metric?.label || condition.metric} {getOperatorLabel(operators, condition.operator)} {formatConditionValue(metric, condition)}
    </span>
  );
};

const RecommendationCard = ({ recommendation, metrics }) => {
  const statusStyle = getAdStatusStyle(recommendation.ad.status);
  const metricItems = [
    ['Spend', 'spend'],
    ['Clicks', 'clicks'],
    ['CTR', 'ctr'],
    ['Impressions', 'impressions'],
    ['Results', 'results'],
    ['CPR', 'cpr'],
    ['Frequency', 'frequency'],
  ];

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${statusStyle.card}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-950">{recommendation.ad.name}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {recommendation.ad.context.campaign.name} / {recommendation.ad.context.adSet.name}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.1em] ring-1 ${statusStyle.badge}`}>
          {recommendation.ad.status}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {metricItems.map(([label, metricKey]) => {
          const metricConfig = getMetricConfig(metrics, metricKey);

          return (
            <div key={metricKey} className="rounded-xl bg-sky-50/70 px-3 py-2">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-sky-700">{label}</p>
              <p className="mt-1 text-sm font-black text-slate-900">
                {formatMetricValue(metricConfig, recommendation.ad.metrics[metricKey])}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Matched rule</p>
        <p className="mt-1 text-sm font-black text-slate-900">{recommendation.rule.name}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {recommendation.matchedConditions.map((condition) => (
            <span
              key={`${condition.metric}-${condition.operator}-${condition.expectedValue}`}
              className={`rounded-full px-2.5 py-1 text-xs font-black ${
                condition.matched ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {condition.summary} ({formatActualConditionValue(getMetricConfig(metrics, condition.metric), condition)})
            </span>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs font-semibold text-slate-500">
        {recommendation.ad.context.socialAccount?.name || 'Unknown social account'} /{' '}
        {recommendation.ad.context.businessProfile.name} / {recommendation.ad.context.adAccount.name}
      </p>
    </div>
  );
};

const getTokenFilterKey = (recommendation) =>
  recommendation.ad.context.token?.key ||
  recommendation.ad.context.token?.id ||
  recommendation.ad.context.token?.label ||
  'unknown-token';

const getAdAccountFilterKey = (recommendation) =>
  recommendation.ad.context.adAccount?.key ||
  recommendation.ad.context.adAccount?.id ||
  recommendation.ad.context.adAccount?.name ||
  'unknown-ad-account';

const getRecommendationRenderKey = (recommendation) =>
  [
    recommendation.action,
    recommendation.rule?.id || 'rule',
    recommendation.ad.context.businessProfile?.id || recommendation.ad.context.businessProfile?.name || 'profile',
    recommendation.ad.context.adAccount?.key || recommendation.ad.context.adAccount?.id || recommendation.ad.context.adAccount?.name || 'ad-account',
    recommendation.ad.context.campaign?.id || recommendation.ad.context.campaign?.name || 'campaign',
    recommendation.ad.context.adSet?.id || recommendation.ad.context.adSet?.name || 'ad-set',
    recommendation.ad.id || recommendation.ad.name || 'ad',
    recommendation.ad.statusGroup || recommendation.ad.status || 'status',
  ].join(':');

const getFallbackFilterOptions = (categories, type) => {
  const options = new Map();

  categories.forEach((category) => {
    category.recommendations.forEach((recommendation) => {
      if (type === 'token') {
        const token = recommendation.ad.context.token;
        const value = getTokenFilterKey(recommendation);

        if (!options.has(value)) {
          options.set(value, {
            adsPowerProfile: token?.adsPowerProfile || '',
            label: token?.label || 'Unknown token',
            value,
          });
        }
      }

      if (type === 'adAccount') {
        const adAccount = recommendation.ad.context.adAccount;
        const value = getAdAccountFilterKey(recommendation);
        const tokenValue = getTokenFilterKey(recommendation);

        if (!options.has(value)) {
          options.set(value, {
            label: adAccount?.name || 'Unknown ad account',
            tokenValue,
            tokenValues: tokenValue ? [tokenValue] : [],
            value,
          });
        } else if (tokenValue && !options.get(value).tokenValues.includes(tokenValue)) {
          options.get(value).tokenValues.push(tokenValue);
        }
      }

      if (type === 'rule') {
        const rule = recommendation.rule;

        if (rule?.id && !options.has(rule.id)) {
          options.set(rule.id, {
            action: rule.action,
            label: rule.name,
            value: rule.id,
          });
        }
      }
    });
  });

  return Array.from(options.values()).sort((first, second) => first.label.localeCompare(second.label));
};

const BreakdownSummaryCard = ({ icon: Icon, items, title, tone = 'bg-sky-50 text-sky-700' }) => (
  <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-50">
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">{title}</p>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon size={18} strokeWidth={2.2} />
      </span>
    </div>
    <div className={`grid gap-2 rounded-xl bg-sky-50/70 px-3 py-2`} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => (
        <span key={item.label} className="text-center text-[10px] font-black uppercase leading-4 tracking-[0.1em] text-sky-700">
          {item.label}
        </span>
      ))}
      {items.map((item) => (
        <span key={`${item.label}-${item.value}`} className={`text-center text-lg font-black ${item.color || 'text-slate-950'}`}>
          {item.value}
        </span>
      ))}
    </div>
  </div>
);

const getUniqueRecommendedAdCount = (categories) => {
  const adKeys = new Set();

  categories.forEach((category) => {
    category.recommendations.forEach((recommendation) => {
      const adAccountKey = getAdAccountFilterKey(recommendation);
      adKeys.add(`${adAccountKey}:${recommendation.ad.id}`);
    });
  });

  return adKeys.size;
};

const EvaluatedAdsSummaryCard = ({ applied, notApplied, total }) => (
  <BreakdownSummaryCard
    icon={ClipboardList}
    items={[
      { color: 'text-slate-950', label: 'Total ads', value: numberFormatter.format(total || 0) },
      { color: 'text-emerald-700', label: 'Rules applied', value: numberFormatter.format(applied || 0) },
      { color: 'text-amber-700', label: 'Rules not applied', value: numberFormatter.format(notApplied || 0) },
    ]}
    title="Evaluated ads"
    tone="bg-sky-50 text-sky-700"
  />
);

const RecommendationsTab = ({ recommendations }) => {
  const [filters, setFilters] = useState({
    adAccount: 'all',
    rule: 'all',
    status: 'all',
    token: 'all',
  });
  const categories = recommendations.categories || [];
  const tokenOptions = recommendations.filters?.tokens?.length
    ? recommendations.filters.tokens
    : getFallbackFilterOptions(categories, 'token');
  const adAccountOptions = recommendations.filters?.adAccounts?.length
    ? recommendations.filters.adAccounts
    : getFallbackFilterOptions(categories, 'adAccount');
  const visibleAdAccountOptions = filters.token === 'all'
    ? adAccountOptions
    : adAccountOptions.filter((adAccount) => {
        const tokenValues = Array.isArray(adAccount.tokenValues)
          ? adAccount.tokenValues
          : [adAccount.tokenValue].filter(Boolean);

        return tokenValues.includes(filters.token);
      });
  const ruleOptions = recommendations.filters?.rules?.length
    ? recommendations.filters.rules
    : getFallbackFilterOptions(categories, 'rule');
  const tokenCount = recommendations.summary?.tokenCount ?? tokenOptions.length;
  const tokenConnectedCount = recommendations.summary?.tokenConnectedCount ?? 0;
  const tokenBlockedCount = recommendations.summary?.tokenBlockedCount ?? Math.max(0, tokenCount - tokenConnectedCount);
  const adAccountCount = recommendations.summary?.adAccountCount ?? adAccountOptions.length;
  const adAccountActiveCount = recommendations.summary?.adAccountActiveCount ?? 0;
  const adAccountBlockedCount = recommendations.summary?.adAccountBlockedCount ?? Math.max(0, adAccountCount - adAccountActiveCount);
  const ruleCountsByAction = recommendations.summary?.ruleCountsByAction || {};
  const totalAdCount = recommendations.summary?.totalAdCount ?? recommendations.inventoryCount ?? 0;
  const rulesAppliedAdCount = recommendations.summary?.rulesAppliedAdCount ?? getUniqueRecommendedAdCount(categories);
  const rulesNotAppliedAdCount =
    recommendations.summary?.rulesNotAppliedAdCount ?? Math.max(0, totalAdCount - rulesAppliedAdCount);
  const filteredCategories = categories.map((category) => ({
    ...category,
    recommendations: category.recommendations.filter((recommendation) => {
      const tokenMatches = filters.token === 'all' || getTokenFilterKey(recommendation) === filters.token;
      const adAccountMatches = filters.adAccount === 'all' || getAdAccountFilterKey(recommendation) === filters.adAccount;
      const ruleMatches = filters.rule === 'all' || recommendation.rule.id === filters.rule;
      const recommendationStatusGroup = recommendation.ad.statusGroup || getAdStatusFilterGroup(recommendation.ad.status);
      const statusMatches = filters.status === 'all' || recommendationStatusGroup === filters.status;

      return tokenMatches && adAccountMatches && ruleMatches && statusMatches;
    }),
  }));
  const hasActiveFilters = filters.token !== 'all' || filters.adAccount !== 'all' || filters.rule !== 'all' || filters.status !== 'all';

  const updateFilter = (field, value) => {
    setFilters((current) => ({
      ...current,
      [field]: value,
      ...(field === 'token' ? { adAccount: 'all' } : {}),
    }));
  };

  const clearFilters = () => {
    setFilters({
      adAccount: 'all',
      rule: 'all',
      status: 'all',
      token: 'all',
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <BreakdownSummaryCard
          icon={KeyRound}
          items={[
            { color: 'text-slate-950', label: 'Total tokens', value: numberFormatter.format(tokenCount) },
            { color: 'text-emerald-700', label: 'Connected', value: numberFormatter.format(tokenConnectedCount) },
            { color: 'text-red-700', label: 'Blocked', value: numberFormatter.format(tokenBlockedCount) },
          ]}
          title="Token"
          tone="bg-cyan-50 text-cyan-700"
        />
        <BreakdownSummaryCard
          icon={Megaphone}
          items={[
            { color: 'text-slate-950', label: 'Total accounts', value: numberFormatter.format(adAccountCount) },
            { color: 'text-emerald-700', label: 'Active', value: numberFormatter.format(adAccountActiveCount) },
            { color: 'text-red-700', label: 'Blocked', value: numberFormatter.format(adAccountBlockedCount) },
          ]}
          title="Ad account"
          tone="bg-indigo-50 text-indigo-700"
        />
        <EvaluatedAdsSummaryCard
          applied={rulesAppliedAdCount}
          notApplied={rulesNotAppliedAdCount}
          total={totalAdCount}
        />
        <BreakdownSummaryCard
          icon={ListChecks}
          items={[
            { color: 'text-emerald-700', label: 'Start', value: numberFormatter.format(ruleCountsByAction.START || 0) },
            { color: 'text-amber-700', label: 'Pause', value: numberFormatter.format(ruleCountsByAction.PAUSE || 0) },
            { color: 'text-indigo-700', label: 'Duplicate', value: numberFormatter.format(ruleCountsByAction.DUPLICATE || 0) },
            { color: 'text-red-700', label: 'Kill', value: numberFormatter.format(ruleCountsByAction.KILL || 0) },
          ]}
          title="Active rules"
          tone="bg-emerald-50 text-emerald-700"
        />
        <BreakdownSummaryCard
          icon={Clock3}
          items={[
            { color: 'text-slate-950', label: 'Date', value: formatDatePart(recommendations.generatedAt) },
            { color: 'text-slate-950', label: 'Time', value: formatTimePart(recommendations.generatedAt) },
            { color: recommendations.generatedAt ? 'text-emerald-700' : 'text-amber-700', label: 'Status', value: recommendations.generatedAt ? 'Done' : 'Pending' },
          ]}
          title="Last analysis"
          tone="bg-amber-50 text-amber-700"
        />
      </div>

      <DashboardPanel>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,1fr)_auto]">
          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Token</span>
            <select
              value={filters.token}
              onChange={(event) => updateFilter('token', event.target.value)}
              className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              <option value="all">All tokens</option>
              {tokenOptions.map((token) => (
                <option key={token.value} value={token.value}>
                  {token.adsPowerProfile ? `${token.label} / ${token.adsPowerProfile}` : token.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Ad account</span>
            <select
              value={filters.adAccount}
              onChange={(event) => updateFilter('adAccount', event.target.value)}
              className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              <option value="all">All ad accounts</option>
              {visibleAdAccountOptions.map((adAccount) => (
                <option key={adAccount.value} value={adAccount.value}>
                  {adAccount.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Ad status</span>
            <select
              value={filters.status}
              onChange={(event) => updateFilter('status', event.target.value)}
              className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              <option value="all">All statuses</option>
              {AD_STATUS_FILTERS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Active rules</span>
            <select
              value={filters.rule}
              onChange={(event) => updateFilter('rule', event.target.value)}
              className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              <option value="all">All active rules</option>
              {ruleOptions.map((rule) => (
                <option key={rule.value} value={rule.value}>
                  {rule.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="flex h-11 items-center justify-center gap-2 self-end rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FilterX size={17} strokeWidth={2.2} />
            Clear
          </button>
        </div>
      </DashboardPanel>

      <div className="grid gap-4 xl:grid-cols-2">
        {filteredCategories.map((category) => {
          const style = actionStyles[category.value] || actionStyles.PAUSE;
          const Icon = style.icon;
          const visibleRecommendations = category.recommendations;

          return (
            <DashboardPanel key={category.value}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${style.bg} ${style.text}`}>
                    <Icon size={20} strokeWidth={2.2} />
                  </span>
                  <div>
                    <p className="text-lg font-black text-slate-950">{category.label}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{category.description}</p>
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${style.bg} ${style.text}`}>
                  {visibleRecommendations.length} matches
                </span>
              </div>

              <div className="max-h-[38rem] space-y-3 overflow-y-auto pr-1">
                {visibleRecommendations.length ? (
                  visibleRecommendations.map((recommendation) => (
                    <RecommendationCard
                      key={getRecommendationRenderKey(recommendation)}
                      recommendation={recommendation}
                      metrics={recommendations.metrics || []}
                    />
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-sky-100 bg-sky-50/70 px-5 py-8 text-center text-sm font-semibold text-slate-500">
                    No ads match this action right now.
                  </p>
                )}
              </div>
            </DashboardPanel>
          );
        })}
      </div>
    </div>
  );
};

const RuleForm = ({ config, editingRule, onCancel, onSave, saving }) => {
  const [form, setForm] = useState(editingRule || defaultRuleForm);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateCondition = (index, field, value) => {
    setForm((current) => ({
      ...current,
      conditions: current.conditions.map((condition, conditionIndex) => {
        if (conditionIndex !== index) {
          return condition;
        }

        if (field === 'metric') {
          const metricConfig = getMetricConfig(config.metrics, value);
          const availableOperators = getOperatorsForMetric(config.operators, metricConfig);
          const currentOperatorAllowed = availableOperators.some((operator) => operator.value === condition.operator);
          const nextCondition = {
            ...condition,
            metric: value,
            operator: currentOperatorAllowed ? condition.operator : availableOperators[0]?.value || condition.operator,
            value: getDefaultConditionValue(metricConfig, condition.value),
          };

          if (value === AGE_METRIC) {
            nextCondition.unit = condition.unit || AGE_UNITS.HOURS;
          } else {
            delete nextCondition.unit;
          }

          return nextCondition;
        }

        return {
          ...condition,
          [field]: value,
        };
      }),
    }));
  };

  const addCondition = () => {
    setForm((current) => ({
      ...current,
      conditions: [...current.conditions, { metric: 'impressions', operator: 'GTE', value: 1000 }],
    }));
  };

  const removeCondition = (index) => {
    setForm((current) => ({
      ...current,
      conditions: current.conditions.filter((_, conditionIndex) => conditionIndex !== index),
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave({
      ...form,
      conditions: form.conditions.map((condition) => {
        const metricConfig = getMetricConfig(config.metrics, condition.metric);

        return {
          ...condition,
          unit: condition.metric === AGE_METRIC ? condition.unit || AGE_UNITS.HOURS : undefined,
          value: metricConfig?.format === 'status' ? String(condition.value || 'UNKNOWN').trim().toUpperCase() : Number(condition.value),
        };
      }),
    });
  };

  return (
    <DashboardPanel title={editingRule?.id ? 'Edit Rule' : 'Add Rule'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_180px_180px_auto]">
          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Rule name</span>
            <input
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              placeholder="Kill low CTR with impressions"
              required
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Action</span>
            <select
              value={form.action}
              onChange={(event) => updateField('action', event.target.value)}
              className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              {config.actions.map((action) => (
                <option key={action.value} value={action.value}>
                  {action.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Logic</span>
            <select
              value={form.logicMode}
              onChange={(event) => updateField('logicMode', event.target.value)}
              className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              {config.logicModes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-end gap-2 rounded-xl bg-sky-50 px-3 py-3 text-sm font-black text-sky-700">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => updateField('enabled', event.target.checked)}
              className="h-4 w-4 rounded border-sky-200 text-sky-600 focus:ring-sky-500"
            />
            Enabled
          </label>
        </div>

        <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">Conditions</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Example: CTR &lt; 0.3 and Impressions &gt;= 1000.</p>
            </div>
            <button
              type="button"
              onClick={addCondition}
              className="flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-bold text-sky-700 ring-1 ring-sky-100 transition hover:bg-sky-50"
            >
              <Plus size={16} strokeWidth={2.2} />
              Add logic
            </button>
          </div>

          <div className="space-y-2">
            {form.conditions.map((condition, index) => {
              const metricConfig = getMetricConfig(config.metrics, condition.metric);
              const availableOperators = getOperatorsForMetric(config.operators, metricConfig);
              const isStatusMetric = metricConfig?.format === 'status';
              const isAgeMetric = condition.metric === AGE_METRIC;

              return (
                <div key={`${condition.metric}-${index}`} className="grid gap-2 rounded-xl bg-white p-3 md:grid-cols-[minmax(0,1fr)_120px_minmax(180px,220px)_auto]">
                  <select
                    value={condition.metric}
                    onChange={(event) => updateCondition(index, 'metric', event.target.value)}
                    className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    {config.metrics.map((metric) => (
                      <option key={metric.value} value={metric.value}>
                        {metric.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={condition.operator}
                    onChange={(event) => updateCondition(index, 'operator', event.target.value)}
                    className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    {availableOperators.map((operator) => (
                      <option key={operator.value} value={operator.value}>
                        {operator.label}
                      </option>
                    ))}
                  </select>
                  {isStatusMetric ? (
                    <select
                      value={condition.value || metricConfig.options?.[0]?.value || 'ACTIVE'}
                      onChange={(event) => updateCondition(index, 'value', event.target.value)}
                      className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      required
                    >
                      {(metricConfig.options || []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : isAgeMetric ? (
                    <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2">
                      <input
                        type="number"
                        step="any"
                        value={condition.value}
                        onChange={(event) => updateCondition(index, 'value', event.target.value)}
                        className="h-11 min-w-0 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                        required
                      />
                      <select
                        value={condition.unit || AGE_UNITS.HOURS}
                        onChange={(event) => updateCondition(index, 'unit', event.target.value)}
                        className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      >
                        {(metricConfig.units || [
                          { value: AGE_UNITS.HOURS, label: 'Hours' },
                          { value: AGE_UNITS.DAYS, label: 'Days' },
                        ]).map((unit) => (
                          <option key={unit.value} value={unit.value}>
                            {unit.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      value={condition.value}
                      onChange={(event) => updateCondition(index, 'value', event.target.value)}
                      className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      required
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeCondition(index)}
                    disabled={form.conditions.length === 1}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-red-500 transition hover:bg-red-50 disabled:opacity-40"
                    title="Remove condition"
                  >
                    <X size={17} strokeWidth={2.2} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} strokeWidth={2.2} />}
            Save rule
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
          >
            <X size={17} strokeWidth={2.2} />
            Cancel
          </button>
        </div>
      </form>
    </DashboardPanel>
  );
};

const RulesTab = ({ config, onDeleteRule, onSaveRule, rules, saving }) => {
  const [editingRule, setEditingRule] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  const startCreate = (action = 'PAUSE') => {
    setEditingRule({
      ...defaultRuleForm,
      action,
      name: '',
    });
    setFormOpen(true);
  };

  const startEdit = (rule) => {
    setEditingRule(rule);
    setFormOpen(true);
  };

  const handleSave = async (payload) => {
    const data = await onSaveRule(payload, editingRule?.id || '');
    toast.success(data.message);
    setFormOpen(false);
    setEditingRule(null);
  };

  const handleDelete = async (rule) => {
    const confirmed = window.confirm(`Delete rule "${rule.name}" permanently?`);

    if (!confirmed) {
      return;
    }

    const data = await onDeleteRule(rule.id);
    toast.success(data.message);
  };

  const handleDuplicate = async (rule) => {
    const duplicatedRule = {
      action: rule.action,
      conditions: (rule.conditions || []).map((condition) => ({
        metric: condition.metric,
        operator: condition.operator,
        ...(condition.unit ? { unit: condition.unit } : {}),
        value: condition.value,
      })),
      enabled: rule.enabled,
      logicMode: rule.logicMode,
      name: `${rule.name} Copy`,
    };
    const data = await onSaveRule(duplicatedRule, '');

    toast.success(data.message);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => startCreate()}
          className="flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white transition hover:bg-sky-700"
        >
          <Plus size={17} strokeWidth={2.2} />
          Add rule
        </button>
      </div>

      {formOpen ? (
        <RuleForm
          config={config}
          editingRule={editingRule}
          onCancel={() => {
            setFormOpen(false);
            setEditingRule(null);
          }}
          onSave={handleSave}
          saving={saving}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {config.actions.map((action) => {
          const actionRules = rules.filter((rule) => rule.action === action.value);
          const style = actionStyles[action.value] || actionStyles.PAUSE;
          const Icon = style.icon;

          return (
            <DashboardPanel key={action.value}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${style.bg} ${style.text}`}>
                    <Icon size={20} strokeWidth={2.2} />
                  </span>
                  <div>
                    <p className="text-lg font-black text-slate-950">{action.label} Rules</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{action.description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startCreate(action.value)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-white text-sky-700 transition hover:bg-sky-50"
                  title={`Add ${action.label} rule`}
                >
                  <Plus size={16} strokeWidth={2.2} />
                </button>
              </div>

              <div className="space-y-3">
                {actionRules.length ? (
                  actionRules.map((rule) => (
                    <div key={rule.id} className={`rounded-2xl border ${style.border} ${style.bg} p-4`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-black text-slate-950">{rule.name}</p>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.1em] ${
                              rule.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {rule.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {rule.logicMode === 'ANY' ? 'Any condition can match' : 'All conditions must match'}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleDuplicate(rule)}
                            disabled={saving}
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/80 text-slate-600 transition hover:bg-white hover:text-indigo-700 disabled:opacity-50"
                            title="Duplicate rule"
                          >
                            <CopyPlus size={16} strokeWidth={2.2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(rule)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/80 text-slate-600 transition hover:bg-white hover:text-sky-700"
                            title="Edit rule"
                          >
                            <Edit3 size={16} strokeWidth={2.2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(rule)}
                            disabled={saving}
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/80 text-red-500 transition hover:bg-white disabled:opacity-50"
                            title="Delete rule"
                          >
                            <Trash2 size={16} strokeWidth={2.2} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {rule.conditions.map((condition) => (
                          <RuleConditionSummary
                            key={`${rule.id}-${condition.metric}-${condition.operator}-${condition.value}`}
                            condition={condition}
                            metrics={config.metrics}
                            operators={config.operators}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-sky-100 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500">
                    No {action.label.toLowerCase()} rules defined yet.
                  </p>
                )}
              </div>
            </DashboardPanel>
          );
        })}
      </div>
    </div>
  );
};

const AnalysisPage = () => {
  const [activeTab, setActiveTab] = useState('recommendations');
  const { config, deleteRule, error, loading, recommendations, reload, rules, saveRule, saving } = useAnalysis();

  return (
    <div>
      <DashboardHeader
        title="Analysis"
        description="Evaluate saved ads against practical automation rules before taking action."
        action={
          <button
            type="button"
            onClick={() => reload({ showLoading: true })}
            className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
          >
            <RefreshCw size={17} strokeWidth={2.2} />
            Refresh
          </button>
        }
      />

      {error ? <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <DashboardPanel>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'recommendations', icon: ClipboardList, label: 'Recommendations' },
            { id: 'rules', icon: GitBranch, label: 'Rules' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-black transition',
                  isActive ? 'bg-sky-600 text-white shadow-lg shadow-sky-100' : 'bg-sky-50 text-slate-600 hover:bg-sky-100',
                ].join(' ')}
              >
                <Icon size={17} strokeWidth={2.2} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </DashboardPanel>

      {loading ? (
        <div className="mt-4 h-96 animate-pulse rounded-2xl bg-sky-50" />
      ) : (
        <div className="mt-4">
          {activeTab === 'recommendations' ? (
            <RecommendationsTab recommendations={recommendations} />
          ) : (
            <RulesTab config={config} onDeleteRule={deleteRule} onSaveRule={saveRule} rules={rules} saving={saving} />
          )}
        </div>
      )}
    </div>
  );
};

export default AnalysisPage;
