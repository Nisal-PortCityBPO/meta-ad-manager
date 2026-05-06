const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const HttpError = require('../../app/utils/httpError');
const { createAuthToken, getJwtSecret } = require('../../app/middleware/auth');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const { User } = require('../users/user.model');
const { generateOtp, normalizeEmail, validatePassword } = require('./auth.helpers');

async function login({ email, password, req }) {
  const user = await User.findOne({ email: normalizeEmail(email) });

  if (!user) {
    throw new HttpError(401, 'Invalid email or password');
  }

  if (user.status !== 'ACTIVE') {
    throw new HttpError(403, 'This account is inactive');
  }

  const isMatch = await bcrypt.compare(password || '', user.passwordHash);

  if (!isMatch) {
    throw new HttpError(401, 'Invalid email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();

  await writeActivityLog({
    user,
    action: 'LOGIN',
    entity: 'Auth',
    req,
  });

  return {
    token: createAuthToken(user),
    user: user.toSafeObject(),
  };
}

async function logout({ user, req }) {
  if (user) {
    await writeActivityLog({
      user,
      action: 'LOGOUT',
      entity: 'Auth',
      req,
    });
  }
}

async function requestPasswordReset({ email, req }) {
  const user = await User.findOne({ email: normalizeEmail(email), status: 'ACTIVE' });
  const message = 'If the email exists, a 6 digit OTP has been sent';

  if (!user) {
    return { message };
  }

  const otp = generateOtp();
  user.passwordResetOtpHash = await bcrypt.hash(otp, 10);
  user.passwordResetExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  user.passwordResetVerifiedAt = null;
  await user.save();

  await writeActivityLog({
    user,
    action: 'PASSWORD_RESET_OTP_REQUESTED',
    entity: 'Auth',
    req,
  });

  return {
    message,
    devOtp: otp,
  };
}

async function verifyPasswordResetOtp({ email, otp }) {
  const user = await User.findOne({ email: normalizeEmail(email), status: 'ACTIVE' });

  if (!user || !user.passwordResetOtpHash || !user.passwordResetExpiresAt) {
    throw new HttpError(400, 'Invalid or expired OTP');
  }

  if (user.passwordResetExpiresAt.getTime() < Date.now()) {
    throw new HttpError(400, 'Invalid or expired OTP');
  }

  const isMatch = await bcrypt.compare(otp || '', user.passwordResetOtpHash);

  if (!isMatch) {
    throw new HttpError(400, 'Invalid or expired OTP');
  }

  user.passwordResetVerifiedAt = new Date();
  await user.save();

  const resetToken = jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      purpose: 'password-reset',
      tokenVersion: user.tokenVersion,
    },
    getJwtSecret(),
    { expiresIn: '10m' }
  );

  return {
    resetToken,
    message: 'OTP verified',
  };
}

async function resetPassword({ email, resetToken, password, req }) {
  if (!validatePassword(password)) {
    throw new HttpError(400, 'Password must be at least 8 characters');
  }

  let payload;
  try {
    payload = jwt.verify(resetToken, getJwtSecret());
  } catch (error) {
    throw new HttpError(400, 'Reset session expired, please request a new OTP');
  }

  if (payload.purpose !== 'password-reset' || payload.email !== normalizeEmail(email)) {
    throw new HttpError(400, 'Reset session is invalid');
  }

  const user = await User.findById(payload.sub);

  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== payload.tokenVersion) {
    throw new HttpError(400, 'Reset session is invalid');
  }

  user.passwordHash = await bcrypt.hash(password, 12);
  user.tokenVersion += 1;
  user.passwordResetOtpHash = null;
  user.passwordResetExpiresAt = null;
  user.passwordResetVerifiedAt = null;
  await user.save();

  await writeActivityLog({
    user,
    action: 'PASSWORD_RESET_COMPLETED',
    entity: 'Auth',
    req,
  });

  return {
    message: 'Password updated successfully',
  };
}

module.exports = {
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetOtp,
};
