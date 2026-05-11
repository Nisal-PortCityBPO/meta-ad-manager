const { writeActivityLog } = require('../../modules/activity-logs/activityLog.service');

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 60;
const MAX_DEPTH = 4;
const SENSITIVE_KEY_PATTERN = /(password|passcode|token|secret|otp|authorization|cookie|session|jwt|access[_-]?token|refresh[_-]?token|encryption|hash|private|credential)/i;

function parsePath(originalUrl = '') {
  try {
    return new URL(originalUrl, 'http://localhost').pathname;
  } catch {
    return originalUrl.split('?')[0] || '';
  }
}

function toTitleCaseSegment(segment) {
  return segment
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function deriveEntityFromPath(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  const apiIndex = segments.indexOf('api');
  const entitySegment = segments[apiIndex + 1] || segments[0] || 'system';

  return toTitleCaseSegment(entitySegment) || 'System';
}

function sanitizeValue(value, key = '', depth = 0) {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}... [truncated]` : value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return Array.isArray(value) ? `[Array ${value.length} items]` : '[Object]';
  }

  if (Array.isArray(value)) {
    const sanitizedItems = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, key, depth + 1));

    if (value.length > MAX_ARRAY_ITEMS) {
      sanitizedItems.push(`[${value.length - MAX_ARRAY_ITEMS} more items truncated]`);
    }

    return sanitizedItems;
  }

  const entries = Object.entries(value);
  const sanitizedObject = {};

  entries.slice(0, MAX_OBJECT_KEYS).forEach(([entryKey, entryValue]) => {
    sanitizedObject[entryKey] = sanitizeValue(entryValue, entryKey, depth + 1);
  });

  if (entries.length > MAX_OBJECT_KEYS) {
    sanitizedObject.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
  }

  return sanitizedObject;
}

function createFallbackAction(method, statusCode) {
  const outcome = statusCode >= 400 ? 'FAILED' : 'COMPLETED';
  return `API_${method}_${outcome}`;
}

function activityAudit(req, res, next) {
  const startedAt = Date.now();
  const pathname = parsePath(req.originalUrl || req.url);

  if (!pathname.startsWith('/api/') || !MUTATION_METHODS.has(req.method)) {
    next();
    return;
  }

  res.once('finish', () => {
    if (req.activityLogged) {
      return;
    }

    const statusCode = res.statusCode;

    writeActivityLog({
      user: req.user || null,
      action: createFallbackAction(req.method, statusCode),
      entity: deriveEntityFromPath(pathname),
      metadata: {
        actorEmail: req.user?.email || (typeof req.body?.email === 'string' ? req.body.email : undefined),
        fallbackAudit: true,
        statusCode,
        durationMs: Date.now() - startedAt,
        method: req.method,
        path: pathname,
        originalUrl: req.originalUrl || req.url,
        params: sanitizeValue(req.params || {}),
        query: sanitizeValue(req.query || {}),
        body: sanitizeValue(req.body || {}),
      },
      req,
    });
  });

  next();
}

module.exports = activityAudit;
