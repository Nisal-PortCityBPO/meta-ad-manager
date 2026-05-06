import { apiRequest } from '../../auth/api/authApi';

export const tokensApi = {
  getTokens: () => apiRequest('/tokens'),
  createToken: (payload) =>
    apiRequest('/tokens', {
      method: 'POST',
      body: payload,
    }),
  updateToken: (id, payload) =>
    apiRequest(`/tokens/${id}`, {
      method: 'PUT',
      body: payload,
    }),
  deleteToken: (id) =>
    apiRequest(`/tokens/${id}`, {
      method: 'DELETE',
    }),
  recordApiCall: (id) =>
    apiRequest(`/tokens/${id}/api-calls`, {
      method: 'POST',
    }),
};
