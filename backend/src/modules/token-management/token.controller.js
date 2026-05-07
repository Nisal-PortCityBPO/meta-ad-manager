const asyncHandler = require('../../app/utils/asyncHandler');
const tokenService = require('./token.service');

const getTokens = asyncHandler(async (req, res) => {
  const tokens = await tokenService.listTokens();
  res.json({ tokens });
});

const createToken = asyncHandler(async (req, res) => {
  const token = await tokenService.createToken({
    label: req.body.label,
    purpose: req.body.purpose,
    adsPowerProfile: req.body.adsPowerProfile,
    brandId: req.body.brandId,
    agencyId: req.body.agencyId,
    profileAccessToken: req.body.profileAccessToken,
    accessToken: req.body.accessToken,
    systemUserAccessToken: req.body.systemUserAccessToken,
    profileAccessTokenStatus: req.body.profileAccessTokenStatus,
    systemUserAccessTokenStatus: req.body.systemUserAccessTokenStatus,
    profilePerHourApiCallLimit: req.body.profilePerHourApiCallLimit,
    systemUserPerHourApiCallLimit: req.body.systemUserPerHourApiCallLimit,
    perHourApiCallLimit: req.body.perHourApiCallLimit,
    status: req.body.status,
    actor: req.user,
    req,
  });

  res.status(201).json({
    message: 'Token added successfully',
    token,
  });
});

const updateToken = asyncHandler(async (req, res) => {
  const token = await tokenService.updateToken({
    tokenId: req.params.id,
    label: req.body.label,
    purpose: req.body.purpose,
    adsPowerProfile: req.body.adsPowerProfile,
    brandId: req.body.brandId,
    agencyId: req.body.agencyId,
    profileAccessToken: req.body.profileAccessToken,
    accessToken: req.body.accessToken,
    systemUserAccessToken: req.body.systemUserAccessToken,
    profileAccessTokenStatus: req.body.profileAccessTokenStatus,
    systemUserAccessTokenStatus: req.body.systemUserAccessTokenStatus,
    profilePerHourApiCallLimit: req.body.profilePerHourApiCallLimit,
    systemUserPerHourApiCallLimit: req.body.systemUserPerHourApiCallLimit,
    perHourApiCallLimit: req.body.perHourApiCallLimit,
    status: req.body.status,
    actor: req.user,
    req,
  });

  res.json({
    message: 'Token updated successfully',
    token,
  });
});

const deleteToken = asyncHandler(async (req, res) => {
  const deleted = await tokenService.deleteToken({
    tokenId: req.params.id,
    actor: req.user,
    req,
  });

  res.json({
    message: 'Connection and associated saved data deleted successfully',
    deleted,
  });
});

const recordApiCall = asyncHandler(async (req, res) => {
  const token = await tokenService.recordTokenApiCall(req.params.id, req.body?.tokenType);

  res.json({
    message: 'API call recorded',
    token,
  });
});

module.exports = {
  createToken,
  deleteToken,
  getTokens,
  recordApiCall,
  updateToken,
};
