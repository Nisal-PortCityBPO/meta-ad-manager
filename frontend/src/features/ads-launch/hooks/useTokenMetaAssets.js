import { useCallback, useState } from 'react';
import { metaAssetsApi } from '../api/metaAssetsApi';

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
