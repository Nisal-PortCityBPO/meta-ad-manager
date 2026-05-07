const HttpError = require('../../app/utils/httpError');
const { decryptSecret, encryptSecret, maskSecret } = require('../../app/utils/tokenCrypto');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const {
  Token,
  TOKEN_CONNECTION_STATUSES,
  TOKEN_STATUSES,
} = require('./token.model');

function validateTokenPayload({ label, purpose, accessToken }, { requireAccessToken = true } = {}) {
  if (!label?.trim()) {
    throw new HttpError(400, 'Token label is required');
  }

  if (!purpose?.trim()) {
    throw new HttpError(400, 'Purpose is required');
  }

  if (requireAccessToken && !accessToken?.trim()) {
    throw new HttpError(400, 'Access token is required');
  }
}

function validateStatus(status) {
  if (!Object.values(TOKEN_STATUSES).includes(status)) {
    throw new HttpError(400, 'Invalid token status');
  }
}

const BLOCKING_META_ERROR_CODES = new Set([102, 190]);
const BLOCKING_META_ERROR_SUBCODES = new Set([458, 459, 460, 463, 467, 490, 492, 493, 494, 495]);

function isTokenActive(status) {
  return status === TOKEN_STATUSES.ACTIVE || status === 'BLOCKED';
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
  const tokens = await Token.find().sort({ createdAt: -1 });
  return tokens.map((token) => token.toSafeObject());
}

async function listActiveTokensWithSecrets({ tokenId } = {}) {
  const query = { status: { $in: [TOKEN_STATUSES.ACTIVE, 'BLOCKED'] } };

  if (tokenId) {
    query._id = tokenId;
  }

  const tokens = await Token.find(query).sort({ createdAt: 1 });

  return tokens.map((token) => ({
    id: token._id.toString(),
    label: token.label,
    accessToken: decryptSecret(token.encryptedAccessToken),
  }));
}

async function createToken({ label, purpose, accessToken, status = TOKEN_STATUSES.ACTIVE, actor, req }) {
  validateTokenPayload({ label, purpose, accessToken });
  validateStatus(status);

  const token = await Token.create({
    label: label.trim(),
    purpose: purpose.trim(),
    encryptedAccessToken: encryptSecret(accessToken.trim()),
    maskedAccessToken: maskSecret(accessToken.trim()),
    status,
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

async function updateToken({ tokenId, label, purpose, accessToken, status, actor, req }) {
  validateTokenPayload({ label, purpose, accessToken }, { requireAccessToken: false });
  validateStatus(status);

  const token = await Token.findById(tokenId);
  if (!token) {
    throw new HttpError(404, 'Token not found');
  }

  token.label = label.trim();
  token.purpose = purpose.trim();
  token.status = status;
  token.updatedBy = actor._id;

  if (accessToken?.trim()) {
    token.encryptedAccessToken = encryptSecret(accessToken.trim());
    token.maskedAccessToken = maskSecret(accessToken.trim());
    token.connectionStatus = TOKEN_CONNECTION_STATUSES.UNKNOWN;
    token.connectionMessage = null;
    token.lastConnectionCheckedAt = null;
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

  await token.deleteOne();

  await writeActivityLog({
    user: actor,
    action: 'META_TOKEN_DELETED',
    entity: 'Token',
    entityId: token._id.toString(),
    metadata: {
      label: token.label,
    },
    req,
  });
}

async function recordTokenApiCall(tokenId) {
  const token = await Token.findById(tokenId);
  if (!token) {
    throw new HttpError(404, 'Token not found');
  }

  token.apiCallCount += 1;
  token.lastApiCallAt = new Date();
  await token.save();

  return token.toSafeObject();
}

async function updateTokenConnection({ tokenId, connectionStatus, message = null, actor = null, req = null }) {
  const token = await Token.findById(tokenId);
  if (!token) {
    return null;
  }

  const statusChanged = token.connectionStatus !== connectionStatus;

  token.connectionStatus = connectionStatus;
  token.connectionMessage = message;
  token.lastConnectionCheckedAt = new Date();
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
      },
      req,
    });
  }

  return token.toSafeObject();
}

async function markTokenConnected({ tokenId, actor = null, req = null }) {
  return updateTokenConnection({
    tokenId,
    connectionStatus: TOKEN_CONNECTION_STATUSES.CONNECTED,
    message: 'Meta API request completed successfully',
    actor,
    req,
  });
}

async function markTokenBlocked({ tokenId, reason, actor = null, req = null, connectionStatus = TOKEN_CONNECTION_STATUSES.BLOCKED }) {
  return updateTokenConnection({
    tokenId,
    connectionStatus,
    message: reason,
    actor,
    req,
  });
}

async function markTokenBlockedFromMetaError({ tokenId, payload, actor = null, req = null }) {
  if (!isBlockingMetaError(payload)) {
    return null;
  }

  return markTokenBlocked({
    tokenId,
    reason: payload?.error?.message || 'Meta reported this token as blocked or invalid',
    connectionStatus: getBlockedConnectionStatus(payload),
    actor,
    req,
  });
}

async function getDecryptedAccessToken(tokenId) {
  const token = await Token.findById(tokenId);
  if (!token) {
    throw new HttpError(404, 'Token not found');
  }

  if (!isTokenActive(token.status)) {
    throw new HttpError(400, 'Token is deactive');
  }

  return decryptSecret(token.encryptedAccessToken);
}

async function getActiveTokenWithSecret(tokenId) {
  const token = await Token.findById(tokenId);
  if (!token) {
    throw new HttpError(404, 'Token not found');
  }

  if (!isTokenActive(token.status)) {
    throw new HttpError(400, 'Token is deactive');
  }

  return {
    id: token._id.toString(),
    label: token.label,
    accessToken: decryptSecret(token.encryptedAccessToken),
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
  updateToken,
};
