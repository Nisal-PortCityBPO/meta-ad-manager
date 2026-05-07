const mongoose = require('mongoose');

const BUSINESS_PROFILE_META_STATUSES = Object.freeze({
  CONNECTED: 'CONNECTED',
  DISABLED: 'DISABLED',
  UNKNOWN: 'UNKNOWN',
});

const BUSINESS_PROFILE_ASSET_METRIC_STATUSES = Object.freeze({
  SYNCED: 'SYNCED',
  UNKNOWN: 'UNKNOWN',
});

const LEGACY_META_STATUSES = Object.freeze({
  ACTIVE: BUSINESS_PROFILE_META_STATUSES.CONNECTED,
  BLOCKED: BUSINESS_PROFILE_META_STATUSES.DISABLED,
});

const businessProfileSchema = new mongoose.Schema(
  {
    metaBusinessId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    verificationStatus: {
      type: String,
      default: null,
    },
    metaStatus: {
      type: String,
      enum: Object.values(BUSINESS_PROFILE_META_STATUSES),
      default: BUSINESS_PROFILE_META_STATUSES.UNKNOWN,
    },
    metaStatusReason: {
      type: String,
      default: null,
    },
    isDisabledForIntegrityReasons: {
      type: Boolean,
      default: null,
    },
    lastStatusCheckedAt: {
      type: Date,
      default: null,
    },
    sourceToken: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Token',
      default: null,
    },
    sourceTokenLabel: {
      type: String,
      default: null,
    },
    socialAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SocialAccount',
      default: null,
    },
    socialAccountName: {
      type: String,
      default: null,
    },
    adAccountCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    facebookPageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    campaignCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalSpend: {
      type: Number,
      default: 0,
      min: 0,
    },
    spendCurrency: {
      type: String,
      default: null,
    },
    assetMetricsStatus: {
      type: String,
      enum: Object.values(BUSINESS_PROFILE_ASSET_METRIC_STATUSES),
      default: BUSINESS_PROFILE_ASSET_METRIC_STATUSES.UNKNOWN,
    },
    assetMetricsSyncedAt: {
      type: Date,
      default: null,
    },
    adAccounts: {
      type: [
        {
          _id: false,
          id: {
            type: String,
            default: null,
          },
          accountId: {
            type: String,
            default: null,
          },
          name: {
            type: String,
            default: null,
          },
          currency: {
            type: String,
            default: null,
          },
          connectionStatus: {
            type: String,
            enum: ['ACTIVE', 'BLOCKED', 'UNKNOWN'],
            default: 'UNKNOWN',
          },
          statusCode: {
            type: Number,
            default: null,
          },
          statusLabel: {
            type: String,
            default: 'Unknown',
          },
          campaignCount: {
            type: Number,
            default: 0,
            min: 0,
          },
          totalSpend: {
            type: Number,
            default: 0,
            min: 0,
          },
          campaigns: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
          },
          hierarchySyncedAt: {
            type: Date,
            default: null,
          },
        },
      ],
      default: [],
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      default: null,
    },
    agency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agency',
      default: null,
    },
    rawMetaData: {
      type: Object,
      default: {},
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

businessProfileSchema.index({ name: 1 });
businessProfileSchema.index({ sourceTokenLabel: 1 });
businessProfileSchema.index({ socialAccount: 1, name: 1 });
businessProfileSchema.index({ socialAccountName: 1 });
businessProfileSchema.index({ brand: 1, name: 1 });
businessProfileSchema.index({ agency: 1, name: 1 });

businessProfileSchema.pre('validate', function normalizeLegacyMetaStatus() {
  if (LEGACY_META_STATUSES[this.metaStatus]) {
    this.metaStatus = LEGACY_META_STATUSES[this.metaStatus];
  }
});

businessProfileSchema.methods.toSafeObject = function toSafeObject() {
  const socialAccountId = this.socialAccount?._id?.toString?.() || this.socialAccount?.toString?.() || null;
  const socialAccountName = this.socialAccount?.name || this.socialAccountName || null;

  return {
    id: this._id.toString(),
    metaBusinessId: this.metaBusinessId,
    name: this.name,
    verificationStatus: this.verificationStatus,
    metaStatus: LEGACY_META_STATUSES[this.metaStatus] || this.metaStatus,
    metaStatusReason: this.metaStatusReason,
    isDisabledForIntegrityReasons: this.isDisabledForIntegrityReasons,
    lastStatusCheckedAt: this.lastStatusCheckedAt,
    sourceTokenLabel: this.sourceTokenLabel,
    adAccountCount: this.adAccountCount || 0,
    facebookPageCount: this.facebookPageCount || 0,
    campaignCount: this.campaignCount || 0,
    totalSpend: this.totalSpend || 0,
    spendCurrency: this.spendCurrency,
    assetMetricsStatus: this.assetMetricsStatus || BUSINESS_PROFILE_ASSET_METRIC_STATUSES.UNKNOWN,
    assetMetricsSyncedAt: this.assetMetricsSyncedAt,
    adAccounts: Array.isArray(this.adAccounts)
      ? this.adAccounts.map((account) => ({
          id: account.id,
          accountId: account.accountId,
          name: account.name,
          currency: account.currency,
          connectionStatus: account.connectionStatus || 'UNKNOWN',
          statusCode: account.statusCode,
          statusLabel: account.statusLabel || 'Unknown',
          campaignCount: account.campaignCount || 0,
          totalSpend: account.totalSpend || 0,
          campaigns: Array.isArray(account.campaigns) ? account.campaigns : [],
          hierarchySyncedAt: account.hierarchySyncedAt || null,
        }))
      : [],
    socialAccount: socialAccountId || socialAccountName
      ? {
          id: socialAccountId,
          name: socialAccountName,
        }
      : null,
    lastSyncedAt: this.lastSyncedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const BusinessProfile =
  mongoose.models.BusinessProfile || mongoose.model('BusinessProfile', businessProfileSchema);

module.exports = {
  BusinessProfile,
  BUSINESS_PROFILE_ASSET_METRIC_STATUSES,
  BUSINESS_PROFILE_META_STATUSES,
};
