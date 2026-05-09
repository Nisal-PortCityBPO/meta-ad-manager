const mongoose = require('mongoose');

const PUBLISH_SESSION_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  PAUSE_REQUESTED: 'PAUSE_REQUESTED',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  QUEUED: 'QUEUED',
});

const toClientStatus = (status) => {
  const normalizedStatus = String(status || '').toUpperCase();

  if (normalizedStatus === PUBLISH_SESSION_STATUSES.PAUSE_REQUESTED) {
    return 'pausing';
  }

  return normalizedStatus ? normalizedStatus.toLowerCase() : 'active';
};

const adsLaunchPublishSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      default: 'Ads publish',
      trim: true,
    },
    source: {
      type: String,
      default: 'Meta publish',
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(PUBLISH_SESSION_STATUSES),
      default: PUBLISH_SESSION_STATUSES.ACTIVE,
      trim: true,
      index: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    resumePayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    progress: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    events: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    latestResult: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    latestError: {
      type: String,
      default: '',
      trim: true,
    },
    pauseRequested: {
      type: Boolean,
      default: false,
      index: true,
    },
    pauseRequestedAt: {
      type: Date,
      default: null,
    },
    pausedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    minimize: false,
    timestamps: true,
  }
);

adsLaunchPublishSessionSchema.index({ createdBy: 1, updatedAt: -1 });
adsLaunchPublishSessionSchema.index({ status: 1, updatedAt: -1 });

adsLaunchPublishSessionSchema.methods.toSafeObject = function toSafeObject({ eventLimit = 120 } = {}) {
  const status = toClientStatus(this.status);
  const resumeCount = Array.isArray(this.resumePayload?.selectedAdAccountIds)
    ? this.resumePayload.selectedAdAccountIds.length
    : 0;

  return {
    id: this.sessionId,
    sessionId: this.sessionId,
    title: this.title,
    source: this.source,
    status,
    rawStatus: this.status,
    startedAt: this.createdAt,
    completedAt: this.completedAt || this.pausedAt || null,
    pauseRequested: Boolean(this.pauseRequested),
    pauseRequestedAt: this.pauseRequestedAt,
    pausedAt: this.pausedAt,
    progress: this.progress || null,
    events: (this.events || []).slice(-eventLimit),
    latestResult: this.latestResult || null,
    latestError: this.latestError || '',
    canPause: status === 'active',
    canResume: status === 'paused' && resumeCount > 0,
    resumeCount,
    updatedAt: this.updatedAt,
  };
};

const AdsLaunchPublishSession =
  mongoose.models.AdsLaunchPublishSession ||
  mongoose.model('AdsLaunchPublishSession', adsLaunchPublishSessionSchema);

module.exports = AdsLaunchPublishSession;
module.exports.PUBLISH_SESSION_STATUSES = PUBLISH_SESSION_STATUSES;
