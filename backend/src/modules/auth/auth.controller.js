const asyncHandler = require('../../app/utils/asyncHandler');
const { clearAuthCookie, setAuthCookie } = require('../../app/middleware/auth');
const authService = require('./auth.service');

const login = asyncHandler(async (req, res) => {
  const { token, user } = await authService.login({
    email: req.body.email,
    password: req.body.password,
    req,
  });

  setAuthCookie(res, token);

  res.json({
    message: 'Login successful',
    user,
  });
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout({ user: req.user, req });
  clearAuthCookie(res);

  res.json({
    message: 'Logged out successfully',
  });
});

const me = asyncHandler(async (req, res) => {
  res.json({
    user: req.user.toSafeObject(),
  });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.requestPasswordReset({
    email: req.body.email,
    req,
  });

  res.json(result);
});

const verifyOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifyPasswordResetOtp({
    email: req.body.email,
    otp: req.body.otp,
  });

  res.json(result);
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword({
    email: req.body.email,
    resetToken: req.body.resetToken,
    password: req.body.password,
    req,
  });

  res.json(result);
});

module.exports = {
  forgotPassword,
  login,
  logout,
  me,
  resetPassword,
  verifyOtp,
};
