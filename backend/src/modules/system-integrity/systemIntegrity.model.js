const mongoose = require('mongoose');

const encryptedPayloadSchema = new mongoose.Schema(
  {
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
  {
    _id: false,
  }
);

const systemIntegritySettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    encryptedPayload: {
      type: encryptedPayloadSchema,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const SystemIntegritySetting =
  mongoose.models.SystemIntegritySetting ||
  mongoose.model('SystemIntegritySetting', systemIntegritySettingSchema);

module.exports = SystemIntegritySetting;
