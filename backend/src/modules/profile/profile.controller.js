const asyncHandler = require('../../app/utils/asyncHandler');
const profileService = require('./profile.service');

const getProfile = asyncHandler(async (req, res) => {
  res.json({
    user: req.user.toSafeObject(),
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const user = await profileService.updateProfile({
    user: req.user,
    name: req.body.name,
    email: req.body.email,
    req,
  });

  res.json({
    message: 'Profile updated successfully',
    user,
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await profileService.changePassword({
    user: req.user,
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
    req,
  });

  res.json(result);
});

module.exports = {
  changePassword,
  getProfile,
  updateProfile,
};
