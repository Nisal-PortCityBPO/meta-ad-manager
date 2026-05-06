const mongoose = require('mongoose');

const TOKEN_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
});

const tokenSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    purpose: {
      type: String,
      required: true,
      trim: true,
    },
    encryptedAccessToken: {
      value: {
        type: String,
        required: true,
      },
      iv: {
        type: String,
        required: true,
      },
      authTag: {
        type: String,
        required: true,
      },
    },
    maskedAccessToken: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(TOKEN_STATUSES),
      default: TOKEN_STATUSES.ACTIVE,
    },
    apiCallCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastApiCallAt: {
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

tokenSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    label: this.label,
    purpose: this.purpose,
    accessToken: this.maskedAccessToken,
    status: this.status,
    apiCallCount: this.apiCallCount,
    lastApiCallAt: this.lastApiCallAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Token = mongoose.models.Token || mongoose.model('Token', tokenSchema);

module.exports = {
  Token,
  TOKEN_STATUSES,
};
