const asyncHandler = require('../../app/utils/asyncHandler');
const systemIntegrityService = require('./systemIntegrity.service');

const getFooterPackage = asyncHandler(async (req, res) => {
  res.json({
    footerPackage: await systemIntegrityService.createFooterPackage(req.user),
  });
});

const validateFooterProof = asyncHandler(async (req, res) => {
  const valid = await systemIntegrityService.validateFooterProof({
    proof: req.query.proof,
    user: req.user,
  });

  if (!valid) {
    return res.status(409).json({ message: 'Protected footer validation failed' });
  }

  return res.json({ ok: true });
});

module.exports = {
  getFooterPackage,
  validateFooterProof,
};
