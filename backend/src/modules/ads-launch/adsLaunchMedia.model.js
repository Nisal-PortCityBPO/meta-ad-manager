const mongoose = require('mongoose');

const ADS_MEDIA_TYPES = Object.freeze({
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
});

const adsMediaAssetSchema = new mongoose.Schema(
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
    width: {
      type: Number,
      default: 0,
      min: 0,
    },
    height: {
      type: Number,
      default: 0,
      min: 0,
    },
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    _id: false,
  }
);

const metaReviewAdSchema = new mongoose.Schema(
  {
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
    campaignId: {
      type: String,
      default: '',
      trim: true,
    },
    campaignName: {
      type: String,
      default: '',
      trim: true,
    },
    adAccountId: {
      type: String,
      default: '',
      trim: true,
    },
    adAccountName: {
      type: String,
      default: '',
      trim: true,
    },
    businessProfileId: {
      type: String,
      default: '',
      trim: true,
    },
    businessProfileName: {
      type: String,
      default: '',
      trim: true,
    },
    mediaRole: {
      type: String,
      default: 'MEDIA',
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const metaReviewSchema = new mongoose.Schema(
  {
    riskStatus: {
      type: String,
      default: 'CLEAR',
      trim: true,
      index: true,
    },
    lastMetaStatus: {
      type: String,
      default: '',
      trim: true,
    },
    lastReason: {
      type: String,
      default: '',
      trim: true,
    },
    lastRejectedAt: {
      type: Date,
      default: null,
    },
    lastCheckedAt: {
      type: Date,
      default: null,
    },
    rejectedAdIds: {
      type: [String],
      default: [],
    },
    rejectedCampaignIds: {
      type: [String],
      default: [],
    },
    lastAd: {
      type: metaReviewAdSchema,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const adsLaunchMediaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    mediaType: {
      type: String,
      enum: Object.values(ADS_MEDIA_TYPES),
      required: true,
      trim: true,
    },
    brandId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    brandName: {
      type: String,
      default: '',
      trim: true,
    },
    media: {
      type: adsMediaAssetSchema,
      required: true,
    },
    thumbnail: {
      type: adsMediaAssetSchema,
      default: null,
    },
    folder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdsLaunchMediaFolder',
      default: null,
      index: true,
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
    metaReview: {
      type: metaReviewSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

adsLaunchMediaSchema.index({ brandId: 1, updatedAt: -1 });
adsLaunchMediaSchema.index({ 'metaReview.riskStatus': 1, updatedAt: -1 });

adsLaunchMediaSchema.methods.toSafeObject = function toSafeObject() {
  const id = this._id.toString();
  const mapAsset = (asset, assetKind) => {
    if (!asset?.storageKey) {
      return null;
    }

    return {
      name: asset.name,
      type: asset.type,
      size: asset.size || 0,
      width: asset.width || 0,
      height: asset.height || 0,
      duration: asset.duration || 0,
      url: `/api/ads-launch/media/${id}/${assetKind}`,
    };
  };

  return {
    id,
    name: this.name,
    mediaType: this.mediaType,
    brandId: this.brandId || '',
    brandName: this.brandName || '',
    folderId: this.folder?._id?.toString?.() || this.folder?.toString?.() || null,
    media: mapAsset(this.media, 'file'),
    thumbnail: mapAsset(this.thumbnail, 'thumbnail'),
    metaReview: this.metaReview
      ? {
          riskStatus: this.metaReview.riskStatus || 'CLEAR',
          lastMetaStatus: this.metaReview.lastMetaStatus || '',
          lastReason: this.metaReview.lastReason || '',
          lastRejectedAt: this.metaReview.lastRejectedAt || null,
          lastCheckedAt: this.metaReview.lastCheckedAt || null,
          rejectedAdCount: Array.isArray(this.metaReview.rejectedAdIds) ? this.metaReview.rejectedAdIds.length : 0,
          rejectedCampaignCount: Array.isArray(this.metaReview.rejectedCampaignIds)
            ? this.metaReview.rejectedCampaignIds.length
            : 0,
          lastAd: this.metaReview.lastAd || null,
        }
      : {
          riskStatus: 'CLEAR',
        },
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

const AdsLaunchMedia =
  mongoose.models.AdsLaunchMedia || mongoose.model('AdsLaunchMedia', adsLaunchMediaSchema);

module.exports = AdsLaunchMedia;
module.exports.ADS_MEDIA_TYPES = ADS_MEDIA_TYPES;
