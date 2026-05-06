const asyncHandler = require('../../app/utils/asyncHandler');
const metaAssetsService = require('./metaAssets.service');

const getMetaAssets = asyncHandler(async (req, res) => {
  const result = await metaAssetsService.getMetaAssets({
    tokenId: req.query.tokenId,
  });

  res.json(result);
});

const getMetaPixels = asyncHandler(async (req, res) => {
  const pixels = await metaAssetsService.getMetaPixels({
    tokenId: req.query.tokenId,
    adAccountId: req.query.adAccountId,
  });

  res.json({ pixels });
});

module.exports = {
  getMetaAssets,
  getMetaPixels,
};
