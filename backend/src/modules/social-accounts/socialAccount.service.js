const mongoose = require('mongoose');
const HttpError = require('../../app/utils/httpError');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const Agency = require('../agencies/agency.model');
const Brand = require('../brands/brand.model');
const { BusinessProfile } = require('../business-profiles/businessProfile.model');
const SocialAccount = require('./socialAccount.model');

const PAGE_LIMITS = [5, 10, 20];

function normalizePagination({ page = 1, limit = 5 } = {}) {
  const normalizedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const parsedLimit = Number.parseInt(limit, 10) || 5;
  const normalizedLimit = PAGE_LIMITS.includes(parsedLimit) ? parsedLimit : 5;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function objectIdOrNoMatch(value) {
  return mongoose.Types.ObjectId.isValid(value) ? value : null;
}

function buildSocialAccountQuery({ search, tokenLabel, brandId, agencyId } = {}) {
  const query = {};

  if (search?.trim()) {
    query.name = { $regex: escapeRegExp(search.trim()), $options: 'i' };
  }

  if (tokenLabel?.trim()) {
    query.sourceTokenLabel = tokenLabel.trim();
  }

  if (brandId?.trim()) {
    const normalizedBrandId = objectIdOrNoMatch(brandId.trim());
    query.brand = normalizedBrandId || null;

    if (!normalizedBrandId) {
      query._id = null;
    }
  }

  if (agencyId?.trim()) {
    const normalizedAgencyId = objectIdOrNoMatch(agencyId.trim());
    query.agency = normalizedAgencyId || null;

    if (!normalizedAgencyId) {
      query._id = null;
    }
  }

  return query;
}

async function getSocialAccountFilterOptions() {
  const tokenLabels = await SocialAccount.distinct('sourceTokenLabel');

  return {
    tokenLabels: tokenLabels.filter(Boolean).sort((first, second) => first.localeCompare(second)),
  };
}

async function getProfileCounts(accountIds) {
  if (!accountIds.length) {
    return new Map();
  }

  const counts = await BusinessProfile.aggregate([
    {
      $match: {
        socialAccount: { $in: accountIds },
      },
    },
    {
      $group: {
        _id: '$socialAccount',
        count: { $sum: 1 },
      },
    },
  ]);

  return new Map(counts.map((item) => [item._id.toString(), item.count]));
}

async function listSocialAccounts(filters = {}) {
  const { page, limit } = normalizePagination(filters);
  const query = buildSocialAccountQuery(filters);
  const [total, filterOptions] = await Promise.all([
    SocialAccount.countDocuments(query),
    getSocialAccountFilterOptions(),
  ]);
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const currentPage = Math.min(page, totalPages);
  const skip = (currentPage - 1) * limit;
  const accounts = await SocialAccount.find(query)
    .populate('brand', 'name color')
    .populate('agency', 'name')
    .populate('sourceToken', 'label adsPowerProfile status profileAccessTokenStatus systemUserAccessTokenStatus connectionStatus connectionMessage lastConnectionCheckedAt')
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit);
  const profileCounts = await getProfileCounts(accounts.map((account) => account._id));

  return {
    socialAccounts: accounts.map((account) =>
      account.toSafeObject({
        profileCount: profileCounts.get(account._id.toString()) || 0,
      })
    ),
    pagination: {
      page: currentPage,
      limit,
      total,
      totalPages,
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages,
    },
    filterOptions,
  };
}

async function validateAssignment({ brandId, agencyId }) {
  if (brandId) {
    const brand = await Brand.findById(brandId);
    if (!brand) {
      throw new HttpError(404, 'Brand not found');
    }
  }

  if (agencyId) {
    const agency = await Agency.findById(agencyId);
    if (!agency) {
      throw new HttpError(404, 'Agency not found');
    }
  }
}

async function assignSocialAccount({ accountId, brandId, agencyId, actor, req }) {
  const account = await SocialAccount.findById(accountId);
  if (!account) {
    throw new HttpError(404, 'Social account not found');
  }

  await validateAssignment({ brandId, agencyId });

  account.brand = brandId || null;
  account.agency = agencyId || null;
  await account.save();

  await BusinessProfile.updateMany(
    { socialAccount: account._id },
    {
      $set: {
        brand: null,
        agency: null,
      },
    }
  );

  await writeActivityLog({
    user: actor,
    action: 'SOCIAL_ACCOUNT_ASSIGNED',
    entity: 'SocialAccount',
    entityId: account._id.toString(),
    metadata: {
      name: account.name,
      brandId: brandId || null,
      agencyId: agencyId || null,
    },
    req,
  });

  const populated = await SocialAccount.findById(account._id)
    .populate('brand', 'name color')
    .populate('agency', 'name')
    .populate('sourceToken', 'label adsPowerProfile status profileAccessTokenStatus systemUserAccessTokenStatus connectionStatus connectionMessage lastConnectionCheckedAt');
  const profileCounts = await getProfileCounts([account._id]);

  return populated.toSafeObject({
    profileCount: profileCounts.get(account._id.toString()) || 0,
  });
}

async function upsertSocialAccountFromMeta({ metaAccount, token, syncedAt }) {
  const existingAccount = await SocialAccount.findOne({ metaAccountId: metaAccount.id });

  if (!existingAccount) {
    const account = await SocialAccount.create({
      metaAccountId: metaAccount.id,
      name: metaAccount.name || `Social account ${metaAccount.id}`,
      profileImageUrl: metaAccount.profileImageUrl || null,
      sourceToken: token.id,
      sourceTokenLabel: token.label,
      brand: token.brandId || null,
      agency: token.agencyId || null,
      rawMetaData: metaAccount,
      lastSyncedAt: syncedAt,
    });

    return {
      account,
      result: 'created',
    };
  }

  const changed =
    existingAccount.name !== (metaAccount.name || existingAccount.name) ||
    existingAccount.profileImageUrl !== (metaAccount.profileImageUrl || null) ||
    existingAccount.sourceToken?.toString() !== token.id ||
    existingAccount.sourceTokenLabel !== token.label ||
    existingAccount.brand?.toString() !== (token.brandId || '') ||
    existingAccount.agency?.toString() !== (token.agencyId || '');

  existingAccount.name = metaAccount.name || existingAccount.name;
  existingAccount.profileImageUrl = metaAccount.profileImageUrl || null;
  existingAccount.sourceToken = token.id;
  existingAccount.sourceTokenLabel = token.label;
  existingAccount.brand = token.brandId || null;
  existingAccount.agency = token.agencyId || null;
  existingAccount.rawMetaData = metaAccount;
  existingAccount.lastSyncedAt = syncedAt;
  await existingAccount.save();

  return {
    account: existingAccount,
    result: changed ? 'updated' : 'skipped',
  };
}

async function countSocialAccounts() {
  return SocialAccount.countDocuments();
}

module.exports = {
  assignSocialAccount,
  countSocialAccounts,
  listSocialAccounts,
  upsertSocialAccountFromMeta,
};
