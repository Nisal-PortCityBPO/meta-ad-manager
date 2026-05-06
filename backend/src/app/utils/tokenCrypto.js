const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('TOKEN_ENCRYPTION_KEY or JWT_SECRET is required for token encryption');
  }

  return crypto.createHash('sha256').update(secret).digest();
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

  return {
    value: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptSecret(encryptedSecret) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(encryptedSecret.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(encryptedSecret.authTag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedSecret.value, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function maskSecret(value = '') {
  if (!value) {
    return '';
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}••••${value.slice(-2)}`;
  }

  return `${value.slice(0, 6)}••••••••${value.slice(-4)}`;
}

module.exports = {
  decryptSecret,
  encryptSecret,
  maskSecret,
};
