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
  },
  {
    timestamps: true,
  }
);

const AppSetting = mongoose.models.AppSetting || mongoose.model('AppSetting', appSettingSchema);

module.exports = AppSetting;
