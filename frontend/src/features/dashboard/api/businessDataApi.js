import { apiRequest } from '../../auth/api/authApi';

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
  getBusinessProfiles: () => apiRequest('/business-profiles'),
  syncBusinessProfiles: () =>
    apiRequest('/business-profiles/sync', {
      method: 'POST',
    }),
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
