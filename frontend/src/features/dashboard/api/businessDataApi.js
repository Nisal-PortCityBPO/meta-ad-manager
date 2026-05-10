import { apiRequest } from '../../auth/api/authApi';

const toQueryString = (params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
};

export const businessDataApi = {
  getBrands: () => apiRequest('/brands'),
  createBrand: (payload) =>
    apiRequest('/brands', {
      method: 'POST',
      body: payload,
    }),
  updateBrand: (id, payload) =>
    apiRequest(`/brands/${id}`, {
      method: 'PUT',
      body: payload,
    }),
  deleteBrand: (id) =>
    apiRequest(`/brands/${id}`, {
      method: 'DELETE',
    }),
  getAgencies: () => apiRequest('/agencies'),
  createAgency: (payload) =>
    apiRequest('/agencies', {
      method: 'POST',
      body: payload,
    }),
  updateAgency: (id, payload) =>
    apiRequest(`/agencies/${id}`, {
      method: 'PUT',
      body: payload,
    }),
  deleteAgency: (id) =>
    apiRequest(`/agencies/${id}`, {
      method: 'DELETE',
    }),
  getBusinessProfiles: (params) => apiRequest(`/business-profiles${toQueryString(params)}`),
  getSocialAccounts: (params) => apiRequest(`/social-accounts${toQueryString(params)}`),
  updateSocialAccount: (id, payload) =>
    apiRequest(`/social-accounts/${id}`, {
      method: 'PUT',
      body: payload,
    }),
  syncSocialAccount: (id, tokenType) =>
    apiRequest(`/social-accounts/${id}/sync`, {
      method: 'POST',
      body: tokenType ? { tokenType } : {},
    }),
  syncBusinessProfiles: (tokenType) =>
    apiRequest('/business-profiles/sync', {
      method: 'POST',
      body: tokenType ? { tokenType } : {},
    }),
  syncAdAccount: (profileId, adAccountId, tokenType, tokenId) =>
    apiRequest(`/business-profiles/${profileId}/ad-accounts/${encodeURIComponent(adAccountId)}/sync`, {
      method: 'POST',
      body: {
        ...(tokenType ? { tokenType } : {}),
        ...(tokenId ? { tokenId } : {}),
      },
    }),
  duplicateCampaign: (profileId, adAccountId, campaignId, payload) =>
    apiRequest(
      `/business-profiles/${profileId}/ad-accounts/${encodeURIComponent(adAccountId)}/campaigns/${encodeURIComponent(campaignId)}/duplicate`,
      {
        method: 'POST',
        body: payload,
      }
    ),
  updateBusinessProfile: (id, payload) =>
    apiRequest(`/business-profiles/${id}`, {
      method: 'PUT',
      body: payload,
    }),
  deleteBusinessProfile: (id) =>
    apiRequest(`/business-profiles/${id}`, {
      method: 'DELETE',
    }),
};
