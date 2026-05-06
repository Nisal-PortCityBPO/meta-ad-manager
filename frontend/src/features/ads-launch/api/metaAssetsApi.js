import { apiRequest } from '../../auth/api/authApi';

export const metaAssetsApi = {
  getMetaAssets: (tokenId, adAccountIds = []) => {
    const query = new URLSearchParams({
      tokenId,
    });

    if (adAccountIds.length) {
      query.set('adAccountIds', adAccountIds.join(','));
    }

    return apiRequest(`/meta-assets?${query.toString()}`);
  },
  getMetaPixels: (tokenId, adAccountId) =>
    apiRequest(`/meta-assets/pixels?tokenId=${encodeURIComponent(tokenId)}&adAccountId=${encodeURIComponent(adAccountId)}`),
};
