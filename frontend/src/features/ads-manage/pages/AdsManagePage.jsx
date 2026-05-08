import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Copy, Database, Eye, LoaderCircle, PauseCircle, PlayCircle, RefreshCw, RotateCcw, Search, Trash2, X } from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { useMetaKeySettings } from '../../settings/MetaKeySettingsContext';
import { useTokens } from '../../token-management/hooks/useTokens';
import { adsManageApi } from '../api/adsManageApi';

const statusOptions = [
  { value: '', label: 'All saved states' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'FAILED', label: 'Failed launch' },
  { value: 'RETRIED', label: 'Retried' },
  { value: 'DELETED', label: 'Deleted' },
];

const currencyFormatter = new Intl.NumberFormat('en', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en');

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

const formatDateTime = (value) => {
  if (!value) {
    return 'Not saved';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const formatInteger = (value) => numberFormatter.format(Number(value || 0));

const formatMetric = (value) => {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? currencyFormatter.format(numericValue) : '0.00';
};

const formatBudget = (campaign) => {
  if (!campaign.budget?.amount) {
    return campaign.launch?.dailyBudget
      ? `${formatMetric(campaign.launch.dailyBudget)} ${campaign.adAccount?.currency || ''}`.trim()
      : 'Ad set budget';
  }

  const divisor = zeroDecimalCurrencies.has(campaign.adAccount?.currency) ? 1 : 100;
  const amount = Number(campaign.budget.amount) / divisor;

  return `${campaign.budget.type || 'Daily'} ${formatMetric(amount)} ${campaign.adAccount?.currency || ''}`.trim();
};

const getStatusTone = (status) => {
  if (status === 'ACTIVE') {
    return 'bg-emerald-50 text-emerald-700';
  }

  if (status === 'PAUSED') {
    return 'bg-amber-50 text-amber-700';
  }

  if (status === 'FAILED' || status === 'DELETED' || status === 'WITH_ISSUES' || status === 'DISAPPROVED') {
    return 'bg-red-50 text-red-700';
  }

  if (status === 'RETRIED') {
    return 'bg-sky-50 text-sky-700';
  }

  return 'bg-slate-100 text-slate-600';
};

const EmptyState = ({ children }) => (
  <div className="rounded-2xl border border-dashed border-sky-100 bg-sky-50/70 px-4 py-8 text-sm font-semibold text-slate-500">
    {children}
  </div>
);

const MetricCard = ({ label, value, detail }) => (
  <div className="rounded-2xl border border-sky-100 bg-white px-4 py-4 shadow-sm shadow-sky-100/70">
    <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">{label}</p>
    <p className="mt-2 break-words text-2xl font-black text-slate-950">{value}</p>
    {detail ? <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p> : null}
  </div>
);

const DetailPill = ({ children }) => (
  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{children}</span>
);

const TableActionButton = ({ children, className = '', disabled = false, title, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    className={`flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
  >
    {children}
  </button>
);

const AdsManagePage = () => {
  const { error: tokensError, loading: tokensLoading, tokens } = useTokens();
  const { publishTokenType } = useMetaKeySettings();

  const [tokenId, setTokenId] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [accountOptions, setAccountOptions] = useState([]);
  const [status, setStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [actionCampaignId, setActionCampaignId] = useState('');
  const [expandedCampaignId, setExpandedCampaignId] = useState('');
  const [duplicateCampaign, setDuplicateCampaign] = useState(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateStatus, setDuplicateStatus] = useState('PAUSED');
  const [deepCopy, setDeepCopy] = useState(true);

  const activeTokens = useMemo(() => tokens.filter((token) => token.status === 'ACTIVE'), [tokens]);
  const selectedToken = activeTokens.find((token) => token.id === tokenId) || null;
  const selectedAdAccounts = useMemo(
    () => accountOptions.filter((account) => selectedAccountIds.includes(account.id)),
    [accountOptions, selectedAccountIds]
  );
  const filteredCampaigns = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return campaigns;
    }

    return campaigns.filter((campaign) =>
      [
        campaign.name,
        campaign.id,
        campaign.objective,
        campaign.adAccount?.name,
        campaign.adSetId,
        campaign.creativeId,
        campaign.adId,
        campaign.launch?.websiteUrl,
        campaign.lastMetaError,
        ...(campaign.actionHistory || []).map((item) => item.message),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [campaigns, searchTerm]);

  const activeCount = campaigns.filter((campaign) => campaign.status === 'ACTIVE').length;
  const pausedCount = campaigns.filter((campaign) => campaign.status === 'PAUSED').length;
  const failedCount = campaigns.filter((campaign) => campaign.status === 'FAILED').length;
  const deletedCount = campaigns.filter((campaign) => campaign.status === 'DELETED').length;

  const loadCampaigns = async ({
    nextTokenId = tokenId,
    nextAccountIds = selectedAccountIds,
    nextStatus = status,
    silent = false,
  } = {}) => {
    if (!nextTokenId) {
      setCampaigns([]);
      setAccountOptions([]);
      setWarnings([]);
      if (!silent) {
        toast.error('Select a Meta token first');
      }
      return;
    }

    setLoadingCampaigns(true);

    try {
      const data = await adsManageApi.getCampaigns({
        tokenId: nextTokenId,
        adAccountIds: nextAccountIds,
        status: nextStatus,
      });
      setCampaigns(data.campaigns || []);
      setAccountOptions(data.filters?.adAccounts || []);
      setWarnings(data.warnings || []);
    } catch (requestError) {
      setCampaigns([]);
      setAccountOptions([]);
      setWarnings([]);
      toast.error(requestError.message);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    if (!tokenId) {
      setSelectedAccountIds([]);
      setAccountOptions([]);
      setCampaigns([]);
      setWarnings([]);
      return;
    }

    setSelectedAccountIds([]);
    loadCampaigns({
      nextTokenId: tokenId,
      nextAccountIds: [],
      silent: true,
    });
  }, [tokenId]);

  const handleStatusChange = (nextStatus) => {
    setStatus(nextStatus);
    loadCampaigns({
      nextStatus,
    });
  };

  const toggleAccount = (accountId) => {
    const nextAccountIds = selectedAccountIds.includes(accountId)
      ? selectedAccountIds.filter((id) => id !== accountId)
      : [...selectedAccountIds, accountId];

    setSelectedAccountIds(nextAccountIds);
    loadCampaigns({
      nextAccountIds,
    });
  };

  const toggleSelectAllAccounts = () => {
    const nextAccountIds =
      selectedAccountIds.length === accountOptions.length ? [] : accountOptions.map((account) => account.id);

    setSelectedAccountIds(nextAccountIds);
    loadCampaigns({
      nextAccountIds,
    });
  };

  const updateCampaignStatus = async (campaign, nextStatus) => {
    setActionCampaignId(campaign.id);

    try {
      const data = await adsManageApi.updateCampaignStatus(campaign.id, {
        tokenId: campaign.tokenId || tokenId,
        status: nextStatus,
      });
      setCampaigns((current) =>
        current.map((item) =>
          item.id === campaign.id
            ? {
                ...item,
                ...(data.campaign || {}),
                status: nextStatus,
                effectiveStatus: nextStatus,
              }
            : item
        )
      );
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setActionCampaignId('');
    }
  };

  const syncCampaignDetails = async (campaign) => {
    setActionCampaignId(campaign.id);

    try {
      const data = await adsManageApi.syncCampaignDetails(campaign.id, {
        tokenId: campaign.tokenId || tokenId,
      });
      setCampaigns((current) => current.map((item) => (item.id === campaign.id ? { ...item, ...(data.campaign || {}) } : item)));
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setActionCampaignId('');
    }
  };

  const retryFailedLaunch = async (campaign) => {
    setActionCampaignId(campaign.id);

    try {
      const data = await adsManageApi.retryFailedLaunch(campaign.id, {
        tokenId: campaign.tokenId || tokenId,
        tokenType: publishTokenType,
      });
      toast.success(data.message);
      await loadCampaigns();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setActionCampaignId('');
    }
  };

  const deleteCampaign = async (campaign) => {
    if (!window.confirm(`Delete campaign "${campaign.name}" in Meta? This will also mark the local history as deleted.`)) {
      return;
    }

    setActionCampaignId(campaign.id);

    try {
      const data = await adsManageApi.deleteCampaign(campaign.id, {
        tokenId: campaign.tokenId || tokenId,
      });

      if (status && status !== 'DELETED') {
        setCampaigns((current) => current.filter((item) => item.id !== campaign.id));
      } else {
        setCampaigns((current) =>
          current.map((item) =>
            item.id === campaign.id
              ? {
                  ...item,
                  ...(data.campaign || {}),
                  status: 'DELETED',
                  effectiveStatus: 'DELETED',
                }
              : item
          )
        );
      }

      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setActionCampaignId('');
    }
  };

  const openDuplicateDialog = (campaign) => {
    setDuplicateCampaign(campaign);
    setDuplicateName(`${campaign.name} Copy`);
    setDuplicateStatus('PAUSED');
    setDeepCopy(true);
  };

  const closeDuplicateDialog = () => {
    setDuplicateCampaign(null);
    setDuplicateName('');
    setDuplicateStatus('PAUSED');
    setDeepCopy(true);
  };

  const submitDuplicate = async () => {
    const nextName = duplicateName.trim();

    if (!nextName) {
      toast.error('Add a name for the duplicated campaign');
      return;
    }

    if (duplicateCampaign && nextName.toLowerCase() === duplicateCampaign.name.trim().toLowerCase()) {
      toast.error('Use a different name for the duplicated campaign');
      return;
    }

    setActionCampaignId(duplicateCampaign.id);

    try {
      const data = await adsManageApi.duplicateCampaign(duplicateCampaign.id, {
        tokenId: duplicateCampaign.tokenId || tokenId,
        name: nextName,
        status: duplicateStatus,
        deepCopy,
      });
      toast.success(data.message);
      closeDuplicateDialog();
      await loadCampaigns();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setActionCampaignId('');
    }
  };

  return (
    <div>
      <DashboardHeader
        title="Ads Manage"
        description="Manage campaigns saved from Ads Launch. Meta is called only when you pause, delete, or duplicate."
        action={
          <button
            type="button"
            onClick={() => loadCampaigns()}
            disabled={loadingCampaigns || !tokenId}
            className="flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-70"
          >
            {loadingCampaigns ? <LoaderCircle size={17} strokeWidth={2.2} className="animate-spin" /> : <RefreshCw size={17} strokeWidth={2.2} />}
            Refresh history
          </button>
        }
      />

      {tokensError ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{tokensError}</p> : null}
      {warnings.length ? (
        <div className="mb-4 space-y-2">
          {warnings.map((warning) => (
            <p key={`${warning.scope}-${warning.message}`} className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {warning.scope}: {warning.message}
            </p>
          ))}
        </div>
      ) : null}

      <DashboardPanel title="Campaign filters">
        <div className="grid gap-3 xl:grid-cols-[minmax(220px,1.1fr)_190px_minmax(300px,1.5fr)] xl:items-end">
          <div className="space-y-2">
            <label htmlFor="ads-manage-token" className="text-sm font-semibold text-slate-700">
              Source token
            </label>
            <select
              id="ads-manage-token"
              value={tokenId}
              onChange={(event) => setTokenId(event.target.value)}
              disabled={tokensLoading}
              className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              <option value="">Select active Meta token</option>
              {activeTokens.map((token) => (
                <option key={token.id} value={token.id}>
                  {token.label} ({token.accessToken})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="ads-manage-status" className="text-sm font-semibold text-slate-700">
              Delivery state
            </label>
            <select
              id="ads-manage-status"
              value={status}
              onChange={(event) => handleStatusChange(event.target.value)}
              className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              {statusOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="ads-manage-accounts" className="text-sm font-semibold text-slate-700">
                Saved ad accounts
              </label>
              <button
                type="button"
                onClick={toggleSelectAllAccounts}
                disabled={!accountOptions.length}
                className="text-xs font-black uppercase tracking-[0.16em] text-sky-600 disabled:text-slate-300"
              >
                {selectedAccountIds.length === accountOptions.length && accountOptions.length ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div id="ads-manage-accounts" className="min-h-12 rounded-xl border border-sky-100 bg-white px-3 py-2">
              {loadingCampaigns && !accountOptions.length ? (
                <div className="h-8 animate-pulse rounded-lg bg-sky-50" />
              ) : accountOptions.length ? (
                <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
                  {accountOptions.map((account) => {
                    const checked = selectedAccountIds.includes(account.id);

                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => toggleAccount(account.id)}
                        className={`rounded-full border px-3 py-1.5 text-left text-xs font-black transition ${
                          checked
                            ? 'border-sky-300 bg-sky-50 text-sky-800'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:bg-sky-50'
                        }`}
                      >
                        {account.name} {account.currency ? `| ${account.currency}` : ''}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="py-2 text-sm font-semibold text-slate-400">
                  {tokenId ? 'No saved campaign accounts for this token yet.' : 'Select a token to load saved accounts.'}
                </p>
              )}
            </div>
          </div>
        </div>
      </DashboardPanel>

      <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
        <MetricCard label="Saved Campaigns" value={campaigns.length} detail={`${filteredCampaigns.length} visible`} />
        <MetricCard label="Active" value={activeCount} detail="Local history status" />
        <MetricCard label="Paused" value={pausedCount} detail="Can be activated from here" />
        <MetricCard label="Failed" value={failedCount} detail="Can retry from history" />
        <MetricCard label="Deleted" value={deletedCount} detail="Saved for audit/history" />
      </div>

      <DashboardPanel
        title="Campaigns from Mongo history"
        headerAction={
          <div className="relative w-full sm:w-80">
            <Search size={16} strokeWidth={2.2} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-10 w-full rounded-xl border border-sky-100 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              placeholder="Search campaign, account, ad id, URL"
            />
          </div>
        }
        className="mt-4"
      >
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-sky-50/70 px-4 py-3 text-sky-800">
          <Database size={18} strokeWidth={2.2} className="mt-0.5 shrink-0" />
          <p className="text-sm font-semibold">
            This list is loaded from MongoDB launch history. Meta is only called when you pause, delete, duplicate, retry, or fetch one campaign.
          </p>
        </div>

        {loadingCampaigns ? (
          <div className="space-y-3">
            <div className="h-28 animate-pulse rounded-2xl bg-sky-50" />
            <div className="h-28 animate-pulse rounded-2xl bg-sky-50" />
            <div className="h-28 animate-pulse rounded-2xl bg-sky-50" />
          </div>
        ) : filteredCampaigns.length ? (
          <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm shadow-sky-100/70">
            <div className="overflow-x-auto">
              <table className="min-w-[1120px] w-full text-left">
                <thead className="bg-sky-50/80">
                  <tr className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Budget</th>
                    <th className="px-4 py-3">Launch</th>
                    <th className="px-4 py-3">Meta IDs</th>
                    <th className="px-4 py-3">Saved</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-50">
                  {filteredCampaigns.map((campaign) => {
                    const isDeleted = campaign.status === 'DELETED';
                    const isFailed = campaign.status === 'FAILED';
                    const isRetried = campaign.status === 'RETRIED';
                    const hasLocalFailedId = String(campaign.id || '').startsWith('failed_');
                    const canFetchMeta = !hasLocalFailedId && !isRetried;
                    const nextStatus = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
                    const updating = actionCampaignId === campaign.id;
                    const expanded = expandedCampaignId === campaign.id;

                    return (
                      <>
                        <tr key={campaign.id} className="align-top transition hover:bg-sky-50/40">
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${getStatusTone(campaign.effectiveStatus || campaign.status)}`}>
                              {campaign.effectiveStatus || campaign.status || 'UNKNOWN'}
                            </span>
                            {campaign.lastMetaError ? (
                              <p className="mt-2 max-w-36 text-xs font-semibold text-red-600">Action error</p>
                            ) : null}
                          </td>
                          <td className="max-w-[300px] px-4 py-4">
                            <p className="line-clamp-2 text-sm font-black text-slate-950">{campaign.name}</p>
                            <p className="mt-1 break-all text-xs font-semibold text-slate-400">{campaign.id}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <DetailPill>{campaign.objective || 'No objective'}</DetailPill>
                              <DetailPill>{campaign.source === 'DUPLICATE' ? 'Duplicated' : 'Ads Launch'}</DetailPill>
                            </div>
                          </td>
                          <td className="max-w-[210px] px-4 py-4">
                            <p className="truncate text-sm font-black text-slate-900">{campaign.adAccount?.name || campaign.adAccount?.id || 'Not saved'}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-400">
                              {campaign.adAccount?.accountId || campaign.adAccount?.id || ''}
                              {campaign.adAccount?.currency ? ` | ${campaign.adAccount.currency}` : ''}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-sm font-black text-slate-950">{formatBudget(campaign)}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-400">{campaign.budget?.type || 'Budget'}</p>
                          </td>
                          <td className="max-w-[220px] px-4 py-4">
                            <p className="truncate text-sm font-black text-slate-950">{campaign.launch?.launchLabel || 'Not saved'}</p>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-400">
                              {campaign.launch?.countryLabel || campaign.launch?.countries?.join(', ') || 'No country'}
                            </p>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-400">{campaign.launch?.websiteUrl || 'No URL saved'}</p>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1 text-xs font-semibold text-slate-500">
                              <p className="break-all">
                                <span className="font-black text-slate-700">Ad set:</span> {campaign.adSetId || 'Meta copy'}
                              </p>
                              <p className="break-all">
                                <span className="font-black text-slate-700">Creative:</span> {campaign.creativeId || 'N/A'}
                              </p>
                              <p className="break-all">
                                <span className="font-black text-slate-700">Ad:</span> {campaign.adId || 'N/A'}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-sm font-black text-slate-950">{formatDateTime(campaign.updatedTime)}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-400">
                              {campaign.lastActionAt ? `Action ${formatDateTime(campaign.lastActionAt)}` : 'No action yet'}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              <TableActionButton
                                onClick={() => setExpandedCampaignId((current) => (current === campaign.id ? '' : campaign.id))}
                                className="border-sky-100 bg-white text-slate-600 hover:bg-sky-50"
                                title={expanded ? 'Hide details' : 'Show details'}
                              >
                                <Eye size={16} strokeWidth={2.2} />
                              </TableActionButton>
                              <TableActionButton
                                onClick={() => updateCampaignStatus(campaign, nextStatus)}
                                disabled={updating || isDeleted || isFailed || isRetried}
                                className={
                                  nextStatus === 'PAUSED'
                                    ? 'border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    : 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }
                                title={nextStatus === 'PAUSED' ? 'Pause campaign' : 'Activate campaign'}
                              >
                                {updating ? (
                                  <LoaderCircle size={16} strokeWidth={2.2} className="animate-spin" />
                                ) : nextStatus === 'PAUSED' ? (
                                  <PauseCircle size={16} strokeWidth={2.2} />
                                ) : (
                                  <PlayCircle size={16} strokeWidth={2.2} />
                                )}
                              </TableActionButton>
                              <TableActionButton
                                onClick={() => syncCampaignDetails(campaign)}
                                disabled={updating || !canFetchMeta}
                                className="border-sky-100 bg-white text-sky-700 hover:bg-sky-50"
                                title="Fetch latest status from Meta"
                              >
                                {updating ? <LoaderCircle size={16} strokeWidth={2.2} className="animate-spin" /> : <RefreshCw size={16} strokeWidth={2.2} />}
                              </TableActionButton>
                              <TableActionButton
                                onClick={() => retryFailedLaunch(campaign)}
                                disabled={updating || !isFailed || !campaign.launch?.retryPayload}
                                className="border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                title="Retry failed launch"
                              >
                                {updating ? <LoaderCircle size={16} strokeWidth={2.2} className="animate-spin" /> : <RotateCcw size={16} strokeWidth={2.2} />}
                              </TableActionButton>
                              <TableActionButton
                                onClick={() => openDuplicateDialog(campaign)}
                                disabled={updating || isDeleted || isFailed || isRetried}
                                className="border-sky-100 bg-white text-slate-700 hover:bg-sky-50"
                                title="Duplicate campaign"
                              >
                                <Copy size={16} strokeWidth={2.2} />
                              </TableActionButton>
                              <TableActionButton
                                onClick={() => deleteCampaign(campaign)}
                                disabled={updating || isDeleted || hasLocalFailedId || isRetried}
                                className="border-red-100 bg-white text-red-600 hover:bg-red-50"
                                title="Delete campaign"
                              >
                                {updating ? <LoaderCircle size={16} strokeWidth={2.2} className="animate-spin" /> : <Trash2 size={16} strokeWidth={2.2} />}
                              </TableActionButton>
                            </div>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr key={`${campaign.id}-details`} className="bg-slate-50/80">
                            <td colSpan={8} className="px-4 py-4">
                              <div className="grid gap-3 lg:grid-cols-3">
                                <div className="rounded-xl bg-white px-3 py-3">
                                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Launch</p>
                                  <p className="mt-2 text-sm font-black text-slate-950">{campaign.launch?.launchLabel || 'Not saved'}</p>
                                  <p className="mt-1 text-xs font-semibold text-slate-400">
                                    {campaign.launch?.countryLabel || campaign.launch?.countries?.join(', ')}
                                  </p>
                                </div>
                                <div className="rounded-xl bg-white px-3 py-3">
                                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Destination</p>
                                  <p className="mt-2 break-words text-sm font-black text-slate-950">{campaign.launch?.websiteUrl || 'Not saved'}</p>
                                  <p className="mt-1 text-xs font-semibold text-slate-400">{campaign.launch?.callToAction || ''}</p>
                                </div>
                                <div className="rounded-xl bg-white px-3 py-3">
                                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Copy</p>
                                  <p className="mt-2 break-words text-sm font-black text-slate-950">{campaign.launch?.headline || 'Not saved'}</p>
                                  <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-400">{campaign.launch?.primaryText || ''}</p>
                                </div>
                              </div>
                              {campaign.lastMetaError ? (
                                <p className="mt-3 rounded-xl bg-red-50 px-3 py-3 text-sm font-semibold text-red-700">
                                  Last Meta action error: {campaign.lastMetaError}
                                </p>
                              ) : null}
                              {campaign.actionHistory?.length ? (
                                <div className="mt-3 rounded-xl bg-white px-3 py-3">
                                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Latest logs</p>
                                  <div className="mt-2 space-y-2">
                                    {campaign.actionHistory.slice().reverse().map((item) => (
                                      <div key={`${item.action}-${item.at}-${item.message}`} className="flex flex-col gap-1 rounded-lg bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="text-xs font-black text-slate-700">{item.action} {item.status ? `| ${item.status}` : ''}</p>
                                        <p className="text-xs font-semibold text-slate-500">{item.message || formatDateTime(item.at)}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ) : null}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState>
            {tokenId
              ? 'No saved campaigns match these filters. Publish from Ads Launch first, then they will appear here.'
              : 'Select a token to load saved campaign history.'}
          </EmptyState>
        )}
      </DashboardPanel>

      {duplicateCampaign ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl shadow-slate-950/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Duplicate campaign</p>
                <h3 className="mt-2 text-xl font-black text-slate-950">{duplicateCampaign.name}</h3>
              </div>
              <button
                type="button"
                onClick={closeDuplicateDialog}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-100 text-slate-500 transition hover:bg-sky-50"
                aria-label="Close duplicate campaign"
              >
                <X size={17} strokeWidth={2.4} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <label htmlFor="duplicate-campaign-name" className="text-sm font-semibold text-slate-700">
                  New campaign name
                </label>
                <input
                  id="duplicate-campaign-name"
                  value={duplicateName}
                  onChange={(event) => setDuplicateName(event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="duplicate-campaign-status" className="text-sm font-semibold text-slate-700">
                    Initial status
                  </label>
                  <select
                    id="duplicate-campaign-status"
                    value={duplicateStatus}
                    onChange={(event) => setDuplicateStatus(event.target.value)}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    <option value="PAUSED">Paused</option>
                    <option value="ACTIVE">Active</option>
                  </select>
                </div>

                <label className="flex min-h-12 items-center gap-3 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={deepCopy}
                    onChange={(event) => setDeepCopy(event.target.checked)}
                    className="h-4 w-4 rounded border-sky-200 text-sky-600 focus:ring-sky-500"
                  />
                  Copy ad sets and ads
                </label>
              </div>

              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                This action calls Meta. The new campaign is saved locally after Meta returns a copied campaign id.
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDuplicateDialog}
                className="h-11 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDuplicate}
                disabled={actionCampaignId === duplicateCampaign.id}
                className="flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-70"
              >
                {actionCampaignId === duplicateCampaign.id ? (
                  <LoaderCircle size={17} strokeWidth={2.2} className="animate-spin" />
                ) : (
                  <Check size={17} strokeWidth={2.2} />
                )}
                Duplicate campaign
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdsManagePage;
