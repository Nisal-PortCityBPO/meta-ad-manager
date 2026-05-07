import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BadgeDollarSign,
  BriefcaseBusiness,
  ChevronDown,
  CircleCheck,
  FileText,
  KeyRound,
  Megaphone,
  Radio,
  ShieldAlert,
  Users,
} from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { businessDataApi } from '../../dashboard/api/businessDataApi';

const hardcodedBrandStats = {
  A200M: { adSpend: '$12,480', campaigns: 18 },
  ASIA100: { adSpend: '$8,920', campaigns: 11 },
  ASIA200: { adSpend: '$15,340', campaigns: 23 },
  ASIA300: { adSpend: '$6,175', campaigns: 9 },
};

const fallbackStats = { adSpend: '$3,500', campaigns: 5 };

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

const statusLabels = {
  CONNECTED: 'Connected',
  BLOCKED: 'Blocked',
  DISABLED: 'Disabled',
  UNKNOWN: 'Unknown',
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const formatCurrencyAmount = (amount, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
  } catch {
    return currencyFormatter.format(Number(amount) || 0);
  }
};

const socialAccountLabel = (count) => `${count} ${count === 1 ? 'social account' : 'social accounts'}`;
const profileLabel = (count) => `${count} ${count === 1 ? 'profile' : 'profiles'}`;
const agencyLabel = (count) => `${count} ${count === 1 ? 'agency' : 'agencies'}`;

const getBrandStats = (brand) => hardcodedBrandStats[brand.name] || fallbackStats;

const numberFromText = (value = '') =>
  value.split('').reduce((total, character) => total + character.charCodeAt(0), 0);

const getSocialAccountStats = (account, index = 0) => {
  const seed = numberFromText(`${account.id}${account.name}`) + index * 67;

  return {
    adSpend: currencyFormatter.format(2400 + (seed % 11800)),
    campaigns: 4 + (seed % 17),
  };
};

const getBusinessProfileStats = (profile, index = 0) => {
  if (profile.assetMetricsStatus === 'SYNCED') {
    return {
      adAccountCount: profile.adAccountCount || 0,
      facebookPageCount: profile.facebookPageCount || 0,
      campaignCount: profile.campaignCount || 0,
      spend: formatProfileSpend(profile),
    };
  }

  const seed = numberFromText(`${profile.id}${profile.name}`) + index * 43;

  return {
    adAccountCount: 1 + (seed % 6),
    facebookPageCount: 1 + (seed % 4),
    campaignCount: 5 + (seed % 22),
    spend: currencyFormatter.format(1800 + (seed % 9400)),
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

const getDemoAdAccounts = (profile, profileIndex = 0) => {
  const profileStats = getBusinessProfileStats(profile, profileIndex);
  const count = Math.max(profileStats.adAccountCount || 0, 3);
  const seed = numberFromText(`${profile.id}${profile.name}`) + profileIndex * 59;

  return Array.from({ length: count }).map((_, index) => {
    const isBlocked = (seed + index * 7) % 5 === 0;

    return {
      id: `demo-ad-account-${profile.id}-${index}`,
      accountId: `${100000 + seed + index * 113}`,
      name: `${profile.name} Ad Account ${index + 1}`,
      currency: 'USD',
      connectionStatus: isBlocked ? 'BLOCKED' : 'ACTIVE',
      statusLabel: isBlocked ? 'Blocked' : 'Active',
      campaignCount: 2 + ((seed + index * 3) % 12),
      totalSpend: 850 + ((seed + index * 211) % 6200),
      isDemo: true,
    };
  });
};

const getBusinessProfileAdAccounts = (profile, profileIndex = 0) => {
  if (Array.isArray(profile.adAccounts) && profile.adAccounts.length) {
    return profile.adAccounts.map((account) => ({
      ...account,
      connectionStatus: account.connectionStatus || 'UNKNOWN',
      statusLabel: account.statusLabel || 'Unknown',
    }));
  }

  return getDemoAdAccounts(profile, profileIndex);
};

const getAdAccountKey = (account) => account.id || account.accountId;

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

        <div className="shrink-0 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-right">
          <p className="flex items-center justify-end gap-1 text-xs font-black uppercase tracking-[0.12em] text-sky-700">
            <BadgeDollarSign size={13} strokeWidth={2.2} />
            Spend
          </p>
          <p className="mt-1 text-base font-black text-slate-950">{stats.adSpend}</p>
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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {brands.map((brand) => {
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
                  <p className="shrink-0 text-xs font-black text-sky-700">{stats.adSpend}</p>
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
        })}
      </div>
    </aside>
  );
};

const SocialAccountTable = ({ accounts, onSelectAccount }) => (
  <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-sky-50">
        <thead className="bg-sky-50/70">
          <tr>
            {['Social account', 'Profiles', 'Agency', 'Connection', 'Spend', 'Campaigns'].map((heading) => (
              <th key={heading} className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sky-50">
          {accounts.map((account, index) => {
            const stats = getSocialAccountStats(account, index);

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
                  <div className="w-fit rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
                    <p className="flex items-center gap-1 text-xs font-black text-sky-700">
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

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
      icon: FileText,
      label: 'FB pages',
      value: stats.facebookPageCount,
      tone: 'border-sky-100 bg-sky-50 text-sky-700',
    },
    {
      icon: Megaphone,
      label: 'Campaigns',
      value: stats.campaignCount,
      tone: 'border-indigo-100 bg-indigo-50 text-indigo-700',
    },
    {
      icon: BadgeDollarSign,
      label: 'Spend',
      value: stats.spend,
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
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${profileStatusStyles[profile.metaStatus] || profileStatusStyles.UNKNOWN}`}>
          {statusLabels[profile.metaStatus] || 'Unknown'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {metrics.map((metric) => (
          <BusinessProfileMetric key={metric.label} {...metric} />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-400">
        <span>Checked {formatDate(profile.lastStatusCheckedAt)}</span>
        <span>
          Assets {profile.assetMetricsStatus === 'SYNCED' ? formatDate(profile.assetMetricsSyncedAt) : 'Using demo data'}
        </span>
      </div>
    </button>
  );
};

const BusinessProfileDetailView = ({ onSelectAdAccount, selectedProfile, selectedProfileIndex }) => {
  const adAccounts = getBusinessProfileAdAccounts(selectedProfile, selectedProfileIndex);

  return (
    <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm shadow-sky-50">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-sky-50">
          <thead className="bg-sky-50/70">
            <tr>
              {['Ad account', 'Status', 'Spending', 'Campaigns'].map((heading) => (
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
                    {formatCurrencyAmount(account.totalSpend, account.currency || 'USD')}
                  </td>
                  <td className="px-5 py-4 text-sm font-black text-slate-800">
                    {account.campaignCount || 0}
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

const AdAccountDetailView = () => (
  <div className="min-h-full rounded-2xl border border-sky-100 bg-white shadow-sm shadow-sky-50" />
);

const SelectedBrandView = ({
  brand,
  brands,
  onBack,
  onSelectAccount,
  onSelectAdAccount,
  onSelectBrand,
  onSelectProfile,
  selectedAccountId,
  selectedAdAccountId,
  selectedBrandId,
  selectedProfileId,
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

            <div className="grid grid-cols-2 gap-3 sm:w-72">
              <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                <p className="flex items-center gap-1 text-xs font-black uppercase tracking-[0.12em] text-sky-700">
                  <BadgeDollarSign size={13} strokeWidth={2.2} />
                  Spend
                </p>
                <p className="mt-2 text-xl font-black text-slate-950">
                  {selectedAdAccount
                    ? formatCurrencyAmount(selectedAdAccount.totalSpend, selectedAdAccount.currency || 'USD')
                    : selectedProfileStats?.spend || selectedAccountStats?.adSpend || stats.adSpend}
                </p>
              </div>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                <p className="flex items-center gap-1 text-xs font-black uppercase tracking-[0.12em] text-indigo-700">
                  <Megaphone size={13} strokeWidth={2.2} />
                  Campaigns
                </p>
                <p className="mt-2 text-xl font-black text-slate-950">
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
              <AdAccountDetailView />
            ) : selectedProfile ? (
              <BusinessProfileDetailView
                onSelectAdAccount={onSelectAdAccount}
                selectedProfile={selectedProfile}
                selectedProfileIndex={selectedProfileIndex}
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
            <SocialAccountTable accounts={accounts} onSelectAccount={onSelectAccount} />
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
  const [error, setError] = useState('');
  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId);

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
            onBack={() => {
              setSelectedBrandId(null);
              setSelectedAccountId(null);
              setSelectedAdAccountId(null);
              setSelectedProfileId(null);
            }}
            onSelectAccount={selectAccount}
            onSelectAdAccount={setSelectedAdAccountId}
            onSelectBrand={selectBrand}
            onSelectProfile={selectProfile}
            selectedAccountId={selectedAccountId}
            selectedAdAccountId={selectedAdAccountId}
            selectedBrandId={selectedBrandId}
            selectedProfileId={selectedProfileId}
          />
        </div>
      ) : brands.length ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DashboardPanel title="Brands">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {brands.map((brand) => (
                <BrandCard key={brand.id} brand={brand} onSelect={selectBrand} />
              ))}
            </div>
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
