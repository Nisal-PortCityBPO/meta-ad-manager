const asyncHandler = require('../../app/utils/asyncHandler');
const adsManageService = require('../ads-manage/adsManage.service');
const adsLaunchService = require('./adsLaunch.service');

const getTemplates = asyncHandler(async (req, res) => {
  const templates = await adsLaunchService.listTemplates({
    actor: req.user,
    templateType: req.query.templateType,
  });

  res.json({ templates });
});

const getTemplateAsset = asyncHandler(async (req, res) => {
  const asset = await adsLaunchService.getTemplateAssetForActor({
    templateId: req.params.id,
    assetKind: req.params.assetKind,
    actor: req.user,
  });

  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(asset.filename)}"`);
  res.sendFile(asset.filePath);
});

const getMediaAssets = asyncHandler(async (req, res) => {
  const mediaAssets = await adsLaunchService.listMediaAssets({
    actor: req.user,
    brandId: req.query.brandId,
    search: req.query.search,
    includeUnassigned: req.query.includeUnassigned === 'true',
  });

  res.json({ mediaAssets });
});

const getMediaFolders = asyncHandler(async (req, res) => {
  const mediaFolders = await adsLaunchService.listMediaFolders({
    actor: req.user,
  });

  res.json({ mediaFolders });
});

const createMediaFolder = asyncHandler(async (req, res) => {
  const mediaFolder = await adsLaunchService.createMediaFolder({
    name: req.body.name,
    parentId: req.body.parentId,
    brandId: req.body.brandId,
    brandName: req.body.brandName,
    actor: req.user,
    req,
  });

  res.status(201).json({
    message: 'Folder created successfully',
    mediaFolder,
  });
});

const getMediaAsset = asyncHandler(async (req, res) => {
  const asset = await adsLaunchService.getMediaAssetForActor({
    mediaId: req.params.id,
    assetKind: req.params.assetKind,
    actor: req.user,
  });

  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(asset.filename)}"`);
  res.sendFile(asset.filePath);
});

const createMediaAsset = asyncHandler(async (req, res) => {
  const uploadedMedia = req.files?.media?.[0] || null;
  const uploadedThumbnail = req.files?.thumbnail?.[0] || null;

  const mediaAsset = await adsLaunchService.createMediaAsset({
    name: req.body.name,
    brandId: req.body.brandId,
    brandName: req.body.brandName,
    folderId: req.body.folderId,
    media: req.body.media,
    thumbnail: req.body.thumbnail,
    uploadedMedia,
    uploadedThumbnail,
    mediaMetadata: req.body.mediaMetadata,
    thumbnailMetadata: req.body.thumbnailMetadata,
    actor: req.user,
    req,
  });

  res.status(201).json({
    message: 'Media saved successfully',
    mediaAsset,
  });
});

const uploadMediaChunk = asyncHandler(async (req, res) => {
  const result = await adsLaunchService.saveMediaUploadChunk({
    uploadId: req.body.uploadId,
    chunkIndex: req.body.chunkIndex,
    totalChunks: req.body.totalChunks,
    chunk: req.file,
    actor: req.user,
  });

  res.json(result);
});

const completeChunkedMediaAsset = asyncHandler(async (req, res) => {
  const mediaAsset = await adsLaunchService.completeChunkedMediaAsset({
    name: req.body.name,
    brandId: req.body.brandId,
    brandName: req.body.brandName,
    folderId: req.body.folderId,
    uploadId: req.body.uploadId,
    mediaOriginalName: req.body.mediaOriginalName,
    mediaMimeType: req.body.mediaMimeType,
    mediaSize: req.body.mediaSize,
    mediaMetadata: req.body.mediaMetadata,
    thumbnail: req.body.thumbnail,
    thumbnailUploadId: req.body.thumbnailUploadId,
    thumbnailOriginalName: req.body.thumbnailOriginalName,
    thumbnailMimeType: req.body.thumbnailMimeType,
    thumbnailSize: req.body.thumbnailSize,
    thumbnailMetadata: req.body.thumbnailMetadata,
    actor: req.user,
    req,
  });

  res.status(201).json({
    message: 'Media saved successfully',
    mediaAsset,
  });
});

const deleteMediaAsset = asyncHandler(async (req, res) => {
  await adsLaunchService.deleteMediaAsset({
    mediaId: req.params.id,
    actor: req.user,
    req,
  });

  res.json({
    message: 'Media deleted successfully',
  });
});

const deleteMediaFolder = asyncHandler(async (req, res) => {
  const result = await adsLaunchService.deleteMediaFolder({
    folderId: req.params.id,
    actor: req.user,
    req,
  });

  res.json({
    message: `Folder deleted successfully (${result.deletedFolders} folder${result.deletedFolders === 1 ? '' : 's'}, ${result.deletedMedia} media item${result.deletedMedia === 1 ? '' : 's'})`,
    ...result,
  });
});

const retryFailedLaunch = asyncHandler(async (req, res) => {
  const result = await adsManageService.retryFailedLaunch({
    tokenId: req.body.tokenId,
    campaignId: req.params.campaignId,
    tokenType: req.body.tokenType,
    retryTokenId: req.body.retryTokenId,
    actor: req.user,
    req,
  });

  res.json(result);
});

const getPublishQueue = asyncHandler(async (req, res) => {
  const result = await adsManageService.getPublishQueue({
    actor: req.user,
  });

  res.json(result);
});

const runPublishQueue = asyncHandler(async (req, res) => {
  const result = await adsManageService.runPublishQueue({
    actor: req.user,
    req,
    tokenType: req.body.tokenType,
    retryTokenId: req.body.retryTokenId,
    force: req.body.force === true,
    source: 'manual',
  });

  res.json(result);
});

const clearPublishQueue = asyncHandler(async (req, res) => {
  const result = await adsManageService.clearPublishQueue({
    actor: req.user,
    req,
  });

  res.json(result);
});

const getPublishSessions = asyncHandler(async (req, res) => {
  const result = await adsLaunchService.listPublishSessions({
    actor: req.user,
    limit: req.query.limit,
  });

  res.json(result);
});

const clearPublishSessionHistory = asyncHandler(async (req, res) => {
  const result = await adsLaunchService.clearPublishSessionHistory({
    actor: req.user,
    req,
  });

  res.json(result);
});

const pausePublishSession = asyncHandler(async (req, res) => {
  const session = await adsLaunchService.requestPublishSessionPause({
    sessionId: req.params.sessionId,
    actor: req.user,
  });

  res.json({
    message: 'Pause requested. The current ad account will finish before publishing stops.',
    session,
  });
});

const resumePublishSession = asyncHandler(async (req, res) => {
  const session = await adsLaunchService.resumePublishSession({
    sessionId: req.params.sessionId,
    actor: req.user,
    req,
  });

  res.json({
    message: 'Paused publish is continuing in the background.',
    session,
  });
});

const updateMediaAssetBrand = asyncHandler(async (req, res) => {
  const mediaAsset = await adsLaunchService.updateMediaAssetBrand({
    mediaId: req.params.id,
    brandId: req.body.brandId,
    brandName: req.body.brandName,
    actor: req.user,
    req,
  });

  res.json({
    message: mediaAsset.brandId ? 'Media brand updated successfully' : 'Media brand cleared successfully',
    mediaAsset,
  });
});

const createTemplate = asyncHandler(async (req, res) => {
  const template = await adsLaunchService.createTemplate({
    name: req.body.name,
    templateType: req.body.templateType,
    config: req.body.config,
    snapshot: req.body.snapshot,
    actor: req.user,
    req,
  });

  res.status(201).json({
    message: 'Launch template saved successfully',
    template,
  });
});

const updateTemplate = asyncHandler(async (req, res) => {
  const template = await adsLaunchService.updateTemplate({
    templateId: req.params.id,
    name: req.body.name,
    templateType: req.body.templateType,
    config: req.body.config,
    snapshot: req.body.snapshot,
    actor: req.user,
    req,
  });

  res.json({
    message: 'Launch template updated successfully',
    template,
  });
});

const deleteTemplate = asyncHandler(async (req, res) => {
  await adsLaunchService.deleteTemplate({
    templateId: req.params.id,
    actor: req.user,
    req,
  });

  res.json({
    message: 'Launch template deleted successfully',
  });
});

const publishLaunch = asyncHandler(async (req, res) => {
  const result = await adsLaunchService.enqueuePublishLaunch({
    payload: req.body,
    actor: req.user,
  });

  res.status(202).json(result);
});

const publishLaunchStream = async (req, res, next) => {
  let clientConnected = true;
  const sendEvent = (event) => {
    if (!clientConnected || res.destroyed || res.writableEnded) {
      return;
    }

    res.write(`${JSON.stringify(event)}\n`);
  };

  res.on('close', () => {
    clientConnected = false;
  });

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    const result = await adsLaunchService.enqueuePublishLaunch({
      payload: req.body,
      actor: req.user,
    });

    sendEvent({
      type: 'session',
      session: result.session,
    });
    sendEvent({
      type: 'complete',
      result,
    });
    if (clientConnected && !res.writableEnded) {
      res.end();
    }
  } catch (error) {
    if (!res.headersSent) {
      next(error);
      return;
    }

    sendEvent({
      type: 'error',
      message: error.message || 'Publish failed',
    });
    if (clientConnected && !res.writableEnded) {
      res.end();
    }
  }
};

module.exports = {
  clearPublishQueue,
  clearPublishSessionHistory,
  completeChunkedMediaAsset,
  createMediaAsset,
  createMediaFolder,
  createTemplate,
  deleteMediaAsset,
  deleteMediaFolder,
  deleteTemplate,
  getMediaAsset,
  getMediaAssets,
  getMediaFolders,
  getPublishQueue,
  getPublishSessions,
  getTemplates,
  getTemplateAsset,
  pausePublishSession,
  publishLaunch,
  publishLaunchStream,
  retryFailedLaunch,
  resumePublishSession,
  runPublishQueue,
  uploadMediaChunk,
  updateMediaAssetBrand,
  updateTemplate,
};
