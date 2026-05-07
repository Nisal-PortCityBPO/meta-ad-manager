const mongoose = require('mongoose');

const TOKEN_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  DEACTIVE: 'DEACTIVE',
});

const LEGACY_TOKEN_STATUSES = Object.freeze({
  BLOCKED: TOKEN_STATUSES.ACTIVE,
});

const TOKEN_CONNECTION_STATUSES = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  CONNECTED: 'CONNECTED',
  BLOCKED: 'BLOCKED',
  DISABLED: 'DISABLED',
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
    adsPowerProfile: {
      type: String,
      default: '',
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
    connectionStatus: {
      type: String,
      enum: Object.values(TOKEN_CONNECTION_STATUSES),
      default: TOKEN_CONNECTION_STATUSES.UNKNOWN,
    },
    connectionMessage: {
      type: String,
      default: null,
    },
    lastConnectionCheckedAt: {
      type: Date,
      default: null,
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

tokenSchema.pre('validate', function normalizeLegacyStatus() {
  if (LEGACY_TOKEN_STATUSES[this.status]) {
    if (!this.connectionStatus || this.connectionStatus === TOKEN_CONNECTION_STATUSES.UNKNOWN) {
      this.connectionStatus = TOKEN_CONNECTION_STATUSES.BLOCKED;
    }

    this.status = LEGACY_TOKEN_STATUSES[this.status];
  }
});

tokenSchema.methods.toSafeObject = function toSafeObject() {
  const normalizedStatus = LEGACY_TOKEN_STATUSES[this.status] || this.status;
  const normalizedConnectionStatus =
    this.status === 'BLOCKED' && (!this.connectionStatus || this.connectionStatus === TOKEN_CONNECTION_STATUSES.UNKNOWN)
      ? TOKEN_CONNECTION_STATUSES.BLOCKED
      : this.connectionStatus;

  return {
    id: this._id.toString(),
    label: this.label,
    purpose: this.purpose,
    adsPowerProfile: this.adsPowerProfile || '',
    accessToken: this.maskedAccessToken,
    status: normalizedStatus,
    connectionStatus: normalizedConnectionStatus,
    connectionMessage: this.connectionMessage,
    lastConnectionCheckedAt: this.lastConnectionCheckedAt,
    apiCallCount: this.apiCallCount,
    lastApiCallAt: this.lastApiCallAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Token = mongoose.models.Token || mongoose.model('Token', tokenSchema);

module.exports = {
  TOKEN_CONNECTION_STATUSES,
  Token,
  TOKEN_STATUSES,
};
