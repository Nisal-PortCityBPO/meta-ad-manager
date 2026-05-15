const mongoose = require('mongoose');

const LAUNCH_TEMPLATE_TYPES = Object.freeze({
  FULL: 'FULL',
  CAMPAIGN: 'CAMPAIGN',
  MEDIA: 'MEDIA',
});

const launchTemplateAssetSchema = new mongoose.Schema(
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
    storageKey: {
      type: String,
      default: '',
      trim: true,
    },
    storageProvider: {
      type: String,
      enum: ['LOCAL', 'SPACES'],
      default: 'LOCAL',
      trim: true,
    },
    url: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const launchTemplateConfigSchema = new mongoose.Schema(
  {
    launchLabel: {
      type: String,
      default: '',
      trim: true,
    },
    brandId: {
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
    countries: {
      type: [String],
      default: [],
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
      budgetLevel: {
        type: String,
        default: 'AD_SET',
        trim: true,
      },
      dynamicCreative: {
        type: String,
        default: 'ON',
        trim: true,
      },
      audienceAgeMin: {
        type: String,
        default: '21',
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
      bidAmount: {
        type: String,
        default: '',
        trim: true,
      },
      attributionSetting: {
        type: String,
        default: 'CLICK_7D_VIEW_1D',
        trim: true,
      },
      attributionWindows: {
        clickThrough: {
          type: String,
          default: '7D',
          trim: true,
        },
        engagedView: {
          type: String,
          default: '1D',
          trim: true,
        },
        viewThrough: {
          type: String,
          default: '1D',
          trim: true,
        },
      },
    },
  },
  {
    _id: false,
  }
);

const launchTemplateSnapshotSchema = new mongoose.Schema(
  {
    brandName: {
      type: String,
      default: '',
      trim: true,
    },
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
    media: {
      type: launchTemplateAssetSchema,
      default: null,
    },
    thumbnail: {
      type: launchTemplateAssetSchema,
      default: null,
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
    templateType: {
      type: String,
      enum: Object.values(LAUNCH_TEMPLATE_TYPES),
      default: LAUNCH_TEMPLATE_TYPES.FULL,
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
  const mapAsset = (asset, assetKind) => {
    if (!asset?.storageKey) {
      return null;
    }

    return {
      name: asset.name,
      type: asset.type,
      size: asset.size || 0,
      storageProvider: asset.storageProvider || 'LOCAL',
      url: `/api/ads-launch/templates/${this._id.toString()}/assets/${assetKind}`,
    };
  };

  return {
    id: this._id.toString(),
    name: this.name,
    templateType: this.templateType || LAUNCH_TEMPLATE_TYPES.FULL,
    config: this.config,
    snapshot: {
      brandName: this.snapshot?.brandName || '',
      tokenLabel: this.snapshot?.tokenLabel || '',
      pageName: this.snapshot?.pageName || '',
      pixelName: this.snapshot?.pixelName || '',
      adAccounts: Array.isArray(this.snapshot?.adAccounts) ? this.snapshot.adAccounts : [],
      media: mapAsset(this.snapshot?.media, 'media'),
      thumbnail: mapAsset(this.snapshot?.thumbnail, 'thumbnail'),
    },
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
module.exports.LAUNCH_TEMPLATE_TYPES = LAUNCH_TEMPLATE_TYPES;
