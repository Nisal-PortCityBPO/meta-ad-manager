const mongoose = require('mongoose');

const USER_ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
});

const USER_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
});

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.ADMIN,
    },
    status: {
      type: String,
      enum: Object.values(USER_STATUSES),
      default: USER_STATUSES.ACTIVE,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    passwordResetOtpHash: {
      type: String,
      default: null,
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null,
    },
    passwordResetVerifiedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    status: this.status,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

userSchema.index(
  { role: 1 },
  {
    unique: true,
    partialFilterExpression: { role: USER_ROLES.SUPER_ADMIN },
  }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = {
  User,
  USER_ROLES,
  USER_STATUSES,
};
