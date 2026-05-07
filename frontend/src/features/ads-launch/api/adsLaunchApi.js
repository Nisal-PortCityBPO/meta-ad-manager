import { apiRequest } from '../../auth/api/authApi';

export const adsLaunchApi = {
  getTemplates: () => apiRequest('/ads-launch/templates'),
  createTemplate: (payload) =>
    apiRequest('/ads-launch/templates', {
      method: 'POST',
      body: payload,
    }),
  updateTemplate: (id, payload) =>
    apiRequest(`/ads-launch/templates/${id}`, {
      method: 'PUT',
      body: payload,
    }),
  deleteTemplate: (id) =>
    apiRequest(`/ads-launch/templates/${id}`, {
      method: 'DELETE',
    }),
  publishLaunch: (payload) =>
    apiRequest('/ads-launch/publish', {
      method: 'POST',
      body: payload,
    }),
};
