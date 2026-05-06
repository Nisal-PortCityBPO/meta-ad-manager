const API_BASE = '/api';

export async function apiRequest(path, options = {}) {
  const { body, headers, ...rest } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    ...rest,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : {};

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

export const authApi = {
  login: (payload) =>
    apiRequest('/auth/login', {
      method: 'POST',
      body: payload,
    }),
  logout: () =>
    apiRequest('/auth/logout', {
      method: 'POST',
    }),
  me: () => apiRequest('/auth/me'),
  forgotPassword: (payload) =>
    apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: payload,
    }),
  verifyOtp: (payload) =>
    apiRequest('/auth/verify-otp', {
      method: 'POST',
      body: payload,
    }),
  resetPassword: (payload) =>
    apiRequest('/auth/reset-password', {
      method: 'POST',
      body: payload,
    }),
};
