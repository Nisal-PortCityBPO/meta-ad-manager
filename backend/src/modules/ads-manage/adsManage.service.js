const HttpError = require('../../app/utils/httpError');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const tokenService = require('../token-management/token.service');

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

const CAMPAIGN_FIELDS = [
  'id',
  'name',
  'status',
  'effective_status',
  'objective',
  'buying_type',
  'daily_budget',
  'lifetime_budget',
  'budget_remaining',
  'spend_cap',
  'start_time',
  'stop_time',
  'created_time',
  'updated_time',
  'special_ad_categories',
].join(',');

const INSIGHT_FIELDS = ['spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm'].join(',');
const ALLOWED_STATUS_UPDATES = new Set(['ACTIVE', 'PAUSED']);
const ALLOWED_DATE_PRESETS = new Set([
  'today',
  'yesterday',
  'last_7d',
  'last_14d',
  'last_30d',
  'this_month',
  'last_month',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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
  await tokenService.recordTokenApiCall(token.id);
}

async function getFromMeta({ token, path, params = {} }) {
  const response = await fetch(
    buildGraphUrl(path, {
      access_token: token.accessToken,
      ...params,
    })
  );
  await recordApiCall(token);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error) {
    throw new HttpError(400, buildMetaErrorMessage(path, payload));
  }

  return payload;
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

  const response = await fetch(buildGraphUrl(path), {
    method: 'POST',
    body,
  });
  await recordApiCall(token);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error) {
    throw new HttpError(400, buildMetaErrorMessage(path, payload));
  }

  return payload;
}

async function fetchGraphCollection({ token, path, params = {}, limit = 100 }) {
  const items = [];
  let nextUrl = buildGraphUrl(path, {
    access_token: token.accessToken,
    limit,
    ...params,
  }).toString();

  while (nextUrl) {
    const response = await fetch(nextUrl);
    await recordApiCall(token);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.error) {
      throw new HttpError(400, buildMetaErrorMessage(path, payload));
    }

    if (Array.isArray(payload.data)) {
      items.push(...payload.data);
    }

    nextUrl = payload.paging?.next || null;
  }

  return items;
}

function getDatePreset(value) {
  const normalizedValue = normalizeText(value) || 'last_30d';
  return ALLOWED_DATE_PRESETS.has(normalizedValue) ? normalizedValue : 'last_30d';
}

function getBudgetDisplay(campaign) {
  if (campaign.daily_budget) {
    return {
      type: 'Daily',
      amount: campaign.daily_budget,
    };
  }

  if (campaign.lifetime_budget) {
    return {
      type: 'Lifetime',
      amount: campaign.lifetime_budget,
    };
  }

  return {
    type: 'Ad set',
    amount: '',
  };
}

function normalizeInsights(insight) {
  return {
    spend: insight?.spend || '0',
    impressions: insight?.impressions || '0',
    reach: insight?.reach || '0',
    clicks: insight?.clicks || '0',
    ctr: insight?.ctr || '0',
    cpc: insight?.cpc || '0',
    cpm: insight?.cpm || '0',
  };
}

async function getCampaignInsights({ token, campaignId, datePreset }) {
  const payload = await getFromMeta({
    token,
    path: `${campaignId}/insights`,
    params: {
      fields: INSIGHT_FIELDS,
      date_preset: datePreset,
      limit: 1,
    },
  });

  return normalizeInsights(payload.data?.[0]);
}

function normalizeCampaign({ campaign, account, insights }) {
  const budget = getBudgetDisplay(campaign);

  return {
    id: String(campaign.id),
    name: campaign.name || `Campaign ${campaign.id}`,
    status: campaign.status || '',
    effectiveStatus: campaign.effective_status || '',
    objective: campaign.objective || '',
    buyingType: campaign.buying_type || '',
    budget,
    budgetRemaining: campaign.budget_remaining || '',
    spendCap: campaign.spend_cap || '',
    startTime: campaign.start_time || '',
    stopTime: campaign.stop_time || '',
    createdTime: campaign.created_time || '',
    updatedTime: campaign.updated_time || '',
    specialAdCategories: Array.isArray(campaign.special_ad_categories) ? campaign.special_ad_categories : [],
    insights,
    adAccount: account,
  };
}

async function listAccountCampaigns({ token, account, datePreset, status }) {
  const campaigns = await fetchGraphCollection({
    token,
    path: `${account.id}/campaigns`,
    params: {
      fields: CAMPAIGN_FIELDS,
      effective_status: status ? [status] : undefined,
    },
  });

  const insightResults = await Promise.allSettled(
    campaigns.map((campaign) =>
      getCampaignInsights({
        token,
        campaignId: campaign.id,
        datePreset,
      })
    )
  );

  return {
    campaigns: campaigns.map((campaign, index) =>
      normalizeCampaign({
        campaign,
        account,
        insights:
          insightResults[index]?.status === 'fulfilled'
            ? insightResults[index].value
            : normalizeInsights(null),
      })
    ),
    warnings: insightResults
      .map((result, index) =>
        result.status === 'rejected'
          ? {
              scope: `insights:${campaigns[index].id}`,
              message: result.reason.message,
            }
          : null
      )
      .filter(Boolean),
  };
}

async function listCampaigns({ tokenId, adAccounts = [], datePreset, status }) {
  if (!tokenId) {
    throw new HttpError(400, 'Token id is required');
  }

  const accounts = Array.isArray(adAccounts)
    ? adAccounts
        .map((account) => ({
          id: normalizeText(account?.id),
          accountId: normalizeText(account?.accountId),
          name: normalizeText(account?.name),
          currency: normalizeText(account?.currency),
        }))
        .filter((account) => account.id)
    : [];

  if (!accounts.length) {
    throw new HttpError(400, 'Select at least one ad account');
  }

  const token = await tokenService.getActiveTokenWithSecret(tokenId);
  const normalizedDatePreset = getDatePreset(datePreset);
  const normalizedStatus = normalizeText(status);
  const results = await Promise.allSettled(
    accounts.map((account) =>
      listAccountCampaigns({
        token,
        account,
        datePreset: normalizedDatePreset,
        status: normalizedStatus,
      })
    )
  );

  const campaigns = results
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value.campaigns)
    .sort((left, right) => new Date(right.updatedTime || 0) - new Date(left.updatedTime || 0));

  const warnings = results.flatMap((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value.warnings;
    }

    return [
      {
        scope: accounts[index].name || accounts[index].id,
        message: result.reason.message,
      },
    ];
  });

  return {
    campaigns,
    warnings,
    summary: {
      accountsRequested: accounts.length,
      campaigns: campaigns.length,
      datePreset: normalizedDatePreset,
    },
  };
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

async function updateCampaignStatus({ tokenId, campaignId, status, actor, req }) {
  const normalizedCampaignId = normalizeText(campaignId);
  const normalizedStatus = normalizeText(status).toUpperCase();

  if (!normalizedCampaignId) {
    throw new HttpError(400, 'Campaign id is required');
  }

  if (!ALLOWED_STATUS_UPDATES.has(normalizedStatus)) {
    throw new HttpError(400, 'Campaign status must be ACTIVE or PAUSED');
  }

  const token = await tokenService.getActiveTokenWithSecret(tokenId);
  const payload = await postToMeta({
    token,
    path: normalizedCampaignId,
    params: {
      status: normalizedStatus,
    },
  });

  await writeActivityLog({
    user: actor,
    action: 'ADS_MANAGE_CAMPAIGN_STATUS_UPDATED',
    entity: 'Campaign',
    entityId: normalizedCampaignId,
    metadata: {
      status: normalizedStatus,
    },
    req,
  });

  return {
    message: `Campaign ${normalizedStatus === 'PAUSED' ? 'paused' : 'activated'} successfully`,
    campaignId: normalizedCampaignId,
    status: normalizedStatus,
    meta: payload,
  };
}

async function duplicateCampaign({ tokenId, campaignId, name, status = 'PAUSED', deepCopy = true, actor, req }) {
  const normalizedCampaignId = normalizeText(campaignId);
  const normalizedName = normalizeText(name);
  const normalizedStatus = normalizeText(status).toUpperCase() || 'PAUSED';

  if (!normalizedCampaignId) {
    throw new HttpError(400, 'Campaign id is required');
  }

  if (!normalizedName) {
    throw new HttpError(400, 'New campaign name is required');
  }

  if (!ALLOWED_STATUS_UPDATES.has(normalizedStatus)) {
    throw new HttpError(400, 'New campaign status must be ACTIVE or PAUSED');
  }

  const token = await tokenService.getActiveTokenWithSecret(tokenId);
  const copyPayload = await postToMeta({
    token,
    path: `${normalizedCampaignId}/copies`,
    params: {
      deep_copy: Boolean(deepCopy),
      status_option: normalizedStatus,
    },
  });
  const copiedCampaignId = getCopiedCampaignId(copyPayload);

  if (copiedCampaignId) {
    await postToMeta({
      token,
      path: copiedCampaignId,
      params: {
        name: normalizedName,
        status: normalizedStatus,
      },
    });
  }

  await writeActivityLog({
    user: actor,
    action: 'ADS_MANAGE_CAMPAIGN_DUPLICATED',
    entity: 'Campaign',
    entityId: normalizedCampaignId,
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
    campaignId: normalizedCampaignId,
    copiedCampaignId,
    name: normalizedName,
    status: normalizedStatus,
    meta: copyPayload,
  };
}

module.exports = {
  duplicateCampaign,
  listCampaigns,
  updateCampaignStatus,
};
