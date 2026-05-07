const mongoose = require('mongoose');

const BUSINESS_PROFILE_META_STATUSES = Object.freeze({
  CONNECTED: 'CONNECTED',
  DISABLED: 'DISABLED',
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
businessProfileSchema.index({ brand: 1, name: 1 });
businessProfileSchema.index({ agency: 1, name: 1 });

businessProfileSchema.pre('validate', function normalizeLegacyMetaStatus() {
  if (LEGACY_META_STATUSES[this.metaStatus]) {
    this.metaStatus = LEGACY_META_STATUSES[this.metaStatus];
  }
});

function getColor(doc) {
  return doc?.color || null;
}

businessProfileSchema.methods.toSafeObject = function toSafeObject() {
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

module.exports = {
  BusinessProfile,
  BUSINESS_PROFILE_META_STATUSES,
};
