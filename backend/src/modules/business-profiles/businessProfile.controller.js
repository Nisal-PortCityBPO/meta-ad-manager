const asyncHandler = require('../../app/utils/asyncHandler');
const businessProfileService = require('./businessProfile.service');

const getBusinessProfiles = asyncHandler(async (req, res) => {
  const result = await businessProfileService.listBusinessProfiles(req.query);
  res.json(result);
});

const syncBusinessProfiles = asyncHandler(async (req, res) => {
  const result = await businessProfileService.syncBusinessProfiles({
    actor: req.user,
    req,
    tokenId: req.body?.tokenId,
    tokenType: req.body?.tokenType,
    socialAccountId: req.body?.socialAccountId,
  });

  res.json({
    message: 'Business profile sync completed',
    ...result,
  });
});

const assignBusinessProfile = asyncHandler(async (req, res) => {
  const profile = await businessProfileService.assignBusinessProfile({
    profileId: req.params.id,
    brandId: req.body.brandId,
    agencyId: req.body.agencyId,
    actor: req.user,
    req,
  });

  res.json({
    message: 'Business profile updated successfully',
    profile,
  });
});

const deleteBusinessProfile = asyncHandler(async (req, res) => {
  await businessProfileService.deleteBusinessProfile({
    profileId: req.params.id,
    actor: req.user,
    req,
  });

  res.json({ message: 'Business profile deleted successfully' });
});

const syncAdAccount = asyncHandler(async (req, res) => {
  const result = await businessProfileService.syncAdAccount({
    profileId: req.params.profileId,
    adAccountId: req.params.adAccountId,
    actor: req.user,
    req,
    tokenId: req.body?.tokenId,
    tokenType: req.body?.tokenType,
  });

  res.json({
    message: 'Ad account sync completed',
    ...result,
  });
});

const duplicateCampaign = asyncHandler(async (req, res) => {
  const result = await businessProfileService.duplicateCampaign({
    profileId: req.params.profileId,
    adAccountId: req.params.adAccountId,
    campaignId: req.params.campaignId,
    actor: req.user,
    req,
    tokenId: req.body?.tokenId,
    tokenType: req.body?.tokenType,
    name: req.body?.name,
    status: req.body?.status,
    deepCopy: req.body?.deepCopy,
  });

  res.status(201).json(result);
});

module.exports = {
  assignBusinessProfile,
  deleteBusinessProfile,
  duplicateCampaign,
  getBusinessProfiles,
  syncBusinessProfiles,
  syncAdAccount,
};
