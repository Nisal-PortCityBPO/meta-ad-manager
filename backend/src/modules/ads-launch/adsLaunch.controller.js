const asyncHandler = require('../../app/utils/asyncHandler');
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
  });

  res.json({ mediaAssets });
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
  const mediaAsset = await adsLaunchService.createMediaAsset({
    name: req.body.name,
    media: req.body.media,
    thumbnail: req.body.thumbnail,
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
  const result = await adsLaunchService.publishLaunch({
    payload: req.body,
    actor: req.user,
    req,
  });

  res.json(result);
});

const publishLaunchStream = async (req, res, next) => {
  const sendEvent = (event) => {
    res.write(`${JSON.stringify(event)}\n`);
  };

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    const result = await adsLaunchService.publishLaunch({
      payload: req.body,
      actor: req.user,
      req,
      onProgress: sendEvent,
    });

    sendEvent({
      type: 'complete',
      result,
    });
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      next(error);
      return;
    }

    sendEvent({
      type: 'error',
      message: error.message || 'Publish failed',
    });
    res.end();
  }
};

module.exports = {
  createMediaAsset,
  createTemplate,
  deleteMediaAsset,
  deleteTemplate,
  getMediaAsset,
  getMediaAssets,
  getTemplates,
  getTemplateAsset,
  publishLaunch,
  publishLaunchStream,
  updateTemplate,
};
