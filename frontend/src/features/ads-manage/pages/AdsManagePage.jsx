import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Check,
  Copy,
  LoaderCircle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { useTokens } from '../../token-management/hooks/useTokens';
import { useTokenMetaAssets } from '../../ads-launch/hooks/useTokenMetaAssets';
import { adsManageApi } from '../api/adsManageApi';

const statusOptions = [
  { value: '', label: 'All delivery states' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'WITH_ISSUES', label: 'With issues' },
];

const datePresetOptions = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_14d', label: 'Last 14 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
];

const currencyFormatter = new Intl.NumberFormat('en', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en');

const formatDateTime = (value) => {
  if (!value) {
    return 'Not set';
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
    return campaign.budget?.type || 'Ad set budget';
  }

  const divisor = campaign.adAccount?.currency && ['BIF', 'CLP', 'DJF', 'GNF', 'IDR', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'].includes(campaign.adAccount.currency)
    ? 1
    : 100;
  const amount = Number(campaign.budget.amount) / divisor;

  return `${campaign.budget.type} ${formatMetric(amount)} ${campaign.adAccount?.currency || ''}`.trim();
};

const getStatusTone = (status) => {
  if (status === 'ACTIVE') {
    return 'bg-emerald-50 text-emerald-700';
  }

  if (status === 'PAUSED') {
    return 'bg-amber-50 text-amber-700';
  }

  if (status === 'WITH_ISSUES' || status === 'DISAPPROVED') {
    return 'bg-red-50 text-red-700';
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

const AdsManagePage = () => {
  const { error: tokensError, loading: tokensLoading, tokens } = useTokens();
  const {
    adAccounts,
    error: assetsError,
    loadAssets,
    loadingAssets,
    resetAssets,
    warnings: assetWarnings,
  } = useTokenMetaAssets();

  const [tokenId, setTokenId] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [datePreset, setDatePreset] = useState('last_30d');
  const [status, setStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [actionCampaignId, setActionCampaignId] = useState('');
  const [duplicateCampaign, setDuplicateCampaign] = useState(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateStatus, setDuplicateStatus] = useState('PAUSED');
  const [deepCopy, setDeepCopy] = useState(true);

  const activeTokens = useMemo(() => tokens.filter((token) => token.status === 'ACTIVE'), [tokens]);
  const selectedToken = activeTokens.find((token) => token.id === tokenId) || null;
  const selectedAdAccounts = useMemo(
    () => adAccounts.filter((account) => selectedAccountIds.includes(account.id)),
    [adAccounts, selectedAccountIds]
  );
  const filteredCampaigns = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return campaigns;
    }

    return campaigns.filter((campaign) =>
      [campaign.name, campaign.id, campaign.objective, campaign.adAccount?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [campaigns, searchTerm]);

  const activeCount = campaigns.filter((campaign) => campaign.status === 'ACTIVE').length;
  const pausedCount = campaigns.filter((campaign) => campaign.status === 'PAUSED').length;
  const totalSpend = campaigns.reduce((total, campaign) => total + Number(campaign.insights?.spend || 0), 0);
  const totalClicks = campaigns.reduce((total, campaign) => total + Number(campaign.insights?.clicks || 0), 0);

  useEffect(() => {
    if (!tokenId) {
      resetAssets();
      setSelectedAccountIds([]);
      setCampaigns([]);
      return;
    }

    loadAssets(tokenId);
  }, [loadAssets, resetAssets, tokenId]);

  useEffect(() => {
    if (!adAccounts.length) {
      setSelectedAccountIds([]);
      return;
    }

    setSelectedAccountIds((current) => {
      const validIds = current.filter((accountId) => adAccounts.some((account) => account.id === accountId));
      return validIds.length ? validIds : adAccounts.map((account) => account.id);
    });
  }, [adAccounts]);

  const buildCampaignPayload = () => ({
    tokenId,
    adAccounts: selectedAdAccounts.map((account) => ({
      id: account.id,
      accountId: account.accountId,
      name: account.name,
      currency: account.currency,
    })),
    datePreset,
    status,
  });

  const loadCampaigns = async () => {
    if (!tokenId) {
      toast.error('Select a Meta token first');
      return;
    }

    if (!selectedAdAccounts.length) {
      toast.error('Select at least one ad account');
      return;
    }

    setLoadingCampaigns(true);

    try {
      const data = await adsManageApi.getCampaigns(buildCampaignPayload());
      setCampaigns(data.campaigns || []);
      setWarnings(data.warnings || []);
    } catch (requestError) {
      setCampaigns([]);
      setWarnings([]);
      toast.error(requestError.message);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const toggleAccount = (accountId) => {
    setSelectedAccountIds((current) =>
      current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId]
    );
  };

  const toggleSelectAllAccounts = () => {
    setSelectedAccountIds((current) =>
      current.length === adAccounts.length ? [] : adAccounts.map((account) => account.id)
    );
  };

  const updateCampaignStatus = async (campaign, nextStatus) => {
    setActionCampaignId(campaign.id);

    try {
      const data = await adsManageApi.updateCampaignStatus(campaign.id, {
        tokenId,
        status: nextStatus,
      });
      setCampaigns((current) =>
        current.map((item) =>
          item.id === campaign.id
            ? {
                ...item,
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
        tokenId,
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
        description="Review Meta campaigns by token, pause delivery, and duplicate campaigns with controlled changes."
        action={
          <button
            type="button"
            onClick={loadCampaigns}
            disabled={loadingCampaigns || !tokenId || !selectedAdAccounts.length}
            className="flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-70"
          >
            {loadingCampaigns ? <LoaderCircle size={17} strokeWidth={2.2} className="animate-spin" /> : <RefreshCw size={17} strokeWidth={2.2} />}
            Load campaigns
          </button>
        }
      />

      {tokensError ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{tokensError}</p> : null}
      {assetsError ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{assetsError}</p> : null}
      {[...assetWarnings, ...warnings].length ? (
        <div className="mb-4 space-y-2">
          {[...assetWarnings, ...warnings].map((warning) => (
            <p key={`${warning.scope}-${warning.message}`} className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {warning.scope}: {warning.message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <DashboardPanel title="Campaign filters">
            <div className="space-y-4">
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

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-2">
                  <label htmlFor="ads-manage-status" className="text-sm font-semibold text-slate-700">
                    Delivery state
                  </label>
                  <select
                    id="ads-manage-status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
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
                  <label htmlFor="ads-manage-date-preset" className="text-sm font-semibold text-slate-700">
                    Metrics window
                  </label>
                  <select
                    id="ads-manage-date-preset"
                    value={datePreset}
                    onChange={(event) => setDatePreset(event.target.value)}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    {datePresetOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="ads-manage-accounts" className="text-sm font-semibold text-slate-700">
                    Ad accounts
                  </label>
                  <button
                    type="button"
                    onClick={toggleSelectAllAccounts}
                    disabled={!adAccounts.length}
                    className="text-xs font-black uppercase tracking-[0.16em] text-sky-600 disabled:text-slate-300"
                  >
                    {selectedAccountIds.length === adAccounts.length && adAccounts.length ? 'Clear all' : 'Select all'}
                  </button>
                </div>
                <div id="ads-manage-accounts" className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-sky-100 bg-white p-3">
                  {loadingAssets ? (
                    <div className="h-36 animate-pulse rounded-xl bg-sky-50" />
                  ) : adAccounts.length ? (
                    adAccounts.map((account) => {
                      const checked = selectedAccountIds.includes(account.id);

                      return (
                        <label
                          key={account.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                            checked ? 'border-sky-300 bg-sky-50' : 'border-sky-100 bg-white hover:bg-sky-50/60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAccount(account.id)}
                            className="mt-1 h-4 w-4 rounded border-sky-200 text-sky-600 focus:ring-sky-500"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950">{account.name}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-400">
                              {account.accountId} {account.currency ? `| ${account.currency}` : ''}
                            </p>
                          </div>
                        </label>
                      );
                    })
                  ) : (
                    <EmptyState>Select a token to load ad accounts.</EmptyState>
                  )}
                </div>
              </div>
            </div>
          </DashboardPanel>

          <DashboardPanel title="Selected context">
            {selectedToken ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-sky-50/70 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Token</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{selectedToken.label}</p>
                </div>
                <div className="rounded-xl bg-sky-50/70 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Accounts</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{selectedAdAccounts.length} selected</p>
                </div>
              </div>
            ) : (
              <EmptyState>Select a token to start campaign management.</EmptyState>
            )}
          </DashboardPanel>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <MetricCard label="Campaigns" value={campaigns.length} detail={`${filteredCampaigns.length} visible`} />
            <MetricCard label="Active" value={activeCount} detail={`${pausedCount} paused`} />
            <MetricCard label="Spend" value={formatMetric(totalSpend)} detail={datePresetOptions.find((option) => option.value === datePreset)?.label} />
            <MetricCard label="Clicks" value={formatInteger(totalClicks)} detail="Across loaded campaigns" />
          </div>

          <DashboardPanel
            title="Campaigns"
            headerAction={
              <div className="relative w-full sm:w-72">
                <Search size={16} strokeWidth={2.2} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="h-10 w-full rounded-xl border border-sky-100 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="Search campaigns"
                />
              </div>
            }
          >
            {loadingCampaigns ? (
              <div className="space-y-3">
                <div className="h-24 animate-pulse rounded-2xl bg-sky-50" />
                <div className="h-24 animate-pulse rounded-2xl bg-sky-50" />
                <div className="h-24 animate-pulse rounded-2xl bg-sky-50" />
              </div>
            ) : filteredCampaigns.length ? (
              <div className="space-y-3">
                {filteredCampaigns.map((campaign) => {
                  const nextStatus = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
                  const updating = actionCampaignId === campaign.id;

                  return (
                    <div key={campaign.id} className="rounded-2xl border border-sky-100 bg-white px-4 py-4 shadow-sm shadow-sky-100/70">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-black ${getStatusTone(campaign.effectiveStatus || campaign.status)}`}>
                              {campaign.effectiveStatus || campaign.status || 'UNKNOWN'}
                            </span>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                              {campaign.objective || 'No objective'}
                            </span>
                          </div>
                          <p className="mt-3 break-words text-lg font-black text-slate-950">{campaign.name}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-400">
                            {campaign.id} | {campaign.adAccount?.name || campaign.adAccount?.id}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => updateCampaignStatus(campaign, nextStatus)}
                            disabled={updating}
                            className={`flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold transition disabled:opacity-70 ${
                              nextStatus === 'PAUSED'
                                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {updating ? (
                              <LoaderCircle size={16} strokeWidth={2.2} className="animate-spin" />
                            ) : nextStatus === 'PAUSED' ? (
                              <PauseCircle size={16} strokeWidth={2.2} />
                            ) : (
                              <PlayCircle size={16} strokeWidth={2.2} />
                            )}
                            {nextStatus === 'PAUSED' ? 'Pause' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openDuplicateDialog(campaign)}
                            disabled={updating}
                            className="flex h-10 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-70"
                          >
                            <Copy size={16} strokeWidth={2.2} />
                            Duplicate
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                        <div className="rounded-xl bg-sky-50/70 px-3 py-3">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">Budget</p>
                          <p className="mt-2 text-sm font-black text-slate-950">{formatBudget(campaign)}</p>
                        </div>
                        <div className="rounded-xl bg-sky-50/70 px-3 py-3">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">Spend</p>
                          <p className="mt-2 text-sm font-black text-slate-950">{formatMetric(campaign.insights?.spend)}</p>
                        </div>
                        <div className="rounded-xl bg-sky-50/70 px-3 py-3">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">Clicks / CTR</p>
                          <p className="mt-2 text-sm font-black text-slate-950">
                            {formatInteger(campaign.insights?.clicks)} / {formatMetric(campaign.insights?.ctr)}%
                          </p>
                        </div>
                        <div className="rounded-xl bg-sky-50/70 px-3 py-3">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">Updated</p>
                          <p className="mt-2 text-sm font-black text-slate-950">{formatDateTime(campaign.updatedTime)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState>{tokenId ? 'No campaigns loaded for the selected filters.' : 'Select a token and load campaigns.'}</EmptyState>
            )}
          </DashboardPanel>
        </div>
      </div>

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
                Duplicating can create new campaign, ad set, and ad objects in Meta. New copies do not carry over learning history.
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
