const mongoose = require('mongoose');

const agencySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
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

agencySchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Agency = mongoose.models.Agency || mongoose.model('Agency', agencySchema);

module.exports = Agency;
