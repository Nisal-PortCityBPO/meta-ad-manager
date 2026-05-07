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

module.exports = {
  deleteCampaign,
  duplicateCampaign,
  listCampaigns,
  updateCampaignStatus,
};
