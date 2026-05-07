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
      default: '',
      trim: true,
    },
    adsPowerProfile: {
      type: String,
      default: '',
      trim: true,
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
    profileAccessTokenStatus: {
      type: String,
      enum: Object.values(TOKEN_STATUSES),
      default: TOKEN_STATUSES.ACTIVE,
    },
    encryptedSystemUserAccessToken: {
      value: {
        type: String,
      },
      iv: {
        type: String,
      },
      authTag: {
        type: String,
      },
    },
    maskedSystemUserAccessToken: {
      type: String,
      default: '',
    },
    systemUserAccessTokenStatus: {
      type: String,
      enum: Object.values(TOKEN_STATUSES),
      default: TOKEN_STATUSES.ACTIVE,
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
    systemUserConnectionStatus: {
      type: String,
      enum: Object.values(TOKEN_CONNECTION_STATUSES),
      default: TOKEN_CONNECTION_STATUSES.UNKNOWN,
    },
    systemUserConnectionMessage: {
      type: String,
      default: null,
    },
    lastSystemUserConnectionCheckedAt: {
      type: Date,
      default: null,
    },
    perHourApiCallLimit: {
      type: Number,
      default: 100,
      min: 1,
      max: 199,
    },
    profilePerHourApiCallLimit: {
      type: Number,
      default: 100,
      min: 1,
      max: 199,
    },
    systemUserPerHourApiCallLimit: {
      type: Number,
      default: 100,
      min: 1,
      max: 199,
    },
    apiCallCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    profileHourlyApiCallCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    profileHourlyWindowStartedAt: {
      type: Date,
      default: null,
    },
    lastApiCallAt: {
      type: Date,
      default: null,
    },
    systemUserApiCallCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    systemUserHourlyApiCallCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    systemUserHourlyWindowStartedAt: {
      type: Date,
      default: null,
    },
    systemUserLastApiCallAt: {
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

function getSafeHourlyCount(windowStartedAt, count) {
  if (!windowStartedAt) {
    return 0;
  }

  const oneHourMs = 60 * 60 * 1000;
  const windowStartedAtMs = new Date(windowStartedAt).getTime();

  return Date.now() - windowStartedAtMs < oneHourMs ? count || 0 : 0;
}

function getSafeRef(ref, fields = []) {
  if (!ref) {
    return null;
  }

  if (!ref._id) {
    return {
      id: ref.toString(),
    };
  }

  return fields.reduce(
    (safeObject, field) => ({
      ...safeObject,
      [field]: ref[field] || null,
    }),
    { id: ref._id.toString() }
  );
}

tokenSchema.methods.toSafeObject = function toSafeObject() {
  const normalizedStatus = LEGACY_TOKEN_STATUSES[this.status] || this.status;
  const normalizedConnectionStatus =
    this.status === 'BLOCKED' && (!this.connectionStatus || this.connectionStatus === TOKEN_CONNECTION_STATUSES.UNKNOWN)
      ? TOKEN_CONNECTION_STATUSES.BLOCKED
      : this.connectionStatus || TOKEN_CONNECTION_STATUSES.UNKNOWN;
  const profileAccessTokenStatus = this.profileAccessTokenStatus || TOKEN_STATUSES.ACTIVE;
  const systemUserAccessTokenStatus = this.systemUserAccessTokenStatus || TOKEN_STATUSES.ACTIVE;
  const systemUserConnectionStatus = this.systemUserConnectionStatus || TOKEN_CONNECTION_STATUSES.UNKNOWN;
  const profilePerHourApiCallLimit = this.profilePerHourApiCallLimit || this.perHourApiCallLimit || 100;
  const systemUserPerHourApiCallLimit = this.systemUserPerHourApiCallLimit || this.perHourApiCallLimit || 100;
  const profilePerHourApiCallCount = getSafeHourlyCount(
    this.profileHourlyWindowStartedAt,
    this.profileHourlyApiCallCount
  );
  const systemUserPerHourApiCallCount = getSafeHourlyCount(
    this.systemUserHourlyWindowStartedAt,
    this.systemUserHourlyApiCallCount
  );

  return {
    id: this._id.toString(),
    label: this.label,
    purpose: this.purpose || '',
    adsPowerProfile: this.adsPowerProfile || '',
    brand: getSafeRef(this.brand, ['name', 'color']),
    agency: getSafeRef(this.agency, ['name']),
    accessToken: this.maskedAccessToken,
    profileAccessToken: this.maskedAccessToken,
    systemUserAccessToken: this.maskedSystemUserAccessToken || '',
    status: normalizedStatus,
    profileAccessTokenStatus,
    systemUserAccessTokenStatus,
    connectionStatus: normalizedConnectionStatus,
    profileAccessTokenConnectionStatus: normalizedConnectionStatus,
    connectionMessage: this.connectionMessage,
    profileAccessTokenConnectionMessage: this.connectionMessage,
    lastConnectionCheckedAt: this.lastConnectionCheckedAt,
    profileAccessTokenLastConnectionCheckedAt: this.lastConnectionCheckedAt,
    systemUserAccessTokenConnectionStatus: systemUserConnectionStatus,
    systemUserAccessTokenConnectionMessage: this.systemUserConnectionMessage,
    systemUserAccessTokenLastConnectionCheckedAt: this.lastSystemUserConnectionCheckedAt,
    perHourApiCallLimit: profilePerHourApiCallLimit,
    profilePerHourApiCallLimit,
    systemUserPerHourApiCallLimit,
    apiCallCount: this.apiCallCount || 0,
    profileApiCallCount: this.apiCallCount || 0,
    profilePerHourApiCallCount,
    profileHourlyWindowStartedAt: this.profileHourlyWindowStartedAt,
    lastApiCallAt: this.lastApiCallAt,
    profileLastApiCallAt: this.lastApiCallAt,
    systemUserApiCallCount: this.systemUserApiCallCount || 0,
    systemUserPerHourApiCallCount,
    systemUserHourlyWindowStartedAt: this.systemUserHourlyWindowStartedAt,
    systemUserLastApiCallAt: this.systemUserLastApiCallAt,
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
