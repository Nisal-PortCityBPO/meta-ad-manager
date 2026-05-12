import { apiRequest } from '../../auth/api/authApi';

export const usersApi = {
  getUsers: () => apiRequest('/users'),
  createAdmin: (payload) =>
    apiRequest('/users', {
      method: 'POST',
      body: payload,
    }),
  updateStatus: (id, status) =>
    apiRequest(`/users/${id}/status`, {
      method: 'PATCH',
      body: { status },
    }),
  verifySuperAdminPassword: (password) =>
    apiRequest('/users/verify-super-admin-password', {
      method: 'POST',
      body: { password },
    }),
  resetAdminPassword: (id, payload) =>
    apiRequest(`/users/${id}/password`, {
      method: 'PATCH',
      body: payload,
    }),
};
