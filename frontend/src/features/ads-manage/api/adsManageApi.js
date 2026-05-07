import { apiRequest } from '../../auth/api/authApi';

export const adsManageApi = {
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
  duplicateCampaign: (campaignId, payload) =>
    apiRequest(`/ads-manage/campaigns/${campaignId}/duplicate`, {
      method: 'POST',
      body: payload,
    }),
};
