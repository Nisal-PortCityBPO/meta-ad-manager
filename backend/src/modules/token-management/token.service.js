const HttpError = require('../../app/utils/httpError');
const { decryptSecret, encryptSecret, maskSecret } = require('../../app/utils/tokenCrypto');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const { Token, TOKEN_STATUSES } = require('./token.model');

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

async function listTokens() {
  const tokens = await Token.find().sort({ createdAt: -1 });
  return tokens.map((token) => token.toSafeObject());
}

async function listActiveTokensWithSecrets({ tokenId } = {}) {
  const query = { status: TOKEN_STATUSES.ACTIVE };

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

async function getDecryptedAccessToken(tokenId) {
  const token = await Token.findById(tokenId);
  if (!token) {
    throw new HttpError(404, 'Token not found');
  }

  if (token.status !== TOKEN_STATUSES.ACTIVE) {
    throw new HttpError(400, 'Token is blocked');
  }

  return decryptSecret(token.encryptedAccessToken);
}

module.exports = {
  createToken,
  deleteToken,
  getDecryptedAccessToken,
  listActiveTokensWithSecrets,
  listTokens,
  recordTokenApiCall,
  updateToken,
};
