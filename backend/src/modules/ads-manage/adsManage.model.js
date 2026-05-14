const mongoose = require('mongoose');

const metaIdSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: '',
      trim: true,
    },
    name: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const adAccountSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: '',
      trim: true,
    },
    accountId: {
      type: String,
      default: '',
      trim: true,
    },
    name: {
      type: String,
      default: '',
      trim: true,
    },
    currency: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const budgetSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      default: 'Ad set',
      trim: true,
    },
    amount: {
      type: String,
      default: '',
      trim: true,
    },
    currency: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const insightsSchema = new mongoose.Schema(
  {
    spend: {
      type: String,
      default: '0',
    },
    impressions: {
      type: String,
      default: '0',
    },
    reach: {
      type: String,
      default: '0',
    },
    clicks: {
      type: String,
      default: '0',
    },
    ctr: {
      type: String,
      default: '0',
    },
    cpc: {
      type: String,
      default: '0',
    },
    cpm: {
      type: String,
      default: '0',
    },
  },
  {
    _id: false,
  }
);

const creativeAssetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: '',
      trim: true,
    },
    type: {
      type: String,
      default: '',
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    _id: false,
  }
);

const launchDetailsSchema = new mongoose.Schema(
  {
    launchLabel: {
      type: String,
      default: '',
      trim: true,
    },
    launchItemId: {
      type: String,
      default: '',
      trim: true,
    },
    bulkId: {
      type: String,
      default: '',
      trim: true,
    },
    bulkLabel: {
      type: String,
      default: '',
      trim: true,
    },
    bulkSource: {
      type: String,
      default: '',
      trim: true,
    },
    templateId: {
      type: String,
      default: '',
      trim: true,
    },
    campaignTemplateId: {
      type: String,
      default: '',
      trim: true,
    },
    mediaTemplateId: {
      type: String,
      default: '',
      trim: true,
    },
    mediaAssetId: {
      type: String,
      default: '',
      trim: true,
    },
    thumbnailAssetId: {
      type: String,
      default: '',
      trim: true,
    },
    brandId: {
      type: String,
      default: '',
      trim: true,
    },
    brandName: {
      type: String,
      default: '',
      trim: true,
    },
    countries: {
      type: [String],
      default: [],
    },
    countryLabel: {
      type: String,
      default: '',
      trim: true,
    },
    dailyBudget: {
      type: String,
      default: '',
      trim: true,
    },
    page: {
      type: metaIdSchema,
      default: () => ({}),
    },
    pixel: {
      type: metaIdSchema,
      default: () => ({}),
    },
    websiteEvent: {
      type: String,
      default: '',
      trim: true,
    },
    headline: {
      type: String,
      default: '',
      trim: true,
    },
    primaryText: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    websiteUrl: {
      type: String,
      default: '',
      trim: true,
    },
    displayUrl: {
      type: String,
      default: '',
      trim: true,
    },
    urlParameters: {
      type: String,
      default: '',
      trim: true,
    },
    scheduleStart: {
      type: String,
      default: '',
      trim: true,
    },
    scheduleEnd: {
      type: String,
      default: '',
      trim: true,
    },
    callToAction: {
      type: String,
      default: '',
      trim: true,
    },
    media: {
      type: creativeAssetSchema,
      default: null,
    },
    thumbnail: {
      type: creativeAssetSchema,
      default: null,
    },
    staticDefaults: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    retryPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const actionHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      default: '',
      trim: true,
    },
    message: {
      type: String,
      default: '',
      trim: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

const publishQueueSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      default: 'NONE',
      trim: true,
      index: true,
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
    tokenType: {
      type: String,
      default: '',
      trim: true,
    },
    source: {
      type: String,
      default: '',
      trim: true,
    },
    queuedAt: {
      type: Date,
      default: null,
    },
    nextAttemptAt: {
      type: Date,
      default: null,
    },
    runningStartedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    clearedAt: {
      type: Date,
      default: null,
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: '',
      trim: true,
    },
    queuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    _id: false,
  }
);

const managedCampaignSchema = new mongoose.Schema(
  {
    tokenId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    tokenLabel: {
      type: String,
      default: '',
      trim: true,
    },
    campaignId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      default: 'PAUSED',
      trim: true,
      index: true,
    },
    effectiveStatus: {
      type: String,
      default: 'PAUSED',
      trim: true,
    },
    objective: {
      type: String,
      default: '',
      trim: true,
    },
    buyingType: {
      type: String,
      default: 'AUCTION',
      trim: true,
    },
    adAccount: {
      type: adAccountSchema,
      default: () => ({}),
    },
    adSetId: {
      type: String,
      default: '',
      trim: true,
    },
    adSetName: {
      type: String,
      default: '',
      trim: true,
    },
    creativeId: {
      type: String,
      default: '',
      trim: true,
    },
    creativeName: {
      type: String,
      default: '',
      trim: true,
    },
    adId: {
      type: String,
      default: '',
      trim: true,
    },
    adName: {
      type: String,
      default: '',
      trim: true,
    },
    budget: {
      type: budgetSchema,
      default: () => ({}),
    },
    budgetRemaining: {
      type: String,
      default: '',
      trim: true,
    },
    spendCap: {
      type: String,
      default: '',
      trim: true,
    },
    insights: {
      type: insightsSchema,
      default: () => ({}),
    },
    specialAdCategories: {
      type: [String],
      default: [],
    },
    launch: {
      type: launchDetailsSchema,
      default: () => ({}),
    },
    source: {
      type: String,
      default: 'ADS_LAUNCH',
      trim: true,
    },
    duplicatedFromCampaignId: {
      type: String,
      default: '',
      trim: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    lastActionAt: {
      type: Date,
      default: null,
    },
    lastMetaError: {
      type: String,
      default: '',
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actionHistory: {
      type: [actionHistorySchema],
      default: [],
    },
    publishQueue: {
      type: publishQueueSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

managedCampaignSchema.index({ tokenId: 1, 'adAccount.id': 1, status: 1 });
managedCampaignSchema.index({ tokenId: 1, updatedAt: -1 });
managedCampaignSchema.index({ 'publishQueue.status': 1, 'publishQueue.nextAttemptAt': 1 });

managedCampaignSchema.methods.toSafeObject = function toSafeObject() {
  return {
    recordId: this._id.toString(),
    id: this.campaignId,
    campaignId: this.campaignId,
    name: this.name,
    tokenId: this.tokenId,
    tokenLabel: this.tokenLabel,
    status: this.status,
    effectiveStatus: this.effectiveStatus,
    objective: this.objective,
    buyingType: this.buyingType,
    adAccount: this.adAccount,
    adSetId: this.adSetId,
    adSetName: this.adSetName,
    creativeId: this.creativeId,
    creativeName: this.creativeName,
    adId: this.adId,
    adName: this.adName,
    budget: this.budget,
    budgetRemaining: this.budgetRemaining,
    spendCap: this.spendCap,
    insights: this.insights,
    specialAdCategories: this.specialAdCategories,
    launch: this.launch,
    source: this.source,
    duplicatedFromCampaignId: this.duplicatedFromCampaignId,
    deletedAt: this.deletedAt,
    lastActionAt: this.lastActionAt,
    lastMetaError: this.lastMetaError,
    publishQueue: this.publishQueue
      ? {
          status: this.publishQueue.status || 'NONE',
          reason: this.publishQueue.reason || '',
          tokenType: this.publishQueue.tokenType || '',
          source: this.publishQueue.source || '',
          queuedAt: this.publishQueue.queuedAt,
          nextAttemptAt: this.publishQueue.nextAttemptAt,
          runningStartedAt: this.publishQueue.runningStartedAt,
          completedAt: this.publishQueue.completedAt,
          clearedAt: this.publishQueue.clearedAt,
          attemptCount: this.publishQueue.attemptCount || 0,
          lastAttemptAt: this.publishQueue.lastAttemptAt,
          lastError: this.publishQueue.lastError || '',
        }
      : {
          status: 'NONE',
        },
    actionHistory: Array.isArray(this.actionHistory)
      ? this.actionHistory
          .slice(-10)
          .map((item) => ({
            action: item.action,
            status: item.status,
            message: item.message,
            at: item.at,
          }))
      : [],
    createdTime: this.createdAt,
    updatedTime: this.updatedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const ManagedCampaign =
  mongoose.models.ManagedCampaign || mongoose.model('ManagedCampaign', managedCampaignSchema);

module.exports = ManagedCampaign;
