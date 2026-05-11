const Brand = require('../brands/brand.model');
const { BusinessProfile } = require('../business-profiles/businessProfile.model');
const { Token } = require('../token-management/token.model');

const DETAIL_LEVELS = [
  { value: 'campaign', label: 'Campaign Level' },
  { value: 'ad_set', label: 'Ad Set Level' },
  { value: 'ad', label: 'Ad Level' },
];

const DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'one_week', label: 'One week' },
  { value: 'one_month', label: 'One month' },
];

function toId(value) {
  return value?._id?.toString?.() || value?.toString?.() || '';
}

function normalizeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function getMetric(item, key) {
  return normalizeNumber(item?.[key] ?? item?.insights?.[key]);
}

function getCtr(item) {
  const storedCtr = getMetric(item, 'ctr');

  if (storedCtr) {
    return storedCtr;
  }

  const impressions = getMetric(item, 'impressions');
  const clicks = getMetric(item, 'clicks');

  return impressions ? (clicks / impressions) * 100 : 0;
}

function getAdAccountValue(profile, account) {
  return `${profile._id.toString()}::${account.id || account.accountId || account.name || 'unknown'}`;
}

function getStatusLabel(status) {
  return String(status || 'UNKNOWN').replaceAll('_', ' ');
}

function safeToken(token) {
  if (!token) {
    return null;
  }

  return {
    id: token._id.toString(),
    label: token.label,
    adsPowerProfile: token.adsPowerProfile || '',
    brand: token.brand
      ? {
          id: toId(token.brand),
          name: token.brand.name || '',
          color: token.brand.color || null,
        }
      : null,
    agency: token.agency
      ? {
          id: toId(token.agency),
          name: token.agency.name || '',
        }
      : null,
  };
}

function safeBrand(brand) {
  return {
    id: brand._id.toString(),
    name: brand.name,
    color: brand.color,
  };
}

function safeSocialAccount(account) {
  if (!account) {
    return null;
  }

  return {
    id: toId(account),
    name: account.name || '',
    metaAccountId: account.metaAccountId || '',
    profileImageUrl: account.profileImageUrl || null,
  };
}

function safeBusinessProfile(profile) {
  if (!profile) {
    return null;
  }

  return {
    id: profile._id.toString(),
    name: profile.name,
    metaBusinessId: profile.metaBusinessId,
    status: profile.metaStatus,
    lastSyncedAt: profile.lastSyncedAt,
  };
}

function toAdAccountOption(profile, account) {
  const socialAccount = safeSocialAccount(profile.socialAccount);

  return {
    value: getAdAccountValue(profile, account),
    id: account.id || account.accountId || '',
    accountId: account.accountId || account.id || '',
    name: account.name || account.accountId || account.id || 'Unnamed ad account',
    status: account.connectionStatus || 'UNKNOWN',
    currency: account.currency || profile.spendCurrency || 'USD',
    campaignCount: account.campaignCount || 0,
    lastFetchedAt: account.hierarchySyncedAt || profile.assetMetricsSyncedAt || profile.lastSyncedAt || null,
    businessProfile: safeBusinessProfile(profile),
    socialAccount,
  };
}

function getDateRange(value) {
  return DATE_RANGES.find((range) => range.value === value) || DATE_RANGES[2];
}

function getDetailLevel(value) {
  return DETAIL_LEVELS.find((level) => level.value === value) || DETAIL_LEVELS[0];
}

async function loadOptionsScope(filters = {}) {
  const brands = await Brand.find().sort({ name: 1 });
  const selectedBrand =
    brands.find((brand) => brand._id.toString() === String(filters.brandId || '')) || brands[0] || null;
  const tokenQuery = selectedBrand ? { brand: selectedBrand._id } : {};
  const tokens = await Token.find(tokenQuery)
    .populate('brand', 'name color')
    .populate('agency', 'name')
    .sort({ label: 1 });
  const selectedToken =
    tokens.find((token) => token._id.toString() === String(filters.tokenId || '')) || tokens[0] || null;
  const profileQuery = selectedToken ? { sourceToken: selectedToken._id } : { _id: null };
  const profiles = await BusinessProfile.find(profileQuery)
    .populate('socialAccount', 'name metaAccountId profileImageUrl')
    .sort({ socialAccountName: 1, name: 1 });
  const adAccounts = profiles.flatMap((profile) =>
    (Array.isArray(profile.adAccounts) ? profile.adAccounts : []).map((account) => toAdAccountOption(profile, account))
  );
  const selectedAdAccount =
    adAccounts.find((account) => account.value === String(filters.adAccountKey || '')) || adAccounts[0] || null;

  return {
    brands,
    selectedBrand,
    tokens,
    selectedToken,
    profiles,
    adAccounts,
    selectedAdAccount,
  };
}

function getScopeOptions(scope, filters = {}) {
  const detailLevel = getDetailLevel(filters.detailLevel);
  const dateRange = getDateRange(filters.dateRange);

  return {
    brands: scope.brands.map(safeBrand),
    tokens: scope.tokens.map(safeToken),
    adAccounts: scope.adAccounts,
    detailLevels: DETAIL_LEVELS,
    dateRanges: DATE_RANGES,
    selected: {
      brandId: scope.selectedBrand?._id?.toString() || '',
      tokenId: scope.selectedToken?._id?.toString() || '',
      adAccountKey: scope.selectedAdAccount?.value || '',
      detailLevel: detailLevel.value,
      dateRange: dateRange.value,
    },
  };
}

function findSelectedProfileAndAdAccount(profiles, selectedAdAccountKey) {
  for (const profile of profiles) {
    const account = (Array.isArray(profile.adAccounts) ? profile.adAccounts : []).find(
      (adAccount) => getAdAccountValue(profile, adAccount) === selectedAdAccountKey
    );

    if (account) {
      return {
        profile,
        account,
      };
    }
  }

  return {
    profile: null,
    account: null,
  };
}

function buildBaseRow({ item, type, parents = {}, currency = 'USD', fallbackId = '' }) {
  const spend = getMetric(item, 'spend');
  const clicks = getMetric(item, 'clicks');
  const impressions = getMetric(item, 'impressions');
  const reach = getMetric(item, 'reach');
  const leads = getMetric(item, 'leads');
  const results = getMetric(item, 'results');

  return {
    id: String(item?.id || item?._id || fallbackId || item?.name || `${type}-item`),
    type,
    name: item?.name || item?.title || `${type} item`,
    status: item?.status || item?.effectiveStatus || item?.configuredStatus || 'UNKNOWN',
    statusLabel: getStatusLabel(item?.status || item?.effectiveStatus || item?.configuredStatus),
    spend,
    clicks,
    impressions,
    reach,
    leads,
    results,
    ctr: getCtr(item),
    cpr: getMetric(item, 'cpr') || (results ? spend / results : leads ? spend / leads : 0),
    budget: getMetric(item, 'budget'),
    currency,
    ...parents,
  };
}

function buildRows(adAccount, detailLevel) {
  const campaigns = Array.isArray(adAccount?.campaigns) ? adAccount.campaigns : [];
  const currency = adAccount?.currency || 'USD';

  if (detailLevel === 'campaign') {
    return campaigns.map((campaign, campaignIndex) => ({
      ...buildBaseRow({ item: campaign, type: 'Campaign', currency, fallbackId: `campaign-${campaignIndex}` }),
      childCount: Array.isArray(campaign.adSets) ? campaign.adSets.length : normalizeNumber(campaign.adSetCount),
    }));
  }

  if (detailLevel === 'ad_set') {
    return campaigns.flatMap((campaign, campaignIndex) =>
      (Array.isArray(campaign.adSets) ? campaign.adSets : []).map((adSet, adSetIndex) => ({
        ...buildBaseRow({
          item: adSet,
          type: 'Ad Set',
          currency,
          fallbackId: `campaign-${campaignIndex}-ad-set-${adSetIndex}`,
          parents: {
            campaignId: String(campaign.id || ''),
            campaignName: campaign.name || '',
          },
        }),
        budget: getMetric(adSet, 'budget') || getMetric(campaign, 'budget'),
        childCount: Array.isArray(adSet.ads) ? adSet.ads.length : normalizeNumber(adSet.adCount),
      }))
    );
  }

  return campaigns.flatMap((campaign, campaignIndex) =>
    (Array.isArray(campaign.adSets) ? campaign.adSets : []).flatMap((adSet, adSetIndex) =>
      (Array.isArray(adSet.ads) ? adSet.ads : []).map((ad, adIndex) => ({
        ...buildBaseRow({
          item: ad,
          type: 'Ad',
          currency,
          fallbackId: `campaign-${campaignIndex}-ad-set-${adSetIndex}-ad-${adIndex}`,
          parents: {
            campaignId: String(campaign.id || ''),
            campaignName: campaign.name || '',
            adSetId: String(adSet.id || ''),
            adSetName: adSet.name || '',
          },
        }),
        budget: getMetric(ad, 'budget') || getMetric(adSet, 'budget') || getMetric(campaign, 'budget'),
        pageName: ad.pageName || ad.details?.page || 'Unknown page',
        mediaType: ad.mediaType || ad.media?.type || 'Media',
      }))
    )
  );
}

function getCampaignBudget(campaign) {
  const campaignBudget = getMetric(campaign, 'budget');

  if (campaignBudget) {
    return campaignBudget;
  }

  return (Array.isArray(campaign?.adSets) ? campaign.adSets : []).reduce(
    (total, adSet) => total + getMetric(adSet, 'budget'),
    0
  );
}

function buildCampaignBudgetChart(adAccount) {
  return (Array.isArray(adAccount?.campaigns) ? adAccount.campaigns : [])
    .map((campaign) => ({
      label: campaign.name || `Campaign ${campaign.id || ''}`.trim(),
      value: getCampaignBudget(campaign),
      spend: getMetric(campaign, 'spend'),
      status: campaign.status || campaign.effectiveStatus || 'UNKNOWN',
    }))
    .sort((first, second) => second.value - first.value)
    .slice(0, 10);
}


function buildSummary(rows) {
  const totals = rows.reduce(
    (summary, row) => ({
      spend: summary.spend + row.spend,
      clicks: summary.clicks + row.clicks,
      reach: summary.reach + row.reach,
      impressions: summary.impressions + row.impressions,
      ctrSum: summary.ctrSum + row.ctr,
    }),
    { spend: 0, clicks: 0, reach: 0, impressions: 0, ctrSum: 0 }
  );
  const ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : rows.length ? totals.ctrSum / rows.length : 0;

  return {
    spend: totals.spend,
    clicks: totals.clicks,
    reach: totals.reach,
    impressions: totals.impressions,
    ctr,
  };
}

function buildTrend(rows, key) {
  const values = rows
    .slice()
    .sort((first, second) => second[key] - first[key])
    .slice(0, 10)
    .map((row) => normalizeNumber(row[key]));

  if (values.length >= 2) {
    return values.reverse();
  }

  const value = values[0] || 0;
  return [0, value * 0.35, value * 0.55, value * 0.42, value * 0.78, value * 0.68, value];
}

function groupRowsByStatus(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const key = row.status || 'UNKNOWN';
    const current = grouped.get(key) || { label: getStatusLabel(key), count: 0, spend: 0 };
    current.count += 1;
    current.spend += row.spend;
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).sort((first, second) => second.count - first.count);
}

function buildCharts(rows, adAccount = null) {
  const topSpend = rows
    .slice()
    .sort((first, second) => second.spend - first.spend)
    .slice(0, 8)
    .map((row) => ({ label: row.name, value: row.spend, status: row.status }));
  const clicksReach = rows
    .slice()
    .sort((first, second) => second.clicks + second.reach - (first.clicks + first.reach))
    .slice(0, 8)
    .map((row) => ({ label: row.name, clicks: row.clicks, reach: row.reach }));
  const ctrComparison = rows
    .slice()
    .sort((first, second) => second.ctr - first.ctr)
    .slice(0, 8)
    .map((row) => ({ label: row.name, value: row.ctr }));
  const sortedImpressions = rows
    .slice()
    .sort((first, second) => second.impressions - first.impressions);
  const impressionLeaders = sortedImpressions
    .slice(0, 6)
    .map((row) => ({ label: row.name, value: row.impressions, status: row.status }));
  const otherImpressions = sortedImpressions
    .slice(6)
    .reduce((total, row) => total + row.impressions, 0);

  return {
    topSpend,
    statusBreakdown: groupRowsByStatus(rows),
    clicksReach,
    ctrComparison,
    campaignBudget: buildCampaignBudgetChart(adAccount),
    impressionBreakdown: otherImpressions
      ? [...impressionLeaders, { label: 'Other', value: otherImpressions, status: 'OTHER' }]
      : impressionLeaders,
  };
}

async function getPerformanceOptions(filters = {}) {
  const scope = await loadOptionsScope(filters);
  return getScopeOptions(scope, filters);
}

async function getPerformanceReport(filters = {}) {
  const scope = await loadOptionsScope(filters);
  const options = getScopeOptions(scope, filters);
  const detailLevel = getDetailLevel(options.selected.detailLevel);
  const dateRange = getDateRange(options.selected.dateRange);
  const { profile, account } = findSelectedProfileAndAdAccount(scope.profiles, options.selected.adAccountKey);
  const rows = account ? buildRows(account, detailLevel.value) : [];
  const summary = buildSummary(rows);
  const selectedAdAccount = account && profile ? toAdAccountOption(profile, account) : null;

  return {
    options,
    context: {
      brand: scope.selectedBrand ? safeBrand(scope.selectedBrand) : null,
      token: safeToken(scope.selectedToken),
      socialAccount: safeSocialAccount(profile?.socialAccount),
      businessProfile: safeBusinessProfile(profile),
      adAccount: selectedAdAccount,
      detailLevel,
      dateRange,
      currency: account?.currency || profile?.spendCurrency || 'USD',
      lastFetchedAt: selectedAdAccount?.lastFetchedAt || null,
      generatedAt: new Date(),
      dataWindowNote: 'Based on the latest saved Meta snapshot in the internal database.',
    },
    summary: {
      ...summary,
      trends: {
        spend: buildTrend(rows, 'spend'),
        clicks: buildTrend(rows, 'clicks'),
        reach: buildTrend(rows, 'reach'),
        ctr: buildTrend(rows, 'ctr'),
      },
    },
    charts: buildCharts(rows, account),
    rows,
  };
}

module.exports = {
  getPerformanceOptions,
  getPerformanceReport,
};
