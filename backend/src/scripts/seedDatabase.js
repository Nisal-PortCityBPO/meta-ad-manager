const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const connectDB = require('../app/config/db');
const { writeActivityLog } = require('../modules/activity-logs/activityLog.service');
const { User, USER_ROLES } = require('../modules/users/user.model');

dotenv.config();

function getSuperAdminSeed() {
  return {
    name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
    email: (process.env.SUPER_ADMIN_EMAIL || 'superadmin@meat.local').trim().toLowerCase(),
    password: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!',
    role: USER_ROLES.SUPER_ADMIN,
  };
}

async function ensureSuperAdmin() {
  const superAdminSeed = getSuperAdminSeed();

  const existingSuperAdmin = await User.findOne({ role: USER_ROLES.SUPER_ADMIN }).sort({ createdAt: 1 });
  if (existingSuperAdmin) {
    return existingSuperAdmin;
  }

  const existingUser = await User.findOne({ email: superAdminSeed.email });
  if (existingUser) {
    existingUser.role = USER_ROLES.SUPER_ADMIN;
    existingUser.status = 'ACTIVE';
    await existingUser.save();

    return existingUser;
  }

  const user = await User.create({
    name: superAdminSeed.name,
    email: superAdminSeed.email,
    passwordHash: await bcrypt.hash(superAdminSeed.password, 12),
    role: superAdminSeed.role,
  });

  await writeActivityLog({
    user,
    action: 'SUPER_ADMIN_SEEDED',
    entity: 'User',
    entityId: user._id.toString(),
  });

  console.log(`Super admin seeded: ${superAdminSeed.email}`);
  return user;
}

async function seedDatabase() {
  const superAdmin = await ensureSuperAdmin();

  return {
    superAdmin,
  };
}

if (require.main === module) {
  connectDB()
    .then(seedDatabase)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Database seed failed:', error);
      process.exit(1);
    });
}

module.exports = {
  ensureSuperAdmin,
  seedDatabase,
};
