const HttpError = require('../../app/utils/httpError');
const { waitForMetaApiPacing } = require('../../app/utils/metaApiPacing');
const mongoose = require('mongoose');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const socialAccountService = require('../social-accounts/socialAccount.service');
const tokenService = require('../token-management/token.service');
const {
  BusinessProfile,
  BUSINESS_PROFILE_ASSET_METRIC_STATUSES,
  BUSINESS_PROFILE_META_STATUSES,
} = require('./businessProfile.model');

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const META_SOCIAL_ACCOUNT_WITH_BUSINESSES_FIELDS = 'id,name,picture.type(large),businesses.limit(100){id,name}';
const META_BUSINESS_ASSET_FIELDS = [
  'owned_ad_accounts.limit(100).summary(true){id,account_id,name,currency,account_status,campaigns.limit(1).summary(true){id},insights.date_preset(maximum).limit(1){spend}}',
  'client_ad_accounts.limit(100).summary(true){id,account_id,name,currency,account_status,campaigns.limit(1).summary(true){id},insights.date_preset(maximum).limit(1){spend}}',
  'owned_pages.limit(100).summary(true){id,name}',
  'client_pages.limit(100).summary(true){id,name}',
].join(',');
const META_BUSINESS_DETAIL_FIELDS = `id,name,verification_status,created_time,is_disabled_for_integrity_reasons,${META_BUSINESS_ASSET_FIELDS}`;
const META_BUSINESS_DETAIL_WITHOUT_DISABLED_STATUS_FIELDS = `id,name,verification_status,created_time,${META_BUSINESS_ASSET_FIELDS}`;
const META_BUSINESS_SAFE_DETAIL_FIELDS = 'id,name,verification_status,created_time';
const PAGE_LIMITS = [5, 10, 20];

function normalizePagination({ page = 1, limit = 5 } = {}) {
  const normalizedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const parsedLimit = Number.parseInt(limit, 10) || 5;
  const normalizedLimit = PAGE_LIMITS.includes(parsedLimit) ? parsedLimit : 5;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildBusinessProfileQuery({ search, tokenLabel } = {}) {
  const query = {};

  if (search?.trim()) {
    query.name = { $regex: escapeRegExp(search.trim()), $options: 'i' };
  }

  if (tokenLabel?.trim()) {
    query.sourceTokenLabel = tokenLabel.trim();
  }

  return query;
}

async function getBusinessProfileFilterOptions() {
  const tokenLabels = await BusinessProfile.distinct('sourceTokenLabel');

  return {
    tokenLabels: tokenLabels.filter(Boolean).sort((first, second) => first.localeCompare(second)),
  };
}

async function listBusinessProfiles(filters = {}) {
  const { page, limit } = normalizePagination(filters);
  const query = buildBusinessProfileQuery(filters);
  const [total, filterOptions] = await Promise.all([
    BusinessProfile.countDocuments(query),
    getBusinessProfileFilterOptions(),
  ]);
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const currentPage = Math.min(page, totalPages);
  const skip = (currentPage - 1) * limit;
  const profiles = await BusinessProfile.find(query)
    .populate('socialAccount', 'name')
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit);

  return {
    profiles: profiles.map((profile) => profile.toSafeObject()),
    pagination: {
      page: currentPage,
      limit,
      total,
      totalPages,
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages,
    },
    filterOptions,
  };
}

async function assignBusinessProfile({ profileId, brandId, agencyId, actor, req }) {
  void profileId;
  void brandId;
  void agencyId;
  void actor;
  void req;
  throw new HttpError(400, 'Assign brand and agency from the social account, not the business profile');
}

async function deleteBusinessProfile({ profileId, actor, req }) {
  const profile = await BusinessProfile.findById(profileId);
  if (!profile) {
    throw new HttpError(404, 'Business profile not found');
  }

  await profile.deleteOne();

  await writeActivityLog({
    user: actor,
    action: 'BUSINESS_PROFILE_DELETED',
    entity: 'BusinessProfile',
    entityId: profile._id.toString(),
    metadata: {
      name: profile.name,
      metaBusinessId: profile.metaBusinessId,
    },
    req,
  });
}

function getMetaErrorMessage(payload, fallback) {
  return payload?.error?.message || fallback;
}

async function requestMetaApi(path, token, { fields, limit } = {}) {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path}`);

  if (fields) {
    url.searchParams.set('fields', fields);
  }

  if (limit) {
    url.searchParams.set('limit', limit);
  }

  url.searchParams.set('access_token', token.accessToken);

  await waitForMetaApiPacing();

  const response = await fetch(url);
  await tokenService.recordTokenApiCall(token.id);
  const payload = await response.json();

  if (!response.ok) {
    await tokenService.markTokenBlockedFromMetaError({
      tokenId: token.id,
      payload,
    });
    throw new HttpError(400, getMetaErrorMessage(payload, `Meta API request failed for ${token.label}`));
  }

  await tokenService.markTokenConnected({ tokenId: token.id });

  return payload;
}

async function fetchSocialAccountAndBusinessesForToken(token) {
  const payload = await requestMetaApi('me', token, {
    fields: META_SOCIAL_ACCOUNT_WITH_BUSINESSES_FIELDS,
  });

  return {
    metaSocialAccount: {
      id: payload.id,
      name: payload.name,
      profileImageUrl: payload.picture?.data?.url || null,
    },
    metaProfiles: Array.isArray(payload.businesses?.data) ? payload.businesses.data : [],
  };
}

async function fetchBusinessDetailsForToken(token, metaBusinessId, fields) {
  return requestMetaApi(metaBusinessId, token, { fields });
}

function shouldRetryWithoutStatusField(error) {
  return error.message?.toLowerCase().includes('is_disabled_for_integrity_reasons');
}

function shouldRetryWithoutAssetFields(error) {
  const message = error.message?.toLowerCase() || '';

  return [
    'owned_ad_accounts',
    'client_ad_accounts',
    'owned_pages',
    'client_pages',
    'campaigns',
    'insights',
  ].some((fieldName) => message.includes(fieldName));
}

async function fetchBusinessProfileStatus(metaProfile, token, summary, { requestDisabledStatus = true } = {}) {
  if (!requestDisabledStatus) {
    try {
      summary.apiCalls += 1;
      const details = await fetchBusinessDetailsForToken(
        token,
        metaProfile.id,
        META_BUSINESS_DETAIL_WITHOUT_DISABLED_STATUS_FIELDS
      );

      return {
        ...metaProfile,
        ...details,
        name: details.name || metaProfile.name,
        __statusCheckSucceeded: true,
        __statusCheckLimited: true,
        __assetMetricsStatus: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.SYNCED,
      };
    } catch (error) {
      if (shouldRetryWithoutAssetFields(error)) {
        try {
          summary.apiCalls += 1;
          const details = await fetchBusinessDetailsForToken(token, metaProfile.id, META_BUSINESS_SAFE_DETAIL_FIELDS);

          return {
            ...metaProfile,
            ...details,
            name: details.name || metaProfile.name,
            __statusCheckSucceeded: true,
            __statusCheckLimited: true,
            __assetMetricsStatus: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.UNKNOWN,
          };
        } catch (fallbackError) {
          summary.statusCheckFailed += 1;

          return {
            ...metaProfile,
            __statusCheckSucceeded: false,
            __statusCheckError: fallbackError.message,
            __assetMetricsStatus: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.UNKNOWN,
          };
        }
      }

      summary.statusCheckFailed += 1;

      return {
        ...metaProfile,
        __statusCheckSucceeded: false,
        __statusCheckError: error.message,
        __assetMetricsStatus: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.UNKNOWN,
      };
    }
  }

  try {
    summary.apiCalls += 1;
    const details = await fetchBusinessDetailsForToken(token, metaProfile.id, META_BUSINESS_DETAIL_FIELDS);

    return {
      ...metaProfile,
      ...details,
      name: details.name || metaProfile.name,
      __statusCheckSucceeded: true,
      __assetMetricsStatus: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.SYNCED,
    };
  } catch (error) {
    if (shouldRetryWithoutStatusField(error)) {
      try {
        summary.apiCalls += 1;
        const details = await fetchBusinessDetailsForToken(
          token,
          metaProfile.id,
          META_BUSINESS_DETAIL_WITHOUT_DISABLED_STATUS_FIELDS
        );

        return {
          ...metaProfile,
          ...details,
          name: details.name || metaProfile.name,
          __statusCheckSucceeded: true,
          __statusCheckLimited: true,
          __disabledStatusFieldUnsupported: true,
          __assetMetricsStatus: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.SYNCED,
        };
      } catch (fallbackError) {
        if (shouldRetryWithoutAssetFields(fallbackError)) {
          try {
            summary.apiCalls += 1;
            const details = await fetchBusinessDetailsForToken(token, metaProfile.id, META_BUSINESS_SAFE_DETAIL_FIELDS);

            return {
              ...metaProfile,
              ...details,
              name: details.name || metaProfile.name,
              __statusCheckSucceeded: true,
              __statusCheckLimited: true,
              __disabledStatusFieldUnsupported: true,
              __assetMetricsStatus: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.UNKNOWN,
            };
          } catch (safeFallbackError) {
            summary.statusCheckFailed += 1;

            return {
              ...metaProfile,
              __statusCheckSucceeded: false,
              __statusCheckError: safeFallbackError.message,
              __assetMetricsStatus: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.UNKNOWN,
            };
          }
        }

        summary.statusCheckFailed += 1;

        return {
          ...metaProfile,
          __statusCheckSucceeded: false,
          __statusCheckError: fallbackError.message,
          __assetMetricsStatus: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.UNKNOWN,
        };
      }
    }

    if (shouldRetryWithoutAssetFields(error)) {
      try {
        summary.apiCalls += 1;
        const details = await fetchBusinessDetailsForToken(token, metaProfile.id, META_BUSINESS_SAFE_DETAIL_FIELDS);

        return {
          ...metaProfile,
          ...details,
          name: details.name || metaProfile.name,
          __statusCheckSucceeded: true,
          __assetMetricsStatus: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.UNKNOWN,
        };
      } catch (fallbackError) {
        summary.statusCheckFailed += 1;

        return {
          ...metaProfile,
          __statusCheckSucceeded: false,
          __statusCheckError: fallbackError.message,
          __assetMetricsStatus: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.UNKNOWN,
        };
      }
    }

    summary.statusCheckFailed += 1;

    return {
      ...metaProfile,
      __statusCheckSucceeded: false,
      __statusCheckError: error.message,
      __assetMetricsStatus: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.UNKNOWN,
    };
  }
}

function getMetaStatus(metaProfile) {
  if (metaProfile.is_disabled_for_integrity_reasons === true) {
    return BUSINESS_PROFILE_META_STATUSES.DISABLED;
  }

  if (metaProfile.__statusCheckSucceeded || metaProfile.is_disabled_for_integrity_reasons === false) {
    return BUSINESS_PROFILE_META_STATUSES.CONNECTED;
  }

  return BUSINESS_PROFILE_META_STATUSES.UNKNOWN;
}

function getMetaStatusReason(metaProfile) {
  if (metaProfile.is_disabled_for_integrity_reasons === true) {
    return 'Meta reports this business profile is disabled for integrity reasons';
  }

  if (metaProfile.__statusCheckLimited) {
    return 'Connected, but Meta did not return the disabled-status field for this API version';
  }

  if (metaProfile.__statusCheckSucceeded || metaProfile.is_disabled_for_integrity_reasons === false) {
    return 'Business profile can be read with the saved Meta token';
  }

  if (metaProfile.__statusCheckError) {
    return `Status check failed: ${metaProfile.__statusCheckError}`;
  }

  return null;
}

function getIntegrityDisabledFlag(metaProfile) {
  return typeof metaProfile.is_disabled_for_integrity_reasons === 'boolean'
    ? metaProfile.is_disabled_for_integrity_reasons
    : null;
}

function getEdgeItems(edge) {
  return Array.isArray(edge?.data) ? edge.data : [];
}

function getUniqueItems(...collections) {
  const uniqueItems = new Map();

  collections.flatMap(getEdgeItems).forEach((item) => {
    const id = item?.id || item?.account_id;
    if (id) {
      uniqueItems.set(String(id), item);
    }
  });

  return Array.from(uniqueItems.values());
}

function getCampaignCountForAdAccount(account) {
  const summaryCount = Number.parseInt(account.campaigns?.summary?.total_count, 10);

  if (Number.isFinite(summaryCount)) {
    return summaryCount;
  }

  return getEdgeItems(account.campaigns).length;
}

function getSpendForAdAccount(account) {
  const spend = Number.parseFloat(account.insights?.data?.[0]?.spend);

  return Number.isFinite(spend) ? spend : 0;
}

function getAdAccountConnectionStatus(statusCode) {
  const normalizedStatus = Number.parseInt(statusCode, 10);

  if (!Number.isFinite(normalizedStatus)) {
    return 'UNKNOWN';
  }

  return normalizedStatus === 1 ? 'ACTIVE' : 'BLOCKED';
}

function getAdAccountStatusLabel(statusCode) {
  const normalizedStatus = Number.parseInt(statusCode, 10);

  if (!Number.isFinite(normalizedStatus)) {
    return 'Unknown';
  }

  if (normalizedStatus === 1) {
    return 'Active';
  }

  return 'Blocked';
}

function normalizeAdAccountAsset(account) {
  const accountId = account.account_id || String(account.id || '').replace(/^act_/, '');
  const nodeId = String(account.id || `act_${accountId}`);
  const statusCode = Number.parseInt(account.account_status, 10);

  return {
    id: nodeId,
    accountId,
    name: account.name || `Ad Account ${accountId}`,
    currency: account.currency || null,
    connectionStatus: getAdAccountConnectionStatus(statusCode),
    statusCode: Number.isFinite(statusCode) ? statusCode : null,
    statusLabel: getAdAccountStatusLabel(statusCode),
    campaignCount: getCampaignCountForAdAccount(account),
    totalSpend: getSpendForAdAccount(account),
  };
}

function getAdAccountAssets(metaProfile) {
  return getUniqueItems(metaProfile.owned_ad_accounts, metaProfile.client_ad_accounts).map(normalizeAdAccountAsset);
}

function getAssetMetrics(metaProfile) {
  if (metaProfile.__assetMetricsStatus !== BUSINESS_PROFILE_ASSET_METRIC_STATUSES.SYNCED) {
    return {
      status: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.UNKNOWN,
      adAccounts: [],
      adAccountCount: 0,
      facebookPageCount: 0,
      campaignCount: 0,
      totalSpend: 0,
      spendCurrency: null,
    };
  }

  const adAccounts = getAdAccountAssets(metaProfile);
  const pages = getUniqueItems(metaProfile.owned_pages, metaProfile.client_pages);
  const currencies = new Set(adAccounts.map((account) => account.currency).filter(Boolean));

  return {
    status: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.SYNCED,
    adAccounts,
    adAccountCount: adAccounts.length,
    facebookPageCount: pages.length,
    campaignCount: adAccounts.reduce((total, account) => total + account.campaignCount, 0),
    totalSpend: adAccounts.reduce((total, account) => total + account.totalSpend, 0),
    spendCurrency: currencies.size === 1 ? Array.from(currencies)[0] : currencies.size > 1 ? 'MIXED' : null,
  };
}

function hasProfileChanged(profile, metaProfile, token, socialAccount) {
  const assetMetrics = getAssetMetrics(metaProfile);

  return (
    profile.name !== metaProfile.name ||
    profile.verificationStatus !== (metaProfile.verification_status || null) ||
    profile.metaStatus !== getMetaStatus(metaProfile) ||
    profile.metaStatusReason !== getMetaStatusReason(metaProfile) ||
    profile.isDisabledForIntegrityReasons !== getIntegrityDisabledFlag(metaProfile) ||
    profile.sourceToken?.toString() !== token.id ||
    profile.sourceTokenLabel !== token.label ||
    profile.socialAccount?.toString() !== socialAccount._id.toString() ||
    profile.socialAccountName !== socialAccount.name ||
    (assetMetrics.status === BUSINESS_PROFILE_ASSET_METRIC_STATUSES.SYNCED &&
      (profile.adAccountCount !== assetMetrics.adAccountCount ||
        profile.facebookPageCount !== assetMetrics.facebookPageCount ||
        profile.campaignCount !== assetMetrics.campaignCount ||
        profile.totalSpend !== assetMetrics.totalSpend ||
        profile.spendCurrency !== assetMetrics.spendCurrency ||
        profile.assetMetricsStatus !== assetMetrics.status ||
        JSON.stringify(profile.adAccounts || []) !== JSON.stringify(assetMetrics.adAccounts)))
  );
}

function applyAssetMetrics(profile, metaProfile, syncedAt) {
  const assetMetrics = getAssetMetrics(metaProfile);

  if (assetMetrics.status !== BUSINESS_PROFILE_ASSET_METRIC_STATUSES.SYNCED) {
    return;
  }

  profile.adAccountCount = assetMetrics.adAccountCount;
  profile.facebookPageCount = assetMetrics.facebookPageCount;
  profile.campaignCount = assetMetrics.campaignCount;
  profile.totalSpend = assetMetrics.totalSpend;
  profile.spendCurrency = assetMetrics.spendCurrency;
  profile.assetMetricsStatus = assetMetrics.status;
  profile.assetMetricsSyncedAt = syncedAt;
  profile.adAccounts = assetMetrics.adAccounts;
}

async function upsertMetaProfile(metaProfile, token, syncedAt, socialAccount) {
  const existingProfile = await BusinessProfile.findOne({ metaBusinessId: metaProfile.id });

  if (!existingProfile) {
    const profile = new BusinessProfile({
      metaBusinessId: metaProfile.id,
      name: metaProfile.name || `Business ${metaProfile.id}`,
      verificationStatus: metaProfile.verification_status || null,
      metaStatus: getMetaStatus(metaProfile),
      metaStatusReason: getMetaStatusReason(metaProfile),
      isDisabledForIntegrityReasons: getIntegrityDisabledFlag(metaProfile),
      lastStatusCheckedAt: syncedAt,
      sourceToken: token.id,
      sourceTokenLabel: token.label,
      socialAccount: socialAccount._id,
      socialAccountName: socialAccount.name,
      rawMetaData: metaProfile,
      lastSyncedAt: syncedAt,
    });

    applyAssetMetrics(profile, metaProfile, syncedAt);
    await profile.save();
    return 'created';
  }

  if (!hasProfileChanged(existingProfile, metaProfile, token, socialAccount)) {
    existingProfile.lastSyncedAt = syncedAt;
    existingProfile.lastStatusCheckedAt = syncedAt;
    existingProfile.sourceToken = token.id;
    existingProfile.sourceTokenLabel = token.label;
    existingProfile.socialAccount = socialAccount._id;
    existingProfile.socialAccountName = socialAccount.name;
    existingProfile.brand = null;
    existingProfile.agency = null;
    applyAssetMetrics(existingProfile, metaProfile, syncedAt);
    await existingProfile.save();
    return 'skipped';
  }

  existingProfile.name = metaProfile.name || existingProfile.name;
  existingProfile.verificationStatus = metaProfile.verification_status || null;
  existingProfile.metaStatus = getMetaStatus(metaProfile);
  existingProfile.metaStatusReason = getMetaStatusReason(metaProfile);
  existingProfile.isDisabledForIntegrityReasons = getIntegrityDisabledFlag(metaProfile);
  existingProfile.lastStatusCheckedAt = syncedAt;
  existingProfile.sourceToken = token.id;
  existingProfile.sourceTokenLabel = token.label;
  existingProfile.socialAccount = socialAccount._id;
  existingProfile.socialAccountName = socialAccount.name;
  existingProfile.brand = null;
  existingProfile.agency = null;
  applyAssetMetrics(existingProfile, metaProfile, syncedAt);
  existingProfile.rawMetaData = metaProfile;
  existingProfile.lastSyncedAt = syncedAt;
  await existingProfile.save();
  return 'updated';
}

async function syncBusinessProfiles({ actor, req, tokenId = null }) {
  if (tokenId && !mongoose.Types.ObjectId.isValid(tokenId)) {
    throw new HttpError(400, 'Invalid Meta API token');
  }

  const activeTokens = await tokenService.listActiveTokensWithSecrets({ tokenId });

  if (!activeTokens.length) {
    throw new HttpError(
      400,
      tokenId
        ? 'This Meta API token is not active or does not exist'
        : 'Add an active Meta API token before fetching business profiles'
    );
  }

  const syncedAt = new Date();
  const summary = {
    tokensChecked: activeTokens.length,
    apiCalls: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    statusCheckFailed: 0,
    socialAccountsCreated: 0,
    socialAccountsUpdated: 0,
    socialAccountsSkipped: 0,
    errors: [],
  };

  for (const token of activeTokens) {
    try {
      summary.apiCalls += 1;
      const { metaSocialAccount, metaProfiles } = await fetchSocialAccountAndBusinessesForToken(token);
      const socialAccountResult = await socialAccountService.upsertSocialAccountFromMeta({
        metaAccount: metaSocialAccount,
        token,
        syncedAt,
      });
      summary[`socialAccounts${socialAccountResult.result[0].toUpperCase()}${socialAccountResult.result.slice(1)}`] += 1;

      let requestDisabledStatus = true;

      for (const metaProfile of metaProfiles) {
        if (!metaProfile.id) {
          continue;
        }

        const checkedMetaProfile = await fetchBusinessProfileStatus(metaProfile, token, summary, {
          requestDisabledStatus,
        });

        if (checkedMetaProfile.__disabledStatusFieldUnsupported) {
          requestDisabledStatus = false;
        }

        const result = await upsertMetaProfile(checkedMetaProfile, token, syncedAt, socialAccountResult.account);
        summary[result] += 1;
      }
    } catch (error) {
      summary.failed += 1;
      summary.errors.push({
        tokenLabel: token.label,
        message: error.message,
      });
    }
  }

  await writeActivityLog({
    user: actor,
    action: 'BUSINESS_PROFILES_SYNCED',
    entity: 'BusinessProfile',
    metadata: {
      ...summary,
      tokenId,
    },
    req,
  });

  return {
    summary,
    ...(await listBusinessProfiles()),
  };
}

async function countBusinessProfiles() {
  return BusinessProfile.countDocuments();
}

module.exports = {
  assignBusinessProfile,
  countBusinessProfiles,
  deleteBusinessProfile,
  listBusinessProfiles,
  syncBusinessProfiles,
};
