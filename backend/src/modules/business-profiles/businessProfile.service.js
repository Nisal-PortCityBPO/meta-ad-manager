const HttpError = require('../../app/utils/httpError');
const mongoose = require('mongoose');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const Agency = require('../agencies/agency.model');
const Brand = require('../brands/brand.model');
const tokenService = require('../token-management/token.service');
const {
  BusinessProfile,
  BUSINESS_PROFILE_META_STATUSES,
} = require('./businessProfile.model');

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const META_BUSINESS_LIST_FIELDS = 'id,name';
const META_BUSINESS_DETAIL_FIELDS = 'id,name,verification_status,created_time,is_disabled_for_integrity_reasons';
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

function buildBusinessProfileQuery({ search, tokenLabel, brandId, agencyId } = {}) {
  const query = {};

  if (search?.trim()) {
    query.name = { $regex: escapeRegExp(search.trim()), $options: 'i' };
  }

  if (tokenLabel?.trim()) {
    query.sourceTokenLabel = tokenLabel.trim();
  }

  if (brandId?.trim()) {
    if (mongoose.Types.ObjectId.isValid(brandId.trim())) {
      query.brand = brandId.trim();
    } else {
      query._id = null;
    }
  }

  if (agencyId?.trim()) {
    if (mongoose.Types.ObjectId.isValid(agencyId.trim())) {
      query.agency = agencyId.trim();
    } else {
      query._id = null;
    }
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
    .populate('brand', 'name color')
    .populate('agency', 'name')
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
  const profile = await BusinessProfile.findById(profileId);
  if (!profile) {
    throw new HttpError(404, 'Business profile not found');
  }

  if (brandId) {
    const brand = await Brand.findById(brandId);
    if (!brand) {
      throw new HttpError(404, 'Brand not found');
    }
  }

  if (agencyId) {
    const agency = await Agency.findById(agencyId);
    if (!agency) {
      throw new HttpError(404, 'Agency not found');
    }
  }

  profile.brand = brandId || null;
  profile.agency = agencyId || null;
  await profile.save();

  await writeActivityLog({
    user: actor,
    action: 'BUSINESS_PROFILE_ASSIGNED',
    entity: 'BusinessProfile',
    entityId: profile._id.toString(),
    metadata: {
      name: profile.name,
      brandId: brandId || null,
      agencyId: agencyId || null,
    },
    req,
  });

  const populated = await BusinessProfile.findById(profile._id)
    .populate('brand', 'name color')
    .populate('agency', 'name');

  return populated.toSafeObject();
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

  const response = await fetch(url);
  await tokenService.recordTokenApiCall(token.id);
  const payload = await response.json();

  if (!response.ok) {
    throw new HttpError(400, getMetaErrorMessage(payload, `Meta API request failed for ${token.label}`));
  }

  return payload;
}

async function fetchBusinessesForToken(token) {
  const payload = await requestMetaApi('me/businesses', token, {
    fields: META_BUSINESS_LIST_FIELDS,
    limit: '100',
  });

  return Array.isArray(payload.data) ? payload.data : [];
}

async function fetchBusinessDetailsForToken(token, metaBusinessId, fields) {
  return requestMetaApi(metaBusinessId, token, { fields });
}

function shouldRetryWithoutStatusField(error) {
  return error.message?.toLowerCase().includes('is_disabled_for_integrity_reasons');
}

async function fetchBusinessProfileStatus(metaProfile, token, summary, { requestDisabledStatus = true } = {}) {
  if (!requestDisabledStatus) {
    try {
      summary.apiCalls += 1;
      const details = await fetchBusinessDetailsForToken(token, metaProfile.id, META_BUSINESS_SAFE_DETAIL_FIELDS);

      return {
        ...metaProfile,
        ...details,
        name: details.name || metaProfile.name,
        __statusCheckSucceeded: true,
        __statusCheckLimited: true,
      };
    } catch (error) {
      summary.statusCheckFailed += 1;

      return {
        ...metaProfile,
        __statusCheckSucceeded: false,
        __statusCheckError: error.message,
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
    };
  } catch (error) {
    if (shouldRetryWithoutStatusField(error)) {
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
        };
      } catch (fallbackError) {
        summary.statusCheckFailed += 1;

        return {
          ...metaProfile,
          __statusCheckSucceeded: false,
          __statusCheckError: fallbackError.message,
        };
      }
    }

    summary.statusCheckFailed += 1;

    return {
      ...metaProfile,
      __statusCheckSucceeded: false,
      __statusCheckError: error.message,
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

function hasProfileChanged(profile, metaProfile, token) {
  return (
    profile.name !== metaProfile.name ||
    profile.verificationStatus !== (metaProfile.verification_status || null) ||
    profile.metaStatus !== getMetaStatus(metaProfile) ||
    profile.metaStatusReason !== getMetaStatusReason(metaProfile) ||
    profile.isDisabledForIntegrityReasons !== getIntegrityDisabledFlag(metaProfile) ||
    profile.sourceToken?.toString() !== token.id ||
    profile.sourceTokenLabel !== token.label
  );
}

async function upsertMetaProfile(metaProfile, token, syncedAt) {
  const existingProfile = await BusinessProfile.findOne({ metaBusinessId: metaProfile.id });

  if (!existingProfile) {
    await BusinessProfile.create({
      metaBusinessId: metaProfile.id,
      name: metaProfile.name || `Business ${metaProfile.id}`,
      verificationStatus: metaProfile.verification_status || null,
      metaStatus: getMetaStatus(metaProfile),
      metaStatusReason: getMetaStatusReason(metaProfile),
      isDisabledForIntegrityReasons: getIntegrityDisabledFlag(metaProfile),
      lastStatusCheckedAt: syncedAt,
      sourceToken: token.id,
      sourceTokenLabel: token.label,
      rawMetaData: metaProfile,
      lastSyncedAt: syncedAt,
    });
    return 'created';
  }

  if (!hasProfileChanged(existingProfile, metaProfile, token)) {
    existingProfile.lastSyncedAt = syncedAt;
    existingProfile.lastStatusCheckedAt = syncedAt;
    existingProfile.sourceToken = token.id;
    existingProfile.sourceTokenLabel = token.label;
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
    errors: [],
  };

  for (const token of activeTokens) {
    try {
      summary.apiCalls += 1;
      const metaProfiles = await fetchBusinessesForToken(token);
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

        const result = await upsertMetaProfile(checkedMetaProfile, token, syncedAt);
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
