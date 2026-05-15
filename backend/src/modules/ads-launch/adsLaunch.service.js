const fs = require('fs');
const mongoose = require('mongoose');
const path = require('path');
const HttpError = require('../../app/utils/httpError');
const { waitForMetaApiPacing } = require('../../app/utils/metaApiPacing');
const {
  STORAGE_PROVIDERS,
  deleteObjectStorageAsset,
  moveFileWithinLocalStorage,
  readObjectStorageBuffer,
  uploadBufferToObjectStorage,
  uploadFileToObjectStorage,
  writeBufferWithinLocalStorage,
} = require('../../app/utils/objectStorage');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const { User, USER_ROLES } = require('../users/user.model');
const LaunchTemplate = require('./adsLaunch.model');
const { LAUNCH_TEMPLATE_TYPES } = require('./adsLaunch.model');
const AdsLaunchPublishSession = require('./adsLaunchPublishSession.model');
const { PUBLISH_SESSION_STATUSES } = require('./adsLaunchPublishSession.model');
const { PUBLISH_SESSION_QUEUE_STATUSES } = require('./adsLaunchPublishSession.model');
const AdsLaunchMedia = require('./adsLaunchMedia.model');
const { ADS_MEDIA_TYPES } = require('./adsLaunchMedia.model');
const AdsLaunchMediaFolder = require('./adsLaunchMediaFolder.model');
const ManagedCampaign = require('../ads-manage/adsManage.model');
const adsManageService = require('../ads-manage/adsManage.service');
const settingsService = require('../settings/settings.service');
const tokenService = require('../token-management/token.service');

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const GRAPH_VIDEO_API_BASE = `https://graph-video.facebook.com/${META_GRAPH_VERSION}`;
const TEMPLATE_ASSET_DIR = path.resolve(__dirname, '../../../storage/ads-launch-template-assets');
const MEDIA_LIBRARY_ASSET_DIR = path.resolve(__dirname, '../../../storage/ads-launch-media-assets');
const MEDIA_CHUNK_UPLOAD_DIR = path.resolve(__dirname, '../../../storage/ads-launch-media-chunks');
const TEMPLATE_ASSET_STORAGE_NAMESPACE = 'ads-launch-template-assets';
const MEDIA_LIBRARY_ASSET_STORAGE_NAMESPACE = 'ads-launch-media-assets';
const DEFAULT_VIDEO_READY_TIMEOUT_MS = 180000;
const DEFAULT_VIDEO_READY_POLL_MS = 5000;
const MAX_VIDEO_READY_TIMEOUT_MS = 600000;
const MIN_VIDEO_READY_POLL_MS = 2500;
const MEDIA_LIBRARY_MIN_DIMENSION = 600;
const MEDIA_LIBRARY_MIN_ASPECT_RATIO = 0.56;
const MEDIA_LIBRARY_MAX_ASPECT_RATIO = 1.92;
const MEDIA_LIBRARY_MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MEDIA_LIBRARY_MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MEDIA_LIBRARY_MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;
const MEDIA_LIBRARY_IMAGE_MIME_TYPES = new Set(['image/jpeg']);
const MEDIA_LIBRARY_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime']);
const META_QUEUEABLE_ERROR_CODES = new Set([4, 17, 32, 368, 613, 80004]);
const META_QUEUEABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_QUEUE_RETRY_AFTER_SECONDS = 300;
const MAX_QUEUE_RETRY_AFTER_SECONDS = 3600;
const PUBLISH_SESSION_EVENT_LIMIT = 120;
const SCHEDULE_MIN_LEAD_MINUTES = 10;
const INDONESIA_TIME_ZONE_LABEL = 'Indonesia time (WIB, UTC+7)';
const INDONESIA_UTC_OFFSET_COMPACT = '+0700';
const INDONESIA_UTC_OFFSET_ISO = '+07:00';

let publishSessionQueueTimer = null;
let publishSessionQueueTimerDueAt = null;
let publishSessionQueueRunning = false;
const activePublishSessionResources = new Map();
const forceStoppedPublishSessionIds = new Set();

const SUPPORTED_WEBSITE_EVENTS = new Set([
  'LEAD',
  'PURCHASE',
  'COMPLETE_REGISTRATION',
  'ADD_TO_CART',
  'INITIATE_CHECKOUT',
  'VIEW_CONTENT',
  'CONTACT',
  'SUBSCRIBE',
]);

const DEFAULT_WEBSITE_EVENT_BY_OBJECTIVE = Object.freeze({
  OUTCOME_LEADS: 'LEAD',
  OUTCOME_SALES: 'PURCHASE',
});

const SUPPORTED_OBJECTIVES = Object.freeze({
  OUTCOME_TRAFFIC: {
    requiresPixel: false,
    optimizationGoal: 'LINK_CLICKS',
    destinationType: 'WEBSITE',
    buildPromotedObject: () => null,
  },
  OUTCOME_ENGAGEMENT: {
    requiresPixel: false,
    optimizationGoal: 'POST_ENGAGEMENT',
    destinationType: null,
    buildPromotedObject: ({ pageId }) => ({
      page_id: pageId,
    }),
  },
  OUTCOME_LEADS: {
    requiresPixel: true,
    optimizationGoal: 'OFFSITE_CONVERSIONS',
    destinationType: 'WEBSITE',
    buildPromotedObject: ({ pixelId, websiteEvent }) => ({
      pixel_id: pixelId,
      custom_event_type: websiteEvent,
    }),
  },
  OUTCOME_SALES: {
    requiresPixel: true,
    optimizationGoal: 'OFFSITE_CONVERSIONS',
    destinationType: 'WEBSITE',
    buildPromotedObject: ({ pixelId, websiteEvent }) => ({
      pixel_id: pixelId,
      custom_event_type: websiteEvent,
    }),
  },
});

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

const DEFAULT_STATIC_DEFAULTS = Object.freeze({
  buyingType: 'AUCTION',
  campaignStatus: 'PAUSED',
  specialAdCategories: 'NONE',
  placements: 'ADVANTAGE_PLUS',
  budgetLevel: 'AD_SET',
  dynamicCreative: 'ON',
  audienceAgeMin: '21',
  audienceAgeMax: '65',
  genderTargeting: 'ALL',
  billingEvent: 'IMPRESSIONS',
  bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
  bidAmount: '',
  attributionSetting: 'CLICK_7D_VIEW_1D',
  attributionWindows: {
    clickThrough: '7D',
    engagedView: '1D',
    viewThrough: '1D',
  },
});
const SPECIAL_AD_CATEGORY_NONE = 'NONE';
const ATTRIBUTION_SETTINGS = Object.freeze({
  META_DEFAULT: 'META_DEFAULT',
  CLICK_1D: 'CLICK_1D',
  CLICK_7D: 'CLICK_7D',
  CLICK_1D_VIEW_1D: 'CLICK_1D_VIEW_1D',
  CLICK_7D_VIEW_1D: 'CLICK_7D_VIEW_1D',
});
const CLICK_THROUGH_ATTRIBUTION_WINDOWS = new Set(['1D', '7D']);
const OPTIONAL_ATTRIBUTION_WINDOWS = new Set(['NONE', '1D']);
const SUPPORTED_BID_STRATEGIES = new Set([
  'LOWEST_COST_WITHOUT_CAP',
  'LOWEST_COST_WITH_BID_CAP',
  'COST_CAP',
]);
const BID_AMOUNT_STRATEGIES = new Set(['LOWEST_COST_WITH_BID_CAP', 'COST_CAP']);
const META_ENGAGED_VIEW_ATTRIBUTION_EVENT_TYPE = 'ENGAGED_VIDEO_VIEW';

function isSuperAdmin(user) {
  return user?.role === USER_ROLES.SUPER_ADMIN;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatDelayDuration(ms) {
  const seconds = Math.max(Math.round(ms / 1000), 0);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function normalizeTemplateType(value) {
  const templateType = normalizeText(value).toUpperCase();
  return Object.values(LAUNCH_TEMPLATE_TYPES).includes(templateType) ? templateType : LAUNCH_TEMPLATE_TYPES.FULL;
}

function resolveWebsiteEvent({ objective, websiteEvent }) {
  if (!SUPPORTED_OBJECTIVES[objective]?.requiresPixel) {
    return '';
  }

  const defaultEvent = DEFAULT_WEBSITE_EVENT_BY_OBJECTIVE[objective] || 'LEAD';
  const normalizedEvent = normalizeText(websiteEvent).toUpperCase() || defaultEvent;

  if (!SUPPORTED_WEBSITE_EVENTS.has(normalizedEvent)) {
    throw new HttpError(400, 'Website event must be a supported Meta standard event');
  }

  return normalizedEvent;
}

function normalizeUrlParameters(value) {
  return normalizeText(value)
    .replace(/^[?&]+/, '')
    .split('&')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const separatorIndex = segment.indexOf('=');

      if (separatorIndex === -1) {
        return segment;
      }

      const key = segment.slice(0, separatorIndex).trim();
      const parameterValue = segment.slice(separatorIndex + 1).trim();
      return `${key}=${parameterValue}`;
    })
    .join('&');
}

function getUrlParameterValidationError(value) {
  const normalizedValue = normalizeUrlParameters(value);

  if (!normalizedValue) {
    return '';
  }

  const seenKeys = new Set();

  for (const segment of normalizedValue.split('&')) {
    const separatorIndex = segment.indexOf('=');

    if (separatorIndex === -1) {
      return `URL parameter "${segment}" must use key=value format`;
    }

    const key = segment.slice(0, separatorIndex).trim();
    const parameterValue = segment.slice(separatorIndex + 1).trim();

    if (!key || !parameterValue) {
      return 'URL parameters must use key=value format and cannot have blank values';
    }

    if (!/^[A-Za-z0-9_.~-]+$/.test(key)) {
      return `URL parameter key "${key}" can only use letters, numbers, dot, underscore, dash, or tilde`;
    }

    if (/\s/.test(key) || /\s/.test(parameterValue)) {
      return 'URL parameter keys and values cannot contain spaces. Use underscores or Meta dynamic values instead.';
    }

    if (seenKeys.has(key)) {
      return `URL parameter "${key}" is duplicated`;
    }

    seenKeys.add(key);
  }

  return '';
}

function parseHttpUrl(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return null;
  }

  const candidate = /^[a-z][a-z\d+\-.]*:\/\//i.test(normalizedValue) ? normalizedValue : `https://${normalizedValue}`;

  try {
    const url = new URL(candidate);

    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || !url.hostname.includes('.')) {
      return null;
    }

    url.username = '';
    url.password = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function normalizeDestinationUrl(value) {
  const url = parseHttpUrl(value);
  return url ? url.toString() : '';
}

function normalizeDisplayUrl(value) {
  const url = parseHttpUrl(value);

  if (!url) {
    return '';
  }

  const path = url.pathname && url.pathname !== '/' ? url.pathname.replace(/\/+$/, '') : '';
  return `${url.hostname}${path}`;
}

function dedupeStrings(values) {
  return Array.from(
    new Set(
      Array.isArray(values)
        ? values
            .map((value) => normalizeText(value))
            .filter(Boolean)
        : []
    )
  );
}

function normalizeAttributionSetting(value) {
  const normalizedValue = normalizeText(value).toUpperCase();
  return Object.values(ATTRIBUTION_SETTINGS).includes(normalizedValue)
    ? normalizedValue
    : DEFAULT_STATIC_DEFAULTS.attributionSetting;
}

function getAttributionWindowsFromLegacySetting(value) {
  const attributionSetting = normalizeAttributionSetting(value);

  if (attributionSetting === ATTRIBUTION_SETTINGS.CLICK_1D) {
    return {
      clickThrough: '1D',
      engagedView: 'NONE',
      viewThrough: 'NONE',
    };
  }

  if (attributionSetting === ATTRIBUTION_SETTINGS.CLICK_7D) {
    return {
      clickThrough: '7D',
      engagedView: 'NONE',
      viewThrough: 'NONE',
    };
  }

  if (attributionSetting === ATTRIBUTION_SETTINGS.CLICK_1D_VIEW_1D) {
    return {
      clickThrough: '1D',
      engagedView: 'NONE',
      viewThrough: '1D',
    };
  }

  if (attributionSetting === ATTRIBUTION_SETTINGS.CLICK_7D_VIEW_1D) {
    return {
      clickThrough: '7D',
      engagedView: 'NONE',
      viewThrough: '1D',
    };
  }

  return {
    ...DEFAULT_STATIC_DEFAULTS.attributionWindows,
  };
}

function normalizeAttributionWindowValue(value, allowedValues, fallback) {
  const normalizedValue = normalizeText(value).toUpperCase();
  return allowedValues.has(normalizedValue) ? normalizedValue : fallback;
}

function normalizeAttributionWindows(staticDefaults = {}) {
  const attributionWindows = staticDefaults.attributionWindows || {};
  const hasStructuredWindows = ['clickThrough', 'engagedView', 'viewThrough'].some((field) =>
    normalizeText(attributionWindows[field])
  );
  const fallbackWindows = hasStructuredWindows
    ? DEFAULT_STATIC_DEFAULTS.attributionWindows
    : getAttributionWindowsFromLegacySetting(staticDefaults.attributionSetting);

  return {
    clickThrough: normalizeAttributionWindowValue(
      attributionWindows.clickThrough || fallbackWindows.clickThrough,
      CLICK_THROUGH_ATTRIBUTION_WINDOWS,
      fallbackWindows.clickThrough
    ),
    engagedView: normalizeAttributionWindowValue(
      attributionWindows.engagedView || fallbackWindows.engagedView,
      OPTIONAL_ATTRIBUTION_WINDOWS,
      fallbackWindows.engagedView
    ),
    viewThrough: normalizeAttributionWindowValue(
      attributionWindows.viewThrough || fallbackWindows.viewThrough,
      OPTIONAL_ATTRIBUTION_WINDOWS,
      fallbackWindows.viewThrough
    ),
  };
}

function getAttributionSettingFromWindows(windows = {}) {
  const normalizedWindows = normalizeAttributionWindows({
    attributionWindows: windows,
  });
  const clickPrefix = normalizedWindows.clickThrough === '1D'
    ? ATTRIBUTION_SETTINGS.CLICK_1D
    : ATTRIBUTION_SETTINGS.CLICK_7D;

  return normalizedWindows.viewThrough === '1D' ? `${clickPrefix}_VIEW_1D` : clickPrefix;
}

function sanitizeStaticDefaults(staticDefaults = {}) {
  const attributionWindows = normalizeAttributionWindows(staticDefaults);

  return {
    buyingType: normalizeText(staticDefaults.buyingType) || DEFAULT_STATIC_DEFAULTS.buyingType,
    campaignStatus: resolveCampaignStatus(staticDefaults.campaignStatus),
    specialAdCategories:
      normalizeText(staticDefaults.specialAdCategories) || DEFAULT_STATIC_DEFAULTS.specialAdCategories,
    placements: normalizeText(staticDefaults.placements) || DEFAULT_STATIC_DEFAULTS.placements,
    budgetLevel: normalizeText(staticDefaults.budgetLevel) || DEFAULT_STATIC_DEFAULTS.budgetLevel,
    dynamicCreative: normalizeText(staticDefaults.dynamicCreative) || DEFAULT_STATIC_DEFAULTS.dynamicCreative,
    audienceAgeMin: normalizeText(staticDefaults.audienceAgeMin) || DEFAULT_STATIC_DEFAULTS.audienceAgeMin,
    audienceAgeMax: normalizeText(staticDefaults.audienceAgeMax) || DEFAULT_STATIC_DEFAULTS.audienceAgeMax,
    genderTargeting: normalizeText(staticDefaults.genderTargeting) || DEFAULT_STATIC_DEFAULTS.genderTargeting,
    billingEvent: normalizeText(staticDefaults.billingEvent) || DEFAULT_STATIC_DEFAULTS.billingEvent,
    bidStrategy: normalizeText(staticDefaults.bidStrategy) || DEFAULT_STATIC_DEFAULTS.bidStrategy,
    bidAmount: normalizeText(staticDefaults.bidAmount),
    attributionSetting: getAttributionSettingFromWindows(attributionWindows),
    attributionWindows,
  };
}

function mergeStaticDefaultsWithAttribution(baseStaticDefaults = {}, overrideStaticDefaults = {}) {
  const mergedStaticDefaults = {
    ...baseStaticDefaults,
    ...overrideStaticDefaults,
  };
  const hasOverrideAttribution =
    Object.prototype.hasOwnProperty.call(overrideStaticDefaults, 'attributionSetting') ||
    Object.prototype.hasOwnProperty.call(overrideStaticDefaults, 'attributionWindows');

  if (hasOverrideAttribution && !overrideStaticDefaults.attributionWindows) {
    delete mergedStaticDefaults.attributionWindows;
  }

  return mergedStaticDefaults;
}

function buildAttributionSpec(staticDefaults = {}, objective = '', hasVideoCreative = false) {
  const attributionSetting = normalizeAttributionSetting(staticDefaults.attributionSetting);

  if (attributionSetting === ATTRIBUTION_SETTINGS.META_DEFAULT) {
    return null;
  }

  const objectiveSettings = SUPPORTED_OBJECTIVES[objective];
  if (objectiveSettings && !objectiveSettings.requiresPixel) {
    return [
      {
        event_type: 'CLICK_THROUGH',
        window_days: 1,
      },
    ];
  }

  const attributionWindows = normalizeAttributionWindows(staticDefaults);
  const spec = [];

  spec.push({
    event_type: 'CLICK_THROUGH',
    window_days: attributionWindows.clickThrough === '1D' ? 1 : 7,
  });

  if (hasVideoCreative && attributionWindows.engagedView === '1D') {
    spec.push({
      event_type: META_ENGAGED_VIEW_ATTRIBUTION_EVENT_TYPE,
      window_days: 1,
    });
  }

  if (attributionWindows.viewThrough === '1D') {
    spec.push({
      event_type: 'VIEW_THROUGH',
      window_days: 1,
    });
  }

  return spec.length ? spec : null;
}

function normalizeMetaAttributionSpec(spec = []) {
  let rawSpec = spec;

  if (typeof rawSpec === 'string') {
    try {
      rawSpec = JSON.parse(rawSpec);
    } catch (error) {
      rawSpec = [];
    }
  }

  if (!Array.isArray(rawSpec)) {
    return [];
  }

  return rawSpec
    .map((item) => ({
      event_type:
        normalizeText(item?.event_type).toUpperCase() === 'ENGAGED_VIEW'
          ? META_ENGAGED_VIEW_ATTRIBUTION_EVENT_TYPE
          : normalizeText(item?.event_type).toUpperCase(),
      window_days: Number(item?.window_days),
    }))
    .filter((item) => item.event_type && Number.isFinite(item.window_days) && item.window_days > 0);
}

function hasEngagedViewAttribution(spec = []) {
  return normalizeMetaAttributionSpec(spec).some((item) => item.event_type === META_ENGAGED_VIEW_ATTRIBUTION_EVENT_TYPE);
}

function isAttributionSpecApplied(expectedSpec = [], currentSpec = []) {
  const expectedItems = normalizeMetaAttributionSpec(expectedSpec);
  const currentMap = new Map(
    normalizeMetaAttributionSpec(currentSpec).map((item) => [item.event_type, item.window_days])
  );

  return expectedItems.every((item) => currentMap.get(item.event_type) === item.window_days);
}

function buildFallbackAttributionSpecFromMetaError(error, originalSpec = []) {
  const message = String(error?.message || '');
  const match = message.match(/supported combination of click-through and view-through attribution window values are:\s*\((\d+),\s*(\d+)\)/i);

  if (!match) {
    return null;
  }

  const clickDays = Number.parseInt(match[1], 10);
  const viewDays = Number.parseInt(match[2], 10);
  const spec = [];

  if (Number.isFinite(clickDays) && clickDays > 0) {
    spec.push({
      event_type: 'CLICK_THROUGH',
      window_days: clickDays,
    });
  }

  if (Number.isFinite(viewDays) && viewDays > 0) {
    spec.push({
      event_type: 'VIEW_THROUGH',
      window_days: viewDays,
    });
  }

  if (Array.isArray(originalSpec)) {
    originalSpec
      .filter((item) => hasEngagedViewAttribution([item]) && Number(item.window_days) > 0)
      .forEach((item) => {
        spec.push({
          event_type: META_ENGAGED_VIEW_ATTRIBUTION_EVENT_TYPE,
          window_days: Number(item.window_days),
        });
      });
  }

  return spec.length ? spec : [];
}

function isAttributionWindowMetaError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('attribution window') || message.includes('attribution_spec');
}

async function syncVideoAdSetAttribution({
  token,
  adSetId,
  objective,
  staticDefaults,
  progress = null,
  progressContext = {},
}) {
  const attributionSpec = buildAttributionSpec(staticDefaults, objective, true);

  if (!adSetId || !hasEngagedViewAttribution(attributionSpec)) {
    return {
      requested: normalizeMetaAttributionSpec(attributionSpec),
      applied: [],
      verified: false,
      skipped: true,
    };
  }

  const syncMessage = `${progressContext.accountLabel}: syncing engaged-view attribution after video publish`;
  progress?.info({
    ...progressContext,
    step: 'attribution-sync',
    status: 'active',
    message: syncMessage,
  });

  const readAdSetAttribution = async () => {
    const payload = await getFromMeta({
      token,
      path: adSetId,
      params: {
        fields: 'id,attribution_spec',
      },
    });

    return normalizeMetaAttributionSpec(payload?.attribution_spec);
  };

  const applyAttribution = async () =>
    postToMeta({
      token,
      path: adSetId,
      params: {
        attribution_spec: attributionSpec,
      },
    });

  try {
    await applyAttribution();
    let appliedSpec = await readAdSetAttribution();

    if (!isAttributionSpecApplied(attributionSpec, appliedSpec)) {
      await sleep(1500);
      await applyAttribution();
      appliedSpec = await readAdSetAttribution();
    }

    const verified = isAttributionSpecApplied(attributionSpec, appliedSpec);

    progress?.info({
      ...progressContext,
      step: 'attribution-sync',
      status: verified ? 'completed' : 'active',
      message: verified
        ? `${progressContext.accountLabel}: engaged-view attribution confirmed on the Meta ad set`
        : `${progressContext.accountLabel}: engaged-view attribution was requested, but Meta kept a different ad set attribution`,
      details: {
        requestedAttributionSpec: normalizeMetaAttributionSpec(attributionSpec),
        appliedAttributionSpec: appliedSpec,
      },
    });

    return {
      requested: normalizeMetaAttributionSpec(attributionSpec),
      applied: appliedSpec,
      verified,
      skipped: false,
    };
  } catch (error) {
    progress?.info({
      ...progressContext,
      step: 'attribution-sync',
      status: 'active',
      error: error.message,
      message: `${progressContext.accountLabel}: unable to confirm engaged-view attribution after publish`,
      details: {
        requestedAttributionSpec: normalizeMetaAttributionSpec(attributionSpec),
      },
    });

    return {
      requested: normalizeMetaAttributionSpec(attributionSpec),
      applied: [],
      verified: false,
      skipped: false,
      error: error.message,
    };
  }
}

function sanitizeTemplateConfig(input = {}) {
  const staticDefaults = input.staticDefaults || {};
  const countries = dedupeStrings(input.countries);
  const fallbackCountry = normalizeText(input.country);
  const normalizedCountries = countries.length ? countries : fallbackCountry ? [fallbackCountry] : [];
  const scheduleStart = normalizeOptionalScheduleTime(input.scheduleStart, 'Schedule start');
  const scheduleEnd = normalizeOptionalScheduleTime(input.scheduleEnd, 'Schedule end');
  validateScheduleWindow({ scheduleStart, scheduleEnd });

  return {
    launchLabel: normalizeText(input.launchLabel),
    brandId: normalizeText(input.brandId),
    tokenId: normalizeText(input.tokenId),
    country: normalizedCountries[0] || '',
    countries: normalizedCountries,
    objective: normalizeText(input.objective),
    dailyBudget: normalizeText(input.dailyBudget),
    selectedAdAccountIds: dedupeStrings(input.selectedAdAccountIds),
    pageId: normalizeText(input.pageId),
    pixelId: normalizeText(input.pixelId),
    websiteEvent: normalizeText(input.websiteEvent).toUpperCase(),
    headline: normalizeText(input.headline),
    primaryText: normalizeText(input.primaryText),
    description: normalizeText(input.description),
    websiteUrl: normalizeText(input.websiteUrl),
    displayUrl: normalizeText(input.displayUrl),
    urlParameters: normalizeUrlParameters(input.urlParameters),
    scheduleStart,
    scheduleEnd,
    callToAction: normalizeText(input.callToAction),
    staticDefaults: sanitizeStaticDefaults(staticDefaults),
  };
}

function sanitizeSnapshot(input = {}) {
  return {
    brandName: normalizeText(input.brandName),
    tokenLabel: normalizeText(input.tokenLabel),
    pageName: normalizeText(input.pageName),
    pixelName: normalizeText(input.pixelName),
    adAccounts: Array.isArray(input.adAccounts)
      ? input.adAccounts
          .map((account) => ({
            id: normalizeText(account?.id),
            name: normalizeText(account?.name),
          }))
          .filter((account) => account.id)
      : [],
    media: null,
    thumbnail: null,
  };
}

function sanitizeTemplateAssetInput(asset) {
  if (!asset || typeof asset !== 'object') {
    return null;
  }

  const name = normalizeText(asset.name);
  const mimeType = normalizeText(asset.type);
  const dataUrl = typeof asset.dataUrl === 'string' ? asset.dataUrl.trim() : '';

  if (!name || !mimeType || !dataUrl) {
    return null;
  }

  return {
    name,
    type: mimeType,
    dataUrl,
  };
}

function sanitizeCountries({ countries, country }) {
  const normalizedCountries = dedupeStrings(countries);
  const fallbackCountry = normalizeText(country);
  return normalizedCountries.length ? normalizedCountries : fallbackCountry ? [fallbackCountry] : [];
}

function parseMetaErrorData(errorData) {
  if (!errorData) {
    return null;
  }

  if (typeof errorData === 'object') {
    return errorData;
  }

  try {
    return JSON.parse(errorData);
  } catch (error) {
    return null;
  }
}

function buildMetaErrorMessage(path, payload) {
  const error = payload?.error;

  if (!error) {
    return `Meta API request failed for ${path}`;
  }

  const message = normalizeText(error.message) || `Meta API request failed for ${path}`;
  const userTitle = normalizeText(error.error_user_title);
  const userMessage = normalizeText(error.error_user_msg);
  const errorData = parseMetaErrorData(error.error_data);
  const blameField = normalizeText(errorData?.blame_field);
  const details = [];

  if (userTitle && userTitle !== message) {
    details.push(userTitle);
  }

  if (userMessage && userMessage !== message) {
    details.push(userMessage);
  }

  if (blameField) {
    details.push(`Field: ${blameField}`);
  }

  return details.length ? `${message}. ${details.join('. ')}` : message;
}

function getRetryAfterSeconds(response) {
  const headerValue = response?.headers?.get?.('retry-after');

  if (!headerValue) {
    return DEFAULT_QUEUE_RETRY_AFTER_SECONDS;
  }

  const numericValue = Number.parseInt(headerValue, 10);

  if (Number.isFinite(numericValue) && numericValue > 0) {
    return Math.min(numericValue, MAX_QUEUE_RETRY_AFTER_SECONDS);
  }

  const retryDate = new Date(headerValue);
  const retrySeconds = Math.ceil((retryDate.getTime() - Date.now()) / 1000);

  return Number.isFinite(retrySeconds) && retrySeconds > 0
    ? Math.min(retrySeconds, MAX_QUEUE_RETRY_AFTER_SECONDS)
    : DEFAULT_QUEUE_RETRY_AFTER_SECONDS;
}

function isMetaPublishQueueableError({ payload, response }) {
  const error = payload?.error || {};
  const code = Number(error.code);
  const status = Number(response?.status);
  const message = [error.message, error.error_user_title, error.error_user_msg]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (META_QUEUEABLE_HTTP_STATUSES.has(status) || META_QUEUEABLE_ERROR_CODES.has(code)) {
    return true;
  }

  return [
    'api access blocked',
    'api access has been blocked',
    'api access is blocked',
    'application request limit',
    'business use case usage',
    'call count',
    'calls to this api have exceeded',
    'currently blocked',
    'please reduce',
    'rate limit',
    'request limit',
    'temporarily blocked',
    'temporarily unavailable',
    'too many calls',
    'try again later',
    'user request limit',
  ].some((pattern) => message.includes(pattern));
}

function createMetaApiHttpError({ path, payload, response }) {
  const queueable = isMetaPublishQueueableError({ payload, response });
  return new HttpError(400, buildMetaErrorMessage(path, payload), {
    metaError: payload?.error || null,
    publishQueueable: queueable,
    retryAfterSeconds: queueable ? getRetryAfterSeconds(response) : null,
  });
}

function getSpecialAdCategoriesValue(value) {
  const normalizedValue = normalizeText(value) || SPECIAL_AD_CATEGORY_NONE;
  return normalizedValue === SPECIAL_AD_CATEGORY_NONE ? [] : [normalizedValue];
}

function isSpecialAdCategoryCampaign(value) {
  return getSpecialAdCategoriesValue(value).length > 0;
}

function resolveBuyingType(value) {
  const buyingType = normalizeText(value) || DEFAULT_STATIC_DEFAULTS.buyingType;

  if (buyingType !== 'AUCTION') {
    throw new HttpError(400, 'Only auction buying type is supported by this launcher');
  }

  return buyingType;
}

function resolveCampaignStatus(value) {
  const campaignStatus = normalizeText(value).toUpperCase() || DEFAULT_STATIC_DEFAULTS.campaignStatus;

  if (!['ACTIVE', 'PAUSED'].includes(campaignStatus)) {
    throw new HttpError(400, 'Campaign publish status must be Active or Paused');
  }

  return campaignStatus;
}

function resolveBudgetLevel(value) {
  const budgetLevel = normalizeText(value) || DEFAULT_STATIC_DEFAULTS.budgetLevel;

  if (!['AD_SET', 'CAMPAIGN'].includes(budgetLevel)) {
    throw new HttpError(400, 'Budget level must be ad set or campaign. Meta does not support ad-level budgets.');
  }

  return budgetLevel;
}

function resolveDynamicCreative(value) {
  const dynamicCreative = normalizeText(value) || DEFAULT_STATIC_DEFAULTS.dynamicCreative;

  if (!['ON', 'OFF'].includes(dynamicCreative)) {
    throw new HttpError(400, 'Dynamic creative must be On or Off');
  }

  return dynamicCreative === 'ON';
}

function usesCampaignBudget(staticDefaults = {}) {
  return resolveBudgetLevel(staticDefaults.budgetLevel) === 'CAMPAIGN';
}

function resolveBillingEvent({ objective, billingEvent }) {
  const normalizedBillingEvent = normalizeText(billingEvent) || DEFAULT_STATIC_DEFAULTS.billingEvent;

  if (objective === 'OUTCOME_TRAFFIC' && normalizedBillingEvent === 'LINK_CLICKS') {
    return 'LINK_CLICKS';
  }

  return 'IMPRESSIONS';
}

function resolveBidStrategy(value) {
  const bidStrategy = normalizeText(value) || DEFAULT_STATIC_DEFAULTS.bidStrategy;

  if (!SUPPORTED_BID_STRATEGIES.has(bidStrategy)) {
    throw new HttpError(400, 'Bid strategy is not supported by this launcher');
  }

  return bidStrategy;
}

function bidStrategyRequiresAmount(value) {
  return BID_AMOUNT_STRATEGIES.has(resolveBidStrategy(value));
}

function validateAssetMimeType({ mimeType, label, allowedPrefixes }) {
  if (!allowedPrefixes.some((prefix) => String(mimeType || '').startsWith(prefix))) {
    throw new HttpError(400, `${label} must be ${allowedPrefixes.map((prefix) => prefix.replace('/', '')).join(' or ')}`);
  }
}

function ensureTemplateAssetDir() {
  fs.mkdirSync(TEMPLATE_ASSET_DIR, { recursive: true });
}

function getAssetFileExtension(name, mimeType) {
  const fileExtension = path.extname(name || '').trim();
  if (fileExtension) {
    return fileExtension.toLowerCase();
  }

  const normalizedMimeType = String(mimeType || '').toLowerCase();

  if (normalizedMimeType === 'image/jpeg') {
    return '.jpg';
  }

  if (normalizedMimeType === 'image/png') {
    return '.png';
  }

  if (normalizedMimeType === 'image/webp') {
    return '.webp';
  }

  if (normalizedMimeType === 'image/gif') {
    return '.gif';
  }

  if (normalizedMimeType === 'video/mp4') {
    return '.mp4';
  }

  if (normalizedMimeType === 'video/quicktime') {
    return '.mov';
  }

  if (normalizedMimeType === 'video/webm') {
    return '.webm';
  }

  return '';
}

function normalizeMediaLibraryMimeType(mimeType, filename = '') {
  const normalizedMimeType = normalizeText(mimeType).toLowerCase();

  if (MEDIA_LIBRARY_IMAGE_MIME_TYPES.has(normalizedMimeType) || MEDIA_LIBRARY_VIDEO_MIME_TYPES.has(normalizedMimeType)) {
    return normalizedMimeType;
  }

  const extension = path.extname(filename || '').toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }

  if (extension === '.mp4') {
    return 'video/mp4';
  }

  if (extension === '.mov') {
    return 'video/quicktime';
  }

  return normalizedMimeType;
}

function isSpacesStoredAsset(asset) {
  return asset?.storageProvider === STORAGE_PROVIDERS.SPACES;
}

function buildLocalStoredAssetPath(directory, asset) {
  if (!asset?.storageKey) {
    return null;
  }

  return path.join(directory, asset.storageKey);
}

async function readStoredAssetBuffer({ asset, directory }) {
  if (!asset?.storageKey) {
    return null;
  }

  if (isSpacesStoredAsset(asset)) {
    return readObjectStorageBuffer(asset.storageKey);
  }

  const filePath = buildLocalStoredAssetPath(directory, asset);
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath);
}

async function deleteStoredAsset({ asset, directory }) {
  if (!asset?.storageKey) {
    return;
  }

  try {
    if (isSpacesStoredAsset(asset)) {
      await deleteObjectStorageAsset(asset.storageKey);
      return;
    }

    const filePath = buildLocalStoredAssetPath(directory, asset);
    if (filePath) {
      fs.rmSync(filePath, { force: true });
    }
  } catch (error) {
    // Ignore cleanup failures so asset operations still complete.
  }
}

function buildStoredAssetResponse(asset, directory) {
  if (!asset?.storageKey || !asset?.type) {
    return null;
  }

  if (isSpacesStoredAsset(asset)) {
    return {
      storageProvider: STORAGE_PROVIDERS.SPACES,
      storageKey: asset.storageKey,
      filename: asset.name || 'asset',
      mimeType: asset.type,
    };
  }

  const filePath = buildLocalStoredAssetPath(directory, asset);
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  return {
    filePath,
    filename: asset.name || 'asset',
    mimeType: asset.type,
  };
}

async function persistBufferAsset({ namespace, directory, filename, buffer, contentType }) {
  const spacesAsset = await uploadBufferToObjectStorage({
    namespace,
    filename,
    buffer,
    contentType,
  });

  if (spacesAsset) {
    return spacesAsset;
  }

  writeBufferWithinLocalStorage({
    targetDir: directory,
    filename,
    buffer,
  });

  return {
    storageProvider: STORAGE_PROVIDERS.LOCAL,
    storageKey: filename,
    url: '',
  };
}

async function persistFileAsset({ namespace, directory, filename, filePath, contentType, contentLength }) {
  const spacesAsset = await uploadFileToObjectStorage({
    namespace,
    filename,
    filePath,
    contentType,
    contentLength,
  });

  if (spacesAsset) {
    return spacesAsset;
  }

  moveFileWithinLocalStorage({
    sourcePath: filePath,
    targetDir: directory,
    filename,
  });

  return {
    storageProvider: STORAGE_PROVIDERS.LOCAL,
    storageKey: filename,
    url: '',
  };
}

async function deleteStoredTemplateAsset(asset) {
  await deleteStoredAsset({
    asset,
    directory: TEMPLATE_ASSET_DIR,
  });
}

async function deleteTemplateStoredAssets(template) {
  await deleteStoredTemplateAsset(template?.snapshot?.media);
  await deleteStoredTemplateAsset(template?.snapshot?.thumbnail);
}

async function persistTemplateAsset({ templateId, asset, assetKind }) {
  const parsed = parseDataUrlFile(asset, assetKind === 'thumbnail' ? 'Thumbnail' : 'Creative', {
    allowedMimeTypePrefixes: assetKind === 'thumbnail' ? ['image/'] : ['image/', 'video/'],
  });
  const extension = getAssetFileExtension(parsed.name, parsed.mimeType);
  const filename = `${templateId}-${assetKind}-${Date.now()}${extension}`;
  const storedAsset = await persistBufferAsset({
    namespace: TEMPLATE_ASSET_STORAGE_NAMESPACE,
    directory: TEMPLATE_ASSET_DIR,
    filename,
    buffer: parsed.buffer,
    contentType: parsed.mimeType,
  });

  ensureTemplateAssetDir();

  return {
    name: parsed.name,
    type: parsed.mimeType,
    size: parsed.buffer.length,
    ...storedAsset,
  };
}

async function copyMediaLibraryAssetToTemplateAsset({ templateId, asset, assetKind }) {
  const buffer = await readStoredAssetBuffer({
    asset,
    directory: MEDIA_LIBRARY_ASSET_DIR,
  });

  if (!buffer || !asset?.type) {
    throw new HttpError(400, `${assetKind === 'thumbnail' ? 'Thumbnail' : 'Media'} library asset is missing its saved file`);
  }

  const extension = getAssetFileExtension(asset.name, asset.type);
  const filename = `${templateId}-${assetKind}-${Date.now()}${extension}`;
  const storedAsset = await persistBufferAsset({
    namespace: TEMPLATE_ASSET_STORAGE_NAMESPACE,
    directory: TEMPLATE_ASSET_DIR,
    filename,
    buffer,
    contentType: asset.type,
  });

  return {
    name: asset.name,
    type: asset.type,
    size: asset.size || buffer.length,
    ...storedAsset,
  };
}

async function readStoredTemplateAsset(asset) {
  const buffer = await readStoredAssetBuffer({
    asset,
    directory: TEMPLATE_ASSET_DIR,
  });

  if (!buffer || !asset?.type) {
    return null;
  }

  return {
    name: asset.name,
    type: asset.type,
    dataUrl: `data:${asset.type};base64,${buffer.toString('base64')}`,
  };
}

function ensureMediaLibraryAssetDir() {
  fs.mkdirSync(MEDIA_LIBRARY_ASSET_DIR, { recursive: true });
}

function sanitizeMediaLibraryAssetInput(asset) {
  const sanitized = sanitizeTemplateAssetInput(asset);

  if (!sanitized) {
    return null;
  }

  return {
    ...sanitized,
    width: Math.max(Math.round(Number(asset.width) || 0), 0),
    height: Math.max(Math.round(Number(asset.height) || 0), 0),
    duration: Math.max(Number(asset.duration) || 0, 0),
  };
}

function parseUploadMetadata(value, label) {
  if (!value) {
    return {};
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    throw new HttpError(400, `${label} metadata is not valid JSON`);
  }
}

function assertMediaLibraryMimeType(mimeType, mediaType) {
  const normalizedMimeType = normalizeText(mimeType).toLowerCase();
  const allowedTypes =
    mediaType === ADS_MEDIA_TYPES.VIDEO ? MEDIA_LIBRARY_VIDEO_MIME_TYPES : MEDIA_LIBRARY_IMAGE_MIME_TYPES;

  if (!allowedTypes.has(normalizedMimeType)) {
    throw new HttpError(
      400,
      mediaType === ADS_MEDIA_TYPES.VIDEO
        ? 'Video media must be MP4 or MOV for reliable Meta publishing'
        : 'Image media must be JPG/JPEG for reliable Meta publishing'
    );
  }
}

function validateMediaLibraryDimensions(asset, label) {
  const width = Number(asset?.width) || 0;
  const height = Number(asset?.height) || 0;

  if (!width || !height) {
    throw new HttpError(400, `${label} dimensions could not be read. Please choose a valid image or video file.`);
  }

  if (width < MEDIA_LIBRARY_MIN_DIMENSION || height < MEDIA_LIBRARY_MIN_DIMENSION) {
    throw new HttpError(400, `${label} must be at least ${MEDIA_LIBRARY_MIN_DIMENSION}x${MEDIA_LIBRARY_MIN_DIMENSION}px`);
  }

  const aspectRatio = width / height;
  if (aspectRatio < MEDIA_LIBRARY_MIN_ASPECT_RATIO || aspectRatio > MEDIA_LIBRARY_MAX_ASPECT_RATIO) {
    throw new HttpError(400, `${label} aspect ratio should stay between 9:16 and 1.91:1 for Meta placements`);
  }
}

function parseUploadedMediaLibraryAsset(file, metadataInput, label, mediaType) {
  if (!file?.path) {
    return null;
  }

  const metadata = parseUploadMetadata(metadataInput, label);
  const normalizedMimeType = normalizeMediaLibraryMimeType(file.mimetype, file.originalname);
  assertMediaLibraryMimeType(normalizedMimeType, mediaType);

  return {
    name: normalizeText(file.originalname) || label,
    mimeType: normalizedMimeType,
    size: Math.max(Number(file.size) || 0, 0),
    filePath: file.path,
    width: Math.max(Math.round(Number(metadata.width) || 0), 0),
    height: Math.max(Math.round(Number(metadata.height) || 0), 0),
    duration: Math.max(Number(metadata.duration) || 0, 0),
  };
}

function parseMediaLibraryAsset(asset, label, mediaType) {
  const parsed = parseDataUrlFile(asset, label, {
    allowedMimeTypePrefixes: mediaType === ADS_MEDIA_TYPES.VIDEO ? ['video/'] : ['image/'],
  });
  const normalizedMimeType = normalizeMediaLibraryMimeType(parsed.mimeType, parsed.name);

  assertMediaLibraryMimeType(normalizedMimeType, mediaType);

  return {
    ...parsed,
    mimeType: normalizedMimeType,
    width: Math.max(Math.round(Number(asset.width) || 0), 0),
    height: Math.max(Math.round(Number(asset.height) || 0), 0),
    duration: Math.max(Number(asset.duration) || 0, 0),
  };
}

function validateMediaLibraryParsedAsset(parsed, mediaType, assetKind = 'media') {
  const isVideo = mediaType === ADS_MEDIA_TYPES.VIDEO;
  const maxBytes = isVideo ? MEDIA_LIBRARY_MAX_VIDEO_BYTES : MEDIA_LIBRARY_MAX_IMAGE_BYTES;

  if (assetKind === 'thumbnail') {
    if (parsed.size > MEDIA_LIBRARY_MAX_THUMBNAIL_BYTES || parsed.buffer?.length > MEDIA_LIBRARY_MAX_THUMBNAIL_BYTES) {
      throw new HttpError(400, 'Video thumbnail is too large. Maximum is 10MB.');
    }

    validateMediaLibraryDimensions(parsed, 'Video thumbnail');
    return;
  }

  const byteSize = parsed.size || parsed.buffer?.length || 0;
  if (byteSize > maxBytes) {
    throw new HttpError(
      400,
      `${isVideo ? 'Video' : 'Image'} is too large. Maximum is ${Math.round(maxBytes / 1024 / 1024)}MB.`
    );
  }

  validateMediaLibraryDimensions(parsed, isVideo ? 'Video media' : 'Image media');

  if (isVideo && parsed.duration <= 0) {
    throw new HttpError(400, 'Video duration could not be read. Please choose a valid video file.');
  }
}

async function persistMediaLibraryAsset({ mediaId, asset, assetKind, mediaType }) {
  const effectiveMediaType = assetKind === 'thumbnail' ? ADS_MEDIA_TYPES.IMAGE : mediaType;
  const parsed = parseMediaLibraryAsset(asset, assetKind === 'thumbnail' ? 'Video thumbnail' : 'Media', effectiveMediaType);

  if (assetKind === 'thumbnail') {
    validateMediaLibraryParsedAsset(parsed, mediaType, 'thumbnail');
  } else {
    validateMediaLibraryParsedAsset(parsed, mediaType);
  }

  const extension = getAssetFileExtension(parsed.name, parsed.mimeType);
  const filename = `${mediaId}-${assetKind}-${Date.now()}${extension}`;
  const storedAsset = await persistBufferAsset({
    namespace: MEDIA_LIBRARY_ASSET_STORAGE_NAMESPACE,
    directory: MEDIA_LIBRARY_ASSET_DIR,
    filename,
    buffer: parsed.buffer,
    contentType: parsed.mimeType,
  });

  ensureMediaLibraryAssetDir();

  return {
    name: parsed.name,
    type: parsed.mimeType,
    size: parsed.buffer.length,
    ...storedAsset,
    width: parsed.width,
    height: parsed.height,
    duration: parsed.duration,
  };
}

async function persistUploadedMediaLibraryAsset({ mediaId, file, metadata, assetKind, mediaType }) {
  const effectiveMediaType = assetKind === 'thumbnail' ? ADS_MEDIA_TYPES.IMAGE : mediaType;
  const parsed = parseUploadedMediaLibraryAsset(
    file,
    metadata,
    assetKind === 'thumbnail' ? 'Video thumbnail' : 'Media',
    effectiveMediaType
  );

  if (!parsed) {
    return null;
  }

  validateMediaLibraryParsedAsset(parsed, mediaType, assetKind);

  if (!fs.existsSync(parsed.filePath)) {
    throw new HttpError(400, `${assetKind === 'thumbnail' ? 'Video thumbnail' : 'Media'} upload was not received correctly`);
  }

  const extension = getAssetFileExtension(parsed.name, parsed.mimeType);
  const filename = `${mediaId}-${assetKind}-${Date.now()}${extension}`;
  const storedAsset = await persistFileAsset({
    namespace: MEDIA_LIBRARY_ASSET_STORAGE_NAMESPACE,
    directory: MEDIA_LIBRARY_ASSET_DIR,
    filename,
    filePath: parsed.filePath,
    contentType: parsed.mimeType,
    contentLength: parsed.size,
  });

  ensureMediaLibraryAssetDir();

  return {
    name: parsed.name,
    type: parsed.mimeType,
    size: parsed.size,
    ...storedAsset,
    width: parsed.width,
    height: parsed.height,
    duration: parsed.duration,
  };
}

function cleanupUploadedMediaFile(file) {
  if (!file?.path) {
    return;
  }

  try {
    fs.rmSync(file.path, { force: true });
  } catch (error) {
    // Ignore temp cleanup failures; the saved media record has already succeeded or failed.
  }
}

function ensureMediaChunkUploadDir() {
  fs.mkdirSync(MEDIA_CHUNK_UPLOAD_DIR, { recursive: true });
}

function sanitizeMediaUploadId(value) {
  const uploadId = normalizeText(value);

  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(uploadId)) {
    throw new HttpError(400, 'Upload session is invalid. Please select the video again.');
  }

  return uploadId;
}

function getMediaChunkSessionDir(uploadId) {
  return path.join(MEDIA_CHUNK_UPLOAD_DIR, uploadId);
}

function readMediaChunkManifest(uploadId) {
  const manifestPath = path.join(getMediaChunkSessionDir(uploadId), 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new HttpError(400, 'Upload session is damaged. Please upload the video again.');
  }
}

function writeMediaChunkManifest(uploadId, manifest) {
  const sessionDir = getMediaChunkSessionDir(uploadId);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

function cleanupMediaChunkSession(uploadId) {
  if (!uploadId) {
    return;
  }

  try {
    fs.rmSync(getMediaChunkSessionDir(uploadId), { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup failures for temporary chunk uploads.
  }
}

async function saveMediaUploadChunk({ uploadId, chunkIndex, totalChunks, chunk, actor }) {
  let normalizedUploadId = '';

  try {
    normalizedUploadId = sanitizeMediaUploadId(uploadId);
  } catch (error) {
    cleanupUploadedMediaFile(chunk);
    throw error;
  }

  const normalizedChunkIndex = Number.parseInt(chunkIndex, 10);
  const normalizedTotalChunks = Number.parseInt(totalChunks, 10);

  if (!chunk?.path) {
    throw new HttpError(400, 'Upload chunk is missing. Please try again.');
  }

  if (
    !Number.isInteger(normalizedChunkIndex) ||
    !Number.isInteger(normalizedTotalChunks) ||
    normalizedChunkIndex < 0 ||
    normalizedTotalChunks < 1 ||
    normalizedChunkIndex >= normalizedTotalChunks
  ) {
    cleanupUploadedMediaFile(chunk);
    throw new HttpError(400, 'Upload chunk number is invalid. Please upload the video again.');
  }

  ensureMediaChunkUploadDir();
  const existingManifest = readMediaChunkManifest(normalizedUploadId);
  const actorId = actor?._id?.toString?.() || '';

  if (existingManifest?.actorId && existingManifest.actorId !== actorId) {
    cleanupUploadedMediaFile(chunk);
    throw new HttpError(403, 'Upload session belongs to another user');
  }

  const manifest = {
    actorId,
    totalChunks: normalizedTotalChunks,
    updatedAt: new Date().toISOString(),
  };
  writeMediaChunkManifest(normalizedUploadId, manifest);

  const sessionDir = getMediaChunkSessionDir(normalizedUploadId);
  const chunkPath = path.join(sessionDir, `${normalizedChunkIndex}.part`);

  try {
    fs.renameSync(chunk.path, chunkPath);
  } catch (error) {
    cleanupUploadedMediaFile(chunk);
    throw error;
  }

  const uploadedChunks = fs
    .readdirSync(sessionDir)
    .filter((filename) => filename.endsWith('.part')).length;

  return {
    message: 'Chunk uploaded',
    uploadId: normalizedUploadId,
    uploadedChunks,
    totalChunks: normalizedTotalChunks,
  };
}

function assembleMediaUploadChunks({ uploadId, actor, originalName, mimeType, size, label = 'Media' }) {
  const normalizedUploadId = sanitizeMediaUploadId(uploadId);
  const manifest = readMediaChunkManifest(normalizedUploadId);
  const actorId = actor?._id?.toString?.() || '';

  if (!manifest) {
    throw new HttpError(400, 'Upload session was not found. Please upload the video again.');
  }

  if (manifest.actorId && manifest.actorId !== actorId) {
    throw new HttpError(403, 'Upload session belongs to another user');
  }

  const totalChunks = Number.parseInt(manifest.totalChunks, 10);
  if (!Number.isInteger(totalChunks) || totalChunks < 1) {
    throw new HttpError(400, 'Upload session is incomplete. Please upload the video again.');
  }

  const extension = getAssetFileExtension(originalName, mimeType) || '.upload';
  const assembledPath = path.join(MEDIA_LIBRARY_ASSET_DIR, `${normalizedUploadId}-assembled-${Date.now()}${extension}`);

  ensureMediaLibraryAssetDir();

  try {
    if (fs.existsSync(assembledPath)) {
      fs.rmSync(assembledPath, { force: true });
    }

    for (let index = 0; index < totalChunks; index += 1) {
      const chunkPath = path.join(getMediaChunkSessionDir(normalizedUploadId), `${index}.part`);

      if (!fs.existsSync(chunkPath)) {
        throw new HttpError(400, `Upload is missing chunk ${index + 1}/${totalChunks}. Please upload the video again.`);
      }

      fs.appendFileSync(assembledPath, fs.readFileSync(chunkPath));
    }

    const stat = fs.statSync(assembledPath);
    const expectedSize = Number(size) || 0;

    if (expectedSize && stat.size !== expectedSize) {
      throw new HttpError(400, `Uploaded ${label.toLowerCase()} size does not match. Please upload it again.`);
    }

    return {
      path: assembledPath,
      originalname: normalizeText(originalName) || `uploaded-${label.toLowerCase()}`,
      mimetype: normalizeMediaLibraryMimeType(mimeType, originalName),
      size: stat.size,
    };
  } catch (error) {
    cleanupUploadedMediaFile({ path: assembledPath });
    throw error;
  }
}

async function deleteStoredMediaLibraryAsset(asset) {
  await deleteStoredAsset({
    asset,
    directory: MEDIA_LIBRARY_ASSET_DIR,
  });
}

async function readStoredMediaLibraryAsset(asset) {
  const buffer = await readStoredAssetBuffer({
    asset,
    directory: MEDIA_LIBRARY_ASSET_DIR,
  });

  if (!buffer || !asset?.type) {
    return null;
  }

  return {
    name: asset.name,
    type: asset.type,
    dataUrl: `data:${asset.type};base64,${buffer.toString('base64')}`,
  };
}

async function applyTemplateAssets({ template, snapshotInput, existingSnapshot = null, actor = null }) {
  const nextMediaInput = sanitizeTemplateAssetInput(snapshotInput?.media);
  const nextThumbnailInput = sanitizeTemplateAssetInput(snapshotInput?.thumbnail);
  const nextMediaAssetId = normalizeText(snapshotInput?.mediaAssetId);
  const nextThumbnailAssetId = normalizeText(snapshotInput?.thumbnailAssetId);
  const shouldClearAssets = snapshotInput?.clearMedia === true;
  let mediaAsset = existingSnapshot?.media || template.snapshot?.media || null;
  let thumbnailAsset = existingSnapshot?.thumbnail || template.snapshot?.thumbnail || null;

  if (shouldClearAssets) {
    await deleteStoredTemplateAsset(mediaAsset);
    await deleteStoredTemplateAsset(thumbnailAsset);
    mediaAsset = null;
    thumbnailAsset = null;
  } else if (nextMediaAssetId) {
    const libraryMediaAsset = await getMediaAssetDocForActor(nextMediaAssetId, actor);
    const previousMedia = mediaAsset;
    const previousThumbnail = thumbnailAsset;
    mediaAsset = await copyMediaLibraryAssetToTemplateAsset({
      templateId: template._id.toString(),
      asset: libraryMediaAsset.media,
      assetKind: 'media',
    });

    thumbnailAsset = libraryMediaAsset.thumbnail
      ? await copyMediaLibraryAssetToTemplateAsset({
          templateId: template._id.toString(),
          asset: libraryMediaAsset.thumbnail,
          assetKind: 'thumbnail',
        })
      : null;

    await deleteStoredTemplateAsset(previousMedia);
    await deleteStoredTemplateAsset(previousThumbnail);
  } else if (nextMediaInput) {
    const previousMedia = mediaAsset;
    mediaAsset = await persistTemplateAsset({
      templateId: template._id.toString(),
      asset: nextMediaInput,
      assetKind: 'media',
    });
    await deleteStoredTemplateAsset(previousMedia);

    if (!mediaAsset.type.startsWith('video/')) {
      await deleteStoredTemplateAsset(thumbnailAsset);
      thumbnailAsset = null;
    } else if (!nextThumbnailInput) {
      await deleteStoredTemplateAsset(thumbnailAsset);
      thumbnailAsset = null;
    }
  }

  if (nextThumbnailAssetId) {
    const libraryThumbnailAsset = await getMediaAssetDocForActor(nextThumbnailAssetId, actor);
    if (libraryThumbnailAsset.mediaType !== ADS_MEDIA_TYPES.IMAGE) {
      throw new HttpError(400, 'Template thumbnail must be an image media library asset');
    }
    const previousThumbnail = thumbnailAsset;
    thumbnailAsset = await copyMediaLibraryAssetToTemplateAsset({
      templateId: template._id.toString(),
      asset: libraryThumbnailAsset.media,
      assetKind: 'thumbnail',
    });
    await deleteStoredTemplateAsset(previousThumbnail);
  } else if (nextThumbnailInput) {
    const previousThumbnail = thumbnailAsset;
    thumbnailAsset = await persistTemplateAsset({
      templateId: template._id.toString(),
      asset: nextThumbnailInput,
      assetKind: 'thumbnail',
    });
    await deleteStoredTemplateAsset(previousThumbnail);
  }

  template.snapshot = {
    ...template.snapshot,
    media: mediaAsset,
    thumbnail: thumbnailAsset,
  };
}

function templateAccessFilter(actor) {
  return isSuperAdmin(actor) ? {} : { createdBy: actor._id };
}

function mediaLibraryAccessFilter(actor) {
  return isSuperAdmin(actor) ? {} : { createdBy: actor._id };
}

function publishSessionAccessFilter(actor) {
  return !actor || isSuperAdmin(actor) ? {} : { createdBy: actor._id };
}

function managedCampaignAccessFilter(actor) {
  return !actor || isSuperAdmin(actor) ? {} : { createdBy: actor._id };
}

function createPublishSessionId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePublishSessionId(sessionId) {
  return normalizeText(sessionId).slice(0, 120);
}

function getAccountLaunchItemId(accountLaunch = {}, index = 0) {
  return (
    normalizeText(accountLaunch.launchItemId) ||
    normalizeText(accountLaunch.assignmentId) ||
    `${normalizeText(accountLaunch.adAccountId) || 'account'}-${index + 1}`
  );
}

function getPublishRequestCount(payload = {}) {
  return Array.isArray(payload.accountLaunches) && payload.accountLaunches.length
    ? payload.accountLaunches.length
    : Array.isArray(payload.selectedAdAccountIds)
      ? payload.selectedAdAccountIds.length
      : 0;
}

function getPublishTitleFromPayload(payload = {}) {
  const launchLabel = normalizeText(payload.launchLabel);
  return launchLabel ? `Ads Launch: ${launchLabel}` : 'Ads publish';
}

function buildRemainingPublishPayload({ payload, remainingAdAccountIds = [], remainingAccountLaunches = null }) {
  const hasRemainingAccountLaunches = Array.isArray(remainingAccountLaunches);
  const normalizedRemainingAccountLaunches = hasRemainingAccountLaunches ? remainingAccountLaunches : null;
  const effectiveRemainingAdAccountIds = hasRemainingAccountLaunches
    ? dedupeStrings(normalizedRemainingAccountLaunches.map((accountLaunch) => accountLaunch.adAccountId))
    : remainingAdAccountIds;
  const remainingSet = new Set(effectiveRemainingAdAccountIds);
  const remainingLaunchItemIds = new Set(
    (normalizedRemainingAccountLaunches || []).map((accountLaunch, index) => getAccountLaunchItemId(accountLaunch, index))
  );

  return {
    ...payload,
    selectedAdAccountIds: effectiveRemainingAdAccountIds,
    selectedAdAccounts: (payload.selectedAdAccounts || []).filter((account) => remainingSet.has(account.id)),
    accountLaunches: normalizedRemainingAccountLaunches || (payload.accountLaunches || []).filter((accountLaunch) => remainingSet.has(accountLaunch.adAccountId)),
    resumeState: Object.fromEntries(
      Object.entries(payload.resumeState || {}).filter(
        ([key, state]) =>
          remainingSet.has(key) ||
          remainingSet.has(state?.adAccountId) ||
          remainingLaunchItemIds.has(key) ||
          remainingLaunchItemIds.has(state?.launchItemId)
      )
    ),
  };
}

function normalizePublishResourceTokenType(value) {
  return normalizeText(value).toUpperCase() || 'PROFILE';
}

function normalizePublishAdAccountKey(value) {
  return normalizeText(value).replace(/^act_/i, '');
}

function getPublishSessionResources({ payload = {}, tokenType = null } = {}) {
  const tokenId = normalizeText(payload.tokenId);
  const resolvedTokenType = normalizePublishResourceTokenType(tokenType || payload.tokenType);
  const selectedIds = dedupeStrings(payload.selectedAdAccountIds);
  const accountLaunchIds = dedupeStrings((payload.accountLaunches || []).map((accountLaunch) => accountLaunch?.adAccountId));
  const adAccountIds = dedupeStrings([...selectedIds, ...accountLaunchIds]);

  return {
    tokenKey: tokenId ? `${resolvedTokenType}:${tokenId}` : '',
    tokenId,
    tokenType: resolvedTokenType,
    adAccountIds,
    adAccountKeys: new Set(adAccountIds.map((id) => normalizePublishAdAccountKey(id)).filter(Boolean)),
  };
}

function getPublishResourceConflict(resources, sessionId = '') {
  const normalizedSessionId = normalizePublishSessionId(sessionId);

  for (const [activeSessionId, activeResources] of activePublishSessionResources.entries()) {
    if (activeSessionId === normalizedSessionId) {
      continue;
    }

    if (resources.tokenKey && activeResources.tokenKey === resources.tokenKey) {
      return {
        type: 'token',
        sessionId: activeSessionId,
        message: 'Waiting for the same token/key lane to finish',
      };
    }

    const sharedAdAccountId = resources.adAccountIds.find((adAccountId) =>
      activeResources.adAccountKeys?.has(normalizePublishAdAccountKey(adAccountId))
    );

    if (sharedAdAccountId) {
      return {
        type: 'ad_account',
        sessionId: activeSessionId,
        adAccountId: sharedAdAccountId,
        message: `Waiting for ad account ${sharedAdAccountId} to finish in another publish`,
      };
    }
  }

  return null;
}

function reservePublishSessionResources({ sessionId, payload = {}, tokenType = null } = {}) {
  const normalizedSessionId = normalizePublishSessionId(sessionId);
  const resources = getPublishSessionResources({ payload, tokenType });
  const conflict = getPublishResourceConflict(resources, normalizedSessionId);

  if (conflict) {
    return {
      acquired: false,
      conflict,
      resources,
    };
  }

  const alreadyHeld = activePublishSessionResources.has(normalizedSessionId);
  activePublishSessionResources.set(normalizedSessionId, resources);

  return {
    acquired: true,
    alreadyHeld,
    resources,
  };
}

function releasePublishSessionResources(sessionId) {
  const normalizedSessionId = normalizePublishSessionId(sessionId);

  if (normalizedSessionId) {
    activePublishSessionResources.delete(normalizedSessionId);
  }
}

async function getPublishSessionDocForActor(sessionId, actor) {
  const normalizedSessionId = normalizePublishSessionId(sessionId);

  if (!normalizedSessionId) {
    throw new HttpError(400, 'Publish session id is required');
  }

  const session = await AdsLaunchPublishSession.findOne({
    sessionId: normalizedSessionId,
    ...publishSessionAccessFilter(actor),
  });

  if (!session) {
    throw new HttpError(404, 'Publish session not found');
  }

  return session;
}

async function startPublishSession({ sessionId = '', title = '', source = '', payload, actor }) {
  const normalizedSessionId = normalizePublishSessionId(sessionId) || createPublishSessionId();
  const sessionTitle = normalizeText(title) || getPublishTitleFromPayload(payload);
  const sessionSource = normalizeText(source) || 'Meta publish';
  const sessionPayload = {
    ...(payload || {}),
    publishSessionId: normalizedSessionId,
    bulkId: normalizeText(payload?.bulkId) || normalizedSessionId,
    bulkLabel: normalizeText(payload?.bulkLabel) || sessionTitle,
    bulkSource: normalizeText(payload?.bulkSource) || sessionSource,
  };
  forceStoppedPublishSessionIds.delete(normalizedSessionId);
  const session = await AdsLaunchPublishSession.findOneAndUpdate(
    {
      sessionId: normalizedSessionId,
      ...publishSessionAccessFilter(actor),
    },
    {
      $set: {
        title: sessionTitle,
        source: sessionSource,
        status: PUBLISH_SESSION_STATUSES.ACTIVE,
        payload: sessionPayload,
        resumePayload: null,
        latestResult: null,
        latestError: '',
        pauseRequested: false,
        pauseRequestedAt: null,
        forceStopRequested: false,
        forceStopRequestedAt: null,
        pausedAt: null,
        stoppedAt: null,
        completedAt: null,
        updatedBy: actor?._id || null,
      },
      $setOnInsert: {
        sessionId: normalizedSessionId,
        createdBy: actor?._id || null,
        events: [],
      },
    },
    {
      returnDocument: 'after',
      setDefaultsOnInsert: true,
      upsert: true,
    }
  );

  return session.toSafeObject();
}

async function countQueuedPublishSessionsBefore(session) {
  const queuedAt = session?.queue?.queuedAt || session?.createdAt || new Date();
  const createdAt = session?.createdAt || queuedAt;

  return AdsLaunchPublishSession.countDocuments({
    'queue.status': PUBLISH_SESSION_QUEUE_STATUSES.PENDING,
    $or: [
      { 'queue.queuedAt': { $lt: queuedAt } },
      {
        'queue.queuedAt': queuedAt,
        createdAt: { $lt: createdAt },
      },
    ],
  });
}

async function enqueuePublishLaunch({ payload, actor }) {
  const normalizedSessionId = normalizePublishSessionId(payload?.publishSessionId) || createPublishSessionId();
  forceStoppedPublishSessionIds.delete(normalizedSessionId);
  const now = new Date();
  const sessionTitle = normalizeText(payload?.publishTitle) || getPublishTitleFromPayload(payload);
  const sessionSource = normalizeText(payload?.publishSource) || 'Meta publish';
  const queuedEvent = {
    sessionId: normalizedSessionId,
    type: 'progress',
    status: 'queued',
    step: 'queued',
    timestamp: now.toISOString(),
    message: 'Publish added to the background queue. It can start in parallel when its token and ad accounts are free.',
    progress: {
      completed: 0,
      total: getPublishRequestCount(payload),
      percent: 0,
      etaSeconds: null,
      elapsedSeconds: 0,
    },
  };
  const queuedPayload = {
    ...(payload || {}),
    publishSessionId: normalizedSessionId,
    bulkId: normalizeText(payload?.bulkId) || normalizedSessionId,
    bulkLabel: normalizeText(payload?.bulkLabel) || sessionTitle,
    bulkSource: normalizeText(payload?.bulkSource) || sessionSource,
  };
  const session = await AdsLaunchPublishSession.findOneAndUpdate(
    {
      sessionId: normalizedSessionId,
      ...publishSessionAccessFilter(actor),
    },
    {
      $set: {
        title: sessionTitle,
        source: sessionSource,
        status: PUBLISH_SESSION_STATUSES.PENDING,
        payload: queuedPayload,
        resumePayload: null,
        progress: queuedEvent,
        latestResult: null,
        latestError: '',
        pauseRequested: false,
        pauseRequestedAt: null,
        forceStopRequested: false,
        forceStopRequestedAt: null,
        pausedAt: null,
        stoppedAt: null,
        completedAt: null,
        queue: {
          status: PUBLISH_SESSION_QUEUE_STATUSES.PENDING,
          queuedAt: now,
          startedAt: null,
          completedAt: null,
          attemptCount: 0,
          lastError: '',
        },
        updatedBy: actor?._id || null,
      },
      $setOnInsert: {
        sessionId: normalizedSessionId,
        createdBy: actor?._id || null,
      },
      $push: {
        events: {
          $each: [queuedEvent],
          $slice: -PUBLISH_SESSION_EVENT_LIMIT,
        },
      },
    },
    {
      returnDocument: 'after',
      setDefaultsOnInsert: true,
      upsert: true,
    }
  );
  const queuedBefore = await countQueuedPublishSessionsBefore(session);

  schedulePublishSessionQueueRun(0);

  return {
    message:
      queuedBefore > 0
        ? `Publish added to queue at position ${queuedBefore + 1}`
        : 'Publish queued and will start shortly',
    queued: true,
    queuePosition: queuedBefore + 1,
    session: session.toSafeObject(),
  };
}

async function appendPublishSessionEvent({ sessionId, event }) {
  const normalizedSessionId = normalizePublishSessionId(sessionId);

  if (!normalizedSessionId) {
    return;
  }

  const nextEvent = {
    sessionId: normalizedSessionId,
    timestamp: new Date().toISOString(),
    ...event,
  };
  const update = {
    $set: {
      progress: nextEvent,
    },
  };

  if (!nextEvent.transient) {
    update.$push = {
      events: {
        $each: [nextEvent],
        $slice: -PUBLISH_SESSION_EVENT_LIMIT,
      },
    };
  }

  await AdsLaunchPublishSession.updateOne(
    {
      sessionId: normalizedSessionId,
      status: { $ne: PUBLISH_SESSION_STATUSES.FORCE_STOPPED },
    },
    update
  );
}

function buildTerminalPublishProgress({ status, result }) {
  const baseProgress =
    result?.progress && typeof result.progress === 'object' && !Array.isArray(result.progress)
      ? { ...result.progress }
      : {};
  const summary = result?.summary || {};
  const publishedCount = Number(summary.published) || 0;
  const failedCount = Number(summary.failed) || 0;
  const queuedCount = Number(summary.queued) || 0;
  const pausedCount = Number(summary.paused) || 0;
  const requestedCount = Number(summary.requested) || 0;
  const summaryTotal = Math.max(requestedCount, publishedCount + failedCount + queuedCount + pausedCount);
  const currentCompleted = Number(baseProgress.completed) || 0;
  const currentTotal = Number(baseProgress.total) || 0;
  const total = Math.max(currentTotal, currentCompleted, summaryTotal);

  if (status === PUBLISH_SESSION_STATUSES.PAUSED || status === PUBLISH_SESSION_STATUSES.FORCE_STOPPED || result?.paused) {
    return {
      completed: currentCompleted || publishedCount + failedCount + queuedCount,
      total: total || summaryTotal,
      ...baseProgress,
      etaSeconds: null,
    };
  }

  return {
    ...baseProgress,
    completed: total,
    total,
    percent: 100,
    etaSeconds: 0,
  };
}

function normalizeTerminalPublishSessionSafeObject(session) {
  const terminalStatuses = new Set([
    PUBLISH_SESSION_STATUSES.COMPLETED,
    PUBLISH_SESSION_STATUSES.FAILED,
    PUBLISH_SESSION_STATUSES.FORCE_STOPPED,
    PUBLISH_SESSION_STATUSES.QUEUED,
  ]);

  if (!terminalStatuses.has(session.rawStatus)) {
    return session;
  }

  const finalProgress = buildTerminalPublishProgress({
    status: session.rawStatus,
    result: {
      ...(session.latestResult || {}),
      progress: session.progress?.progress || session.latestResult?.progress,
      summary: session.latestResult?.summary,
    },
  });
  const progress = session.progress
    ? {
        ...session.progress,
        progress: finalProgress,
      }
    : null;

  return {
    ...session,
    progress,
    latestResult: session.latestResult
      ? {
          ...session.latestResult,
          progress: finalProgress,
        }
      : session.latestResult,
  };
}

async function markPublishSessionFinished({ sessionId, status, result = null, error = '', resumePayload = null }) {
  const normalizedSessionId = normalizePublishSessionId(sessionId);

  if (!normalizedSessionId) {
    return;
  }

  const now = new Date();
  const finalProgress = buildTerminalPublishProgress({ status, result });
  const finalResult = result
    ? {
        ...result,
        progress: finalProgress,
      }
    : null;
  const progress = {
    type: 'progress',
    status: status === PUBLISH_SESSION_STATUSES.PAUSED ? 'paused' : status === PUBLISH_SESSION_STATUSES.FORCE_STOPPED ? 'stopped' : status.toLowerCase(),
    step: status === PUBLISH_SESSION_STATUSES.PAUSED ? 'paused' : status === PUBLISH_SESSION_STATUSES.FORCE_STOPPED ? 'force-stopped' : 'complete',
    timestamp: now.toISOString(),
    message:
      status === PUBLISH_SESSION_STATUSES.PAUSED
        ? `Publish paused. ${getPublishRequestCount(resumePayload)} publish item${getPublishRequestCount(resumePayload) === 1 ? '' : 's'} left to continue.`
        : status === PUBLISH_SESSION_STATUSES.FORCE_STOPPED
          ? error || 'Publish force-stopped by user'
        : result?.message || error || 'Publish finished',
    progress: finalProgress,
  };

  await AdsLaunchPublishSession.updateOne(
    {
      sessionId: normalizedSessionId,
      status: { $ne: PUBLISH_SESSION_STATUSES.FORCE_STOPPED },
    },
    {
      $set: {
        status,
        resumePayload,
        latestResult: finalResult,
        latestError: error,
        progress,
        pauseRequested: false,
        pauseRequestedAt: null,
        forceStopRequested: status === PUBLISH_SESSION_STATUSES.FORCE_STOPPED,
        forceStopRequestedAt: status === PUBLISH_SESSION_STATUSES.FORCE_STOPPED ? now : null,
        pausedAt: status === PUBLISH_SESSION_STATUSES.PAUSED ? now : null,
        stoppedAt: status === PUBLISH_SESSION_STATUSES.FORCE_STOPPED ? now : null,
        completedAt: now,
      },
      $push: {
        events: {
          $each: [progress],
          $slice: -PUBLISH_SESSION_EVENT_LIMIT,
        },
      },
    }
  );
}

async function failPublishSession({ sessionId, error }) {
  await markPublishSessionFinished({
    sessionId,
    status: PUBLISH_SESSION_STATUSES.FAILED,
    error: error?.message || error || 'Publish failed',
  });
}

async function requestPublishSessionPause({ sessionId, actor }) {
  const session = await getPublishSessionDocForActor(sessionId, actor);

  if (session.status === PUBLISH_SESSION_STATUSES.PAUSED) {
    return session.toSafeObject();
  }

  if (session.status !== PUBLISH_SESSION_STATUSES.ACTIVE && session.status !== PUBLISH_SESSION_STATUSES.PAUSE_REQUESTED) {
    throw new HttpError(400, 'Only a running publish can be paused');
  }

  const now = new Date();
  const event = {
    type: 'progress',
    sessionId: session.sessionId,
    step: 'pause-requested',
    status: 'pausing',
    timestamp: now.toISOString(),
    message: 'Pause requested. The current ad account will finish first, then publishing will stop safely.',
    progress: session.progress?.progress || null,
  };

  session.status = PUBLISH_SESSION_STATUSES.PAUSE_REQUESTED;
  session.pauseRequested = true;
  session.pauseRequestedAt = now;
  session.progress = event;
  session.events.push(event);
  session.events = session.events.slice(-PUBLISH_SESSION_EVENT_LIMIT);
  session.updatedBy = actor?._id || null;
  await session.save();

  return session.toSafeObject();
}

async function forceStopPublishSession({ sessionId, actor, req }) {
  const session = await getPublishSessionDocForActor(sessionId, actor);
  forceStoppedPublishSessionIds.add(session.sessionId);

  if (session.status === PUBLISH_SESSION_STATUSES.FORCE_STOPPED) {
    return session.toSafeObject();
  }

  const stoppableStatuses = new Set([
    PUBLISH_SESSION_STATUSES.ACTIVE,
    PUBLISH_SESSION_STATUSES.PAUSE_REQUESTED,
    PUBLISH_SESSION_STATUSES.PAUSED,
    PUBLISH_SESSION_STATUSES.PENDING,
  ]);

  if (!stoppableStatuses.has(session.status)) {
    throw new HttpError(400, 'Only a running, waiting, or paused publish can be force-stopped');
  }

  const now = new Date();
  const event = {
    type: 'progress',
    sessionId: session.sessionId,
    step: 'force-stopped',
    status: 'stopped',
    timestamp: now.toISOString(),
    message: 'Publish force-stopped by user. Any in-flight Meta request may still finish at Meta, but this local publish will not continue.',
    progress: {
      ...(session.progress?.progress || {}),
      etaSeconds: 0,
    },
  };

  session.status = PUBLISH_SESSION_STATUSES.FORCE_STOPPED;
  session.latestError = 'Publish force-stopped by user';
  session.latestResult = null;
  session.resumePayload = null;
  session.pauseRequested = false;
  session.pauseRequestedAt = null;
  session.forceStopRequested = true;
  session.forceStopRequestedAt = now;
  session.pausedAt = null;
  session.stoppedAt = now;
  session.completedAt = now;
  session.progress = event;
  session.queue = {
    ...(session.queue?.toObject?.() || session.queue || {}),
    status: [PUBLISH_SESSION_QUEUE_STATUSES.PENDING, PUBLISH_SESSION_QUEUE_STATUSES.RUNNING].includes(session.queue?.status)
      ? PUBLISH_SESSION_QUEUE_STATUSES.FAILED
      : session.queue?.status || PUBLISH_SESSION_QUEUE_STATUSES.NONE,
    completedAt: now,
    lastError: 'Publish force-stopped by user',
  };
  session.updatedBy = actor?._id || null;
  session.events.push(event);
  session.events = session.events.slice(-PUBLISH_SESSION_EVENT_LIMIT);
  await session.save();

  releasePublishSessionResources(session.sessionId);
  schedulePublishSessionQueueRun(0);

  await writeActivityLog({
    user: actor,
    action: 'ADS_PUBLISH_FORCE_STOPPED',
    entity: 'AdsLaunchPublishSession',
    entityId: session._id.toString(),
    metadata: {
      sessionId: session.sessionId,
      title: session.title,
    },
    req,
  });

  return session.toSafeObject();
}

async function deletePublishSession({ sessionId, actor, req }) {
  if (!isSuperAdmin(actor)) {
    throw new HttpError(403, 'Only the super administrator can delete publish sessions');
  }

  const normalizedSessionId = normalizePublishSessionId(sessionId);

  if (!normalizedSessionId) {
    throw new HttpError(400, 'Publish session id is required');
  }

  const session = await AdsLaunchPublishSession.findOne({ sessionId: normalizedSessionId });
  forceStoppedPublishSessionIds.add(normalizedSessionId);
  const result = await AdsLaunchPublishSession.deleteOne({ sessionId: normalizedSessionId });
  const deletedCount = result.deletedCount || 0;

  releasePublishSessionResources(normalizedSessionId);
  schedulePublishSessionQueueRun(0);

  await writeActivityLog({
    user: actor,
    action: 'ADS_PUBLISH_SESSION_DELETED',
    entity: 'AdsLaunchPublishSession',
    entityId: session?._id?.toString?.() || normalizedSessionId,
    metadata: {
      sessionId: normalizedSessionId,
      title: session?.title || '',
      deletedCount,
    },
    req,
  });

  return {
    deletedCount,
    message: deletedCount ? 'Publish session deleted' : 'Publish session was already missing',
  };
}

async function isPublishSessionPauseRequested(sessionId) {
  const normalizedSessionId = normalizePublishSessionId(sessionId);

  if (!normalizedSessionId) {
    return false;
  }

  const session = await AdsLaunchPublishSession.findOne({ sessionId: normalizedSessionId })
    .select('status pauseRequested')
    .lean();

  return Boolean(
    session?.pauseRequested ||
      session?.status === PUBLISH_SESSION_STATUSES.PAUSE_REQUESTED ||
      session?.status === PUBLISH_SESSION_STATUSES.PAUSED
  );
}

async function isPublishSessionForceStopped(sessionId) {
  const normalizedSessionId = normalizePublishSessionId(sessionId);

  if (!normalizedSessionId) {
    return false;
  }

  if (forceStoppedPublishSessionIds.has(normalizedSessionId)) {
    return true;
  }

  const session = await AdsLaunchPublishSession.findOne({ sessionId: normalizedSessionId })
    .select('status forceStopRequested')
    .lean();

  return Boolean(
    session?.forceStopRequested ||
      session?.status === PUBLISH_SESSION_STATUSES.FORCE_STOPPED
  );
}

async function throwIfPublishSessionForceStopped(sessionId) {
  if (!(await isPublishSessionForceStopped(sessionId))) {
    return;
  }

  throw new HttpError(409, 'Publish was force-stopped by user', {
    forceStopped: true,
  });
}

function isPublishForceStopError(error) {
  return Boolean(error?.forceStopped);
}

async function clearPublishSessionHistory({ actor, req }) {
  const clearableStatuses = [
    PUBLISH_SESSION_STATUSES.COMPLETED,
    PUBLISH_SESSION_STATUSES.FAILED,
    PUBLISH_SESSION_STATUSES.FORCE_STOPPED,
    PUBLISH_SESSION_STATUSES.QUEUED,
  ];
  const result = await AdsLaunchPublishSession.deleteMany({
    ...publishSessionAccessFilter(actor),
    status: { $in: clearableStatuses },
  });
  const deletedCount = result.deletedCount || 0;

  await writeActivityLog({
    user: actor,
    action: 'ADS_PUBLISH_HISTORY_CLEARED',
    entity: 'AdsLaunchPublishSession',
    metadata: {
      deletedCount,
    },
    req,
  });

  return {
    message: deletedCount
      ? `Cleared ${deletedCount} publish history item${deletedCount === 1 ? '' : 's'}`
      : 'No completed publish history to clear',
    deletedCount,
  };
}

function getRandomPublishIntervalMs(settings = {}) {
  if (!settings.enabled) {
    return 0;
  }

  const minMinutes = Number(settings.minMinutes);
  const maxMinutes = Number(settings.maxMinutes);

  if (!Number.isFinite(minMinutes) || !Number.isFinite(maxMinutes) || minMinutes <= 0 || maxMinutes <= 0) {
    return 0;
  }

  const minMs = Math.round(Math.min(minMinutes, maxMinutes) * 60 * 1000);
  const maxMs = Math.round(Math.max(minMinutes, maxMinutes) * 60 * 1000);

  if (maxMs <= minMs) {
    return minMs;
  }

  return Math.round(minMs + Math.random() * (maxMs - minMs));
}

async function waitBetweenPublishAccounts({ sessionId, settings, progress, progressContext, nextAccountName }) {
  const delayMs = getRandomPublishIntervalMs(settings);

  if (!delayMs) {
    return { paused: false, delayMs: 0 };
  }

  const startedAt = Date.now();
  const totalSeconds = Math.max(Math.ceil(delayMs / 1000), 1);
  let lastRemainingSeconds = null;
  const emitCountdown = () => {
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = Math.max(delayMs - elapsedMs, 0);
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    if (remainingSeconds === lastRemainingSeconds) {
      return;
    }

    lastRemainingSeconds = remainingSeconds;
    progress.info({
      ...progressContext,
      step: 'account-interval',
      status: 'waiting',
      transient: true,
      message: `Waiting ${formatDelayDuration(remainingMs)} before ${nextAccountName || 'next ad account'} to avoid rapid Meta API calls`,
      delayMs,
      remainingMs,
      intervalTotalSeconds: totalSeconds,
      intervalRemainingSeconds: remainingSeconds,
      nextAccountName,
      progress: {
        ...progress.getProgress(),
        etaSeconds: remainingSeconds,
      },
    });
  };

  emitCountdown();

  while (Date.now() - startedAt < delayMs) {
    await throwIfPublishSessionForceStopped(sessionId);

    if (await isPublishSessionPauseRequested(sessionId)) {
      return { paused: true, delayMs: Date.now() - startedAt };
    }

    await sleep(Math.min(1000, delayMs - (Date.now() - startedAt)));
    emitCountdown();
  }

  return { paused: false, delayMs };
}

async function listPublishSessions({ actor, limit = 15 }) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 15, 1), 30);
  const query = {
    ...publishSessionAccessFilter(actor),
  };
  let sessions = await AdsLaunchPublishSession.find(query).sort({ updatedAt: -1 }).limit(safeLimit);

  if (await reconcileRecoveredPublishFailures({ sessions, actor })) {
    sessions = await AdsLaunchPublishSession.find(query).sort({ updatedAt: -1 }).limit(safeLimit);
  }

  return {
    sessions: sessions.map((session) => normalizeTerminalPublishSessionSafeObject(session.toSafeObject())),
  };
}

async function getPublishSession({ sessionId, actor }) {
  const session = await getPublishSessionDocForActor(sessionId, actor);

  return {
    session: normalizeTerminalPublishSessionSafeObject(session.toSafeObject()),
  };
}

async function resolvePublishSessionActor(session) {
  if (session?.createdBy) {
    const user = await User.findById(session.createdBy);

    if (user) {
      return user;
    }
  }

  if (session?.updatedBy) {
    const user = await User.findById(session.updatedBy);

    if (user) {
      return user;
    }
  }

  throw new HttpError(400, 'Queued publish cannot start because the original user was not found');
}

async function claimNextQueuedPublishSession() {
  const now = new Date();
  const queuedSessions = await AdsLaunchPublishSession.find({
    status: PUBLISH_SESSION_STATUSES.PENDING,
    'queue.status': PUBLISH_SESSION_QUEUE_STATUSES.PENDING,
  })
    .sort({
      'queue.queuedAt': 1,
      createdAt: 1,
    })
    .limit(50);

  if (!queuedSessions.length) {
    return null;
  }

  for (const queuedSession of queuedSessions) {
    const payload = queuedSession.payload || {};
    const reservation = reservePublishSessionResources({
      sessionId: queuedSession.sessionId,
      payload,
      tokenType: payload.tokenType,
    });

    if (!reservation.acquired) {
      const waitingEvent = {
        sessionId: queuedSession.sessionId,
        type: 'progress',
        status: 'queued',
        step: 'queued-resource-wait',
        timestamp: now.toISOString(),
        message: reservation.conflict?.message || 'Waiting for publish lane to become available',
        progress: queuedSession.progress?.progress || null,
        queue: {
          conflict: reservation.conflict,
        },
      };

      await AdsLaunchPublishSession.updateOne(
        {
          _id: queuedSession._id,
          status: PUBLISH_SESSION_STATUSES.PENDING,
          'queue.status': PUBLISH_SESSION_QUEUE_STATUSES.PENDING,
        },
        {
          $set: {
            progress: waitingEvent,
            'queue.lastError': reservation.conflict?.message || '',
          },
        }
      );
      continue;
    }

    const startEvent = {
      sessionId: queuedSession.sessionId,
      type: 'progress',
      status: 'active',
      step: 'queue-start',
      timestamp: now.toISOString(),
      message: 'Queued publish started in the background',
      progress: queuedSession.progress?.progress || null,
    };

    const claimedSession = await AdsLaunchPublishSession.findOneAndUpdate(
      {
        _id: queuedSession._id,
        status: PUBLISH_SESSION_STATUSES.PENDING,
        'queue.status': PUBLISH_SESSION_QUEUE_STATUSES.PENDING,
      },
      {
        $set: {
          status: PUBLISH_SESSION_STATUSES.ACTIVE,
          progress: startEvent,
          'queue.status': PUBLISH_SESSION_QUEUE_STATUSES.RUNNING,
          'queue.startedAt': now,
          'queue.completedAt': null,
          'queue.lastError': '',
        },
        $inc: {
          'queue.attemptCount': 1,
        },
        $push: {
          events: {
            $each: [startEvent],
            $slice: -PUBLISH_SESSION_EVENT_LIMIT,
          },
        },
      },
      {
        returnDocument: 'after',
      }
    );

    if (!claimedSession) {
      releasePublishSessionResources(queuedSession.sessionId);
      continue;
    }

    return {
      resources: reservation.resources,
      session: claimedSession,
    };
  }

  return null;
}

async function markQueuedPublishSessionComplete({ sessionId, error = '' }) {
  const normalizedSessionId = normalizePublishSessionId(sessionId);

  if (!normalizedSessionId) {
    return;
  }

  await AdsLaunchPublishSession.updateOne(
    {
      sessionId: normalizedSessionId,
      'queue.status': PUBLISH_SESSION_QUEUE_STATUSES.RUNNING,
    },
    {
      $set: {
        'queue.status': error ? PUBLISH_SESSION_QUEUE_STATUSES.FAILED : PUBLISH_SESSION_QUEUE_STATUSES.COMPLETED,
        'queue.completedAt': new Date(),
        'queue.lastError': normalizeText(error),
      },
    }
  );
}

function schedulePublishSessionQueueRun(delayMs = 0) {
  const safeDelayMs = Math.max(Number(delayMs) || 0, 0);
  const dueAt = Date.now() + safeDelayMs;

  if (publishSessionQueueTimer && publishSessionQueueTimerDueAt && publishSessionQueueTimerDueAt <= dueAt) {
    return;
  }

  if (publishSessionQueueTimer) {
    clearTimeout(publishSessionQueueTimer);
  }

  publishSessionQueueTimerDueAt = dueAt;
  publishSessionQueueTimer = setTimeout(() => {
    publishSessionQueueTimer = null;
    publishSessionQueueTimerDueAt = null;
    runPublishSessionQueue({ source: 'auto' }).catch(() => undefined);
  }, safeDelayMs);
}

async function runClaimedPublishSession({ session }) {
  try {
    const actor = await resolvePublishSessionActor(session);
    const payload = {
      ...(session.payload || {}),
      publishSessionId: session.sessionId,
    };

    await publishLaunchUnlocked({
      payload,
      actor,
      req: null,
      tokenType: payload.tokenType,
      publishSessionId: session.sessionId,
    });
    await markQueuedPublishSessionComplete({
      sessionId: session.sessionId,
    });
  } catch (error) {
    await failPublishSession({
      sessionId: session.sessionId,
      error,
    });
    await markQueuedPublishSessionComplete({
      sessionId: session.sessionId,
      error: error.message || 'Queued publish failed',
    });
  } finally {
    releasePublishSessionResources(session.sessionId);
    schedulePublishSessionQueueRun(0);
  }
}

async function runPublishSessionQueue({ source = 'manual' } = {}) {
  if (publishSessionQueueRunning) {
    return {
      message: 'Publish session queue dispatcher is already checking lanes',
      processed: 0,
      running: true,
    };
  }

  publishSessionQueueRunning = true;
  let processed = 0;

  try {
    while (true) {
      const claim = await claimNextQueuedPublishSession();

      if (!claim?.session) {
        break;
      }

      processed += 1;
      runClaimedPublishSession({
        resources: claim.resources,
        session: claim.session,
      }).catch(() => undefined);
    }

    return {
      message: processed ? `Publish session queue started ${processed} publish${processed === 1 ? '' : 'es'}` : 'No queued publish sessions were ready',
      processed,
      running: false,
      source,
    };
  } finally {
    publishSessionQueueRunning = false;

    const hasMoreQueued = await AdsLaunchPublishSession.exists({
      status: PUBLISH_SESSION_STATUSES.PENDING,
      'queue.status': PUBLISH_SESSION_QUEUE_STATUSES.PENDING,
    });

    if (hasMoreQueued) {
      schedulePublishSessionQueueRun(processed ? 1000 : 5000);
    }
  }
}

function clonePublishValue(value, fallback = null) {
  if (value === undefined || value === null) {
    return fallback;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function getPublishAccountKey(item = {}) {
  return (
    normalizeText(item.adAccountId) ||
    normalizeText(item.accountId) ||
    normalizeText(item.historyRecordId) ||
    normalizeText(item.campaignId)
  );
}

function mergeRecoveredPublishResults(existingResults = [], retryResults = [], recoveredFailures = [], retriedAt = '') {
  const recoveredAccountIds = new Set(recoveredFailures.map((failure) => normalizeText(failure.adAccountId)).filter(Boolean));
  const retryAccountIds = new Set(retryResults.map(getPublishAccountKey).filter(Boolean));
  const recoveredByAccount = new Map(
    recoveredFailures.map((failure) => [normalizeText(failure.adAccountId), failure]).filter(([accountId]) => Boolean(accountId))
  );

  const retainedResults = existingResults.filter((result) => {
    const accountKey = getPublishAccountKey(result);
    return !accountKey || !recoveredAccountIds.has(accountKey) || !retryAccountIds.has(accountKey);
  });
  const decoratedRetryResults = retryResults.map((result) => {
    const accountKey = getPublishAccountKey(result);
    const recoveredFailure = recoveredByAccount.get(accountKey) || recoveredFailures[0] || {};

    return {
      ...result,
      retried: true,
      retriedAt,
      recoveredFailureId: recoveredFailure.historyRecordId || '',
    };
  });

  return [...retainedResults, ...decoratedRetryResults];
}

async function markPublishFailureResolved({ campaignId = '', historyRecordId = '', actor, retryResult = null } = {}) {
  const normalizedCampaignId = normalizeText(campaignId);
  const normalizedHistoryRecordId = normalizeText(historyRecordId);
  const matchConditions = [];

  if (normalizedCampaignId) {
    matchConditions.push({ 'latestResult.failed.campaignId': normalizedCampaignId });
  }

  if (normalizedHistoryRecordId) {
    matchConditions.push({ 'latestResult.failed.historyRecordId': normalizedHistoryRecordId });
  }

  if (!matchConditions.length) {
    return { sessions: [] };
  }

  const sessions = await AdsLaunchPublishSession.find({
    ...publishSessionAccessFilter(actor),
    $or: matchConditions,
  }).sort({ updatedAt: -1 });
  const updatedSessions = [];
  const now = new Date();
  const retriedAt = now.toISOString();

  for (const session of sessions) {
    const latestResult = clonePublishValue(session.latestResult, {});
    const failed = Array.isArray(latestResult?.failed) ? latestResult.failed : [];
    const recoveredFailures = [];
    const remainingFailed = failed.filter((failure) => {
      const matches =
        (normalizedCampaignId && normalizeText(failure.campaignId) === normalizedCampaignId) ||
        (normalizedHistoryRecordId && normalizeText(failure.historyRecordId) === normalizedHistoryRecordId);

      if (matches) {
        recoveredFailures.push(failure);
      }

      return !matches;
    });

    if (!recoveredFailures.length) {
      continue;
    }

    const previousResults = Array.isArray(latestResult.results) ? latestResult.results : [];
    const retryResults = Array.isArray(retryResult?.results) ? retryResult.results : [];
    const nextResults = mergeRecoveredPublishResults(previousResults, retryResults, recoveredFailures, retriedAt);
    const queuedCount = remainingFailed.filter((failure) => failure.queued).length;
    const hardFailedCount = remainingFailed.length - queuedCount;
    const requestedCount = Math.max(
      Number(latestResult.summary?.requested || 0),
      nextResults.length + remainingFailed.length,
      previousResults.length + failed.length
    );
    const summary = {
      ...(latestResult.summary || {}),
      requested: requestedCount,
      published: nextResults.length,
      failed: remainingFailed.length,
      queued: queuedCount,
      paused: Number(latestResult.summary?.paused || 0),
    };
    const recoveredNames = recoveredFailures
      .map((failure) => normalizeText(failure.adAccountName) || normalizeText(failure.adAccountId))
      .filter(Boolean)
      .join(', ');
    const message = remainingFailed.length
      ? `Retry completed for ${recoveredNames || 'failed account'}. ${hardFailedCount || queuedCount} failure${(hardFailedCount || queuedCount) === 1 ? '' : 's'} still need attention.`
      : `Retry completed for ${recoveredNames || 'failed account'}. Publish history is recovered.`;
    const nextStatus = remainingFailed.length
      ? hardFailedCount > 0
        ? PUBLISH_SESSION_STATUSES.FAILED
        : PUBLISH_SESSION_STATUSES.QUEUED
      : PUBLISH_SESSION_STATUSES.COMPLETED;
    const progress = {
      ...(session.progress || {}),
      type: 'progress',
      status: nextStatus.toLowerCase(),
      step: 'retry',
      timestamp: retriedAt,
      message,
      progress: {
        ...(session.progress?.progress || latestResult.progress || {}),
        completed: nextResults.length + remainingFailed.length,
        total: requestedCount,
        percent: requestedCount ? Math.min(100, Math.round(((nextResults.length + remainingFailed.length) / requestedCount) * 100)) : 100,
        etaSeconds: 0,
      },
    };

    session.status = nextStatus;
    session.latestResult = {
      ...latestResult,
      message,
      results: nextResults,
      failed: remainingFailed,
      resolvedFailed: [
        ...(Array.isArray(latestResult.resolvedFailed) ? latestResult.resolvedFailed : []),
        ...recoveredFailures.map((failure) => ({
          ...failure,
          resolved: true,
          retriedAt,
        })),
      ],
      summary,
      progress: progress.progress,
    };
    session.latestError = hardFailedCount > 0 ? `${hardFailedCount} ad account${hardFailedCount === 1 ? '' : 's'} still failed during publish` : '';
    session.progress = progress;
    session.completedAt = now;
    session.updatedBy = actor?._id || null;
    session.events = [...(session.events || []), progress].slice(-PUBLISH_SESSION_EVENT_LIMIT);
    session.markModified('latestResult');
    session.markModified('progress');
    session.markModified('events');
    await session.save();
    updatedSessions.push(session.toSafeObject());
  }

  return { sessions: updatedSessions };
}

function buildRecoveredRetryResultFromCampaign(campaign) {
  const safeCampaign = campaign?.toObject?.() || campaign || {};
  const result = {
    adAccountId: safeCampaign.adAccount?.id || '',
    adAccountName: safeCampaign.adAccount?.name || safeCampaign.adAccount?.id || '',
    campaignId: safeCampaign.campaignId || '',
    adSetId: safeCampaign.adSetId || '',
    creativeId: safeCampaign.creativeId || '',
    adId: safeCampaign.adId || '',
    status: safeCampaign.status || safeCampaign.effectiveStatus || 'PAUSED',
    historyRecordId: safeCampaign._id?.toString?.() || '',
    historySaved: true,
    recoveredFromHistory: true,
  };

  return {
    message: 'Retry already completed. Publish history was refreshed.',
    results: [result],
    failed: [],
    summary: {
      requested: 1,
      published: 1,
      failed: 0,
      queued: 0,
      paused: 0,
    },
  };
}

async function reconcileRecoveredPublishFailures({ sessions = [], actor } = {}) {
  const campaignIds = [
    ...new Set(
      sessions
        .flatMap((session) => (Array.isArray(session.latestResult?.failed) ? session.latestResult.failed : []))
        .map((failure) => normalizeText(failure.campaignId))
        .filter(Boolean)
    ),
  ];

  if (!campaignIds.length) {
    return false;
  }

  const campaigns = await ManagedCampaign.find({
    ...managedCampaignAccessFilter(actor),
    campaignId: {
      $in: campaignIds,
    },
    status: {
      $ne: 'FAILED',
    },
    adId: {
      $exists: true,
      $nin: ['', null],
    },
  }).lean();

  if (!campaigns.length) {
    return false;
  }

  for (const campaign of campaigns) {
    await markPublishFailureResolved({
      campaignId: campaign.campaignId,
      historyRecordId: campaign._id?.toString?.() || '',
      actor,
      retryResult: buildRecoveredRetryResultFromCampaign(campaign),
    });
  }

  return true;
}

async function resumePublishSession({ sessionId, actor, req }) {
  const session = await getPublishSessionDocForActor(sessionId, actor);

  if (session.status !== PUBLISH_SESSION_STATUSES.PAUSED) {
    throw new HttpError(400, 'Only a paused publish can be continued');
  }

  const resumePayload = session.resumePayload;
  const remainingCount = getPublishRequestCount(resumePayload);

  if (!remainingCount) {
    throw new HttpError(400, 'This paused publish does not have remaining publish items to continue');
  }

  const now = new Date();
  const queuedPayload = {
    ...resumePayload,
    publishSessionId: session.sessionId,
  };
  const event = {
    type: 'progress',
    sessionId: session.sessionId,
    status: 'queued',
    step: 'resume-queued',
    timestamp: now.toISOString(),
    message: `Paused publish queued with ${remainingCount} remaining publish item${remainingCount === 1 ? '' : 's'}`,
    progress: session.progress?.progress || null,
  };

  session.status = PUBLISH_SESSION_STATUSES.PENDING;
  session.payload = queuedPayload;
  session.resumePayload = null;
  session.latestResult = null;
  session.latestError = '';
  session.pauseRequested = false;
  session.pauseRequestedAt = null;
  session.forceStopRequested = false;
  session.forceStopRequestedAt = null;
  forceStoppedPublishSessionIds.delete(session.sessionId);
  session.pausedAt = null;
  session.stoppedAt = null;
  session.completedAt = null;
  session.progress = event;
  session.queue = {
    status: PUBLISH_SESSION_QUEUE_STATUSES.PENDING,
    queuedAt: now,
    startedAt: null,
    completedAt: null,
    attemptCount: 0,
    lastError: '',
  };
  session.updatedBy = actor?._id || null;
  session.events.push(event);
  session.events = session.events.slice(-PUBLISH_SESSION_EVENT_LIMIT);
  await session.save();

  schedulePublishSessionQueueRun(0);

  return session.toSafeObject();
}

function normalizeMediaFolderId(folderId) {
  const normalizedFolderId = normalizeText(folderId);

  if (!normalizedFolderId || normalizedFolderId === 'root') {
    return '';
  }

  if (!mongoose.isValidObjectId(normalizedFolderId)) {
    throw new HttpError(400, 'Invalid media folder');
  }

  return normalizedFolderId;
}

async function getTemplateForActor(templateId, actor) {
  const template = await LaunchTemplate.findOne({
    _id: templateId,
    ...templateAccessFilter(actor),
  }).populate('createdBy', 'name email');

  if (!template) {
    throw new HttpError(404, 'Launch template not found');
  }

  return template;
}

async function listTemplates({ actor, templateType = '' }) {
  const query = {
    ...templateAccessFilter(actor),
  };
  const normalizedTemplateType = normalizeText(templateType).toUpperCase();

  if (normalizedTemplateType && Object.values(LAUNCH_TEMPLATE_TYPES).includes(normalizedTemplateType)) {
    query.templateType = normalizedTemplateType;
  }

  const templates = await LaunchTemplate.find(query)
    .populate('createdBy', 'name email')
    .sort({ updatedAt: -1 });

  return templates.map((template) => template.toSafeObject());
}

async function getMediaAssetDocForActor(mediaId, actor) {
  const mediaAsset = await AdsLaunchMedia.findOne({
    _id: mediaId,
    ...mediaLibraryAccessFilter(actor),
  }).populate('createdBy', 'name email');

  if (!mediaAsset) {
    throw new HttpError(404, 'Media library asset not found');
  }

  return mediaAsset;
}

async function getMediaFolderDocForActor(folderId, actor) {
  const normalizedFolderId = normalizeMediaFolderId(folderId);

  if (!normalizedFolderId) {
    return null;
  }

  const mediaFolder = await AdsLaunchMediaFolder.findOne({
    _id: normalizedFolderId,
    ...mediaLibraryAccessFilter(actor),
  });

  if (!mediaFolder) {
    throw new HttpError(404, 'Media folder not found');
  }

  return mediaFolder;
}

async function listMediaFolders({ actor }) {
  const mediaFolders = await AdsLaunchMediaFolder.find({
    ...mediaLibraryAccessFilter(actor),
  }).sort({ parent: 1, name: 1, createdAt: 1 });

  return mediaFolders.map((mediaFolder) => mediaFolder.toSafeObject());
}

async function getMediaFolderTreeIds({ folderId, actor }) {
  const rootFolder = await getMediaFolderDocForActor(folderId, actor);
  const mediaFolders = await AdsLaunchMediaFolder.find({
    ...mediaLibraryAccessFilter(actor),
  }).select('_id parent');
  const foldersByParent = mediaFolders.reduce((groups, folder) => {
    const parentId = folder.parent?._id?.toString?.() || folder.parent?.toString?.() || '';
    const nextGroup = groups.get(parentId) || [];
    nextGroup.push(folder);
    groups.set(parentId, nextGroup);
    return groups;
  }, new Map());
  const folderIds = [];
  const stack = [rootFolder];

  while (stack.length) {
    const folder = stack.pop();
    const currentFolderId = folder._id.toString();
    folderIds.push(folder._id);
    stack.push(...(foldersByParent.get(currentFolderId) || []));
  }

  return {
    folderIds,
    rootFolder,
  };
}

async function createMediaFolder({ name, parentId = null, brandId = '', brandName = '', actor, req }) {
  const normalizedName = normalizeText(name);

  if (!normalizedName) {
    throw new HttpError(400, 'Folder name is required');
  }

  const parentFolder = await getMediaFolderDocForActor(parentId, actor);
  const resolvedBrandId = parentFolder?.brandId || normalizeText(brandId);
  const resolvedBrandName = parentFolder?.brandName || normalizeText(brandName);

  if (!parentFolder && !resolvedBrandId) {
    throw new HttpError(400, 'Select a brand before creating a top-level media folder');
  }

  const existingFolder = await AdsLaunchMediaFolder.findOne({
    ...mediaLibraryAccessFilter(actor),
    parent: parentFolder?._id || null,
    brandId: resolvedBrandId,
    name: normalizedName,
  });

  if (existingFolder) {
    throw new HttpError(409, 'A folder with this name already exists here');
  }

  const mediaFolder = await AdsLaunchMediaFolder.create({
    name: normalizedName,
    parent: parentFolder?._id || null,
    brandId: resolvedBrandId,
    brandName: resolvedBrandName,
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  await writeActivityLog({
    user: actor,
    action: 'ADS_MEDIA_FOLDER_CREATED',
    entity: 'AdsLaunchMediaFolder',
    entityId: mediaFolder._id.toString(),
    metadata: {
      name: mediaFolder.name,
      parentId: parentFolder?._id?.toString?.() || null,
      brandId: mediaFolder.brandId,
      brandName: mediaFolder.brandName,
    },
    req,
  });

  return mediaFolder.toSafeObject();
}

async function listMediaAssets({ actor, brandId = '', search = '', includeUnassigned = false }) {
  const query = {
    ...mediaLibraryAccessFilter(actor),
  };
  const normalizedBrandId = normalizeText(brandId);
  const normalizedSearch = normalizeText(search);

  if (normalizedBrandId) {
    query.brandId = includeUnassigned
      ? {
          $in: [normalizedBrandId, ''],
        }
      : normalizedBrandId;
  }

  if (normalizedSearch) {
    const escapedSearch = normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedSearch, 'i');
    query.$or = [
      { name: searchRegex },
      { brandName: searchRegex },
      { 'media.name': searchRegex },
      { 'metaReview.lastMetaStatus': searchRegex },
      { 'metaReview.lastReason': searchRegex },
      { 'metaReview.lastAd.adName': searchRegex },
      { 'metaReview.lastAd.campaignName': searchRegex },
      { 'metaReview.lastAd.adAccountName': searchRegex },
    ];
  }

  const mediaAssets = await AdsLaunchMedia.find(query)
    .populate('createdBy', 'name email')
    .sort({ updatedAt: -1 });

  return mediaAssets.map((mediaAsset) => mediaAsset.toSafeObject());
}

async function createMediaAsset({
  name,
  brandId,
  brandName,
  folderId = null,
  media,
  thumbnail,
  uploadedMedia = null,
  uploadedThumbnail = null,
  mediaMetadata = null,
  thumbnailMetadata = null,
  actor,
  req,
}) {
  const normalizedName = normalizeText(name);
  const mediaInput = uploadedMedia ? null : sanitizeMediaLibraryAssetInput(media);
  const thumbnailInput = uploadedThumbnail ? null : sanitizeMediaLibraryAssetInput(thumbnail);

  if (!normalizedName) {
    cleanupUploadedMediaFile(uploadedMedia);
    cleanupUploadedMediaFile(uploadedThumbnail);
    throw new HttpError(400, 'Media name is required');
  }

  if (!uploadedMedia && !mediaInput) {
    cleanupUploadedMediaFile(uploadedMedia);
    cleanupUploadedMediaFile(uploadedThumbnail);
    throw new HttpError(400, 'Select an image or video to save in the media library');
  }

  let folder = null;
  try {
    folder = await getMediaFolderDocForActor(folderId, actor);
  } catch (error) {
    cleanupUploadedMediaFile(uploadedMedia);
    cleanupUploadedMediaFile(uploadedThumbnail);
    throw error;
  }

  const mediaMimeType = uploadedMedia
    ? normalizeMediaLibraryMimeType(uploadedMedia.mimetype, uploadedMedia.originalname)
    : normalizeMediaLibraryMimeType(mediaInput?.type, mediaInput?.name);
  const mediaType = mediaMimeType.startsWith('video/') ? ADS_MEDIA_TYPES.VIDEO : ADS_MEDIA_TYPES.IMAGE;

  const mediaAsset = new AdsLaunchMedia({
    name: normalizedName,
    mediaType,
    brandId: folder?.brandId || normalizeText(brandId),
    brandName: folder?.brandName || normalizeText(brandName),
    folder: folder?._id || null,
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  try {
    mediaAsset.media = uploadedMedia
      ? await persistUploadedMediaLibraryAsset({
          mediaId: mediaAsset._id.toString(),
          file: uploadedMedia,
          metadata: mediaMetadata,
          assetKind: 'media',
          mediaType,
        })
      : await persistMediaLibraryAsset({
          mediaId: mediaAsset._id.toString(),
          asset: mediaInput,
          assetKind: 'media',
          mediaType,
        });
    mediaAsset.thumbnail =
      mediaType === ADS_MEDIA_TYPES.VIDEO && (uploadedThumbnail || thumbnailInput)
        ? uploadedThumbnail
          ? await persistUploadedMediaLibraryAsset({
              mediaId: mediaAsset._id.toString(),
              file: uploadedThumbnail,
              metadata: thumbnailMetadata,
              assetKind: 'thumbnail',
              mediaType,
            })
          : await persistMediaLibraryAsset({
              mediaId: mediaAsset._id.toString(),
              asset: thumbnailInput,
              assetKind: 'thumbnail',
              mediaType,
            })
        : null;
    await mediaAsset.save();
  } catch (error) {
    await deleteStoredMediaLibraryAsset(mediaAsset.media);
    await deleteStoredMediaLibraryAsset(mediaAsset.thumbnail);
    throw error;
  } finally {
    cleanupUploadedMediaFile(uploadedMedia);
    cleanupUploadedMediaFile(uploadedThumbnail);
  }

  await writeActivityLog({
    user: actor,
    action: 'ADS_MEDIA_LIBRARY_CREATED',
    entity: 'AdsLaunchMedia',
    entityId: mediaAsset._id.toString(),
    metadata: {
      name: mediaAsset.name,
      brandId: mediaAsset.brandId,
      brandName: mediaAsset.brandName,
      folderId: folder?._id?.toString?.() || null,
      mediaType: mediaAsset.mediaType,
      width: mediaAsset.media?.width || 0,
      height: mediaAsset.media?.height || 0,
    },
    req,
  });

  const populated = await AdsLaunchMedia.findById(mediaAsset._id).populate('createdBy', 'name email');
  return populated.toSafeObject();
}

async function completeChunkedMediaAsset({
  name,
  brandId,
  brandName,
  folderId = null,
  uploadId,
  mediaOriginalName,
  mediaMimeType,
  mediaSize,
  mediaMetadata,
  thumbnail,
  thumbnailMetadata,
  thumbnailUploadId,
  actor,
  req,
}) {
  const normalizedUploadId = sanitizeMediaUploadId(uploadId);
  const normalizedThumbnailUploadId = normalizeText(thumbnailUploadId) ? sanitizeMediaUploadId(thumbnailUploadId) : '';
  let uploadedMedia = null;

  try {
    uploadedMedia = assembleMediaUploadChunks({
      uploadId: normalizedUploadId,
      actor,
      originalName: mediaOriginalName,
      mimeType: mediaMimeType,
      size: mediaSize,
      label: 'Media',
    });

    return await createMediaAsset({
      name,
      brandId,
      brandName,
      folderId,
      uploadedMedia,
      mediaMetadata,
      thumbnail,
      thumbnailMetadata,
      actor,
      req,
    });
  } finally {
    cleanupMediaChunkSession(normalizedUploadId);
    cleanupMediaChunkSession(normalizedThumbnailUploadId);
    cleanupUploadedMediaFile(uploadedMedia);
  }
}

async function deleteMediaAsset({ mediaId, actor, req }) {
  const mediaAsset = await getMediaAssetDocForActor(mediaId, actor);

  await deleteStoredMediaLibraryAsset(mediaAsset.media);
  await deleteStoredMediaLibraryAsset(mediaAsset.thumbnail);
  await mediaAsset.deleteOne();

  await writeActivityLog({
    user: actor,
    action: 'ADS_MEDIA_LIBRARY_DELETED',
    entity: 'AdsLaunchMedia',
    entityId: mediaAsset._id.toString(),
    metadata: {
      name: mediaAsset.name,
      mediaType: mediaAsset.mediaType,
    },
    req,
  });
}

async function deleteMediaFolder({ folderId, actor, req }) {
  const { folderIds, rootFolder } = await getMediaFolderTreeIds({
    folderId,
    actor,
  });
  const mediaAssets = await AdsLaunchMedia.find({
    ...mediaLibraryAccessFilter(actor),
    folder: {
      $in: folderIds,
    },
  });

  await Promise.all(
    mediaAssets.flatMap((mediaAsset) => [
      deleteStoredMediaLibraryAsset(mediaAsset.media),
      deleteStoredMediaLibraryAsset(mediaAsset.thumbnail),
    ])
  );

  const mediaDeleteResult = mediaAssets.length
    ? await AdsLaunchMedia.deleteMany({
        ...mediaLibraryAccessFilter(actor),
        _id: {
          $in: mediaAssets.map((mediaAsset) => mediaAsset._id),
        },
      })
    : { deletedCount: 0 };
  const folderDeleteResult = await AdsLaunchMediaFolder.deleteMany({
    ...mediaLibraryAccessFilter(actor),
    _id: {
      $in: folderIds,
    },
  });

  await writeActivityLog({
    user: actor,
    action: 'ADS_MEDIA_FOLDER_DELETED',
    entity: 'AdsLaunchMediaFolder',
    entityId: rootFolder._id.toString(),
    metadata: {
      name: rootFolder.name,
      brandId: rootFolder.brandId,
      brandName: rootFolder.brandName,
      deletedFolders: folderDeleteResult.deletedCount || 0,
      deletedMedia: mediaDeleteResult.deletedCount || 0,
    },
    req,
  });

  return {
    deletedFolders: folderDeleteResult.deletedCount || 0,
    deletedMedia: mediaDeleteResult.deletedCount || 0,
  };
}

async function updateMediaAssetBrand({ mediaId, brandId = '', brandName = '', actor, req }) {
  const mediaAsset = await getMediaAssetDocForActor(mediaId, actor);
  const previousBrandId = mediaAsset.brandId || '';
  const previousBrandName = mediaAsset.brandName || '';

  mediaAsset.brandId = normalizeText(brandId);
  mediaAsset.brandName = mediaAsset.brandId ? normalizeText(brandName) : '';
  mediaAsset.updatedBy = actor._id;
  await mediaAsset.save();

  await writeActivityLog({
    user: actor,
    action: 'ADS_MEDIA_LIBRARY_BRAND_UPDATED',
    entity: 'AdsLaunchMedia',
    entityId: mediaAsset._id.toString(),
    metadata: {
      name: mediaAsset.name,
      mediaType: mediaAsset.mediaType,
      previousBrandId,
      previousBrandName,
      brandId: mediaAsset.brandId,
      brandName: mediaAsset.brandName,
    },
    req,
  });

  const populated = await AdsLaunchMedia.findById(mediaAsset._id).populate('createdBy', 'name email');
  return populated.toSafeObject();
}

async function createTemplate({ name, templateType, config, snapshot, actor, req }) {
  const normalizedName = normalizeText(name);
  if (!normalizedName) {
    throw new HttpError(400, 'Template name is required');
  }

  const template = await LaunchTemplate.create({
    name: normalizedName,
    templateType: normalizeTemplateType(templateType),
    config: sanitizeTemplateConfig(config),
    snapshot: sanitizeSnapshot(snapshot),
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  await applyTemplateAssets({
    template,
    snapshotInput: snapshot,
    actor,
  });
  await template.save();

  await writeActivityLog({
    user: actor,
    action: 'ADS_LAUNCH_TEMPLATE_CREATED',
    entity: 'LaunchTemplate',
    entityId: template._id.toString(),
    metadata: {
      name: template.name,
      templateType: template.templateType,
    },
    req,
  });

  const populated = await LaunchTemplate.findById(template._id).populate('createdBy', 'name email');
  return populated.toSafeObject();
}

async function updateTemplate({ templateId, name, templateType, config, snapshot, actor, req }) {
  const template = await getTemplateForActor(templateId, actor);
  const existingSnapshot = template.snapshot ? template.snapshot.toObject?.() || template.snapshot : null;

  const normalizedName = normalizeText(name);
  if (!normalizedName) {
    throw new HttpError(400, 'Template name is required');
  }

  template.name = normalizedName;
  template.templateType = normalizeTemplateType(templateType || template.templateType);
  template.config = sanitizeTemplateConfig(config);
  template.snapshot = sanitizeSnapshot(snapshot);
  await applyTemplateAssets({
    template,
    snapshotInput: snapshot,
    existingSnapshot,
    actor,
  });
  template.updatedBy = actor._id;
  await template.save();

  await writeActivityLog({
    user: actor,
    action: 'ADS_LAUNCH_TEMPLATE_UPDATED',
    entity: 'LaunchTemplate',
    entityId: template._id.toString(),
    metadata: {
      name: template.name,
      templateType: template.templateType,
    },
    req,
  });

  const populated = await LaunchTemplate.findById(template._id).populate('createdBy', 'name email');
  return populated.toSafeObject();
}

async function deleteTemplate({ templateId, actor, req }) {
  const template = await getTemplateForActor(templateId, actor);
  await deleteTemplateStoredAssets(template);
  await template.deleteOne();

  await writeActivityLog({
    user: actor,
    action: 'ADS_LAUNCH_TEMPLATE_DELETED',
    entity: 'LaunchTemplate',
    entityId: template._id.toString(),
    metadata: {
      name: template.name,
    },
    req,
  });
}

function parseDataUrlFile(file, label, options = {}) {
  if (!file?.dataUrl || !file?.name) {
    throw new HttpError(400, `${label} is required`);
  }

  const match = String(file.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new HttpError(400, `${label} must be a valid uploaded file`);
  }

  const parsed = {
    name: normalizeText(file.name) || label,
    mimeType: normalizeText(file.type) || match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };

  if (Array.isArray(options.allowedMimeTypePrefixes) && options.allowedMimeTypePrefixes.length) {
    validateAssetMimeType({
      mimeType: parsed.mimeType,
      label,
      allowedPrefixes: options.allowedMimeTypePrefixes,
    });
  }

  return parsed;
}

function buildGraphUrl(path, { videoHost = false } = {}) {
  const base = videoHost ? GRAPH_VIDEO_API_BASE : GRAPH_API_BASE;
  return `${base}/${path.replace(/^\//, '')}`;
}

async function postToMeta({ token, path, params = {}, formData = null, videoHost = false }) {
  const body = formData || new URLSearchParams();

  if (!formData) {
    Object.entries({
      access_token: token.accessToken,
      ...params,
    }).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }

      body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    });
  } else if (!formData.has('access_token')) {
    formData.set('access_token', token.accessToken);
  }

  await waitForMetaApiPacing();

  const response = await fetch(buildGraphUrl(path, { videoHost }), {
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
    throw createMetaApiHttpError({ path, payload, response });
  }

  await tokenService.markTokenConnected({ tokenId: token.id, tokenType: token.tokenType });

  return payload;
}

async function getFromMeta({ token, path, params = {}, videoHost = false }) {
  const url = new URL(buildGraphUrl(path, { videoHost }));
  url.searchParams.set('access_token', token.accessToken);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  });

  await waitForMetaApiPacing();

  const response = await fetch(url, {
    method: 'GET',
  });

  await tokenService.recordTokenApiCall(token.id, token.tokenType);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error) {
    await tokenService.markTokenBlockedFromMetaError({
      tokenId: token.id,
      payload,
      tokenType: token.tokenType,
    });
    throw createMetaApiHttpError({ path, payload, response });
  }

  await tokenService.markTokenConnected({ tokenId: token.id, tokenType: token.tokenType });

  return payload;
}

function getVideoReadyTimeoutMs() {
  const configuredTimeout = Number(process.env.META_VIDEO_READY_TIMEOUT_MS);

  if (!Number.isFinite(configuredTimeout)) {
    return DEFAULT_VIDEO_READY_TIMEOUT_MS;
  }

  return Math.min(Math.max(Math.round(configuredTimeout), DEFAULT_VIDEO_READY_POLL_MS), MAX_VIDEO_READY_TIMEOUT_MS);
}

function getVideoReadyPollMs() {
  const configuredPoll = Number(process.env.META_VIDEO_READY_POLL_MS);

  if (!Number.isFinite(configuredPoll)) {
    return DEFAULT_VIDEO_READY_POLL_MS;
  }

  return Math.min(Math.max(Math.round(configuredPoll), MIN_VIDEO_READY_POLL_MS), getVideoReadyTimeoutMs());
}

function getVideoStatusDetails(payload = {}) {
  const status = payload.status || {};
  const rawStatus = normalizeText(status.video_status || status.status || payload.video_status || payload.processing_status);
  const normalizedStatus = rawStatus.toLowerCase();
  const progressValue = Number.parseInt(status.processing_progress || payload.processing_progress, 10);

  return {
    rawStatus,
    status: normalizedStatus,
    progress: Number.isFinite(progressValue) ? progressValue : null,
  };
}

function isMetaVideoReadyStatus(status) {
  return ['ready', 'complete', 'completed', 'published'].includes(status);
}

function isMetaVideoFailedStatus(status) {
  return status.includes('error') || status.includes('fail') || status.includes('reject');
}

async function waitForMetaVideoReady({ token, videoId, progress = null, progressContext = {} }) {
  const timeoutMs = getVideoReadyTimeoutMs();
  const pollMs = getVideoReadyPollMs();
  const startedAt = Date.now();
  let attempts = 0;

  while (Date.now() - startedAt <= timeoutMs) {
    attempts += 1;
    const statusPayload = await getFromMeta({
      token,
      path: videoId,
      params: {
        fields: 'status',
      },
    });
    const statusDetails = getVideoStatusDetails(statusPayload);
    const progressLabel = statusDetails.progress === null ? '' : ` (${statusDetails.progress}%)`;
    const statusLabel = statusDetails.rawStatus || 'processing';

    if (isMetaVideoReadyStatus(statusDetails.status)) {
      progress?.info({
        ...progressContext,
        step: 'video-processing',
        status: 'completed',
        message: `${progressContext.accountLabel || 'Account'}: video processing complete`,
      });
      return statusPayload;
    }

    if (isMetaVideoFailedStatus(statusDetails.status)) {
      throw new HttpError(400, `Meta video processing failed with status "${statusLabel}"`);
    }

    progress?.info({
      ...progressContext,
      step: 'video-processing',
      status: 'active',
      message: `${progressContext.accountLabel || 'Account'}: waiting for video processing${progressLabel}`,
      videoId,
      videoStatus: statusLabel,
      attempt: attempts,
    });

    await sleep(pollMs);
  }

  throw new HttpError(
    400,
    `Meta video ${videoId} is still processing after ${Math.round(timeoutMs / 1000)} seconds. Try publishing again in a few minutes.`
  );
}

async function uploadImage({ token, adAccountId, file }) {
  const parsed = parseDataUrlFile(file, 'Image', {
    allowedMimeTypePrefixes: ['image/'],
  });
  const formData = new FormData();
  formData.set('filename', new Blob([parsed.buffer], { type: parsed.mimeType }), parsed.name);

  const payload = await postToMeta({
    token,
    path: `${adAccountId}/adimages`,
    formData,
  });

  const imageEntry = Object.values(payload.images || {})[0];
  if (!imageEntry?.hash) {
    throw new HttpError(400, 'Meta did not return an image hash');
  }

  return {
    hash: imageEntry.hash,
    url: imageEntry.url || null,
  };
}

async function uploadVideo({ token, adAccountId, file }) {
  const parsed = parseDataUrlFile(file, 'Video', {
    allowedMimeTypePrefixes: ['video/'],
  });
  const formData = new FormData();
  formData.set('source', new Blob([parsed.buffer], { type: parsed.mimeType }), parsed.name);

  const payload = await postToMeta({
    token,
    path: `${adAccountId}/advideos`,
    formData,
    videoHost: true,
  });

  if (!payload.id) {
    throw new HttpError(400, 'Meta did not return a video id');
  }

  return {
    id: String(payload.id),
  };
}

function getBudgetMultiplier(currency) {
  return ZERO_DECIMAL_CURRENCIES.has(String(currency || '').toUpperCase()) ? 1 : 100;
}

function toMetaBudget(value, currency, label = 'Daily budget') {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new HttpError(400, `${label} must be a positive number`);
  }

  return String(Math.round(numericValue * getBudgetMultiplier(currency)));
}

function normalizeOptionalScheduleTime(value, label) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return '';
  }

  const timezoneMatch = normalizedValue.match(/(Z|[+-]\d{2}:?\d{2})$/i);
  const localDateTime = normalizedValue
    .replace(/(Z|[+-]\d{2}:?\d{2})$/i, '')
    .replace(/\.\d+$/, '');
  const withSeconds = localDateTime.length === 16 ? `${localDateTime}:00` : localDateTime;
  const parseCandidate = timezoneMatch
    ? normalizedValue.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
    : `${withSeconds}${INDONESIA_UTC_OFFSET_ISO}`;
  const date = new Date(parseCandidate);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${label} must be a valid date and time`);
  }

  if (!timezoneMatch) {
    return `${withSeconds}${INDONESIA_UTC_OFFSET_COMPACT}`;
  }

  const timezoneSuffix =
    timezoneMatch[1].toUpperCase() === 'Z'
      ? '+0000'
      : timezoneMatch[1].replace(':', '');

  return `${withSeconds}${timezoneSuffix}`;
}

function parseNormalizedScheduleDate(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return null;
  }

  return new Date(normalizedValue.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
}

function validateScheduleWindow({ scheduleStart, scheduleEnd }) {
  if ((scheduleStart && !scheduleEnd) || (!scheduleStart && scheduleEnd)) {
    throw new HttpError(400, 'Schedule start and schedule end must both be set, or both left empty');
  }

  const start = parseNormalizedScheduleDate(scheduleStart);
  const end = parseNormalizedScheduleDate(scheduleEnd);

  if (scheduleStart && (!start || Number.isNaN(start.getTime()))) {
    throw new HttpError(400, 'Schedule start must be a valid date and time');
  }

  if (scheduleEnd && (!end || Number.isNaN(end.getTime()))) {
    throw new HttpError(400, 'Schedule end must be a valid date and time');
  }

  const minimumScheduleStart = new Date(Date.now() + SCHEDULE_MIN_LEAD_MINUTES * 60 * 1000);
  if (start && start < minimumScheduleStart) {
    throw new HttpError(400, `Schedule start must be at least ${SCHEDULE_MIN_LEAD_MINUTES} minutes ahead in ${INDONESIA_TIME_ZONE_LABEL}`);
  }

  if (start && end && end <= start) {
    throw new HttpError(400, 'Schedule end must be after schedule start');
  }

  if (end && end <= new Date()) {
    throw new HttpError(400, `Schedule end must be in the future using ${INDONESIA_TIME_ZONE_LABEL}`);
  }
}

function ensurePublishPayload(payload) {
  const staticDefaults = payload.staticDefaults || {};
  const rawDisplayUrl = normalizeText(payload.displayUrl);
  const countries = sanitizeCountries({
    countries: payload.countries,
    country: payload.country,
  });
  const requestedAdAccountIds = dedupeStrings(payload.selectedAdAccountIds);
  const accountLaunchAdAccountIds = dedupeStrings((payload.accountLaunches || []).map((accountLaunch) => accountLaunch?.adAccountId));
  const cleaned = {
    templateId: normalizeText(payload.templateId),
    launchLabel: normalizeText(payload.launchLabel),
    publishSessionId: normalizePublishSessionId(payload.publishSessionId),
    bulkId: normalizeText(payload.bulkId || payload.publishSessionId),
    bulkLabel: normalizeText(payload.bulkLabel || payload.publishTitle),
    bulkSource: normalizeText(payload.bulkSource || payload.publishSource),
    brandId: normalizeText(payload.brandId),
    brandName: normalizeText(payload.brandName),
    tokenId: normalizeText(payload.tokenId),
    country: countries[0] || '',
    countries,
    countryLabel: normalizeText(payload.countryLabel),
    objective: normalizeText(payload.objective),
    dailyBudget: normalizeText(payload.dailyBudget),
    selectedAdAccountIds: dedupeStrings([...requestedAdAccountIds, ...accountLaunchAdAccountIds]),
    pageId: normalizeText(payload.pageId),
    pixelId: normalizeText(payload.pixelId),
    websiteEvent: normalizeText(payload.websiteEvent).toUpperCase(),
    headline: normalizeText(payload.headline),
    primaryText: normalizeText(payload.primaryText),
    description: normalizeText(payload.description),
    websiteUrl: normalizeDestinationUrl(payload.websiteUrl),
    displayUrl: normalizeDisplayUrl(payload.displayUrl),
    urlParameters: normalizeUrlParameters(payload.urlParameters),
    scheduleStart: normalizeOptionalScheduleTime(payload.scheduleStart, 'Schedule start'),
    scheduleEnd: normalizeOptionalScheduleTime(payload.scheduleEnd, 'Schedule end'),
    callToAction: normalizeText(payload.callToAction),
    selectedAdAccounts: Array.isArray(payload.selectedAdAccounts)
      ? payload.selectedAdAccounts
          .map((account) => ({
            id: normalizeText(account?.id),
            name: normalizeText(account?.name),
            accountId: normalizeText(account?.accountId),
            currency: normalizeText(account?.currency),
          }))
          .filter((account) => account.id)
      : [],
    pageName: normalizeText(payload.pageName),
    pixelName: normalizeText(payload.pixelName),
    staticDefaults: sanitizeStaticDefaults(staticDefaults),
    media: sanitizeTemplateAssetInput(payload.media),
    thumbnail: sanitizeTemplateAssetInput(payload.thumbnail),
    mediaAssetId: normalizeText(payload.mediaAssetId),
    thumbnailAssetId: normalizeText(payload.thumbnailAssetId),
  };

  if (!cleaned.launchLabel) {
    throw new HttpError(400, 'Launch name is required');
  }

  if (!cleaned.tokenId) {
    throw new HttpError(400, 'Source token is required');
  }

  if (!SUPPORTED_OBJECTIVES[cleaned.objective]) {
    throw new HttpError(400, 'Unsupported campaign objective');
  }

  cleaned.websiteEvent = resolveWebsiteEvent({
    objective: cleaned.objective,
    websiteEvent: cleaned.websiteEvent,
  });

  if (!cleaned.countries.length) {
    throw new HttpError(400, 'Select at least one country');
  }

  if (!cleaned.selectedAdAccountIds.length) {
    throw new HttpError(400, 'Select at least one ad account');
  }

  if (!cleaned.pageId) {
    throw new HttpError(400, 'Page is required');
  }

  if (SUPPORTED_OBJECTIVES[cleaned.objective].requiresPixel && !cleaned.pixelId) {
    throw new HttpError(400, 'Pixel is required for the selected objective');
  }

  if (!cleaned.headline) {
    throw new HttpError(400, 'Headline is required');
  }

  if (!cleaned.primaryText) {
    throw new HttpError(400, 'Primary text is required');
  }

  if (!cleaned.websiteUrl) {
    throw new HttpError(400, 'Destination URL must be a valid http or https URL');
  }

  if (rawDisplayUrl && !cleaned.displayUrl) {
    throw new HttpError(400, 'Display URL must be a valid domain or http/https URL, for example example.com or https://example.com');
  }

  const urlParameterError = getUrlParameterValidationError(cleaned.urlParameters);
  if (urlParameterError) {
    throw new HttpError(400, urlParameterError);
  }

  validateScheduleWindow(cleaned);

  if (!cleaned.callToAction) {
    throw new HttpError(400, 'Call to action is required');
  }

  return cleaned;
}

function buildNames({ launchLabel, countryLabel, adAccountName, pageName, index }) {
  return {
    campaignName: [launchLabel, countryLabel, `Campaign ${index + 1}`].filter(Boolean).join(' | '),
    adSetName: [launchLabel, adAccountName, 'Ad Set'].filter(Boolean).join(' | '),
    adName: [launchLabel, pageName || 'Ad', `Creative ${index + 1}`].filter(Boolean).join(' | '),
  };
}

function createPublishProgressReporter({ onProgress, totalSteps }) {
  let completedSteps = 0;
  const startedAt = Date.now();

  const getProgress = () => {
    const elapsedSeconds = Math.max(Math.round((Date.now() - startedAt) / 1000), 0);
    const averageStepSeconds = completedSteps > 0 ? elapsedSeconds / completedSteps : null;
    const remainingSteps = Math.max(totalSteps - completedSteps, 0);

    return {
      completed: completedSteps,
      total: totalSteps,
      percent: totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0,
      elapsedSeconds,
      etaSeconds: averageStepSeconds === null ? null : Math.max(Math.round(remainingSteps * averageStepSeconds), 0),
    };
  };

  const emit = (event) => {
    if (typeof onProgress !== 'function') {
      return;
    }

    onProgress({
      type: 'progress',
      timestamp: new Date().toISOString(),
      progress: getProgress(),
      ...event,
    });
  };

  return {
    getProgress,
    complete(event) {
      completedSteps += 1;
      emit({
        status: 'completed',
        ...event,
      });
    },
    fail(event) {
      emit({
        status: 'failed',
        ...event,
      });
    },
    info(event) {
      emit(event);
    },
  };
}

function getPublishStepCountPerAccount(media) {
  return String(media?.type || '').startsWith('video/') ? 6 : 5;
}

async function createCampaign({ token, adAccountId, name, objective, dailyBudget, currency, staticDefaults }) {
  const specialAdCategories = getSpecialAdCategoriesValue(staticDefaults.specialAdCategories);
  const campaignBudget = usesCampaignBudget(staticDefaults);
  const bidStrategy = resolveBidStrategy(staticDefaults.bidStrategy);
  const params = {
    name,
    objective,
    status: resolveCampaignStatus(staticDefaults.campaignStatus),
    buying_type: resolveBuyingType(staticDefaults.buyingType),
    special_ad_categories: specialAdCategories,
    special_ad_category_country: specialAdCategories.length ? staticDefaults.countries : undefined,
  };

  if (campaignBudget) {
    params.daily_budget = toMetaBudget(dailyBudget, currency);
    params.bid_strategy = bidStrategy;
  } else {
    params.is_adset_budget_sharing_enabled = false;
  }

  return postToMeta({
    token,
    path: `${adAccountId}/campaigns`,
    params,
  });
}

async function createAdSet({
  token,
  adAccountId,
  campaignId,
  name,
  objective,
  dailyBudget,
  currency,
  countries,
  scheduleStart,
  scheduleEnd,
  pageId,
  pixelId,
  websiteEvent,
  staticDefaults,
  hasVideoCreative = false,
}) {
  const settings = SUPPORTED_OBJECTIVES[objective];
  const ageMin = Number.parseInt(staticDefaults.audienceAgeMin, 10);
  const ageMax = Number.parseInt(staticDefaults.audienceAgeMax, 10);
  const isSpecialAdCategory = isSpecialAdCategoryCampaign(staticDefaults.specialAdCategories);
  const campaignBudget = usesCampaignBudget(staticDefaults);
  const bidStrategy = resolveBidStrategy(staticDefaults.bidStrategy);
  const attributionSpec = buildAttributionSpec(staticDefaults, objective, hasVideoCreative);
  const targeting = {
    geo_locations: {
      countries,
    },
    targeting_automation: {
      advantage_audience: 0,
    },
  };

  if (!isSpecialAdCategory) {
    targeting.age_min = Number.isFinite(ageMin) ? ageMin : 21;
    targeting.age_max = Number.isFinite(ageMax) ? ageMax : 65;

    if ((staticDefaults.genderTargeting || DEFAULT_STATIC_DEFAULTS.genderTargeting) === 'MALE') {
      targeting.genders = [1];
    }

    if ((staticDefaults.genderTargeting || DEFAULT_STATIC_DEFAULTS.genderTargeting) === 'FEMALE') {
      targeting.genders = [2];
    }
  }

  const params = {
    name,
    campaign_id: campaignId,
    billing_event: resolveBillingEvent({
      objective,
      billingEvent: staticDefaults.billingEvent,
    }),
    optimization_goal: settings.optimizationGoal,
    status: resolveCampaignStatus(staticDefaults.campaignStatus),
    targeting,
    is_dynamic_creative: resolveDynamicCreative(staticDefaults.dynamicCreative),
  };

  if (attributionSpec) {
    params.attribution_spec = attributionSpec;
  }

  if (!campaignBudget) {
    params.daily_budget = toMetaBudget(dailyBudget, currency);
    params.bid_strategy = bidStrategy;
  }

  if (bidStrategyRequiresAmount(bidStrategy)) {
    params.bid_amount = toMetaBudget(staticDefaults.bidAmount, currency, 'Bid amount');
  }

  if (scheduleStart) {
    params.start_time = scheduleStart;
  }

  if (scheduleEnd) {
    params.end_time = scheduleEnd;
  }

  const promotedObject = settings.buildPromotedObject({ pageId, pixelId, websiteEvent });
  if (promotedObject) {
    params.promoted_object = promotedObject;
  }

  if (settings.destinationType) {
    params.destination_type = settings.destinationType;
  }

  try {
    return await postToMeta({
      token,
      path: `${adAccountId}/adsets`,
      params,
    });
  } catch (error) {
    if (!params.attribution_spec || !isAttributionWindowMetaError(error)) {
      throw error;
    }

    const fallbackAttributionSpec = buildFallbackAttributionSpecFromMetaError(error, params.attribution_spec);
    const fallbackParams = {
      ...params,
    };

    if (fallbackAttributionSpec) {
      fallbackParams.attribution_spec = fallbackAttributionSpec;
    } else {
      const attributionSpecWithoutEngagedView = params.attribution_spec.filter(
        (spec) => !hasEngagedViewAttribution([spec])
      );

      if (attributionSpecWithoutEngagedView.length !== params.attribution_spec.length) {
        fallbackParams.attribution_spec = attributionSpecWithoutEngagedView;
      } else {
        delete fallbackParams.attribution_spec;
      }
    }

    return postToMeta({
      token,
      path: `${adAccountId}/adsets`,
      params: fallbackParams,
    });
  }
}

function buildDynamicAssetFeedSpec({
  websiteUrl,
  displayUrl,
  primaryText,
  headline,
  description,
  callToAction,
  uploadedImage = null,
  uploadedVideo = null,
  uploadedThumbnail = null,
}) {
  const linkUrl = {
    website_url: websiteUrl,
  };

  if (displayUrl) {
    linkUrl.display_url = displayUrl;
  }

  const assetFeedSpec = {
    ad_formats: [uploadedVideo ? 'SINGLE_VIDEO' : 'SINGLE_IMAGE'],
    bodies: [{ text: primaryText }],
    titles: [{ text: headline }],
    link_urls: [linkUrl],
    call_to_action_types: [callToAction],
    optimization_type: 'REGULAR',
  };

  if (description) {
    assetFeedSpec.descriptions = [{ text: description }];
  }

  if (uploadedVideo) {
    assetFeedSpec.videos = [
      {
        video_id: uploadedVideo.id,
        thumbnail_hash: uploadedThumbnail?.hash,
      },
    ];
  } else {
    assetFeedSpec.images = [
      {
        hash: uploadedImage.hash,
      },
    ];
  }

  return assetFeedSpec;
}

function buildCreativeEnhancementOptOutSpec({ isVideo }) {
  const optOut = {
    enroll_status: 'OPT_OUT',
  };
  const featureKeys = ['IMAGE_ANIMATION', 'PROFILE_CARD', 'TEXT_OVERLAY_TRANSLATION'];

  if (isVideo) {
    featureKeys.push('IG_VIDEO_NATIVE_SUBTITLE');
  }

  return {
    degrees_of_freedom_spec: {
      creative_features_spec: Object.fromEntries(featureKeys.map((featureKey) => [featureKey, optOut])),
    },
    contextual_multi_ads: optOut,
  };
}

function hasCreativeEnhancementParams(params = {}) {
  return Boolean(params.degrees_of_freedom_spec || params.contextual_multi_ads);
}

function stripCreativeEnhancementParams(params = {}) {
  const nextParams = {
    ...params,
  };

  delete nextParams.degrees_of_freedom_spec;
  delete nextParams.contextual_multi_ads;

  return nextParams;
}

function hasDisplayUrlInCreativeParams(params = {}) {
  return Boolean(
    params.asset_feed_spec?.link_urls?.some((linkUrl) => linkUrl?.display_url) ||
      params.object_story_spec?.link_data?.caption
  );
}

function stripDisplayUrlFromCreativeParams(params = {}) {
  const nextParams = {
    ...params,
  };

  if (nextParams.asset_feed_spec?.link_urls) {
    nextParams.asset_feed_spec = {
      ...nextParams.asset_feed_spec,
      link_urls: nextParams.asset_feed_spec.link_urls.map((linkUrl) => {
        const nextLinkUrl = {
          ...linkUrl,
        };
        delete nextLinkUrl.display_url;
        return nextLinkUrl;
      }),
    };
  }

  if (nextParams.object_story_spec?.link_data?.caption) {
    const nextLinkData = {
      ...nextParams.object_story_spec.link_data,
    };
    delete nextLinkData.caption;

    nextParams.object_story_spec = {
      ...nextParams.object_story_spec,
      link_data: nextLinkData,
    };
  }

  return nextParams;
}

function isDisplayUrlMetaError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('display url') || message.includes('display_url') || message.includes('caption');
}

function isCreativeEnhancementMetaError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('degrees_of_freedom_spec') ||
    message.includes('creative_features_spec') ||
    message.includes('standard enhancements') ||
    message.includes('contextual_multi_ads')
  );
}

async function postCreativeToMeta({ token, adAccountId, params }) {
  try {
    return await postToMeta({
      token,
      path: `${adAccountId}/adcreatives`,
      params,
    });
  } catch (error) {
    if (hasCreativeEnhancementParams(params) && isCreativeEnhancementMetaError(error)) {
      return postToMeta({
        token,
        path: `${adAccountId}/adcreatives`,
        params: stripCreativeEnhancementParams(params),
      });
    }

    if (!hasDisplayUrlInCreativeParams(params) || !isDisplayUrlMetaError(error)) {
      throw error;
    }

    return postToMeta({
      token,
      path: `${adAccountId}/adcreatives`,
      params: stripDisplayUrlFromCreativeParams(params),
    });
  }
}

async function createAdCreative({
  token,
  adAccountId,
  name,
  pageId,
  websiteUrl,
  displayUrl,
  urlParameters,
  primaryText,
  headline,
  description,
  callToAction,
  media,
  thumbnail,
  staticDefaults,
  progress,
  progressContext,
}) {
  const dynamicCreative = resolveDynamicCreative(staticDefaults.dynamicCreative);

  if (String(media.type || '').startsWith('video/')) {
    const uploadedVideo = await runPublishStep(
      'Video upload',
      () =>
        uploadVideo({
          token,
          adAccountId,
          file: media,
        }),
      progress,
      progressContext,
      'video-upload'
    );

    const uploadedThumbnail = thumbnail
      ? await runPublishStep(
          'Thumbnail upload',
          () =>
            uploadImage({
              token,
              adAccountId,
              file: thumbnail,
            }),
          progress,
          progressContext,
          'thumbnail-upload'
        )
      : null;

    await waitForMetaVideoReady({
      token,
      videoId: uploadedVideo.id,
      progress,
      progressContext,
    });

    return runPublishStep(
      'Creative creation',
      () =>
        postCreativeToMeta({
          token,
          adAccountId,
          params: dynamicCreative
            ? {
                name,
                url_tags: urlParameters || undefined,
                ...buildCreativeEnhancementOptOutSpec({ isVideo: true }),
                object_story_spec: {
                  page_id: pageId,
                },
                asset_feed_spec: buildDynamicAssetFeedSpec({
                  websiteUrl,
                  displayUrl,
                  primaryText,
                  headline,
                  description,
                  callToAction,
                  uploadedVideo,
                  uploadedThumbnail,
                }),
              }
            : {
                name,
                url_tags: urlParameters || undefined,
                ...buildCreativeEnhancementOptOutSpec({ isVideo: true }),
                object_story_spec: {
                  page_id: pageId,
                  video_data: {
                    video_id: uploadedVideo.id,
                    title: headline,
                    message: primaryText,
                    link_description: description || undefined,
                    image_hash: uploadedThumbnail?.hash,
                    call_to_action: {
                      type: callToAction,
                      value: {
                        link: websiteUrl,
                      },
                    },
                  },
                },
              },
        }),
      progress,
      progressContext,
      'creative'
    );
  }

  const uploadedImage = await runPublishStep(
    'Image upload',
    () =>
      uploadImage({
        token,
        adAccountId,
        file: media,
      }),
    progress,
    progressContext,
    'image-upload'
  );

  return runPublishStep(
      'Creative creation',
      () =>
        postCreativeToMeta({
          token,
          adAccountId,
          params: dynamicCreative
            ? {
                name,
                url_tags: urlParameters || undefined,
                ...buildCreativeEnhancementOptOutSpec({ isVideo: false }),
                object_story_spec: {
                  page_id: pageId,
                },
                asset_feed_spec: buildDynamicAssetFeedSpec({
                  websiteUrl,
                  displayUrl,
                  primaryText,
                  headline,
                  description,
                  callToAction,
                  uploadedImage,
                }),
              }
            : {
                name,
                url_tags: urlParameters || undefined,
                ...buildCreativeEnhancementOptOutSpec({ isVideo: false }),
                object_story_spec: {
                  page_id: pageId,
                  link_data: {
                    link: websiteUrl,
                    caption: displayUrl || undefined,
                    message: primaryText,
                    name: headline,
                    description: description || undefined,
                    image_hash: uploadedImage.hash,
                    call_to_action: {
                      type: callToAction,
                      value: {
                        link: websiteUrl,
                      },
                    },
                  },
                },
              },
        }),
    progress,
    progressContext,
    'creative'
  );
}

async function createAd({ token, adAccountId, adSetId, creativeId, name, staticDefaults }) {
  return postToMeta({
    token,
    path: `${adAccountId}/ads`,
    params: {
      name,
      adset_id: adSetId,
      status: resolveCampaignStatus(staticDefaults.campaignStatus),
      creative: {
        creative_id: creativeId,
      },
    },
  });
}

async function markTemplatePublished(templateId, actor) {
  if (!templateId) {
    return;
  }

  const template = await LaunchTemplate.findOne({
    _id: templateId,
    ...templateAccessFilter(actor),
  });

  if (!template) {
    return;
  }

  template.lastPublishedAt = new Date();
  await template.save();
}

function ensureCreativeAssetsArePublishable({ media, thumbnail }) {
  validateAssetMimeType({
    mimeType: media?.type,
    label: 'Creative',
    allowedPrefixes: ['image/', 'video/'],
  });

  if (thumbnail) {
    validateAssetMimeType({
      mimeType: thumbnail.type,
      label: 'Thumbnail',
      allowedPrefixes: ['image/'],
    });
  }
}

async function runPublishStep(stepLabel, operation, progress = null, progressContext = {}, step = '') {
  await throwIfPublishSessionForceStopped(progressContext.sessionId);

  progress?.info({
    ...progressContext,
    step,
    status: 'active',
    message: `${progressContext.accountLabel || 'Account'}: ${stepLabel}`,
  });

  try {
    const result = await operation();
    await throwIfPublishSessionForceStopped(progressContext.sessionId);
    progress?.complete({
      ...progressContext,
      step,
      message: `${progressContext.accountLabel || 'Account'}: ${stepLabel} complete`,
    });
    return result;
  } catch (error) {
    if (isPublishForceStopError(error)) {
      throw error;
    }

    progress?.fail({
      ...progressContext,
      step,
      error: error.message,
      message: `${progressContext.accountLabel || 'Account'}: ${stepLabel} failed`,
    });
    throw new HttpError(error.statusCode || 400, `${stepLabel} failed. ${error.message}`, {
      metaError: error.metaError || null,
      publishQueueable: Boolean(error.publishQueueable),
      retryAfterSeconds: error.retryAfterSeconds || null,
    });
  }
}

async function getTemplateAssetForActor({ templateId, assetKind, actor }) {
  if (!['media', 'thumbnail'].includes(assetKind)) {
    throw new HttpError(404, 'Template asset not found');
  }

  const template = await getTemplateForActor(templateId, actor);
  const asset = assetKind === 'thumbnail' ? template.snapshot?.thumbnail : template.snapshot?.media;
  const storedAsset = buildStoredAssetResponse(asset, TEMPLATE_ASSET_DIR);

  if (!storedAsset) {
    throw new HttpError(404, 'Template asset not found');
  }

  return storedAsset;
}

async function getMediaAssetForActor({ mediaId, assetKind, actor }) {
  if (!['file', 'thumbnail'].includes(assetKind)) {
    throw new HttpError(404, 'Media library asset not found');
  }

  const mediaAsset = await getMediaAssetDocForActor(mediaId, actor);
  const asset = assetKind === 'thumbnail' ? mediaAsset.thumbnail : mediaAsset.media;
  const storedAsset = buildStoredAssetResponse(asset, MEDIA_LIBRARY_ASSET_DIR);

  if (!storedAsset) {
    throw new HttpError(404, 'Media library asset not found');
  }

  return storedAsset;
}

async function resolvePublishCreativeAssets({ launch, actor }) {
  if (launch.media) {
    return {
      media: launch.media,
      thumbnail: launch.thumbnail,
    };
  }

  if (launch.mediaAssetId) {
    const mediaAsset = await getMediaAssetDocForActor(launch.mediaAssetId, actor);
    const creativeAssets = await readCreativeAssetsFromMediaAsset(mediaAsset);

    if (launch.thumbnailAssetId) {
      const thumbnailAsset = await getMediaAssetDocForActor(launch.thumbnailAssetId, actor);
      creativeAssets.thumbnail = await readThumbnailFromMediaLibraryAsset(thumbnailAsset);
    }

    return creativeAssets;
  }

  if (!launch.templateId) {
    throw new HttpError(400, 'Upload an image or video before publishing');
  }

  const template = await getTemplateForActor(launch.templateId, actor);
  const media = await readStoredTemplateAsset(template.snapshot?.media);
  let thumbnail = await readStoredTemplateAsset(template.snapshot?.thumbnail);

  if (!media) {
    throw new HttpError(400, 'The selected template does not have a saved creative asset');
  }

  if (launch.thumbnailAssetId) {
    const thumbnailAsset = await getMediaAssetDocForActor(launch.thumbnailAssetId, actor);
    thumbnail = await readThumbnailFromMediaLibraryAsset(thumbnailAsset);
  }

  return {
    media,
    thumbnail,
  };
}

async function readCreativeAssetsFromMediaAsset(mediaAsset) {
  const media = await readStoredMediaLibraryAsset(mediaAsset?.media);
  const thumbnail = await readStoredMediaLibraryAsset(mediaAsset?.thumbnail);

  if (!media) {
    throw new HttpError(400, `Media library asset "${mediaAsset?.name || 'selected'}" is missing its saved file`);
  }

  return {
    media,
    thumbnail,
  };
}

async function readThumbnailFromMediaLibraryAsset(mediaAsset) {
  if (mediaAsset?.mediaType !== ADS_MEDIA_TYPES.IMAGE) {
    throw new HttpError(400, `Thumbnail asset "${mediaAsset?.name || 'selected'}" must be an image from the media library`);
  }

  const thumbnail = await readStoredMediaLibraryAsset(mediaAsset.media);

  if (!thumbnail) {
    throw new HttpError(400, `Thumbnail asset "${mediaAsset?.name || 'selected'}" is missing its saved file`);
  }

  validateAssetMimeType({
    mimeType: thumbnail.type,
    label: 'Thumbnail',
    allowedPrefixes: ['image/'],
  });

  return thumbnail;
}

function sanitizeAccountLaunches(input = []) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => ({
      launchItemId: normalizeText(item?.launchItemId) || normalizeText(item?.assignmentId) || '',
      adAccountId: normalizeText(item?.adAccountId),
      campaignTemplateId: normalizeText(item?.campaignTemplateId),
      mediaTemplateId: normalizeText(item?.mediaTemplateId),
      mediaAssetId: normalizeText(item?.mediaAssetId),
      thumbnailAssetId: normalizeText(item?.thumbnailAssetId),
      pageId: normalizeText(item?.pageId),
      pageName: normalizeText(item?.pageName),
      pixelId: normalizeText(item?.pixelId),
      pixelName: normalizeText(item?.pixelName),
    }))
    .filter((item) => item.adAccountId && (item.campaignTemplateId || item.mediaTemplateId || item.mediaAssetId))
    .map((item, index) => ({
      ...item,
      launchItemId: item.launchItemId || getAccountLaunchItemId(item, index),
    }));
}

function sanitizeResumeStates(input = {}) {
  if (!input || typeof input !== 'object') {
    return new Map();
  }

  return new Map(
    Object.entries(input)
      .map(([adAccountId, state]) => [
        normalizeText(state?.launchItemId) || normalizeText(state?.adAccountId) || normalizeText(adAccountId),
        {
          launchItemId: normalizeText(state?.launchItemId),
          adAccountId: normalizeText(state?.adAccountId) || normalizeText(adAccountId),
          campaignId: normalizeText(state?.campaignId),
          adSetId: normalizeText(state?.adSetId),
          creativeId: normalizeText(state?.creativeId),
          adId: normalizeText(state?.adId),
        },
      ])
      .filter(([adAccountId, state]) => adAccountId && (state.campaignId || state.adSetId || state.creativeId || state.adId))
  );
}

function getResumeStateForAccount(resumeStateMap, adAccountId) {
  const normalizedAdAccountId = normalizeText(adAccountId);

  return (
    resumeStateMap.get(normalizedAdAccountId) ||
    resumeStateMap.get(normalizedAdAccountId.replace(/^act_/, '')) ||
    resumeStateMap.get(`act_${normalizedAdAccountId.replace(/^act_/, '')}`) ||
    {}
  );
}

function getResumeStateForPublishItem(resumeStateMap, publishItem) {
  const launchItemId = normalizeText(publishItem?.launchItemId);

  if (launchItemId && resumeStateMap.has(launchItemId)) {
    return resumeStateMap.get(launchItemId);
  }

  return getResumeStateForAccount(resumeStateMap, publishItem?.adAccountId);
}

function isDeletedMetaStatus(value) {
  return normalizeText(value).toUpperCase() === 'DELETED';
}

function getResumeMetaUnavailableReason(error) {
  const message = normalizeText(error?.message);
  const lowerMessage = message.toLowerCase();
  const missingPatterns = [
    'does not exist',
    'object does not exist',
    'unsupported get request',
    'cannot be loaded',
    'no object found',
    'not found',
    'was deleted',
    'deleted',
  ];

  if (missingPatterns.some((pattern) => lowerMessage.includes(pattern))) {
    return message || 'Meta object is no longer available';
  }

  return '';
}

async function getResumeMetaObject({ token, objectId, fields }) {
  try {
    const payload = await getFromMeta({
      token,
      path: objectId,
      params: {
        fields,
      },
    });

    return {
      available: true,
      payload,
      reason: '',
    };
  } catch (error) {
    const reason = getResumeMetaUnavailableReason(error);

    if (!reason) {
      throw error;
    }

    return {
      available: false,
      payload: null,
      reason,
    };
  }
}

function hasDeletedStatus(payload = {}) {
  return (
    isDeletedMetaStatus(payload.status) ||
    isDeletedMetaStatus(payload.effective_status) ||
    isDeletedMetaStatus(payload.configured_status)
  );
}

async function verifyResumeStateForAccount({ token, resumeState, progress, progressContext }) {
  const nextState = {
    ...resumeState,
  };
  const notices = [];

  if (nextState.campaignId) {
    const campaign = await getResumeMetaObject({
      token,
      objectId: nextState.campaignId,
      fields: 'id,status,effective_status,configured_status',
    });

    if (!campaign.available || hasDeletedStatus(campaign.payload)) {
      const reason = campaign.reason || 'Campaign was deleted in Meta';
      notices.push(`Saved campaign ${nextState.campaignId} cannot be continued (${reason}). Recreating campaign, ad set, creative, and ad.`);
      nextState.campaignId = '';
      nextState.adSetId = '';
      nextState.creativeId = '';
      nextState.adId = '';
    }
  }

  if (nextState.campaignId && nextState.adSetId) {
    const adSet = await getResumeMetaObject({
      token,
      objectId: nextState.adSetId,
      fields: 'id,campaign_id,status,effective_status,configured_status',
    });

    if (!adSet.available || hasDeletedStatus(adSet.payload)) {
      const reason = adSet.reason || 'Ad set was deleted in Meta';
      notices.push(`Saved ad set ${nextState.adSetId} cannot be continued (${reason}). Recreating ad set, creative, and ad.`);
      nextState.adSetId = '';
      nextState.creativeId = '';
      nextState.adId = '';
    } else if (adSet.payload?.campaign_id && adSet.payload.campaign_id !== nextState.campaignId) {
      notices.push(`Saved ad set ${nextState.adSetId} belongs to a different campaign. Recreating ad set, creative, and ad.`);
      nextState.adSetId = '';
      nextState.creativeId = '';
      nextState.adId = '';
    }
  }

  if (nextState.creativeId) {
    const creative = await getResumeMetaObject({
      token,
      objectId: nextState.creativeId,
      fields: 'id,name',
    });

    if (!creative.available) {
      notices.push(`Saved creative ${nextState.creativeId} cannot be continued (${creative.reason}). Recreating creative and ad.`);
      nextState.creativeId = '';
      nextState.adId = '';
    }
  }

  if (nextState.adId) {
    const ad = await getResumeMetaObject({
      token,
      objectId: nextState.adId,
      fields: 'id,adset_id,status,effective_status,configured_status',
    });

    if (!ad.available || hasDeletedStatus(ad.payload)) {
      const reason = ad.reason || 'Ad was deleted in Meta';
      notices.push(`Saved ad ${nextState.adId} cannot be continued (${reason}). Recreating ad only.`);
      nextState.adId = '';
    } else if (nextState.adSetId && ad.payload?.adset_id && ad.payload.adset_id !== nextState.adSetId) {
      notices.push(`Saved ad ${nextState.adId} belongs to a different ad set. Recreating ad only.`);
      nextState.adId = '';
    }
  }

  notices.forEach((message) => {
    progress?.info({
      ...progressContext,
      step: 'resume-check',
      status: 'active',
      message,
    });
  });

  return {
    resumeState: nextState,
    notices,
  };
}

function mergeTemplateConfig(baseLaunch, campaignConfig = {}, mediaConfig = {}, templateNames = {}) {
  const campaignStaticDefaults = campaignConfig.staticDefaults || {};
  const baseStaticDefaults = baseLaunch.staticDefaults || {};
  const campaignCountries = sanitizeCountries({
    countries: campaignConfig.countries,
    country: campaignConfig.country,
  });
  const countries = campaignCountries.length ? campaignCountries : baseLaunch.countries;
  const objective = normalizeText(campaignConfig.objective) || baseLaunch.objective;
  const templateWebsiteEvent = normalizeText(campaignConfig.websiteEvent).toUpperCase();
  const shouldUseBaseWebsiteEvent = !normalizeText(campaignConfig.objective) || objective === baseLaunch.objective;
  const launchLabel =
    normalizeText(templateNames.campaignTemplateName) ||
    normalizeText(campaignConfig.launchLabel) ||
    baseLaunch.launchLabel;

  return {
    ...baseLaunch,
    launchLabel,
    objective,
    dailyBudget: normalizeText(campaignConfig.dailyBudget) || baseLaunch.dailyBudget,
    country: countries[0] || baseLaunch.country,
    countries,
    countryLabel: countries.length ? countries.join(', ') : baseLaunch.countryLabel,
    pageId: normalizeText(campaignConfig.pageId) || normalizeText(mediaConfig.pageId) || baseLaunch.pageId,
    pixelId: normalizeText(campaignConfig.pixelId) || normalizeText(mediaConfig.pixelId) || baseLaunch.pixelId,
    websiteEvent: templateWebsiteEvent || (shouldUseBaseWebsiteEvent ? baseLaunch.websiteEvent : ''),
    scheduleStart: normalizeText(campaignConfig.scheduleStart) || baseLaunch.scheduleStart,
    scheduleEnd: normalizeText(campaignConfig.scheduleEnd) || baseLaunch.scheduleEnd,
    headline: normalizeText(mediaConfig.headline) || baseLaunch.headline,
    primaryText: normalizeText(mediaConfig.primaryText) || baseLaunch.primaryText,
    description:
      normalizeText(mediaConfig.description) ||
      normalizeText(campaignConfig.description) ||
      baseLaunch.description,
    websiteUrl: normalizeText(mediaConfig.websiteUrl) || normalizeText(campaignConfig.websiteUrl) || baseLaunch.websiteUrl,
    displayUrl: normalizeText(mediaConfig.displayUrl) || normalizeText(campaignConfig.displayUrl) || baseLaunch.displayUrl,
    urlParameters:
      normalizeText(mediaConfig.urlParameters) ||
      normalizeText(campaignConfig.urlParameters) ||
      baseLaunch.urlParameters,
    callToAction: normalizeText(mediaConfig.callToAction) || baseLaunch.callToAction,
    staticDefaults: {
      ...mergeStaticDefaultsWithAttribution(baseStaticDefaults, campaignStaticDefaults),
      country: countries[0] || baseLaunch.country,
      countries,
    },
  };
}

async function readCreativeAssetsFromTemplate(template) {
  const media = await readStoredTemplateAsset(template?.snapshot?.media);
  const thumbnail = await readStoredTemplateAsset(template?.snapshot?.thumbnail);

  if (!media) {
    throw new HttpError(400, `Media template "${template?.name || 'selected'}" does not have a saved creative asset`);
  }

  return {
    media,
    thumbnail,
  };
}

async function resolveAccountLaunchFromTemplates({ baseLaunch, accountLaunch, selectedAccount, actor }) {
  let campaignTemplate = null;
  let mediaTemplate = null;
  let mediaAsset = null;
  let thumbnailAsset = null;

  if (accountLaunch?.campaignTemplateId) {
    campaignTemplate = await getTemplateForActor(accountLaunch.campaignTemplateId, actor);
  }

  if (accountLaunch?.mediaTemplateId) {
    mediaTemplate = await getTemplateForActor(accountLaunch.mediaTemplateId, actor);
  }

  if (accountLaunch?.mediaAssetId) {
    mediaAsset = await getMediaAssetDocForActor(accountLaunch.mediaAssetId, actor);
  }

  if (accountLaunch?.thumbnailAssetId) {
    thumbnailAsset = await getMediaAssetDocForActor(accountLaunch.thumbnailAssetId, actor);
  }

  const templateLaunch = mergeTemplateConfig(
    baseLaunch,
    campaignTemplate?.config?.toObject?.() || campaignTemplate?.config || {},
    mediaTemplate?.config?.toObject?.() || mediaTemplate?.config || {},
    {
      campaignTemplateName: campaignTemplate?.name,
    }
  );
  const accountLaunchOverrides = {
    ...templateLaunch,
    pageId: accountLaunch?.pageId || templateLaunch.pageId,
    pageName: accountLaunch?.pageName || templateLaunch.pageName,
    pixelId: accountLaunch?.pixelId || templateLaunch.pixelId,
    pixelName: accountLaunch?.pixelName || templateLaunch.pixelName,
  };

  const effectiveLaunch = ensurePublishPayload({
    ...accountLaunchOverrides,
    selectedAdAccountIds: [selectedAccount.id],
    selectedAdAccounts: [selectedAccount],
  });
  effectiveLaunch.staticDefaults = {
    ...effectiveLaunch.staticDefaults,
    country: effectiveLaunch.country,
    countries: effectiveLaunch.countries,
  };

  const creativeAssets = mediaAsset
    ? await readCreativeAssetsFromMediaAsset(mediaAsset)
    : mediaTemplate
      ? await readCreativeAssetsFromTemplate(mediaTemplate)
      : await resolvePublishCreativeAssets({
          launch: effectiveLaunch,
          actor,
        });

  if (mediaAsset && String(creativeAssets.media?.type || '').startsWith('video/')) {
    if (!thumbnailAsset && !creativeAssets.thumbnail) {
      throw new HttpError(400, `Select a thumbnail image for video media "${mediaAsset.name}"`);
    }

    if (thumbnailAsset) {
      creativeAssets.thumbnail = await readThumbnailFromMediaLibraryAsset(thumbnailAsset);
    }
  }

  return {
    campaignTemplate,
    creativeAssets,
    effectiveLaunch,
    mediaAsset,
    mediaTemplate,
    thumbnailAsset,
  };
}

async function publishLaunchUnlocked({ payload, actor, req, onProgress = null, tokenType = null, publishSessionId = '' }) {
  const sessionId = normalizePublishSessionId(publishSessionId || payload?.publishSessionId);
  let sessionEventChain = Promise.resolve();
  const emitProgress = (event) => {
    const nextEvent = sessionId
      ? {
          sessionId,
          ...event,
        }
      : event;

    onProgress?.(nextEvent);

    if (sessionId) {
      sessionEventChain = sessionEventChain
        .then(() => appendPublishSessionEvent({ sessionId, event: nextEvent }))
        .catch(() => undefined);
    }
  };
  await throwIfPublishSessionForceStopped(sessionId);
  const launch = ensurePublishPayload(payload);
  launch.staticDefaults = {
    ...launch.staticDefaults,
    country: launch.country,
    countries: launch.countries,
  };
  const accountLaunches = sanitizeAccountLaunches(payload.accountLaunches);
  const resumeStateMap = sanitizeResumeStates(payload.resumeState);
  const usesAccountTemplates = accountLaunches.length > 0;
  const baseCreativeAssets = usesAccountTemplates
    ? null
    : await resolvePublishCreativeAssets({
        launch,
        actor,
      });

  if (baseCreativeAssets) {
    ensureCreativeAssetsArePublishable(baseCreativeAssets);

    if (String(baseCreativeAssets.media.type || '').startsWith('video/') && !baseCreativeAssets.thumbnail) {
      throw new HttpError(400, 'Video publishing requires a thumbnail image');
    }
  }

  const token = await tokenService.getActiveTokenWithSecret(launch.tokenId, tokenType);
  const publishIntervalSettings = await settingsService.getPublishIntervalSettings();
  const accountMap = new Map(launch.selectedAdAccounts.map((account) => [account.id, account]));
  const publishItems = usesAccountTemplates
    ? accountLaunches.map((accountLaunch, index) => ({
        launchItemId: getAccountLaunchItemId(accountLaunch, index),
        adAccountId: accountLaunch.adAccountId,
        accountLaunch,
      }))
    : launch.selectedAdAccountIds.map((adAccountId, index) => ({
        launchItemId: `${adAccountId}-${index + 1}`,
        adAccountId,
        accountLaunch: null,
      }));
  const results = [];
  const failed = [];
  let paused = false;
  let stopped = false;
  let pauseResumePayload = null;
  const progress = createPublishProgressReporter({
    onProgress: emitProgress,
    totalSteps: publishItems.length * (usesAccountTemplates ? 6 : getPublishStepCountPerAccount(baseCreativeAssets.media)),
  });

  progress.info({
    step: 'prepare',
    status: 'active',
    message: `Preparing ${publishItems.length} publish item${publishItems.length === 1 ? '' : 's'} across ${launch.selectedAdAccountIds.length} ad account${launch.selectedAdAccountIds.length === 1 ? '' : 's'}`,
    totalAccounts: publishItems.length,
  });

  for (const [index, publishItem] of publishItems.entries()) {
    const { adAccountId } = publishItem;
    const selectedAccount = accountMap.get(adAccountId) || {
      id: adAccountId,
      name: adAccountId,
      currency: '',
    };
    const accountLabel = `Publish ${index + 1}/${publishItems.length} (${selectedAccount.name})`;
    const progressContext = {
      sessionId,
      accountIndex: index + 1,
      totalAccounts: publishItems.length,
      adAccountId,
      adAccountName: selectedAccount.name,
      accountLabel,
      launchItemId: publishItem.launchItemId,
    };
    const accountTemplate = publishItem.accountLaunch;
    let resumeState = getResumeStateForPublishItem(resumeStateMap, publishItem);
    let accountResolved = null;
    let effectiveLaunch = launch;
    let creativeAssets = baseCreativeAssets;
    let resumeNotices = [];
    let names = {};
    let campaign = null;
    let adSet = null;
    let creative = null;
    let ad = null;

    try {
      await throwIfPublishSessionForceStopped(sessionId);

      accountResolved = usesAccountTemplates
        ? await resolveAccountLaunchFromTemplates({
            baseLaunch: launch,
            accountLaunch: accountTemplate,
            selectedAccount,
            actor,
          })
        : {
            creativeAssets: baseCreativeAssets,
            effectiveLaunch: launch,
            campaignTemplate: null,
            mediaTemplate: null,
          };
      effectiveLaunch = accountResolved.effectiveLaunch;
      creativeAssets = accountResolved.creativeAssets;

      ensureCreativeAssetsArePublishable(creativeAssets);

      if (String(creativeAssets.media.type || '').startsWith('video/') && !creativeAssets.thumbnail) {
        throw new HttpError(400, 'Video publishing requires a thumbnail image');
      }

      names = buildNames({
        launchLabel: effectiveLaunch.launchLabel,
        countryLabel: effectiveLaunch.countryLabel || effectiveLaunch.countries.join(', '),
        adAccountName: selectedAccount.name,
        pageName: effectiveLaunch.pageName || effectiveLaunch.pageId,
        index,
      });

      progress.info({
        ...progressContext,
        step: 'account',
        status: 'active',
        message: `${accountLabel}: starting`,
      });
      await throwIfPublishSessionForceStopped(sessionId);

      if (resumeState.campaignId || resumeState.adSetId || resumeState.creativeId || resumeState.adId) {
        const resumeCheck = await verifyResumeStateForAccount({
          token,
          resumeState,
          progress,
          progressContext,
        });
        resumeState = resumeCheck.resumeState;
        resumeNotices = resumeCheck.notices;
      }

      if (resumeState.campaignId) {
        campaign = { id: resumeState.campaignId };
        progress.complete({
          ...progressContext,
          step: 'campaign',
          message: `${accountLabel}: continuing with existing campaign ${resumeState.campaignId}`,
        });
      } else {
        campaign = await runPublishStep('Campaign creation', () =>
          createCampaign({
            token,
            adAccountId,
            name: names.campaignName,
            objective: effectiveLaunch.objective,
            dailyBudget: effectiveLaunch.dailyBudget,
            currency: selectedAccount.currency,
            staticDefaults: effectiveLaunch.staticDefaults,
          }),
          progress,
          progressContext,
          'campaign'
        );
      }

      if (resumeState.adSetId) {
        adSet = { id: resumeState.adSetId };
        progress.complete({
          ...progressContext,
          step: 'ad-set',
          message: `${accountLabel}: continuing with existing ad set ${resumeState.adSetId}`,
        });
      } else {
        adSet = await runPublishStep('Ad set creation', () =>
          createAdSet({
            token,
            adAccountId,
            campaignId: campaign.id,
            name: names.adSetName,
            objective: effectiveLaunch.objective,
            dailyBudget: effectiveLaunch.dailyBudget,
            currency: selectedAccount.currency,
            countries: effectiveLaunch.countries,
            scheduleStart: effectiveLaunch.scheduleStart,
            scheduleEnd: effectiveLaunch.scheduleEnd,
            pageId: effectiveLaunch.pageId,
            pixelId: effectiveLaunch.pixelId,
            websiteEvent: effectiveLaunch.websiteEvent,
            staticDefaults: effectiveLaunch.staticDefaults,
            hasVideoCreative: String(creativeAssets.media.type || '').startsWith('video/'),
          }),
          progress,
          progressContext,
          'ad-set'
        );
      }

      if (resumeState.creativeId) {
        creative = { id: resumeState.creativeId };
        progress.complete({
          ...progressContext,
          step: 'creative',
          message: `${accountLabel}: continuing with existing creative ${resumeState.creativeId}`,
        });
      } else {
        creative = await createAdCreative({
          token,
          adAccountId,
          name: names.adName,
          pageId: effectiveLaunch.pageId,
          websiteUrl: effectiveLaunch.websiteUrl,
          displayUrl: effectiveLaunch.displayUrl,
          urlParameters: effectiveLaunch.urlParameters,
          primaryText: effectiveLaunch.primaryText,
          headline: effectiveLaunch.headline,
          description: effectiveLaunch.description,
          callToAction: effectiveLaunch.callToAction,
          media: creativeAssets.media,
          thumbnail: creativeAssets.thumbnail,
          staticDefaults: effectiveLaunch.staticDefaults,
          progress,
          progressContext,
        });
      }

      if (resumeState.adId) {
        ad = { id: resumeState.adId };
        progress.complete({
          ...progressContext,
          step: 'ad',
          message: `${accountLabel}: continuing with existing ad ${resumeState.adId}`,
        });
      } else {
        ad = await runPublishStep('Ad creation', () =>
          createAd({
            token,
            adAccountId,
            adSetId: adSet.id,
            creativeId: creative.id,
            name: names.adName,
            staticDefaults: effectiveLaunch.staticDefaults,
          }),
          progress,
          progressContext,
          'ad'
        );
      }

      if (String(creativeAssets.media?.type || '').startsWith('video/')) {
        await syncVideoAdSetAttribution({
          token,
          adSetId: adSet.id,
          objective: effectiveLaunch.objective,
          staticDefaults: effectiveLaunch.staticDefaults,
          progress,
          progressContext,
        });
      }

      let historyRecord = null;
      let historyError = '';

      try {
        historyRecord = await adsManageService.recordPublishedCampaign({
          token,
          launch: effectiveLaunch,
          account: selectedAccount,
          names,
          campaign,
          adSet,
          creative,
          ad,
          media: creativeAssets.media,
          thumbnail: creativeAssets.thumbnail,
          accountLaunch: accountTemplate,
          actor,
        });
      } catch (error) {
        historyError = error.message;
        progress.info({
          ...progressContext,
          step: 'history',
          status: 'failed',
          error: error.message,
          message: `${accountLabel}: Meta publish succeeded but local history save failed`,
        });
      }

      results.push({
        launchItemId: publishItem.launchItemId,
        adAccountId,
        adAccountName: selectedAccount.name,
        campaignId: campaign.id,
        adSetId: adSet.id,
        creativeId: creative.id,
        adId: ad.id,
        status: resolveCampaignStatus(effectiveLaunch.staticDefaults.campaignStatus),
        campaignTemplateId: accountResolved.campaignTemplate?._id?.toString?.() || null,
        mediaTemplateId: accountResolved.mediaTemplate?._id?.toString?.() || null,
        mediaAssetId: accountResolved.mediaAsset?._id?.toString?.() || null,
        thumbnailAssetId: accountResolved.thumbnailAsset?._id?.toString?.() || null,
        historyRecordId: historyRecord?.recordId || null,
        historySaved: Boolean(historyRecord),
        historyError,
        resumeNotices,
      });
      progress.info({
        ...progressContext,
        step: 'account',
        status: 'completed',
        message: `${accountLabel}: publish complete`,
      });
    } catch (error) {
      if (isPublishForceStopError(error)) {
        stopped = true;
        progress.info({
          ...progressContext,
          step: 'force-stopped',
          status: 'stopped',
          message: `${accountLabel}: publish force-stopped`,
          progress: {
            ...progress.getProgress(),
            etaSeconds: 0,
          },
        });
        break;
      }

      failed.push({
        launchItemId: publishItem.launchItemId,
        adAccountId,
        adAccountName: selectedAccount.name,
        message: error.message,
      });
      try {
        const failureRecord = await adsManageService.recordFailedLaunch({
          token,
          launch: effectiveLaunch || launch,
          account: selectedAccount,
          names,
          campaign,
          adSet,
          creative,
          ad,
          media: creativeAssets?.media || null,
          thumbnail: creativeAssets?.thumbnail || null,
          accountLaunch: accountTemplate,
          error,
          queue: error.publishQueueable
            ? {
                notify: false,
                reason: error.message,
                retryAfterSeconds: error.retryAfterSeconds,
                tokenType: token.tokenType,
              }
            : null,
          actor,
          req,
        });
        const queueStatus = failureRecord?.publishQueue?.status || 'NONE';
        const queued = ['PENDING', 'BLOCKED', 'RUNNING'].includes(queueStatus);
        if (queued) {
          adsManageService.schedulePublishQueueRun?.(
            failureRecord.publishQueue?.nextAttemptAt
              ? Math.max(new Date(failureRecord.publishQueue.nextAttemptAt).getTime() - Date.now(), 0)
              : 0
          );
        }
        Object.assign(failed[failed.length - 1], {
          historyRecordId: failureRecord?.recordId || null,
          campaignId: failureRecord?.campaignId || null,
          tokenId: failureRecord?.tokenId || token.id,
          canRetry: Boolean(failureRecord?.launch?.retryPayload),
          queued,
          queueStatus,
          nextAttemptAt: failureRecord?.publishQueue?.nextAttemptAt || null,
          retryAfterSeconds: error.retryAfterSeconds || null,
          resumeFromStep: failureRecord?.adId
            ? 'history save'
            : failureRecord?.creativeId
              ? 'ad creation'
              : failureRecord?.adSetId
                ? 'creative creation'
                : failureRecord?.campaignId && !String(failureRecord.campaignId).startsWith('failed_')
                  ? 'ad set creation'
                  : 'campaign creation',
          partialMeta: {
            campaignId: failureRecord?.campaignId && !String(failureRecord.campaignId).startsWith('failed_') ? failureRecord.campaignId : '',
            adSetId: failureRecord?.adSetId || '',
            creativeId: failureRecord?.creativeId || '',
            adId: failureRecord?.adId || '',
          },
        });
      } catch (historyError) {
        failed[failed.length - 1].historyError = historyError.message;
        progress.info({
          ...progressContext,
          step: 'history',
          status: 'failed',
          error: historyError.message,
          message: `${accountLabel}: failed publish history save failed`,
        });
      }
      progress.info({
        ...progressContext,
        step: 'account',
        status: error.publishQueueable ? 'queued' : 'failed',
        error: error.message,
        message: error.publishQueueable ? `${accountLabel}: publish queued after Meta/API block` : `${accountLabel}: publish failed`,
      });
    }

    const remainingPublishItems = publishItems.slice(index + 1);
    const remainingAdAccountIds = dedupeStrings(remainingPublishItems.map((item) => item.adAccountId));
    const remainingAccountLaunches = usesAccountTemplates
      ? remainingPublishItems.map((item) => item.accountLaunch).filter(Boolean)
      : null;
    if (remainingAdAccountIds.length && (await isPublishSessionPauseRequested(sessionId))) {
      paused = true;
      pauseResumePayload = buildRemainingPublishPayload({
        payload,
        remainingAdAccountIds,
        remainingAccountLaunches,
      });
      progress.info({
        ...progressContext,
        step: 'paused',
        status: 'paused',
        message: `Publish paused safely after ${accountLabel}. ${remainingPublishItems.length} publish item${remainingPublishItems.length === 1 ? '' : 's'} left to continue.`,
      });
      break;
    }

    if (remainingPublishItems.length) {
      const nextAccount = accountMap.get(remainingPublishItems[0].adAccountId);
      const intervalResult = await waitBetweenPublishAccounts({
        sessionId,
        settings: publishIntervalSettings,
        progress,
        progressContext,
        nextAccountName: nextAccount?.name || remainingAdAccountIds[0],
      });

      if (intervalResult.paused) {
        paused = true;
        pauseResumePayload = buildRemainingPublishPayload({
          payload,
          remainingAdAccountIds,
          remainingAccountLaunches,
        });
        progress.info({
          ...progressContext,
          step: 'paused',
          status: 'paused',
          message: `Publish paused during publish interval. ${remainingPublishItems.length} publish item${remainingPublishItems.length === 1 ? '' : 's'} left to continue.`,
        });
        break;
      }
    }
  }

  if (results.length) {
    await markTemplatePublished(launch.templateId, actor);
    for (const accountLaunch of accountLaunches) {
      await markTemplatePublished(accountLaunch.campaignTemplateId, actor);
      await markTemplatePublished(accountLaunch.mediaTemplateId, actor);
    }
  }

  await writeActivityLog({
    user: actor,
    action: 'ADS_LAUNCH_PUBLISHED',
    entity: 'AdsLaunch',
    metadata: {
      launchLabel: launch.launchLabel,
      adAccountsRequested: launch.selectedAdAccountIds.length,
      publishItemsRequested: publishItems.length,
      published: results.length,
      failed: failed.length,
      objective: launch.objective,
      websiteEvent: launch.websiteEvent,
      countries: launch.countries,
      accountTemplateAssignments: accountLaunches.length,
    },
    req,
  });

  const queuedCount = failed.filter((item) => item.queued).length;
  const hardFailedCount = failed.length - queuedCount;
  const pausedCount = pauseResumePayload ? getPublishRequestCount(pauseResumePayload) : 0;
  const finalSessionStatus = stopped
    ? PUBLISH_SESSION_STATUSES.FORCE_STOPPED
    : paused
    ? PUBLISH_SESSION_STATUSES.PAUSED
    : hardFailedCount > 0
      ? PUBLISH_SESSION_STATUSES.FAILED
      : queuedCount > 0
        ? PUBLISH_SESSION_STATUSES.QUEUED
        : PUBLISH_SESSION_STATUSES.COMPLETED;
  const publishResult = {
    message:
      stopped
        ? `Publish force-stopped after ${results.length} success${failed.length ? ` and ${failed.length} handled failure${failed.length === 1 ? '' : 's'}` : ''}`
        : paused
        ? `Publish paused after ${results.length} success${failed.length ? ` and ${failed.length} handled failure${failed.length === 1 ? '' : 's'}` : ''}. ${pausedCount} publish item${pausedCount === 1 ? '' : 's'} left to continue`
        : failed.length > 0
        ? queuedCount && !hardFailedCount
          ? `Publish completed with ${results.length} success and ${queuedCount} queued retry`
          : queuedCount
            ? `Publish completed with ${results.length} success, ${hardFailedCount} failure, and ${queuedCount} queued retry`
            : `Publish completed with ${results.length} success and ${hardFailedCount} failure`
        : 'Publish completed successfully',
    results,
    failed,
    summary: {
      requested: publishItems.length,
      publishItemsRequested: publishItems.length,
      published: results.length,
      failed: failed.length,
      queued: queuedCount,
      paused: pausedCount,
      stopped: stopped ? 1 : 0,
    },
    paused,
    stopped,
    canResume: paused,
    resumeCount: pausedCount,
    progress: progress.getProgress(),
  };
  publishResult.progress = buildTerminalPublishProgress({
    status: finalSessionStatus,
    result: publishResult,
  });

  publishResult.telegram = await settingsService.notifyPublishSummary({
    launch,
    result: publishResult,
  });

  await sessionEventChain;
  if (sessionId) {
    await markPublishSessionFinished({
      sessionId,
      status: finalSessionStatus,
      result: publishResult,
      error: stopped
        ? 'Publish force-stopped by user'
        : hardFailedCount > 0
          ? `${hardFailedCount} ad account${hardFailedCount === 1 ? '' : 's'} failed during publish`
          : '',
      resumePayload: pauseResumePayload,
    });
  }

  return publishResult;
}

async function publishLaunch(options) {
  const payload = options?.payload || {};
  const existingSessionId = normalizePublishSessionId(options?.publishSessionId || payload.publishSessionId);
  const lockSessionId = existingSessionId || createPublishSessionId();
  const reservation = reservePublishSessionResources({
    sessionId: lockSessionId,
    payload,
    tokenType: options?.tokenType,
  });

  if (!reservation.acquired) {
    throw new HttpError(409, reservation.conflict?.message || 'Another publish is already using this token or ad account', {
      publishQueueable: true,
      retryAfterSeconds: DEFAULT_QUEUE_RETRY_AFTER_SECONDS,
    });
  }

  try {
    return await publishLaunchUnlocked({
      ...options,
      publishSessionId: existingSessionId,
      payload: {
        ...payload,
        ...(existingSessionId ? { publishSessionId: existingSessionId } : {}),
      },
    });
  } finally {
    if (!reservation.alreadyHeld) {
      releasePublishSessionResources(lockSessionId);
      schedulePublishSessionQueueRun(0);
    }
  }
}

module.exports = {
  clearPublishSessionHistory,
  completeChunkedMediaAsset,
  createMediaAsset,
  createMediaFolder,
  createTemplate,
  deleteMediaAsset,
  deleteMediaFolder,
  deletePublishSession,
  deleteTemplate,
  enqueuePublishLaunch,
  failPublishSession,
  forceStopPublishSession,
  getPublishSession,
  getMediaAssetForActor,
  getTemplateAssetForActor,
  listPublishSessions,
  listMediaAssets,
  listMediaFolders,
  listTemplates,
  markPublishFailureResolved,
  publishLaunch,
  requestPublishSessionPause,
  resumePublishSession,
  runPublishSessionQueue,
  saveMediaUploadChunk,
  schedulePublishSessionQueueRun,
  startPublishSession,
  updateMediaAssetBrand,
  updateTemplate,
};
