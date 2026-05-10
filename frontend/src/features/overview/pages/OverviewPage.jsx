import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  BadgeDollarSign,
  BriefcaseBusiness,
  ChevronDown,
  CircleCheck,
  CopyPlus,
  DownloadCloud,
  FileText,
  KeyRound,
  Megaphone,
  Radio,
  Search,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { businessDataApi } from '../../dashboard/api/businessDataApi';
import { getAdAccountSyncKey, useMetaSync } from '../../dashboard/context/MetaSyncContext';
import { getMetaKeyTypeLabel, META_KEY_TYPES, useMetaKeySettings } from '../../settings/MetaKeySettingsContext';

const profileStatusStyles = {
  CONNECTED: 'bg-emerald-50 text-emerald-700',
  DISABLED: 'bg-red-50 text-red-700',
  UNKNOWN: 'bg-slate-100 text-slate-600',
};

const connectionStyles = {
  CONNECTED: 'bg-emerald-50 text-emerald-700',
  BLOCKED: 'bg-red-50 text-red-700',
  DISABLED: 'bg-orange-50 text-orange-700',
  UNKNOWN: 'bg-slate-100 text-slate-600',
};

const adAccountStatusStyles = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  BLOCKED: 'bg-red-50 text-red-700',
  UNKNOWN: 'bg-slate-100 text-slate-600',
};

const deliveryStatusStyles = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  PAUSED: 'bg-amber-50 text-amber-700',
  CAMPAIGN_PAUSED: 'bg-amber-50 text-amber-700',
  ADSET_PAUSED: 'bg-amber-50 text-amber-700',
  PENDING_REVIEW: 'bg-amber-50 text-amber-700',
  PREAPPROVED: 'bg-amber-50 text-amber-700',
  BLOCKED: 'bg-red-50 text-red-700',
  DISAPPROVED: 'bg-red-50 text-red-700',
  WITH_ISSUES: 'bg-red-50 text-red-700',
  DISABLED: 'bg-red-50 text-red-700',
  DELETED: 'bg-red-50 text-red-700',
  ARCHIVED: 'bg-slate-100 text-slate-600',
  IN_PROCESS: 'bg-sky-50 text-sky-700',
  UNKNOWN: 'bg-slate-100 text-slate-600',
};

const statusLabels = {
  CONNECTED: 'Connected',
  BLOCKED: 'Blocked',
  DISABLED: 'Disabled',
  UNKNOWN: 'Unknown',
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const formatCurrencyAmount = (amount, currency = 'USD') => {
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

const socialAccountLabel = (count) => `${count} ${count === 1 ? 'social account' : 'social accounts'}`;
const profileLabel = (count) => `${count} ${count === 1 ? 'profile' : 'profiles'}`;
const agencyLabel = (count) => `${count} ${count === 1 ? 'agency' : 'agencies'}`;

const getSpendLabel = (amount, currencies = []) => {
  const uniqueCurrencies = Array.from(new Set(currencies.filter(Boolean)));

  if (uniqueCurrencies.length === 1) {
    return formatCurrencyAmount(amount, uniqueCurrencies[0]);
  }

  return uniqueCurrencies.length > 1 ? `${currencyFormatter.format(amount)} mixed` : currencyFormatter.format(amount);
};

const getSocialAccountStats = (account) => {
  const profiles = account.businessProfiles || [];
  const totalSpend = profiles.reduce((total, profile) => total + (Number(profile.totalSpend) || 0), 0);
  const campaigns = profiles.reduce((total, profile) => total + (Number(profile.campaignCount) || 0), 0);
  const currencies = profiles.map((profile) => profile.spendCurrency).filter((currency) => currency && currency !== 'MIXED');

  return {
    adSpend: getSpendLabel(totalSpend, currencies),
    campaigns,
  };
};

const getBrandStats = (brand) => {
  const accounts = brand.assignedSocialAccounts || [];
  const stats = accounts.map((account) => getSocialAccountStats(account));
  const totalSpend = accounts.flatMap((account) => account.businessProfiles || [])
    .reduce((total, profile) => total + (Number(profile.totalSpend) || 0), 0);
  const currencies = accounts.flatMap((account) => account.businessProfiles || [])
    .map((profile) => profile.spendCurrency)
    .filter((currency) => currency && currency !== 'MIXED');

  return {
    adSpend: getSpendLabel(totalSpend, currencies),
    campaigns: stats.reduce((total, item) => total + item.campaigns, 0),
  };
};

const brandMatchesSearch = (brand, searchValue) => {
  const searchTerm = String(searchValue || '').trim().toLowerCase();

  if (!searchTerm) {
    return true;
  }

  return String(brand?.name || '').toLowerCase().includes(searchTerm);
};

const getBusinessProfileStats = (profile) => {
  const adAccounts = Array.isArray(profile.adAccounts) ? profile.adAccounts : [];
  const adSetCount = adAccounts.reduce(
    (total, account) =>
      total +
      (Array.isArray(account.campaigns)
        ? account.campaigns.reduce(
            (campaignTotal, campaign) =>
              campaignTotal +
              (Array.isArray(campaign.adSets)
                ? campaign.adSets.length
                : Number(campaign.adSetCount) || 0),
            0
          )
        : 0),
    0
  );
  const adCount = adAccounts.reduce(
    (total, account) =>
      total +
      (Array.isArray(account.campaigns)
        ? account.campaigns.reduce(
            (campaignTotal, campaign) =>
              campaignTotal +
              (Array.isArray(campaign.adSets)
                ? campaign.adSets.reduce(
                    (adSetTotal, adSet) =>
                      adSetTotal + (Array.isArray(adSet.ads) ? adSet.ads.length : Number(adSet.adCount) || 0),
                    0
                  )
                : 0),
            0
          )
        : 0),
    0
  );

  if (profile.assetMetricsStatus === 'SYNCED') {
    return {
      adAccountCount: profile.adAccountCount || 0,
      adSetCount,
      adCount,
      campaignCount: profile.campaignCount || 0,
      spend: formatProfileSpend(profile),
    };
  }

  return {
    adAccountCount: 0,
    adSetCount: 0,
    adCount: 0,
    campaignCount: 0,
    spend: currencyFormatter.format(0),
  };
};

const formatDate = (value) => {
  if (!value) {
    return 'Not checked yet';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const formatProfileSpend = (profile) => {
  const amount = Number(profile.totalSpend) || 0;

  if (profile.spendCurrency && profile.spendCurrency !== 'MIXED') {
    return formatCurrencyAmount(amount, profile.spendCurrency);
  }

  return profile.spendCurrency === 'MIXED'
    ? `${currencyFormatter.format(amount)} mixed`
    : currencyFormatter.format(amount);
};

const getBusinessProfileAdAccounts = (profile) => {
  if (Array.isArray(profile.adAccounts) && profile.adAccounts.length) {
    return profile.adAccounts.map((account) => ({
      ...account,
      connectionStatus: account.connectionStatus || 'UNKNOWN',
      statusLabel: account.statusLabel || 'Unknown',
    }));
  }

  return [];
};

const getAdAccountKey = (account) => account.id || account.accountId;
const getAdAccountIdForSync = (account) => account?.id || account?.accountId || '';
const getCampaignIdForAction = (campaign) => campaign?.id || campaign?.campaignId || '';
const getCampaignDuplicateKey = (profileId, adAccountId, campaignId) =>
  profileId && adAccountId && campaignId ? `${profileId}:${adAccountId}:${campaignId}` : '';

const percentFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-US');

const getRatio = (amount, count) => (count ? amount / count : 0);

const getDeliveryStatusLabel = (status) => {
  if (!status) {
    return 'Unknown';
  }

  if (status === 'ACTIVE') {
    return 'Active';
  }

  if (status === 'PAUSED') {
    return 'Paused';
  }

  if (status === 'BLOCKED') {
    return 'Blocked';
  }

  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const normalizeStoredMetric = (value) => Number(value) || 0;

const getStoredAdStatus = (status) => {
  if (status === 'ACTIVE' || status === 'PAUSED' || status === 'BLOCKED') {
    return status;
  }

  return status || 'UNKNOWN';
};

const getStoredAdHierarchy = (adAccount) => {
  if (!Array.isArray(adAccount?.campaigns) || !adAccount.campaigns.length) {
    return null;
  }

  const campaigns = [];
  const adSets = [];
  const ads = [];

  adAccount.campaigns.forEach((campaign) => {
    const campaignAdSets = Array.isArray(campaign.adSets) ? campaign.adSets : [];
    const campaignDisapprovedAdCount = campaignAdSets.reduce(
      (total, adSet) => total + (Array.isArray(adSet.ads) ? adSet.ads.filter(isDisapprovedAd).length : 0),
      0
    );

    campaigns.push({
      id: campaign.id,
      name: campaign.name || `Campaign ${campaign.id}`,
      status: getStoredAdStatus(campaign.status),
      spend: normalizeStoredMetric(campaign.spend ?? campaign.insights?.spend),
      clicks: normalizeStoredMetric(campaign.clicks ?? campaign.insights?.clicks),
      leads: normalizeStoredMetric(campaign.leads ?? campaign.insights?.leads),
      cpr: normalizeStoredMetric(campaign.cpr ?? campaign.insights?.cpr ?? campaign.insights?.cpl),
      adSetCount: normalizeStoredMetric(campaign.adSetCount || campaignAdSets.length),
      disapprovedAdCount: campaignDisapprovedAdCount,
    });

    campaignAdSets.forEach((adSet) => {
      const adSetAds = Array.isArray(adSet.ads) ? adSet.ads : [];
      const adSetDisapprovedAdCount = adSetAds.filter(isDisapprovedAd).length;

      adSets.push({
        id: adSet.id,
        campaignId: campaign.id,
        campaignName: campaign.name || `Campaign ${campaign.id}`,
        name: adSet.name || `Ad Set ${adSet.id}`,
        status: getStoredAdStatus(adSet.status),
        spend: normalizeStoredMetric(adSet.spend ?? adSet.insights?.spend),
        clicks: normalizeStoredMetric(adSet.clicks ?? adSet.insights?.clicks),
        leads: normalizeStoredMetric(adSet.leads ?? adSet.insights?.leads),
        cpr: normalizeStoredMetric(adSet.cpr ?? adSet.insights?.cpr ?? adSet.insights?.cpl),
        adCount: normalizeStoredMetric(adSet.adCount || adSetAds.length),
        disapprovedAdCount: adSetDisapprovedAdCount,
      });

      adSetAds.forEach((ad) => {
        const insights = ad.insights || {};
        const details = ad.details || {};
        const media = ad.media || {};

        ads.push({
          id: ad.id,
          adSetId: adSet.id,
          adSetName: adSet.name || `Ad Set ${adSet.id}`,
          campaignId: campaign.id,
          campaignName: campaign.name || `Campaign ${campaign.id}`,
          title: ad.title || ad.name || `Ad ${ad.id}`,
          status: getStoredAdStatus(ad.status),
          configuredStatus: ad.configuredStatus || null,
          effectiveStatus: ad.effectiveStatus || null,
          pageName: ad.pageName || details.page || 'Unknown page',
          pageId: ad.pageId || details.pageId || null,
          pageStatus: getStoredAdStatus(ad.pageStatus || details.pageStatus),
          clicks: normalizeStoredMetric(ad.clicks ?? insights.clicks),
          leads: normalizeStoredMetric(ad.leads ?? insights.leads),
          cpr: normalizeStoredMetric(ad.cpr ?? insights.cpr ?? insights.cpl),
          budget: normalizeStoredMetric(ad.budget),
          spend: normalizeStoredMetric(ad.spend ?? insights.spend),
          impressions: normalizeStoredMetric(ad.impressions ?? insights.impressions),
          reach: normalizeStoredMetric(ad.reach ?? insights.reach),
          ctr: normalizeStoredMetric(ad.ctr ?? insights.ctr),
          cpc: normalizeStoredMetric(ad.cpc ?? insights.cpc),
          cpl: normalizeStoredMetric(ad.cpl ?? insights.cpl ?? insights.cpr),
          creativeId: ad.creativeId || details.creativeId || null,
          videoId: ad.videoId || details.videoId || media.videoId || null,
          imageHash: ad.imageHash || details.imageHash || media.imageHash || null,
          storyId: ad.storyId || details.storyId || null,
          mediaType: ad.mediaType || media.type || 'Image',
          thumbnailUrl: media.thumbnailUrl || media.imageUrl || null,
        });
      });
    });
  });

  return {
    campaigns,
    adSets,
    ads,
  };
};

const buildAdAccountHierarchy = (adAccount) => {
  if (!adAccount) {
    return {
      campaigns: [],
      adSets: [],
      ads: [],
    };
  }

  const storedHierarchy = getStoredAdHierarchy(adAccount);

  if (storedHierarchy) {
    return storedHierarchy;
  }

  return {
    campaigns: [],
    adSets: [],
    ads: [],
  };
};

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

const getDisapprovedAdCount = (adAccount) => buildAdAccountHierarchy(adAccount).ads.filter(isDisapprovedAd).length;

const SocialAccountAvatar = ({ account, size = 'md' }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = account?.profileImageUrl && !imageFailed;
  const initial = account?.name?.trim()?.charAt(0)?.toUpperCase() || 'S';
  const sizeClass = size === 'lg' ? 'h-12 w-12 text-base' : 'h-10 w-10 text-sm';

  if (showImage) {
    return (
      <img
        src={account.profileImageUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setImageFailed(true)}
        className={`${sizeClass} shrink-0 rounded-full border border-sky-100 object-cover`}
      />
    );
  }

  return (
    <span className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border border-sky-100 bg-sky-50 font-black text-sky-700`}>
      {initial}
    </span>
  );
};

const BrandSearchBox = ({ value, onChange, placeholder = 'Search brands' }) => (
  <label className="relative block w-full sm:w-72">
    <Search
      size={16}
      strokeWidth={2.3}
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sky-600"
    />
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-10 w-full rounded-xl border border-sky-100 bg-white pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
    />
  </label>
);

const BrandCard = ({ brand, onSelect }) => {
  const stats = getBrandStats(brand);
  const socialAccountCount = brand.socialAccountCount || 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(brand.id)}
      className="rounded-xl border border-sky-100 bg-white p-4 text-left shadow-sm shadow-sky-50 transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg hover:shadow-sky-100 focus:outline-none focus:ring-4 focus:ring-sky-100"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: brand.color }} />
            <h3 className="truncate text-lg font-black text-slate-950">{brand.name}</h3>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Users size={14} strokeWidth={2.2} className="text-teal-600" />
            {socialAccountLabel(socialAccountCount)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Radio size={14} strokeWidth={2.2} className="text-amber-600" />
            {agencyLabel(brand.agencyCount || 0)}
          </p>
        </div>

        <div className="min-w-max shrink-0 rounded-xl border border-sky-100 bg-sky-50 px-4 py-2 text-right">
          <p className="flex items-center justify-end gap-1 text-xs font-black uppercase tracking-[0.12em] text-sky-700">
            <BadgeDollarSign size={13} strokeWidth={2.2} />
            Spend
          </p>
          <p className="mt-1 whitespace-nowrap text-base font-black text-slate-950">{stats.adSpend}</p>
          <p className="mt-1 flex items-center justify-end gap-1 text-xs font-bold text-slate-500">
            <Megaphone size={13} strokeWidth={2.2} />
            {stats.campaigns} campaigns
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Assigned social accounts</p>
        {brand.assignedSocialAccounts?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {brand.assignedSocialAccounts.slice(0, 4).map((account) => (
              <span
                key={account.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-700"
              >
                <Users size={13} strokeWidth={2.4} />
                {account.name}
              </span>
            ))}
            {brand.assignedSocialAccounts.length > 4 ? (
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                +{brand.assignedSocialAccounts.length - 4}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-sky-100 bg-sky-50/60 px-4 py-5 text-center text-sm font-semibold text-slate-500">
            No social accounts assigned yet.
          </p>
        )}
      </div>
    </button>
  );
};

const BrandSocialAccountTree = ({ brand, onSelectAccount, selectedAccountId }) => (
  <div className="mt-2 rounded-xl border border-sky-50 bg-white p-3">
    <div className="flex items-center gap-2 text-sm font-black text-slate-800">
      <ChevronDown size={16} strokeWidth={2.3} className="text-sky-600" />
      <Users size={17} strokeWidth={2.3} className="text-sky-600" />
      <span className="min-w-0 truncate">Social accounts</span>
    </div>

    <div className="ml-4 mt-3 space-y-2 border-l border-sky-100 pl-3">
      {brand.assignedSocialAccounts?.length ? (
        brand.assignedSocialAccounts.map((account) => {
          const isSelected = selectedAccountId === account.id;

          return (
            <button
              key={account.id}
              type="button"
              onClick={() => onSelectAccount(account.id)}
              className={`relative w-full rounded-lg px-2.5 py-2 text-left transition ${
                isSelected ? 'bg-sky-100 text-sky-900' : 'bg-sky-50/60 text-slate-800 hover:bg-sky-50'
              }`}
            >
              <span className="absolute -left-3 top-4 h-px w-2 bg-sky-100" />
              <span className="flex min-w-0 items-center gap-2">
                <Users size={15} strokeWidth={2.3} className="shrink-0 text-teal-600" />
                <span className="min-w-0 truncate text-xs font-black">{account.name}</span>
              </span>
              <span className="mt-1 block pl-6 text-xs font-semibold text-slate-500">
                {profileLabel(account.profileCount || 0)}
              </span>
            </button>
          );
        })
      ) : (
        <p className="rounded-lg border border-dashed border-sky-100 bg-sky-50/60 px-3 py-4 text-center text-xs font-semibold text-slate-500">
          No social accounts assigned.
        </p>
      )}
    </div>
  </div>
);

const BrandTreeSidebar = ({ brands, onBack, onSelectAccount, onSelectBrand, selectedAccountId, selectedBrandId }) => {
  const [brandSearch, setBrandSearch] = useState('');
  const filteredBrands = brands.filter((brand) => brandMatchesSearch(brand, brandSearch));

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-sky-100 bg-white p-3 shadow-sm shadow-sky-50">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex h-10 shrink-0 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
      >
        <ArrowLeft size={16} strokeWidth={2.2} />
        All brands
      </button>

      <div className="mb-3 shrink-0">
        <BrandSearchBox value={brandSearch} onChange={setBrandSearch} placeholder="Search brand" />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {filteredBrands.length ? (
          filteredBrands.map((brand) => {
            const stats = getBrandStats(brand);
            const isSelected = brand.id === selectedBrandId;

            return (
              <div key={brand.id}>
                <button
                  type="button"
                  onClick={() => onSelectBrand(brand.id)}
                  className={`w-full rounded-xl border p-3 text-left transition focus:outline-none focus:ring-4 focus:ring-sky-100 ${
                    isSelected
                      ? 'border-sky-300 bg-sky-50 shadow-sm shadow-sky-100'
                      : 'border-sky-100 bg-white hover:border-sky-200 hover:bg-sky-50/60'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: brand.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-slate-950">{brand.name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {socialAccountLabel(brand.socialAccountCount || 0)}
                      </p>
                    </div>
                    <p className="max-w-28 shrink-0 break-words text-right text-xs font-black leading-tight text-sky-700">{stats.adSpend}</p>
                  </div>
                </button>

                {isSelected ? (
                  <BrandSocialAccountTree
                    brand={brand}
                    onSelectAccount={onSelectAccount}
                    selectedAccountId={selectedAccountId}
                  />
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-sky-100 bg-sky-50/60 px-4 py-6 text-center text-sm font-semibold text-slate-500">
            No brands match this search.
          </p>
        )}
      </div>
    </aside>
  );
};

const SocialAccountTable = ({ accounts, onSelectAccount, onSyncAccount, syncingAccountId }) => {
  const { fetchTokenType } = useMetaKeySettings();
  const selectedFetchKeyLabel = getMetaKeyTypeLabel(fetchTokenType);

  return (
    <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-sky-50">
        <thead className="bg-sky-50/70">
          <tr>
            {['Social account', 'AdsPower Profile', 'Profiles', 'Agency', 'Connection', 'Spend', 'Campaigns', 'Actions'].map((heading) => (
              <th key={heading} className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sky-50">
          {accounts.map((account, index) => {
            const stats = getSocialAccountStats(account, index);
            const canFetch =
              account.sourceTokenId &&
              account.sourceTokenStatus !== 'DEACTIVE' &&
              (fetchTokenType === META_KEY_TYPES.SYSTEM_USER
                ? account.systemUserAccessTokenStatus !== 'DEACTIVE'
                : account.profileAccessTokenStatus !== 'DEACTIVE');

            return (
              <tr
                key={account.id}
                onClick={() => onSelectAccount(account.id)}
                className="cursor-pointer align-middle transition hover:bg-sky-50/70"
              >
                <td className="px-5 py-4">
                  <p className="font-black text-slate-950">{account.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                    <KeyRound size={13} strokeWidth={2.4} />
                    {account.sourceTokenLabel || 'No token label'}
                  </p>
                </td>
                <td className="px-5 py-4 text-sm font-bold text-slate-700">
                  {account.adsPowerProfile || <span className="font-semibold text-slate-400">Not set</span>}
                </td>
                <td className="px-5 py-4">
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                    <BriefcaseBusiness size={13} strokeWidth={2.4} />
                    {profileLabel(account.profileCount || 0)}
                  </span>
                </td>
                <td className="px-5 py-4 text-sm font-bold text-slate-600">
                  {account.agency?.name || 'Unassigned'}
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${connectionStyles[account.connectionStatus] || connectionStyles.UNKNOWN}`}>
                    {statusLabels[account.connectionStatus] || 'Unknown'}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="min-w-max rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
                    <p className="flex items-center gap-1 whitespace-nowrap text-xs font-black text-sky-700">
                      <BadgeDollarSign size={13} strokeWidth={2.2} />
                      {stats.adSpend}
                    </p>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="w-fit rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2">
                    <p className="flex items-center gap-1 text-xs font-black text-indigo-700">
                      <Megaphone size={13} strokeWidth={2.2} />
                      {stats.campaigns}
                    </p>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSyncAccount(account);
                    }}
                    disabled={syncingAccountId === account.id || !canFetch}
                    className="flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-3 text-sm font-bold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                    title={canFetch ? `Fetch latest Meta data using ${selectedFetchKeyLabel}` : `No active ${selectedFetchKeyLabel} for this social account`}
                  >
                    <DownloadCloud size={16} strokeWidth={2.2} />
                    {syncingAccountId === account.id ? 'Fetching' : 'Fetch'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
};

const BusinessProfileMetric = ({ icon: Icon, label, value, tone }) => (
  <div className={`rounded-xl border px-3 py-3 ${tone}`}>
    <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em]">
      <Icon size={13} strokeWidth={2.3} />
      {label}
    </p>
    <p className="mt-2 truncate text-lg font-black">{value}</p>
  </div>
);

const BusinessProfileCard = ({ index, onSelect, profile }) => {
  const stats = getBusinessProfileStats(profile, index);
  const metrics = [
    {
      icon: BriefcaseBusiness,
      label: 'Ad accounts',
      value: stats.adAccountCount,
      tone: 'border-amber-100 bg-amber-50 text-amber-700',
    },
    {
      icon: Megaphone,
      label: 'Campaigns',
      value: stats.campaignCount,
      tone: 'border-indigo-100 bg-indigo-50 text-indigo-700',
    },
    {
      icon: Megaphone,
      label: 'Ad Sets',
      value: stats.adSetCount,
      tone: 'border-sky-100 bg-sky-50 text-sky-700',
    },
    {
      icon: FileText,
      label: 'Ads',
      value: stats.adCount,
      tone: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    },
  ];

  return (
    <button
      type="button"
      onClick={() => onSelect(profile.id)}
      className="rounded-xl border border-sky-100 bg-white p-4 text-left shadow-sm shadow-sky-50 transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg hover:shadow-sky-100 focus:outline-none focus:ring-4 focus:ring-sky-100"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-base font-black text-slate-900">
            <FileText size={17} strokeWidth={2.3} className="shrink-0 text-sky-600" />
            <span className="truncate">{profile.name}</span>
          </p>
          <p className="mt-2 text-xs font-semibold text-slate-500">Meta ID: {profile.metaBusinessId}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${profileStatusStyles[profile.metaStatus] || profileStatusStyles.UNKNOWN}`}>
            {statusLabels[profile.metaStatus] || 'Unknown'}
          </span>
          <p className="mt-2 max-w-32 break-words text-sm font-black leading-tight text-slate-950">{stats.spend}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {metrics.map((metric) => (
          <BusinessProfileMetric key={metric.label} {...metric} />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-400">
        <span>Checked {formatDate(profile.lastStatusCheckedAt)}</span>
        <span>
          Assets {profile.assetMetricsStatus === 'SYNCED' ? formatDate(profile.assetMetricsSyncedAt) : 'Not fetched yet'}
        </span>
      </div>
    </button>
  );
};

const BusinessProfileDetailView = ({
  onSelectAdAccount,
  onSyncAdAccount,
  selectedAccount,
  selectedProfile,
  selectedProfileIndex,
  syncingAdAccountKey,
}) => {
  const { fetchTokenType } = useMetaKeySettings();
  const selectedFetchKeyLabel = getMetaKeyTypeLabel(fetchTokenType);
  const adAccounts = getBusinessProfileAdAccounts(selectedProfile, selectedProfileIndex);
  const canFetch =
    selectedAccount?.sourceTokenId &&
    selectedAccount.sourceTokenStatus !== 'DEACTIVE' &&
    (fetchTokenType === META_KEY_TYPES.SYSTEM_USER
      ? selectedAccount.systemUserAccessTokenStatus !== 'DEACTIVE'
      : selectedAccount.profileAccessTokenStatus !== 'DEACTIVE');

  if (!adAccounts.length) {
    return (
      <div className="rounded-2xl border border-dashed border-sky-100 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500 shadow-sm shadow-sky-50">
        No real ad accounts are saved for this business profile yet. Use the social account Fetch action to pull Meta data.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm shadow-sky-50">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-sky-50">
          <thead className="bg-sky-50/70">
            <tr>
              {['Ad account', 'Status', 'Disapproved', 'Spending', 'Campaigns', 'Fetch'].map((heading) => (
                <th
                  key={heading}
                  className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-sky-700"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sky-50">
            {adAccounts.map((account) => {
              const status = account.connectionStatus || 'UNKNOWN';
              const StatusIcon = status === 'ACTIVE' ? CircleCheck : ShieldAlert;
              const adAccountId = getAdAccountIdForSync(account);
              const isAdAccountSyncing =
                syncingAdAccountKey === getAdAccountSyncKey(selectedProfile.id, adAccountId);
              const canFetchAdAccount = canFetch && adAccountId;
              const disapprovedAdCount = getDisapprovedAdCount(account);

              return (
                <tr
                  key={getAdAccountKey(account)}
                  onClick={() => onSelectAdAccount(getAdAccountKey(account))}
                  className="cursor-pointer align-middle transition hover:bg-sky-50/70"
                >
                  <td className="px-5 py-4">
                    <p className="font-black text-slate-950">{account.name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">
                      ID: {account.accountId || account.id}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${adAccountStatusStyles[status] || adAccountStatusStyles.UNKNOWN}`}>
                      <StatusIcon size={13} strokeWidth={2.5} />
                      {account.statusLabel || (status === 'ACTIVE' ? 'Active' : status === 'BLOCKED' ? 'Blocked' : 'Unknown')}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm font-black text-slate-800">
                    {disapprovedAdCount > 0 ? (
                      <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">
                        {disapprovedAdCount}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm font-black text-slate-800">
                    {formatCurrencyAmount(account.totalSpend, account.currency || 'USD')}
                  </td>
                  <td className="px-5 py-4 text-sm font-black text-slate-800">
                    {account.campaignCount || 0}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSyncAdAccount?.({
                          account: selectedAccount,
                          profile: selectedProfile,
                          adAccount: account,
                        });
                      }}
                      disabled={isAdAccountSyncing || !canFetchAdAccount}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-3 text-sm font-bold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                      title={
                        canFetchAdAccount
                          ? `Fetch ${account.name || 'ad account'} using ${selectedFetchKeyLabel}`
                          : `No active ${selectedFetchKeyLabel} for this ad account`
                      }
                    >
                      <DownloadCloud size={16} strokeWidth={2.2} className={isAdAccountSyncing ? 'animate-pulse' : ''} />
                      {isAdAccountSyncing ? 'Fetching' : 'Fetch'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StatusPill = ({ status }) => (
  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${deliveryStatusStyles[status] || deliveryStatusStyles.UNKNOWN}`}>
    {getDeliveryStatusLabel(status)}
  </span>
);

const AdAccountTabs = ({ activeTab, onChange }) => {
  const tabs = [
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'adSets', label: 'Ad Sets' },
    { id: 'ads', label: 'Ads' },
  ];

  return (
    <div className="flex flex-wrap gap-2 border-b border-sky-50 bg-white px-4 pt-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-t-xl px-4 py-2 text-sm font-black transition ${
            activeTab === tab.id
              ? 'bg-sky-50 text-sky-700'
              : 'text-slate-500 hover:bg-sky-50/70 hover:text-sky-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

const MetricText = ({ children }) => (
  <span className="text-sm font-black text-slate-800">{children}</span>
);

const DisapprovedCount = ({ value }) => {
  const count = Number(value) || 0;

  return count > 0 ? (
    <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">
      {count}
    </span>
  ) : (
    <span className="text-sm font-black text-slate-400">0</span>
  );
};

const EmptyAdHierarchyState = ({ selectedAdAccount }) => (
  <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-10 text-center">
    <div className="max-w-md">
      <Megaphone size={34} strokeWidth={1.9} className="mx-auto text-sky-500" />
      <h3 className="mt-4 text-base font-black text-slate-950">No real ad hierarchy saved yet</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
        {selectedAdAccount?.name || 'This ad account'} has no stored campaigns, ad sets, or ads. Click Fetch on the related social account to sync real Meta data.
      </p>
    </div>
  </div>
);

const CampaignsTable = ({
  canDuplicateCampaign,
  duplicatingCampaignKey,
  onDuplicateCampaign,
  onSelectCampaign,
  publishKeyLabel,
  selectedAdAccount,
  selectedProfile,
  campaigns,
}) => (
  <div className="min-h-0 flex-1 overflow-auto">
    <table className="min-w-full divide-y divide-sky-50">
      <thead className="sticky top-0 z-10 bg-sky-50/95 backdrop-blur">
        <tr>
          {['Campaign', 'Status', 'Disapproved', 'Spending', 'Clicks', 'Leads', 'CPR', 'Ad Sets', 'Duplicate'].map((heading) => (
            <th key={heading} className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-sky-700">
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-sky-50">
        {campaigns.map((campaign) => {
          const campaignId = getCampaignIdForAction(campaign);
          const adAccountId = getAdAccountIdForSync(selectedAdAccount);
          const duplicateKey = getCampaignDuplicateKey(selectedProfile?.id, adAccountId, campaignId);
          const isDuplicatingCampaign = duplicatingCampaignKey === duplicateKey;
          const canDuplicate = canDuplicateCampaign && campaignId;

          return (
            <tr
              key={campaign.id}
              onClick={() => onSelectCampaign(campaign)}
              className="cursor-pointer align-middle transition hover:bg-sky-50/70"
            >
              <td className="px-5 py-4 font-black text-slate-950">{campaign.name}</td>
              <td className="px-5 py-4"><StatusPill status={campaign.status} /></td>
              <td className="px-5 py-4"><DisapprovedCount value={campaign.disapprovedAdCount} /></td>
              <td className="px-5 py-4"><MetricText>{formatCurrencyAmount(campaign.spend)}</MetricText></td>
              <td className="px-5 py-4"><MetricText>{numberFormatter.format(campaign.clicks)}</MetricText></td>
              <td className="px-5 py-4"><MetricText>{numberFormatter.format(campaign.leads)}</MetricText></td>
              <td className="px-5 py-4"><MetricText>{formatCurrencyAmount(campaign.cpr || getRatio(campaign.spend, campaign.leads))}</MetricText></td>
              <td className="px-5 py-4"><MetricText>{campaign.adSetCount}</MetricText></td>
              <td className="px-5 py-4">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDuplicateCampaign?.(campaign);
                  }}
                  disabled={isDuplicatingCampaign || !canDuplicate}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  title={canDuplicate ? `Duplicate with ${publishKeyLabel}` : `No active ${publishKeyLabel} for duplicating`}
                >
                  <CopyPlus size={16} strokeWidth={2.2} className={isDuplicatingCampaign ? 'animate-pulse' : ''} />
                  {isDuplicatingCampaign ? 'Duplicating' : 'Duplicate'}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const AdSetsTable = ({ adSets, onSelectAdSet }) => (
  <div className="min-h-0 flex-1 overflow-auto">
    <table className="min-w-full divide-y divide-sky-50">
      <thead className="sticky top-0 z-10 bg-sky-50/95 backdrop-blur">
        <tr>
          {['Ad Set', 'Status', 'Disapproved', 'Spending', 'Clicks', 'Leads', 'CPR', 'Ads'].map((heading) => (
            <th key={heading} className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-sky-700">
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-sky-50">
        {adSets.map((adSet) => (
          <tr
            key={adSet.id}
            onClick={() => onSelectAdSet(adSet)}
            className="cursor-pointer align-middle transition hover:bg-sky-50/70"
          >
            <td className="px-5 py-4">
              <p className="font-black text-slate-950">{adSet.name}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">{adSet.campaignName}</p>
            </td>
            <td className="px-5 py-4"><StatusPill status={adSet.status} /></td>
            <td className="px-5 py-4"><DisapprovedCount value={adSet.disapprovedAdCount} /></td>
            <td className="px-5 py-4"><MetricText>{formatCurrencyAmount(adSet.spend)}</MetricText></td>
            <td className="px-5 py-4"><MetricText>{numberFormatter.format(adSet.clicks)}</MetricText></td>
            <td className="px-5 py-4"><MetricText>{numberFormatter.format(adSet.leads)}</MetricText></td>
            <td className="px-5 py-4"><MetricText>{formatCurrencyAmount(adSet.cpr || getRatio(adSet.spend, adSet.leads))}</MetricText></td>
            <td className="px-5 py-4"><MetricText>{adSet.adCount}</MetricText></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const AdsTable = ({ ads, onOpenAd }) => (
  <div className="min-h-0 flex-1 overflow-auto">
    <table className="min-w-full divide-y divide-sky-50">
      <thead className="sticky top-0 z-10 bg-sky-50/95 backdrop-blur">
        <tr>
          {['Ad', 'Status', 'FB Page', 'Page Status', 'Clicks', 'CPR', 'Budget', 'Spending'].map((heading) => (
            <th key={heading} className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-sky-700">
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-sky-50">
        {ads.map((ad) => (
          <tr
            key={ad.id}
            onClick={() => onOpenAd(ad)}
            className="cursor-pointer align-middle transition hover:bg-sky-50/70"
          >
            <td className="px-5 py-4">
              <p className="font-black text-slate-950">{ad.title}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">ID: {ad.id}</p>
            </td>
            <td className="px-5 py-4"><StatusPill status={ad.status} /></td>
            <td className="px-5 py-4 font-bold text-slate-700">{ad.pageName}</td>
            <td className="px-5 py-4"><StatusPill status={ad.pageStatus} /></td>
            <td className="px-5 py-4"><MetricText>{numberFormatter.format(ad.clicks)}</MetricText></td>
            <td className="px-5 py-4"><MetricText>{formatCurrencyAmount(ad.cpr || getRatio(ad.spend, ad.leads))}</MetricText></td>
            <td className="px-5 py-4"><MetricText>{formatCurrencyAmount(ad.budget)}</MetricText></td>
            <td className="px-5 py-4"><MetricText>{formatCurrencyAmount(ad.spend)}</MetricText></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const DetailItem = ({ label, value }) => (
  <div className="rounded-xl border border-sky-50 bg-sky-50/60 px-3 py-2">
    <p className="text-xs font-black uppercase tracking-[0.12em] text-sky-700">{label}</p>
    <p className="mt-1 break-words text-sm font-bold text-slate-800">{value || '-'}</p>
  </div>
);

const AdDetailsModal = ({ ad, context, onClose }) => {
  if (!ad) {
    return null;
  }

  const insights = [
    ['Spend', formatCurrencyAmount(ad.spend)],
    ['Impressions', numberFormatter.format(ad.impressions)],
    ['Reach', numberFormatter.format(ad.reach)],
    ['Clicks', numberFormatter.format(ad.clicks)],
    ['Leads', numberFormatter.format(ad.leads)],
    ['CTR', `${percentFormatter.format(ad.ctr)}%`],
    ['CPC', formatCurrencyAmount(ad.cpc)],
    ['CPL', formatCurrencyAmount(ad.cpl)],
  ];

  const details = [
    ['Ad ID', ad.id],
    ['Status', getDeliveryStatusLabel(ad.status)],
    ['Effective Status', getDeliveryStatusLabel(ad.effectiveStatus)],
    ['Configured Status', getDeliveryStatusLabel(ad.configuredStatus)],
    ['Page', ad.pageName],
    ['Page ID', ad.pageId],
    ['Page Status', getDeliveryStatusLabel(ad.pageStatus)],
    ['Creative ID', ad.creativeId],
    ['Video ID', ad.videoId],
    ['Image Hash', ad.imageHash],
    ['Story ID', ad.storyId],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl shadow-slate-900/20">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-sky-50 bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">
              {context.socialAccount} / {context.businessProfile} / {context.adAccount} / {ad.campaignName} / {ad.adSetName}
            </p>
            <h3 className="mt-2 truncate text-xl font-black text-slate-950">{ad.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-100 text-slate-500 transition hover:bg-sky-50 hover:text-sky-700"
            title="Close"
          >
            <X size={18} strokeWidth={2.3} />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-2xl border border-sky-100 bg-slate-950 p-4 text-white">
            <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-800">
              {ad.thumbnailUrl ? (
                <img
                  src={ad.thumbnailUrl}
                  alt=""
                  className="h-full w-full rounded-xl object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="text-center">
                  <FileText size={38} strokeWidth={1.8} className="mx-auto text-sky-300" />
                  <p className="mt-3 text-sm font-black">{ad.mediaType} preview</p>
                  <p className="mt-1 text-xs font-semibold text-slate-300">
                    {ad.videoId ? `Thumbnail for ${ad.videoId}` : ad.imageHash}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <section>
              <h4 className="text-sm font-black uppercase tracking-[0.14em] text-sky-700">Insights</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {insights.map(([label, value]) => (
                  <DetailItem key={label} label={label} value={value} />
                ))}
              </div>
            </section>

            <section>
              <h4 className="text-sm font-black uppercase tracking-[0.14em] text-sky-700">Ad Details</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {details.map(([label, value]) => (
                  <DetailItem key={label} label={label} value={value} />
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdAccountDetailView = ({
  duplicatingCampaignKey,
  onDuplicateCampaign,
  selectedAccount,
  selectedAdAccount,
  selectedProfile,
}) => {
  const { publishTokenType } = useMetaKeySettings();
  const [activeTab, setActiveTab] = useState('campaigns');
  const [selectedAd, setSelectedAd] = useState(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [selectedAdSetId, setSelectedAdSetId] = useState(null);
  const hierarchy = buildAdAccountHierarchy(selectedAdAccount);
  const selectedCampaign = hierarchy.campaigns.find((campaign) => campaign.id === selectedCampaignId);
  const selectedAdSet = hierarchy.adSets.find((adSet) => adSet.id === selectedAdSetId);
  const visibleAdSets = selectedCampaignId
    ? hierarchy.adSets.filter((adSet) => adSet.campaignId === selectedCampaignId)
    : hierarchy.adSets;
  const visibleAds = selectedAdSetId
    ? hierarchy.ads.filter((ad) => ad.adSetId === selectedAdSetId)
    : selectedCampaignId
      ? hierarchy.ads.filter((ad) => ad.campaignId === selectedCampaignId)
      : hierarchy.ads;
  const publishKeyLabel = getMetaKeyTypeLabel(publishTokenType);
  const canDuplicateCampaign =
    selectedAccount?.sourceTokenId &&
    selectedAccount.sourceTokenStatus !== 'DEACTIVE' &&
    (publishTokenType === META_KEY_TYPES.SYSTEM_USER
      ? selectedAccount.systemUserAccessTokenStatus !== 'DEACTIVE'
      : selectedAccount.profileAccessTokenStatus !== 'DEACTIVE') &&
    getAdAccountIdForSync(selectedAdAccount);
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);

    if (tabId === 'campaigns') {
      setSelectedCampaignId(null);
      setSelectedAdSetId(null);
    }

    if (tabId === 'adSets') {
      setSelectedAdSetId(null);
    }
  };
  const selectCampaign = (campaign) => {
    setSelectedCampaignId(campaign.id);
    setSelectedAdSetId(null);
    setActiveTab('adSets');
  };
  const selectAdSet = (adSet) => {
    setSelectedCampaignId(adSet.campaignId);
    setSelectedAdSetId(adSet.id);
    setActiveTab('ads');
  };

  return (
    <>
      <div className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm shadow-sky-50">
        <AdAccountTabs activeTab={activeTab} onChange={handleTabChange} />

        {selectedCampaign || selectedAdSet ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-sky-50 bg-sky-50/40 px-5 py-3">
            {selectedCampaign ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-black text-sky-700 ring-1 ring-sky-100">
                Campaign: {selectedCampaign.name}
              </span>
            ) : null}
            {selectedAdSet ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-black text-indigo-700 ring-1 ring-indigo-100">
                Ad set: {selectedAdSet.name}
              </span>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'campaigns' ? (
          hierarchy.campaigns.length ? (
            <CampaignsTable
              campaigns={hierarchy.campaigns}
              canDuplicateCampaign={canDuplicateCampaign}
              duplicatingCampaignKey={duplicatingCampaignKey}
              onDuplicateCampaign={(campaign) =>
                onDuplicateCampaign?.({
                  account: selectedAccount,
                  profile: selectedProfile,
                  adAccount: selectedAdAccount,
                  campaign,
                })
              }
              onSelectCampaign={selectCampaign}
              publishKeyLabel={publishKeyLabel}
              selectedAdAccount={selectedAdAccount}
              selectedProfile={selectedProfile}
            />
          ) : (
            <EmptyAdHierarchyState selectedAdAccount={selectedAdAccount} />
          )
        ) : null}
        {activeTab === 'adSets' ? (
          visibleAdSets.length ? (
            <AdSetsTable adSets={visibleAdSets} onSelectAdSet={selectAdSet} />
          ) : (
            <EmptyAdHierarchyState selectedAdAccount={selectedAdAccount} />
          )
        ) : null}
        {activeTab === 'ads' ? (
          visibleAds.length ? (
            <AdsTable ads={visibleAds} onOpenAd={setSelectedAd} />
          ) : (
            <EmptyAdHierarchyState selectedAdAccount={selectedAdAccount} />
          )
        ) : null}
      </div>

      <AdDetailsModal
        ad={selectedAd}
        context={{
          socialAccount: selectedAccount.name,
          businessProfile: selectedProfile.name,
          adAccount: selectedAdAccount.name,
        }}
        onClose={() => setSelectedAd(null)}
      />
    </>
  );
};

const SelectedBrandView = ({
  brand,
  brands,
  duplicatingCampaignKey,
  onBack,
  onDuplicateCampaign,
  onSelectAccount,
  onSelectAdAccount,
  onSelectBrand,
  onSelectProfile,
  onSyncAdAccount,
  onSyncAccount,
  selectedAccountId,
  selectedAdAccountId,
  selectedBrandId,
  selectedProfileId,
  syncingAdAccountKey,
  syncingAccountId,
}) => {
  const stats = getBrandStats(brand);
  const accounts = brand.assignedSocialAccounts || [];
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const selectedProfiles = selectedAccount?.businessProfiles || [];
  const selectedProfile = selectedProfiles.find((profile) => profile.id === selectedProfileId);
  const selectedProfileIndex = selectedProfile
    ? selectedProfiles.findIndex((profile) => profile.id === selectedProfile.id)
    : -1;
  const selectedProfileStats = selectedProfile
    ? getBusinessProfileStats(selectedProfile, selectedProfileIndex)
    : null;
  const selectedProfileAdAccounts = selectedProfile
    ? getBusinessProfileAdAccounts(selectedProfile, selectedProfileIndex)
    : [];
  const selectedAdAccount = selectedProfileAdAccounts.find(
    (account) => getAdAccountKey(account) === selectedAdAccountId
  );
  const selectedAccountIndex = selectedAccount
    ? accounts.findIndex((account) => account.id === selectedAccount.id)
    : -1;
  const selectedAccountStats = selectedAccount
    ? getSocialAccountStats(selectedAccount, selectedAccountIndex)
    : null;
  const selectProfileFromTitle = (profileId) => {
    onSelectProfile(profileId);

    if (!selectedAdAccountId) {
      return;
    }

    const nextProfileIndex = selectedProfiles.findIndex((profile) => profile.id === profileId);
    const nextProfile = selectedProfiles[nextProfileIndex];
    const nextAdAccounts = nextProfile ? getBusinessProfileAdAccounts(nextProfile, nextProfileIndex) : [];
    onSelectAdAccount(nextAdAccounts.length ? getAdAccountKey(nextAdAccounts[0]) : null);
  };

  return (
    <div className="grid h-full min-h-0 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)] xl:overflow-hidden">
      <BrandTreeSidebar
        brands={brands}
        onBack={onBack}
        onSelectAccount={onSelectAccount}
        onSelectBrand={onSelectBrand}
        selectedAccountId={selectedAccountId}
        selectedBrandId={selectedBrandId}
      />

      <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="shrink-0 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-sky-50">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
            <div className="min-w-0 xl:flex-1">
              <div className="flex items-start gap-3">
                {selectedAccount ? (
                  <SocialAccountAvatar account={selectedAccount} size="lg" />
                ) : (
                  <span className="mt-2 h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: brand.color }} />
                )}
                <div className="min-w-0">
                  {selectedAdAccount && selectedAccount ? (
                    <p className="truncate text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                      {selectedAccount.name}
                    </p>
                  ) : selectedProfile && selectedAccount ? (
                    <p className="truncate text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                      {selectedAccount.name}
                    </p>
                  ) : null}
                  <h2 className="truncate text-2xl font-black text-slate-950">
                    {selectedProfile?.name || selectedAccount?.name || brand.name}
                  </h2>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-700">
                  <Users size={13} strokeWidth={2.4} />
                  {brand.name}
                </span>
                {selectedProfile && !selectedAdAccount ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                    <BriefcaseBusiness size={13} strokeWidth={2.4} />
                    Business profile
                  </span>
                ) : null}
                {selectedAccount && !selectedProfile ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                    <BriefcaseBusiness size={13} strokeWidth={2.4} />
                    {profileLabel(selectedAccount.profileCount || 0)}
                  </span>
                ) : null}
                {selectedAccount?.sourceTokenLabel ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
                    <KeyRound size={13} strokeWidth={2.4} />
                    {selectedAccount.sourceTokenLabel}
                  </span>
                ) : null}
              </div>
            </div>

            {selectedProfile && selectedProfiles.length ? (
              <label className="grid w-full gap-1 xl:max-w-xs">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Business profile</span>
                <select
                  value={selectedProfile.id}
                  onChange={(event) => selectProfileFromTitle(event.target.value)}
                  className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                >
                  {selectedProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {selectedAdAccount && selectedProfileAdAccounts.length ? (
              <label className="grid w-full gap-1 xl:max-w-xs">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Ad account</span>
                <select
                  value={getAdAccountKey(selectedAdAccount)}
                  onChange={(event) => onSelectAdAccount(event.target.value)}
                  className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                >
                  {selectedProfileAdAccounts.map((account) => (
                    <option key={getAdAccountKey(account)} value={getAdAccountKey(account)}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:min-w-[22rem] sm:grid-cols-[minmax(max-content,1.2fr)_minmax(8rem,0.8fr)] xl:max-w-[32rem]">
              <div className="min-w-0 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                <p className="flex items-center gap-1 text-xs font-black uppercase tracking-[0.12em] text-sky-700">
                  <BadgeDollarSign size={13} strokeWidth={2.2} />
                  Spend
                </p>
                <p className="mt-2 break-words text-xl font-black leading-tight text-slate-950">
                  {selectedAdAccount
                    ? formatCurrencyAmount(selectedAdAccount.totalSpend, selectedAdAccount.currency || 'USD')
                    : selectedProfileStats?.spend || selectedAccountStats?.adSpend || stats.adSpend}
                </p>
              </div>
              <div className="min-w-0 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                <p className="flex items-center gap-1 text-xs font-black uppercase tracking-[0.12em] text-indigo-700">
                  <Megaphone size={13} strokeWidth={2.2} />
                  Campaigns
                </p>
                <p className="mt-2 break-words text-xl font-black leading-tight text-slate-950">
                  {selectedAdAccount
                    ? selectedAdAccount.campaignCount || 0
                    : selectedProfileStats?.campaignCount || selectedAccountStats?.campaigns || stats.campaigns}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {selectedAccount ? (
            selectedAdAccount ? (
              <AdAccountDetailView
                duplicatingCampaignKey={duplicatingCampaignKey}
                key={getAdAccountKey(selectedAdAccount)}
                onDuplicateCampaign={onDuplicateCampaign}
                selectedAccount={selectedAccount}
                selectedAdAccount={selectedAdAccount}
                selectedProfile={selectedProfile}
              />
            ) : selectedProfile ? (
              <BusinessProfileDetailView
                onSelectAdAccount={onSelectAdAccount}
                onSyncAdAccount={onSyncAdAccount}
                selectedAccount={selectedAccount}
                selectedProfile={selectedProfile}
                selectedProfileIndex={selectedProfileIndex}
                syncingAdAccountKey={syncingAdAccountKey}
              />
            ) : selectedProfiles.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {selectedProfiles.map((profile, index) => (
                  <BusinessProfileCard
                    key={profile.id}
                    index={index}
                    profile={profile}
                    onSelect={onSelectProfile}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-sky-100 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500">
                No business profiles saved under this social account yet.
              </p>
            )
          ) : accounts.length ? (
            <SocialAccountTable
              accounts={accounts}
              onSelectAccount={onSelectAccount}
              onSyncAccount={onSyncAccount}
              syncingAccountId={syncingAccountId}
            />
          ) : (
            <p className="rounded-2xl border border-dashed border-sky-100 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500">
              No social accounts assigned to this brand yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
};

const OverviewPage = () => {
  const [brands, setBrands] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedAdAccountId, setSelectedAdAccountId] = useState(null);
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [duplicatingCampaignKey, setDuplicatingCampaignKey] = useState('');
  const [error, setError] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const loadOverviewRef = useRef(null);
  const { startAdAccountSync, startSocialAccountSync, syncingAdAccountKey, syncingAccountId } = useMetaSync();
  const { publishTokenType } = useMetaKeySettings();
  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId);
  const filteredBrands = brands.filter((brand) => brandMatchesSearch(brand, brandSearch));

  const loadOverview = async () => {
    setLoading(true);
    try {
      const data = await businessDataApi.getBrands();
      setBrands(data.brands);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverviewRef.current = loadOverview;
  });

  useEffect(() => {
    const refreshAfterSync = () => {
      loadOverviewRef.current?.();
    };

    window.addEventListener('meta-sync-completed', refreshAfterSync);
    return () => window.removeEventListener('meta-sync-completed', refreshAfterSync);
  }, []);

  const selectBrand = (brandId) => {
    setSelectedBrandId(brandId);
    setSelectedAccountId(null);
    setSelectedAdAccountId(null);
    setSelectedProfileId(null);
  };

  const selectAccount = (accountId) => {
    setSelectedAccountId(accountId);
    setSelectedAdAccountId(null);
    setSelectedProfileId(null);
  };

  const selectProfile = (profileId) => {
    setSelectedProfileId(profileId);
    setSelectedAdAccountId(null);
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
    const publishKeyLabel = getMetaKeyTypeLabel(publishTokenType);

    toast.loading(`Duplicating and fetching ${campaign.name || 'campaign'} with ${publishKeyLabel}`, {
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
      await loadOverviewRef.current?.();
    } catch (requestError) {
      toast.error(requestError.message || 'Campaign duplicate failed', {
        id: toastId,
        position: 'top-center',
      });
    } finally {
      setDuplicatingCampaignKey('');
    }
  };

  useEffect(() => {
    let isMounted = true;

    businessDataApi
      .getBrands()
      .then((data) => {
        if (isMounted) {
          setBrands(data.brands);
          setError('');
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <DashboardHeader
          title="Overview"
          description="Review brand-level social accounts and placeholder advertising performance."
          action={
            <button
              type="button"
              onClick={loadOverview}
              className="h-11 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
            >
              Refresh
            </button>
          }
        />
      </div>

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      {loading ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DashboardPanel title="Brands">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-52 animate-pulse rounded-xl bg-sky-50" />
              ))}
            </div>
          </DashboardPanel>
        </div>
      ) : selectedBrand ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <SelectedBrandView
            brand={selectedBrand}
            brands={brands}
            duplicatingCampaignKey={duplicatingCampaignKey}
            onBack={() => {
              setSelectedBrandId(null);
              setSelectedAccountId(null);
              setSelectedAdAccountId(null);
              setSelectedProfileId(null);
            }}
            onDuplicateCampaign={duplicateCampaign}
            onSelectAccount={selectAccount}
            onSelectAdAccount={setSelectedAdAccountId}
            onSelectBrand={selectBrand}
            onSelectProfile={selectProfile}
            onSyncAdAccount={startAdAccountSync}
            onSyncAccount={startSocialAccountSync}
            selectedAccountId={selectedAccountId}
            selectedAdAccountId={selectedAdAccountId}
            selectedBrandId={selectedBrandId}
            selectedProfileId={selectedProfileId}
            syncingAdAccountKey={syncingAdAccountKey}
            syncingAccountId={syncingAccountId}
          />
        </div>
      ) : brands.length ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DashboardPanel
            title="Brands"
            headerAction={<BrandSearchBox value={brandSearch} onChange={setBrandSearch} placeholder="Search brand" />}
          >
            {filteredBrands.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredBrands.map((brand) => (
                  <BrandCard key={brand.id} brand={brand} onSelect={selectBrand} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-sky-100 bg-sky-50/60 px-5 py-8 text-center text-sm font-semibold text-slate-500">
                No brands match this search.
              </p>
            )}
          </DashboardPanel>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DashboardPanel title="Brands">
            <p className="rounded-xl border border-dashed border-sky-100 bg-sky-50/60 px-5 py-8 text-center text-sm font-semibold text-slate-500">
              No brands added yet.
            </p>
          </DashboardPanel>
        </div>
      )}
    </div>
  );
};

export default OverviewPage;
