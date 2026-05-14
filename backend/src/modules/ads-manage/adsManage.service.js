const HttpError = require('../../app/utils/httpError');
const mongoose = require('mongoose');
const { waitForMetaApiPacing } = require('../../app/utils/metaApiPacing');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const settingsService = require('../settings/settings.service');
const tokenService = require('../token-management/token.service');
const { Token, TOKEN_CONNECTION_STATUSES, TOKEN_STATUSES } = require('../token-management/token.model');
const { User, USER_ROLES } = require('../users/user.model');
const ManagedCampaign = require('./adsManage.model');

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const ALLOWED_STATUS_UPDATES = new Set(['ACTIVE', 'PAUSED']);
const PUBLISH_QUEUE_STATUSES = Object.freeze({
  NONE: 'NONE',
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  BLOCKED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});
const ACTIVE_PUBLISH_QUEUE_STATUSES = [
  PUBLISH_QUEUE_STATUSES.PENDING,
  PUBLISH_QUEUE_STATUSES.RUNNING,
  PUBLISH_QUEUE_STATUSES.BLOCKED,
  PUBLISH_QUEUE_STATUSES.FAILED,
];
const RETRYABLE_PUBLISH_QUEUE_STATUSES = [
  PUBLISH_QUEUE_STATUSES.PENDING,
  PUBLISH_QUEUE_STATUSES.BLOCKED,
];
const DEFAULT_QUEUE_RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_QUEUE_RETRY_DELAY_MS = 60 * 60 * 1000;
const META_ACCESS_COLLECTION_LIMIT = 500;
const ERROR_PAGE_SIZE_OPTIONS = new Set([10, 25, 50]);
const HISTORY_PAGE_SIZE_OPTIONS = new Set([10, 25, 50]);

let publishQueueTimer = null;
let publishQueueTimerDueAt = null;
let publishQueueRunning = false;
let publishQueueLastRunAt = null;
let publishQueueLastResult = null;

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

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function normalizeMetaNodeId(value, prefix = '') {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return '';
  }

  if (!prefix || normalizedValue.startsWith(`${prefix}_`)) {
    return normalizedValue;
  }

  return `${prefix}_${normalizedValue.replace(new RegExp(`^${prefix}_`), '')}`;
}

function metaIdsMatch(left, right) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizedLeft === normalizedRight || normalizedLeft.replace(/^act_/, '') === normalizedRight.replace(/^act_/, '');
}

function isSuperAdmin(actor) {
  return actor?.role === USER_ROLES.SUPER_ADMIN;
}

function campaignAccessFilter(actor) {
  if (!actor || isSuperAdmin(actor)) {
    return {};
  }

  return {
    createdBy: actor._id || actor.id || null,
  };
}

function tokenAccessFilter(actor) {
  if (!actor || isSuperAdmin(actor)) {
    return {};
  }

  return {
    createdBy: actor._id || actor.id || null,
  };
}

function normalizeQueueStatus(status) {
  const normalizedStatus = normalizeText(status).toUpperCase();
  return Object.values(PUBLISH_QUEUE_STATUSES).includes(normalizedStatus)
    ? normalizedStatus
    : PUBLISH_QUEUE_STATUSES.NONE;
}

function isActiveQueueStatus(status) {
  return ACTIVE_PUBLISH_QUEUE_STATUSES.includes(normalizeQueueStatus(status));
}

function getQueueRetryDelayMs({ retryAfterSeconds = null, attemptCount = 0 } = {}) {
  const retryAfterMs = Number(retryAfterSeconds) * 1000;

  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return Math.min(Math.round(retryAfterMs), MAX_QUEUE_RETRY_DELAY_MS);
  }

  const backoffMultiplier = 2 ** Math.min(Number(attemptCount) || 0, 4);
  return Math.min(DEFAULT_QUEUE_RETRY_DELAY_MS * backoffMultiplier, MAX_QUEUE_RETRY_DELAY_MS);
}

function normalizeQueueRecord(campaign) {
  const record = campaign.toSafeObject ? campaign.toSafeObject() : campaign;
  const queue = record.publishQueue || {};

  return {
    campaignId: record.campaignId,
    recordId: record.recordId,
    name: record.name,
    tokenId: record.tokenId,
    tokenLabel: record.tokenLabel,
    adAccount: record.adAccount,
    status: record.status,
    lastMetaError: record.lastMetaError,
    publishQueue: {
      status: queue.status || PUBLISH_QUEUE_STATUSES.NONE,
      reason: queue.reason || '',
      tokenType: queue.tokenType || '',
      source: queue.source || '',
      queuedAt: queue.queuedAt || null,
      nextAttemptAt: queue.nextAttemptAt || null,
      runningStartedAt: queue.runningStartedAt || null,
      completedAt: queue.completedAt || null,
      clearedAt: queue.clearedAt || null,
      attemptCount: queue.attemptCount || 0,
      lastAttemptAt: queue.lastAttemptAt || null,
      lastError: queue.lastError || '',
    },
  };
}

function getQueueState({ queue = [] } = {}) {
  const counts = queue.reduce(
    (summary, item) => {
      const status = normalizeQueueStatus(item.publishQueue?.status);
      summary.total += 1;
      summary[status.toLowerCase()] = (summary[status.toLowerCase()] || 0) + 1;
      return summary;
    },
    {
      total: 0,
    }
  );

  return {
    running: publishQueueRunning,
    lastRunAt: publishQueueLastRunAt,
    lastResult: publishQueueLastResult,
    counts,
  };
}

function normalizeErrorPagination({ page = 1, limit = 25 } = {}) {
  const normalizedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const parsedLimit = Number.parseInt(limit, 10) || 25;
  const normalizedLimit = ERROR_PAGE_SIZE_OPTIONS.has(parsedLimit) ? parsedLimit : 25;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    skip: (normalizedPage - 1) * normalizedLimit,
  };
}

function normalizeHistoryPagination({ page = 1, limit = 25 } = {}) {
  const normalizedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const parsedLimit = Number.parseInt(limit, 10) || 25;
  const normalizedLimit = HISTORY_PAGE_SIZE_OPTIONS.has(parsedLimit) ? parsedLimit : 25;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    skip: (normalizedPage - 1) * normalizedLimit,
  };
}

function getLatestProblemAction(record = {}) {
  const history = Array.isArray(record.actionHistory) ? record.actionHistory : [];

  return [...history]
    .reverse()
    .find((item) => {
      const action = normalizeText(item.action).toUpperCase();
      const status = normalizeText(item.status).toUpperCase();
      return (
        action !== 'RETRY_REQUESTED' &&
        (status === 'BLOCKED' ||
          action.includes('FAILED') ||
          action.includes('BLOCKED') ||
          (status === 'FAILED' && !action.includes('REQUESTED')))
      );
    });
}

function getLatestRecoveryAction(record = {}) {
  const history = Array.isArray(record.actionHistory) ? record.actionHistory : [];

  return [...history]
    .reverse()
    .find((item) => {
      const action = normalizeText(item.action).toUpperCase();
      const status = normalizeText(item.status).toUpperCase();
      return action === 'RETRY_SUCCEEDED' || action === 'PUBLISH_QUEUE_COMPLETED' || status === 'RETRIED';
    });
}

function classifyErrorMessage(message = '', queueStatus = '') {
  const text = normalizeText(message).toLowerCase();
  const normalizedQueueStatus = normalizeQueueStatus(queueStatus);

  if (
    text.includes('access token') ||
    text.includes('oauth') ||
    text.includes('session has expired') ||
    text.includes('session is invalid') ||
    text.includes('permission') ||
    text.includes('does not have access') ||
    text.includes('not authorized') ||
    text.includes('login')
  ) {
    return 'AUTH';
  }

  if (
    normalizedQueueStatus === PUBLISH_QUEUE_STATUSES.BLOCKED ||
    text.includes('temporarily blocked') ||
    text.includes('api access blocked') ||
    text.includes('rate limit') ||
    text.includes('too many calls') ||
    text.includes('application request limit') ||
    text.includes('please reduce the amount')
  ) {
    return 'BLOCKED';
  }

  if (
    text.includes('creative') ||
    text.includes('asset_feed_spec') ||
    text.includes('call_to_action') ||
    text.includes('display url')
  ) {
    return 'CREATIVE';
  }

  if (
    text.includes('video') ||
    text.includes('image') ||
    text.includes('thumbnail') ||
    text.includes('upload') ||
    text.includes('media')
  ) {
    return 'MEDIA';
  }

  if (
    text.includes('invalid parameter') ||
    text.includes('unsupported') ||
    text.includes('must specify') ||
    text.includes('required') ||
    text.includes('budget') ||
    text.includes('url')
  ) {
    return 'VALIDATION';
  }

  return 'UNKNOWN';
}

function getErrorSeverity(errorType, status = '') {
  if (errorType === 'AUTH' || errorType === 'BLOCKED') {
    return 'CRITICAL';
  }

  if (normalizeText(status).toUpperCase() === 'FAILED') {
    return 'HIGH';
  }

  if (errorType === 'VALIDATION' || errorType === 'CREATIVE') {
    return 'MEDIUM';
  }

  return 'LOW';
}

function getResumeFromStep(record = {}) {
  if (record.adId) {
    return 'history save';
  }

  if (record.creativeId) {
    return 'ad creation';
  }

  if (record.adSetId) {
    return 'creative creation';
  }

  if (record.campaignId && !String(record.campaignId).startsWith('failed_')) {
    return 'ad set creation';
  }

  return 'campaign creation';
}

function buildTokenContext(token) {
  const safeToken = token?.toSafeObject ? token.toSafeObject() : token || {};

  return {
    id: safeToken.id || safeToken._id?.toString?.() || '',
    label: safeToken.label || '',
    purpose: safeToken.purpose || '',
    adsPowerProfile: safeToken.adsPowerProfile || '',
    brand: safeToken.brand
      ? {
          id: safeToken.brand.id || safeToken.brand._id?.toString?.() || '',
          name: safeToken.brand.name || '',
          color: safeToken.brand.color || '',
        }
      : null,
    agency: safeToken.agency
      ? {
          id: safeToken.agency.id || safeToken.agency._id?.toString?.() || '',
          name: safeToken.agency.name || '',
        }
      : null,
    connectionStatus: safeToken.connectionStatus || '',
    systemUserConnectionStatus: safeToken.systemUserAccessTokenConnectionStatus || safeToken.systemUserConnectionStatus || '',
  };
}

function buildCampaignErrorRow(record, tokenContextById = new Map()) {
  const safeRecord = record.toSafeObject ? record.toSafeObject() : record;
  const queue = safeRecord.publishQueue || {};
  const queueStatus = normalizeQueueStatus(queue.status);
  const latestProblemAction = getLatestProblemAction(record);
  const latestRecoveryAction = getLatestRecoveryAction(record);
  const latestClearedAction = [...(Array.isArray(record.actionHistory) ? record.actionHistory : [])]
    .reverse()
    .find((item) => normalizeText(item.action).toUpperCase() === 'ERROR_SUCCESS_CLEARED');
  const recoveryTime = latestRecoveryAction?.at ? new Date(latestRecoveryAction.at).getTime() : 0;
  const clearedTime = latestClearedAction?.at ? new Date(latestClearedAction.at).getTime() : 0;
  const message = normalizeText(queue.lastError) || normalizeText(safeRecord.lastMetaError) || normalizeText(latestProblemAction?.message);
  const errorType = classifyErrorMessage(message, queueStatus);
  const retryPayload = safeRecord.launch?.retryPayload || null;
  const queueIsActive = ACTIVE_PUBLISH_QUEUE_STATUSES.includes(queueStatus);

  if (
    latestRecoveryAction &&
    clearedTime > recoveryTime &&
    safeRecord.status !== 'FAILED' &&
    !normalizeText(safeRecord.lastMetaError) &&
    !queueIsActive
  ) {
    return null;
  }

  const recovered = Boolean(
    latestRecoveryAction &&
      safeRecord.status !== 'FAILED' &&
      !normalizeText(safeRecord.lastMetaError) &&
      !queueIsActive &&
      clearedTime <= recoveryTime
  );
  const canRetry = !recovered && safeRecord.status === 'FAILED' && Boolean(retryPayload);
  const status = recovered
    ? 'SUCCESS'
    : queueIsActive
    ? queueStatus
    : safeRecord.status === 'FAILED'
      ? 'FAILED'
      : 'WITH_ERROR';
  const token = tokenContextById.get(safeRecord.tokenId) || {
    id: safeRecord.tokenId,
    label: safeRecord.tokenLabel,
    brand: safeRecord.launch?.brandId
      ? {
          id: safeRecord.launch.brandId,
          name: safeRecord.launch.brandName || '',
        }
      : null,
    agency: null,
    adsPowerProfile: '',
  };

  return {
    id: `campaign:${safeRecord.recordId || safeRecord.campaignId}`,
    kind: 'CAMPAIGN',
    status,
    errorType,
    severity: getErrorSeverity(errorType, status),
    message: message || 'Saved Meta action error',
    successMessage: recovered ? normalizeText(latestRecoveryAction?.message) || 'Retry completed successfully' : '',
    recovered,
    recoveredAt: recovered ? latestRecoveryAction?.at || safeRecord.updatedAt : null,
    campaignId: safeRecord.campaignId,
    recordId: safeRecord.recordId,
    campaignName: safeRecord.name,
    tokenId: safeRecord.tokenId,
    tokenLabel: safeRecord.tokenLabel,
    token,
    brandName: token.brand?.name || safeRecord.launch?.brandName || '',
    agencyName: token.agency?.name || '',
    adsPowerProfile: token.adsPowerProfile || '',
    adAccount: safeRecord.adAccount || {},
    page: safeRecord.launch?.page || {},
    pixel: safeRecord.launch?.pixel || {},
    source: safeRecord.source || '',
    canRetry,
    canCheckAccess: canRetry,
    retryLabel: getResumeFromStep(safeRecord) === 'campaign creation' ? 'Retry' : 'Continue',
    resumeFromStep: canRetry ? getResumeFromStep(safeRecord) : '',
    partialMeta: {
      campaignId: safeRecord.campaignId && !String(safeRecord.campaignId).startsWith('failed_') ? safeRecord.campaignId : '',
      adSetId: safeRecord.adSetId || '',
      creativeId: safeRecord.creativeId || '',
      adId: safeRecord.adId || '',
    },
    queue: {
      status: queueStatus,
      reason: queue.reason || '',
      tokenType: queue.tokenType || '',
      source: queue.source || '',
      queuedAt: queue.queuedAt || null,
      nextAttemptAt: queue.nextAttemptAt || null,
      lastAttemptAt: queue.lastAttemptAt || null,
      attemptCount: queue.attemptCount || 0,
      lastError: queue.lastError || '',
    },
    latestAction: latestProblemAction
      ? {
          action: latestProblemAction.action,
          status: latestProblemAction.status,
          message: latestProblemAction.message,
          at: latestProblemAction.at,
        }
      : null,
    recoveryAction: latestRecoveryAction
      ? {
          action: latestRecoveryAction.action,
          status: latestRecoveryAction.status,
          message: latestRecoveryAction.message,
          at: latestRecoveryAction.at,
        }
      : null,
    createdAt: safeRecord.createdAt,
    updatedAt: safeRecord.updatedAt,
  };
}

function getDynamicHistoryState(record = {}) {
  const status = normalizeText(record.status).toUpperCase();
  const source = normalizeText(record.source).toUpperCase();

  if (status === 'FAILED' || source === 'ADS_LAUNCH_FAILED' || normalizeText(record.lastMetaError)) {
    return 'FAILED';
  }

  if (status === 'DELETED' || record.deletedAt) {
    return 'DELETED';
  }

  if (status === 'ACTIVE') {
    return 'ACTIVE';
  }

  if (status === 'RETRIED') {
    return 'RETRIED';
  }

  return 'SUCCESS';
}

function buildDynamicHistoryRow(record, tokenContextById = new Map()) {
  const safeRecord = record.toSafeObject ? record.toSafeObject() : record;
  const token = tokenContextById.get(safeRecord.tokenId) || {
    id: safeRecord.tokenId,
    label: safeRecord.tokenLabel,
    brand: safeRecord.launch?.brandId
      ? {
          id: safeRecord.launch.brandId,
          name: safeRecord.launch.brandName || '',
        }
      : null,
    agency: null,
    adsPowerProfile: '',
  };
  const queue = safeRecord.publishQueue || {};
  const queueStatus = normalizeQueueStatus(queue.status);
  const launch = safeRecord.launch || {};
  const dynamicLabel =
    normalizeText(launch.launchLabel) ||
    normalizeText(safeRecord.name) ||
    normalizeText(launch.campaignTemplateId) ||
    'Dynamic launch';

  return {
    id: safeRecord.recordId || safeRecord.campaignId,
    recordId: safeRecord.recordId,
    campaignId: safeRecord.campaignId,
    campaignName: safeRecord.name,
    status: normalizeText(safeRecord.status).toUpperCase() || 'UNKNOWN',
    effectiveStatus: normalizeText(safeRecord.effectiveStatus).toUpperCase() || '',
    historyStatus: getDynamicHistoryState(safeRecord),
    source: safeRecord.source || '',
    objective: safeRecord.objective || '',
    buyingType: safeRecord.buyingType || '',
    tokenId: safeRecord.tokenId,
    tokenLabel: safeRecord.tokenLabel,
    token,
    brandName: token.brand?.name || launch.brandName || '',
    brandId: token.brand?.id || launch.brandId || '',
    agencyName: token.agency?.name || '',
    adsPowerProfile: token.adsPowerProfile || '',
    adAccount: safeRecord.adAccount || {},
    launch: {
      launchLabel: dynamicLabel,
      launchItemId: launch.launchItemId || '',
      bulkId: launch.bulkId || '',
      bulkLabel: launch.bulkLabel || launch.launchLabel || '',
      bulkSource: launch.bulkSource || '',
      campaignTemplateId: launch.campaignTemplateId || '',
      mediaTemplateId: launch.mediaTemplateId || '',
      mediaAssetId: launch.mediaAssetId || '',
      thumbnailAssetId: launch.thumbnailAssetId || '',
      brandId: launch.brandId || '',
      brandName: launch.brandName || '',
      countries: Array.isArray(launch.countries) ? launch.countries : [],
      countryLabel: launch.countryLabel || '',
      dailyBudget: launch.dailyBudget || '',
      page: launch.page || {},
      pixel: launch.pixel || {},
      websiteEvent: launch.websiteEvent || '',
      headline: launch.headline || '',
      primaryText: launch.primaryText || '',
      description: launch.description || '',
      websiteUrl: launch.websiteUrl || '',
      displayUrl: launch.displayUrl || '',
      urlParameters: launch.urlParameters || '',
      scheduleStart: launch.scheduleStart || '',
      scheduleEnd: launch.scheduleEnd || '',
      callToAction: launch.callToAction || '',
      media: launch.media || null,
      thumbnail: launch.thumbnail || null,
      staticDefaults: launch.staticDefaults || {},
    },
    meta: {
      campaignId: safeRecord.campaignId && !String(safeRecord.campaignId).startsWith('failed_') ? safeRecord.campaignId : '',
      adSetId: safeRecord.adSetId || '',
      creativeId: safeRecord.creativeId || '',
      adId: safeRecord.adId || '',
      adSetName: safeRecord.adSetName || '',
      creativeName: safeRecord.creativeName || '',
      adName: safeRecord.adName || '',
    },
    budget: safeRecord.budget || {},
    lastMetaError: safeRecord.lastMetaError || '',
    queue: {
      status: queueStatus,
      reason: queue.reason || '',
      tokenType: queue.tokenType || '',
      source: queue.source || '',
      queuedAt: queue.queuedAt || null,
      nextAttemptAt: queue.nextAttemptAt || null,
      runningStartedAt: queue.runningStartedAt || null,
      completedAt: queue.completedAt || null,
      attemptCount: queue.attemptCount || 0,
      lastAttemptAt: queue.lastAttemptAt || null,
      lastError: queue.lastError || '',
    },
    actionHistory: safeRecord.actionHistory || [],
    createdAt: safeRecord.createdAt,
    updatedAt: safeRecord.updatedAt,
  };
}

function applyDynamicHistoryFilters(rows, { status = '', search = '', brandId = '' } = {}) {
  const normalizedStatus = normalizeText(status).toUpperCase();
  const normalizedSearch = normalizeText(search).toLowerCase();
  const normalizedBrandId = normalizeText(brandId);

  return rows.filter((row) => {
    if (normalizedBrandId && row.brandId !== normalizedBrandId && row.launch?.brandId !== normalizedBrandId) {
      return false;
    }

    if (normalizedStatus) {
      const statusMatches =
        row.historyStatus === normalizedStatus ||
        row.status === normalizedStatus ||
        row.effectiveStatus === normalizedStatus ||
        row.queue?.status === normalizedStatus;

      if (!statusMatches) {
        return false;
      }
    }

    if (!normalizedSearch) {
      return true;
    }

    return [
      row.campaignName,
      row.campaignId,
      row.historyStatus,
      row.status,
      row.objective,
      row.tokenLabel,
      row.brandName,
      row.agencyName,
      row.adsPowerProfile,
      row.adAccount?.name,
      row.adAccount?.id,
      row.launch?.launchLabel,
      row.launch?.launchItemId,
      row.launch?.bulkId,
      row.launch?.bulkLabel,
      row.launch?.bulkSource,
      row.launch?.campaignTemplateId,
      row.launch?.mediaTemplateId,
      row.launch?.mediaAssetId,
      row.launch?.thumbnailAssetId,
      row.launch?.page?.name,
      row.launch?.pixel?.name,
      row.launch?.websiteUrl,
      row.meta?.adSetId,
      row.meta?.creativeId,
      row.meta?.adId,
      row.lastMetaError,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch));
  });
}

function summarizeDynamicHistoryRows(rows) {
  const adAccounts = new Set();
  const brands = new Set();
  const bulks = new Set();

  return rows.reduce(
    (summary, row) => {
      summary.total += 1;

      if (row.historyStatus === 'FAILED') {
        summary.failed += 1;
      } else {
        summary.success += 1;
      }

      if (row.status === 'ACTIVE') {
        summary.active += 1;
      }

      if (row.status === 'PAUSED') {
        summary.paused += 1;
      }

      if (ACTIVE_PUBLISH_QUEUE_STATUSES.includes(row.queue?.status)) {
        summary.queued += 1;
      }

      if (row.adAccount?.id) {
        adAccounts.add(row.adAccount.id);
      }

      if (row.brandId || row.brandName) {
        brands.add(row.brandId || row.brandName);
      }

      if (row.launch?.bulkId || row.launch?.bulkLabel) {
        bulks.add(row.launch.bulkId || row.launch.bulkLabel);
      }

      summary.adAccounts = adAccounts.size;
      summary.brands = brands.size;
      summary.bulks = bulks.size;
      return summary;
    },
    {
      total: 0,
      success: 0,
      failed: 0,
      active: 0,
      paused: 0,
      queued: 0,
      adAccounts: 0,
      brands: 0,
      bulks: 0,
    }
  );
}

function buildTokenErrorRows(token) {
  const safeToken = token.toSafeObject ? token.toSafeObject() : token;
  const tokenContext = buildTokenContext(token);
  const rows = [];
  const baseRow = {
    kind: 'TOKEN',
    status: 'AUTH',
    errorType: 'AUTH',
    severity: 'CRITICAL',
    tokenId: safeToken.id,
    tokenLabel: safeToken.label,
    token: tokenContext,
    brandName: tokenContext.brand?.name || '',
    agencyName: tokenContext.agency?.name || '',
    adsPowerProfile: tokenContext.adsPowerProfile || '',
    canRetry: false,
    canCheckAccess: false,
    retryLabel: '',
    campaignId: '',
    recordId: '',
    campaignName: '',
    adAccount: null,
    page: null,
    pixel: null,
    source: 'TOKEN_HEALTH',
    queue: null,
    latestAction: null,
    partialMeta: {},
    createdAt: safeToken.createdAt,
    updatedAt: safeToken.updatedAt,
  };

  if (safeToken.status === TOKEN_STATUSES.DEACTIVE) {
    rows.push({
      ...baseRow,
      id: `token:${safeToken.id}:status`,
      message: 'Meta token is deactivated in this system',
    });
  }

  if ([TOKEN_CONNECTION_STATUSES.BLOCKED, TOKEN_CONNECTION_STATUSES.DISABLED].includes(safeToken.connectionStatus)) {
    rows.push({
      ...baseRow,
      id: `token:${safeToken.id}:profile`,
      message: safeToken.connectionMessage || `Profile access token is ${String(safeToken.connectionStatus).toLowerCase()}`,
    });
  }

  if ([TOKEN_CONNECTION_STATUSES.BLOCKED, TOKEN_CONNECTION_STATUSES.DISABLED].includes(safeToken.systemUserAccessTokenConnectionStatus)) {
    rows.push({
      ...baseRow,
      id: `token:${safeToken.id}:system-user`,
      message:
        safeToken.systemUserAccessTokenConnectionMessage ||
        `System user access token is ${String(safeToken.systemUserAccessTokenConnectionStatus).toLowerCase()}`,
    });
  }

  return rows;
}

function applyErrorFilters(rows, { type = '', status = '', search = '' } = {}) {
  const normalizedType = normalizeText(type).toUpperCase();
  const normalizedStatus = normalizeText(status).toUpperCase();
  const normalizedSearch = normalizeText(search).toLowerCase();

  return rows.filter((row) => {
    if (normalizedType && row.errorType !== normalizedType) {
      return false;
    }

    if (normalizedStatus) {
      if (normalizedStatus === 'OPEN' && row.status === 'SUCCESS') {
        return false;
      }

      if (normalizedStatus === 'RETRYABLE' && !row.canRetry) {
        return false;
      }

      if (!['OPEN', 'RETRYABLE'].includes(normalizedStatus) && row.status !== normalizedStatus) {
        return false;
      }
    }

    if (!normalizedSearch) {
      return true;
    }

    return [
      row.message,
      row.status,
      row.errorType,
      row.successMessage,
      row.campaignId,
      row.campaignName,
      row.tokenLabel,
      row.brandName,
      row.agencyName,
      row.adsPowerProfile,
      row.adAccount?.name,
      row.adAccount?.id,
      row.page?.name,
      row.pixel?.name,
      row.resumeFromStep,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch));
  });
}

function summarizeErrorRows(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;

      if (row.status === 'SUCCESS') {
        summary.success += 1;
      } else {
        summary.open += 1;
      }

      if (row.canRetry) {
        summary.retryable += 1;
      }

      if (row.status === PUBLISH_QUEUE_STATUSES.BLOCKED || row.errorType === 'BLOCKED') {
        summary.blocked += 1;
      }

      if (row.errorType === 'AUTH') {
        summary.auth += 1;
      }

      return summary;
    },
    {
      total: 0,
      open: 0,
      success: 0,
      retryable: 0,
      blocked: 0,
      auth: 0,
    }
  );
}

function buildGraphUrl(path, params = {}) {
  const url = new URL(`${GRAPH_API_BASE}/${path.replace(/^\//, '')}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
  });

  return url;
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

async function recordApiCall(token) {
  await tokenService.recordTokenApiCall(token.id, token.tokenType);
}

async function postToMeta({ token, path, params = {} }) {
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

  const response = await fetch(buildGraphUrl(path), {
    method: 'POST',
    body,
  });
  await recordApiCall(token);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error) {
    await tokenService.markTokenBlockedFromMetaError({
      tokenId: token.id,
      payload,
      tokenType: token.tokenType,
    });
    throw new HttpError(400, buildMetaErrorMessage(path, payload), {
      metaError: payload?.error || null,
    });
  }

  return payload;
}

async function getFromMeta({ token, path, params = {} }) {
  const url = buildGraphUrl(path, {
    access_token: token.accessToken,
    ...params,
  });

  await waitForMetaApiPacing();

  const response = await fetch(url);
  await recordApiCall(token);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error) {
    await tokenService.markTokenBlockedFromMetaError({
      tokenId: token.id,
      payload,
      tokenType: token.tokenType,
    });
    throw new HttpError(400, buildMetaErrorMessage(path, payload), {
      metaError: payload?.error || null,
    });
  }

  return payload;
}

async function getMetaCollection({ token, path, fields }) {
  const items = [];
  let nextUrl = buildGraphUrl(path, {
    access_token: token.accessToken,
    fields,
    limit: META_ACCESS_COLLECTION_LIMIT,
  }).toString();

  while (nextUrl) {
    await waitForMetaApiPacing();

    const response = await fetch(nextUrl);
    await recordApiCall(token);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.error) {
      await tokenService.markTokenBlockedFromMetaError({
        tokenId: token.id,
        payload,
        tokenType: token.tokenType,
      });
      throw new HttpError(400, buildMetaErrorMessage(path, payload), {
        metaError: payload?.error || null,
      });
    }

    if (Array.isArray(payload.data)) {
      items.push(...payload.data);
    }

    nextUrl = payload.paging?.next || '';
  }

  return items;
}

function getBudgetMultiplier(currency) {
  return ZERO_DECIMAL_CURRENCIES.has(String(currency || '').toUpperCase()) ? 1 : 100;
}

function toStoredBudgetAmount(value, currency) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return '';
  }

  return String(Math.round(numericValue * getBudgetMultiplier(currency)));
}

function getSpecialAdCategories(value) {
  const normalizedValue = normalizeText(value);
  return !normalizedValue || normalizedValue === 'NONE' ? [] : [normalizedValue];
}

function mapAssetForHistory(asset) {
  if (!asset?.name && !asset?.type) {
    return null;
  }

  return {
    name: normalizeText(asset.name),
    type: normalizeText(asset.type),
    size: Number(asset.size || asset.buffer?.length || 0),
  };
}

function mapLaunchForHistory({ launch, media, thumbnail, accountLaunch = null, retryPayload = null }) {
  return {
    launchLabel: launch.launchLabel,
    launchItemId: accountLaunch?.launchItemId || '',
    bulkId: launch.bulkId || launch.publishSessionId || '',
    bulkLabel: launch.bulkLabel || launch.launchLabel || '',
    bulkSource: launch.bulkSource || '',
    templateId: launch.templateId || '',
    campaignTemplateId: accountLaunch?.campaignTemplateId || '',
    mediaTemplateId: accountLaunch?.mediaTemplateId || '',
    mediaAssetId: accountLaunch?.mediaAssetId || launch.mediaAssetId || '',
    thumbnailAssetId: accountLaunch?.thumbnailAssetId || launch.thumbnailAssetId || '',
    brandId: launch.brandId || '',
    brandName: launch.brandName || '',
    countries: launch.countries || [],
    countryLabel: launch.countryLabel || (launch.countries || []).join(', '),
    dailyBudget: launch.dailyBudget,
    page: {
      id: accountLaunch?.pageId || launch.pageId || '',
      name: accountLaunch?.pageName || launch.pageName || '',
    },
    pixel: {
      id: accountLaunch?.pixelId || launch.pixelId || '',
      name: accountLaunch?.pixelName || launch.pixelName || '',
    },
    websiteEvent: launch.websiteEvent || '',
    headline: launch.headline,
    primaryText: launch.primaryText,
    description: launch.description,
    websiteUrl: launch.websiteUrl,
    displayUrl: launch.displayUrl,
    urlParameters: launch.urlParameters || '',
    scheduleStart: launch.scheduleStart || '',
    scheduleEnd: launch.scheduleEnd || '',
    callToAction: launch.callToAction,
    media: mapAssetForHistory(media),
    thumbnail: mapAssetForHistory(thumbnail),
    staticDefaults: launch.staticDefaults || {},
    retryPayload,
  };
}

function getRetryAccessRequirements(campaign) {
  const retryPayload = campaign.launch?.retryPayload || {};
  const accountLaunch = Array.isArray(retryPayload.accountLaunches) ? retryPayload.accountLaunches[0] || {} : {};
  const adAccountId =
    normalizeText(retryPayload.selectedAdAccountIds?.[0]) ||
    normalizeText(retryPayload.selectedAdAccounts?.[0]?.id) ||
    normalizeText(campaign.adAccount?.id);
  const pageId =
    normalizeText(accountLaunch.pageId) ||
    normalizeText(retryPayload.pageId) ||
    normalizeText(campaign.launch?.page?.id);
  const pixelId =
    normalizeText(accountLaunch.pixelId) ||
    normalizeText(retryPayload.pixelId) ||
    normalizeText(campaign.launch?.pixel?.id);

  return {
    adAccountId: normalizeMetaNodeId(adAccountId, 'act'),
    pageId,
    pixelId,
    brandId: normalizeText(retryPayload.brandId) || normalizeText(campaign.launch?.brandId),
  };
}

function assertRetryTokenBrand({ token, campaign, selected }) {
  const requiredBrandId = getRetryAccessRequirements(campaign).brandId;

  if (!requiredBrandId) {
    return;
  }

  if (requiredBrandId !== token.brandId) {
    throw new HttpError(
      400,
      selected
        ? 'Selected retry token is not assigned to the same brand as this failed launch'
        : 'Replacement token is not assigned to the same brand as this failed launch'
    );
  }
}

async function assertRetryTokenMetaAccess({ token, campaign, selected = false }) {
  assertRetryTokenBrand({ token, campaign, selected });

  const requirements = getRetryAccessRequirements(campaign);
  const tokenLabel = token.label || 'Selected token';

  if (!requirements.adAccountId) {
    throw new HttpError(400, 'Cannot continue this failed launch because its ad account was not saved');
  }

  const adAccounts = await getMetaCollection({
    token,
    path: 'me/adaccounts',
    fields: 'id,account_id,name,currency',
  });
  const adAccount = adAccounts.find(
    (account) => metaIdsMatch(account.id, requirements.adAccountId) || metaIdsMatch(account.account_id, requirements.adAccountId)
  );

  if (!adAccount) {
    throw new HttpError(400, `${tokenLabel} does not have access to ad account ${requirements.adAccountId}`);
  }

  if (requirements.pageId) {
    const pages = await getMetaCollection({
      token,
      path: 'me/accounts',
      fields: 'id,name',
    });
    const page = pages.find((item) => metaIdsMatch(item.id, requirements.pageId));

    if (!page) {
      throw new HttpError(400, `${tokenLabel} does not have access to Facebook page ${requirements.pageId}`);
    }
  }

  if (requirements.pixelId) {
    const pixels = await getMetaCollection({
      token,
      path: `${requirements.adAccountId}/adspixels`,
      fields: 'id,name',
    });
    const pixel = pixels.find((item) => metaIdsMatch(item.id, requirements.pixelId));

    if (!pixel) {
      throw new HttpError(400, `${tokenLabel} does not have access to pixel ${requirements.pixelId}`);
    }
  }

  return {
    adAccount,
    requirements,
  };
}

async function findAccessibleReplacementToken({ campaign, tokenType, actor, excludeTokenIds = [] }) {
  const requirements = getRetryAccessRequirements(campaign);
  const excluded = new Set(excludeTokenIds.map((item) => normalizeText(item)).filter(Boolean));
  const candidates = await tokenService.listActiveTokensWithSecrets({
    tokenType,
  });

  for (const candidate of candidates) {
    if (excluded.has(candidate.id)) {
      continue;
    }

    if (requirements.brandId && candidate.brandId !== requirements.brandId) {
      continue;
    }

    try {
      await assertRetryTokenMetaAccess({
        token: candidate,
        campaign,
      });

      return candidate;
    } catch (error) {
      await writeActivityLog({
        user: actor,
        action: 'ADS_PUBLISH_QUEUE_REPLACEMENT_TOKEN_SKIPPED',
        entity: 'ManagedCampaign',
        entityId: campaign._id?.toString?.(),
        metadata: {
          campaignId: campaign.campaignId,
          tokenId: candidate.id,
          reason: error.message,
        },
      });
    }
  }

  return null;
}

async function resolveRetryTokenForCampaign({ campaign, tokenType, retryTokenId = '', actor = null }) {
  const selectedRetryTokenId = normalizeText(retryTokenId);
  const originalTokenId = campaign.tokenId;

  if (selectedRetryTokenId) {
    const selectedToken = await tokenService.getActiveTokenWithSecret(selectedRetryTokenId, tokenType);
    await assertRetryTokenMetaAccess({
      token: selectedToken,
      campaign,
      selected: true,
    });

    return {
      token: selectedToken,
      switched: selectedToken.id !== originalTokenId,
      selected: true,
    };
  }

  try {
    const originalToken = await tokenService.getActiveTokenWithSecret(originalTokenId, tokenType);
    await assertRetryTokenMetaAccess({
      token: originalToken,
      campaign,
    });

    return {
      token: originalToken,
      switched: false,
      selected: false,
    };
  } catch (originalError) {
    const replacementToken = await findAccessibleReplacementToken({
      campaign,
      tokenType,
      actor,
      excludeTokenIds: [originalTokenId],
    });

    if (!replacementToken) {
      throw new HttpError(
        400,
        `${originalError.message}. No other assigned active token could access this unfinished launch. Choose a replacement token that has access to the ad account, page, and pixel.`
      );
    }

    return {
      token: replacementToken,
      switched: true,
      selected: false,
    };
  }
}

function buildResumeState({ account, campaignId = '', adSetId = '', creativeId = '', adId = '' }) {
  const normalizedCampaignId = normalizeText(campaignId);
  const resumeState = {
    adAccountId: account.id,
    campaignId: normalizedCampaignId && !normalizedCampaignId.startsWith('failed_') ? normalizedCampaignId : '',
    adSetId: normalizeText(adSetId),
    creativeId: normalizeText(creativeId),
    adId: normalizeText(adId),
  };

  return resumeState.campaignId || resumeState.adSetId || resumeState.creativeId || resumeState.adId ? resumeState : null;
}

function buildSingleAccountRetryPayload({ launch, account, accountLaunch = null, campaign = null, adSet = null, creative = null, ad = null }) {
  const payload = {
    ...launch,
    media: null,
    thumbnail: null,
    selectedAdAccountIds: [account.id],
    selectedAdAccounts: [
      {
        id: account.id,
        accountId: account.accountId || String(account.id || '').replace(/^act_/, ''),
        name: account.name || account.id,
        currency: account.currency || '',
      },
    ],
  };

  if (accountLaunch) {
    payload.accountLaunches = [
      {
        launchItemId: accountLaunch.launchItemId || '',
        adAccountId: account.id,
        campaignTemplateId: accountLaunch.campaignTemplateId || '',
        mediaTemplateId: accountLaunch.mediaTemplateId || '',
        mediaAssetId: accountLaunch.mediaAssetId || '',
        thumbnailAssetId: accountLaunch.thumbnailAssetId || '',
        pageId: accountLaunch.pageId || payload.pageId || '',
        pageName: accountLaunch.pageName || payload.pageName || '',
        pixelId: accountLaunch.pixelId || payload.pixelId || '',
        pixelName: accountLaunch.pixelName || payload.pixelName || '',
      },
    ];
  }

  const resumeState = buildResumeState({
    account,
    campaignId: campaign?.id,
    adSetId: adSet?.id,
    creativeId: creative?.id,
    adId: ad?.id,
  });

  if (resumeState) {
    if (accountLaunch?.launchItemId) {
      resumeState.launchItemId = accountLaunch.launchItemId;
    }
    payload.resumeState = {
      [accountLaunch?.launchItemId || account.id]: resumeState,
    };
  }

  return payload;
}

function pushAction({ action, status = '', message = '', actor = null }) {
  return {
    action,
    status,
    message,
    actor: actor?._id || actor?.id || null,
    at: new Date(),
  };
}

async function resolveCampaignActor(campaign, fallbackActor = null) {
  const actorId = campaign?.createdBy || campaign?.updatedBy || fallbackActor?._id || fallbackActor?.id;

  if (!actorId) {
    return fallbackActor;
  }

  const user = await User.findById(actorId).select('name email role status').lean();
  return user || fallbackActor || { _id: actorId };
}

async function markQueueRunning({ campaign, actor, source = 'manual' }) {
  const now = new Date();
  const nextAttemptCount = Number(campaign.publishQueue?.attemptCount || 0) + 1;

  campaign.publishQueue = {
    ...(campaign.publishQueue?.toObject?.() || campaign.publishQueue || {}),
    status: PUBLISH_QUEUE_STATUSES.RUNNING,
    source,
    runningStartedAt: now,
    lastAttemptAt: now,
    attemptCount: nextAttemptCount,
    lastError: '',
  };
  campaign.lastActionAt = now;
  campaign.actionHistory.push(
    pushAction({
      action: 'PUBLISH_QUEUE_RUNNING',
      status: PUBLISH_QUEUE_STATUSES.RUNNING,
      message: `Queued publish retry started by ${source}`,
      actor,
    })
  );
  await campaign.save();
}

async function markQueueCompleted({ campaign, actor, message = 'Queued publish retry completed' }) {
  const now = new Date();

  campaign.publishQueue = {
    ...(campaign.publishQueue?.toObject?.() || campaign.publishQueue || {}),
    status: PUBLISH_QUEUE_STATUSES.COMPLETED,
    runningStartedAt: null,
    nextAttemptAt: null,
    completedAt: now,
    lastError: '',
  };
  campaign.lastActionAt = now;
  campaign.actionHistory.push(
    pushAction({
      action: 'PUBLISH_QUEUE_COMPLETED',
      status: PUBLISH_QUEUE_STATUSES.COMPLETED,
      message,
      actor,
    })
  );
  await campaign.save();
}

async function markQueueBlocked({ campaign, error, actor, tokenType = '', notify = true }) {
  const now = new Date();
  const delayMs = getQueueRetryDelayMs({
    retryAfterSeconds: error.retryAfterSeconds,
    attemptCount: campaign.publishQueue?.attemptCount,
  });
  const nextAttemptAt = new Date(now.getTime() + delayMs);

  campaign.publishQueue = {
    ...(campaign.publishQueue?.toObject?.() || campaign.publishQueue || {}),
    status: PUBLISH_QUEUE_STATUSES.BLOCKED,
    reason: error.message || campaign.publishQueue?.reason || 'Meta API is temporarily blocked',
    tokenType: normalizeText(tokenType) || campaign.publishQueue?.tokenType || '',
    source: 'meta-block',
    queuedAt: campaign.publishQueue?.queuedAt || now,
    nextAttemptAt,
    runningStartedAt: null,
    completedAt: null,
    clearedAt: null,
    lastError: error.message || 'Meta API is temporarily blocked',
    queuedBy: campaign.publishQueue?.queuedBy || actor?._id || actor?.id || null,
  };
  campaign.lastMetaError = error.message || campaign.lastMetaError;
  campaign.lastActionAt = now;
  campaign.actionHistory.push(
    pushAction({
      action: 'PUBLISH_QUEUE_BLOCKED',
      status: PUBLISH_QUEUE_STATUSES.BLOCKED,
      message: `Retry paused until ${nextAttemptAt.toISOString()}`,
      actor,
    })
  );
  await campaign.save();
  schedulePublishQueueRun(delayMs);

  if (notify) {
    await settingsService.notifyPublishQueueStatus({
      status: 'blocked',
      message: `Meta/API block detected. Queue will retry after ${nextAttemptAt.toLocaleString()}.`,
      records: [campaign.toSafeObject()],
    });
  }
}

async function markQueueFailed({ campaign, error, actor }) {
  const now = new Date();

  campaign.publishQueue = {
    ...(campaign.publishQueue?.toObject?.() || campaign.publishQueue || {}),
    status: PUBLISH_QUEUE_STATUSES.FAILED,
    runningStartedAt: null,
    nextAttemptAt: null,
    lastError: error.message || 'Queued retry failed',
  };
  campaign.lastMetaError = error.message || campaign.lastMetaError;
  campaign.lastActionAt = now;
  campaign.actionHistory.push(
    pushAction({
      action: 'PUBLISH_QUEUE_FAILED',
      status: PUBLISH_QUEUE_STATUSES.FAILED,
      message: error.message || 'Queued retry failed',
      actor,
    })
  );
  await campaign.save();
}

function buildCampaignQuery({ tokenId, adAccountIds = [], status }) {
  const query = {};
  const normalizedTokenId = normalizeText(tokenId);
  const normalizedStatus = normalizeText(status);
  const normalizedAccountIds = dedupeStrings(adAccountIds);

  if (normalizedTokenId) {
    query.tokenId = normalizedTokenId;
  }

  if (normalizedStatus) {
    query.status = normalizedStatus;
  }

  if (normalizedAccountIds.length) {
    query['adAccount.id'] = {
      $in: normalizedAccountIds,
    };
  }

  return query;
}

function normalizeStoredCampaign(campaign) {
  return campaign.toSafeObject();
}

async function getLocalAdAccounts({ tokenId }) {
  const accountRecords = await ManagedCampaign.find({
    tokenId,
    'adAccount.id': {
      $ne: '',
    },
  })
    .select('adAccount')
    .lean();

  const accountsById = new Map();

  accountRecords.forEach((record) => {
    const account = record.adAccount || {};

    if (!account.id || accountsById.has(account.id)) {
      return;
    }

    accountsById.set(account.id, {
      id: account.id,
      accountId: account.accountId || '',
      name: account.name || account.id,
      currency: account.currency || '',
    });
  });

  return Array.from(accountsById.values()).sort((left, right) => left.name.localeCompare(right.name));
}

async function listCampaigns({ tokenId, adAccountIds = [], status }) {
  const normalizedTokenId = normalizeText(tokenId);

  if (!normalizedTokenId) {
    throw new HttpError(400, 'Token id is required');
  }

  const query = buildCampaignQuery({
    tokenId: normalizedTokenId,
    adAccountIds,
    status,
  });
  const [campaigns, adAccounts] = await Promise.all([
    ManagedCampaign.find(query).sort({ updatedAt: -1, createdAt: -1 }),
    getLocalAdAccounts({ tokenId: normalizedTokenId }),
  ]);

  return {
    campaigns: campaigns.map(normalizeStoredCampaign),
    warnings: [],
    filters: {
      adAccounts,
    },
    summary: {
      source: 'mongo-history',
      campaigns: campaigns.length,
      accounts: adAccounts.length,
    },
  };
}

async function listDynamicHistory({ actor = null, tokenId = '', status = '', search = '', brandId = '', page = 1, limit = 25 } = {}) {
  const pagination = normalizeHistoryPagination({ page, limit });
  const normalizedTokenId = normalizeText(tokenId);
  const query = {
    ...campaignAccessFilter(actor),
    $or: [
      {
        'launch.launchItemId': {
          $nin: ['', null],
        },
      },
      {
        'launch.campaignTemplateId': {
          $nin: ['', null],
        },
      },
      {
        'launch.mediaTemplateId': {
          $nin: ['', null],
        },
      },
    ],
  };

  if (normalizedTokenId) {
    query.tokenId = normalizedTokenId;
  }

  const campaigns = await ManagedCampaign.find(query).sort({ updatedAt: -1, createdAt: -1 });
  const tokenIds = Array.from(
    new Set(campaigns.map((campaign) => normalizeText(campaign.tokenId)).filter((id) => mongoose.Types.ObjectId.isValid(id)))
  );
  const tokens = tokenIds.length
    ? await Token.find({ _id: { $in: tokenIds } }).populate('brand', 'name color').populate('agency', 'name')
    : [];
  const tokenContextById = new Map(
    tokens.map((token) => {
      const context = buildTokenContext(token);
      return [context.id, context];
    })
  );
  const rows = campaigns.map((campaign) => buildDynamicHistoryRow(campaign, tokenContextById));
  const filteredRows = applyDynamicHistoryFilters(rows, { status, search, brandId });
  const pageRows = filteredRows.slice(pagination.skip, pagination.skip + pagination.limit);

  return {
    history: pageRows,
    summary: summarizeDynamicHistoryRows(filteredRows),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: filteredRows.length,
      pages: Math.max(Math.ceil(filteredRows.length / pagination.limit), 1),
    },
    filters: {
      tokenId: normalizedTokenId,
      status: normalizeText(status).toUpperCase(),
      search: normalizeText(search),
      brandId: normalizeText(brandId),
    },
  };
}

async function listErrors({ actor = null, tokenId = '', type = '', status = '', search = '', page = 1, limit = 25 } = {}) {
  const pagination = normalizeErrorPagination({ page, limit });
  const normalizedTokenId = normalizeText(tokenId);
  const accessFilter = campaignAccessFilter(actor);
  const campaignQuery = {
    ...accessFilter,
    $or: [
      { status: 'FAILED' },
      {
        lastMetaError: {
          $nin: ['', null],
        },
      },
      {
        'publishQueue.status': {
          $in: ACTIVE_PUBLISH_QUEUE_STATUSES,
        },
      },
      {
        'actionHistory.action': 'RETRY_SUCCEEDED',
      },
    ],
  };

  if (normalizedTokenId) {
    campaignQuery.tokenId = normalizedTokenId;
  }

  const tokenQuery = {
    ...tokenAccessFilter(actor),
    $or: [
      { status: TOKEN_STATUSES.DEACTIVE },
      { connectionStatus: { $in: [TOKEN_CONNECTION_STATUSES.BLOCKED, TOKEN_CONNECTION_STATUSES.DISABLED] } },
      { systemUserConnectionStatus: { $in: [TOKEN_CONNECTION_STATUSES.BLOCKED, TOKEN_CONNECTION_STATUSES.DISABLED] } },
    ],
  };

  if (normalizedTokenId) {
    tokenQuery._id = normalizedTokenId;
  }

  const [campaigns, tokens] = await Promise.all([
    ManagedCampaign.find(campaignQuery).sort({ updatedAt: -1, createdAt: -1 }).limit(300),
    Token.find(tokenQuery).populate('brand', 'name color').populate('agency', 'name').sort({ updatedAt: -1, createdAt: -1 }).limit(100),
  ]);
  const campaignTokenIds = Array.from(
    new Set(campaigns.map((campaign) => normalizeText(campaign.tokenId)).filter((id) => mongoose.Types.ObjectId.isValid(id)))
  );
  const campaignTokens = campaignTokenIds.length
    ? await Token.find({ _id: { $in: campaignTokenIds } }).populate('brand', 'name color').populate('agency', 'name')
    : [];
  const tokenContextById = new Map(
    [...campaignTokens, ...tokens].map((token) => {
      const context = buildTokenContext(token);
      return [context.id, context];
    })
  );
  const campaignRows = campaigns.map((campaign) => buildCampaignErrorRow(campaign, tokenContextById)).filter((row) => row?.message);
  const tokenRows = tokens.flatMap(buildTokenErrorRows);
  const allRows = [...campaignRows, ...tokenRows].sort(
    (left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
  );
  const filteredRows = applyErrorFilters(allRows, { type, status, search });
  const pageRows = filteredRows.slice(pagination.skip, pagination.skip + pagination.limit);

  return {
    errors: pageRows,
    summary: summarizeErrorRows(filteredRows),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: filteredRows.length,
      pages: Math.max(Math.ceil(filteredRows.length / pagination.limit), 1),
    },
    filters: {
      type: normalizeText(type).toUpperCase(),
      status: normalizeText(status).toUpperCase(),
      search: normalizeText(search),
      tokenId: normalizedTokenId,
    },
  };
}

async function clearRecoveredErrors({ actor = null, req = null } = {}) {
  const accessFilter = campaignAccessFilter(actor);
  const candidates = await ManagedCampaign.find({
    ...accessFilter,
    status: {
      $ne: 'FAILED',
    },
    lastMetaError: {
      $in: ['', null],
    },
    'actionHistory.action': 'RETRY_SUCCEEDED',
  });
  let cleared = 0;

  for (const campaign of candidates) {
    const latestRecoveryAction = getLatestRecoveryAction(campaign);
    const latestClearedAction = [...(campaign.actionHistory || [])]
      .reverse()
      .find((item) => normalizeText(item.action).toUpperCase() === 'ERROR_SUCCESS_CLEARED');
    const recoveryTime = latestRecoveryAction?.at ? new Date(latestRecoveryAction.at).getTime() : 0;
    const clearedTime = latestClearedAction?.at ? new Date(latestClearedAction.at).getTime() : 0;

    if (!latestRecoveryAction || clearedTime > recoveryTime) {
      continue;
    }

    campaign.actionHistory.push(
      pushAction({
        action: 'ERROR_SUCCESS_CLEARED',
        status: 'SUCCESS',
        message: 'Recovered error hidden from Errors table',
        actor,
      })
    );
    campaign.lastActionAt = new Date();
    campaign.updatedBy = actor?._id || actor?.id || null;
    await campaign.save();
    cleared += 1;
  }

  await writeActivityLog({
    user: actor,
    action: 'ADS_ERRORS_SUCCESS_CLEARED',
    entity: 'ManagedCampaign',
    metadata: {
      cleared,
    },
    req,
  });

  return {
    message: `${cleared} recovered error${cleared === 1 ? '' : 's'} cleared`,
    cleared,
  };
}

async function getCampaignForAction({ tokenId, campaignId, actor = null }) {
  const normalizedTokenId = normalizeText(tokenId);
  const normalizedCampaignId = normalizeText(campaignId);

  if (!normalizedTokenId) {
    throw new HttpError(400, 'Token id is required');
  }

  if (!normalizedCampaignId) {
    throw new HttpError(400, 'Campaign id is required');
  }

  const campaign = await ManagedCampaign.findOne({
    ...campaignAccessFilter(actor),
    tokenId: normalizedTokenId,
    campaignId: normalizedCampaignId,
  });

  if (!campaign) {
    throw new HttpError(404, 'Campaign was not found in saved launch history');
  }

  return campaign;
}

async function rememberMetaActionFailure({ campaign, action, error, actor }) {
  campaign.lastMetaError = error.message;
  campaign.lastActionAt = new Date();
  campaign.actionHistory.push(
    pushAction({
      action,
      message: error.message,
      actor,
    })
  );
  await campaign.save();
}

async function recordPublishedCampaign({ token, launch, account, names, campaign, adSet, creative, ad, media, thumbnail, accountLaunch = null, actor }) {
  const status = normalizeText(launch.staticDefaults?.campaignStatus) || 'PAUSED';
  const budgetLevel = normalizeText(launch.staticDefaults?.budgetLevel) === 'CAMPAIGN' ? 'Campaign daily' : 'Ad set daily';
  const campaignId = normalizeText(campaign?.id);

  if (!campaignId) {
    throw new HttpError(400, 'Cannot save campaign history without a Meta campaign id');
  }

  const now = new Date();
  const history = await ManagedCampaign.findOneAndUpdate(
    {
      campaignId,
    },
    {
      $set: {
        tokenId: token.id,
        tokenLabel: token.label || '',
        campaignId,
        name: names.campaignName,
        status,
        effectiveStatus: status,
        objective: launch.objective,
        buyingType: launch.staticDefaults?.buyingType || 'AUCTION',
        adAccount: {
          id: account.id,
          accountId: account.accountId || String(account.id || '').replace(/^act_/, ''),
          name: account.name || account.id,
          currency: account.currency || '',
        },
        adSetId: normalizeText(adSet?.id),
        adSetName: names.adSetName,
        creativeId: normalizeText(creative?.id),
        creativeName: names.adName,
        adId: normalizeText(ad?.id),
        adName: names.adName,
        budget: {
          type: budgetLevel,
          amount: toStoredBudgetAmount(launch.dailyBudget, account.currency),
          currency: account.currency || '',
        },
        budgetRemaining: '',
        spendCap: '',
        insights: {
          spend: '0',
          impressions: '0',
          reach: '0',
          clicks: '0',
          ctr: '0',
          cpc: '0',
          cpm: '0',
        },
        specialAdCategories: getSpecialAdCategories(launch.staticDefaults?.specialAdCategories),
        launch: mapLaunchForHistory({
          launch,
          media,
          thumbnail,
          accountLaunch,
          retryPayload: null,
        }),
        source: 'ADS_LAUNCH',
        duplicatedFromCampaignId: '',
        deletedAt: null,
        lastActionAt: now,
        lastMetaError: '',
        createdBy: actor?._id || null,
        updatedBy: actor?._id || null,
      },
      $push: {
        actionHistory: pushAction({
          action: 'CREATED',
          status,
          message: 'Campaign created from Ads Launch',
          actor,
        }),
      },
    },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return history.toSafeObject();
}

async function recordFailedLaunch({
  token,
  launch,
  account,
  names = {},
  campaign = null,
  adSet = null,
  creative = null,
  ad = null,
  media = null,
  thumbnail = null,
  accountLaunch = null,
  error,
  queue = null,
  actor,
  req,
}) {
  const campaignId = normalizeText(campaign?.id) || `failed_${token.id}_${account.id}_${Date.now()}`;
  const failedName = names.campaignName || launch.launchLabel || `Failed launch | ${account.name || account.id}`;
  const retryPayload = buildSingleAccountRetryPayload({
    launch,
    account,
    accountLaunch,
    campaign,
    adSet,
    creative,
    ad,
  });
  const now = new Date();
  const existingFailure = await ManagedCampaign.findOne({ campaignId }).select('publishQueue').lean();
  const existingQueue = existingFailure?.publishQueue || {};
  const queueDelayMs = queue
    ? getQueueRetryDelayMs({
        retryAfterSeconds: queue.retryAfterSeconds,
        attemptCount: existingQueue.attemptCount,
      })
    : 0;
  const nextAttemptAt = queue ? new Date(now.getTime() + queueDelayMs) : null;
  const queueUpdate = queue
    ? {
        status: PUBLISH_QUEUE_STATUSES.PENDING,
        reason: normalizeText(queue.reason) || error?.message || 'Meta API is temporarily blocked',
        tokenType: normalizeText(queue.tokenType) || token.tokenType || '',
        source: 'meta-block',
        queuedAt: existingQueue.queuedAt || now,
        nextAttemptAt,
        runningStartedAt: null,
        completedAt: null,
        clearedAt: null,
        attemptCount: Number(existingQueue.attemptCount || 0),
        lastAttemptAt: existingQueue.lastAttemptAt || null,
        lastError: error?.message || 'Meta API is temporarily blocked',
        queuedBy: actor?._id || actor?.id || existingQueue.queuedBy || null,
      }
    : null;

  const history = await ManagedCampaign.findOneAndUpdate(
    {
      campaignId,
    },
    {
      $set: {
        tokenId: token.id,
        tokenLabel: token.label || '',
        campaignId,
        name: failedName,
        status: 'FAILED',
        effectiveStatus: 'FAILED',
        objective: launch.objective,
        buyingType: launch.staticDefaults?.buyingType || 'AUCTION',
        adAccount: {
          id: account.id,
          accountId: account.accountId || String(account.id || '').replace(/^act_/, ''),
          name: account.name || account.id,
          currency: account.currency || '',
        },
        adSetId: normalizeText(adSet?.id),
        adSetName: names.adSetName || '',
        creativeId: normalizeText(creative?.id),
        creativeName: names.adName || '',
        adId: normalizeText(ad?.id),
        adName: names.adName || '',
        budget: {
          type: normalizeText(launch.staticDefaults?.budgetLevel) === 'CAMPAIGN' ? 'Campaign daily' : 'Ad set daily',
          amount: toStoredBudgetAmount(launch.dailyBudget, account.currency),
          currency: account.currency || '',
        },
        specialAdCategories: getSpecialAdCategories(launch.staticDefaults?.specialAdCategories),
        launch: mapLaunchForHistory({
          launch,
          media,
          thumbnail,
          accountLaunch,
          retryPayload,
        }),
        source: 'ADS_LAUNCH_FAILED',
        deletedAt: null,
        lastActionAt: now,
        lastMetaError: error?.message || 'Publish failed',
        ...(queueUpdate ? { publishQueue: queueUpdate } : {}),
        createdBy: actor?._id || null,
        updatedBy: actor?._id || null,
      },
      $push: {
        actionHistory: pushAction({
          action: 'PUBLISH_FAILED',
          status: 'FAILED',
          message: error?.message || 'Publish failed',
          actor,
        }),
      },
    },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  await writeActivityLog({
    user: actor,
    action: 'ADS_LAUNCH_PUBLISH_FAILED_SAVED',
    entity: 'ManagedCampaign',
    entityId: history._id.toString(),
    metadata: {
      campaignId,
      adAccountId: account.id,
      adAccountName: account.name || account.id,
      launchLabel: launch.launchLabel,
      error: error?.message || 'Publish failed',
    },
    req,
  });

  if (queueUpdate) {
    schedulePublishQueueRun(queueDelayMs);
    if (queue.notify !== false) {
      await settingsService.notifyPublishQueueStatus({
        status: 'queued',
        message: `Meta/API block saved this failed publish for automatic retry after ${nextAttemptAt.toLocaleString()}.`,
        records: [history.toSafeObject()],
      });
    }
  }

  return history.toSafeObject();
}

async function updateCampaignStatus({ tokenId, campaignId, status, actor, req }) {
  const normalizedStatus = normalizeText(status).toUpperCase();

  if (!ALLOWED_STATUS_UPDATES.has(normalizedStatus)) {
    throw new HttpError(400, 'Campaign status must be ACTIVE or PAUSED');
  }

  const campaign = await getCampaignForAction({ tokenId, campaignId, actor });
  const token = await tokenService.getActiveTokenWithSecret(tokenId);

  try {
    const payload = await postToMeta({
      token,
      path: campaign.campaignId,
      params: {
        status: normalizedStatus,
      },
    });

    campaign.status = normalizedStatus;
    campaign.effectiveStatus = normalizedStatus;
    campaign.updatedBy = actor?._id || null;
    campaign.lastActionAt = new Date();
    campaign.lastMetaError = '';
    campaign.actionHistory.push(
      pushAction({
        action: 'STATUS_UPDATED',
        status: normalizedStatus,
        message: `Campaign ${normalizedStatus === 'PAUSED' ? 'paused' : 'activated'} in Meta`,
        actor,
      })
    );
    await campaign.save();

    await writeActivityLog({
      user: actor,
      action: 'ADS_MANAGE_CAMPAIGN_STATUS_UPDATED',
      entity: 'Campaign',
      entityId: campaign.campaignId,
      metadata: {
        status: normalizedStatus,
      },
      req,
    });

    return {
      message: `Campaign ${normalizedStatus === 'PAUSED' ? 'paused' : 'activated'} successfully`,
      campaign: campaign.toSafeObject(),
      campaignId: campaign.campaignId,
      status: normalizedStatus,
      meta: payload,
    };
  } catch (error) {
    await rememberMetaActionFailure({
      campaign,
      action: 'STATUS_UPDATE_FAILED',
      error,
      actor,
    });
    throw error;
  }
}

function getCopiedCampaignId(payload) {
  return (
    payload.copied_campaign_id ||
    payload.campaign_id ||
    payload.id ||
    payload.data?.copied_campaign_id ||
    payload.data?.id ||
    null
  );
}

async function duplicateCampaign({ tokenId, campaignId, name, status = 'PAUSED', deepCopy = true, actor, req }) {
  const normalizedName = normalizeText(name);
  const normalizedStatus = normalizeText(status).toUpperCase() || 'PAUSED';

  if (!normalizedName) {
    throw new HttpError(400, 'New campaign name is required');
  }

  if (!ALLOWED_STATUS_UPDATES.has(normalizedStatus)) {
    throw new HttpError(400, 'New campaign status must be ACTIVE or PAUSED');
  }

  const sourceCampaign = await getCampaignForAction({ tokenId, campaignId, actor });

  if (sourceCampaign.status === 'DELETED') {
    throw new HttpError(400, 'Deleted campaigns cannot be duplicated');
  }

  const token = await tokenService.getActiveTokenWithSecret(tokenId);

  try {
    const copyPayload = await postToMeta({
      token,
      path: `${sourceCampaign.campaignId}/copies`,
      params: {
        deep_copy: Boolean(deepCopy),
        status_option: normalizedStatus,
      },
    });
    const copiedCampaignId = getCopiedCampaignId(copyPayload);
    let copiedCampaign = null;

    if (copiedCampaignId) {
      await postToMeta({
        token,
        path: copiedCampaignId,
        params: {
          name: normalizedName,
          status: normalizedStatus,
        },
      });

      copiedCampaign = await ManagedCampaign.findOneAndUpdate(
        {
          campaignId: copiedCampaignId,
        },
        {
          $set: {
            tokenId: sourceCampaign.tokenId,
            tokenLabel: sourceCampaign.tokenLabel,
            campaignId: copiedCampaignId,
            name: normalizedName,
            status: normalizedStatus,
            effectiveStatus: normalizedStatus,
            objective: sourceCampaign.objective,
            buyingType: sourceCampaign.buyingType,
            adAccount: sourceCampaign.adAccount,
            adSetId: '',
            adSetName: sourceCampaign.adSetName ? `${sourceCampaign.adSetName} Copy` : '',
            creativeId: '',
            creativeName: sourceCampaign.creativeName ? `${sourceCampaign.creativeName} Copy` : '',
            adId: '',
            adName: sourceCampaign.adName ? `${sourceCampaign.adName} Copy` : '',
            budget: sourceCampaign.budget,
            budgetRemaining: '',
            spendCap: '',
            insights: {
              spend: '0',
              impressions: '0',
              reach: '0',
              clicks: '0',
              ctr: '0',
              cpc: '0',
              cpm: '0',
            },
            specialAdCategories: sourceCampaign.specialAdCategories,
            launch: sourceCampaign.launch,
            source: 'DUPLICATE',
            duplicatedFromCampaignId: sourceCampaign.campaignId,
            deletedAt: null,
            lastActionAt: new Date(),
            lastMetaError: '',
            createdBy: actor?._id || null,
            updatedBy: actor?._id || null,
          },
          $push: {
            actionHistory: pushAction({
              action: 'DUPLICATED',
              status: normalizedStatus,
              message: `Duplicated from ${sourceCampaign.campaignId}`,
              actor,
            }),
          },
        },
        {
          returnDocument: 'after',
          upsert: true,
          setDefaultsOnInsert: true,
        }
      );
    }

    sourceCampaign.lastActionAt = new Date();
    sourceCampaign.lastMetaError = '';
    sourceCampaign.actionHistory.push(
      pushAction({
        action: 'DUPLICATE_REQUESTED',
        status: normalizedStatus,
        message: copiedCampaignId ? `Created copy ${copiedCampaignId}` : 'Meta did not return a copied campaign id',
        actor,
      })
    );
    await sourceCampaign.save();

    await writeActivityLog({
      user: actor,
      action: 'ADS_MANAGE_CAMPAIGN_DUPLICATED',
      entity: 'Campaign',
      entityId: sourceCampaign.campaignId,
      metadata: {
        copiedCampaignId,
        name: normalizedName,
        status: normalizedStatus,
        deepCopy: Boolean(deepCopy),
      },
      req,
    });

    return {
      message: copiedCampaignId
        ? 'Campaign duplicated successfully'
        : 'Campaign duplication requested, but Meta did not return the copied campaign id',
      campaign: copiedCampaign ? copiedCampaign.toSafeObject() : null,
      campaignId: sourceCampaign.campaignId,
      copiedCampaignId,
      name: normalizedName,
      status: normalizedStatus,
      meta: copyPayload,
    };
  } catch (error) {
    await rememberMetaActionFailure({
      campaign: sourceCampaign,
      action: 'DUPLICATE_FAILED',
      error,
      actor,
    });
    throw error;
  }
}

async function deleteCampaign({ tokenId, campaignId, actor, req }) {
  const campaign = await getCampaignForAction({ tokenId, campaignId, actor });

  if (campaign.status === 'DELETED') {
    return {
      message: 'Campaign is already marked deleted',
      campaign: campaign.toSafeObject(),
      campaignId: campaign.campaignId,
      status: campaign.status,
    };
  }

  const token = await tokenService.getActiveTokenWithSecret(tokenId);

  try {
    const payload = await postToMeta({
      token,
      path: campaign.campaignId,
      params: {
        status: 'DELETED',
      },
    });

    campaign.status = 'DELETED';
    campaign.effectiveStatus = 'DELETED';
    campaign.deletedAt = new Date();
    campaign.updatedBy = actor?._id || null;
    campaign.lastActionAt = new Date();
    campaign.lastMetaError = '';
    campaign.actionHistory.push(
      pushAction({
        action: 'DELETED',
        status: 'DELETED',
        message: 'Campaign marked deleted in Meta',
        actor,
      })
    );
    await campaign.save();

    await writeActivityLog({
      user: actor,
      action: 'ADS_MANAGE_CAMPAIGN_DELETED',
      entity: 'Campaign',
      entityId: campaign.campaignId,
      metadata: {
        status: 'DELETED',
      },
      req,
    });

    return {
      message: 'Campaign deleted successfully',
      campaign: campaign.toSafeObject(),
      campaignId: campaign.campaignId,
      status: 'DELETED',
      meta: payload,
    };
  } catch (error) {
    await rememberMetaActionFailure({
      campaign,
      action: 'DELETE_FAILED',
      error,
      actor,
    });
    throw error;
  }
}

async function syncCampaignDetails({ tokenId, campaignId, actor, req }) {
  const campaign = await getCampaignForAction({ tokenId, campaignId, actor });

  if (campaign.campaignId.startsWith('failed_')) {
    throw new HttpError(400, 'This failed launch has no Meta campaign id to fetch yet');
  }

  const token = await tokenService.getActiveTokenWithSecret(tokenId);

  try {
    const payload = await getFromMeta({
      token,
      path: campaign.campaignId,
      params: {
        fields:
          'id,name,status,effective_status,objective,buying_type,daily_budget,lifetime_budget,budget_remaining,spend_cap,insights.date_preset(maximum).limit(1){spend,impressions,reach,clicks,ctr,cpc,cpm}',
      },
    });
    const insights = Array.isArray(payload.insights?.data) ? payload.insights.data[0] || {} : {};
    const budgetAmount = payload.daily_budget || payload.lifetime_budget || campaign.budget?.amount || '';

    campaign.name = normalizeText(payload.name) || campaign.name;
    campaign.status = normalizeText(payload.status) || campaign.status;
    campaign.effectiveStatus = normalizeText(payload.effective_status) || campaign.effectiveStatus;
    campaign.objective = normalizeText(payload.objective) || campaign.objective;
    campaign.buyingType = normalizeText(payload.buying_type) || campaign.buyingType;
    campaign.budget = {
      ...(campaign.budget || {}),
      type: payload.lifetime_budget ? 'Campaign lifetime' : campaign.budget?.type || 'Daily',
      amount: normalizeText(budgetAmount),
      currency: campaign.budget?.currency || campaign.adAccount?.currency || '',
    };
    campaign.budgetRemaining = normalizeText(payload.budget_remaining);
    campaign.spendCap = normalizeText(payload.spend_cap);
    campaign.insights = {
      spend: normalizeText(insights.spend) || '0',
      impressions: normalizeText(insights.impressions) || '0',
      reach: normalizeText(insights.reach) || '0',
      clicks: normalizeText(insights.clicks) || '0',
      ctr: normalizeText(insights.ctr) || '0',
      cpc: normalizeText(insights.cpc) || '0',
      cpm: normalizeText(insights.cpm) || '0',
    };
    campaign.updatedBy = actor?._id || null;
    campaign.lastActionAt = new Date();
    campaign.lastMetaError = '';
    campaign.actionHistory.push(
      pushAction({
        action: 'META_DETAILS_FETCHED',
        status: campaign.status,
        message: 'Fetched latest campaign status and basic insights from Meta',
        actor,
      })
    );
    await campaign.save();

    await writeActivityLog({
      user: actor,
      action: 'ADS_MANAGE_CAMPAIGN_SYNCED',
      entity: 'Campaign',
      entityId: campaign.campaignId,
      metadata: {
        status: campaign.status,
        effectiveStatus: campaign.effectiveStatus,
      },
      req,
    });

    return {
      message: 'Campaign details fetched from Meta',
      campaign: campaign.toSafeObject(),
      meta: payload,
    };
  } catch (error) {
    await rememberMetaActionFailure({
      campaign,
      action: 'META_DETAILS_FETCH_FAILED',
      error,
      actor,
    });
    throw error;
  }
}

async function checkFailedLaunchAccess({ tokenId, campaignId, actor, tokenType = null, retryTokenId = '' }) {
  const campaign = await getCampaignForAction({ tokenId, campaignId, actor });

  if (campaign.status !== 'FAILED' || !campaign.launch?.retryPayload) {
    throw new HttpError(400, 'Only retryable failed launch records can be checked');
  }

  const retryToken = await resolveRetryTokenForCampaign({
    campaign,
    tokenType,
    retryTokenId,
    actor,
  });
  const requirements = getRetryAccessRequirements(campaign);

  return {
    message: retryToken.switched
      ? `Access check passed with replacement token ${retryToken.token.label || retryToken.token.id}`
      : `Access check passed with ${retryToken.token.label || 'saved token'}`,
    ok: true,
    token: {
      id: retryToken.token.id,
      label: retryToken.token.label,
      switched: retryToken.switched,
      selected: retryToken.selected,
      tokenType: retryToken.token.tokenType || tokenType || '',
    },
    requirements,
    campaign: campaign.toSafeObject(),
  };
}

async function retryFailedLaunch({ tokenId, campaignId, actor, req, tokenType = null, retryTokenId = '', fromQueue = false }) {
  const campaign = await getCampaignForAction({ tokenId, campaignId, actor });

  if (campaign.status !== 'FAILED') {
    throw new HttpError(400, 'Only failed launch records can be retried');
  }

  if (!fromQueue && normalizeQueueStatus(campaign.publishQueue?.status) === PUBLISH_QUEUE_STATUSES.RUNNING) {
    throw new HttpError(409, 'This failed launch is already running from the publish queue');
  }

  const retryPayload = {
    ...(campaign.launch?.retryPayload || {}),
  };
  if (!retryPayload || typeof retryPayload !== 'object') {
    throw new HttpError(400, 'This failed launch does not have enough saved data to retry');
  }

  const retryToken = await resolveRetryTokenForCampaign({
    campaign,
    tokenType,
    retryTokenId,
    actor,
  });
  retryPayload.tokenId = retryToken.token.id;

  const resumeState = buildResumeState({
    account: campaign.adAccount || {},
    campaignId: campaign.campaignId,
    adSetId: campaign.adSetId,
    creativeId: campaign.creativeId,
    adId: campaign.adId,
  });

  if (resumeState) {
    retryPayload.resumeState = {
      ...(retryPayload.resumeState || {}),
      [campaign.adAccount?.id || resumeState.adAccountId]: resumeState,
    };
  }

  campaign.actionHistory.push(
    pushAction({
      action: 'RETRY_REQUESTED',
      status: 'FAILED',
      message: retryToken.switched
        ? `Retry requested using replacement token ${retryToken.token.label || retryToken.token.id}`
        : 'Retry requested from Ads Manage',
      actor,
    })
  );
  campaign.lastActionAt = new Date();
  if (retryToken.switched) {
    campaign.publishQueue = {
      ...(campaign.publishQueue?.toObject?.() || campaign.publishQueue || {}),
      tokenType: retryToken.token.tokenType || campaign.publishQueue?.tokenType || '',
      lastError: '',
    };
    campaign.actionHistory.push(
      pushAction({
        action: retryToken.selected ? 'RETRY_TOKEN_SELECTED' : 'RETRY_TOKEN_AUTO_SELECTED',
        status: campaign.publishQueue?.status || 'FAILED',
        message: `Replacement token ${retryToken.token.label || retryToken.token.id} passed access check`,
        actor,
      })
    );
  }
  if (!fromQueue && isActiveQueueStatus(campaign.publishQueue?.status)) {
    await markQueueRunning({
      campaign,
      actor,
      source: 'manual-retry',
    });
  }
  await campaign.save();

  try {
    const adsLaunchService = require('../ads-launch/adsLaunch.service');
    const result = await adsLaunchService.publishLaunch({
      payload: {
        ...retryPayload,
        queueRetry: fromQueue,
      },
      actor,
      req,
      tokenType: retryToken.token.tokenType || tokenType,
    });
    const retryFailedCount = Number(result?.summary?.failed || result?.failed?.length || 0);
    const retryPublishedCount = Number(result?.summary?.published || result?.results?.length || 0);

    if (retryFailedCount > 0 && retryPublishedCount === 0) {
      const failure = result?.failed?.[0] || {};
      throw new HttpError(400, failure.message || result?.message || 'Retry failed', {
        publishQueueable: Boolean(failure.queued),
        retryAfterSeconds: failure.retryAfterSeconds || null,
      });
    }

    const retryStatus = campaign.campaignId.startsWith('failed_')
      ? 'RETRIED'
      : normalizeText(result?.results?.[0]?.status) || normalizeText(campaign.launch?.staticDefaults?.campaignStatus) || 'PAUSED';
    campaign.status = retryStatus;
    campaign.effectiveStatus = retryStatus;
    campaign.lastMetaError = '';
    campaign.updatedBy = actor?._id || null;
    campaign.lastActionAt = new Date();
    campaign.actionHistory.push(
      pushAction({
        action: 'RETRY_SUCCEEDED',
        status: 'RETRIED',
        message: result.message || 'Retry completed',
        actor,
      })
    );
    if (!fromQueue && isActiveQueueStatus(campaign.publishQueue?.status)) {
      campaign.publishQueue = {
        ...(campaign.publishQueue?.toObject?.() || campaign.publishQueue || {}),
        status: PUBLISH_QUEUE_STATUSES.COMPLETED,
        runningStartedAt: null,
        nextAttemptAt: null,
        completedAt: new Date(),
        lastError: '',
      };
    }
    await campaign.save();

    await writeActivityLog({
      user: actor,
      action: 'ADS_MANAGE_FAILED_LAUNCH_RETRIED',
      entity: 'ManagedCampaign',
      entityId: campaign._id.toString(),
      metadata: {
        campaignId: campaign.campaignId,
        resultSummary: result.summary,
      },
      req,
    });

    const publishSessionUpdate = await adsLaunchService.markPublishFailureResolved?.({
      campaignId: campaign.campaignId,
      historyRecordId: campaign._id.toString(),
      actor,
      retryResult: result,
    });

    return {
      message: result.message || 'Retry completed',
      campaign: campaign.toSafeObject(),
      result,
      publishSessions: publishSessionUpdate?.sessions || [],
    };
  } catch (error) {
    if (!fromQueue && isActiveQueueStatus(campaign.publishQueue?.status)) {
      if (error.publishQueueable) {
        await markQueueBlocked({
          campaign,
          error,
          actor,
          tokenType: retryToken.token.tokenType || tokenType,
        });
      } else {
        await markQueueFailed({
          campaign,
          error,
          actor,
        });
      }
    }
    await rememberMetaActionFailure({
      campaign,
      action: 'RETRY_FAILED',
      error,
      actor,
    });
    throw error;
  }
}

async function getPublishQueue({ actor = null } = {}) {
  const queue = await ManagedCampaign.find({
    ...campaignAccessFilter(actor),
    'publishQueue.status': {
      $in: ACTIVE_PUBLISH_QUEUE_STATUSES,
    },
  }).sort({
    'publishQueue.nextAttemptAt': 1,
    updatedAt: -1,
  });
  const normalizedQueue = queue.map(normalizeQueueRecord);

  return {
    queue: normalizedQueue,
    state: getQueueState({ queue: normalizedQueue }),
  };
}

function schedulePublishQueueRun(delayMs = 0) {
  const safeDelayMs = Math.max(Number(delayMs) || 0, 0);
  const dueAt = Date.now() + safeDelayMs;

  if (publishQueueTimer && publishQueueTimerDueAt && publishQueueTimerDueAt <= dueAt) {
    return;
  }

  if (publishQueueTimer) {
    clearTimeout(publishQueueTimer);
  }

  publishQueueTimerDueAt = dueAt;
  publishQueueTimer = setTimeout(() => {
    publishQueueTimer = null;
    publishQueueTimerDueAt = null;
    runPublishQueue({ source: 'auto' }).catch((error) => {
      publishQueueLastResult = {
        message: error.message || 'Publish queue failed to start',
        status: 'failed',
        completedAt: new Date(),
      };
    });
  }, safeDelayMs);
}

async function scheduleNextQueuedRun() {
  if (publishQueueRunning) {
    return;
  }

  const nextQueued = await ManagedCampaign.findOne({
    'publishQueue.status': {
      $in: RETRYABLE_PUBLISH_QUEUE_STATUSES,
    },
    'publishQueue.nextAttemptAt': {
      $ne: null,
    },
  })
    .sort({ 'publishQueue.nextAttemptAt': 1 })
    .select('publishQueue')
    .lean();

  if (!nextQueued?.publishQueue?.nextAttemptAt) {
    return;
  }

  schedulePublishQueueRun(Math.max(new Date(nextQueued.publishQueue.nextAttemptAt).getTime() - Date.now(), 0));
}

async function runPublishQueue({ actor = null, req = null, tokenType = null, retryTokenId = '', force = false, source = 'manual' } = {}) {
  if (publishQueueRunning) {
    const currentQueue = await getPublishQueue({ actor });
    return {
      message: 'Publish queue is already running',
      processed: [],
      state: currentQueue.state,
      queue: currentQueue.queue,
    };
  }

  publishQueueRunning = true;
  publishQueueLastRunAt = new Date();
  const now = new Date();
  const dueFilter = force
    ? {}
    : {
        $or: [
          { 'publishQueue.nextAttemptAt': null },
          { 'publishQueue.nextAttemptAt': { $lte: now } },
        ],
      };
  const queueStatuses = force
    ? [...RETRYABLE_PUBLISH_QUEUE_STATUSES, PUBLISH_QUEUE_STATUSES.FAILED]
    : RETRYABLE_PUBLISH_QUEUE_STATUSES;
  const processed = [];

  try {
    const campaigns = await ManagedCampaign.find({
      ...campaignAccessFilter(actor),
      ...dueFilter,
      status: 'FAILED',
      'publishQueue.status': {
        $in: queueStatuses,
      },
    }).sort({
      'publishQueue.nextAttemptAt': 1,
      updatedAt: -1,
    });

    for (const campaign of campaigns) {
      const queueActor = await resolveCampaignActor(campaign, actor);

      try {
        await markQueueRunning({
          campaign,
          actor: queueActor,
          source,
        });

        const result = await retryFailedLaunch({
          tokenId: campaign.tokenId,
          campaignId: campaign.campaignId,
          actor: queueActor,
          req,
          tokenType: campaign.publishQueue?.tokenType || tokenType,
          retryTokenId,
          fromQueue: true,
        });
        const resumeNotices = Array.isArray(result?.result?.results)
          ? result.result.results.flatMap((item) => (Array.isArray(item.resumeNotices) ? item.resumeNotices : []))
          : [];

        await markQueueCompleted({
          campaign,
          actor: queueActor,
          message: resumeNotices[0] || result.message || 'Queued publish retry completed',
        });

        processed.push({
          campaignId: campaign.campaignId,
          adAccount: campaign.adAccount,
          status: PUBLISH_QUEUE_STATUSES.COMPLETED,
          message: result.message || 'Queued publish retry completed',
          resumeNotices,
        });
      } catch (error) {
        if (error.publishQueueable) {
          await markQueueBlocked({
            campaign,
            error,
            actor: queueActor,
            tokenType: campaign.publishQueue?.tokenType || tokenType,
            notify: false,
          });
          processed.push({
            campaignId: campaign.campaignId,
            adAccount: campaign.adAccount,
            status: PUBLISH_QUEUE_STATUSES.BLOCKED,
            message: error.message,
            nextAttemptAt: campaign.publishQueue?.nextAttemptAt || null,
          });
        } else {
          await markQueueFailed({
            campaign,
            error,
            actor: queueActor,
          });
          processed.push({
            campaignId: campaign.campaignId,
            adAccount: campaign.adAccount,
            status: PUBLISH_QUEUE_STATUSES.FAILED,
            message: error.message,
          });
        }
      }
    }

    const currentQueue = await getPublishQueue({ actor });
    currentQueue.state.running = false;
    const completed = processed.filter((item) => item.status === PUBLISH_QUEUE_STATUSES.COMPLETED).length;
    const blocked = processed.filter((item) => item.status === PUBLISH_QUEUE_STATUSES.BLOCKED).length;
    const failed = processed.filter((item) => item.status === PUBLISH_QUEUE_STATUSES.FAILED).length;

    publishQueueLastResult = {
      message: processed.length
        ? `Queue processed ${processed.length} item${processed.length === 1 ? '' : 's'}`
        : 'No queued publish items were ready',
      completed,
      blocked,
      failed,
      processed: processed.length,
      completedAt: new Date(),
    };

    if (processed.length) {
      await settingsService.notifyPublishQueueStatus({
        status: 'processed',
        message: `Completed: ${completed}, blocked: ${blocked}, failed: ${failed}`,
        records: currentQueue.queue,
      });
    }

    await writeActivityLog({
      user: actor,
      action: 'ADS_PUBLISH_QUEUE_RUN',
      entity: 'ManagedCampaign',
      metadata: {
        processed: processed.length,
        completed,
        blocked,
        failed,
        source,
      },
      req,
    });

    return {
      message: publishQueueLastResult.message,
      processed,
      state: currentQueue.state,
      queue: currentQueue.queue,
    };
  } finally {
    publishQueueRunning = false;
    await scheduleNextQueuedRun();
  }
}

async function clearPublishQueue({ actor, req }) {
  const accessFilter = campaignAccessFilter(actor);
  const runningCount = await ManagedCampaign.countDocuments({
    ...accessFilter,
    'publishQueue.status': PUBLISH_QUEUE_STATUSES.RUNNING,
  });

  if (publishQueueRunning || runningCount) {
    throw new HttpError(409, 'Publish queue is currently running. Please wait for it to finish before clearing.');
  }

  const query = {
    ...accessFilter,
    'publishQueue.status': {
      $in: ACTIVE_PUBLISH_QUEUE_STATUSES,
    },
  };
  const now = new Date();
  const result = await ManagedCampaign.updateMany(query, {
    $set: {
      'publishQueue.status': PUBLISH_QUEUE_STATUSES.CANCELLED,
      'publishQueue.runningStartedAt': null,
      'publishQueue.nextAttemptAt': null,
      'publishQueue.clearedAt': now,
      'publishQueue.lastError': 'Queue cleared by user',
      lastActionAt: now,
      updatedBy: actor?._id || null,
    },
    $push: {
      actionHistory: pushAction({
        action: 'PUBLISH_QUEUE_CLEARED',
        status: PUBLISH_QUEUE_STATUSES.CANCELLED,
        message: 'Publish queue cleared by user',
        actor,
      }),
    },
  });

  if (publishQueueTimer) {
    clearTimeout(publishQueueTimer);
    publishQueueTimer = null;
    publishQueueTimerDueAt = null;
  }

  await settingsService.notifyPublishQueueStatus({
    status: 'cleared',
    message: `${result.modifiedCount || 0} queued publish item${result.modifiedCount === 1 ? '' : 's'} cleared.`,
  });

  await writeActivityLog({
    user: actor,
    action: 'ADS_PUBLISH_QUEUE_CLEARED',
    entity: 'ManagedCampaign',
    metadata: {
      cleared: result.modifiedCount || 0,
    },
    req,
  });

  const currentQueue = await getPublishQueue({ actor });
  return {
    message: `${result.modifiedCount || 0} queued publish item${result.modifiedCount === 1 ? '' : 's'} cleared`,
    cleared: result.modifiedCount || 0,
    state: currentQueue.state,
    queue: currentQueue.queue,
  };
}

module.exports = {
  checkFailedLaunchAccess,
  clearRecoveredErrors,
  clearPublishQueue,
  deleteCampaign,
  duplicateCampaign,
  getPublishQueue,
  listDynamicHistory,
  listErrors,
  listCampaigns,
  recordFailedLaunch,
  recordPublishedCampaign,
  retryFailedLaunch,
  runPublishQueue,
  schedulePublishQueueRun,
  syncCampaignDetails,
  updateCampaignStatus,
};
