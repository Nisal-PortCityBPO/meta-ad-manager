const HttpError = require('../../app/utils/httpError');
const { waitForMetaApiPacing } = require('../../app/utils/metaApiPacing');
const mongoose = require('mongoose');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const socialAccountService = require('../social-accounts/socialAccount.service');
const SocialAccount = require('../social-accounts/socialAccount.model');
const tokenService = require('../token-management/token.service');
const {
  BusinessProfile,
  BUSINESS_PROFILE_ASSET_METRIC_STATUSES,
  BUSINESS_PROFILE_META_STATUSES,
} = require('./businessProfile.model');

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const META_SOCIAL_ACCOUNT_WITH_BUSINESSES_FIELDS = 'id,name,picture.type(large),businesses.limit(100){id,name}';
const META_INSIGHT_FIELDS = 'spend,impressions,reach,clicks,ctr,cpc,actions,cost_per_action_type';
const META_AD_CREATIVE_FIELDS = [
  'id',
  'name',
  'thumbnail_url',
  'image_url',
  'image_hash',
  'video_id',
  'object_id',
  'object_type',
  'status',
  'effective_object_story_id',
  'effective_instagram_story_id',
  'instagram_permalink_url',
  'object_story_spec',
  'asset_feed_spec',
].join(',');
const META_AD_CREATIVE_SAFE_FIELDS = [
  'id',
  'name',
  'thumbnail_url',
  'image_url',
  'image_hash',
  'video_id',
  'object_id',
  'object_type',
  'effective_object_story_id',
  'object_story_spec',
].join(',');
const META_AD_FIELDS = `id,name,status,effective_status,configured_status,creative{${META_AD_CREATIVE_FIELDS}},insights.date_preset(maximum).limit(1){${META_INSIGHT_FIELDS}}`;
const META_AD_SAFE_FIELDS = `id,name,status,effective_status,configured_status,creative{${META_AD_CREATIVE_SAFE_FIELDS}},insights.date_preset(maximum).limit(1){${META_INSIGHT_FIELDS}}`;
const getMetaAdSetFields = (adFields) =>
  `id,name,status,effective_status,daily_budget,lifetime_budget,budget_remaining,ads.limit(100).summary(true){${adFields}},insights.date_preset(maximum).limit(1){${META_INSIGHT_FIELDS}}`;
const getMetaCampaignFields = (adSetFields) =>
  `id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,adsets.limit(100).summary(true){${adSetFields}},insights.date_preset(maximum).limit(1){${META_INSIGHT_FIELDS}}`;
const getMetaAdAccountHierarchyFields = (adFields) => {
  const adSetFields = getMetaAdSetFields(adFields);
  const campaignFields = getMetaCampaignFields(adSetFields);

  return `id,account_id,name,currency,account_status,campaigns.limit(100).summary(true){${campaignFields}},insights.date_preset(maximum).limit(1){spend}`;
};
const META_AD_ACCOUNT_BASE_FIELDS = 'id,account_id,name,currency,account_status,insights.date_preset(maximum).limit(1){spend}';
const META_AD_ACCOUNT_HIERARCHY_FIELDS = getMetaAdAccountHierarchyFields(META_AD_FIELDS);
const META_AD_ACCOUNT_SAFE_HIERARCHY_FIELDS = getMetaAdAccountHierarchyFields(META_AD_SAFE_FIELDS);
const META_BUSINESS_ASSET_FIELDS = [
  `owned_ad_accounts.limit(100).summary(true){${META_AD_ACCOUNT_BASE_FIELDS}}`,
  `client_ad_accounts.limit(100).summary(true){${META_AD_ACCOUNT_BASE_FIELDS}}`,
  'owned_pages.limit(100).summary(true){id,name,is_published,verification_status}',
  'client_pages.limit(100).summary(true){id,name,is_published,verification_status}',
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
  await tokenService.recordTokenApiCall(token.id, token.tokenType);
  const payload = await response.json();

  if (!response.ok) {
    await tokenService.markTokenBlockedFromMetaError({
      tokenId: token.id,
      payload,
      tokenType: token.tokenType,
    });
    throw new HttpError(400, getMetaErrorMessage(payload, `Meta API request failed for ${token.label}`));
  }

  await tokenService.markTokenConnected({ tokenId: token.id, tokenType: token.tokenType });

  return payload;
}

async function postMetaApi(path, token, params = {}) {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path}`);
  const body = new URLSearchParams();

  Object.entries({
    access_token: token.accessToken,
    ...params,
  }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
  });

  await waitForMetaApiPacing();

  const response = await fetch(url, {
    method: 'POST',
    body,
  });
  await tokenService.recordTokenApiCall(token.id, token.tokenType);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error) {
    await tokenService.markTokenBlockedFromMetaError({
      tokenId: token.id,
      payload,
      tokenType: token.tokenType,
    });
    throw new HttpError(400, getMetaErrorMessage(payload, `Meta API request failed for ${token.label}`));
  }

  await tokenService.markTokenConnected({ tokenId: token.id, tokenType: token.tokenType });

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

async function getExistingSocialAccountScopeForSystemUserToken(requestedSocialAccount) {
  const existingProfiles = await BusinessProfile.find({ socialAccount: requestedSocialAccount._id })
    .select('metaBusinessId name')
    .sort({ name: 1 });

  if (!existingProfiles.length) {
    throw new HttpError(
      400,
      'Use the Profile Access Token once before using the System User token for this social account'
    );
  }

  return {
    metaSocialAccount: {
      id: requestedSocialAccount.metaAccountId,
      name: requestedSocialAccount.name,
      profileImageUrl: requestedSocialAccount.profileImageUrl || null,
    },
    metaProfiles: existingProfiles.map((profile) => ({
      id: profile.metaBusinessId,
      name: profile.name,
    })),
  };
}

async function fetchBusinessDetailsForToken(token, metaBusinessId, fields) {
  return requestMetaApi(metaBusinessId, token, { fields });
}

async function fetchAdAccountHierarchyForToken(token, adAccount, summary) {
  summary.apiCalls += 1;

  try {
    return await fetchBusinessDetailsForToken(token, adAccount.id, META_AD_ACCOUNT_HIERARCHY_FIELDS);
  } catch (error) {
    const message = error.message?.toLowerCase() || '';

    if (!message.includes('creative') && !message.includes('asset_feed_spec') && !message.includes('object_story_spec')) {
      throw error;
    }

    summary.apiCalls += 1;
    return fetchBusinessDetailsForToken(token, adAccount.id, META_AD_ACCOUNT_SAFE_HIERARCHY_FIELDS);
  }
}

function replaceEdgeItems(edge, replacementsById) {
  if (!edge?.data) {
    return edge;
  }

  return {
    ...edge,
    data: getEdgeItems(edge).map((item) => {
      const itemKey = String(item.id || item.account_id || '');
      const accountIdKey = item.account_id ? String(item.account_id) : '';

      return replacementsById.get(itemKey) || replacementsById.get(accountIdKey) || item;
    }),
  };
}

async function attachAdAccountHierarchy(metaProfile, token, summary) {
  const accounts = getUniqueItems(metaProfile.owned_ad_accounts, metaProfile.client_ad_accounts);

  if (!accounts.length) {
    return metaProfile;
  }

  const replacementsById = new Map();
  const hierarchyErrors = [];

  for (const account of accounts) {
    if (!account.id) {
      continue;
    }

    try {
      const detail = await fetchAdAccountHierarchyForToken(token, account, summary);
      const enrichedAccount = {
        ...account,
        ...detail,
        name: detail.name || account.name,
        account_id: detail.account_id || account.account_id,
      };

      replacementsById.set(String(account.id), enrichedAccount);
      if (account.account_id) {
        replacementsById.set(String(account.account_id), enrichedAccount);
      }
    } catch (error) {
      summary.hierarchyFetchFailed += 1;
      hierarchyErrors.push({
        adAccountId: account.id,
        adAccountName: account.name,
        message: error.message,
      });
    }
  }

  return {
    ...metaProfile,
    owned_ad_accounts: replaceEdgeItems(metaProfile.owned_ad_accounts, replacementsById),
    client_ad_accounts: replaceEdgeItems(metaProfile.client_ad_accounts, replacementsById),
    __assetHierarchyErrors: hierarchyErrors,
  };
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
    'adsets',
    'ads',
    'creative',
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
      const detailsWithHierarchy = await attachAdAccountHierarchy(details, token, summary);

      return {
        ...metaProfile,
        ...detailsWithHierarchy,
        name: detailsWithHierarchy.name || metaProfile.name,
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
    const detailsWithHierarchy = await attachAdAccountHierarchy(details, token, summary);

    return {
      ...metaProfile,
      ...detailsWithHierarchy,
      name: detailsWithHierarchy.name || metaProfile.name,
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
        const detailsWithHierarchy = await attachAdAccountHierarchy(details, token, summary);

        return {
          ...metaProfile,
          ...detailsWithHierarchy,
          name: detailsWithHierarchy.name || metaProfile.name,
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

function parseMetricNumber(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

const LEAD_ACTION_TYPES = [
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.lead',
];

const WEBSITE_REGISTRATION_ACTION_TYPES = [
  'complete_registration',
  'omni_complete_registration',
  'offsite_conversion.fb_pixel_complete_registration',
  'onsite_conversion.complete_registration',
  'app_custom_event.fb_mobile_complete_registration',
];

const ZERO_DECIMAL_CURRENCIES = new Set([
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

function getInsight(edge) {
  return Array.isArray(edge?.data) ? edge.data[0] || {} : {};
}

function isLeadActionType(actionType = '') {
  const normalizedActionType = String(actionType).toLowerCase();

  return LEAD_ACTION_TYPES.includes(normalizedActionType) || normalizedActionType.includes('lead');
}

function isRegistrationActionType(actionType = '') {
  const normalizedActionType = String(actionType).toLowerCase();

  return (
    WEBSITE_REGISTRATION_ACTION_TYPES.includes(normalizedActionType) ||
    normalizedActionType.includes('complete_registration') ||
    normalizedActionType.includes('registration')
  );
}

function getActionValue(insight, actionTypes, matcher = isLeadActionType) {
  const actions = Array.isArray(insight.actions) ? insight.actions : [];

  return actions.reduce((total, action) => {
    const normalizedActionType = String(action.action_type || '').toLowerCase();
    const matches = actionTypes.includes(normalizedActionType) || matcher(normalizedActionType);

    return matches ? total + parseMetricNumber(action.value) : total;
  }, 0);
}

function getCostPerActionValue(insight, actionTypes, matcher = isLeadActionType) {
  const costs = Array.isArray(insight.cost_per_action_type) ? insight.cost_per_action_type : [];
  const match = costs.find((cost) => {
    const normalizedActionType = String(cost.action_type || '').toLowerCase();

    return actionTypes.includes(normalizedActionType) || matcher(normalizedActionType);
  });

  return parseMetricNumber(match?.value);
}

function getRatioMetric(amount, count) {
  return count ? amount / count : 0;
}

function normalizeInsights(edge) {
  const insight = getInsight(edge);
  const spend = parseMetricNumber(insight.spend);
  const clicks = parseMetricNumber(insight.clicks);
  const leads = getActionValue(insight, LEAD_ACTION_TYPES);
  const results = getActionValue(insight, WEBSITE_REGISTRATION_ACTION_TYPES, isRegistrationActionType);
  const resultCpr =
    getCostPerActionValue(insight, WEBSITE_REGISTRATION_ACTION_TYPES, isRegistrationActionType) ||
    getRatioMetric(spend, results);
  const cpr = resultCpr || getCostPerActionValue(insight, LEAD_ACTION_TYPES) || getRatioMetric(spend, leads);

  return {
    spend,
    impressions: parseMetricNumber(insight.impressions),
    reach: parseMetricNumber(insight.reach),
    clicks,
    leads,
    results,
    ctr: parseMetricNumber(insight.ctr),
    cpc: parseMetricNumber(insight.cpc) || getRatioMetric(spend, clicks),
    cpl: cpr,
    cpr,
  };
}

function normalizeMetaBudget(value, currency) {
  const amount = parseMetricNumber(value);

  if (!amount) {
    return 0;
  }

  return ZERO_DECIMAL_CURRENCIES.has(String(currency || '').toUpperCase()) ? amount : amount / 100;
}

function getAdSetBudget(adSet, currency) {
  return normalizeMetaBudget(adSet.daily_budget || adSet.lifetime_budget || adSet.budget_remaining, currency);
}

function getCampaignBudget(campaign, currency) {
  return normalizeMetaBudget(campaign.daily_budget || campaign.lifetime_budget || campaign.budget_remaining, currency);
}

function getMetaStatusValue(item) {
  return item?.effective_status || item?.status || item?.configured_status || 'UNKNOWN';
}

function normalizePageAsset(page) {
  return {
    id: String(page.id),
    name: page.name || `Page ${page.id}`,
    isPublished: typeof page.is_published === 'boolean' ? page.is_published : null,
    verificationStatus: page.verification_status || null,
  };
}

function getPagesById(metaProfile) {
  return new Map(
    getUniqueItems(metaProfile.owned_pages, metaProfile.client_pages)
      .map(normalizePageAsset)
      .map((page) => [page.id, page])
  );
}

function getPageStatus(page) {
  if (!page) {
    return 'UNKNOWN';
  }

  return page.isPublished === false ? 'BLOCKED' : 'ACTIVE';
}

function getCreativePageId(creative = {}) {
  return (
    creative.object_story_spec?.page_id ||
    creative.object_story_spec?.link_data?.page_id ||
    creative.object_story_spec?.video_data?.page_id ||
    null
  );
}

function getCreativeVideoId(creative = {}) {
  if (creative.video_id) {
    return creative.video_id;
  }

  if (creative.object_type === 'VIDEO' && creative.object_id) {
    return creative.object_id;
  }

  return (
    creative.object_story_spec?.video_data?.video_id ||
    creative.asset_feed_spec?.videos?.[0]?.video_id ||
    creative.asset_feed_spec?.videos?.[0]?.id ||
    null
  );
}

function getCreativeImageHash(creative = {}) {
  return (
    creative.image_hash ||
    creative.object_story_spec?.link_data?.image_hash ||
    creative.object_story_spec?.photo_data?.image_hash ||
    creative.asset_feed_spec?.images?.[0]?.hash ||
    null
  );
}

function normalizeAdAsset(ad, { adSet, campaign, currency, pagesById }) {
  const creative = ad.creative || {};
  const pageId = getCreativePageId(creative);
  const page = pageId ? pagesById.get(String(pageId)) : null;
  const insights = normalizeInsights(ad.insights);
  const videoId = getCreativeVideoId(creative);
  const imageHash = getCreativeImageHash(creative);
  const storyId = creative.effective_object_story_id || creative.effective_instagram_story_id || null;
  const mediaType = videoId ? 'Video' : 'Image';

  return {
    id: String(ad.id),
    title: ad.name || `Ad ${ad.id}`,
    name: ad.name || `Ad ${ad.id}`,
    status: getMetaStatusValue(ad),
    configuredStatus: ad.configured_status || null,
    effectiveStatus: ad.effective_status || null,
    campaignId: String(campaign.id),
    campaignName: campaign.name || `Campaign ${campaign.id}`,
    adSetId: String(adSet.id),
    adSetName: adSet.name || `Ad Set ${adSet.id}`,
    pageId: pageId ? String(pageId) : null,
    pageName: page?.name || (pageId ? `Page ${pageId}` : 'Unknown page'),
    pageStatus: getPageStatus(page),
    clicks: insights.clicks,
    leads: insights.leads,
    results: insights.results,
    cpr: insights.cpr,
    budget: getAdSetBudget(adSet, currency),
    spend: insights.spend,
    impressions: insights.impressions,
    reach: insights.reach,
    ctr: insights.ctr,
    cpc: insights.cpc,
    cpl: insights.cpl,
    creativeId: creative.id || null,
    creativeName: creative.name || null,
    videoId,
    imageHash,
    storyId,
    mediaType,
    media: {
      type: mediaType,
      thumbnailUrl: creative.thumbnail_url || creative.image_url || null,
      imageUrl: creative.image_url || null,
      videoId,
      imageHash,
    },
    details: {
      adId: String(ad.id),
      status: getMetaStatusValue(ad),
      page: page?.name || null,
      pageId: pageId ? String(pageId) : null,
      pageStatus: getPageStatus(page),
      creativeId: creative.id || null,
      videoId,
      imageHash,
      storyId,
    },
    insights,
  };
}

function normalizeAdSetAsset(adSet, { campaign, currency, pagesById }) {
  const insights = normalizeInsights(adSet.insights);
  const ads = getEdgeItems(adSet.ads).map((ad) =>
    normalizeAdAsset(ad, {
      adSet,
      campaign,
      currency,
      pagesById,
    })
  );
  const summaryCount = Number.parseInt(adSet.ads?.summary?.total_count, 10);

  return {
    id: String(adSet.id),
    name: adSet.name || `Ad Set ${adSet.id}`,
    status: getMetaStatusValue(adSet),
    effectiveStatus: adSet.effective_status || null,
    campaignId: String(campaign.id),
    campaignName: campaign.name || `Campaign ${campaign.id}`,
    spend: insights.spend,
    clicks: insights.clicks,
    leads: insights.leads,
    cpr: insights.cpr,
    budget: getAdSetBudget(adSet, currency),
    adCount: Number.isFinite(summaryCount) ? summaryCount : ads.length,
    ads,
    insights,
  };
}

function normalizeCampaignAsset(campaign, { currency, pagesById }) {
  const insights = normalizeInsights(campaign.insights);
  const adSets = getEdgeItems(campaign.adsets).map((adSet) =>
    normalizeAdSetAsset(adSet, {
      campaign,
      currency,
      pagesById,
    })
  );
  const summaryCount = Number.parseInt(campaign.adsets?.summary?.total_count, 10);

  return {
    id: String(campaign.id),
    name: campaign.name || `Campaign ${campaign.id}`,
    status: getMetaStatusValue(campaign),
    effectiveStatus: campaign.effective_status || null,
    objective: campaign.objective || null,
    spend: insights.spend,
    clicks: insights.clicks,
    leads: insights.leads,
    cpr: insights.cpr,
    budget: getCampaignBudget(campaign, currency),
    adSetCount: Number.isFinite(summaryCount) ? summaryCount : adSets.length,
    adSets,
    insights,
  };
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

function normalizeAdAccountAsset(account, pagesById = new Map(), syncedAt = null) {
  const accountId = account.account_id || String(account.id || '').replace(/^act_/, '');
  const nodeId = String(account.id || `act_${accountId}`);
  const statusCode = Number.parseInt(account.account_status, 10);
  const currency = account.currency || null;
  const campaigns = getEdgeItems(account.campaigns).map((campaign) =>
    normalizeCampaignAsset(campaign, {
      currency,
      pagesById,
    })
  );

  return {
    id: nodeId,
    accountId,
    name: account.name || `Ad Account ${accountId}`,
    currency,
    connectionStatus: getAdAccountConnectionStatus(statusCode),
    statusCode: Number.isFinite(statusCode) ? statusCode : null,
    statusLabel: getAdAccountStatusLabel(statusCode),
    campaignCount: getCampaignCountForAdAccount(account),
    totalSpend: getSpendForAdAccount(account),
    campaigns,
    hierarchySyncedAt: syncedAt,
  };
}

function getAdAccountAssets(metaProfile, syncedAt) {
  const pagesById = getPagesById(metaProfile);

  return getUniqueItems(metaProfile.owned_ad_accounts, metaProfile.client_ad_accounts).map((account) =>
    normalizeAdAccountAsset(account, pagesById, syncedAt)
  );
}

function getAssetMetrics(metaProfile, syncedAt = null) {
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

  const adAccounts = getAdAccountAssets(metaProfile, syncedAt);
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

function getComparableAdAccounts(accounts = []) {
  return JSON.stringify(
    (Array.isArray(accounts) ? accounts : []).map((account) => {
      const plainAccount = account?.toObject ? account.toObject() : account;
      return {
        ...plainAccount,
        hierarchySyncedAt: null,
      };
    })
  );
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
        getComparableAdAccounts(profile.adAccounts || []) !== getComparableAdAccounts(assetMetrics.adAccounts)))
  );
}

function applyAssetMetrics(profile, metaProfile, syncedAt) {
  const assetMetrics = getAssetMetrics(metaProfile, syncedAt);

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

async function resolveSyncScope({ tokenId = null, socialAccountId = null, tokenType } = {}) {
  if (socialAccountId && !mongoose.Types.ObjectId.isValid(socialAccountId)) {
    throw new HttpError(400, 'Invalid social account');
  }

  if (tokenId && !mongoose.Types.ObjectId.isValid(tokenId)) {
    throw new HttpError(400, 'Invalid Meta API token');
  }

  if (!socialAccountId) {
    const activeTokens = await tokenService.listActiveTokensWithSecrets({ tokenId, tokenType });

    return {
      activeTokens,
      requestedSocialAccount: null,
      tokenId,
    };
  }

  const requestedSocialAccount = await SocialAccount.findById(socialAccountId);

  if (!requestedSocialAccount) {
    throw new HttpError(404, 'Social account not found');
  }

  if (!requestedSocialAccount.sourceToken) {
    throw new HttpError(400, 'This social account does not have a saved Meta API token');
  }

  const resolvedTokenId = requestedSocialAccount.sourceToken.toString();
  const activeTokens = await tokenService.listActiveTokensWithSecrets({
    tokenId: resolvedTokenId,
    tokenType,
  });

  return {
    activeTokens,
    requestedSocialAccount,
    tokenId: resolvedTokenId,
  };
}

function normalizeAdAccountId(value) {
  return String(value || '').replace(/^act_/, '');
}

function getAdAccountNodeId(account, fallbackId = '') {
  if (account?.id) {
    const id = String(account.id);
    return id.startsWith('act_') ? id : `act_${normalizeAdAccountId(id)}`;
  }

  if (account?.accountId) {
    return `act_${account.accountId}`;
  }

  const fallbackValue = String(fallbackId || '');
  return fallbackValue.startsWith('act_') ? fallbackValue : `act_${normalizeAdAccountId(fallbackValue)}`;
}

function adAccountMatches(account, requestedId) {
  const requestedValue = String(requestedId || '');
  const requestedNormalized = normalizeAdAccountId(requestedValue);

  return [account?.id, account?.accountId]
    .filter(Boolean)
    .some((value) => String(value) === requestedValue || normalizeAdAccountId(value) === requestedNormalized);
}

function toPlainAdAccount(account) {
  if (!account) {
    return {};
  }

  return account.toObject ? account.toObject() : { ...account };
}

function applyStoredAdAccountMetrics(profile, syncedAt) {
  const adAccounts = Array.isArray(profile.adAccounts) ? profile.adAccounts : [];
  const currencies = new Set(adAccounts.map((account) => account.currency).filter(Boolean));

  profile.adAccountCount = adAccounts.length;
  profile.campaignCount = adAccounts.reduce((total, account) => total + (Number(account.campaignCount) || 0), 0);
  profile.totalSpend = adAccounts.reduce((total, account) => total + (Number(account.totalSpend) || 0), 0);
  profile.spendCurrency = currencies.size === 1 ? Array.from(currencies)[0] : currencies.size > 1 ? 'MIXED' : null;
  profile.assetMetricsStatus = BUSINESS_PROFILE_ASSET_METRIC_STATUSES.SYNCED;
  profile.assetMetricsSyncedAt = syncedAt;
  profile.lastSyncedAt = syncedAt;
}

function getCopiedCampaignId(payload) {
  return (
    payload?.copied_campaign_id ||
    payload?.campaign_id ||
    payload?.id ||
    payload?.data?.copied_campaign_id ||
    payload?.data?.id ||
    null
  );
}

function normalizeCopiedObjectType(value) {
  return String(value || '').trim().toLowerCase().replace(/-/g, '_');
}

function getCopiedObjectItems(payload) {
  if (Array.isArray(payload?.ad_object_ids)) {
    return payload.ad_object_ids;
  }

  if (Array.isArray(payload?.data?.ad_object_ids)) {
    return payload.data.ad_object_ids;
  }

  return [];
}

function getCopiedObjectMap(payload, objectType) {
  const normalizedType = normalizeCopiedObjectType(objectType);
  const copiedObjects = new Map();

  getCopiedObjectItems(payload).forEach((item) => {
    if (normalizeCopiedObjectType(item?.ad_object_type) !== normalizedType) {
      return;
    }

    if (item?.source_id && item?.copied_id) {
      copiedObjects.set(String(item.source_id), String(item.copied_id));
    }
  });

  return copiedObjects;
}

function getCampaignIdForAction(campaign) {
  return campaign?.id || campaign?.campaignId || '';
}

function getAdSetIdForAction(adSet) {
  return adSet?.id || adSet?.adSetId || '';
}

function getAdIdForAction(ad) {
  return ad?.id || ad?.adId || '';
}

function campaignMatches(campaign, requestedId) {
  const requestedValue = String(requestedId || '');
  return [campaign?.id, campaign?.campaignId].filter(Boolean).some((value) => String(value) === requestedValue);
}

function getDuplicateCampaignName(campaign, requestedName) {
  const name = String(requestedName || '').trim();

  if (name) {
    return name;
  }

  return `${campaign?.name || 'Campaign'} Copy`;
}

const DUPLICATE_CAMPAIGN_STATUSES = new Set(['ACTIVE', 'PAUSED']);
const DUPLICATE_REFRESH_ATTEMPTS = 8;
const DUPLICATE_REFRESH_DELAY_MS = 3000;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildAdAccountHierarchyRequest(targetAccount, adAccountId) {
  return {
    id: getAdAccountNodeId(targetAccount, adAccountId),
    account_id: targetAccount.accountId || normalizeAdAccountId(adAccountId),
    name: targetAccount.name,
    currency: targetAccount.currency,
    account_status: targetAccount.statusCode,
  };
}

async function refreshStoredAdAccountHierarchy({ profile, storedAccounts, targetIndex, adAccountId, token, summary, syncedAt = new Date() }) {
  const targetAccount = storedAccounts[targetIndex];
  const requestAccount = buildAdAccountHierarchyRequest(targetAccount, adAccountId);
  const detail = await fetchAdAccountHierarchyForToken(token, requestAccount, summary);
  const pagesById = getPagesById(profile.rawMetaData || {});
  const updatedAccount = normalizeAdAccountAsset(
    {
      ...requestAccount,
      ...detail,
      id: detail.id || requestAccount.id,
      account_id: detail.account_id || requestAccount.account_id,
      name: detail.name || requestAccount.name,
      currency: detail.currency || requestAccount.currency,
      account_status: detail.account_status ?? requestAccount.account_status,
    },
    pagesById,
    syncedAt
  );
  const updatedAccounts = [...storedAccounts];
  updatedAccounts[targetIndex] = updatedAccount;

  profile.adAccounts = updatedAccounts;
  applyStoredAdAccountMetrics(profile, syncedAt);
  profile.markModified('adAccounts');
  await profile.save();

  return updatedAccount;
}

async function fetchCampaignHierarchyForToken(token, campaignId, { currency, pagesById, summary }) {
  const requestedFields = getMetaCampaignFields(getMetaAdSetFields(META_AD_FIELDS));
  const safeFields = getMetaCampaignFields(getMetaAdSetFields(META_AD_SAFE_FIELDS));
  let detail;

  try {
    summary.apiCalls += 1;
    detail = await requestMetaApi(campaignId, token, { fields: requestedFields });
  } catch (error) {
    const message = error.message?.toLowerCase() || '';

    if (!message.includes('creative') && !message.includes('asset_feed_spec') && !message.includes('object_story_spec')) {
      throw error;
    }

    summary.apiCalls += 1;
    detail = await requestMetaApi(campaignId, token, { fields: safeFields });
  }

  return normalizeCampaignAsset(detail, {
    currency,
    pagesById,
  });
}

function getCampaignAdSets(campaign) {
  return Array.isArray(campaign?.adSets) ? campaign.adSets : [];
}

function getCampaignAdSetCount(campaign) {
  const adSets = getCampaignAdSets(campaign);
  return Math.max(Number(campaign?.adSetCount) || 0, adSets.length);
}

function getAdSetExpectedAdCount(adSet) {
  const ads = Array.isArray(adSet?.ads) ? adSet.ads : [];

  return Math.max(Number(adSet?.adCount) || 0, ads.length);
}

function getAdSetLoadedAdCount(adSet) {
  return Array.isArray(adSet?.ads) ? adSet.ads.length : 0;
}

function getCampaignExpectedAdCount(campaign) {
  return getCampaignAdSets(campaign).reduce((total, adSet) => {
    return total + getAdSetExpectedAdCount(adSet);
  }, 0);
}

function getCampaignLoadedAdCount(campaign) {
  return getCampaignAdSets(campaign).reduce((total, adSet) => total + getAdSetLoadedAdCount(adSet), 0);
}

function isCopiedCampaignHierarchyReady(copiedCampaign, sourceCampaign) {
  if (!copiedCampaign) {
    return false;
  }

  return (
    getCampaignAdSetCount(copiedCampaign) >= getCampaignAdSetCount(sourceCampaign) &&
    getCampaignLoadedAdCount(copiedCampaign) >= getCampaignExpectedAdCount(sourceCampaign)
  );
}

function normalizeCopyComparableName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+copy(?:\s+\d+)?$/i, '')
    .toLowerCase();
}

function findCopiedAdSetForSource({ sourceAdSet, sourceIndex, copiedCampaign, copiedAdSetMap }) {
  const copiedAdSets = getCampaignAdSets(copiedCampaign);
  const mappedAdSetId = copiedAdSetMap.get(String(getAdSetIdForAction(sourceAdSet)));

  if (mappedAdSetId) {
    const mappedAdSet = copiedAdSets.find((adSet) => String(getAdSetIdForAction(adSet)) === mappedAdSetId);

    if (mappedAdSet) {
      return mappedAdSet;
    }
  }

  const sourceName = normalizeCopyComparableName(sourceAdSet?.name);
  const nameMatch = copiedAdSets.find((adSet) => normalizeCopyComparableName(adSet?.name) === sourceName);

  if (nameMatch) {
    return nameMatch;
  }

  return copiedAdSets[sourceIndex] || null;
}

async function copyMissingAdsIntoCopiedAdSets({ sourceCampaign, copiedCampaign, copyPayload, token, status, summary }) {
  const expectedAdCount = getCampaignExpectedAdCount(sourceCampaign);
  const loadedAdCount = getCampaignLoadedAdCount(copiedCampaign);

  if (!copiedCampaign || expectedAdCount === 0 || loadedAdCount >= expectedAdCount) {
    return {
      copied: 0,
      failed: 0,
      errors: [],
    };
  }

  const copiedAdSetMap = getCopiedObjectMap(copyPayload, 'ad_set');
  const copiedAdMap = getCopiedObjectMap(copyPayload, 'ad');
  const errors = [];
  let copied = 0;

  const sourceAdSets = getCampaignAdSets(sourceCampaign);
  for (let sourceIndex = 0; sourceIndex < sourceAdSets.length; sourceIndex += 1) {
    const sourceAdSet = sourceAdSets[sourceIndex];
    const sourceAds = Array.isArray(sourceAdSet?.ads) ? sourceAdSet.ads : [];

    if (!sourceAds.length) {
      continue;
    }

    const copiedAdSet = findCopiedAdSetForSource({
      sourceAdSet,
      sourceIndex,
      copiedCampaign,
      copiedAdSetMap,
    });

    if (!copiedAdSet) {
      errors.push({
        adSetId: getAdSetIdForAction(sourceAdSet),
        message: 'Copied ad set was not returned by Meta, so ads could not be attached to it',
      });
      continue;
    }

    const copiedAdSetId = getAdSetIdForAction(copiedAdSet);
    if (!copiedAdSetId) {
      errors.push({
        adSetName: sourceAdSet?.name,
        message: 'Copied ad set id is missing, so ads could not be attached to it',
      });
      continue;
    }

    const loadedInTarget = getAdSetLoadedAdCount(copiedAdSet);
    const adsToCopy = sourceAds.filter((ad, adIndex) => {
      const sourceAdId = getAdIdForAction(ad);

      if (!sourceAdId || copiedAdMap.has(String(sourceAdId))) {
        return false;
      }

      return adIndex >= loadedInTarget;
    });

    for (const sourceAd of adsToCopy) {
      const sourceAdId = getAdIdForAction(sourceAd);

      try {
        await postMetaApi(`${sourceAdId}/copies`, token, {
          adset_id: copiedAdSetId,
          status_option: status,
        });
        summary.apiCalls += 1;
        copied += 1;
      } catch (error) {
        errors.push({
          adId: sourceAdId,
          adName: sourceAd?.name || sourceAd?.title || null,
          adSetId: getAdSetIdForAction(sourceAdSet),
          message: error.message,
        });
      }
    }
  }

  return {
    copied,
    failed: errors.length,
    errors,
  };
}

async function refreshUntilCopiedCampaignReady({
  profile,
  storedAccounts,
  targetIndex,
  adAccountId,
  token,
  summary,
  copiedCampaignId,
  sourceCampaign,
}) {
  let copiedCampaign = null;
  let refreshedAccount = null;

  for (let attempt = 1; attempt <= DUPLICATE_REFRESH_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      await delay(DUPLICATE_REFRESH_DELAY_MS);
    }

    refreshedAccount = await refreshStoredAdAccountHierarchy({
      profile,
      storedAccounts,
      targetIndex,
      adAccountId,
      token,
      summary,
    });
    summary.refreshAttempts = attempt;

    copiedCampaign = (Array.isArray(refreshedAccount.campaigns) ? refreshedAccount.campaigns : []).find((campaign) =>
      campaignMatches(campaign, copiedCampaignId)
    ) || null;

    if (isCopiedCampaignHierarchyReady(copiedCampaign, sourceCampaign)) {
      return {
        copiedCampaign,
        hierarchyReady: true,
        refreshedAccount,
      };
    }
  }

  return {
    copiedCampaign,
    hierarchyReady: false,
    refreshedAccount,
  };
}

async function duplicateCampaign({ profileId, adAccountId, campaignId, name, status = 'PAUSED', deepCopy = true, actor, req, tokenId = null, tokenType = null }) {
  if (!mongoose.Types.ObjectId.isValid(profileId)) {
    throw new HttpError(400, 'Invalid business profile');
  }

  if (!adAccountId) {
    throw new HttpError(400, 'Ad account is required');
  }

  if (!campaignId) {
    throw new HttpError(400, 'Campaign is required');
  }

  if (tokenId && !mongoose.Types.ObjectId.isValid(tokenId)) {
    throw new HttpError(400, 'Invalid Meta API token');
  }

  const normalizedStatus = String(status || 'PAUSED').trim().toUpperCase();
  if (!DUPLICATE_CAMPAIGN_STATUSES.has(normalizedStatus)) {
    throw new HttpError(400, 'Duplicate campaign status must be ACTIVE or PAUSED');
  }

  const profile = await BusinessProfile.findById(profileId);
  if (!profile) {
    throw new HttpError(404, 'Business profile not found');
  }

  const storedAccounts = Array.isArray(profile.adAccounts) ? profile.adAccounts.map(toPlainAdAccount) : [];
  const targetAccountIndex = storedAccounts.findIndex((account) => adAccountMatches(account, adAccountId));

  if (targetAccountIndex === -1) {
    throw new HttpError(404, 'Ad account not found under this business profile');
  }

  const targetAccount = storedAccounts[targetAccountIndex];
  const campaigns = Array.isArray(targetAccount.campaigns) ? targetAccount.campaigns : [];
  const sourceCampaign = campaigns.find((campaign) => campaignMatches(campaign, campaignId));

  if (!sourceCampaign) {
    throw new HttpError(404, 'Campaign not found under this ad account');
  }

  const sourceCampaignId = getCampaignIdForAction(sourceCampaign);
  const resolvedTokenId = tokenId || profile.sourceToken?.toString();
  if (!resolvedTokenId) {
    throw new HttpError(400, 'This business profile does not have a saved Meta API token');
  }

  const token = await tokenService.getActiveTokenWithSecret(resolvedTokenId, tokenType);
  const duplicateName = getDuplicateCampaignName(sourceCampaign, name);
  const summary = {
    apiCalls: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    let sourceCampaignForCopy = sourceCampaign;
    if (getCampaignLoadedAdCount(sourceCampaignForCopy) < getCampaignExpectedAdCount(sourceCampaignForCopy)) {
      try {
        sourceCampaignForCopy = await fetchCampaignHierarchyForToken(token, sourceCampaignId, {
          currency: targetAccount.currency,
          pagesById: getPagesById(profile.rawMetaData || {}),
          summary,
        });
      } catch (error) {
        summary.errors.push({
          campaignId: sourceCampaignId,
          message: `Source campaign ads could not be refreshed before duplicate: ${error.message}`,
        });
      }
    }

    const copyPayload = await postMetaApi(`${sourceCampaignId}/copies`, token, {
      deep_copy: Boolean(deepCopy) ? 'true' : 'false',
      status_option: normalizedStatus,
    });
    summary.apiCalls += 1;

    const copiedCampaignId = getCopiedCampaignId(copyPayload);
    let copiedCampaign = null;

    if (copiedCampaignId) {
      await postMetaApi(copiedCampaignId, token, {
        name: duplicateName,
        status: normalizedStatus,
      });
      summary.apiCalls += 1;

      let refreshResult = await refreshUntilCopiedCampaignReady({
        profile,
        storedAccounts,
        targetIndex: targetAccountIndex,
        adAccountId,
        token,
        summary,
        copiedCampaignId,
        sourceCampaign: sourceCampaignForCopy,
      });
      copiedCampaign = refreshResult.copiedCampaign;

      const manualAdCopyResult = await copyMissingAdsIntoCopiedAdSets({
        sourceCampaign: sourceCampaignForCopy,
        copiedCampaign,
        copyPayload,
        token,
        status: normalizedStatus,
        summary,
      });

      if (manualAdCopyResult.copied > 0) {
        summary.manualAdCopies = manualAdCopyResult.copied;
        refreshResult = await refreshUntilCopiedCampaignReady({
          profile,
          storedAccounts,
          targetIndex: targetAccountIndex,
          adAccountId,
          token,
          summary,
          copiedCampaignId,
          sourceCampaign: sourceCampaignForCopy,
        });
        copiedCampaign = refreshResult.copiedCampaign || copiedCampaign;
      }

      if (manualAdCopyResult.errors.length) {
        summary.manualAdCopyErrors = manualAdCopyResult.errors;
        manualAdCopyResult.errors.forEach((error) => {
          summary.errors.push(error);
        });
      }

      summary.hierarchyReady = refreshResult.hierarchyReady;
      if (!refreshResult.hierarchyReady) {
        summary.errors.push({
          campaignId: copiedCampaignId,
          expectedAds: getCampaignExpectedAdCount(sourceCampaignForCopy),
          loadedAds: getCampaignLoadedAdCount(copiedCampaign),
          message: 'Meta created the copied campaign, but some copied ads are still not visible in the fetched hierarchy.',
        });
      }
      summary.created = 1;
      summary.updated = 1;
    } else {
      summary.skipped = 1;
    }

    await writeActivityLog({
      user: actor,
      action: 'SAVED_CAMPAIGN_DUPLICATED',
      entity: 'BusinessProfile',
      entityId: profile._id.toString(),
      metadata: {
        adAccountId,
        campaignId: sourceCampaignId,
        copiedCampaignId,
        name: duplicateName,
        status: normalizedStatus,
        deepCopy: Boolean(deepCopy),
        tokenId: resolvedTokenId,
        tokenType,
      },
      req,
    });

    return {
      message: summary.manualAdCopyErrors?.length
        ? 'Campaign duplicated, but Meta rejected some ad copies'
        : copiedCampaignId && copiedCampaign && summary.hierarchyReady
          ? 'Campaign duplicated successfully'
          : copiedCampaignId && copiedCampaign
            ? 'Campaign duplicated in Meta, but some copied ads are still being prepared'
            : copiedCampaignId
              ? 'Campaign duplicated in Meta, but the copied hierarchy is still being prepared'
              : 'Campaign duplication requested, but Meta did not return the copied campaign id',
      campaign: copiedCampaign,
      campaignId: sourceCampaignId,
      copiedCampaignId,
      name: duplicateName,
      status: normalizedStatus,
      summary,
      meta: copyPayload,
    };
  } catch (error) {
    summary.failed = 1;
    summary.errors.push({
      campaignId: sourceCampaignId,
      message: error.message,
    });

    await writeActivityLog({
      user: actor,
      action: 'SAVED_CAMPAIGN_DUPLICATE_FAILED',
      entity: 'BusinessProfile',
      entityId: profile._id.toString(),
      metadata: {
        adAccountId,
        campaignId: sourceCampaignId,
        message: error.message,
        tokenId: resolvedTokenId,
        tokenType,
      },
      req,
    });

    throw error;
  }
}

function getCampaignStatusActionLabel(status) {
  return status === 'ACTIVE' ? 'started' : 'paused';
}

function getCampaignStatusObjectActions(campaign, campaignId, status) {
  const adSetActions = [];
  const adActions = [];

  getCampaignAdSets(campaign).forEach((adSet) => {
    const adSetId = getAdSetIdForAction(adSet);

    if (adSetId) {
      adSetActions.push({
        id: adSetId,
        type: 'AdSet',
        name: adSet.name || `Ad set ${adSetId}`,
        status,
      });
    }

    (Array.isArray(adSet?.ads) ? adSet.ads : []).forEach((ad) => {
      const adId = getAdIdForAction(ad);

      if (adId) {
        adActions.push({
          id: adId,
          type: 'Ad',
          name: ad.name || ad.title || `Ad ${adId}`,
          status,
        });
      }
    });
  });

  const campaignAction = {
    id: campaignId,
    type: 'Campaign',
    name: campaign?.name || `Campaign ${campaignId}`,
    status,
  };

  return status === 'ACTIVE'
    ? [...adActions, ...adSetActions, campaignAction]
    : [campaignAction, ...adSetActions, ...adActions];
}

async function applyCampaignStatusActions({ actions, token, summary }) {
  for (const action of actions) {
    try {
      await postMetaApi(action.id, token, { status: action.status });
      summary.apiCalls += 1;
      summary.updated += 1;
    } catch (error) {
      summary.failed += 1;
      summary.errors.push({
        id: action.id,
        type: action.type,
        name: action.name,
        message: error.message,
      });
    }
  }
}

async function updateCampaignStatus({ profileId, adAccountId, campaignId, status, actor, req, tokenId = null, tokenType = null }) {
  if (!mongoose.Types.ObjectId.isValid(profileId)) {
    throw new HttpError(400, 'Invalid business profile');
  }

  if (!adAccountId) {
    throw new HttpError(400, 'Ad account is required');
  }

  if (!campaignId) {
    throw new HttpError(400, 'Campaign is required');
  }

  if (tokenId && !mongoose.Types.ObjectId.isValid(tokenId)) {
    throw new HttpError(400, 'Invalid Meta API token');
  }

  const normalizedStatus = String(status || '').trim().toUpperCase();
  if (!DUPLICATE_CAMPAIGN_STATUSES.has(normalizedStatus)) {
    throw new HttpError(400, 'Campaign status must be ACTIVE or PAUSED');
  }

  const profile = await BusinessProfile.findById(profileId);
  if (!profile) {
    throw new HttpError(404, 'Business profile not found');
  }

  const storedAccounts = Array.isArray(profile.adAccounts) ? profile.adAccounts.map(toPlainAdAccount) : [];
  const targetAccountIndex = storedAccounts.findIndex((account) => adAccountMatches(account, adAccountId));

  if (targetAccountIndex === -1) {
    throw new HttpError(404, 'Ad account not found under this business profile');
  }

  const targetAccount = storedAccounts[targetAccountIndex];
  const campaigns = Array.isArray(targetAccount.campaigns) ? targetAccount.campaigns : [];
  const sourceCampaign = campaigns.find((campaign) => campaignMatches(campaign, campaignId));

  if (!sourceCampaign) {
    throw new HttpError(404, 'Campaign not found under this ad account');
  }

  const sourceCampaignId = getCampaignIdForAction(sourceCampaign);
  const resolvedTokenId = tokenId || profile.sourceToken?.toString();
  if (!resolvedTokenId) {
    throw new HttpError(400, 'This business profile does not have a saved Meta API token');
  }

  const token = await tokenService.getActiveTokenWithSecret(resolvedTokenId, tokenType);
  const summary = {
    apiCalls: 0,
    updated: 0,
    failed: 0,
    errors: [],
    status: normalizedStatus,
  };

  let campaignForAction = sourceCampaign;
  if (getCampaignLoadedAdCount(campaignForAction) < getCampaignExpectedAdCount(campaignForAction)) {
    try {
      campaignForAction = await fetchCampaignHierarchyForToken(token, sourceCampaignId, {
        currency: targetAccount.currency,
        pagesById: getPagesById(profile.rawMetaData || {}),
        summary,
      });
    } catch (error) {
      summary.errors.push({
        campaignId: sourceCampaignId,
        message: `Campaign children could not be refreshed before status update: ${error.message}`,
      });
    }
  }

  const actions = getCampaignStatusObjectActions(campaignForAction, sourceCampaignId, normalizedStatus);
  await applyCampaignStatusActions({ actions, token, summary });

  let refreshedCampaign = null;
  try {
    const refreshedAccount = await refreshStoredAdAccountHierarchy({
      profile,
      storedAccounts,
      targetIndex: targetAccountIndex,
      adAccountId,
      token,
      summary,
    });
    refreshedCampaign = (Array.isArray(refreshedAccount.campaigns) ? refreshedAccount.campaigns : []).find((campaign) =>
      campaignMatches(campaign, sourceCampaignId)
    ) || null;
  } catch (error) {
    summary.errors.push({
      campaignId: sourceCampaignId,
      message: `Campaign status updated, but refresh failed: ${error.message}`,
    });
  }

  await writeActivityLog({
    user: actor,
    action: 'SAVED_CAMPAIGN_STATUS_UPDATED',
    entity: 'BusinessProfile',
    entityId: profile._id.toString(),
    metadata: {
      adAccountId,
      campaignId: sourceCampaignId,
      status: normalizedStatus,
      tokenId: resolvedTokenId,
      tokenType,
      ...summary,
    },
    req,
  });

  const actionLabel = getCampaignStatusActionLabel(normalizedStatus);

  return {
    message: summary.failed
      ? `Campaign ${actionLabel}, but ${summary.failed} child status update${summary.failed === 1 ? '' : 's'} failed`
      : `Campaign ${actionLabel} successfully`,
    campaign: refreshedCampaign,
    campaignId: sourceCampaignId,
    status: normalizedStatus,
    summary,
  };
}

async function syncAdAccount({ profileId, adAccountId, actor, req, tokenId = null, tokenType = null }) {
  if (!mongoose.Types.ObjectId.isValid(profileId)) {
    throw new HttpError(400, 'Invalid business profile');
  }

  if (!adAccountId) {
    throw new HttpError(400, 'Ad account is required');
  }

  if (tokenId && !mongoose.Types.ObjectId.isValid(tokenId)) {
    throw new HttpError(400, 'Invalid Meta API token');
  }

  const profile = await BusinessProfile.findById(profileId);
  if (!profile) {
    throw new HttpError(404, 'Business profile not found');
  }

  const storedAccounts = Array.isArray(profile.adAccounts) ? profile.adAccounts.map(toPlainAdAccount) : [];
  const targetIndex = storedAccounts.findIndex((account) => adAccountMatches(account, adAccountId));

  if (targetIndex === -1) {
    throw new HttpError(404, 'Ad account not found under this business profile');
  }

  const resolvedTokenId = tokenId || profile.sourceToken?.toString();
  if (!resolvedTokenId) {
    throw new HttpError(400, 'This business profile does not have a saved Meta API token');
  }

  const token = await tokenService.getActiveTokenWithSecret(resolvedTokenId, tokenType);
  const syncedAt = new Date();
  const targetAccount = storedAccounts[targetIndex];
  const requestAccount = {
    id: getAdAccountNodeId(targetAccount, adAccountId),
    account_id: targetAccount.accountId || normalizeAdAccountId(adAccountId),
    name: targetAccount.name,
    currency: targetAccount.currency,
    account_status: targetAccount.statusCode,
  };
  const summary = {
    tokensChecked: 1,
    apiCalls: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    hierarchyFetchFailed: 0,
    errors: [],
  };

  try {
    const detail = await fetchAdAccountHierarchyForToken(token, requestAccount, summary);
    const pagesById = getPagesById(profile.rawMetaData || {});
    const updatedAccount = normalizeAdAccountAsset(
      {
        ...requestAccount,
        ...detail,
        id: detail.id || requestAccount.id,
        account_id: detail.account_id || requestAccount.account_id,
        name: detail.name || requestAccount.name,
        currency: detail.currency || requestAccount.currency,
        account_status: detail.account_status ?? requestAccount.account_status,
      },
      pagesById,
      syncedAt
    );
    const updatedAccounts = [...storedAccounts];
    updatedAccounts[targetIndex] = updatedAccount;

    profile.adAccounts = updatedAccounts;
    applyStoredAdAccountMetrics(profile, syncedAt);
    await profile.save();
    summary.updated = 1;

    await writeActivityLog({
      user: actor,
      action: 'AD_ACCOUNT_SYNCED',
      entity: 'BusinessProfile',
      entityId: profile._id.toString(),
      metadata: {
        adAccountId,
        adAccountName: updatedAccount.name,
        summary,
        tokenId: resolvedTokenId,
        tokenType,
      },
      req,
    });

    return {
      adAccount: updatedAccount,
      profile: profile.toSafeObject(),
      summary,
    };
  } catch (error) {
    summary.failed = 1;
    summary.hierarchyFetchFailed = 1;
    summary.errors.push({
      adAccountId,
      adAccountName: targetAccount.name,
      message: error.message,
    });

    await writeActivityLog({
      user: actor,
      action: 'AD_ACCOUNT_SYNC_FAILED',
      entity: 'BusinessProfile',
      entityId: profile._id.toString(),
      metadata: {
        adAccountId,
        adAccountName: targetAccount.name,
        summary,
        tokenId: resolvedTokenId,
        tokenType,
      },
      req,
    });

    throw error;
  }
}

async function syncBusinessProfiles({ actor, req, tokenId = null, socialAccountId = null, tokenType = null }) {
  const {
    activeTokens,
    requestedSocialAccount,
    tokenId: resolvedTokenId,
  } = await resolveSyncScope({ tokenId, socialAccountId, tokenType });

  if (!activeTokens.length) {
    throw new HttpError(
      400,
      tokenId || socialAccountId
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
    hierarchyFetchFailed: 0,
    socialAccountsCreated: 0,
    socialAccountsUpdated: 0,
    socialAccountsSkipped: 0,
    errors: [],
  };

  for (const token of activeTokens) {
    try {
      const usesExistingSocialScope =
        requestedSocialAccount && token.tokenType === tokenService.TOKEN_USAGE_TYPES.SYSTEM_USER;
      let metaSocialAccount;
      let metaProfiles;

      if (usesExistingSocialScope) {
        ({ metaSocialAccount, metaProfiles } = await getExistingSocialAccountScopeForSystemUserToken(requestedSocialAccount));
      } else {
        summary.apiCalls += 1;
        ({ metaSocialAccount, metaProfiles } = await fetchSocialAccountAndBusinessesForToken(token));
      }

      if (requestedSocialAccount && metaSocialAccount.id !== requestedSocialAccount.metaAccountId) {
        throw new HttpError(
          400,
          `Saved token now belongs to ${metaSocialAccount.name || metaSocialAccount.id}, not ${requestedSocialAccount.name}`
        );
      }

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
      tokenId: resolvedTokenId,
      tokenType,
      socialAccountId,
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
  duplicateCampaign,
  listBusinessProfiles,
  syncAdAccount,
  syncBusinessProfiles,
  updateCampaignStatus,
};
