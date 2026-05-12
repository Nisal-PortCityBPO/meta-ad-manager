const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const connectDB = require('../app/config/db');
const { writeActivityLog } = require('../modules/activity-logs/activityLog.service');
const { seedProtectedFooter } = require('../modules/system-integrity/systemIntegrity.service');
const { User, USER_ROLES } = require('../modules/users/user.model');

dotenv.config();

const protectedFooterSeed = {
  marker: '200M_PROTECTED_FOOTER_V1',
  company: '200M',
  copyrightLabel: 'Copyright',
  copyrightSymbol: '\u00a9',
  startYear: 2026,
  rightsText: 'All rights reserved.',
  developedByLabel: 'Developed By',
  team: '200M SL IT Team',
  productFromLabel: 'Product From',
  flagAlt: 'Sri Lankan flag',
  domId: 'm2m-protected-footer',
  proofId: 'm2m-protected-footer-proof',
};

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
  const protectedFooter = await seedProtectedFooter(protectedFooterSeed);

  return {
    protectedFooter,
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
