const HttpError = require('../../app/utils/httpError');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const { USER_ROLES } = require('../users/user.model');
const LaunchTemplate = require('./adsLaunch.model');
const tokenService = require('../token-management/token.service');

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const GRAPH_VIDEO_API_BASE = `https://graph-video.facebook.com/${META_GRAPH_VERSION}`;

const SUPPORTED_OBJECTIVES = Object.freeze({
  OUTCOME_TRAFFIC: {
    optimizationGoal: 'LINK_CLICKS',
    destinationType: 'WEBSITE',
    buildPromotedObject: ({ pixelId }) => ({
      pixel_id: pixelId,
      custom_event_type: 'PAGE_VIEW',
    }),
  },
  OUTCOME_ENGAGEMENT: {
    optimizationGoal: 'POST_ENGAGEMENT',
    destinationType: null,
    buildPromotedObject: ({ pageId }) => ({
      page_id: pageId,
    }),
  },
  OUTCOME_LEADS: {
    optimizationGoal: 'OFFSITE_CONVERSIONS',
    destinationType: 'WEBSITE',
    buildPromotedObject: ({ pixelId }) => ({
      pixel_id: pixelId,
      custom_event_type: 'LEAD',
    }),
  },
  OUTCOME_SALES: {
    optimizationGoal: 'OFFSITE_CONVERSIONS',
    destinationType: 'WEBSITE',
    buildPromotedObject: ({ pixelId }) => ({
      pixel_id: pixelId,
      custom_event_type: 'PURCHASE',
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
  audienceAgeMin: '18',
  audienceAgeMax: '65',
  genderTargeting: 'ALL',
  billingEvent: 'IMPRESSIONS',
  bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
});

function isSuperAdmin(user) {
  return user?.role === USER_ROLES.SUPER_ADMIN;
}

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

function sanitizeTemplateConfig(input = {}) {
  const staticDefaults = input.staticDefaults || {};

  return {
    launchLabel: normalizeText(input.launchLabel),
    tokenId: normalizeText(input.tokenId),
    country: normalizeText(input.country),
    objective: normalizeText(input.objective),
    dailyBudget: normalizeText(input.dailyBudget),
    selectedAdAccountIds: dedupeStrings(input.selectedAdAccountIds),
    pageId: normalizeText(input.pageId),
    pixelId: normalizeText(input.pixelId),
    headline: normalizeText(input.headline),
    primaryText: normalizeText(input.primaryText),
    description: normalizeText(input.description),
    websiteUrl: normalizeText(input.websiteUrl),
    callToAction: normalizeText(input.callToAction),
    staticDefaults: {
      buyingType: normalizeText(staticDefaults.buyingType) || DEFAULT_STATIC_DEFAULTS.buyingType,
      campaignStatus: normalizeText(staticDefaults.campaignStatus) || DEFAULT_STATIC_DEFAULTS.campaignStatus,
      specialAdCategories:
        normalizeText(staticDefaults.specialAdCategories) || DEFAULT_STATIC_DEFAULTS.specialAdCategories,
      placements: normalizeText(staticDefaults.placements) || DEFAULT_STATIC_DEFAULTS.placements,
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
  };
}

function templateAccessFilter(actor) {
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

async function listTemplates({ actor }) {
  const templates = await LaunchTemplate.find(templateAccessFilter(actor))
    .populate('createdBy', 'name email')
    .sort({ updatedAt: -1 });

  return templates.map((template) => template.toSafeObject());
}

async function createTemplate({ name, config, snapshot, actor, req }) {
  const normalizedName = normalizeText(name);
  if (!normalizedName) {
    throw new HttpError(400, 'Template name is required');
  }

  const template = await LaunchTemplate.create({
    name: normalizedName,
    config: sanitizeTemplateConfig(config),
    snapshot: sanitizeSnapshot(snapshot),
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  await writeActivityLog({
    user: actor,
    action: 'ADS_LAUNCH_TEMPLATE_CREATED',
    entity: 'LaunchTemplate',
    entityId: template._id.toString(),
    metadata: {
      name: template.name,
    },
    req,
  });

  const populated = await LaunchTemplate.findById(template._id).populate('createdBy', 'name email');
  return populated.toSafeObject();
}

async function updateTemplate({ templateId, name, config, snapshot, actor, req }) {
  const template = await getTemplateForActor(templateId, actor);

  const normalizedName = normalizeText(name);
  if (!normalizedName) {
    throw new HttpError(400, 'Template name is required');
  }

  template.name = normalizedName;
  template.config = sanitizeTemplateConfig(config);
  template.snapshot = sanitizeSnapshot(snapshot);
  template.updatedBy = actor._id;
  await template.save();

  await writeActivityLog({
    user: actor,
    action: 'ADS_LAUNCH_TEMPLATE_UPDATED',
    entity: 'LaunchTemplate',
    entityId: template._id.toString(),
    metadata: {
      name: template.name,
    },
    req,
  });

  const populated = await LaunchTemplate.findById(template._id).populate('createdBy', 'name email');
  return populated.toSafeObject();
}

async function deleteTemplate({ templateId, actor, req }) {
  const template = await getTemplateForActor(templateId, actor);
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

function parseDataUrlFile(file, label) {
  if (!file?.dataUrl || !file?.name) {
    throw new HttpError(400, `${label} is required`);
  }

  const match = String(file.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new HttpError(400, `${label} must be a valid uploaded file`);
  }

  return {
    name: normalizeText(file.name) || label,
    mimeType: normalizeText(file.type) || match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
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

  const response = await fetch(buildGraphUrl(path, { videoHost }), {
    method: 'POST',
    body,
  });

  await tokenService.recordTokenApiCall(token.id);
  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new HttpError(400, payload.error?.message || `Meta API request failed for ${path}`);
  }

  return payload;
}

async function uploadImage({ token, adAccountId, file }) {
  const parsed = parseDataUrlFile(file, 'Image');
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
  const parsed = parseDataUrlFile(file, 'Video');
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

function ensurePublishPayload(payload) {
  const staticDefaults = payload.staticDefaults || {};
  const cleaned = {
    templateId: normalizeText(payload.templateId),
    launchLabel: normalizeText(payload.launchLabel),
    tokenId: normalizeText(payload.tokenId),
    country: normalizeText(payload.country),
    objective: normalizeText(payload.objective),
    dailyBudget: normalizeText(payload.dailyBudget),
    selectedAdAccountIds: dedupeStrings(payload.selectedAdAccountIds),
    pageId: normalizeText(payload.pageId),
    pixelId: normalizeText(payload.pixelId),
    headline: normalizeText(payload.headline),
    primaryText: normalizeText(payload.primaryText),
    description: normalizeText(payload.description),
    websiteUrl: normalizeText(payload.websiteUrl),
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
      campaignStatus: normalizeText(staticDefaults.campaignStatus) || DEFAULT_STATIC_DEFAULTS.campaignStatus,
      specialAdCategories:
        normalizeText(staticDefaults.specialAdCategories) || DEFAULT_STATIC_DEFAULTS.specialAdCategories,
      placements: normalizeText(staticDefaults.placements) || DEFAULT_STATIC_DEFAULTS.placements,
      audienceAgeMin: normalizeText(staticDefaults.audienceAgeMin) || DEFAULT_STATIC_DEFAULTS.audienceAgeMin,
      audienceAgeMax: normalizeText(staticDefaults.audienceAgeMax) || DEFAULT_STATIC_DEFAULTS.audienceAgeMax,
      genderTargeting: normalizeText(staticDefaults.genderTargeting) || DEFAULT_STATIC_DEFAULTS.genderTargeting,
      billingEvent: normalizeText(staticDefaults.billingEvent) || DEFAULT_STATIC_DEFAULTS.billingEvent,
      bidStrategy: normalizeText(staticDefaults.bidStrategy) || DEFAULT_STATIC_DEFAULTS.bidStrategy,
    },
    media: payload.media || null,
    thumbnail: payload.thumbnail || null,
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

  if (!cleaned.country) {
    throw new HttpError(400, 'Country is required');
  }

  if (!cleaned.selectedAdAccountIds.length) {
    throw new HttpError(400, 'Select at least one ad account');
  }

  if (!cleaned.pageId) {
    throw new HttpError(400, 'Page is required');
  }

  if (!cleaned.pixelId) {
    throw new HttpError(400, 'Pixel is required');
  }

  if (!cleaned.headline) {
    throw new HttpError(400, 'Headline is required');
  }

  if (!cleaned.primaryText) {
    throw new HttpError(400, 'Primary text is required');
  }

  if (!cleaned.websiteUrl) {
    throw new HttpError(400, 'Destination URL is required');
  }

  if (!cleaned.callToAction) {
    throw new HttpError(400, 'Call to action is required');
  }

  if (!cleaned.media) {
    throw new HttpError(400, 'Upload an image or video before publishing');
  }

  if (String(cleaned.media.type || '').startsWith('video/') && !cleaned.thumbnail) {
    throw new HttpError(400, 'Video publishing requires a thumbnail image');
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

async function createCampaign({ token, adAccountId, name, objective, staticDefaults }) {
  return postToMeta({
    token,
    path: `${adAccountId}/campaigns`,
    params: {
      name,
      objective,
      status: staticDefaults.campaignStatus || DEFAULT_STATIC_DEFAULTS.campaignStatus,
      buying_type: staticDefaults.buyingType || DEFAULT_STATIC_DEFAULTS.buyingType,
      special_ad_categories:
        staticDefaults.specialAdCategories && staticDefaults.specialAdCategories !== 'NONE'
          ? [staticDefaults.specialAdCategories]
          : [],
    },
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
  country,
  pageId,
  pixelId,
  staticDefaults,
}) {
  const settings = SUPPORTED_OBJECTIVES[objective];
  const ageMin = Number.parseInt(staticDefaults.audienceAgeMin, 10);
  const ageMax = Number.parseInt(staticDefaults.audienceAgeMax, 10);
  const targeting = {
    geo_locations: {
      countries: [country],
    },
    age_min: Number.isFinite(ageMin) ? ageMin : 18,
    age_max: Number.isFinite(ageMax) ? ageMax : 65,
  };

  if ((staticDefaults.genderTargeting || DEFAULT_STATIC_DEFAULTS.genderTargeting) === 'MALE') {
    targeting.genders = [1];
  }

  if ((staticDefaults.genderTargeting || DEFAULT_STATIC_DEFAULTS.genderTargeting) === 'FEMALE') {
    targeting.genders = [2];
  }

  const params = {
    name,
    campaign_id: campaignId,
    daily_budget: toMetaBudget(dailyBudget, currency),
    billing_event: staticDefaults.billingEvent || DEFAULT_STATIC_DEFAULTS.billingEvent,
    optimization_goal: settings.optimizationGoal,
    bid_strategy: staticDefaults.bidStrategy || DEFAULT_STATIC_DEFAULTS.bidStrategy,
    status: staticDefaults.campaignStatus || DEFAULT_STATIC_DEFAULTS.campaignStatus,
    targeting,
    promoted_object: settings.buildPromotedObject({ pageId, pixelId }),
  };

  if (settings.destinationType) {
    params.destination_type = settings.destinationType;
  }

  return postToMeta({
    token,
    path: `${adAccountId}/adsets`,
    params,
  });
}

async function createAdCreative({
  token,
  adAccountId,
  name,
  pageId,
  websiteUrl,
  primaryText,
  headline,
  description,
  callToAction,
  media,
  thumbnail,
}) {
  if (String(media.type || '').startsWith('video/')) {
    const uploadedVideo = await uploadVideo({
      token,
      adAccountId,
      file: media,
    });

    const uploadedThumbnail = thumbnail
      ? await uploadImage({
          token,
          adAccountId,
          file: thumbnail,
        })
      : null;

    return postToMeta({
      token,
      path: `${adAccountId}/adcreatives`,
      params: {
        name,
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
    });
  }

  const uploadedImage = await uploadImage({
    token,
    adAccountId,
    file: media,
  });

  return postToMeta({
    token,
    path: `${adAccountId}/adcreatives`,
    params: {
      name,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          link: websiteUrl,
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
  });
}

async function createAd({ token, adAccountId, adSetId, creativeId, name, staticDefaults }) {
  return postToMeta({
    token,
    path: `${adAccountId}/ads`,
    params: {
      name,
      adset_id: adSetId,
      status: staticDefaults.campaignStatus || DEFAULT_STATIC_DEFAULTS.campaignStatus,
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

async function publishLaunch({ payload, actor, req }) {
  const launch = ensurePublishPayload(payload);
  const token = await tokenService.getActiveTokenWithSecret(launch.tokenId);
  const accountMap = new Map(launch.selectedAdAccounts.map((account) => [account.id, account]));
  const results = [];
  const failed = [];

  for (const [index, adAccountId] of launch.selectedAdAccountIds.entries()) {
    const selectedAccount = accountMap.get(adAccountId) || {
      id: adAccountId,
      name: adAccountId,
      currency: '',
    };
    const names = buildNames({
      launchLabel: launch.launchLabel,
      countryLabel: launch.country,
      adAccountName: selectedAccount.name,
      pageName: launch.pageName || launch.pageId,
      index,
    });

    try {
      const campaign = await createCampaign({
        token,
        adAccountId,
        name: names.campaignName,
        objective: launch.objective,
        staticDefaults: launch.staticDefaults,
      });

      const adSet = await createAdSet({
        token,
        adAccountId,
        campaignId: campaign.id,
        name: names.adSetName,
        objective: launch.objective,
        dailyBudget: launch.dailyBudget,
        currency: selectedAccount.currency,
        country: launch.country,
        pageId: launch.pageId,
        pixelId: launch.pixelId,
        staticDefaults: launch.staticDefaults,
      });

      const creative = await createAdCreative({
        token,
        adAccountId,
        name: names.adName,
        pageId: launch.pageId,
        websiteUrl: launch.websiteUrl,
        primaryText: launch.primaryText,
        headline: launch.headline,
        description: launch.description,
        callToAction: launch.callToAction,
        media: launch.media,
        thumbnail: launch.thumbnail,
      });

      const ad = await createAd({
        token,
        adAccountId,
        adSetId: adSet.id,
        creativeId: creative.id,
        name: names.adName,
        staticDefaults: launch.staticDefaults,
      });

      results.push({
        adAccountId,
        adAccountName: selectedAccount.name,
        campaignId: campaign.id,
        adSetId: adSet.id,
        creativeId: creative.id,
        adId: ad.id,
        status: 'PAUSED',
      });
    } catch (error) {
      failed.push({
        adAccountId,
        message: error.message,
      });
    }
  }

  if (!results.length) {
    throw new HttpError(400, failed[0]?.message || 'Meta publish failed');
  }

  await markTemplatePublished(launch.templateId, actor);

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
      country: launch.country,
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
  createTemplate,
  deleteTemplate,
  listTemplates,
  publishLaunch,
  updateTemplate,
};
