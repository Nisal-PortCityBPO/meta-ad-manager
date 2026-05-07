const HttpError = require('../../app/utils/httpError');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const { BusinessProfile } = require('../business-profiles/businessProfile.model');
const SocialAccount = require('../social-accounts/socialAccount.model');
const Brand = require('./brand.model');

function validateBrand({ name, color }) {
  if (!name?.trim()) {
    throw new HttpError(400, 'Brand name is required');
  }

  if (!/^#[0-9a-fA-F]{6}$/.test(color || '')) {
    throw new HttpError(400, 'Brand color must be a valid hex color');
  }
}

async function listBrands() {
  const [brands, socialAccounts] = await Promise.all([
    Brand.find().sort({ name: 1 }),
    SocialAccount.find({ brand: { $ne: null } })
      .populate('agency', 'name')
      .populate('sourceToken', 'label connectionStatus connectionMessage lastConnectionCheckedAt')
      .sort({ name: 1 }),
  ]);
  const accountIds = socialAccounts.map((account) => account._id);
  const profiles = accountIds.length
    ? await BusinessProfile.find({ socialAccount: { $in: accountIds } })
        .select(
          'name metaBusinessId metaStatus metaStatusReason sourceTokenLabel socialAccount adAccountCount facebookPageCount campaignCount totalSpend spendCurrency assetMetricsStatus assetMetricsSyncedAt adAccounts lastSyncedAt lastStatusCheckedAt'
        )
        .sort({ name: 1 })
    : [];
  const profilesByAccount = new Map();

  profiles.forEach((profile) => {
    const accountId = profile.socialAccount?.toString();
    if (!accountId) {
      return;
    }

    if (!profilesByAccount.has(accountId)) {
      profilesByAccount.set(accountId, []);
    }

    profilesByAccount.get(accountId).push({
      id: profile._id.toString(),
      name: profile.name,
      metaBusinessId: profile.metaBusinessId,
      metaStatus: profile.metaStatus,
      metaStatusReason: profile.metaStatusReason,
      sourceTokenLabel: profile.sourceTokenLabel,
      adAccountCount: profile.adAccountCount || 0,
      facebookPageCount: profile.facebookPageCount || 0,
      campaignCount: profile.campaignCount || 0,
      totalSpend: profile.totalSpend || 0,
      spendCurrency: profile.spendCurrency || null,
      assetMetricsStatus: profile.assetMetricsStatus || 'UNKNOWN',
      assetMetricsSyncedAt: profile.assetMetricsSyncedAt,
      adAccounts: Array.isArray(profile.adAccounts)
        ? profile.adAccounts.map((account) => ({
            id: account.id,
            accountId: account.accountId,
            name: account.name,
            currency: account.currency,
            connectionStatus: account.connectionStatus || 'UNKNOWN',
            statusCode: account.statusCode,
            statusLabel: account.statusLabel || 'Unknown',
            campaignCount: account.campaignCount || 0,
            totalSpend: account.totalSpend || 0,
          }))
        : [],
      lastSyncedAt: profile.lastSyncedAt,
      lastStatusCheckedAt: profile.lastStatusCheckedAt,
    });
  });

  const socialAccountsByBrand = new Map();
  const agenciesByBrand = new Map();

  socialAccounts.forEach((account) => {
    const brandId = account.brand?.toString();
    if (!brandId) {
      return;
    }

    if (!socialAccountsByBrand.has(brandId)) {
      socialAccountsByBrand.set(brandId, []);
      agenciesByBrand.set(brandId, new Map());
    }

    const accountProfiles = profilesByAccount.get(account._id.toString()) || [];

    if (account.agency) {
      agenciesByBrand.get(brandId).set(account.agency._id.toString(), {
        id: account.agency._id.toString(),
        name: account.agency.name,
      });
    }

    socialAccountsByBrand.get(brandId).push({
      id: account._id.toString(),
      metaAccountId: account.metaAccountId,
      name: account.name,
      profileImageUrl: account.profileImageUrl,
      sourceTokenLabel: account.sourceToken?.label || account.sourceTokenLabel,
      connectionStatus: account.sourceToken?.connectionStatus || 'UNKNOWN',
      connectionMessage: account.sourceToken?.connectionMessage || null,
      lastConnectionCheckedAt: account.sourceToken?.lastConnectionCheckedAt || null,
      agency: account.agency
        ? {
            id: account.agency._id.toString(),
            name: account.agency.name,
          }
        : null,
      profileCount: accountProfiles.length,
      businessProfiles: accountProfiles,
      lastSyncedAt: account.lastSyncedAt,
    });
  });

  return brands.map((brand) => ({
    ...brand.toSafeObject(),
    socialAccountCount: socialAccountsByBrand.get(brand._id.toString())?.length || 0,
    agencyCount: agenciesByBrand.get(brand._id.toString())?.size || 0,
    assignedAgencies: Array.from(agenciesByBrand.get(brand._id.toString())?.values() || [])
      .sort((first, second) => first.name.localeCompare(second.name)),
    assignedSocialAccounts: socialAccountsByBrand.get(brand._id.toString()) || [],
  }));
}

async function createBrand({ name, color, actor, req }) {
  validateBrand({ name, color });

  const existingBrand = await Brand.findOne({ name: name.trim() });
  if (existingBrand) {
    throw new HttpError(409, 'A brand with this name already exists');
  }

  const brand = await Brand.create({
    name: name.trim(),
    color,
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  await writeActivityLog({
    user: actor,
    action: 'BRAND_CREATED',
    entity: 'Brand',
    entityId: brand._id.toString(),
    metadata: { name: brand.name },
    req,
  });

  return brand.toSafeObject();
}

async function updateBrand({ brandId, name, color, actor, req }) {
  validateBrand({ name, color });

  const brand = await Brand.findById(brandId);
  if (!brand) {
    throw new HttpError(404, 'Brand not found');
  }

  const existingBrand = await Brand.findOne({ name: name.trim(), _id: { $ne: brand._id } });
  if (existingBrand) {
    throw new HttpError(409, 'A brand with this name already exists');
  }

  brand.name = name.trim();
  brand.color = color;
  brand.updatedBy = actor._id;
  await brand.save();

  await writeActivityLog({
    user: actor,
    action: 'BRAND_UPDATED',
    entity: 'Brand',
    entityId: brand._id.toString(),
    metadata: { name: brand.name },
    req,
  });

  return brand.toSafeObject();
}

async function deleteBrand({ brandId, actor, req }) {
  const brand = await Brand.findById(brandId);
  if (!brand) {
    throw new HttpError(404, 'Brand not found');
  }

  await brand.deleteOne();

  await writeActivityLog({
    user: actor,
    action: 'BRAND_DELETED',
    entity: 'Brand',
    entityId: brand._id.toString(),
    metadata: { name: brand.name },
    req,
  });
}

module.exports = {
  createBrand,
  deleteBrand,
  listBrands,
  updateBrand,
};
