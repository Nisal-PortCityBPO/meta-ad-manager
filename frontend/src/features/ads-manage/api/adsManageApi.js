import { apiRequest } from '../../auth/api/authApi';

const toQueryString = (params = {}) => {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
};

export const adsManageApi = {
  getDynamicHistory: (params = {}) => apiRequest(`/ads-manage/dynamic-history${toQueryString(params)}`),
  getCampaigns: (payload) =>
    apiRequest('/ads-manage/campaigns/search', {
      method: 'POST',
      body: payload,
    }),
  updateCampaignStatus: (campaignId, payload) =>
    apiRequest(`/ads-manage/campaigns/${campaignId}/status`, {
      method: 'POST',
      body: payload,
    }),
  syncCampaignDetails: (campaignId, payload) =>
    apiRequest(`/ads-manage/campaigns/${campaignId}/sync`, {
      method: 'POST',
      body: payload,
    }),
  retryFailedLaunch: (campaignId, payload) =>
    apiRequest(`/ads-manage/campaigns/${campaignId}/retry`, {
      method: 'POST',
      body: payload,
    }),
  duplicateCampaign: (campaignId, payload) =>
    apiRequest(`/ads-manage/campaigns/${campaignId}/duplicate`, {
      method: 'POST',
      body: payload,
    }),
  deleteCampaign: (campaignId, payload) =>
    apiRequest(`/ads-manage/campaigns/${campaignId}`, {
      method: 'DELETE',
      body: payload,
    }),
};
