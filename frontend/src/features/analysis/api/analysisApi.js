import { apiRequest } from '../../auth/api/authApi';

export const analysisApi = {
  createRule: (payload) =>
    apiRequest('/analysis/rules', {
      method: 'POST',
      body: payload,
    }),
  deleteRule: (id) =>
    apiRequest(`/analysis/rules/${id}`, {
      method: 'DELETE',
    }),
  getConfig: () => apiRequest('/analysis/config'),
  getRecommendations: () => apiRequest('/analysis/recommendations'),
  getRules: () => apiRequest('/analysis/rules'),
  updateRule: (id, payload) =>
    apiRequest(`/analysis/rules/${id}`, {
      method: 'PUT',
      body: payload,
    }),
};
