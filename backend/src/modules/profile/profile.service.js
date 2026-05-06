const bcrypt = require('bcryptjs');
const HttpError = require('../../app/utils/httpError');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const { normalizeEmail, validatePassword } = require('../auth/auth.helpers');
const { User } = require('../users/user.model');

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function updateProfile({ user, name, email, req }) {
  if (!name?.trim()) {
    throw new HttpError(400, 'Name is required');
  }

  const nextEmail = normalizeEmail(email);
  if (!nextEmail) {
    throw new HttpError(400, 'Email is required');
  }

  if (!validateEmail(nextEmail)) {
    throw new HttpError(400, 'Please enter a valid email address');
  }

  if (nextEmail !== user.email) {
    const existingUser = await User.findOne({ email: nextEmail, _id: { $ne: user._id } });
    if (existingUser) {
      throw new HttpError(409, 'A user with this email already exists');
    }
  }

  const previousEmail = user.email;
  user.name = name.trim();
  user.email = nextEmail;
  await user.save();

  await writeActivityLog({
    user,
    action: 'PROFILE_UPDATED',
    entity: 'Profile',
    metadata: {
      previousEmail,
      updatedEmail: nextEmail,
    },
    req,
  });

  return user.toSafeObject();
}

async function changePassword({ user, currentPassword, newPassword, req }) {
  if (!validatePassword(newPassword)) {
    throw new HttpError(400, 'New password must be at least 8 characters');
  }

  const isMatch = await bcrypt.compare(currentPassword || '', user.passwordHash);
  if (!isMatch) {
    throw new HttpError(400, 'Current password is incorrect');
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.tokenVersion += 1;
  await user.save();

  await writeActivityLog({
    user,
    action: 'PASSWORD_CHANGED',
    entity: 'Profile',
    req,
  });

  return { message: 'Password changed successfully' };
}

module.exports = {
  changePassword,
  updateProfile,
};
