const HttpError = require('../../app/utils/httpError');
const tokenService = require('../token-management/token.service');

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';

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

async function fetchGraphCollection({ token, path, fields, limit = 100 }) {
  const items = [];
  let nextUrl = buildGraphUrl(path, {
    access_token: token.accessToken,
    fields,
    limit,
  }).toString();

  while (nextUrl) {
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

async function getMetaAssets({ tokenId }) {
  if (!tokenId) {
    throw new HttpError(400, 'Token id is required');
  }

  const token = await tokenService.getActiveTokenWithSecret(tokenId);
  const warnings = [];

  const [adAccountsResult, pagesResult] = await Promise.allSettled([
    fetchGraphCollection({
      token,
      path: 'me/adaccounts',
      fields: 'id,account_id,name,account_status,currency',
    }),
    fetchGraphCollection({
      token,
      path: 'me/accounts',
      fields: 'id,name,category',
    }),
  ]);

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
}

async function getMetaPixels({ tokenId, adAccountId }) {
  if (!tokenId) {
    throw new HttpError(400, 'Token id is required');
  }

  if (!adAccountId) {
    throw new HttpError(400, 'Ad account id is required');
  }

  const token = await tokenService.getActiveTokenWithSecret(tokenId);
  const normalizedAccountNodeId = String(adAccountId).startsWith('act_') ? String(adAccountId) : `act_${adAccountId}`;

  const pixels = await fetchGraphCollection({
    token,
    path: `${normalizedAccountNodeId}/adspixels`,
    fields: 'id,name',
  });

  return pixels.map(normalizePixel).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  getMetaAssets,
  getMetaPixels,
};
