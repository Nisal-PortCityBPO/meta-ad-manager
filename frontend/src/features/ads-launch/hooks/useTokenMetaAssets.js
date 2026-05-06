import { useCallback, useState } from 'react';
import { metaAssetsApi } from '../api/metaAssetsApi';

function intersectPixels(pixelCollections) {
  if (!pixelCollections.length) {
    return [];
  }

  const frequency = new Map();

  pixelCollections.forEach((pixels, collectionIndex) => {
    const seen = new Set();

    pixels.forEach((pixel) => {
      if (!pixel?.id || seen.has(pixel.id)) {
        return;
      }

      seen.add(pixel.id);

      if (!frequency.has(pixel.id)) {
        frequency.set(pixel.id, {
          pixel,
          count: 0,
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

function normalizePixelCollection(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.pixels)) {
    return payload.pixels;
  }

  return [];
}

export const useTokenMetaAssets = () => {
  const [adAccounts, setAdAccounts] = useState([]);
  const [pages, setPages] = useState([]);
  const [pixels, setPixels] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [error, setError] = useState('');
  const [pixelError, setPixelError] = useState('');

  const resetAssets = useCallback(() => {
    setAdAccounts([]);
    setPages([]);
    setPixels([]);
    setWarnings([]);
    setError('');
    setPixelError('');
    setLoadingAssets(false);
    setLoadingPixels(false);
  }, []);

  const loadAssets = useCallback(async (tokenId) => {
    if (!tokenId) {
      resetAssets();
      return;
    }

    setLoadingAssets(true);
    setPixelError('');

    try {
      const data = await metaAssetsApi.getMetaAssets(tokenId);
      setAdAccounts(data.adAccounts || []);
      setPages(data.pages || []);
      setPixels([]);
      setWarnings(data.warnings || []);
      setError('');
    } catch (requestError) {
      setAdAccounts([]);
      setPages([]);
      setPixels([]);
      setWarnings([]);
      setError(requestError.message);
    } finally {
      setLoadingAssets(false);
    }
  }, [resetAssets]);

  const loadPixels = useCallback(async (tokenId, adAccountIds) => {
    if (!tokenId || !adAccountIds.length) {
      setPixels([]);
      setPixelError('');
      setLoadingPixels(false);
      return;
    }

    setLoadingPixels(true);

    try {
      const results = await Promise.allSettled(
        adAccountIds.map((adAccountId) => metaAssetsApi.getMetaPixels(tokenId, adAccountId))
      );

      const fulfilled = results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => normalizePixelCollection(result.value));

      const rejected = results.filter((result) => result.status === 'rejected');

      setPixels(rejected.length ? [] : intersectPixels(fulfilled));
      setPixelError(rejected.length ? rejected[0].reason.message : '');
    } catch (requestError) {
      setPixels([]);
      setPixelError(requestError.message);
    } finally {
      setLoadingPixels(false);
    }
  }, []);

  return {
    adAccounts,
    error,
    loadAssets,
    loadPixels,
    loadingAssets,
    loadingPixels,
    pages,
    pixelError,
    pixels,
    resetAssets,
    warnings,
  };
};
