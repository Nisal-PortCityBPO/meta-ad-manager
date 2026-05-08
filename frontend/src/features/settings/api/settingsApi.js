import { apiRequest } from '../../auth/api/authApi';

export const settingsApi = {
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
