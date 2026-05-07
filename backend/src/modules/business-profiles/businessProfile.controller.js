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

module.exports = {
  assignBusinessProfile,
  deleteBusinessProfile,
  getBusinessProfiles,
  syncBusinessProfiles,
};
