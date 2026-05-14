const asyncHandler = require('../../app/utils/asyncHandler');
const adsManageService = require('./adsManage.service');

const listCampaigns = asyncHandler(async (req, res) => {
  const result = await adsManageService.listCampaigns({
    tokenId: req.body.tokenId,
    adAccountIds: req.body.adAccountIds,
    status: req.body.status,
  });

  res.json(result);
});

const listErrors = asyncHandler(async (req, res) => {
  const result = await adsManageService.listErrors({
    actor: req.user,
    tokenId: req.query.tokenId,
    type: req.query.type,
    status: req.query.status,
    search: req.query.search,
    page: req.query.page,
    limit: req.query.limit,
  });

  res.json(result);
});

const listDynamicHistory = asyncHandler(async (req, res) => {
  const result = await adsManageService.listDynamicHistory({
    actor: req.user,
    tokenId: req.query.tokenId,
    status: req.query.status,
    search: req.query.search,
    brandId: req.query.brandId,
    page: req.query.page,
    limit: req.query.limit,
  });

  res.json(result);
});

const checkErrorAccess = asyncHandler(async (req, res) => {
  const result = await adsManageService.checkFailedLaunchAccess({
    tokenId: req.body.tokenId,
    campaignId: req.params.campaignId,
    tokenType: req.body.tokenType,
    retryTokenId: req.body.retryTokenId,
    actor: req.user,
  });

  res.json(result);
});

const clearRecoveredErrors = asyncHandler(async (req, res) => {
  const result = await adsManageService.clearRecoveredErrors({
    actor: req.user,
    req,
  });

  res.json(result);
});

const updateCampaignStatus = asyncHandler(async (req, res) => {
  const result = await adsManageService.updateCampaignStatus({
    tokenId: req.body.tokenId,
    campaignId: req.params.campaignId,
    status: req.body.status,
    actor: req.user,
    req,
  });

  res.json(result);
});

const duplicateCampaign = asyncHandler(async (req, res) => {
  const result = await adsManageService.duplicateCampaign({
    tokenId: req.body.tokenId,
    campaignId: req.params.campaignId,
    name: req.body.name,
    status: req.body.status,
    deepCopy: req.body.deepCopy,
    actor: req.user,
    req,
  });

  res.status(201).json(result);
});

const deleteCampaign = asyncHandler(async (req, res) => {
  const result = await adsManageService.deleteCampaign({
    tokenId: req.body.tokenId,
    campaignId: req.params.campaignId,
    actor: req.user,
    req,
  });

  res.json(result);
});

const syncCampaignDetails = asyncHandler(async (req, res) => {
  const result = await adsManageService.syncCampaignDetails({
    tokenId: req.body.tokenId,
    campaignId: req.params.campaignId,
    actor: req.user,
    req,
  });

  res.json(result);
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

module.exports = {
  checkErrorAccess,
  clearRecoveredErrors,
  deleteCampaign,
  duplicateCampaign,
  listDynamicHistory,
  listErrors,
  listCampaigns,
  retryFailedLaunch,
  syncCampaignDetails,
  updateCampaignStatus,
};
