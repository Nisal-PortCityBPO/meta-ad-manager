import { apiRequest } from '../../auth/api/authApi';

export const settingsApi = {
  getPublishIntervalSettings: () => apiRequest('/settings/publish-interval'),
  updatePublishIntervalSettings: (payload) =>
    apiRequest('/settings/publish-interval', {
      method: 'PUT',
      body: payload,
    }),
  getTelegramSettings: () => apiRequest('/settings/telegram'),
  updateTelegramSettings: (payload) =>
    apiRequest('/settings/telegram', {
      method: 'PUT',
      body: payload,
    }),
  testTelegramSettings: () =>
    apiRequest('/settings/telegram/test', {
      method: 'POST',
    }),
};
