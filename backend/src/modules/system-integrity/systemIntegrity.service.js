const crypto = require('crypto');
const HttpError = require('../../app/utils/httpError');
const { decryptSecret, encryptSecret } = require('../../app/utils/tokenCrypto');
const SystemIntegritySetting = require('./systemIntegrity.model');

const FOOTER_SETTING_KEY = 'protected_footer_v1';

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function getIntegritySecret() {
  return process.env.FOOTER_INTEGRITY_SECRET || process.env.JWT_SECRET || 'development-footer-integrity-secret';
}

function createRenderProof(payload, user) {
  const proofSource = [
    payload.marker,
    payload.company,
    payload.team,
    payload.currentYear,
    user?._id?.toString?.() || 'anonymous',
  ].join('|');

  return crypto
    .createHmac('sha256', getIntegritySecret())
    .update(proofSource)
    .digest('base64url');
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function validateFooterTemplate(template) {
  const requiredFields = [
    'marker',
    'company',
    'copyrightLabel',
    'copyrightSymbol',
    'startYear',
    'rightsText',
    'developedByLabel',
    'team',
    'productFromLabel',
    'flagAlt',
    'domId',
    'proofId',
  ];
  const missingField = requiredFields.find((field) => template?.[field] === undefined || template?.[field] === '');

  if (missingField) {
    throw new HttpError(500, `Protected footer configuration is missing ${missingField}`);
  }
}

async function getEncryptedFooterSetting() {
  const setting = await SystemIntegritySetting.findOne({ key: FOOTER_SETTING_KEY }).lean();

  if (!setting?.encryptedPayload) {
    throw new HttpError(500, 'Protected footer configuration is missing');
  }

  return setting.encryptedPayload;
}

async function getFooterTemplate() {
  let template;

  try {
    const encryptedPayload = await getEncryptedFooterSetting();
    template = JSON.parse(decryptSecret(encryptedPayload));
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(500, 'Protected footer configuration cannot be decrypted');
  }

  validateFooterTemplate(template);
  return template;
}

async function createFooterPayload(user) {
  const template = await getFooterTemplate();
  const payload = {
    ...template,
    currentYear: new Date().getFullYear(),
    issuedAt: Date.now(),
  };

  payload.renderProof = createRenderProof(payload, user);
  return payload;
}

async function createFooterPackage(user) {
  const payload = await createFooterPayload(user);
  const runtimeKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', runtimeKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);

  return {
    algorithm: 'AES-GCM',
    key: toBase64Url(runtimeKey),
    iv: toBase64Url(iv),
    tag: toBase64Url(cipher.getAuthTag()),
    payload: toBase64Url(encrypted),
  };
}

async function validateFooterProof({ proof, user }) {
  const payload = await createFooterPayload(user);
  return timingSafeEqualString(proof, payload.renderProof);
}

async function seedProtectedFooter(template) {
  validateFooterTemplate(template);

  const existingSetting = await SystemIntegritySetting.findOne({ key: FOOTER_SETTING_KEY });
  if (existingSetting) {
    return existingSetting;
  }

  return SystemIntegritySetting.create({
    key: FOOTER_SETTING_KEY,
    encryptedPayload: encryptSecret(JSON.stringify(template)),
  });
}

module.exports = {
  FOOTER_SETTING_KEY,
  createFooterPackage,
  seedProtectedFooter,
  validateFooterProof,
};
