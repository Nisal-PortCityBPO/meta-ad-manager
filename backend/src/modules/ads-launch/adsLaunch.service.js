const fs = require('fs');
const path = require('path');
const HttpError = require('../../app/utils/httpError');
const { waitForMetaApiPacing } = require('../../app/utils/metaApiPacing');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const { USER_ROLES } = require('../users/user.model');
const LaunchTemplate = require('./adsLaunch.model');
const { LAUNCH_TEMPLATE_TYPES } = require('./adsLaunch.model');
const AdsLaunchMedia = require('./adsLaunchMedia.model');
const { ADS_MEDIA_TYPES } = require('./adsLaunchMedia.model');
const adsManageService = require('../ads-manage/adsManage.service');
const tokenService = require('../token-management/token.service');

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const GRAPH_VIDEO_API_BASE = `https://graph-video.facebook.com/${META_GRAPH_VERSION}`;
const TEMPLATE_ASSET_DIR = path.resolve(__dirname, '../../../storage/ads-launch-template-assets');
const MEDIA_LIBRARY_ASSET_DIR = path.resolve(__dirname, '../../../storage/ads-launch-media-assets');
const MEDIA_CHUNK_UPLOAD_DIR = path.resolve(__dirname, '../../../storage/ads-launch-media-chunks');
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
});
const SPECIAL_AD_CATEGORY_NONE = 'NONE';

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

function sanitizeTemplateConfig(input = {}) {
  const staticDefaults = input.staticDefaults || {};
  const countries = dedupeStrings(input.countries);
  const fallbackCountry = normalizeText(input.country);
  const normalizedCountries = countries.length ? countries : fallbackCountry ? [fallbackCountry] : [];

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
    scheduleStart: normalizeText(input.scheduleStart),
    scheduleEnd: normalizeText(input.scheduleEnd),
    callToAction: normalizeText(input.callToAction),
    staticDefaults: {
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
    },
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

  if (bidStrategy === 'COST_CAP') {
    throw new HttpError(400, 'Cost cap is not supported by this launcher because no bid amount is configured');
  }

  return DEFAULT_STATIC_DEFAULTS.bidStrategy;
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

function deleteStoredTemplateAsset(asset) {
  if (!asset?.storageKey) {
    return;
  }

  const filePath = path.join(TEMPLATE_ASSET_DIR, asset.storageKey);

  try {
    fs.rmSync(filePath, { force: true });
  } catch (error) {
    // Ignore cleanup failures so template operations still complete.
  }
}

function deleteTemplateStoredAssets(template) {
  deleteStoredTemplateAsset(template?.snapshot?.media);
  deleteStoredTemplateAsset(template?.snapshot?.thumbnail);
}

function persistTemplateAsset({ templateId, asset, assetKind }) {
  const parsed = parseDataUrlFile(asset, assetKind === 'thumbnail' ? 'Thumbnail' : 'Creative', {
    allowedMimeTypePrefixes: assetKind === 'thumbnail' ? ['image/'] : ['image/', 'video/'],
  });
  const extension = getAssetFileExtension(parsed.name, parsed.mimeType);
  const storageKey = `${templateId}-${assetKind}-${Date.now()}${extension}`;
  const filePath = path.join(TEMPLATE_ASSET_DIR, storageKey);

  ensureTemplateAssetDir();
  fs.writeFileSync(filePath, parsed.buffer);

  return {
    name: parsed.name,
    type: parsed.mimeType,
    size: parsed.buffer.length,
    storageKey,
  };
}

function copyMediaLibraryAssetToTemplateAsset({ templateId, asset, assetKind }) {
  const sourcePath = getStoredMediaLibraryAssetPath(asset);

  if (!sourcePath || !asset?.type) {
    throw new HttpError(400, `${assetKind === 'thumbnail' ? 'Thumbnail' : 'Media'} library asset is missing its saved file`);
  }

  const extension = getAssetFileExtension(asset.name, asset.type);
  const storageKey = `${templateId}-${assetKind}-${Date.now()}${extension}`;
  const filePath = path.join(TEMPLATE_ASSET_DIR, storageKey);

  ensureTemplateAssetDir();
  fs.copyFileSync(sourcePath, filePath);

  return {
    name: asset.name,
    type: asset.type,
    size: asset.size || fs.statSync(filePath).size,
    storageKey,
  };
}

function readStoredTemplateAsset(asset) {
  if (!asset?.storageKey) {
    return null;
  }

  const filePath = path.join(TEMPLATE_ASSET_DIR, asset.storageKey);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const buffer = fs.readFileSync(filePath);

  return {
    name: asset.name,
    type: asset.type,
    dataUrl: `data:${asset.type};base64,${buffer.toString('base64')}`,
  };
}

function getStoredTemplateAssetPath(asset) {
  if (!asset?.storageKey) {
    return null;
  }

  const filePath = path.join(TEMPLATE_ASSET_DIR, asset.storageKey);
  return fs.existsSync(filePath) ? filePath : null;
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

function persistMediaLibraryAsset({ mediaId, asset, assetKind, mediaType }) {
  const parsed = parseMediaLibraryAsset(asset, assetKind === 'thumbnail' ? 'Video thumbnail' : 'Media', mediaType);

  if (assetKind === 'thumbnail') {
    validateMediaLibraryParsedAsset(parsed, mediaType, 'thumbnail');
  } else {
    validateMediaLibraryParsedAsset(parsed, mediaType);
  }

  const extension = getAssetFileExtension(parsed.name, parsed.mimeType);
  const storageKey = `${mediaId}-${assetKind}-${Date.now()}${extension}`;
  const filePath = path.join(MEDIA_LIBRARY_ASSET_DIR, storageKey);

  ensureMediaLibraryAssetDir();
  fs.writeFileSync(filePath, parsed.buffer);

  return {
    name: parsed.name,
    type: parsed.mimeType,
    size: parsed.buffer.length,
    storageKey,
    width: parsed.width,
    height: parsed.height,
    duration: parsed.duration,
  };
}

function persistUploadedMediaLibraryAsset({ mediaId, file, metadata, assetKind, mediaType }) {
  const parsed = parseUploadedMediaLibraryAsset(
    file,
    metadata,
    assetKind === 'thumbnail' ? 'Video thumbnail' : 'Media',
    mediaType
  );

  if (!parsed) {
    return null;
  }

  validateMediaLibraryParsedAsset(parsed, mediaType, assetKind);

  if (!fs.existsSync(parsed.filePath)) {
    throw new HttpError(400, `${assetKind === 'thumbnail' ? 'Video thumbnail' : 'Media'} upload was not received correctly`);
  }

  const extension = getAssetFileExtension(parsed.name, parsed.mimeType);
  const storageKey = `${mediaId}-${assetKind}-${Date.now()}${extension}`;
  const filePath = path.join(MEDIA_LIBRARY_ASSET_DIR, storageKey);

  ensureMediaLibraryAssetDir();
  fs.renameSync(parsed.filePath, filePath);

  return {
    name: parsed.name,
    type: parsed.mimeType,
    size: parsed.size,
    storageKey,
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

function deleteStoredMediaLibraryAsset(asset) {
  if (!asset?.storageKey) {
    return;
  }

  const filePath = path.join(MEDIA_LIBRARY_ASSET_DIR, asset.storageKey);

  try {
    fs.rmSync(filePath, { force: true });
  } catch (error) {
    // Ignore cleanup failures so media library operations still complete.
  }
}

function getStoredMediaLibraryAssetPath(asset) {
  if (!asset?.storageKey) {
    return null;
  }

  const filePath = path.join(MEDIA_LIBRARY_ASSET_DIR, asset.storageKey);
  return fs.existsSync(filePath) ? filePath : null;
}

function readStoredMediaLibraryAsset(asset) {
  const filePath = getStoredMediaLibraryAssetPath(asset);

  if (!filePath || !asset?.type) {
    return null;
  }

  const buffer = fs.readFileSync(filePath);

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
    deleteStoredTemplateAsset(mediaAsset);
    deleteStoredTemplateAsset(thumbnailAsset);
    mediaAsset = null;
    thumbnailAsset = null;
  } else if (nextMediaAssetId) {
    const libraryMediaAsset = await getMediaAssetDocForActor(nextMediaAssetId, actor);
    const previousMedia = mediaAsset;
    const previousThumbnail = thumbnailAsset;
    mediaAsset = copyMediaLibraryAssetToTemplateAsset({
      templateId: template._id.toString(),
      asset: libraryMediaAsset.media,
      assetKind: 'media',
    });

    thumbnailAsset = null;

    deleteStoredTemplateAsset(previousMedia);
    deleteStoredTemplateAsset(previousThumbnail);
  } else if (nextMediaInput) {
    const previousMedia = mediaAsset;
    mediaAsset = persistTemplateAsset({
      templateId: template._id.toString(),
      asset: nextMediaInput,
      assetKind: 'media',
    });
    deleteStoredTemplateAsset(previousMedia);

    if (!mediaAsset.type.startsWith('video/')) {
      deleteStoredTemplateAsset(thumbnailAsset);
      thumbnailAsset = null;
    } else if (!nextThumbnailInput) {
      deleteStoredTemplateAsset(thumbnailAsset);
      thumbnailAsset = null;
    }
  }

  if (nextThumbnailAssetId) {
    const libraryThumbnailAsset = await getMediaAssetDocForActor(nextThumbnailAssetId, actor);
    if (libraryThumbnailAsset.mediaType !== ADS_MEDIA_TYPES.IMAGE) {
      throw new HttpError(400, 'Template thumbnail must be an image media library asset');
    }
    const previousThumbnail = thumbnailAsset;
    thumbnailAsset = copyMediaLibraryAssetToTemplateAsset({
      templateId: template._id.toString(),
      asset: libraryThumbnailAsset.media,
      assetKind: 'thumbnail',
    });
    deleteStoredTemplateAsset(previousThumbnail);
  } else if (nextThumbnailInput) {
    const previousThumbnail = thumbnailAsset;
    thumbnailAsset = persistTemplateAsset({
      templateId: template._id.toString(),
      asset: nextThumbnailInput,
      assetKind: 'thumbnail',
    });
    deleteStoredTemplateAsset(previousThumbnail);
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
  media,
  uploadedMedia = null,
  uploadedThumbnail = null,
  mediaMetadata = null,
  actor,
  req,
}) {
  const normalizedName = normalizeText(name);
  const mediaInput = uploadedMedia ? null : sanitizeMediaLibraryAssetInput(media);

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

  const mediaMimeType = uploadedMedia
    ? normalizeMediaLibraryMimeType(uploadedMedia.mimetype, uploadedMedia.originalname)
    : normalizeMediaLibraryMimeType(mediaInput?.type, mediaInput?.name);
  const mediaType = mediaMimeType.startsWith('video/') ? ADS_MEDIA_TYPES.VIDEO : ADS_MEDIA_TYPES.IMAGE;

  const mediaAsset = new AdsLaunchMedia({
    name: normalizedName,
    mediaType,
    brandId: normalizeText(brandId),
    brandName: normalizeText(brandName),
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  try {
    mediaAsset.media = uploadedMedia
      ? persistUploadedMediaLibraryAsset({
          mediaId: mediaAsset._id.toString(),
          file: uploadedMedia,
          metadata: mediaMetadata,
          assetKind: 'media',
          mediaType,
        })
      : persistMediaLibraryAsset({
          mediaId: mediaAsset._id.toString(),
          asset: mediaInput,
          assetKind: 'media',
          mediaType,
        });
    mediaAsset.thumbnail = null;
    await mediaAsset.save();
  } catch (error) {
    deleteStoredMediaLibraryAsset(mediaAsset.media);
    deleteStoredMediaLibraryAsset(mediaAsset.thumbnail);
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
  uploadId,
  mediaOriginalName,
  mediaMimeType,
  mediaSize,
  mediaMetadata,
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
      uploadedMedia,
      mediaMetadata,
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

  deleteStoredMediaLibraryAsset(mediaAsset.media);
  deleteStoredMediaLibraryAsset(mediaAsset.thumbnail);
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
  deleteTemplateStoredAssets(template);
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
    throw new HttpError(400, buildMetaErrorMessage(path, payload));
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
    throw new HttpError(400, buildMetaErrorMessage(path, payload));
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

function toMetaBudget(value, currency) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new HttpError(400, 'Daily budget must be a positive number');
  }

  return String(Math.round(numericValue * getBudgetMultiplier(currency)));
}

function normalizeOptionalScheduleTime(value, label) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return '';
  }

  const date = new Date(normalizedValue.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${label} must be a valid date and time`);
  }

  const timezoneMatch = normalizedValue.match(/(Z|[+-]\d{2}:?\d{2})$/i);
  if (!timezoneMatch) {
    return date.toISOString();
  }

  const timezoneSuffix =
    timezoneMatch[1].toUpperCase() === 'Z'
      ? '+0000'
      : timezoneMatch[1].replace(':', '');
  const localDateTime = normalizedValue
    .replace(/(Z|[+-]\d{2}:?\d{2})$/i, '')
    .replace(/\.\d+$/, '');
  const withSeconds = localDateTime.length === 16 ? `${localDateTime}:00` : localDateTime;

  return `${withSeconds}${timezoneSuffix}`;
}

function ensurePublishPayload(payload) {
  const staticDefaults = payload.staticDefaults || {};
  const rawDisplayUrl = normalizeText(payload.displayUrl);
  const countries = sanitizeCountries({
    countries: payload.countries,
    country: payload.country,
  });
  const cleaned = {
    templateId: normalizeText(payload.templateId),
    launchLabel: normalizeText(payload.launchLabel),
    brandId: normalizeText(payload.brandId),
    brandName: normalizeText(payload.brandName),
    tokenId: normalizeText(payload.tokenId),
    country: countries[0] || '',
    countries,
    countryLabel: normalizeText(payload.countryLabel),
    objective: normalizeText(payload.objective),
    dailyBudget: normalizeText(payload.dailyBudget),
    selectedAdAccountIds: dedupeStrings(payload.selectedAdAccountIds),
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
    staticDefaults: {
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
    },
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

  if ((cleaned.scheduleStart && !cleaned.scheduleEnd) || (!cleaned.scheduleStart && cleaned.scheduleEnd)) {
    throw new HttpError(400, 'Schedule start and schedule end must both be set, or both left empty');
  }

  const minimumScheduleStart = new Date(Date.now() + 5 * 60 * 1000);
  if (cleaned.scheduleStart && new Date(cleaned.scheduleStart) < minimumScheduleStart) {
    throw new HttpError(400, 'Schedule start must be at least 5 minutes in the future');
  }

  if (cleaned.scheduleStart && cleaned.scheduleEnd && new Date(cleaned.scheduleEnd) <= new Date(cleaned.scheduleStart)) {
    throw new HttpError(400, 'Schedule end must be after schedule start');
  }

  if (cleaned.scheduleEnd && new Date(cleaned.scheduleEnd) <= new Date()) {
    throw new HttpError(400, 'Schedule end must be in the future');
  }

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
    params.bid_strategy = resolveBidStrategy(staticDefaults.bidStrategy);
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
}) {
  const settings = SUPPORTED_OBJECTIVES[objective];
  const ageMin = Number.parseInt(staticDefaults.audienceAgeMin, 10);
  const ageMax = Number.parseInt(staticDefaults.audienceAgeMax, 10);
  const isSpecialAdCategory = isSpecialAdCategoryCampaign(staticDefaults.specialAdCategories);
  const campaignBudget = usesCampaignBudget(staticDefaults);
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

  if (!campaignBudget) {
    params.daily_budget = toMetaBudget(dailyBudget, currency);
    params.bid_strategy = resolveBidStrategy(staticDefaults.bidStrategy);
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

  return postToMeta({
    token,
    path: `${adAccountId}/adsets`,
    params,
  });
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
  progress?.info({
    ...progressContext,
    step,
    status: 'active',
    message: `${progressContext.accountLabel || 'Account'}: ${stepLabel}`,
  });

  try {
    const result = await operation();
    progress?.complete({
      ...progressContext,
      step,
      message: `${progressContext.accountLabel || 'Account'}: ${stepLabel} complete`,
    });
    return result;
  } catch (error) {
    progress?.fail({
      ...progressContext,
      step,
      error: error.message,
      message: `${progressContext.accountLabel || 'Account'}: ${stepLabel} failed`,
    });
    throw new HttpError(error.statusCode || 400, `${stepLabel} failed. ${error.message}`);
  }
}

async function getTemplateAssetForActor({ templateId, assetKind, actor }) {
  if (!['media', 'thumbnail'].includes(assetKind)) {
    throw new HttpError(404, 'Template asset not found');
  }

  const template = await getTemplateForActor(templateId, actor);
  const asset = assetKind === 'thumbnail' ? template.snapshot?.thumbnail : template.snapshot?.media;
  const filePath = getStoredTemplateAssetPath(asset);

  if (!filePath || !asset?.type) {
    throw new HttpError(404, 'Template asset not found');
  }

  return {
    filePath,
    filename: asset.name || `${assetKind}`,
    mimeType: asset.type,
  };
}

async function getMediaAssetForActor({ mediaId, assetKind, actor }) {
  if (!['file', 'thumbnail'].includes(assetKind)) {
    throw new HttpError(404, 'Media library asset not found');
  }

  const mediaAsset = await getMediaAssetDocForActor(mediaId, actor);
  const asset = assetKind === 'thumbnail' ? mediaAsset.thumbnail : mediaAsset.media;
  const filePath = getStoredMediaLibraryAssetPath(asset);

  if (!filePath || !asset?.type) {
    throw new HttpError(404, 'Media library asset not found');
  }

  return {
    filePath,
    filename: asset.name || `${assetKind}`,
    mimeType: asset.type,
  };
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
    const creativeAssets = readCreativeAssetsFromMediaAsset(mediaAsset);

    if (launch.thumbnailAssetId) {
      const thumbnailAsset = await getMediaAssetDocForActor(launch.thumbnailAssetId, actor);
      creativeAssets.thumbnail = readThumbnailFromMediaLibraryAsset(thumbnailAsset);
    }

    return creativeAssets;
  }

  if (!launch.templateId) {
    throw new HttpError(400, 'Upload an image or video before publishing');
  }

  const template = await getTemplateForActor(launch.templateId, actor);
  const media = readStoredTemplateAsset(template.snapshot?.media);
  let thumbnail = readStoredTemplateAsset(template.snapshot?.thumbnail);

  if (!media) {
    throw new HttpError(400, 'The selected template does not have a saved creative asset');
  }

  if (launch.thumbnailAssetId) {
    const thumbnailAsset = await getMediaAssetDocForActor(launch.thumbnailAssetId, actor);
    thumbnail = readThumbnailFromMediaLibraryAsset(thumbnailAsset);
  }

  return {
    media,
    thumbnail,
  };
}

function readCreativeAssetsFromMediaAsset(mediaAsset) {
  const media = readStoredMediaLibraryAsset(mediaAsset?.media);

  if (!media) {
    throw new HttpError(400, `Media library asset "${mediaAsset?.name || 'selected'}" is missing its saved file`);
  }

  return {
    media,
    thumbnail: null,
  };
}

function readThumbnailFromMediaLibraryAsset(mediaAsset) {
  if (mediaAsset?.mediaType !== ADS_MEDIA_TYPES.IMAGE) {
    throw new HttpError(400, `Thumbnail asset "${mediaAsset?.name || 'selected'}" must be an image from the media library`);
  }

  const thumbnail = readStoredMediaLibraryAsset(mediaAsset.media);

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
    .filter((item) => item.adAccountId && (item.campaignTemplateId || item.mediaTemplateId || item.mediaAssetId));
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
      ...baseStaticDefaults,
      ...campaignStaticDefaults,
      country: countries[0] || baseLaunch.country,
      countries,
    },
  };
}

function readCreativeAssetsFromTemplate(template) {
  const media = readStoredTemplateAsset(template?.snapshot?.media);
  const thumbnail = readStoredTemplateAsset(template?.snapshot?.thumbnail);

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
    ? readCreativeAssetsFromMediaAsset(mediaAsset)
    : mediaTemplate
      ? readCreativeAssetsFromTemplate(mediaTemplate)
      : await resolvePublishCreativeAssets({
          launch: effectiveLaunch,
          actor,
        });

  if (mediaAsset && String(creativeAssets.media?.type || '').startsWith('video/')) {
    if (!thumbnailAsset) {
      throw new HttpError(400, `Select a thumbnail image for video media "${mediaAsset.name}"`);
    }

    creativeAssets.thumbnail = readThumbnailFromMediaLibraryAsset(thumbnailAsset);
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

async function publishLaunch({ payload, actor, req, onProgress = null, tokenType = null }) {
  const launch = ensurePublishPayload(payload);
  launch.staticDefaults = {
    ...launch.staticDefaults,
    country: launch.country,
    countries: launch.countries,
  };
  const accountLaunches = sanitizeAccountLaunches(payload.accountLaunches);
  const accountLaunchMap = new Map(accountLaunches.map((item) => [item.adAccountId, item]));
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
  const accountMap = new Map(launch.selectedAdAccounts.map((account) => [account.id, account]));
  const results = [];
  const failed = [];
  const progress = createPublishProgressReporter({
    onProgress,
    totalSteps: launch.selectedAdAccountIds.length * (usesAccountTemplates ? 6 : getPublishStepCountPerAccount(baseCreativeAssets.media)),
  });

  progress.info({
    step: 'prepare',
    status: 'active',
    message: `Preparing ${launch.selectedAdAccountIds.length} ad account publish`,
    totalAccounts: launch.selectedAdAccountIds.length,
  });

  for (const [index, adAccountId] of launch.selectedAdAccountIds.entries()) {
    const selectedAccount = accountMap.get(adAccountId) || {
      id: adAccountId,
      name: adAccountId,
      currency: '',
    };
    const accountLabel = `Ad account ${index + 1}/${launch.selectedAdAccountIds.length} (${selectedAccount.name})`;
    const progressContext = {
      accountIndex: index + 1,
      totalAccounts: launch.selectedAdAccountIds.length,
      adAccountId,
      adAccountName: selectedAccount.name,
      accountLabel,
    };
    const accountTemplate = accountLaunchMap.get(adAccountId);
    let accountResolved = null;
    let effectiveLaunch = launch;
    let creativeAssets = baseCreativeAssets;
    let names = {};
    let campaign = null;
    let adSet = null;
    let creative = null;
    let ad = null;

    try {
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
        }),
        progress,
        progressContext,
        'ad-set'
      );

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
      });
      progress.info({
        ...progressContext,
        step: 'account',
        status: 'completed',
        message: `${accountLabel}: publish complete`,
      });
    } catch (error) {
      failed.push({
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
          actor,
          req,
        });
        failed[failed.length - 1].historyRecordId = failureRecord?.recordId || null;
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
        status: 'failed',
        error: error.message,
        message: `${accountLabel}: publish failed`,
      });
    }
  }

  if (!results.length) {
    throw new HttpError(400, failed[0]?.message || 'Meta publish failed');
  }

  await markTemplatePublished(launch.templateId, actor);
  for (const accountLaunch of accountLaunches) {
    await markTemplatePublished(accountLaunch.campaignTemplateId, actor);
    await markTemplatePublished(accountLaunch.mediaTemplateId, actor);
  }

  await writeActivityLog({
    user: actor,
    action: 'ADS_LAUNCH_PUBLISHED',
    entity: 'AdsLaunch',
    metadata: {
      launchLabel: launch.launchLabel,
      adAccountsRequested: launch.selectedAdAccountIds.length,
      published: results.length,
      failed: failed.length,
      objective: launch.objective,
      websiteEvent: launch.websiteEvent,
      countries: launch.countries,
      accountTemplateAssignments: accountLaunches.length,
    },
    req,
  });

  return {
    message:
      failed.length > 0
        ? `Publish completed with ${results.length} success and ${failed.length} failure`
        : 'Publish completed successfully',
    results,
    failed,
    summary: {
      requested: launch.selectedAdAccountIds.length,
      published: results.length,
      failed: failed.length,
    },
  };
}

module.exports = {
  completeChunkedMediaAsset,
  createMediaAsset,
  createTemplate,
  deleteMediaAsset,
  deleteTemplate,
  getMediaAssetForActor,
  getTemplateAssetForActor,
  listMediaAssets,
  listTemplates,
  publishLaunch,
  saveMediaUploadChunk,
  updateMediaAssetBrand,
  updateTemplate,
};
