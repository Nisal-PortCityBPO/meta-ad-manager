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

export const activityLogsApi = {
  deleteOldestLogs: () =>
    apiRequest('/activity-logs/oldest', {
      method: 'DELETE',
    }),
  getLogs: (params) => apiRequest(`/activity-logs${toQueryString(params)}`),
};
