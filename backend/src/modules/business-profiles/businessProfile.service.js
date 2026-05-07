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
  `id,name,status,effective_status,objective,adsets.limit(100).summary(true){${adSetFields}},insights.date_preset(maximum).limit(1){${META_INSIGHT_FIELDS}}`;
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

function getActionValue(insight, actionTypes) {
  const actions = Array.isArray(insight.actions) ? insight.actions : [];

  return actions.reduce((total, action) => {
    const normalizedActionType = String(action.action_type || '').toLowerCase();
    const matches = actionTypes.includes(normalizedActionType) || isLeadActionType(normalizedActionType);

    return matches ? total + parseMetricNumber(action.value) : total;
  }, 0);
}

function getCostPerActionValue(insight, actionTypes) {
  const costs = Array.isArray(insight.cost_per_action_type) ? insight.cost_per_action_type : [];
  const match = costs.find((cost) => {
    const normalizedActionType = String(cost.action_type || '').toLowerCase();

    return actionTypes.includes(normalizedActionType) || isLeadActionType(normalizedActionType);
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
  const cpr = getCostPerActionValue(insight, LEAD_ACTION_TYPES) || getRatioMetric(spend, leads);

  return {
    spend,
    impressions: parseMetricNumber(insight.impressions),
    reach: parseMetricNumber(insight.reach),
    clicks,
    leads,
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
  listBusinessProfiles,
  syncBusinessProfiles,
};
