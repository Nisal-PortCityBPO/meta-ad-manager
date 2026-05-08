const mongoose = require('mongoose');

const adsLaunchMediaFolderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdsLaunchMediaFolder',
      default: null,
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

adsLaunchMediaFolderSchema.index({ createdBy: 1, brandId: 1, parent: 1, name: 1 });

adsLaunchMediaFolderSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    parentId: this.parent?._id?.toString?.() || this.parent?.toString?.() || null,
    brandId: this.brandId || '',
    brandName: this.brandName || '',
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const AdsLaunchMediaFolder =
  mongoose.models.AdsLaunchMediaFolder ||
  mongoose.model('AdsLaunchMediaFolder', adsLaunchMediaFolderSchema);

module.exports = AdsLaunchMediaFolder;
