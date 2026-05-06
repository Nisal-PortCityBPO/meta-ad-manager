const HttpError = require('../../app/utils/httpError');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const Agency = require('../agencies/agency.model');
const Brand = require('../brands/brand.model');
const tokenService = require('../token-management/token.service');
const BusinessProfile = require('./businessProfile.model');

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const META_BUSINESS_FIELDS = 'id,name,verification_status,created_time';

async function listBusinessProfiles() {
  const profiles = await BusinessProfile.find()
    .populate('brand', 'name color')
    .populate('agency', 'name')
    .sort({ name: 1 });

  return profiles.map((profile) => profile.toSafeObject());
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

async function fetchBusinessesForToken(token) {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/businesses`);
  url.searchParams.set('fields', META_BUSINESS_FIELDS);
  url.searchParams.set('limit', '100');
  url.searchParams.set('access_token', token.accessToken);

  const response = await fetch(url);
  await tokenService.recordTokenApiCall(token.id);
  const payload = await response.json();

  if (!response.ok) {
    throw new HttpError(400, payload.error?.message || `Meta API request failed for ${token.label}`);
  }

  return Array.isArray(payload.data) ? payload.data : [];
}

function hasProfileChanged(profile, metaProfile) {
  return profile.name !== metaProfile.name || profile.verificationStatus !== (metaProfile.verification_status || null);
}

async function upsertMetaProfile(metaProfile, token, syncedAt) {
  const existingProfile = await BusinessProfile.findOne({ metaBusinessId: metaProfile.id });

  if (!existingProfile) {
    await BusinessProfile.create({
      metaBusinessId: metaProfile.id,
      name: metaProfile.name || `Business ${metaProfile.id}`,
      verificationStatus: metaProfile.verification_status || null,
      sourceToken: token.id,
      sourceTokenLabel: token.label,
      rawMetaData: metaProfile,
      lastSyncedAt: syncedAt,
    });
    return 'created';
  }

  if (!hasProfileChanged(existingProfile, metaProfile)) {
    existingProfile.lastSyncedAt = syncedAt;
    await existingProfile.save();
    return 'skipped';
  }

  existingProfile.name = metaProfile.name || existingProfile.name;
  existingProfile.verificationStatus = metaProfile.verification_status || null;
  existingProfile.rawMetaData = metaProfile;
  existingProfile.lastSyncedAt = syncedAt;
  await existingProfile.save();
  return 'updated';
}

async function syncBusinessProfiles({ actor, req }) {
  const activeTokens = await tokenService.listActiveTokensWithSecrets();

  if (!activeTokens.length) {
    throw new HttpError(400, 'Add an active Meta API token before fetching business profiles');
  }

  const syncedAt = new Date();
  const summary = {
    tokensChecked: activeTokens.length,
    apiCalls: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const token of activeTokens) {
    try {
      const metaProfiles = await fetchBusinessesForToken(token);
      summary.apiCalls += 1;

      for (const metaProfile of metaProfiles) {
        if (!metaProfile.id) {
          continue;
        }

        const result = await upsertMetaProfile(metaProfile, token, syncedAt);
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
    metadata: summary,
    req,
  });

  return {
    summary,
    profiles: await listBusinessProfiles(),
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
