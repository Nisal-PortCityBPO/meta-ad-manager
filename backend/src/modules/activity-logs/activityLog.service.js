const ActivityLog = require('./activityLog.model');

async function writeActivityLog({
  user = null,
  action,
  entity = 'System',
  entityId = null,
  metadata = {},
  req = null,
}) {
  try {
    await ActivityLog.create({
      actor: user?._id || null,
      actorEmail: user?.email || metadata.actorEmail || 'system',
      action,
      entity,
      entityId,
      metadata,
      ipAddress: req?.ip || null,
    });
  } catch (error) {
    console.error('Activity log failed:', error.message);
  }
}

async function listActivityLogs({ limit = 50 } = {}) {
  return ActivityLog.find()
    .populate('actor', 'name email role')
    .sort({ createdAt: -1 })
    .limit(limit);
}

module.exports = {
  listActivityLogs,
  writeActivityLog,
};
