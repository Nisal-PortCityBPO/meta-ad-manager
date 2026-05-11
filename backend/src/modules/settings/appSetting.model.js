const mongoose = require('mongoose');

const telegramSettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    botToken: {
      type: String,
      default: '',
      trim: true,
    },
    chatId: {
      type: String,
      default: '',
      trim: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    _id: false,
  }
);

const publishIntervalSettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: true,
    },
    minMinutes: {
      type: Number,
      default: 0.3,
      min: 0.3,
      max: 10,
    },
    maxMinutes: {
      type: Number,
      default: 10,
      min: 0.3,
      max: 10,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    _id: false,
  }
);

const appSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    telegram: {
      type: telegramSettingsSchema,
      default: () => ({}),
    },
    publishInterval: {
      type: publishIntervalSettingsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

const AppSetting = mongoose.models.AppSetting || mongoose.model('AppSetting', appSettingSchema);

module.exports = AppSetting;
