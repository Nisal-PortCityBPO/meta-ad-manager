const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const connectDB = require('../app/config/db');
const { writeActivityLog } = require('../modules/activity-logs/activityLog.service');
const Brand = require('../modules/brands/brand.model');
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

const brandSeeds = [
  { name: 'DEPO89', color: '#b40586' },
  { name: 'P200M', color: '#01ddff' },
  { name: 'J200M', color: '#348803' },
  { name: 'A200M', color: '#039984' },
  { name: 'Y200M', color: '#260040' },
  { name: 'FUFUSLOT', color: '#ff6c00' },
  { name: 'MADURA88', color: '#400000' },
  { name: 'BONASLOT', color: '#305d82' },
  { name: 'JOS007', color: '#0d3200' },
  { name: 'B200M', color: '#305d82' },
  { name: 'C200M', color: '#67c700' },
  { name: 'K200M', color: '#00e0ba' },
  { name: 'PASTI200M', color: '#b40586' },
  { name: 'F200M', color: '#fede9d' },
  { name: 'G200M', color: '#f60002' },
  { name: 'D200M', color: '#00ff83' },
  { name: 'E200M', color: '#fc7e03' },
  { name: 'SUPER89', color: '#ff0000' },
  { name: 'TOP111', color: '#fede9d' },
  { name: 'PADUKA500', color: '#039984' },
  { name: 'NUSA211', color: '#9d7e39' },
  { name: 'TIKET100', color: '#d6b851' },
  { name: 'TIKET200', color: '#63fe4c' },
  { name: 'TIKET300', color: '#85b8ff' },
  { name: 'ASIA100', color: '#ff7f7d' },
  { name: 'ASIA200', color: '#ffc95c' },
  { name: 'ASIA300', color: '#fe3bff' },
  { name: 'ASIA400', color: '#e693b7' },
];

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

async function ensureSeedBrands(actor) {
  let createdCount = 0;
  let updatedCount = 0;

  for (const seed of brandSeeds) {
    const existingBrand = await Brand.findOne({ name: seed.name });

    if (!existingBrand) {
      await Brand.create({
        name: seed.name,
        color: seed.color,
        createdBy: actor?._id || null,
      });
      createdCount += 1;
      continue;
    }

    if (existingBrand.color !== seed.color) {
      existingBrand.color = seed.color;
      existingBrand.updatedBy = actor?._id || null;
      await existingBrand.save();
      updatedCount += 1;
    }
  }

  console.log(`Brands seeded: ${createdCount} created, ${updatedCount} updated`);
  return Brand.find({ name: { $in: brandSeeds.map((seed) => seed.name) } }).sort({ name: 1 });
}

async function seedDatabase() {
  const superAdmin = await ensureSuperAdmin();
  const brands = await ensureSeedBrands(superAdmin);
  const protectedFooter = await seedProtectedFooter(protectedFooterSeed);

  return {
    brands,
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
  ensureSeedBrands,
  ensureSuperAdmin,
  seedDatabase,
};
