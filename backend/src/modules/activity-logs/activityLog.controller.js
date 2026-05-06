const asyncHandler = require('../../app/utils/asyncHandler');
const { listActivityLogs } = require('./activityLog.service');

const getActivityLogs = asyncHandler(async (req, res) => {
  const logs = await listActivityLogs({ limit: 100 });

  res.json({
    logs: logs.map((log) => ({
      id: log._id.toString(),
      actorName: log.actor?.name || 'System',
      actorEmail: log.actorEmail,
      actorRole: log.actor?.role || null,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      metadata: log.metadata,
      createdAt: log.createdAt,
    })),
  });
});

module.exports = {
  getActivityLogs,
};
