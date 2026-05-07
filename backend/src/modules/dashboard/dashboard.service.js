const ActivityLog = require('../activity-logs/activityLog.model');
const Agency = require('../agencies/agency.model');
const Brand = require('../brands/brand.model');
const { BusinessProfile } = require('../business-profiles/businessProfile.model');
const socialAccountService = require('../social-accounts/socialAccount.service');
const { Token } = require('../token-management/token.model');
const { User, USER_ROLES } = require('../users/user.model');

async function getDashboard(user) {
  const recentLogs = await ActivityLog.find({
    ...(user.role === USER_ROLES.SUPER_ADMIN ? {} : { actor: user._id }),
  })
    .sort({ createdAt: -1 })
    .limit(5);

  const base = {
    role: user.role,
    user: user.toSafeObject(),
    recentLogs: recentLogs.map((log) => ({
      id: log._id.toString(),
      action: log.action,
      entity: log.entity,
      createdAt: log.createdAt,
    })),
  };

  const [brandCount, agencyCount, accessTokenCount, socialAccountCount, businessProfileCount] = await Promise.all([
    Brand.countDocuments(),
    Agency.countDocuments(),
    Token.countDocuments(),
    socialAccountService.countSocialAccounts(),
    BusinessProfile.countDocuments(),
  ]);

  if (user.role !== USER_ROLES.SUPER_ADMIN) {
    return {
      ...base,
      metrics: {
        brands: brandCount,
        agencies: agencyCount,
        accessTokens: accessTokenCount,
        socialAccounts: socialAccountCount,
        businessProfiles: businessProfileCount,
      },
    };
  }

  const [totalUsers, activeUsers, totalLogs] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: 'ACTIVE' }),
    ActivityLog.countDocuments(),
  ]);

  return {
    ...base,
    metrics: {
      brands: brandCount,
      agencies: agencyCount,
      accessTokens: accessTokenCount,
      socialAccounts: socialAccountCount,
      businessProfiles: businessProfileCount,
      totalUsers,
      activeUsers,
      totalLogs,
    },
  };
}

module.exports = {
  getDashboard,
};
