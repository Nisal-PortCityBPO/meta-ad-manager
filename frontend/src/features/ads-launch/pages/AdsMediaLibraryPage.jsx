import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ImageIcon, LoaderCircle, Plus, RefreshCw, Trash2, Upload, Video, X } from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { adsLaunchApi } from '../api/adsLaunchApi';

const MIN_DIMENSION = 600;
const MIN_ASPECT_RATIO = 0.56;
const MAX_ASPECT_RATIO = 1.92;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const VIDEO_CHUNK_BYTES = 5 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(['image/jpeg']);
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime']);
const MIME_TYPE_BY_EXTENSION = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
};

const getFileExtension = (name = '') => {
  const extensionMatch = String(name).toLowerCase().match(/\.[^.]+$/);
  return extensionMatch ? extensionMatch[0] : '';
};

const getSupportedMimeType = (file) => {
  const reportedType = String(file?.type || '').toLowerCase();

  if (IMAGE_MIME_TYPES.has(reportedType) || VIDEO_MIME_TYPES.has(reportedType)) {
    return reportedType;
  }

  return MIME_TYPE_BY_EXTENSION[getFileExtension(file?.name)] || reportedType;
};

const formatFileSize = (bytes = 0) => {
  if (!bytes) {
    return '0 KB';
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${Math.max(Math.round(bytes / 1024), 1)} KB`;
};

const formatDuration = (duration = 0) => {
  if (!duration) {
    return '';
  }

  const minutes = Math.floor(duration / 60);
  const seconds = Math.round(duration % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const getAspectRatio = ({ width, height }) => (height ? width / height : 0);

const getValidationError = ({ file, width, height, duration }) => {
  const mimeType = getSupportedMimeType(file);
  const isVideo = mimeType.startsWith('video/');
  const allowedTypes = isVideo ? VIDEO_MIME_TYPES : IMAGE_MIME_TYPES;
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

  if (!allowedTypes.has(mimeType)) {
    return isVideo
      ? 'Use MP4 or MOV video files for Meta publishing.'
      : 'Use JPG/JPEG image files only.';
  }

  if (file.size > maxBytes) {
    return `${isVideo ? 'Video' : 'Image'} is too large. Maximum is ${Math.round(maxBytes / 1024 / 1024)}MB.`;
  }

  if (!width || !height) {
    return 'Could not read media dimensions. Please choose another file.';
  }

  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    return `Media must be at least ${MIN_DIMENSION}x${MIN_DIMENSION}px.`;
  }

  const aspectRatio = getAspectRatio({ width, height });
  if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) {
    return 'Use an aspect ratio between 9:16 and 1.91:1 for Meta placements.';
  }

  if (isVideo && !duration) {
    return 'Could not read video duration. Please choose another video file.';
  }

  return '';
};

const readImageMetadata = (file) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image dimensions'));
    };
    image.src = url;
  });

const readVideoMetadata = (file) =>
  new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration || 0,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read video metadata'));
    };
    video.src = url;
  });

const getDataUrlSize = (dataUrl) => {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  return Math.round((base64.length * 3) / 4);
};

const dataUrlToFile = (dataUrl, name, type) => {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], name, { type });
};

const createUploadId = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replace(/-/g, '');
  }

  return `${Date.now()}${Math.random().toString(36).slice(2, 14)}`;
};

const createVideoThumbnail = (file) =>
  new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    const fail = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error('Could not generate a thumbnail from this video'));
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const seekTo = Number.isFinite(video.duration) ? Math.min(Math.max(video.duration * 0.05, 0.2), 1.5) : 0.2;
      video.currentTime = seekTo;
    };
    video.onseeked = () => {
      if (settled) {
        return;
      }

      const sourceWidth = video.videoWidth || MIN_DIMENSION;
      const sourceHeight = video.videoHeight || MIN_DIMENSION;
      const scale = Math.min(1920 / sourceWidth, 1920 / sourceHeight, 1);
      const width = Math.max(Math.round(sourceWidth * scale), MIN_DIMENSION);
      const height = Math.max(Math.round(sourceHeight * scale), MIN_DIMENSION);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');

      if (!context) {
        fail();
        return;
      }

      context.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
      settled = true;
      cleanup();
      resolve({
        name: `${file.name.replace(/\.[^.]+$/, '')}-thumbnail.jpg`,
        type: 'image/jpeg',
        size: getDataUrlSize(dataUrl),
        dataUrl,
        width,
        height,
        duration: 0,
      });
    };
    video.onerror = fail;
    video.src = url;
    video.load();
  });

const MediaCard = ({ mediaAsset, onDelete }) => {
  const isVideo = mediaAsset.mediaType === 'VIDEO';
  const media = mediaAsset.media || {};

  return (
    <div className="overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-sm shadow-sky-100/70">
      <div className="relative bg-slate-950">
        {isVideo ? (
          <video src={media.url} poster={mediaAsset.thumbnail?.url} controls className="h-56 w-full object-contain" />
        ) : (
          <img src={media.url} alt={mediaAsset.name} className="h-56 w-full object-cover" />
        )}
        <span className={`absolute left-3 top-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${isVideo ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>
          {isVideo ? <Video size={14} strokeWidth={2.4} /> : <ImageIcon size={14} strokeWidth={2.4} />}
          {isVideo ? 'Video' : 'Image'}
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{mediaAsset.name}</p>
            <p className="mt-1 truncate text-xs font-semibold text-slate-400">{media.name}</p>
          </div>
          <button
            type="button"
            onClick={() => onDelete(mediaAsset)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-100 text-red-600 transition hover:bg-red-50"
            title="Delete media"
          >
            <Trash2 size={16} strokeWidth={2.3} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-sky-50 px-2 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-600">Size</p>
            <p className="mt-1 text-xs font-bold text-slate-700">{formatFileSize(media.size)}</p>
          </div>
          <div className="rounded-xl bg-sky-50 px-2 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-600">Pixels</p>
            <p className="mt-1 text-xs font-bold text-slate-700">{media.width}x{media.height}</p>
          </div>
          <div className="rounded-xl bg-sky-50 px-2 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-600">Ratio</p>
            <p className="mt-1 text-xs font-bold text-slate-700">{getAspectRatio(media).toFixed(2)}:1</p>
          </div>
        </div>
        {isVideo ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
            Thumbnail saved automatically. Duration {formatDuration(media.duration) || 'ready'}.
          </p>
        ) : null}
      </div>
    </div>
  );
};

const AdsMediaLibraryPage = () => {
  const [mediaAssets, setMediaAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingFile, setProcessingFile] = useState(false);
  const [name, setName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState('');
  const [fileDetails, setFileDetails] = useState(null);
  const [generatedThumbnail, setGeneratedThumbnail] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);

  const selectedIsVideo = selectedFile ? getSupportedMimeType(selectedFile).startsWith('video/') : false;
  const validationError = useMemo(
    () => (selectedFile && fileDetails ? getValidationError({ file: selectedFile, ...fileDetails }) : ''),
    [fileDetails, selectedFile]
  );

  const loadMediaAssets = async () => {
    setLoading(true);
    try {
      const data = await adsLaunchApi.getMediaAssets();
      setMediaAssets(data.mediaAssets || []);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMediaAssets();
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      setSelectedPreviewUrl('');
      return undefined;
    }

    const previewUrl = URL.createObjectURL(selectedFile);
    setSelectedPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedFile]);

  const resetForm = () => {
    setName('');
    setSelectedFile(null);
    setFileDetails(null);
    setGeneratedThumbnail(null);
    setUploadProgress(null);
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    setSelectedFile(null);
    setFileDetails(null);
    setGeneratedThumbnail(null);
    setUploadProgress(null);

    if (!file) {
      return;
    }

    setProcessingFile(true);
    try {
      const supportedMimeType = getSupportedMimeType(file);
      const normalizedFile =
        supportedMimeType && file.type !== supportedMimeType
          ? new File([file], file.name, { type: supportedMimeType, lastModified: file.lastModified })
          : file;
      const isVideo = supportedMimeType.startsWith('video/');
      const details = isVideo ? await readVideoMetadata(normalizedFile) : await readImageMetadata(normalizedFile);
      const nextValidationError = getValidationError({ file: normalizedFile, ...details });

      if (nextValidationError) {
        toast.error(nextValidationError);
        return;
      }

      const thumbnail = isVideo ? await createVideoThumbnail(normalizedFile) : null;
      setSelectedFile(normalizedFile);
      setFileDetails(details);
      setGeneratedThumbnail(thumbnail);
      setName((current) => current || normalizedFile.name.replace(/\.[^.]+$/, ''));
      toast.success(isVideo ? 'Video ready with auto thumbnail' : 'Image ready');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setProcessingFile(false);
    }
  };

  const uploadVideoInChunks = async ({ thumbnail }) => {
    const uploadId = createUploadId();
    const totalChunks = Math.ceil(selectedFile.size / VIDEO_CHUNK_BYTES);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const chunkStart = chunkIndex * VIDEO_CHUNK_BYTES;
      const chunkEnd = Math.min(chunkStart + VIDEO_CHUNK_BYTES, selectedFile.size);
      const chunk = selectedFile.slice(chunkStart, chunkEnd, selectedFile.type);

      await adsLaunchApi.uploadMediaChunkWithProgress({
        uploadId,
        chunk,
        chunkIndex,
        totalChunks,
      }, {
        onUploadProgress: (chunkPercent) => {
          const uploadedBytes = chunkStart + Math.round(chunk.size * (chunkPercent / 100));
          const percent = Math.min(Math.round((uploadedBytes / selectedFile.size) * 100), 99);
          setUploadProgress({
            label: `Uploading video ${chunkIndex + 1}/${totalChunks}`,
            percent,
          });
        },
      });
    }

    setUploadProgress({
      label: 'Saving video in media library',
      percent: 100,
    });

    return adsLaunchApi.completeChunkedMediaUpload({
      name: name.trim(),
      uploadId,
      mediaOriginalName: selectedFile.name,
      mediaMimeType: selectedFile.type,
      mediaSize: selectedFile.size,
      mediaMetadata: {
        width: fileDetails.width,
        height: fileDetails.height,
        duration: fileDetails.duration || 0,
      },
      thumbnail,
    });
  };

  const saveMediaAsset = async () => {
    if (!name.trim()) {
      toast.error('Give this media a library name');
      return;
    }

    if (!selectedFile || !fileDetails) {
      toast.error('Select an image or video first');
      return;
    }

    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (selectedIsVideo && !generatedThumbnail) {
      toast.error('Video thumbnail is still missing. Select the video again so I can generate it.');
      return;
    }

    setSaving(true);
    setUploadProgress({
      label: selectedIsVideo ? 'Starting video upload' : 'Starting image upload',
      percent: 0,
    });
    try {
      const thumbnailFile = generatedThumbnail
        ? dataUrlToFile(generatedThumbnail.dataUrl, generatedThumbnail.name, generatedThumbnail.type)
        : null;
      const thumbnailPayload = generatedThumbnail
        ? {
            name: generatedThumbnail.name,
            type: generatedThumbnail.type,
            size: generatedThumbnail.size,
            dataUrl: generatedThumbnail.dataUrl,
            width: generatedThumbnail.width,
            height: generatedThumbnail.height,
            duration: generatedThumbnail.duration || 0,
          }
        : null;

      if (selectedIsVideo) {
        const data = await uploadVideoInChunks({ thumbnail: thumbnailPayload });
        toast.success(data.message);
        resetForm();
        await loadMediaAssets();
        return;
      }

      setUploadProgress({
        label: 'Uploading image to media library',
        percent: 0,
      });
      const data = await adsLaunchApi.uploadMediaAssetWithProgress({
        name: name.trim(),
        mediaFile: selectedFile,
        mediaMetadata: {
          width: fileDetails.width,
          height: fileDetails.height,
          duration: fileDetails.duration || 0,
        },
        thumbnailFile,
        thumbnailMetadata: generatedThumbnail
          ? {
              width: generatedThumbnail.width,
              height: generatedThumbnail.height,
              duration: generatedThumbnail.duration || 0,
            }
          : null,
      }, {
        onUploadProgress: (percent) =>
          setUploadProgress({
            label: 'Uploading image to media library',
            percent,
          }),
      });
      toast.success(data.message);
      resetForm();
      await loadMediaAssets();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  const deleteMediaAsset = async (mediaAsset) => {
    if (!window.confirm(`Delete media "${mediaAsset.name}"?`)) {
      return;
    }

    try {
      const data = await adsLaunchApi.deleteMediaAsset(mediaAsset.id);
      toast.success(data.message);
      await loadMediaAssets();
    } catch (requestError) {
      toast.error(requestError.message);
    }
  };

  return (
    <div>
      <DashboardHeader
        title="Ads Media Library"
        description="Add Meta-ready images and videos once, then reuse them per ad account in Dynamic Ads Launch."
        action={
          <button type="button" onClick={loadMediaAssets} disabled={loading} className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-60">
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <DashboardPanel title="Add media">
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="media-library-name" className="text-sm font-semibold text-slate-700">Library name</label>
              <input
                id="media-library-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="CoreSelf square image 01"
              />
            </div>

            <label htmlFor="media-library-file" className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/70 px-5 py-6 text-center transition hover:border-sky-400 hover:bg-sky-50">
              {processingFile ? <LoaderCircle size={28} className="animate-spin text-sky-600" /> : <Upload size={28} strokeWidth={2.1} className="text-sky-600" />}
              <p className="mt-3 text-sm font-black text-slate-950">{selectedFile ? 'Replace media' : 'Select image or video'}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">JPG/JPEG images only, or MP4/MOV videos. Minimum 600x600, ratio 9:16 to 1.91:1.</p>
            </label>
            <input id="media-library-file" type="file" accept="image/jpeg,video/mp4,video/quicktime" onChange={handleFileChange} className="hidden" />

            {selectedFile && selectedPreviewUrl ? (
              <div className="overflow-hidden rounded-3xl border border-sky-100 bg-white">
                {selectedIsVideo ? (
                  <video src={selectedPreviewUrl} poster={generatedThumbnail?.dataUrl} controls className="h-56 w-full bg-slate-950 object-contain" />
                ) : (
                  <img src={selectedPreviewUrl} alt="Selected media preview" className="h-56 w-full object-cover" />
                )}
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{selectedFile.name}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-400">
                        {fileDetails?.width}x{fileDetails?.height} | {formatFileSize(selectedFile.size)}
                        {selectedIsVideo ? ` | ${formatDuration(fileDetails?.duration)}` : ''}
                      </p>
                    </div>
                    <button type="button" onClick={() => { setSelectedFile(null); setFileDetails(null); setGeneratedThumbnail(null); setUploadProgress(null); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-100 text-red-600 transition hover:bg-red-50">
                      <X size={16} strokeWidth={2.3} />
                    </button>
                  </div>
                  {selectedIsVideo ? (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                      Thumbnail generated automatically from the video, so Dynamic Ads Launch can publish it without extra upload work.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {uploadProgress ? (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.14em] text-amber-700">
                  <span>{uploadProgress.label}</span>
                  <span>{uploadProgress.percent}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-amber-500 transition-all duration-200" style={{ width: `${uploadProgress.percent}%` }} />
                </div>
                <p className="mt-2 text-xs font-semibold text-amber-800">
                  Large videos need a little time while the browser prepares the file and sends it to the local media library.
                </p>
              </div>
            ) : null}

            <button
              type="button"
              onClick={saveMediaAsset}
              disabled={saving || processingFile}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-70"
            >
              {saving ? <LoaderCircle size={17} className="animate-spin" /> : <Plus size={17} />}
              Save to media library
            </button>
          </div>
        </DashboardPanel>

        <DashboardPanel
          title="Saved media"
          headerAction={<span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">{mediaAssets.length} assets</span>}
        >
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {[0, 1, 2].map((item) => <div key={item} className="h-80 animate-pulse rounded-3xl bg-sky-50" />)}
            </div>
          ) : mediaAssets.length ? (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {mediaAssets.map((mediaAsset) => (
                <MediaCard key={mediaAsset.id} mediaAsset={mediaAsset} onDelete={deleteMediaAsset} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-sky-50 px-4 py-8 text-sm font-semibold text-slate-500">
              No saved media yet. Add one image or video here, then pick it inside Dynamic Ads Launch.
            </p>
          )}
        </DashboardPanel>
      </div>
    </div>
  );
};

export default AdsMediaLibraryPage;
