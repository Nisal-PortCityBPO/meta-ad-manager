import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, ImageIcon, RefreshCw, Upload, Video, X } from 'lucide-react';

const ROOT_FOLDER_ID = 'root';

const formatFileSize = (bytes = 0) => {
  if (!bytes) {
    return '0 KB';
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${Math.max(Math.round(bytes / 1024), 1)} KB`;
};

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
    return [{ id: null, name: 'Media library' }];
  }

  const path = [];
  let current = foldersById.get(folderId);

  while (current) {
    path.unshift(current);
    current = current.parentId ? foldersById.get(current.parentId) : null;
  }

  return [{ id: null, name: 'Media library' }, ...path];
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

const MediaLibraryFolderPicker = ({
  description,
  emptyMessage,
  headerExtra = null,
  loading,
  mediaAssets = [],
  mediaFolders = [],
  mode = 'media',
  onClose,
  onRefresh,
  onSelect,
  selectedMediaAssetId = '',
  selectedMediaAssetUrl = '',
  title,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState(new Set());
  const foldersById = useMemo(
    () => new Map(mediaFolders.map((folder) => [folder.id, folder])),
    [mediaFolders]
  );
  const foldersByParent = useMemo(() => buildFolderGroups(mediaFolders), [mediaFolders]);
  const breadcrumbs = useMemo(
    () => buildFolderPath({ folderId: selectedFolderId, foldersById }),
    [foldersById, selectedFolderId]
  );
  const currentFolderKey = selectedFolderId || ROOT_FOLDER_ID;
  const visibleFolders = foldersByParent.get(currentFolderKey) || [];
  const visibleMediaAssets = useMemo(
    () => mediaAssets.filter((mediaAsset) => (mediaAsset.folderId || null) === (selectedFolderId || null)),
    [mediaAssets, selectedFolderId]
  );

  if (!onClose) {
    return null;
  }

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

  const getFolderMediaCount = (folderId) =>
    mediaAssets.filter((mediaAsset) => (mediaAsset.folderId || null) === folderId).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-2xl shadow-slate-950/20">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-sky-100 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Media library</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">{title || (mode === 'thumbnail' ? 'Choose thumbnail image' : 'Choose image or video')}</h3>
            {description ? <p className="mt-1 text-sm font-semibold text-slate-500">{description}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {headerExtra}
            <a
              href="/ads-media-library"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"
            >
              <Upload size={16} strokeWidth={2.3} />
              Upload media
            </a>
            <button type="button" onClick={() => onRefresh?.()} disabled={loading} className="flex h-10 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-sky-50 disabled:opacity-50">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-100 text-slate-500 transition hover:bg-sky-50">
              <X size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-[520px] gap-4 p-5 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="animate-pulse rounded-2xl bg-sky-50" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((item) => <div key={item} className="h-72 animate-pulse rounded-3xl bg-sky-50" />)}
            </div>
          </div>
        ) : (
          <div className="grid min-h-[520px] gap-4 overflow-hidden p-5 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="min-h-0 rounded-2xl border border-sky-100 bg-slate-50/80 p-3">
              <button
                type="button"
                onClick={() => setSelectedFolderId(null)}
                className={`mb-2 flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition ${
                  !selectedFolderId ? 'bg-sky-100 text-sky-800' : 'text-slate-700 hover:bg-white'
                }`}
              >
                <FolderOpen size={18} className="text-sky-600" />
                <span className="min-w-0 flex-1 truncate font-black">Media library</span>
              </button>
              <div className="max-h-[460px] overflow-y-auto rounded-xl border border-sky-100 bg-white/70 p-1 pr-2">
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
                {!mediaFolders.length ? (
                  <p className="rounded-xl bg-sky-50 px-3 py-5 text-center text-xs font-semibold leading-5 text-slate-500">
                    No folders for this brand yet.
                  </p>
                ) : null}
              </div>
            </aside>

            <section className="min-h-0 overflow-y-auto rounded-2xl border border-sky-100 bg-white p-4">
              <div className="border-b border-sky-100 pb-3">
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
              </div>

              {visibleFolders.length || visibleMediaAssets.length ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {visibleFolders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => selectFolder(folder.id)}
                      className="group flex min-h-28 flex-col items-start rounded-2xl border border-sky-100 bg-white p-4 text-left shadow-sm shadow-sky-100/70 transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md hover:shadow-sky-100"
                    >
                      <span className="flex h-12 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 transition group-hover:bg-amber-100">
                        <Folder size={28} fill="currentColor" strokeWidth={1.4} />
                      </span>
                      <span className="mt-3 w-full truncate text-sm font-black text-slate-950">{folder.name}</span>
                      <span className="mt-1 text-xs font-semibold text-slate-400">
                        {(foldersByParent.get(folder.id) || []).length} folders | {getFolderMediaCount(folder.id)} media
                      </span>
                    </button>
                  ))}
                  {visibleMediaAssets.map((mediaAsset) => {
                    const isVideo = mediaAsset.mediaType === 'VIDEO';
                    const media = mediaAsset.media || {};
                    const selected = selectedMediaAssetId
                      ? selectedMediaAssetId === mediaAsset.id
                      : selectedMediaAssetUrl === media.url;

                    return (
                      <button
                        key={mediaAsset.id}
                        type="button"
                        onClick={() => onSelect(mediaAsset)}
                        className={`overflow-hidden rounded-3xl border bg-white text-left shadow-sm transition ${
                          selected
                            ? 'border-sky-500 ring-4 ring-sky-100'
                            : 'border-sky-100 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-100'
                        }`}
                      >
                        <div className="relative bg-slate-950">
                          {isVideo ? (
                            <video src={media.url} className="h-44 w-full object-contain" />
                          ) : (
                            <img src={media.url} alt={mediaAsset.name} className="h-44 w-full object-cover" />
                          )}
                          <span className={`absolute left-3 top-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${isVideo ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>
                            {isVideo ? <Video size={14} strokeWidth={2.4} /> : <ImageIcon size={14} strokeWidth={2.4} />}
                            {isVideo ? 'Video' : 'Image'}
                          </span>
                          {selected ? (
                            <span className="absolute right-3 top-3 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                              Selected
                            </span>
                          ) : null}
                        </div>
                        <div className="p-4">
                          <p className="truncate text-sm font-black text-slate-950">{mediaAsset.name}</p>
                          <p className="mt-1 truncate text-xs font-semibold text-slate-400">
                            {media.width || 0}x{media.height || 0} | {formatFileSize(media.size)}
                          </p>
                          <p className="mt-2 inline-flex rounded-full bg-sky-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-sky-700">
                            {mediaAsset.brandName || 'Unassigned brand'}
                          </p>
                          {isVideo ? (
                            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                              Choose a separate image thumbnail for publishing
                            </p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 rounded-2xl bg-sky-50 px-4 py-8 text-sm font-semibold text-slate-500">
                  {emptyMessage ||
                    (mode === 'thumbnail'
                      ? 'No image assets in this folder. Open another folder or upload an image in Ads Media Library.'
                      : 'No media in this folder. Open another folder or upload media in Ads Media Library.')}
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaLibraryFolderPicker;
