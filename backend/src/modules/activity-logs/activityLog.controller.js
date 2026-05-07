const asyncHandler = require('../../app/utils/asyncHandler');
const { deleteOldestActivityLogs, listActivityLogs } = require('./activityLog.service');

const getActivityLogs = asyncHandler(async (req, res) => {
  const result = await listActivityLogs(req.query);

  res.json({
    logs: result.logs,
    pagination: result.pagination,
    filterOptions: result.filterOptions,
  });
});

const deleteOldestLogs = asyncHandler(async (req, res) => {
  const result = await deleteOldestActivityLogs({
    actor: req.user,
    req,
  });

  res.json({
    message: `${result.deletedCount} oldest activity logs deleted permanently`,
    deletedCount: result.deletedCount,
  });
});

module.exports = {
  deleteOldestLogs,
  getActivityLogs,
};
