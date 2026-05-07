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

const requestWithUploadProgress = (path, payload, { onUploadProgress } = {}) =>
  new Promise((resolve, reject) => {
    const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    xhr.withCredentials = true;

    if (!isFormData) {
      xhr.setRequestHeader('Content-Type', 'application/json');
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onUploadProgress?.(Math.min(Math.round((event.loaded / event.total) * 100), 99));
      }
    };

    xhr.onload = () => {
      const contentType = xhr.getResponseHeader('content-type') || '';
      let data = {};

      if (contentType.includes('application/json') && xhr.responseText) {
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = {};
        }
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onUploadProgress?.(100);
        resolve(data);
        return;
      }

      reject(new Error(data.message || 'Request failed'));
    };

    xhr.onerror = () => reject(new Error('Upload failed. Please check your connection and try again.'));
    xhr.send(isFormData ? payload : JSON.stringify(payload));
  });

const buildMediaUploadFormData = ({ name, mediaFile, mediaMetadata, thumbnailFile, thumbnailMetadata }) => {
  const formData = new FormData();
  formData.append('name', name);
  formData.append('media', mediaFile, mediaFile.name);
  formData.append('mediaMetadata', JSON.stringify(mediaMetadata || {}));

  if (thumbnailFile) {
    formData.append('thumbnail', thumbnailFile, thumbnailFile.name);
    formData.append('thumbnailMetadata', JSON.stringify(thumbnailMetadata || {}));
  }

  return formData;
};

const buildMediaChunkFormData = ({ uploadId, chunk, chunkIndex, totalChunks }) => {
  const formData = new FormData();
  formData.append('uploadId', uploadId);
  formData.append('chunkIndex', String(chunkIndex));
  formData.append('totalChunks', String(totalChunks));
  formData.append('chunk', chunk, `chunk-${chunkIndex}`);
  return formData;
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
  getMediaAssets: () => apiRequest('/ads-launch/media'),
  createMediaAsset: (payload) =>
    apiRequest('/ads-launch/media', {
      method: 'POST',
      body: payload,
    }),
  createMediaAssetWithProgress: (payload, options = {}) =>
    requestWithUploadProgress('/ads-launch/media', payload, options),
  uploadMediaAssetWithProgress: (payload, options = {}) =>
    requestWithUploadProgress('/ads-launch/media', buildMediaUploadFormData(payload), options),
  uploadMediaChunkWithProgress: (payload, options = {}) =>
    requestWithUploadProgress('/ads-launch/media/chunk', buildMediaChunkFormData(payload), options),
  completeChunkedMediaUpload: (payload) =>
    apiRequest('/ads-launch/media/complete', {
      method: 'POST',
      body: payload,
    }),
  deleteMediaAsset: (id) =>
    apiRequest(`/ads-launch/media/${id}`, {
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
