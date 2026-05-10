import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  CopyPlus,
  DownloadCloud,
  FileText,
  KeyRound,
  Layers3,
  Megaphone,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { businessDataApi } from '../../dashboard/api/businessDataApi';
import { getAdAccountSyncKey, useMetaSync } from '../../dashboard/context/MetaSyncContext';
import { getMetaKeyTypeLabel, META_KEY_TYPES, useMetaKeySettings } from '../../settings/MetaKeySettingsContext';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-US');

const metricToneClasses = {
  sky: 'bg-sky-50 text-sky-700 ring-sky-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  red: 'bg-red-50 text-red-700 ring-red-100',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
};

const statusToneClasses = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  CONNECTED: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  ENABLED: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  SYNCED: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  PAUSED: 'bg-amber-50 text-amber-700 ring-amber-100',
  CAMPAIGN_PAUSED: 'bg-amber-50 text-amber-700 ring-amber-100',
  ADSET_PAUSED: 'bg-amber-50 text-amber-700 ring-amber-100',
  PENDING_REVIEW: 'bg-amber-50 text-amber-700 ring-amber-100',
  IN_PROCESS: 'bg-sky-50 text-sky-700 ring-sky-100',
  BLOCKED: 'bg-red-50 text-red-700 ring-red-100',
  DISABLED: 'bg-red-50 text-red-700 ring-red-100',
  DISAPPROVED: 'bg-red-50 text-red-700 ring-red-100',
  WITH_ISSUES: 'bg-red-50 text-red-700 ring-red-100',
  DELETED: 'bg-slate-100 text-slate-600 ring-slate-200',
  ARCHIVED: 'bg-slate-100 text-slate-600 ring-slate-200',
  UNKNOWN: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const hasValue = (value) => value !== undefined && value !== null && value !== '';

const formatCurrencyAmount = (amount, currency = 'USD') => {
  if (!hasValue(amount)) {
    return '-';
  }

  const numericAmount = Number(amount) || 0;
  const hasCents = Math.abs(numericAmount % 1) > 0.005;

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    return currencyFormatter.format(numericAmount);
  }
};

const formatNumber = (value) => (hasValue(value) ? numberFormatter.format(Number(value) || 0) : '-');

const formatStatusLabel = (status) => {
  if (!status) {
    return 'Unknown';
  }

  return String(status)
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getEntityKey = (entity, fallback, prefix = 'item') =>
  entity?.id ||
  entity?._id ||
  entity?.accountId ||
  entity?.profileId ||
  entity?.businessId ||
  entity?.campaignId ||
  entity?.adSetId ||
  entity?.adId ||
  `${prefix}-${fallback}`;

const getDisplayId = (entity) =>
  entity?.accountId || entity?.profileId || entity?.businessId || entity?.id || entity?._id || 'Not saved';

const getCampaigns = (adAccount) => (Array.isArray(adAccount?.campaigns) ? adAccount.campaigns : []);
const getAdSets = (campaign) => (Array.isArray(campaign?.adSets) ? campaign.adSets : []);
const getAds = (adSet) => (Array.isArray(adSet?.ads) ? adSet.ads : []);
const getAdAccountIdForSync = (adAccount) => adAccount?.id || adAccount?.accountId || '';
const getCampaignIdForAction = (campaign) => campaign?.id || campaign?.campaignId || '';
const getCampaignDuplicateKey = (profileId, adAccountId, campaignId) =>
  profileId && adAccountId && campaignId ? `${profileId}:${adAccountId}:${campaignId}` : '';

const getCurrency = (adAccount, fallback = 'USD') => adAccount?.currency || adAccount?.spendCurrency || fallback;

const getMetric = (...values) => {
  const metric = values.find((value) => hasValue(value));
  return hasValue(metric) ? metric : null;
};

const getCampaignBudgetValue = (campaign) => {
  const directBudget = getMetric(campaign?.budget, campaign?.dailyBudget, campaign?.lifetimeBudget);

  if (hasValue(directBudget)) {
    return directBudget;
  }

  const adSetBudget = getAdSets(campaign).reduce(
    (total, adSet) => total + (Number(getMetric(adSet?.budget, adSet?.dailyBudget, adSet?.lifetimeBudget)) || 0),
    0
  );

  return adSetBudget || null;
};

const getCampaignBudget = (campaign, currency = 'USD') => {
  const budget = getCampaignBudgetValue(campaign);

  return hasValue(budget) ? formatCurrencyAmount(budget, currency) : '-';
};

const getAdSetBudget = (adSet, campaign, currency = 'USD') => {
  const budget = getMetric(adSet?.budget, adSet?.dailyBudget, adSet?.lifetimeBudget, getCampaignBudgetValue(campaign));

  return hasValue(budget) ? formatCurrencyAmount(budget, currency) : '-';
};

const getAdResults = (ad) =>
  formatNumber(
    getMetric(
      ad?.results,
      ad?.insights?.results,
      ad?.websiteRegistrationCompleted,
      ad?.completedRegistrationCount,
      ad?.completeRegistrationCount,
      ad?.registrations,
      ad?.insights?.registrations,
      ad?.leads,
      ad?.insights?.leads
    )
  );

const getStatus = (...values) =>
  values.find((value) => hasValue(value)) || 'UNKNOWN';

const normalizeSearch = (value) => String(value || '').toLowerCase().trim();

const isDisapprovedAd = (ad) => {
  const statuses = [
    ad?.status,
    ad?.effectiveStatus,
    ad?.configuredStatus,
    ad?.reviewStatus,
    ad?.adReviewFeedback?.global?.status,
  ]
    .filter(Boolean)
    .map((status) => String(status).toUpperCase());

  return statuses.some((status) => status.includes('DISAPPROVED') || status.includes('REJECTED'));
};

const getDisapprovedAdSetCount = (adSet) => getAds(adSet).filter(isDisapprovedAd).length;

const getDisapprovedCampaignCount = (campaign) =>
  getAdSets(campaign).reduce((total, adSet) => total + getDisapprovedAdSetCount(adSet), 0);

const getDisapprovedAdCount = (adAccount) =>
  getCampaigns(adAccount).reduce((total, campaign) => total + getDisapprovedCampaignCount(campaign), 0);

const socialAccountMatchesSearch = (account, searchTerm) => {
  if (!searchTerm) {
    return true;
  }

  const searchable = [
    account.name,
    account.sourceTokenLabel,
    account.adsPowerProfile,
    account.connectionStatus,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchable.includes(searchTerm);
};

const brandMatchesSearch = (brand, searchTerm) => {
  if (!searchTerm) {
    return true;
  }

  const searchable = [
    brand.name,
    brand.description,
    ...(Array.isArray(brand.assignedSocialAccounts)
      ? brand.assignedSocialAccounts.map((account) => account.name)
      : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchable.includes(searchTerm);
};

const getBrandsFromResponse = (data) => {
  if (Array.isArray(data)) {
    return data;
  }

  return Array.isArray(data?.brands) ? data.brands : [];
};

const MetricBadge = ({ label, value, tone = 'slate', fullValue = false }) => (
  <span
    className={[
      'inline-flex items-center justify-between gap-2 rounded-full px-3 py-1 text-xs font-black ring-1',
      fullValue ? 'min-h-9 min-w-40 max-w-full sm:max-w-[28rem]' : 'h-9 w-40 max-w-full',
      metricToneClasses[tone],
    ].join(' ')}
    title={`${label}: ${value}`}
  >
    <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] opacity-70">{label}</span>
    <span className={`min-w-0 text-sm ${fullValue ? 'break-words text-right leading-4' : 'truncate'}`}>{value}</span>
  </span>
);

const StatusPill = ({ status }) => {
  const normalizedStatus = String(status || 'UNKNOWN').toUpperCase();

  return (
    <span className={`inline-flex h-9 w-32 items-center justify-center rounded-full px-3 py-1 text-xs font-black ring-1 ${statusToneClasses[normalizedStatus] || statusToneClasses.UNKNOWN}`}>
      {formatStatusLabel(normalizedStatus)}
    </span>
  );
};

const getTreeLineLeft = (depth) => `${0.75 + Math.max(depth - 1, 0) * 1.5}rem`;

const TreeGroup = ({ children, className = '', depth }) => (
  <div className={className}>
    <div className="relative space-y-1">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-6 top-6 w-[2px] rounded-full bg-slate-900"
        style={{ left: getTreeLineLeft(depth) }}
      />
      {children}
    </div>
  </div>
);

const TreeRow = ({ depth = 0, icon: Icon, isOpen, isRoot = false, onClick, secondaryText, subtitle, title, children }) => {
  const rowTone = isRoot
    ? isOpen
      ? 'rounded-none bg-sky-50 p-4 ring-1 ring-inset ring-sky-200'
      : 'rounded-none bg-white p-4 hover:bg-sky-50/60'
    : isOpen
      ? 'rounded-xl bg-sky-100/70 px-3 py-2.5 ring-1 ring-sky-200 shadow-sm shadow-sky-100'
      : 'rounded-xl px-3 py-2.5 hover:bg-white';

  return (
    <button
      type="button"
      onClick={onClick}
      className={['group relative block w-full text-left transition', rowTone].join(' ')}
      style={isRoot ? undefined : { paddingLeft: `${0.75 + depth * 1.5}rem` }}
    >
      {!isRoot ? (
          <span
            aria-hidden="true"
            className="absolute top-1/2 h-[2px] w-5 rounded-full bg-slate-900"
            style={{ left: getTreeLineLeft(depth) }}
          />
      ) : null}

      <div className="relative grid grid-cols-[auto_minmax(0,1fr)] gap-3">
        <span className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-950 ring-2 ${isOpen ? 'ring-sky-300' : 'ring-slate-200'}`}>
          {isOpen ? <ChevronDown size={18} strokeWidth={2.4} /> : <ChevronRight size={18} strokeWidth={2.4} />}
        </span>

        <div className="min-w-0">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-700 ring-2 ${isOpen ? 'ring-sky-300' : 'ring-sky-100'}`}>
                <Icon size={18} strokeWidth={2.3} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">{title}</p>
                {subtitle ? (
                  <p className={`mt-1 text-xs font-semibold ${isRoot ? 'text-slate-500' : 'truncate text-slate-400'}`}>
                    {subtitle}
                  </p>
                ) : null}
                {secondaryText ? (
                  <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500">
                    {secondaryText}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">{children}</div>
          </div>
        </div>
      </div>
    </button>
  );
};

const AdLeafRow = ({ ad, campaignCurrency, depth = 5, highlighted = false }) => (
  <div
    className={[
      'relative rounded-xl px-3 py-2.5 transition hover:bg-white',
      highlighted ? 'bg-sky-50/70 ring-1 ring-sky-100' : '',
    ].join(' ')}
    style={{ paddingLeft: `${0.75 + depth * 1.5}rem` }}
  >
    <span
      aria-hidden="true"
      className="absolute top-1/2 h-[2px] w-5 rounded-full bg-slate-900"
      style={{ left: getTreeLineLeft(depth) }}
    />

    <div className="relative flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-100">
          <FileText size={18} strokeWidth={2.3} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">
            {ad.title || ad.name || 'Unnamed ad'}
          </p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            Ad
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-400">
            ID: {getDisplayId(ad)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <MetricBadge
          label="Spending"
          value={formatCurrencyAmount(getMetric(ad.spend, ad.insights?.spend), campaignCurrency)}
          tone="emerald"
        />
        <MetricBadge
          label="CPR"
          value={formatCurrencyAmount(getMetric(ad.cpr, ad.insights?.cpr, ad.insights?.cpl), campaignCurrency)}
          tone="indigo"
        />
        <MetricBadge label="Results" value={getAdResults(ad)} tone="amber" />
        <StatusPill status={getStatus(ad.status, ad.effectiveStatus)} />
      </div>
    </div>
  </div>
);

const EmptyState = ({ children }) => (
  <div className="rounded-2xl border border-dashed border-sky-100 bg-sky-50/40 px-5 py-10 text-center text-sm font-semibold text-slate-500">
    {children}
  </div>
);

const RoadmapPage = () => {
  const { startAdAccountSync, startSocialAccountSync, syncingAccountId, syncingAdAccountKey } = useMetaSync();
  const { fetchTokenType, publishTokenType } = useMetaKeySettings();
  const [brands, setBrands] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [expandedAccountId, setExpandedAccountId] = useState(null);
  const [expandedProfileId, setExpandedProfileId] = useState(null);
  const [expandedAdAccountId, setExpandedAdAccountId] = useState(null);
  const [expandedCampaignId, setExpandedCampaignId] = useState(null);
  const [expandedAdSetId, setExpandedAdSetId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [duplicatingCampaignKey, setDuplicatingCampaignKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    businessDataApi.getBrands()
      .then((data) => {
        if (isMounted) {
          setBrands(getBrandsFromResponse(data));
        }
      })
      .catch((fetchError) => {
        if (isMounted) {
          setError(fetchError.message || 'Unable to load saved roadmap data.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const refreshBrands = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsRefreshing(true);
      setError('');
    }

    try {
      const data = await businessDataApi.getBrands();
      setBrands(getBrandsFromResponse(data));
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to refresh saved roadmap data.');
    } finally {
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const handleSyncCompleted = () => {
      refreshBrands({ silent: true });
    };

    window.addEventListener('meta-sync-completed', handleSyncCompleted);
    return () => window.removeEventListener('meta-sync-completed', handleSyncCompleted);
  }, [refreshBrands]);

  const selectedBrand = useMemo(() => {
    if (!brands.length) {
      return null;
    }

    return brands.find((brand) => getEntityKey(brand) === selectedBrandId) || brands[0];
  }, [brands, selectedBrandId]);

  const selectedBrandKey = selectedBrand ? getEntityKey(selectedBrand) : '';
  const selectedAccounts = Array.isArray(selectedBrand?.assignedSocialAccounts)
    ? selectedBrand.assignedSocialAccounts
    : [];
  const filteredAccounts = selectedAccounts.filter((account) =>
    socialAccountMatchesSearch(account, normalizeSearch(accountSearch))
  );
  const selectedFetchKeyLabel = getMetaKeyTypeLabel(fetchTokenType);
  const selectedPublishKeyLabel = getMetaKeyTypeLabel(publishTokenType);
  const filteredBrands = brands.filter((brand) => brandMatchesSearch(brand, normalizeSearch(brandSearch)));

  const resetExpandedTree = () => {
    setExpandedAccountId(null);
    setExpandedProfileId(null);
    setExpandedAdAccountId(null);
    setExpandedCampaignId(null);
    setExpandedAdSetId(null);
  };

  const handleSelectBrand = (brandId) => {
    setSelectedBrandId(brandId);
    setAccountSearch('');
    resetExpandedTree();
  };

  const toggleAccount = (accountId) => {
    setExpandedAccountId((current) => (current === accountId ? null : accountId));
    setExpandedProfileId(null);
    setExpandedAdAccountId(null);
    setExpandedCampaignId(null);
    setExpandedAdSetId(null);
  };

  const toggleProfile = (profileId) => {
    setExpandedProfileId((current) => (current === profileId ? null : profileId));
    setExpandedAdAccountId(null);
    setExpandedCampaignId(null);
    setExpandedAdSetId(null);
  };

  const toggleAdAccount = (adAccountId) => {
    setExpandedAdAccountId((current) => (current === adAccountId ? null : adAccountId));
    setExpandedCampaignId(null);
    setExpandedAdSetId(null);
  };

  const toggleCampaign = (campaignId) => {
    setExpandedCampaignId((current) => (current === campaignId ? null : campaignId));
    setExpandedAdSetId(null);
  };

  const toggleAdSet = (adSetId) => {
    setExpandedAdSetId((current) => (current === adSetId ? null : adSetId));
  };

  const duplicateCampaign = async ({ account, profile, adAccount, campaign }) => {
    const adAccountId = getAdAccountIdForSync(adAccount);
    const campaignId = getCampaignIdForAction(campaign);
    const duplicateKey = getCampaignDuplicateKey(profile?.id, adAccountId, campaignId);

    if (!profile?.id || !adAccountId || !campaignId) {
      toast.error('Campaign duplicate needs a saved profile, ad account, and campaign id.', {
        position: 'top-center',
      });
      return;
    }

    setDuplicatingCampaignKey(duplicateKey);
    const toastId = `duplicate-campaign-${duplicateKey}`;
    const duplicateName = `${campaign.name || 'Campaign'} Copy`;

    toast.loading(`Duplicating and fetching ${campaign.name || 'campaign'} with ${selectedPublishKeyLabel}`, {
      id: toastId,
      position: 'top-center',
    });

    try {
      const data = await businessDataApi.duplicateCampaign(profile.id, adAccountId, campaignId, {
        tokenId: account.sourceTokenId,
        tokenType: publishTokenType,
        name: duplicateName,
        status: 'PAUSED',
        deepCopy: true,
      });

      const adCopyError = data.summary?.manualAdCopyErrors?.[0];
      const toastMessage = adCopyError?.message
        ? `${data.message || 'Campaign duplicated, but an ad copy failed'}: ${adCopyError.message}`
        : data.message || 'Campaign duplicated successfully';

      toast[adCopyError ? 'error' : 'success'](toastMessage, {
        id: toastId,
        position: 'top-center',
      });
      await refreshBrands({ silent: true });
    } catch (requestError) {
      toast.error(requestError.message || 'Campaign duplicate failed', {
        id: toastId,
        position: 'top-center',
      });
    } finally {
      setDuplicatingCampaignKey('');
    }
  };

  return (
    <>
      <DashboardHeader
        title="Roadmap"
        description="Browse saved hierarchy data by brand, social account, business profile, ad account, campaign, ad set, and ads. Fetch refreshes the selected social account using the Settings key."
        action={
          <button
            type="button"
            onClick={() => refreshBrands()}
            disabled={isRefreshing}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={17} strokeWidth={2.3} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <DashboardPanel title="Brands" className="xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)]">
          {brands.length ? (
            <div className="space-y-3">
              <div className="relative">
                <Search size={16} strokeWidth={2.3} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={brandSearch}
                  onChange={(event) => setBrandSearch(event.target.value)}
                  placeholder="Search brands"
                  className="h-11 w-full rounded-xl border border-sky-100 bg-white pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </div>
              <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1 xl:max-h-[calc(100vh-17rem)]">
                {filteredBrands.map((brand, index) => {
                  const brandKey = getEntityKey(brand, index, 'brand');
                  const isSelected = brandKey === selectedBrandKey;
                  const accountCount = Array.isArray(brand.assignedSocialAccounts) ? brand.assignedSocialAccounts.length : 0;

                  return (
                    <button
                      key={brandKey}
                      type="button"
                      onClick={() => handleSelectBrand(brandKey)}
                      className={[
                        'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition',
                        isSelected
                          ? 'border-sky-300 bg-sky-50 shadow-sm shadow-sky-100'
                          : 'border-sky-100 bg-white hover:bg-sky-50/60',
                      ].join(' ')}
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full ring-4 ring-white"
                        style={{ backgroundColor: brand.color || '#38bdf8' }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-slate-950">{brand.name}</span>
                        <span className="mt-1 block text-xs font-semibold text-slate-400">
                          {accountCount} {accountCount === 1 ? 'social account' : 'social accounts'}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {!filteredBrands.length ? (
                  <EmptyState>No brands match this search.</EmptyState>
                ) : null}
              </div>
            </div>
          ) : (
            <EmptyState>{isLoading ? 'Loading brands...' : 'No brands saved yet.'}</EmptyState>
          )}
        </DashboardPanel>

        <DashboardPanel
          title={selectedBrand ? `${selectedBrand.name} Roadmap` : 'Saved Roadmap'}
          headerAction={
            <div className="relative w-full min-w-[16rem] sm:w-80">
              <Search size={16} strokeWidth={2.3} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={accountSearch}
                onChange={(event) => setAccountSearch(event.target.value)}
                placeholder="Search social accounts"
                className="h-11 w-full rounded-xl border border-sky-100 bg-white pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </div>
          }
          className="min-h-[calc(100vh-13rem)]"
        >
          {error ? (
            <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <EmptyState>Loading saved roadmap data...</EmptyState>
          ) : selectedBrand ? (
            filteredAccounts.length ? (
              <div className="space-y-3">
                {filteredAccounts.map((account, accountIndex) => {
                  const accountKey = getEntityKey(account, accountIndex, 'account');
                  const profiles = Array.isArray(account.businessProfiles) ? account.businessProfiles : [];
                  const isAccountOpen = expandedAccountId === accountKey;
                  const isAccountSyncing = syncingAccountId === account.id;
                  const canFetchAccount =
                    account.sourceTokenId &&
                    account.sourceTokenStatus !== 'DEACTIVE' &&
                    (fetchTokenType === META_KEY_TYPES.SYSTEM_USER
                      ? account.systemUserAccessTokenStatus !== 'DEACTIVE'
                      : account.profileAccessTokenStatus !== 'DEACTIVE');
                  const canDuplicateAccount =
                    account.sourceTokenId &&
                    account.sourceTokenStatus !== 'DEACTIVE' &&
                    (publishTokenType === META_KEY_TYPES.SYSTEM_USER
                      ? account.systemUserAccessTokenStatus !== 'DEACTIVE'
                      : account.profileAccessTokenStatus !== 'DEACTIVE');

                  return (
                    <div
                      key={accountKey}
                      className={[
                        'overflow-hidden rounded-3xl border bg-white shadow-sm transition',
                        isAccountOpen ? 'border-sky-300 shadow-sky-100' : 'border-sky-100 shadow-sky-50',
                      ].join(' ')}
                    >
                      <TreeRow
                        icon={Users}
                        isOpen={isAccountOpen}
                        isRoot
                        onClick={() => toggleAccount(accountKey)}
                        secondaryText={`AdsPower Profile: ${account.adsPowerProfile || 'Not set'}`}
                        subtitle="Social account"
                        title={account.name || 'Unnamed social account'}
                      >
                        <MetricBadge label="Token" value={account.sourceTokenLabel || 'Not set'} tone="indigo" fullValue />
                        <StatusPill status={getStatus(account.connectionStatus, account.status)} />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void startSocialAccountSync(account);
                          }}
                          disabled={isAccountSyncing || !canFetchAccount}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-sky-100 bg-white text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                          title={
                            canFetchAccount
                              ? `Fetch ${account.sourceTokenLabel || 'Meta connection'} with ${selectedFetchKeyLabel}`
                              : `No active ${selectedFetchKeyLabel} for this social account`
                          }
                          aria-label={`Fetch ${account.name || 'social account'}`}
                        >
                          <DownloadCloud size={16} strokeWidth={2.3} className={isAccountSyncing ? 'animate-pulse' : ''} />
                        </button>
                      </TreeRow>

                      {isAccountOpen ? (
                        <TreeGroup depth={1} className="border-t border-sky-100 bg-slate-50 p-3">
                          {profiles.length ? (
                            profiles.map((profile, profileIndex) => {
                              const profileKey = getEntityKey(profile, profileIndex, 'profile');
                              const adAccounts = Array.isArray(profile.adAccounts) ? profile.adAccounts : [];
                              const isProfileOpen = expandedProfileId === profileKey;

                              return (
                                <div key={profileKey} className="space-y-3">
                                  <TreeRow
                                    depth={1}
                                    icon={BriefcaseBusiness}
                                    isOpen={isProfileOpen}
                                    onClick={() => toggleProfile(profileKey)}
                                    secondaryText={`ID: ${getDisplayId(profile)}`}
                                    subtitle="Business profile"
                                    title={profile.name || 'Unnamed business profile'}
                                  >
                                    <MetricBadge label="Ad accounts" value={adAccounts.length || Number(profile.adAccountCount) || 0} tone="sky" />
                                    <StatusPill status={getStatus(profile.metaStatus, profile.assetMetricsStatus)} />
                                  </TreeRow>

                                  {isProfileOpen ? (
                                    adAccounts.length ? (
                                      <TreeGroup depth={2}>
                                        {adAccounts.map((adAccount, adAccountIndex) => {
                                          const adAccountKey = getEntityKey(adAccount, adAccountIndex, 'ad-account');
                                          const adAccountSyncId = getAdAccountIdForSync(adAccount);
                                          const campaigns = getCampaigns(adAccount);
                                          const isAdAccountOpen = expandedAdAccountId === adAccountKey;
                                          const isAdAccountSyncing =
                                            syncingAdAccountKey === getAdAccountSyncKey(profile.id, adAccountSyncId);
                                          const canFetchAdAccount = canFetchAccount && adAccountSyncId;
                                          const disapprovedAdCount = getDisapprovedAdCount(adAccount);

                                          return (
                                            <div key={adAccountKey} className="space-y-3">
                                              <TreeRow
                                                depth={2}
                                                icon={KeyRound}
                                                isOpen={isAdAccountOpen}
                                                onClick={() => toggleAdAccount(adAccountKey)}
                                                secondaryText={`ID: ${getDisplayId(adAccount)}`}
                                                subtitle="Ad account"
                                                title={adAccount.name || 'Unnamed ad account'}
                                              >
                                                {disapprovedAdCount > 0 ? (
                                                  <MetricBadge label="Disapproved" value={disapprovedAdCount} tone="red" />
                                                ) : null}
                                                <MetricBadge label="Campaigns" value={campaigns.length || Number(adAccount.campaignCount) || 0} tone="emerald" />
                                                <StatusPill status={getStatus(adAccount.connectionStatus, adAccount.status, adAccount.statusLabel)} />
                                                <button
                                                  type="button"
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    void startAdAccountSync({
                                                      account,
                                                      profile,
                                                      adAccount,
                                                    });
                                                  }}
                                                  disabled={isAdAccountSyncing || !canFetchAdAccount}
                                                  className="flex h-9 w-9 items-center justify-center rounded-full border border-sky-100 bg-white text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                  title={
                                                    canFetchAdAccount
                                                      ? `Fetch ${adAccount.name || 'ad account'} with ${selectedFetchKeyLabel}`
                                                      : `No active ${selectedFetchKeyLabel} for this ad account`
                                                  }
                                                  aria-label={`Fetch ${adAccount.name || 'ad account'}`}
                                                >
                                                  <DownloadCloud size={16} strokeWidth={2.3} className={isAdAccountSyncing ? 'animate-pulse' : ''} />
                                                </button>
                                              </TreeRow>

                                              {isAdAccountOpen ? (
                                                campaigns.length ? (
                                                  <TreeGroup depth={3}>
                                                    {campaigns.map((campaign, campaignIndex) => {
                                                      const campaignKey = getEntityKey(campaign, campaignIndex, 'campaign');
                                                      const campaignId = getCampaignIdForAction(campaign);
                                                      const duplicateKey = getCampaignDuplicateKey(profile.id, adAccountSyncId, campaignId);
                                                      const campaignCurrency = getCurrency(adAccount);
                                                      const adSets = getAdSets(campaign);
                                                      const isCampaignOpen = expandedCampaignId === campaignKey;
                                                      const isDuplicatingCampaign = duplicatingCampaignKey === duplicateKey;
                                                      const canDuplicateCampaign = canDuplicateAccount && adAccountSyncId && campaignId;
                                                      const campaignDisapprovedAdCount = getDisapprovedCampaignCount(campaign);

                                                      return (
                                                        <div key={campaignKey} className="space-y-3">
                                                          <TreeRow
                                                            depth={3}
                                                            icon={Megaphone}
                                                            isOpen={isCampaignOpen}
                                                            onClick={() => toggleCampaign(campaignKey)}
                                                            secondaryText={`ID: ${getDisplayId(campaign)}`}
                                                            subtitle="Campaign"
                                                            title={campaign.name || 'Unnamed campaign'}
                                                          >
                                                            {campaignDisapprovedAdCount > 0 ? (
                                                              <MetricBadge label="Disapproved" value={campaignDisapprovedAdCount} tone="red" />
                                                            ) : null}
                                                            <MetricBadge label="Budget" value={getCampaignBudget(campaign, campaignCurrency)} tone="sky" />
                                                            <StatusPill status={getStatus(campaign.status, campaign.effectiveStatus)} />
                                                            <button
                                                              type="button"
                                                              onClick={(event) => {
                                                                event.stopPropagation();
                                                                void duplicateCampaign({
                                                                  account,
                                                                  profile,
                                                                  adAccount,
                                                                  campaign,
                                                                });
                                                              }}
                                                              disabled={isDuplicatingCampaign || !canDuplicateCampaign}
                                                              className="inline-flex h-9 items-center gap-2 rounded-full border border-indigo-100 bg-white px-3 text-xs font-black text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                              title={
                                                                canDuplicateCampaign
                                                                  ? `Duplicate with ${selectedPublishKeyLabel}`
                                                                  : `No active ${selectedPublishKeyLabel} for duplicating`
                                                              }
                                                            >
                                                              <CopyPlus size={15} strokeWidth={2.3} className={isDuplicatingCampaign ? 'animate-pulse' : ''} />
                                                              Duplicate
                                                            </button>
                                                          </TreeRow>

                                                          {isCampaignOpen ? (
                                                            adSets.length ? (
                                                              <TreeGroup depth={4}>
                                                                {adSets.map((adSet, adSetIndex) => {
                                                                  const adSetKey = getEntityKey(adSet, adSetIndex, 'ad-set');
                                                                  const ads = getAds(adSet);
                                                                  const isAdSetOpen = expandedAdSetId === adSetKey;
                                                                  const adSetDisapprovedAdCount = getDisapprovedAdSetCount(adSet);

                                                                  return (
                                                                    <div key={adSetKey} className="space-y-3">
                                                                      <TreeRow
                                                                        depth={4}
                                                                        icon={Layers3}
                                                                        isOpen={isAdSetOpen}
                                                                        onClick={() => toggleAdSet(adSetKey)}
                                                                        secondaryText={`ID: ${getDisplayId(adSet)}`}
                                                                        subtitle="Ad set"
                                                                        title={adSet.name || 'Unnamed ad set'}
                                                                      >
                                                                        {adSetDisapprovedAdCount > 0 ? (
                                                                          <MetricBadge label="Disapproved" value={adSetDisapprovedAdCount} tone="red" />
                                                                        ) : null}
                                                                        <MetricBadge
                                                                          label="Budget"
                                                                          value={getAdSetBudget(adSet, campaign, campaignCurrency)}
                                                                          tone="sky"
                                                                        />
                                                                        <StatusPill status={getStatus(adSet.status, adSet.effectiveStatus)} />
                                                                      </TreeRow>

                                                                      {isAdSetOpen ? (
                                                                        ads.length ? (
                                                                          <TreeGroup depth={5} className="rounded-2xl bg-sky-50/60 px-2 py-2 ring-1 ring-sky-100">
                                                                            {ads.map((ad, adIndex) => {
                                                                              const adKey = getEntityKey(ad, adIndex, 'ad');

                                                                              return <AdLeafRow key={adKey} ad={ad} campaignCurrency={campaignCurrency} highlighted />;
                                                                            })}
                                                                          </TreeGroup>
                                                                        ) : (
                                                                          <EmptyState>No ads are saved under this ad set yet.</EmptyState>
                                                                        )
                                                                      ) : null}
                                                                    </div>
                                                                  );
                                                                })}
                                                              </TreeGroup>
                                                            ) : (
                                                              <EmptyState>No ad sets are saved under this campaign yet.</EmptyState>
                                                            )
                                                          ) : null}
                                                        </div>
                                                      );
                                                    })}
                                                  </TreeGroup>
                                                ) : (
                                                  <EmptyState>No campaigns are saved under this ad account yet.</EmptyState>
                                                )
                                              ) : null}
                                            </div>
                                          );
                                        })}
                                      </TreeGroup>
                                    ) : (
                                      <EmptyState>No ad accounts are saved under this business profile yet.</EmptyState>
                                    )
                                  ) : null}
                                </div>
                              );
                            })
                          ) : (
                            <EmptyState>No business profiles are saved under this social account yet.</EmptyState>
                          )}
                        </TreeGroup>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState>No social accounts match this brand and search.</EmptyState>
            )
          ) : (
            <EmptyState>Select or create a brand to see its saved roadmap.</EmptyState>
          )}
        </DashboardPanel>
      </div>
    </>
  );
};

export default RoadmapPage;
