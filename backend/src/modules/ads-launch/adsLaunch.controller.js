const asyncHandler = require('../../app/utils/asyncHandler');
const adsLaunchService = require('./adsLaunch.service');

const getTemplates = asyncHandler(async (req, res) => {
  const templates = await adsLaunchService.listTemplates({
    actor: req.user,
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

const createTemplate = asyncHandler(async (req, res) => {
  const template = await adsLaunchService.createTemplate({
    name: req.body.name,
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

module.exports = {
  createTemplate,
  deleteTemplate,
  getTemplates,
  getTemplateAsset,
  publishLaunch,
  updateTemplate,
};
