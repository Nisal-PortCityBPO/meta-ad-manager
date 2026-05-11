import { apiRequest } from '../../auth/api/authApi';

export const errorsApi = {
  getErrors: (params = {}) => {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, value);
      }
    });

    const queryString = query.toString();
    return apiRequest(`/ads-manage/errors${queryString ? `?${queryString}` : ''}`);
  },
  checkAccess: (campaignId, payload) =>
    apiRequest(`/ads-manage/errors/${campaignId}/check`, {
      method: 'POST',
      body: payload,
    }),
  retryError: (campaignId, payload) =>
    apiRequest(`/ads-manage/errors/${campaignId}/retry`, {
      method: 'POST',
      body: payload,
    }),
  clearSuccess: () =>
    apiRequest('/ads-manage/errors/success', {
      method: 'DELETE',
    }),
};
