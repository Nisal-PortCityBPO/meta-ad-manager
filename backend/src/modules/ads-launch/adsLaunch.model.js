const mongoose = require('mongoose');

const launchTemplateConfigSchema = new mongoose.Schema(
  {
    launchLabel: {
      type: String,
      default: '',
      trim: true,
    },
    tokenId: {
      type: String,
      default: '',
      trim: true,
    },
    country: {
      type: String,
      default: '',
      trim: true,
    },
    objective: {
      type: String,
      default: '',
      trim: true,
    },
    dailyBudget: {
      type: String,
      default: '',
      trim: true,
    },
    selectedAdAccountIds: {
      type: [String],
      default: [],
    },
    pageId: {
      type: String,
      default: '',
      trim: true,
    },
    pixelId: {
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
    callToAction: {
      type: String,
      default: '',
      trim: true,
    },
    staticDefaults: {
      buyingType: {
        type: String,
        default: 'AUCTION',
        trim: true,
      },
      campaignStatus: {
        type: String,
        default: 'PAUSED',
        trim: true,
      },
      specialAdCategories: {
        type: String,
        default: 'NONE',
        trim: true,
      },
      placements: {
        type: String,
        default: 'ADVANTAGE_PLUS',
        trim: true,
      },
      audienceAgeMin: {
        type: String,
        default: '18',
        trim: true,
      },
      audienceAgeMax: {
        type: String,
        default: '65',
        trim: true,
      },
      genderTargeting: {
        type: String,
        default: 'ALL',
        trim: true,
      },
      billingEvent: {
        type: String,
        default: 'IMPRESSIONS',
        trim: true,
      },
      bidStrategy: {
        type: String,
        default: 'LOWEST_COST_WITHOUT_CAP',
        trim: true,
      },
    },
  },
  {
    _id: false,
  }
);

const launchTemplateSnapshotSchema = new mongoose.Schema(
  {
    tokenLabel: {
      type: String,
      default: '',
      trim: true,
    },
    pageName: {
      type: String,
      default: '',
      trim: true,
    },
    pixelName: {
      type: String,
      default: '',
      trim: true,
    },
    adAccounts: {
      type: [
        {
          id: {
            type: String,
            trim: true,
          },
          name: {
            type: String,
            trim: true,
          },
        },
      ],
      default: [],
    },
  },
  {
    _id: false,
  }
);

const launchTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    config: {
      type: launchTemplateConfigSchema,
      default: () => ({}),
    },
    snapshot: {
      type: launchTemplateSnapshotSchema,
      default: () => ({}),
    },
    lastPublishedAt: {
      type: Date,
      default: null,
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
  },
  {
    timestamps: true,
  }
);

launchTemplateSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    config: this.config,
    snapshot: this.snapshot,
    lastPublishedAt: this.lastPublishedAt,
    createdBy: this.createdBy
      ? {
          id: this.createdBy._id?.toString?.() || this.createdBy.toString(),
          name: this.createdBy.name || null,
          email: this.createdBy.email || null,
        }
      : null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const LaunchTemplate =
  mongoose.models.LaunchTemplate || mongoose.model('LaunchTemplate', launchTemplateSchema);

module.exports = LaunchTemplate;
