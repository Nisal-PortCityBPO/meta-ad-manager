const bcrypt = require('bcryptjs');
const HttpError = require('../../app/utils/httpError');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const { normalizeEmail, validatePassword } = require('../auth/auth.helpers');
const { User, USER_ROLES, USER_STATUSES } = require('./user.model');

async function listUsers() {
  const users = await User.find().sort({ createdAt: -1 });
  return users.map((user) => user.toSafeObject());
}

async function createAdmin({ name, email, password, actor, req }) {
  if (!name?.trim()) {
    throw new HttpError(400, 'Name is required');
  }

  if (!normalizeEmail(email)) {
    throw new HttpError(400, 'Email is required');
  }

  if (!validatePassword(password)) {
    throw new HttpError(400, 'Password must be at least 8 characters');
  }

  const existingUser = await User.findOne({ email: normalizeEmail(email) });
  if (existingUser) {
    throw new HttpError(409, 'A user with this email already exists');
  }

  const user = await User.create({
    name: name.trim(),
    email: normalizeEmail(email),
    passwordHash: await bcrypt.hash(password, 12),
    role: USER_ROLES.ADMIN,
    createdBy: actor._id,
  });

  await writeActivityLog({
    user: actor,
    action: 'ADMIN_CREATED',
    entity: 'User',
    entityId: user._id.toString(),
    metadata: {
      createdUserEmail: user.email,
    },
    req,
  });

  return user.toSafeObject();
}

async function updateUserStatus({ userId, status, actor, req }) {
  if (!Object.values(USER_STATUSES).includes(status)) {
    throw new HttpError(400, 'Invalid user status');
  }

  if (actor._id.toString() === userId) {
    throw new HttpError(400, 'You cannot change your own status');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  if (user.role === USER_ROLES.SUPER_ADMIN) {
    throw new HttpError(400, 'Super admin status cannot be changed here');
  }

  user.status = status;
  user.tokenVersion += 1;
  await user.save();

  await writeActivityLog({
    user: actor,
    action: `USER_${status}`,
    entity: 'User',
    entityId: user._id.toString(),
    metadata: {
      updatedUserEmail: user.email,
    },
    req,
  });

  return user.toSafeObject();
}

async function verifySuperAdminPassword({ password, actor }) {
  if (!password) {
    throw new HttpError(400, 'Super admin password is required');
  }

  const superAdmin = await User.findById(actor._id);
  if (!superAdmin || superAdmin.role !== USER_ROLES.SUPER_ADMIN) {
    throw new HttpError(403, 'Only super admin can verify this action');
  }

  const passwordMatches = await bcrypt.compare(password, superAdmin.passwordHash);
  if (!passwordMatches) {
    throw new HttpError(401, 'Super admin password is incorrect');
  }

  return true;
}

async function resetAdminPassword({ userId, superAdminPassword, newPassword, actor, req }) {
  await verifySuperAdminPassword({
    password: superAdminPassword,
    actor,
  });

  if (!validatePassword(newPassword)) {
    throw new HttpError(400, 'New password must be at least 8 characters');
  }

  if (actor._id.toString() === userId) {
    throw new HttpError(400, 'You cannot reset your own password here');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  if (user.role !== USER_ROLES.ADMIN) {
    throw new HttpError(400, 'Only admin passwords can be reset here');
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordResetOtpHash = null;
  user.passwordResetExpiresAt = null;
  user.passwordResetVerifiedAt = null;
  user.tokenVersion += 1;
  await user.save();

  await writeActivityLog({
    user: actor,
    action: 'ADMIN_PASSWORD_RESET',
    entity: 'User',
    entityId: user._id.toString(),
    metadata: {
      resetUserEmail: user.email,
    },
    req,
  });

  return user.toSafeObject();
}

module.exports = {
  createAdmin,
  listUsers,
  resetAdminPassword,
  updateUserStatus,
  verifySuperAdminPassword,
};
