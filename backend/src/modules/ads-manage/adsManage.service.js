const HttpError = require('../../app/utils/httpError');
const { waitForMetaApiPacing } = require('../../app/utils/metaApiPacing');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const tokenService = require('../token-management/token.service');
const ManagedCampaign = require('./adsManage.model');

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const ALLOWED_STATUS_UPDATES = new Set(['ACTIVE', 'PAUSED']);

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
    throw new HttpError(400, buildMetaErrorMessage(path, payload));
  }

  return payload;
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

function pushAction({ action, status = '', message = '', actor = null }) {
  return {
    action,
    status,
    message,
    actor: actor?._id || actor?.id || null,
    at: new Date(),
  };
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

async function getCampaignForAction({ tokenId, campaignId }) {
  const normalizedTokenId = normalizeText(tokenId);
  const normalizedCampaignId = normalizeText(campaignId);

  if (!normalizedTokenId) {
    throw new HttpError(400, 'Token id is required');
  }

  if (!normalizedCampaignId) {
    throw new HttpError(400, 'Campaign id is required');
  }

  const campaign = await ManagedCampaign.findOne({
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

async function recordPublishedCampaign({ token, launch, account, names, campaign, adSet, creative, ad, media, thumbnail, actor }) {
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
        launch: {
          launchLabel: launch.launchLabel,
          templateId: launch.templateId || '',
          brandId: launch.brandId || '',
          brandName: launch.brandName || '',
          countries: launch.countries || [],
          countryLabel: launch.countryLabel || (launch.countries || []).join(', '),
          dailyBudget: launch.dailyBudget,
          page: {
            id: launch.pageId,
            name: launch.pageName || '',
          },
          pixel: {
            id: launch.pixelId || '',
            name: launch.pixelName || '',
          },
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
        },
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
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return history.toSafeObject();
}

async function updateCampaignStatus({ tokenId, campaignId, status, actor, req }) {
  const normalizedStatus = normalizeText(status).toUpperCase();

  if (!ALLOWED_STATUS_UPDATES.has(normalizedStatus)) {
    throw new HttpError(400, 'Campaign status must be ACTIVE or PAUSED');
  }

  const campaign = await getCampaignForAction({ tokenId, campaignId });
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

  const sourceCampaign = await getCampaignForAction({ tokenId, campaignId });

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
          new: true,
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
  const campaign = await getCampaignForAction({ tokenId, campaignId });

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

module.exports = {
  deleteCampaign,
  duplicateCampaign,
  listCampaigns,
  recordPublishedCampaign,
  updateCampaignStatus,
};
