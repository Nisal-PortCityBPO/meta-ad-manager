const mongoose = require('mongoose');

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
    sourceToken: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Token',
      default: null,
    },
    sourceTokenLabel: {
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

function getColor(doc) {
  return doc?.color || null;
}

businessProfileSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    metaBusinessId: this.metaBusinessId,
    name: this.name,
    verificationStatus: this.verificationStatus,
    sourceTokenLabel: this.sourceTokenLabel,
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
    lastSyncedAt: this.lastSyncedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const BusinessProfile =
  mongoose.models.BusinessProfile || mongoose.model('BusinessProfile', businessProfileSchema);

module.exports = BusinessProfile;
