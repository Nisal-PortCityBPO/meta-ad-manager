import { apiRequest } from '../../auth/api/authApi';

export const dashboardApi = {
  getDashboard: () => apiRequest('/dashboard'),
};
