import { apiRequest } from '../../auth/api/authApi';

export const adsLaunchApi = {
  getMetaAssets: (tokenId) => apiRequest(`/meta-assets?tokenId=${encodeURIComponent(tokenId)}`),
  getMetaPixels: (tokenId, adAccountId) =>
    apiRequest(`/meta-assets/pixels?tokenId=${encodeURIComponent(tokenId)}&adAccountId=${encodeURIComponent(adAccountId)}`),
};
