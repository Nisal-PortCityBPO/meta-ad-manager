const mongoose = require('mongoose');

const PUBLISH_INTERVAL_MIN_MINUTES = 10 / 60;
const PUBLISH_INTERVAL_DEFAULT_MIN_MINUTES = 0.167;
const PUBLISH_INTERVAL_MAX_MINUTES = 10;

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
      default: PUBLISH_INTERVAL_DEFAULT_MIN_MINUTES,
      min: PUBLISH_INTERVAL_MIN_MINUTES,
      max: PUBLISH_INTERVAL_MAX_MINUTES,
    },
    maxMinutes: {
      type: Number,
      default: PUBLISH_INTERVAL_MAX_MINUTES,
      min: PUBLISH_INTERVAL_MIN_MINUTES,
      max: PUBLISH_INTERVAL_MAX_MINUTES,
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

const maintenanceSettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      default: 'Maintenance break',
      trim: true,
    },
    message: {
      type: String,
      default: 'We are improving Meta Account Manager right now. Please check back shortly.',
      trim: true,
    },
    etaLabel: {
      type: String,
      default: 'We will be back soon',
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
    maintenance: {
      type: maintenanceSettingsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

const AppSetting = mongoose.models.AppSetting || mongoose.model('AppSetting', appSettingSchema);

module.exports = AppSetting;
