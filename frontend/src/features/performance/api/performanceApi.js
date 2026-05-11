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

export const performanceApi = {
  getOptions: (params) => apiRequest(`/performance/options${toQueryString(params)}`),
  getReport: (params) => apiRequest(`/performance/report${toQueryString(params)}`),
};
