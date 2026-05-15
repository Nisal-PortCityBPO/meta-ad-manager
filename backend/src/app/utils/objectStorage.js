const fs = require('fs');
const path = require('path');
require('../config/env');
const { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const STORAGE_PROVIDERS = Object.freeze({
  LOCAL: 'LOCAL',
  SPACES: 'SPACES',
});

let spacesClient = null;
const REQUIRED_SPACES_ENV_KEYS = [
  'DO_SPACES_KEY',
  'DO_SPACES_SECRET',
  'DO_SPACES_BUCKET',
  'DO_SPACES_REGION',
  'DO_SPACES_ENDPOINT',
];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePrefix(value) {
  return normalizeText(value)
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

function sanitizeObjectFilename(value) {
  return normalizeText(value)
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `asset-${Date.now()}`;
}

function isSpacesConfigured() {
  return REQUIRED_SPACES_ENV_KEYS.every((key) => Boolean(process.env[key]));
}

function hasAnySpacesConfig() {
  return REQUIRED_SPACES_ENV_KEYS.some((key) => Boolean(process.env[key])) || Boolean(process.env.DO_SPACES_CDN || process.env.DO_SPACES_FOLDER);
}

function getMissingSpacesEnvKeys() {
  return REQUIRED_SPACES_ENV_KEYS.filter((key) => !process.env[key]);
}

function assertSpacesConfigIsNotPartial() {
  if (!isSpacesConfigured() && hasAnySpacesConfig()) {
    throw new Error(`DigitalOcean Spaces config is incomplete. Missing: ${getMissingSpacesEnvKeys().join(', ')}`);
  }
}

function getSpacesClient() {
  assertSpacesConfigIsNotPartial();

  if (!isSpacesConfigured()) {
    return null;
  }

  if (!spacesClient) {
    spacesClient = new S3Client({
      region: process.env.DO_SPACES_REGION,
      endpoint: process.env.DO_SPACES_ENDPOINT,
      credentials: {
        accessKeyId: process.env.DO_SPACES_KEY,
        secretAccessKey: process.env.DO_SPACES_SECRET,
      },
    });
  }

  return spacesClient;
}

function getStorageProvider() {
  assertSpacesConfigIsNotPartial();
  return isSpacesConfigured() ? STORAGE_PROVIDERS.SPACES : STORAGE_PROVIDERS.LOCAL;
}

function getStorageDiagnostics() {
  const provider = getStorageProvider();

  return {
    provider,
    bucket: provider === STORAGE_PROVIDERS.SPACES ? process.env.DO_SPACES_BUCKET : '',
    region: provider === STORAGE_PROVIDERS.SPACES ? process.env.DO_SPACES_REGION : '',
    endpoint: provider === STORAGE_PROVIDERS.SPACES ? process.env.DO_SPACES_ENDPOINT : '',
    cdn: provider === STORAGE_PROVIDERS.SPACES ? process.env.DO_SPACES_CDN || '' : '',
    folder: provider === STORAGE_PROVIDERS.SPACES ? normalizePrefix(process.env.DO_SPACES_FOLDER || '') : '',
  };
}

function buildObjectKey(namespace, filename) {
  const folderPrefix = normalizePrefix(process.env.DO_SPACES_FOLDER || '');
  const namespacePrefix = normalizePrefix(namespace);
  const safeFilename = sanitizeObjectFilename(filename);

  return [folderPrefix, namespacePrefix, safeFilename].filter(Boolean).join('/');
}

function encodeObjectKeyForUrl(key) {
  return String(key || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function getPublicObjectUrl(key) {
  if (!key || !isSpacesConfigured()) {
    return '';
  }

  const cdnBase = normalizeText(process.env.DO_SPACES_CDN).replace(/\/+$/g, '');
  const endpointBase = normalizeText(process.env.DO_SPACES_ENDPOINT).replace(/\/+$/g, '');
  const baseUrl = cdnBase || `${endpointBase}/${process.env.DO_SPACES_BUCKET}`;

  return `${baseUrl}/${encodeObjectKeyForUrl(key)}`;
}

async function streamToBuffer(stream) {
  if (!stream) {
    return Buffer.alloc(0);
  }

  if (typeof stream.transformToByteArray === 'function') {
    return Buffer.from(await stream.transformToByteArray());
  }

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function uploadBufferToObjectStorage({ namespace, filename, buffer, contentType }) {
  const client = getSpacesClient();

  if (!client) {
    return null;
  }

  const key = buildObjectKey(namespace, filename);
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
      ACL: 'public-read',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return {
    storageProvider: STORAGE_PROVIDERS.SPACES,
    storageKey: key,
    url: getPublicObjectUrl(key),
  };
}

async function uploadFileToObjectStorage({ namespace, filename, filePath, contentType, contentLength }) {
  const client = getSpacesClient();

  if (!client) {
    return null;
  }

  const key = buildObjectKey(namespace, filename);
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: contentType || 'application/octet-stream',
      ContentLength: contentLength || fs.statSync(filePath).size,
      ACL: 'public-read',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return {
    storageProvider: STORAGE_PROVIDERS.SPACES,
    storageKey: key,
    url: getPublicObjectUrl(key),
  };
}

async function readObjectStorageBuffer(storageKey) {
  const client = getSpacesClient();

  if (!client || !storageKey) {
    return null;
  }

  const payload = await client.send(
    new GetObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: storageKey,
    })
  );

  return streamToBuffer(payload.Body);
}

async function deleteObjectStorageAsset(storageKey) {
  const client = getSpacesClient();

  if (!client || !storageKey) {
    return;
  }

  await client.send(
    new DeleteObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: storageKey,
    })
  );
}

function moveFileWithinLocalStorage({ sourcePath, targetDir, filename }) {
  fs.mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, filename);
  fs.renameSync(sourcePath, targetPath);
  return targetPath;
}

function writeBufferWithinLocalStorage({ targetDir, filename, buffer }) {
  fs.mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, filename);
  fs.writeFileSync(targetPath, buffer);
  return targetPath;
}

module.exports = {
  STORAGE_PROVIDERS,
  deleteObjectStorageAsset,
  getPublicObjectUrl,
  getStorageDiagnostics,
  getStorageProvider,
  moveFileWithinLocalStorage,
  readObjectStorageBuffer,
  uploadBufferToObjectStorage,
  uploadFileToObjectStorage,
  writeBufferWithinLocalStorage,
};
