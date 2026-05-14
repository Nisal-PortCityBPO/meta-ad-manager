const mongoose = require('mongoose');

const PUBLISH_SESSION_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  PAUSE_REQUESTED: 'PAUSE_REQUESTED',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  FORCE_STOPPED: 'FORCE_STOPPED',
  QUEUED: 'QUEUED',
  PENDING: 'PENDING',
});

const PUBLISH_SESSION_QUEUE_STATUSES = Object.freeze({
  NONE: 'NONE',
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

const toClientStatus = (status) => {
  const normalizedStatus = String(status || '').toUpperCase();

  if (normalizedStatus === PUBLISH_SESSION_STATUSES.PENDING) {
    return 'queued';
  }

  if (normalizedStatus === PUBLISH_SESSION_STATUSES.PAUSE_REQUESTED) {
    return 'pausing';
  }

  if (normalizedStatus === PUBLISH_SESSION_STATUSES.FORCE_STOPPED) {
    return 'stopped';
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
    forceStopRequested: {
      type: Boolean,
      default: false,
      index: true,
    },
    forceStopRequestedAt: {
      type: Date,
      default: null,
    },
    queue: {
      status: {
        type: String,
        enum: Object.values(PUBLISH_SESSION_QUEUE_STATUSES),
        default: PUBLISH_SESSION_QUEUE_STATUSES.NONE,
        trim: true,
        index: true,
      },
      queuedAt: {
        type: Date,
        default: null,
        index: true,
      },
      startedAt: {
        type: Date,
        default: null,
      },
      completedAt: {
        type: Date,
        default: null,
      },
      attemptCount: {
        type: Number,
        default: 0,
        min: 0,
      },
      lastError: {
        type: String,
        default: '',
        trim: true,
      },
    },
    pausedAt: {
      type: Date,
      default: null,
    },
    stoppedAt: {
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
adsLaunchPublishSessionSchema.index({ 'queue.status': 1, 'queue.queuedAt': 1 });

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
    completedAt: this.completedAt || this.stoppedAt || this.pausedAt || null,
    pauseRequested: Boolean(this.pauseRequested),
    pauseRequestedAt: this.pauseRequestedAt,
    forceStopRequested: Boolean(this.forceStopRequested),
    forceStopRequestedAt: this.forceStopRequestedAt,
    pausedAt: this.pausedAt,
    stoppedAt: this.stoppedAt,
    progress: this.progress || null,
    events: (this.events || []).slice(-eventLimit),
    latestResult: this.latestResult || null,
    latestError: this.latestError || '',
    canPause: status === 'active',
    canForceStop: ['active', 'pausing', 'queued'].includes(status),
    canResume: status === 'paused' && resumeCount > 0,
    resumeCount,
    queue: this.queue
      ? {
          status: this.queue.status || PUBLISH_SESSION_QUEUE_STATUSES.NONE,
          queuedAt: this.queue.queuedAt || null,
          startedAt: this.queue.startedAt || null,
          completedAt: this.queue.completedAt || null,
          attemptCount: this.queue.attemptCount || 0,
          lastError: this.queue.lastError || '',
        }
      : {
          status: PUBLISH_SESSION_QUEUE_STATUSES.NONE,
        },
    updatedAt: this.updatedAt,
  };
};

const AdsLaunchPublishSession =
  mongoose.models.AdsLaunchPublishSession ||
  mongoose.model('AdsLaunchPublishSession', adsLaunchPublishSessionSchema);

module.exports = AdsLaunchPublishSession;
module.exports.PUBLISH_SESSION_STATUSES = PUBLISH_SESSION_STATUSES;
module.exports.PUBLISH_SESSION_QUEUE_STATUSES = PUBLISH_SESSION_QUEUE_STATUSES;
