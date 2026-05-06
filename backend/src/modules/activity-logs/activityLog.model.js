const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actorEmail: {
      type: String,
      default: 'system',
    },
    action: {
      type: String,
      required: true,
    },
    entity: {
      type: String,
      default: 'System',
    },
    entityId: {
      type: String,
      default: null,
    },
    metadata: {
      type: Object,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);
