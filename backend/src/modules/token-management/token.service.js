const HttpError = require('../../app/utils/httpError');
const mongoose = require('mongoose');
const { decryptSecret, encryptSecret, maskSecret } = require('../../app/utils/tokenCrypto');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const Agency = require('../agencies/agency.model');
const LaunchTemplate = require('../ads-launch/adsLaunch.model');
const ManagedCampaign = require('../ads-manage/adsManage.model');
const Brand = require('../brands/brand.model');
const { BusinessProfile } = require('../business-profiles/businessProfile.model');
const SocialAccount = require('../social-accounts/socialAccount.model');
const {
  Token,
  TOKEN_CONNECTION_STATUSES,
  TOKEN_STATUSES,
} = require('./token.model');

const TOKEN_USAGE_TYPES = Object.freeze({
  PROFILE: 'PROFILE',
  SYSTEM_USER: 'SYSTEM_USER',
});

function validateTokenPayload(
  { label, adsPowerProfile, profileAccessToken, systemUserAccessToken, accessToken },
  { requireProfileAccessToken = true, requireSystemUserAccessToken = true } = {}
) {
  if (!label?.trim()) {
    throw new HttpError(400, 'Token label is required');
  }

  if (!adsPowerProfile?.trim()) {
    throw new HttpError(400, 'AdsPower Profile is required');
  }

  if (requireProfileAccessToken && !(profileAccessToken || accessToken)?.trim()) {
    throw new HttpError(400, 'Profile Access token is required');
  }

  if (requireSystemUserAccessToken && !systemUserAccessToken?.trim()) {
    throw new HttpError(400, 'System User Access token is required');
  }
}

function validateStatus(status) {
  if (!Object.values(TOKEN_STATUSES).includes(status)) {
    throw new HttpError(400, 'Invalid token status');
  }
}

function validateOptionalStatus(status, fallback = TOKEN_STATUSES.ACTIVE) {
  const resolvedStatus = status || fallback;
  validateStatus(resolvedStatus);
  return resolvedStatus;
}

function validatePerHourApiCallLimit(value) {
  const parsedLimit = Number.parseInt(value, 10);

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit >= 200) {
    throw new HttpError(400, 'Per Hour API calls must be a number from 1 to 199');
  }

  return parsedLimit;
}

async function validateTokenAssignment({ brandId, agencyId }) {
  if (!brandId || !mongoose.Types.ObjectId.isValid(brandId)) {
    throw new HttpError(400, 'Brand is required');
  }

  if (!agencyId || !mongoose.Types.ObjectId.isValid(agencyId)) {
    throw new HttpError(400, 'Agency is required');
  }

  const [brand, agency] = await Promise.all([Brand.findById(brandId), Agency.findById(agencyId)]);

  if (!brand) {
    throw new HttpError(404, 'Brand not found');
  }

  if (!agency) {
    throw new HttpError(404, 'Agency not found');
  }

  return { agency, brand };
}

const BLOCKING_META_ERROR_CODES = new Set([102, 190]);
const BLOCKING_META_ERROR_SUBCODES = new Set([458, 459, 460, 463, 467, 490, 492, 493, 494, 495]);

function isTokenActive(status) {
  return status === TOKEN_STATUSES.ACTIVE || status === 'BLOCKED';
}

function isUsageStatusActive(status) {
  return !status || status === TOKEN_STATUSES.ACTIVE || status === 'BLOCKED';
}

function normalizeTokenUsageType(tokenType) {
  return tokenType === TOKEN_USAGE_TYPES.SYSTEM_USER ? TOKEN_USAGE_TYPES.SYSTEM_USER : TOKEN_USAGE_TYPES.PROFILE;
}

function hasEncryptedSecret(encryptedSecret) {
  return Boolean(encryptedSecret?.value && encryptedSecret?.iv && encryptedSecret?.authTag);
}

function incrementHourlyCount({ count, windowStartedAt, now }) {
  const oneHourMs = 60 * 60 * 1000;
  const existingWindowTime = windowStartedAt ? new Date(windowStartedAt).getTime() : null;

  if (!existingWindowTime || now.getTime() - existingWindowTime >= oneHourMs) {
    return {
      count: 1,
      windowStartedAt: now,
    };
  }

  return {
    count: (count || 0) + 1,
    windowStartedAt,
  };
}

function isBlockingMetaError(payload = {}) {
  const error = payload.error || {};
  const code = Number(error.code);
  const subcode = Number(error.error_subcode);
  const message = [error.message, error.error_user_msg]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (BLOCKING_META_ERROR_CODES.has(code) || BLOCKING_META_ERROR_SUBCODES.has(subcode)) {
    return true;
  }

  return [
    'access token has expired',
    'access token is invalid',
    'api access blocked',
    'api access has been blocked',
    'api access is blocked',
    'invalid access token',
    'invalid oauth',
    'temporarily blocked',
    'session has expired',
    'session is invalid',
    'token has expired',
  ].some((pattern) => message.includes(pattern));
}

function getBlockedConnectionStatus(payload = {}) {
  const error = payload.error || {};
  const message = [error.message, error.error_user_msg]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (message.includes('disabled') || message.includes('deactivated')) {
    return TOKEN_CONNECTION_STATUSES.DISABLED;
  }

  return TOKEN_CONNECTION_STATUSES.BLOCKED;
}

async function listTokens() {
  const tokens = await Token.find()
    .populate('brand', 'name color')
    .populate('agency', 'name')
    .sort({ createdAt: -1 });
  return tokens.map((token) => token.toSafeObject());
}

async function listActiveTokensWithSecrets({ tokenId, tokenType = TOKEN_USAGE_TYPES.PROFILE } = {}) {
  const usageType = normalizeTokenUsageType(tokenType);
  const query = {
    status: { $in: [TOKEN_STATUSES.ACTIVE, 'BLOCKED'] },
  };

  if (usageType === TOKEN_USAGE_TYPES.SYSTEM_USER) {
    query.$or = [
      { systemUserAccessTokenStatus: { $exists: false } },
      { systemUserAccessTokenStatus: { $in: [TOKEN_STATUSES.ACTIVE, 'BLOCKED'] } },
    ];
    query['encryptedSystemUserAccessToken.value'] = { $exists: true, $ne: '' };
  } else {
    query.$or = [
      { profileAccessTokenStatus: { $exists: false } },
      { profileAccessTokenStatus: { $in: [TOKEN_STATUSES.ACTIVE, 'BLOCKED'] } },
    ];
  }

  if (tokenId) {
    query._id = tokenId;
  }

  const tokens = await Token.find(query).sort({ createdAt: 1 });

  return tokens
    .filter((token) =>
      usageType === TOKEN_USAGE_TYPES.SYSTEM_USER
        ? hasEncryptedSecret(token.encryptedSystemUserAccessToken)
        : hasEncryptedSecret(token.encryptedAccessToken)
    )
    .map((token) => ({
      id: token._id.toString(),
      label: token.label,
      adsPowerProfile: token.adsPowerProfile || '',
      brandId: token.brand?.toString?.() || null,
      agencyId: token.agency?.toString?.() || null,
      accessToken: decryptSecret(
        usageType === TOKEN_USAGE_TYPES.SYSTEM_USER
          ? token.encryptedSystemUserAccessToken
          : token.encryptedAccessToken
      ),
      tokenType: usageType,
    }));
}

async function createToken({
  label,
  purpose = '',
  adsPowerProfile = '',
  brandId,
  agencyId,
  profileAccessToken,
  systemUserAccessToken,
  accessToken,
  profileAccessTokenStatus,
  systemUserAccessTokenStatus,
  profilePerHourApiCallLimit,
  systemUserPerHourApiCallLimit,
  perHourApiCallLimit,
  status = TOKEN_STATUSES.ACTIVE,
  actor,
  req,
}) {
  const resolvedProfileAccessToken = profileAccessToken || accessToken;
  validateTokenPayload({
    label,
    adsPowerProfile,
    profileAccessToken: resolvedProfileAccessToken,
    systemUserAccessToken,
  });
  const resolvedStatus = validateOptionalStatus(status);
  const resolvedProfileStatus = validateOptionalStatus(profileAccessTokenStatus);
  const resolvedSystemUserStatus = validateOptionalStatus(systemUserAccessTokenStatus);
  const resolvedProfileApiCallLimit = validatePerHourApiCallLimit(profilePerHourApiCallLimit || perHourApiCallLimit || 100);
  const resolvedSystemUserApiCallLimit = validatePerHourApiCallLimit(systemUserPerHourApiCallLimit || perHourApiCallLimit || 100);
  const { agency, brand } = await validateTokenAssignment({ brandId, agencyId });

  const token = await Token.create({
    label: label.trim(),
    purpose: purpose?.trim() || 'Meta connection',
    adsPowerProfile: adsPowerProfile.trim(),
    brand: brand._id,
    agency: agency._id,
    encryptedAccessToken: encryptSecret(resolvedProfileAccessToken.trim()),
    maskedAccessToken: maskSecret(resolvedProfileAccessToken.trim()),
    profileAccessTokenStatus: resolvedProfileStatus,
    encryptedSystemUserAccessToken: encryptSecret(systemUserAccessToken.trim()),
    maskedSystemUserAccessToken: maskSecret(systemUserAccessToken.trim()),
    systemUserAccessTokenStatus: resolvedSystemUserStatus,
    perHourApiCallLimit: resolvedProfileApiCallLimit,
    profilePerHourApiCallLimit: resolvedProfileApiCallLimit,
    systemUserPerHourApiCallLimit: resolvedSystemUserApiCallLimit,
    status: resolvedStatus,
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  await writeActivityLog({
    user: actor,
    action: 'META_TOKEN_CREATED',
    entity: 'Token',
    entityId: token._id.toString(),
    metadata: {
      label: token.label,
      status: token.status,
    },
    req,
  });

  return token.toSafeObject();
}

async function updateToken({
  tokenId,
  label,
  purpose = '',
  adsPowerProfile = '',
  brandId,
  agencyId,
  profileAccessToken,
  systemUserAccessToken,
  accessToken,
  profileAccessTokenStatus,
  systemUserAccessTokenStatus,
  profilePerHourApiCallLimit,
  systemUserPerHourApiCallLimit,
  perHourApiCallLimit,
  status,
  actor,
  req,
}) {
  const resolvedProfileAccessToken = profileAccessToken || accessToken;
  validateTokenPayload(
    {
      label,
      adsPowerProfile,
      profileAccessToken: resolvedProfileAccessToken,
      systemUserAccessToken,
    },
    { requireProfileAccessToken: false, requireSystemUserAccessToken: false }
  );
  const resolvedStatus = validateOptionalStatus(status);
  const resolvedProfileStatus = validateOptionalStatus(profileAccessTokenStatus);
  const resolvedSystemUserStatus = validateOptionalStatus(systemUserAccessTokenStatus);
  const resolvedProfileApiCallLimit = validatePerHourApiCallLimit(profilePerHourApiCallLimit || perHourApiCallLimit || 100);
  const resolvedSystemUserApiCallLimit = validatePerHourApiCallLimit(systemUserPerHourApiCallLimit || perHourApiCallLimit || 100);
  const { agency, brand } = await validateTokenAssignment({ brandId, agencyId });

  const token = await Token.findById(tokenId);
  if (!token) {
    throw new HttpError(404, 'Token not found');
  }

  token.label = label.trim();
  token.purpose = purpose?.trim() || 'Meta connection';
  token.adsPowerProfile = adsPowerProfile.trim();
  token.brand = brand._id;
  token.agency = agency._id;
  token.status = resolvedStatus;
  token.profileAccessTokenStatus = resolvedProfileStatus;
  token.systemUserAccessTokenStatus = resolvedSystemUserStatus;
  token.perHourApiCallLimit = resolvedProfileApiCallLimit;
  token.profilePerHourApiCallLimit = resolvedProfileApiCallLimit;
  token.systemUserPerHourApiCallLimit = resolvedSystemUserApiCallLimit;
  token.updatedBy = actor._id;

  if (resolvedProfileAccessToken?.trim()) {
    token.encryptedAccessToken = encryptSecret(resolvedProfileAccessToken.trim());
    token.maskedAccessToken = maskSecret(resolvedProfileAccessToken.trim());
    token.connectionStatus = TOKEN_CONNECTION_STATUSES.UNKNOWN;
    token.connectionMessage = null;
    token.lastConnectionCheckedAt = null;
  }

  if (systemUserAccessToken?.trim()) {
    token.encryptedSystemUserAccessToken = encryptSecret(systemUserAccessToken.trim());
    token.maskedSystemUserAccessToken = maskSecret(systemUserAccessToken.trim());
    token.systemUserConnectionStatus = TOKEN_CONNECTION_STATUSES.UNKNOWN;
    token.systemUserConnectionMessage = null;
    token.lastSystemUserConnectionCheckedAt = null;
  }

  await token.save();

  await writeActivityLog({
    user: actor,
    action: 'META_TOKEN_UPDATED',
    entity: 'Token',
    entityId: token._id.toString(),
    metadata: {
      label: token.label,
      status: token.status,
    },
    req,
  });

  return token.toSafeObject();
}

async function deleteToken({ tokenId, actor, req }) {
  const token = await Token.findById(tokenId);
  if (!token) {
    throw new HttpError(404, 'Token not found');
  }

  const tokenObjectId = token._id;
  const tokenIdString = token._id.toString();
  const socialAccounts = await SocialAccount.find({ sourceToken: tokenObjectId }).select('_id');
  const socialAccountIds = socialAccounts.map((account) => account._id);
  const [businessProfilesDeleted, socialAccountsDeleted, managedCampaignsDeleted, launchTemplatesDeleted] =
    await Promise.all([
      BusinessProfile.deleteMany({
        $or: [
          { sourceToken: tokenObjectId },
          ...(socialAccountIds.length ? [{ socialAccount: { $in: socialAccountIds } }] : []),
        ],
      }),
      SocialAccount.deleteMany({ sourceToken: tokenObjectId }),
      ManagedCampaign.deleteMany({ tokenId: tokenIdString }),
      LaunchTemplate.deleteMany({ 'config.tokenId': tokenIdString }),
    ]);

  await token.deleteOne();

  await writeActivityLog({
    user: actor,
    action: 'META_TOKEN_DELETED',
    entity: 'Token',
    entityId: token._id.toString(),
    metadata: {
      label: token.label,
      deletedBusinessProfiles: businessProfilesDeleted.deletedCount || 0,
      deletedSocialAccounts: socialAccountsDeleted.deletedCount || 0,
      deletedManagedCampaigns: managedCampaignsDeleted.deletedCount || 0,
      deletedLaunchTemplates: launchTemplatesDeleted.deletedCount || 0,
    },
    req,
  });

  return {
    businessProfiles: businessProfilesDeleted.deletedCount || 0,
    launchTemplates: launchTemplatesDeleted.deletedCount || 0,
    managedCampaigns: managedCampaignsDeleted.deletedCount || 0,
    socialAccounts: socialAccountsDeleted.deletedCount || 0,
  };
}

async function recordTokenApiCall(tokenId, tokenType = TOKEN_USAGE_TYPES.PROFILE) {
  const token = await Token.findById(tokenId);
  if (!token) {
    throw new HttpError(404, 'Token not found');
  }

  const usageType = normalizeTokenUsageType(tokenType);
  const now = new Date();

  if (usageType === TOKEN_USAGE_TYPES.SYSTEM_USER) {
    const hourly = incrementHourlyCount({
      count: token.systemUserHourlyApiCallCount,
      windowStartedAt: token.systemUserHourlyWindowStartedAt,
      now,
    });

    token.systemUserApiCallCount += 1;
    token.systemUserHourlyApiCallCount = hourly.count;
    token.systemUserHourlyWindowStartedAt = hourly.windowStartedAt;
    token.systemUserLastApiCallAt = now;
  } else {
    const hourly = incrementHourlyCount({
      count: token.profileHourlyApiCallCount,
      windowStartedAt: token.profileHourlyWindowStartedAt,
      now,
    });

    token.apiCallCount += 1;
    token.profileHourlyApiCallCount = hourly.count;
    token.profileHourlyWindowStartedAt = hourly.windowStartedAt;
    token.lastApiCallAt = now;
  }

  await token.save();
  await SocialAccount.updateMany(
    { sourceToken: token._id },
    {
      $set: {
        brand: token.brand || null,
        agency: token.agency || null,
      },
    }
  );

  return token.toSafeObject();
}

async function updateTokenConnection({
  tokenId,
  connectionStatus,
  message = null,
  actor = null,
  req = null,
  tokenType = TOKEN_USAGE_TYPES.PROFILE,
}) {
  const token = await Token.findById(tokenId);
  if (!token) {
    return null;
  }

  const usageType = normalizeTokenUsageType(tokenType);
  const statusChanged =
    usageType === TOKEN_USAGE_TYPES.SYSTEM_USER
      ? token.systemUserConnectionStatus !== connectionStatus
      : token.connectionStatus !== connectionStatus;

  if (usageType === TOKEN_USAGE_TYPES.SYSTEM_USER) {
    token.systemUserConnectionStatus = connectionStatus;
    token.systemUserConnectionMessage = message;
    token.lastSystemUserConnectionCheckedAt = new Date();
  } else {
    token.connectionStatus = connectionStatus;
    token.connectionMessage = message;
    token.lastConnectionCheckedAt = new Date();
  }

  token.updatedBy = actor?._id || token.updatedBy;
  await token.save();

  if (statusChanged) {
    await writeActivityLog({
      user: actor,
      action: `META_TOKEN_CONNECTION_${connectionStatus}`,
      entity: 'Token',
      entityId: token._id.toString(),
      metadata: {
        label: token.label,
        message,
        tokenType: usageType,
      },
      req,
    });
  }

  return token.toSafeObject();
}

async function markTokenConnected({ tokenId, actor = null, req = null, tokenType = TOKEN_USAGE_TYPES.PROFILE }) {
  return updateTokenConnection({
    tokenId,
    connectionStatus: TOKEN_CONNECTION_STATUSES.CONNECTED,
    message: 'Meta API request completed successfully',
    actor,
    req,
    tokenType,
  });
}

async function markTokenBlocked({
  tokenId,
  reason,
  actor = null,
  req = null,
  connectionStatus = TOKEN_CONNECTION_STATUSES.BLOCKED,
  tokenType = TOKEN_USAGE_TYPES.PROFILE,
}) {
  return updateTokenConnection({
    tokenId,
    connectionStatus,
    message: reason,
    actor,
    req,
    tokenType,
  });
}

async function markTokenBlockedFromMetaError({ tokenId, payload, actor = null, req = null, tokenType = TOKEN_USAGE_TYPES.PROFILE }) {
  if (!isBlockingMetaError(payload)) {
    return null;
  }

  return markTokenBlocked({
    tokenId,
    reason: payload?.error?.message || 'Meta reported this token as blocked or invalid',
    connectionStatus: getBlockedConnectionStatus(payload),
    actor,
    req,
    tokenType,
  });
}

async function getDecryptedAccessToken(tokenId) {
  const token = await Token.findById(tokenId);
  if (!token) {
    throw new HttpError(404, 'Token not found');
  }

  if (!isTokenActive(token.status) || !isUsageStatusActive(token.profileAccessTokenStatus)) {
    throw new HttpError(400, 'Token is deactive');
  }

  return decryptSecret(token.encryptedAccessToken);
}

async function getActiveTokenWithSecret(tokenId, tokenType = TOKEN_USAGE_TYPES.PROFILE) {
  const token = await Token.findById(tokenId);
  if (!token) {
    throw new HttpError(404, 'Token not found');
  }

  if (!isTokenActive(token.status)) {
    throw new HttpError(400, 'Token is deactive');
  }

  const usageType = normalizeTokenUsageType(tokenType);
  const encryptedSecret =
    usageType === TOKEN_USAGE_TYPES.SYSTEM_USER ? token.encryptedSystemUserAccessToken : token.encryptedAccessToken;
  const usageStatus =
    usageType === TOKEN_USAGE_TYPES.SYSTEM_USER ? token.systemUserAccessTokenStatus : token.profileAccessTokenStatus;

  if (!isUsageStatusActive(usageStatus) || !hasEncryptedSecret(encryptedSecret)) {
    throw new HttpError(
      400,
      usageType === TOKEN_USAGE_TYPES.SYSTEM_USER
        ? 'System User Access token is deactive or not saved'
        : 'Profile Access token is deactive or not saved'
    );
  }

  return {
    id: token._id.toString(),
    label: token.label,
    adsPowerProfile: token.adsPowerProfile || '',
    accessToken: decryptSecret(encryptedSecret),
    tokenType: usageType,
  };
}

module.exports = {
  createToken,
  deleteToken,
  getActiveTokenWithSecret,
  getDecryptedAccessToken,
  listActiveTokensWithSecrets,
  listTokens,
  markTokenConnected,
  markTokenBlocked,
  markTokenBlockedFromMetaError,
  recordTokenApiCall,
  TOKEN_USAGE_TYPES,
  updateToken,
};
