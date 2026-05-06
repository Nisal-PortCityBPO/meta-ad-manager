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
    accessToken: req.body.accessToken,
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
    accessToken: req.body.accessToken,
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
  await tokenService.deleteToken({
    tokenId: req.params.id,
    actor: req.user,
    req,
  });

  res.json({
    message: 'Token deleted successfully',
  });
});

const recordApiCall = asyncHandler(async (req, res) => {
  const token = await tokenService.recordTokenApiCall(req.params.id);

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
