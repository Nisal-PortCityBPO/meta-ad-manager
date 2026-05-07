import { useCallback, useState } from 'react';
import { metaAssetsApi } from '../api/metaAssetsApi';

export const useTokenMetaAssets = () => {
  const [adAccounts, setAdAccounts] = useState([]);
  const [accountPixels, setAccountPixels] = useState({});
  const [pages, setPages] = useState([]);
  const [pixels, setPixels] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [error, setError] = useState('');
  const [pixelError, setPixelError] = useState('');

  const resetAssets = useCallback(() => {
    setAdAccounts([]);
    setAccountPixels({});
    setPages([]);
    setPixels([]);
    setWarnings([]);
    setError('');
    setPixelError('');
    setLoadingAssets(false);
    setLoadingPixels(false);
  }, []);

  const loadAssets = useCallback(
    async (tokenId, adAccountIds = []) => {
      if (!tokenId) {
        resetAssets();
        return;
      }

      const loadingSetter = adAccountIds.length ? setLoadingPixels : setLoadingAssets;
      loadingSetter(true);

      if (!adAccountIds.length) {
        setPixelError('');
        setAccountPixels({});
      }

      try {
        const data = await metaAssetsApi.getMetaAssets(tokenId, adAccountIds);
        setAdAccounts(data.adAccounts || []);
        setPages(data.pages || []);
        setPixels(data.pixels || []);
        setWarnings(data.warnings || []);
        setError('');
        setPixelError('');
      } catch (requestError) {
        if (!adAccountIds.length) {
          setAdAccounts([]);
          setPages([]);
          setWarnings([]);
          setError(requestError.message);
        } else {
          setPixelError(requestError.message);
        }

        setPixels([]);
      } finally {
        loadingSetter(false);
      }
    },
    [resetAssets]
  );

  const loadPixels = useCallback(
    async (tokenId, adAccountIds) => {
      if (!tokenId || !adAccountIds.length) {
        setPixels([]);
        setPixelError('');
        setLoadingPixels(false);
        return;
      }

      await loadAssets(tokenId, adAccountIds);
    },
    [loadAssets]
  );

  const loadAccountPixels = useCallback(async (tokenId, adAccountIds = []) => {
    if (!tokenId || !adAccountIds.length) {
      setAccountPixels({});
      setPixelError('');
      setLoadingPixels(false);
      return;
    }

    setLoadingPixels(true);
    setPixelError('');

    const nextAccountPixels = {};
    const failed = [];

    for (const adAccountId of adAccountIds) {
      try {
        const data = await metaAssetsApi.getMetaPixels(tokenId, adAccountId);
        nextAccountPixels[adAccountId] = data.pixels || [];
      } catch (requestError) {
        nextAccountPixels[adAccountId] = [];
        failed.push(`${adAccountId}: ${requestError.message}`);
      }
    }

    setAccountPixels(nextAccountPixels);
    setPixels(
      Array.from(
        new Map(
          Object.values(nextAccountPixels)
            .flat()
            .map((pixel) => [pixel.id, pixel])
        ).values()
      ).sort((first, second) => first.name.localeCompare(second.name))
    );
    setPixelError(failed.join(' | '));
    setLoadingPixels(false);
  }, []);

  return {
    accountPixels,
    adAccounts,
    error,
    loadAccountPixels,
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
