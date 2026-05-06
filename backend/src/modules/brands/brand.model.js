const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    color: {
      type: String,
      required: true,
      trim: true,
      default: '#0ea5e9',
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

brandSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    color: this.color,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Brand = mongoose.models.Brand || mongoose.model('Brand', brandSchema);

module.exports = Brand;
