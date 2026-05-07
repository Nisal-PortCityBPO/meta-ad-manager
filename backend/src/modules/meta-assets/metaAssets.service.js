const HttpError = require('../../app/utils/httpError');
const { waitForMetaApiPacing } = require('../../app/utils/metaApiPacing');
const tokenService = require('../token-management/token.service');

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const META_ASSET_CACHE_TTL_MS = Number(process.env.META_ASSET_CACHE_TTL_MS || 5 * 60 * 1000);
const metaAssetCache = new Map();

function buildGraphUrl(path, params = {}) {
  const normalizedPath = path.startsWith('http')
    ? new URL(path)
    : new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path.replace(/^\//, '')}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      normalizedPath.searchParams.set(key, String(value));
    }
  });

  return normalizedPath;
}

function getCacheEntry(key) {
  const entry = metaAssetCache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    metaAssetCache.delete(key);
    return null;
  }

  return entry.value;
}

function setCacheEntry(key, value) {
  metaAssetCache.set(key, {
    value,
    expiresAt: Date.now() + META_ASSET_CACHE_TTL_MS,
  });

  return value;
}

async function getOrSetCacheEntry(key, loader) {
  const cached = getCacheEntry(key);

  if (cached) {
    return cached;
  }

  const value = await loader();
  return setCacheEntry(key, value);
}

function getBaseAssetsCacheKey(tokenId) {
  return `base:${tokenId}`;
}

function getPixelsCacheKey(tokenId, adAccountId) {
  return `pixels:${tokenId}:${adAccountId}`;
}

async function fetchGraphCollection({ token, path, fields, limit = 100 }) {
  const items = [];
  let nextUrl = buildGraphUrl(path, {
    access_token: token.accessToken,
    fields,
    limit,
  }).toString();

  while (nextUrl) {
    await waitForMetaApiPacing();

    const response = await fetch(nextUrl);
    await tokenService.recordTokenApiCall(token.id);
    const payload = await response.json();

    if (!response.ok) {
      throw new HttpError(400, payload.error?.message || `Meta API request failed for ${token.label}`);
    }

    if (Array.isArray(payload.data)) {
      items.push(...payload.data);
    }

    nextUrl = payload.paging?.next || null;
  }

  return items;
}

function normalizeAdAccount(item) {
  const accountId = item.account_id || String(item.id || '').replace(/^act_/, '');
  const nodeId = String(item.id || `act_${accountId}`);

  return {
    id: nodeId,
    accountId,
    name: item.name || `Ad Account ${accountId}`,
    currency: item.currency || null,
    status: item.account_status ?? null,
  };
}

function normalizePage(item) {
  return {
    id: String(item.id),
    name: item.name || `Page ${item.id}`,
    category: item.category || null,
  };
}

function normalizePixel(item) {
  return {
    id: String(item.id),
    name: item.name || `Pixel ${item.id}`,
  };
}

function intersectPixels(pixelCollections) {
  if (!pixelCollections.length) {
    return [];
  }

  const frequency = new Map();

  pixelCollections.forEach((pixels) => {
    const seen = new Set();

    pixels.forEach((pixel) => {
      if (!pixel?.id || seen.has(pixel.id)) {
        return;
      }

      seen.add(pixel.id);

      if (!frequency.has(pixel.id)) {
        frequency.set(pixel.id, {
          count: 0,
          pixel,
        });
      }

      frequency.get(pixel.id).count += 1;
    });
  });

  return Array.from(frequency.values())
    .filter((entry) => entry.count === pixelCollections.length)
    .map((entry) => entry.pixel)
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function getBaseAssets({ tokenId, token }) {
  return getOrSetCacheEntry(getBaseAssetsCacheKey(tokenId), async () => {
    const warnings = [];

    let adAccountsResult;
    let pagesResult;

    try {
      adAccountsResult = {
        status: 'fulfilled',
        value: await fetchGraphCollection({
          token,
          path: 'me/adaccounts',
          fields: 'id,account_id,name,account_status,currency',
        }),
      };
    } catch (error) {
      adAccountsResult = {
        status: 'rejected',
        reason: error,
      };
    }

    try {
      pagesResult = {
        status: 'fulfilled',
        value: await fetchGraphCollection({
          token,
          path: 'me/accounts',
          fields: 'id,name,category',
        }),
      };
    } catch (error) {
      pagesResult = {
        status: 'rejected',
        reason: error,
      };
    }

    const adAccounts =
      adAccountsResult.status === 'fulfilled'
        ? adAccountsResult.value.map(normalizeAdAccount).sort((a, b) => a.name.localeCompare(b.name))
        : [];

    const pages =
      pagesResult.status === 'fulfilled'
        ? pagesResult.value.map(normalizePage).sort((a, b) => a.name.localeCompare(b.name))
        : [];

    if (adAccountsResult.status === 'rejected') {
      warnings.push({
        scope: 'adAccounts',
        message: adAccountsResult.reason.message,
      });
    }

    if (pagesResult.status === 'rejected') {
      warnings.push({
        scope: 'pages',
        message: pagesResult.reason.message,
      });
    }

    return {
      adAccounts,
      pages,
      warnings,
    };
  });
}

async function getPixelsForAdAccount({ tokenId, token, adAccountId }) {
  const normalizedAccountNodeId = String(adAccountId).startsWith('act_') ? String(adAccountId) : `act_${adAccountId}`;

  return getOrSetCacheEntry(getPixelsCacheKey(tokenId, normalizedAccountNodeId), async () => {
    const pixels = await fetchGraphCollection({
      token,
      path: `${normalizedAccountNodeId}/adspixels`,
      fields: 'id,name',
    });

    return pixels.map(normalizePixel).sort((a, b) => a.name.localeCompare(b.name));
  });
}

async function getSharedPixels({ tokenId, token, adAccountIds }) {
  if (!adAccountIds.length) {
    return {
      pixels: [],
      warnings: [],
    };
  }

  const results = [];

  for (const adAccountId of adAccountIds) {
    try {
      const pixels = await getPixelsForAdAccount({
        tokenId,
        token,
        adAccountId,
      });

      results.push({
        status: 'fulfilled',
        value: pixels,
      });
    } catch (error) {
      results.push({
        status: 'rejected',
        reason: error,
      });
    }
  }

  const fulfilled = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const rejected = results
    .map((result, index) =>
      result.status === 'rejected'
        ? {
            adAccountId: adAccountIds[index],
            message: result.reason.message,
          }
        : null
    )
    .filter(Boolean);

  return {
    pixels: rejected.length ? [] : intersectPixels(fulfilled),
    warnings: rejected.map((item) => ({
      scope: `pixels:${item.adAccountId}`,
      message: item.message,
    })),
  };
}

async function getMetaAssets({ tokenId, adAccountIds = [] }) {
  if (!tokenId) {
    throw new HttpError(400, 'Token id is required');
  }

  const token = await tokenService.getActiveTokenWithSecret(tokenId);
  const baseAssets = await getBaseAssets({
    tokenId,
    token,
  });

  if (!adAccountIds.length) {
    return {
      adAccounts: baseAssets.adAccounts,
      pages: baseAssets.pages,
      pixels: [],
      warnings: baseAssets.warnings,
    };
  }

  const sharedPixels = await getSharedPixels({
    tokenId,
    token,
    adAccountIds,
  });

  return {
    adAccounts: baseAssets.adAccounts,
    pages: baseAssets.pages,
    pixels: sharedPixels.pixels,
    warnings: [...baseAssets.warnings, ...sharedPixels.warnings],
  };
}

async function getMetaPixels({ tokenId, adAccountId }) {
  if (!tokenId) {
    throw new HttpError(400, 'Token id is required');
  }

  if (!adAccountId) {
    throw new HttpError(400, 'Ad account id is required');
  }

  const token = await tokenService.getActiveTokenWithSecret(tokenId);

  return getPixelsForAdAccount({
    tokenId,
    token,
    adAccountId,
  });
}

module.exports = {
  getMetaAssets,
  getMetaPixels,
};
