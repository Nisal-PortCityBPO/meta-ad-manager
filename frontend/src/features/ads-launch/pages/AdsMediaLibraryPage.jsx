import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ChevronDown,
  ChevronRight,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  ImageIcon,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  Video,
} from 'lucide-react';
import { useAuth } from '../../auth/hooks/useAuth';
import { businessDataApi } from '../../dashboard/api/businessDataApi';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { adsLaunchApi } from '../api/adsLaunchApi';
import { createVideoThumbnailFile } from '../utils/videoThumbnail';

const ROOT_FOLDER_ID = 'root';
const MAIN_LIBRARY_STATE_STORAGE_KEY = 'meta-manager.ads-media-library-page-state.v1';
const MIN_DIMENSION = 600;
const MIN_ASPECT_RATIO = 0.56;
const MAX_ASPECT_RATIO = 1.92;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
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

const getUserStorageKey = (baseKey, user) => `${baseKey}:${user?.id || user?.email || 'guest'}`;

const readStoredLibraryState = (storageKey) => {
  if (typeof window === 'undefined') {
    return {
      filterBrandId: '',
      selectedFolderId: null,
    };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
    return {
      filterBrandId: typeof parsed.filterBrandId === 'string' ? parsed.filterBrandId : '',
      selectedFolderId: typeof parsed.selectedFolderId === 'string' && parsed.selectedFolderId ? parsed.selectedFolderId : null,
    };
  } catch {
    return {
      filterBrandId: '',
      selectedFolderId: null,
    };
  }
};

const writeStoredLibraryState = (storageKey, state) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      filterBrandId: state.filterBrandId || '',
      selectedFolderId: state.selectedFolderId || '',
    })
  );
};

const getSupportedMimeType = (file) => {
  const reportedType = String(file?.type || '').toLowerCase();

  if (IMAGE_MIME_TYPES.has(reportedType) || VIDEO_MIME_TYPES.has(reportedType)) {
    return reportedType;
  }

  return MIME_TYPE_BY_EXTENSION[getFileExtension(file?.name)] || reportedType;
};

const getMediaDisplayName = (fileName = '') => fileName.replace(/\.[^.]+$/, '') || 'Untitled media';

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

const buildFolderGroups = (folders) =>
  folders.reduce((groups, folder) => {
    const parentKey = folder.parentId || ROOT_FOLDER_ID;
    const nextGroup = groups.get(parentKey) || [];
    nextGroup.push(folder);
    groups.set(parentKey, nextGroup);
    return groups;
  }, new Map());

const buildFolderPath = ({ folderId, foldersById }) => {
  if (!folderId) {
    return [{ id: null, name: 'Saved media' }];
  }

  const path = [];
  let current = foldersById.get(folderId);

  while (current) {
    path.unshift(current);
    current = current.parentId ? foldersById.get(current.parentId) : null;
  }

  return [{ id: null, name: 'Saved media' }, ...path];
};

const getFolderAncestorIds = ({ folderId, foldersById }) => {
  const ancestorIds = [];
  let current = folderId ? foldersById.get(folderId) : null;

  while (current) {
    ancestorIds.push(current.id);
    current = current.parentId ? foldersById.get(current.parentId) : null;
  }

  return ancestorIds;
};

const FolderTreeNode = ({
  folder,
  foldersByParent,
  expandedFolderIds,
  selectedFolderId,
  onSelectFolder,
  onToggleFolder,
  level = 0,
}) => {
  const children = foldersByParent.get(folder.id) || [];
  const isExpanded = expandedFolderIds.has(folder.id);
  const isSelected = selectedFolderId === folder.id;

  return (
    <div>
      <div
        className={`group flex h-9 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm transition ${
          isSelected ? 'bg-sky-100 text-sky-800' : 'text-slate-700 hover:bg-sky-50'
        }`}
        style={{ paddingLeft: `${Math.max(level * 14, 8)}px` }}
        onClick={() => onSelectFolder(folder.id)}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFolder(folder.id);
          }}
          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-white"
          title={isExpanded ? 'Collapse folder' : 'Expand folder'}
        >
          {children.length ? (
            isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />
          ) : (
            <span className="h-4 w-4" />
          )}
        </button>
        {isExpanded ? <FolderOpen size={17} className="text-sky-600" /> : <Folder size={17} className="text-sky-600" />}
        <span className="min-w-0 flex-1 truncate font-bold">{folder.name}</span>
      </div>
      {isExpanded
        ? children.map((childFolder) => (
            <FolderTreeNode
              key={childFolder.id}
              folder={childFolder}
              foldersByParent={foldersByParent}
              expandedFolderIds={expandedFolderIds}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              onToggleFolder={onToggleFolder}
              level={level + 1}
            />
          ))
        : null}
    </div>
  );
};

const FolderTile = ({ folder, folderCount, mediaCount, onOpen }) => (
  <button
    type="button"
    onClick={() => onOpen(folder.id)}
    className="group flex min-h-28 flex-col items-start rounded-2xl border border-sky-100 bg-white p-4 text-left shadow-sm shadow-sky-100/70 transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md hover:shadow-sky-100"
  >
    <span className="flex h-12 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 transition group-hover:bg-amber-100">
      <Folder size={28} fill="currentColor" strokeWidth={1.4} />
    </span>
    <span className="mt-3 w-full truncate text-sm font-black text-slate-950">{folder.name}</span>
    <span className="mt-1 text-xs font-semibold text-slate-400">
      {folderCount} folders | {mediaCount} media
    </span>
  </button>
);

const MediaTile = ({ brands, brandsLoading, mediaAsset, onBrandChange, onDelete, onSelectChange, selected, updatingBrand }) => {
  const isVideo = mediaAsset.mediaType === 'VIDEO';
  const media = mediaAsset.media || {};
  const brandLabel = mediaAsset.brandName || 'Unassigned brand';
  const folderLocked = Boolean(mediaAsset.folderId);

  return (
    <div className={`group overflow-hidden rounded-2xl border bg-white shadow-sm shadow-sky-100/70 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-sky-100 ${selected ? 'border-sky-500 ring-4 ring-sky-100' : 'border-sky-100'}`}>
      <div className="relative flex h-40 items-center justify-center bg-slate-950">
        {isVideo ? (
          <video src={media.url} poster={mediaAsset.thumbnail?.url || ''} controls className="h-full w-full object-contain" />
        ) : (
          <img src={media.url} alt={mediaAsset.name} className="h-full w-full object-cover" />
        )}
        <label className="absolute left-3 top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl bg-white/95 shadow-sm transition hover:bg-sky-50" title="Select media">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelectChange(mediaAsset.id, event.target.checked)}
            className="h-4 w-4 accent-sky-600"
          />
        </label>
        <span className={`absolute left-14 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${isVideo ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>
          {isVideo ? <Video size={13} /> : <ImageIcon size={13} />}
          {isVideo ? 'Video' : 'Image'}
        </span>
        <button
          type="button"
          onClick={() => onDelete(mediaAsset)}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl bg-white/95 text-red-600 opacity-0 shadow-sm transition hover:bg-red-50 group-hover:opacity-100"
          title="Delete media"
        >
          <Trash2 size={15} strokeWidth={2.3} />
        </button>
      </div>
      <div className="p-4">
        <p className="truncate text-sm font-black text-slate-950">{mediaAsset.name}</p>
        <p className="mt-1 truncate text-xs font-semibold text-slate-400">{media.name}</p>
        <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${mediaAsset.brandId ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'}`}>
          {brandLabel}
        </p>

        {folderLocked ? (
          <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/50 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-700">Folder brand</p>
            <p className="mt-2 text-sm font-bold text-slate-700">{brandLabel}</p>
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/50 p-3">
            <label htmlFor={`media-brand-${mediaAsset.id}`} className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-700">
              Quick brand
            </label>
            <div className="mt-2 flex items-center gap-2">
              <select
                id={`media-brand-${mediaAsset.id}`}
                value={mediaAsset.brandId || ''}
                onChange={(event) => onBrandChange(mediaAsset, event.target.value)}
                disabled={brandsLoading || updatingBrand}
                className="h-10 min-w-0 flex-1 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:opacity-60"
              >
                <option value="">Unassigned</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </select>
              {updatingBrand ? <LoaderCircle size={18} className="shrink-0 animate-spin text-sky-600" /> : null}
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-sky-50 px-2 py-2">
            <p className="text-[10px] font-black uppercase text-sky-600">Size</p>
            <p className="mt-1 text-xs font-bold text-slate-700">{formatFileSize(media.size)}</p>
          </div>
          <div className="rounded-xl bg-sky-50 px-2 py-2">
            <p className="text-[10px] font-black uppercase text-sky-600">Pixels</p>
            <p className="mt-1 text-xs font-bold text-slate-700">{media.width}x{media.height}</p>
          </div>
          <div className="rounded-xl bg-sky-50 px-2 py-2">
            <p className="text-[10px] font-black uppercase text-sky-600">Ratio</p>
            <p className="mt-1 text-xs font-bold text-slate-700">{getAspectRatio(media).toFixed(2)}:1</p>
          </div>
        </div>
        {isVideo ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-amber-700">{formatDuration(media.duration)} video</p>
            {mediaAsset.thumbnail?.url ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                Auto thumbnail
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700">
                No thumbnail
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const AdsMediaLibraryPage = () => {
  const { user } = useAuth();
  const storageKey = getUserStorageKey(MAIN_LIBRARY_STATE_STORAGE_KEY, user);
  const initialStoredState = useMemo(() => readStoredLibraryState(storageKey), [storageKey]);
  const fileInputRef = useRef(null);
  const [mediaAssets, setMediaAssets] = useState([]);
  const [mediaFolders, setMediaFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [filterBrandId, setFilterBrandId] = useState(() => initialStoredState.filterBrandId);
  const [searchTerm, setSearchTerm] = useState('');
  const [folderBrandId, setFolderBrandId] = useState(() => initialStoredState.filterBrandId);
  const [selectedFolderId, setSelectedFolderId] = useState(() => initialStoredState.selectedFolderId);
  const [expandedFolderIds, setExpandedFolderIds] = useState(new Set());
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [updatingBrandAssetId, setUpdatingBrandAssetId] = useState('');
  const [selectedMediaIds, setSelectedMediaIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);

  const filteredMediaFolders = useMemo(
    () => mediaFolders.filter((folder) => !filterBrandId || folder.brandId === filterBrandId),
    [filterBrandId, mediaFolders]
  );
  const foldersById = useMemo(
    () => new Map(filteredMediaFolders.map((folder) => [folder.id, folder])),
    [filteredMediaFolders]
  );
  const foldersByParent = useMemo(() => buildFolderGroups(filteredMediaFolders), [filteredMediaFolders]);
  const breadcrumbs = useMemo(
    () => buildFolderPath({ folderId: selectedFolderId, foldersById }),
    [foldersById, selectedFolderId]
  );
  const selectedFolder = selectedFolderId ? foldersById.get(selectedFolderId) : null;
  const selectedFolderBrand = selectedFolder?.brandId
    ? { id: selectedFolder.brandId, name: selectedFolder.brandName || 'Selected folder brand' }
    : brands.find((brand) => brand.id === folderBrandId) || null;
  const currentFolderKey = selectedFolderId || ROOT_FOLDER_ID;
  const visibleFolders = foldersByParent.get(currentFolderKey) || [];
  const visibleMediaAssets = useMemo(
    () => mediaAssets.filter((mediaAsset) => (mediaAsset.folderId || null) === (selectedFolderId || null)),
    [mediaAssets, selectedFolderId]
  );
  const visibleMediaAssetIds = useMemo(
    () => visibleMediaAssets.map((mediaAsset) => mediaAsset.id),
    [visibleMediaAssets]
  );
  const selectedVisibleMediaIds = useMemo(
    () => visibleMediaAssetIds.filter((mediaAssetId) => selectedMediaIds.has(mediaAssetId)),
    [selectedMediaIds, visibleMediaAssetIds]
  );
  const allVisibleMediaSelected = Boolean(visibleMediaAssetIds.length && selectedVisibleMediaIds.length === visibleMediaAssetIds.length);

  const getFolderMediaCount = (folderId) =>
    mediaAssets.filter((mediaAsset) => (mediaAsset.folderId || null) === folderId).length;

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const [mediaData, folderData] = await Promise.all([
        adsLaunchApi.getMediaAssets({
          brandId: filterBrandId,
          search: searchTerm,
        }),
        adsLaunchApi.getMediaFolders(),
      ]);

      const nextFolders = folderData.mediaFolders || [];
      const nextVisibleFolders = nextFolders.filter((folder) => !filterBrandId || folder.brandId === filterBrandId);
      setMediaAssets(mediaData.mediaAssets || []);
      setMediaFolders(nextFolders);
      setSelectedFolderId((currentFolderId) =>
        currentFolderId && !nextVisibleFolders.some((folder) => folder.id === currentFolderId) ? null : currentFolderId
      );
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filterBrandId, searchTerm]);

  useEffect(() => {
    const storedState = readStoredLibraryState(storageKey);
    setFilterBrandId(storedState.filterBrandId);
    setFolderBrandId(storedState.filterBrandId);
    setSelectedFolderId(storedState.selectedFolderId);
  }, [storageKey]);

  useEffect(() => {
    writeStoredLibraryState(storageKey, {
      filterBrandId,
      selectedFolderId,
    });
  }, [filterBrandId, selectedFolderId, storageKey]);

  useEffect(() => {
    setSelectedMediaIds(new Set());
  }, [selectedFolderId]);

  useEffect(() => {
    setSelectedMediaIds((current) => {
      const validIds = new Set(mediaAssets.map((mediaAsset) => mediaAsset.id));
      const next = new Set([...current].filter((mediaAssetId) => validIds.has(mediaAssetId)));
      return next.size === current.size ? current : next;
    });
  }, [mediaAssets]);

  useEffect(() => {
    if (!selectedFolderId || !foldersById.has(selectedFolderId)) {
      return;
    }

    setExpandedFolderIds((current) => {
      const next = new Set(current);
      getFolderAncestorIds({ folderId: selectedFolderId, foldersById }).forEach((folderId) => next.add(folderId));
      return next;
    });
  }, [foldersById, selectedFolderId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadLibrary();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadLibrary]);

  useEffect(() => {
    let mounted = true;

    businessDataApi
      .getBrands()
      .then((data) => {
        if (!mounted) {
          return;
        }

        const nextBrands = data.brands || [];
        setBrands(nextBrands);

        if (nextBrands.length === 1) {
          setFolderBrandId((current) => current || nextBrands[0].id);
          setFilterBrandId((current) => current || nextBrands[0].id);
        }
      })
      .catch((requestError) => toast.error(requestError.message))
      .finally(() => {
        if (mounted) {
          setBrandsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const toggleFolder = (folderId) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const selectFolder = (folderId) => {
    setSelectedFolderId(folderId);
    if (folderId) {
      setExpandedFolderIds((current) => new Set(current).add(folderId));
    }
  };

  const createFolder = async () => {
    const folderName = newFolderName.trim();

    if (!folderName) {
      toast.error('Give the folder a name');
      return;
    }

    if (!selectedFolderId && !folderBrandId) {
      toast.error('Select a brand for the top-level folder');
      return;
    }

    const rootBrand = brands.find((brand) => brand.id === folderBrandId) || null;

    setCreatingFolder(true);
    try {
      const data = await adsLaunchApi.createMediaFolder({
        name: folderName,
        parentId: selectedFolderId,
        brandId: selectedFolderId ? '' : folderBrandId,
        brandName: selectedFolderId ? '' : rootBrand?.name || '',
      });
      toast.success(data.message);
      setNewFolderName('');
      await loadLibrary();
      if (data.mediaFolder?.id) {
        selectFolder(data.mediaFolder.id);
      }
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setCreatingFolder(false);
    }
  };

  const prepareMediaFile = async (file) => {
    const supportedMimeType = getSupportedMimeType(file);
    const isVideo = VIDEO_MIME_TYPES.has(supportedMimeType);
    const isImage = IMAGE_MIME_TYPES.has(supportedMimeType);

    if (!isVideo && !isImage) {
      throw new Error(`${file.name}: use JPG/JPEG images or MP4/MOV videos.`);
    }

    const normalizedFile =
      supportedMimeType && file.type !== supportedMimeType
        ? new File([file], file.name, { type: supportedMimeType, lastModified: file.lastModified })
        : file;
    const details = isVideo ? await readVideoMetadata(normalizedFile) : await readImageMetadata(normalizedFile);
    const validationError = getValidationError({ file: normalizedFile, ...details });

    if (validationError) {
      throw new Error(`${file.name}: ${validationError}`);
    }

    const thumbnail = isVideo ? await createVideoThumbnailFile(normalizedFile) : null;

    return {
      file: normalizedFile,
      details,
      thumbnail,
    };
  };

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);

    if (!files.length) {
      return;
    }

    if (!selectedFolderId || !selectedFolderBrand?.id) {
      toast.error('Select a brand folder before uploading media');
      return;
    }

    setUploading(true);
    let uploadedCount = 0;
    let failedCount = 0;

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setUploadProgress({
          label: `Preparing ${file.name}`,
          percent: 0,
          index: index + 1,
          total: files.length,
        });

        try {
          const prepared = await prepareMediaFile(file);
          const isVideoUpload = prepared.file.type.startsWith('video/');
          await adsLaunchApi.uploadMediaAssetWithProgress(
            {
              name: getMediaDisplayName(prepared.file.name),
              brandId: selectedFolderBrand.id,
              brandName: selectedFolderBrand.name || '',
              folderId: selectedFolderId,
              mediaFile: prepared.file,
              mediaMetadata: {
                width: prepared.details.width,
                height: prepared.details.height,
                duration: prepared.details.duration || 0,
              },
              thumbnailFile: prepared.thumbnail?.file || null,
              thumbnailMetadata: prepared.thumbnail?.metadata || null,
            },
            {
              onUploadProgress: (percent) => {
                setUploadProgress({
                  label: `Uploading ${prepared.file.name}${isVideoUpload ? ' with auto thumbnail' : ''}`,
                  percent,
                  index: index + 1,
                  total: files.length,
                });
              },
            }
          );
          uploadedCount += 1;
        } catch (error) {
          failedCount += 1;
          toast.error(error.message);
        }
      }

      if (uploadedCount) {
        toast.success(`${uploadedCount} media file${uploadedCount === 1 ? '' : 's'} uploaded`);
      }
      if (failedCount && !uploadedCount) {
        toast.error('No media files were uploaded');
      }
      await loadLibrary();
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleFileInputChange = (event) => {
    uploadFiles(event.target.files);
    event.target.value = '';
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDragActive(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    uploadFiles(event.dataTransfer.files);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    loadLibrary();
  };

  const deleteMediaAsset = async (mediaAsset) => {
    if (!window.confirm(`Delete media "${mediaAsset.name}"?`)) {
      return;
    }

    try {
      const data = await adsLaunchApi.deleteMediaAsset(mediaAsset.id);
      toast.success(data.message);
      await loadLibrary();
    } catch (requestError) {
      toast.error(requestError.message);
    }
  };

  const toggleMediaSelected = (mediaAssetId, checked) => {
    setSelectedMediaIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(mediaAssetId);
      } else {
        next.delete(mediaAssetId);
      }
      return next;
    });
  };

  const selectAllVisibleMedia = () => {
    setSelectedMediaIds((current) => {
      const next = new Set(current);
      visibleMediaAssetIds.forEach((mediaAssetId) => next.add(mediaAssetId));
      return next;
    });
  };

  const clearSelectedVisibleMedia = () => {
    setSelectedMediaIds((current) => {
      const next = new Set(current);
      visibleMediaAssetIds.forEach((mediaAssetId) => next.delete(mediaAssetId));
      return next;
    });
  };

  const deleteSelectedMedia = async () => {
    const selectedAssets = visibleMediaAssets.filter((mediaAsset) => selectedMediaIds.has(mediaAsset.id));

    if (!selectedAssets.length) {
      toast.error('Select media from this folder first');
      return;
    }

    if (!window.confirm(`Delete ${selectedAssets.length} selected media item${selectedAssets.length === 1 ? '' : 's'} from "${selectedFolder?.name || 'Saved media'}"?`)) {
      return;
    }

    setBulkDeleting(true);
    let deletedCount = 0;
    let failedCount = 0;

    try {
      for (const mediaAsset of selectedAssets) {
        try {
          await adsLaunchApi.deleteMediaAsset(mediaAsset.id);
          deletedCount += 1;
        } catch (requestError) {
          failedCount += 1;
          toast.error(`${mediaAsset.name}: ${requestError.message}`);
        }
      }

      if (deletedCount) {
        toast.success(`${deletedCount} media item${deletedCount === 1 ? '' : 's'} deleted`);
      }
      if (failedCount && !deletedCount) {
        toast.error('No selected media could be deleted');
      }
      clearSelectedVisibleMedia();
      await loadLibrary();
    } finally {
      setBulkDeleting(false);
    }
  };

  const deleteSelectedFolder = async () => {
    if (!selectedFolder) {
      toast.error('Open a folder before deleting it');
      return;
    }

    const childFolderCount = (foldersByParent.get(selectedFolder.id) || []).length;
    const currentFolderMediaCount = getFolderMediaCount(selectedFolder.id);
    const warningParts = [
      `"${selectedFolder.name}"`,
      childFolderCount ? `${childFolderCount} direct child folder${childFolderCount === 1 ? '' : 's'}` : '',
      currentFolderMediaCount ? `${currentFolderMediaCount} media item${currentFolderMediaCount === 1 ? '' : 's'} in this folder` : '',
    ].filter(Boolean);

    if (!window.confirm(`Delete folder ${warningParts.join(' with ')}? This also deletes all nested folders and media inside them.`)) {
      return;
    }

    const parentFolderId = selectedFolder.parentId || null;
    setDeletingFolder(true);
    try {
      const data = await adsLaunchApi.deleteMediaFolder(selectedFolder.id);
      toast.success(data.message || 'Folder deleted successfully');
      setSelectedMediaIds(new Set());
      setSelectedFolderId(parentFolderId);
      await loadLibrary();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setDeletingFolder(false);
    }
  };

  const updateMediaBrand = async (mediaAsset, brandId) => {
    if ((mediaAsset.brandId || '') === brandId) {
      return;
    }

    const brand = brands.find((item) => item.id === brandId) || null;

    setUpdatingBrandAssetId(mediaAsset.id);
    try {
      const data = await adsLaunchApi.updateMediaAssetBrand(mediaAsset.id, {
        brandId,
        brandName: brand?.name || '',
      });
      const updatedMediaAsset = data.mediaAsset;

      setMediaAssets((current) =>
        current
          .map((item) => (item.id === updatedMediaAsset.id ? updatedMediaAsset : item))
          .filter((item) => !filterBrandId || item.brandId === filterBrandId)
      );
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setUpdatingBrandAssetId('');
    }
  };

  return (
    <div>
      <DashboardHeader
        title="Ads Media Library"
        description="Organize Meta-ready images and videos in folders, then reuse them per ad account in Dynamic Ads Launch."
        action={
          <button
            type="button"
            onClick={loadLibrary}
            disabled={loading}
            className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-60"
          >
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <DashboardPanel title="Library filters" className="mb-4">
        <form onSubmit={submitSearch} className="grid gap-3 lg:grid-cols-[minmax(220px,0.8fr)_minmax(280px,1fr)_auto] lg:items-end">
          <div className="space-y-2">
            <label htmlFor="media-filter-brand" className="text-sm font-semibold text-slate-700">Brand category</label>
            <select
              id="media-filter-brand"
              value={filterBrandId}
              onChange={(event) => {
                const nextBrandId = event.target.value;
                setFilterBrandId(nextBrandId);
                setSelectedFolderId(null);
                setFolderBrandId(nextBrandId);
              }}
              disabled={brandsLoading}
              className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              <option value="">All brands</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>{brand.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="media-search" className="text-sm font-semibold text-slate-700">Search media</label>
            <div className="relative">
              <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="media-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-12 w-full rounded-xl border border-sky-100 bg-white pl-11 pr-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="Search name, file, or brand"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-black text-white transition hover:bg-sky-700 disabled:opacity-60"
          >
            {loading ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={17} />}
            Apply
          </button>
        </form>
      </DashboardPanel>

      <DashboardPanel
        title="Saved media"
        headerAction={
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
            {filteredMediaFolders.length} folders | {mediaAssets.length} assets
          </span>
        }
      >
        <div className="grid min-h-[660px] gap-4 lg:grid-cols-[310px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-sky-100 bg-slate-50/80 p-3 shadow-inner shadow-white">
            <div className="mb-3 flex items-center justify-between gap-3 px-2">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                <HardDrive size={15} />
                Folder structure
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-sky-700">
                {filteredMediaFolders.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFolderId(null)}
              className={`mb-1 flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition ${
                !selectedFolderId ? 'bg-sky-100 text-sky-800' : 'text-slate-700 hover:bg-white'
              }`}
            >
              <FolderOpen size={18} className="text-sky-600" />
              <span className="min-w-0 flex-1 truncate font-black">Saved media</span>
            </button>
            <div className="max-h-[560px] overflow-y-auto rounded-xl border border-sky-100 bg-white/70 p-1 pr-2">
              {(foldersByParent.get(ROOT_FOLDER_ID) || []).map((folder) => (
                <FolderTreeNode
                  key={folder.id}
                  folder={folder}
                  foldersByParent={foldersByParent}
                  expandedFolderIds={expandedFolderIds}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={selectFolder}
                  onToggleFolder={toggleFolder}
                />
              ))}
              {!filteredMediaFolders.length && !loading ? (
                <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/70 px-3 py-5 text-center">
                  <FolderPlus size={24} className="mx-auto text-sky-500" />
                  <p className="mt-2 text-xs font-black text-slate-700">No folders yet</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                    Create a folder from the right toolbar. Nested folders will appear here like a file tree.
                  </p>
                </div>
              ) : null}
            </div>
          </aside>

          <section
            className={`relative min-w-0 rounded-2xl border border-dashed p-4 transition ${
              dragActive ? 'border-sky-500 bg-sky-50' : 'border-sky-100 bg-white'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex flex-col gap-3 border-b border-sky-100 pb-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-500">
                  {breadcrumbs.map((breadcrumb, index) => (
                    <button
                      key={breadcrumb.id || ROOT_FOLDER_ID}
                      type="button"
                      onClick={() => setSelectedFolderId(breadcrumb.id)}
                      className={`max-w-44 truncate rounded-lg px-2 py-1 transition ${
                        index === breadcrumbs.length - 1 ? 'bg-sky-50 text-sky-700' : 'hover:bg-slate-50'
                      }`}
                    >
                      {breadcrumb.name}
                    </button>
                  ))}
                </div>
                <h3 className="mt-2 truncate text-2xl font-black text-slate-950">
                  {selectedFolder?.name || 'Saved media'}
                </h3>
              </div>

              <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
                {selectedFolder ? (
                  <div className="flex h-11 min-w-52 items-center rounded-xl border border-sky-100 bg-sky-50 px-3 text-sm font-black text-sky-700">
                    Brand: {selectedFolder.brandName || 'Unassigned'}
                  </div>
                ) : (
                  <select
                    value={folderBrandId}
                    onChange={(event) => setFolderBrandId(event.target.value)}
                    disabled={brandsLoading || uploading}
                    className="h-11 min-w-52 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:opacity-60"
                    title="Brand for the top-level folder"
                  >
                    <option value="">Folder brand</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>{brand.name}</option>
                    ))}
                  </select>
                )}

                <div className="flex h-11 overflow-hidden rounded-xl border border-sky-100 bg-white">
                  <input
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        createFolder();
                      }
                    }}
                    className="min-w-0 px-3 text-sm font-semibold outline-none"
                    placeholder="New folder name"
                  />
                  <button
                    type="button"
                    onClick={createFolder}
                    disabled={creatingFolder}
                    className="flex items-center gap-2 border-l border-sky-100 px-3 text-sm font-black text-sky-700 transition hover:bg-sky-50 disabled:opacity-60"
                  >
                    {creatingFolder ? <LoaderCircle size={16} className="animate-spin" /> : <FolderPlus size={16} />}
                    Create
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || deletingFolder || !selectedFolderId}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-70"
                  title={selectedFolderId ? 'Upload media to selected folder' : 'Select a brand folder before uploading media'}
                >
                  {uploading ? <LoaderCircle size={17} className="animate-spin" /> : <FileUp size={17} />}
                  Upload media
                </button>
                {selectedFolder ? (
                  <button
                    type="button"
                    onClick={deleteSelectedFolder}
                    disabled={deletingFolder || uploading || creatingFolder}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl border border-red-100 bg-white px-4 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Delete this folder, child folders, and all media inside"
                  >
                    {deletingFolder ? <LoaderCircle size={17} className="animate-spin" /> : <Trash2 size={17} />}
                    Delete folder
                  </button>
                ) : null}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,video/mp4,video/quicktime"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>
            </div>

            {uploadProgress ? (
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.12em] text-amber-700">
                  <span className="min-w-0 truncate">{uploadProgress.label}</span>
                  <span>
                    {uploadProgress.index}/{uploadProgress.total} | {uploadProgress.percent}%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-amber-500 transition-all duration-200" style={{ width: `${uploadProgress.percent}%` }} />
                </div>
              </div>
            ) : null}

            {!loading && visibleMediaAssets.length ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Current folder selection</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {selectedVisibleMediaIds.length} of {visibleMediaAssets.length} media selected in {selectedFolder?.name || 'Saved media'}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={allVisibleMediaSelected ? clearSelectedVisibleMedia : selectAllVisibleMedia}
                    className="h-9 rounded-lg border border-sky-100 bg-white px-3 text-xs font-black uppercase tracking-[0.12em] text-sky-700 transition hover:bg-sky-50"
                  >
                    {allVisibleMediaSelected ? 'Clear all' : 'Select all'}
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelectedMedia}
                    disabled={!selectedVisibleMediaIds.length || bulkDeleting}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-100 bg-white px-3 text-xs font-black uppercase tracking-[0.12em] text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bulkDeleting ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Delete selected
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              {loading ? (
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                  {[0, 1, 2, 3].map((item) => (
                    <div key={item} className="h-48 animate-pulse rounded-2xl bg-sky-50" />
                  ))}
                </div>
              ) : visibleFolders.length || visibleMediaAssets.length ? (
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                  {visibleFolders.map((folder) => (
                    <FolderTile
                      key={folder.id}
                      folder={folder}
                      folderCount={(foldersByParent.get(folder.id) || []).length}
                      mediaCount={getFolderMediaCount(folder.id)}
                      onOpen={selectFolder}
                    />
                  ))}
                  {visibleMediaAssets.map((mediaAsset) => (
                    <MediaTile
                      key={mediaAsset.id}
                      brands={brands}
                      brandsLoading={brandsLoading}
                      mediaAsset={mediaAsset}
                      onBrandChange={updateMediaBrand}
                      onDelete={deleteMediaAsset}
                      onSelectChange={toggleMediaSelected}
                      selected={selectedMediaIds.has(mediaAsset.id)}
                      updatingBrand={updatingBrandAssetId === mediaAsset.id}
                    />
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!selectedFolderId}
                  className="flex min-h-80 w-full flex-col items-center justify-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/60 px-6 py-10 text-center transition hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <UploadCloud size={34} strokeWidth={2.1} className="text-sky-600" />
                  <p className="mt-3 text-sm font-black text-slate-950">
                    {selectedFolderId ? 'Drop images or videos into this folder' : 'Create or open a brand folder first'}
                  </p>
                  <p className="mt-1 max-w-xl text-xs font-semibold leading-5 text-slate-500">
                    {selectedFolderId
                      ? 'Bulk upload JPG/JPEG images or MP4/MOV videos. Media must be at least 600x600px and use a Meta-ready aspect ratio.'
                      : 'Top-level folders require a brand. Child folders and uploads inherit that brand automatically.'}
                  </p>
                </button>
              )}
            </div>

            {dragActive ? (
              <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-3xl border-2 border-dashed border-sky-500 bg-sky-50/90">
                <div className="text-center">
                  <UploadCloud size={38} className="mx-auto text-sky-600" />
                  <p className="mt-3 text-sm font-black text-sky-800">Drop files into {selectedFolder?.name || 'Saved media'}</p>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </DashboardPanel>
    </div>
  );
};

export default AdsMediaLibraryPage;
