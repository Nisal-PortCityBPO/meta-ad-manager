import { apiRequest } from '../../auth/api/authApi';

const parseErrorResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await response.json();
    return data.message || 'Request failed';
  }

  return 'Request failed';
};

const readPublishStream = async (response, onProgress) => {
  if (!response.body) {
    throw new Error('Live publish progress is not supported by this browser');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult = null;

  const handleLine = (line) => {
    if (!line.trim()) {
      return;
    }

    const event = JSON.parse(line);

    if (event.type === 'complete') {
      finalResult = event.result;
      return;
    }

    if (event.type === 'error') {
      throw new Error(event.message || 'Publish failed');
    }

    onProgress?.(event);
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(handleLine);
  }

  buffer += decoder.decode();
  handleLine(buffer);

  if (!finalResult) {
    throw new Error('Publish stream ended before Meta returned a result');
  }

  return finalResult;
};

export const adsLaunchApi = {
  getTemplates: (params = {}) => {
    const query = new URLSearchParams();

    if (params.templateType) {
      query.set('templateType', params.templateType);
    }

    const queryString = query.toString();
    return apiRequest(`/ads-launch/templates${queryString ? `?${queryString}` : ''}`);
  },
  createTemplate: (payload) =>
    apiRequest('/ads-launch/templates', {
      method: 'POST',
      body: payload,
    }),
  updateTemplate: (id, payload) =>
    apiRequest(`/ads-launch/templates/${id}`, {
      method: 'PUT',
      body: payload,
    }),
  deleteTemplate: (id) =>
    apiRequest(`/ads-launch/templates/${id}`, {
      method: 'DELETE',
    }),
  publishLaunch: (payload) =>
    apiRequest('/ads-launch/publish', {
      method: 'POST',
      body: payload,
    }),
  publishLaunchStream: async (payload, { onProgress } = {}) => {
    const response = await fetch('/api/ads-launch/publish-stream', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }

    return readPublishStream(response, onProgress);
  },
};
