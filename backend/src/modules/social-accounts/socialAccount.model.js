const mongoose = require('mongoose');

const socialAccountSchema = new mongoose.Schema(
  {
    metaAccountId: {
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
    sourceToken: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Token',
      default: null,
    },
    sourceTokenLabel: {
      type: String,
      default: null,
    },
    profileImageUrl: {
      type: String,
      default: null,
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

socialAccountSchema.index({ name: 1 });
socialAccountSchema.index({ sourceTokenLabel: 1 });
socialAccountSchema.index({ brand: 1, name: 1 });
socialAccountSchema.index({ agency: 1, name: 1 });

function getColor(doc) {
  return doc?.color || null;
}

socialAccountSchema.methods.toSafeObject = function toSafeObject({ profileCount = 0 } = {}) {
  const sourceTokenLabel = this.sourceToken?.label || this.sourceTokenLabel;

  return {
    id: this._id.toString(),
    metaAccountId: this.metaAccountId,
    name: this.name,
    profileImageUrl: this.profileImageUrl,
    sourceTokenLabel,
    connectionStatus: this.sourceToken?.connectionStatus || 'UNKNOWN',
    connectionMessage: this.sourceToken?.connectionMessage || null,
    lastConnectionCheckedAt: this.sourceToken?.lastConnectionCheckedAt || null,
    brand: this.brand
      ? {
          id: this.brand._id.toString(),
          name: this.brand.name,
          color: getColor(this.brand),
        }
      : null,
    agency: this.agency
      ? {
          id: this.agency._id.toString(),
          name: this.agency.name,
        }
      : null,
    profileCount,
    lastSyncedAt: this.lastSyncedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports =
  mongoose.models.SocialAccount || mongoose.model('SocialAccount', socialAccountSchema);
