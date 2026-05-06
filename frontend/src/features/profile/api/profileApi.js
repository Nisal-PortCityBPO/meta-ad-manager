import { apiRequest } from '../../auth/api/authApi';

export const profileApi = {
  getProfile: () => apiRequest('/profile'),
  updateProfile: (payload) =>
    apiRequest('/profile', {
      method: 'PUT',
      body: payload,
    }),
  changePassword: (payload) =>
    apiRequest('/profile/password', {
      method: 'PUT',
      body: payload,
    }),
};
