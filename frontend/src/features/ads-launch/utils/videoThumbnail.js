const getBaseFileName = (name = '') => String(name || '').replace(/\.[^.]+$/, '') || 'video';

export const createVideoThumbnailFile = (file, options = {}) =>
  new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('Select a video before generating a thumbnail'));
      return;
    }

    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    const fail = (message) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const finish = () => {
      if (settled) {
        return;
      }

      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;

      if (!width || !height) {
        fail(`Could not capture a thumbnail for ${file.name}`);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');

      if (!context) {
        fail('This browser could not prepare the thumbnail canvas');
        return;
      }

      context.drawImage(video, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            fail(`Could not create a JPG thumbnail for ${file.name}`);
            return;
          }

          settled = true;
          cleanup();
          const thumbnailName = `${getBaseFileName(file.name)}-thumbnail.jpg`;
          const thumbnailFile = new File([blob], thumbnailName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });

          resolve({
            file: thumbnailFile,
            metadata: {
              width,
              height,
              duration: 0,
            },
          });
        },
        'image/jpeg',
        options.quality || 0.9
      );
    };

    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.onerror = () => fail(`Could not load ${file.name} to generate a thumbnail`);
    video.onseeked = finish;
    video.onloadeddata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0 || video.currentTime > 0) {
        finish();
      }
    };
    video.onloadedmetadata = () => {
      const requestedTime = Number(options.seekTime);
      const fallbackTime = Math.min(Math.max((video.duration || 1) * 0.1, 0.1), 1);
      const seekTime = Number.isFinite(requestedTime) ? requestedTime : fallbackTime;
      const maxSeekTime = Math.max((video.duration || seekTime) - 0.05, 0);
      const safeSeekTime = Math.min(Math.max(seekTime, 0), maxSeekTime);

      if (safeSeekTime > 0) {
        video.currentTime = safeSeekTime;
      } else {
        finish();
      }
    };
    video.src = url;
  });
