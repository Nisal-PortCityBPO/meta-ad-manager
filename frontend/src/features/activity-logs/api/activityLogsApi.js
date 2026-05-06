import { apiRequest } from '../../auth/api/authApi';

export const activityLogsApi = {
  getLogs: () => apiRequest('/activity-logs'),
};
