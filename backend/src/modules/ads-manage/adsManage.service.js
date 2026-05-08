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
    throw new HttpError(400, buildMetaErrorMessage(path, payload));
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

function mapLaunchForHistory({ launch, media, thumbnail, accountLaunch = null, retryPayload = null }) {
  return {
    launchLabel: launch.launchLabel,
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
    payload.resumeState = {
      [account.id]: resumeState,
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
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return history.toSafeObject();
}

async function recordFailedLaunch({ token, launch, account, names = {}, campaign = null, adSet = null, creative = null, ad = null, media = null, thumbnail = null, accountLaunch = null, error, actor, req }) {
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
      new: true,
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

async function syncCampaignDetails({ tokenId, campaignId, actor, req }) {
  const campaign = await getCampaignForAction({ tokenId, campaignId });

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

async function retryFailedLaunch({ tokenId, campaignId, actor, req, tokenType = null }) {
  const campaign = await getCampaignForAction({ tokenId, campaignId });

  if (campaign.status !== 'FAILED') {
    throw new HttpError(400, 'Only failed launch records can be retried');
  }

  const retryPayload = {
    ...(campaign.launch?.retryPayload || {}),
  };
  if (!retryPayload || typeof retryPayload !== 'object') {
    throw new HttpError(400, 'This failed launch does not have enough saved data to retry');
  }

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
      message: 'Retry requested from Ads Manage',
      actor,
    })
  );
  campaign.lastActionAt = new Date();
  await campaign.save();

  try {
    const adsLaunchService = require('../ads-launch/adsLaunch.service');
    const result = await adsLaunchService.publishLaunch({
      payload: retryPayload,
      actor,
      req,
      tokenType,
    });
    const retryFailedCount = Number(result?.summary?.failed || result?.failed?.length || 0);
    const retryPublishedCount = Number(result?.summary?.published || result?.results?.length || 0);

    if (retryFailedCount > 0 && retryPublishedCount === 0) {
      throw new HttpError(400, result?.failed?.[0]?.message || result?.message || 'Retry failed');
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

    return {
      message: result.message || 'Retry completed',
      campaign: campaign.toSafeObject(),
      result,
    };
  } catch (error) {
    await rememberMetaActionFailure({
      campaign,
      action: 'RETRY_FAILED',
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
  recordFailedLaunch,
  recordPublishedCampaign,
  retryFailedLaunch,
  syncCampaignDetails,
  updateCampaignStatus,
};
