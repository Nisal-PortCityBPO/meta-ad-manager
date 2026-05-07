const asyncHandler = require('../../app/utils/asyncHandler');
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

module.exports = {
  assignSocialAccount,
  getSocialAccounts,
};
