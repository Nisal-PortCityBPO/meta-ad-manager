const asyncHandler = require('../../app/utils/asyncHandler');
const businessProfileService = require('../business-profiles/businessProfile.service');
const socialAccountService = require('./socialAccount.service');

const getSocialAccounts = asyncHandler(async (req, res) => {
  const result = await socialAccountService.listSocialAccounts(req.query);
  res.json(result);
});

const assignSocialAccount = asyncHandler(async (req, res) => {
  const socialAccount = await socialAccountService.assignSocialAccount({
    accountId: req.params.id,
    brandId: req.body.brandId,
    agencyId: req.body.agencyId,
    actor: req.user,
    req,
  });

  res.json({
    message: 'Social account updated successfully',
    socialAccount,
  });
});

const syncSocialAccount = asyncHandler(async (req, res) => {
  const result = await businessProfileService.syncBusinessProfiles({
    actor: req.user,
    req,
    socialAccountId: req.params.id,
  });

  res.json({
    message: 'Social account data fetch completed',
    ...result,
  });
});

module.exports = {
  assignSocialAccount,
  getSocialAccounts,
  syncSocialAccount,
};
