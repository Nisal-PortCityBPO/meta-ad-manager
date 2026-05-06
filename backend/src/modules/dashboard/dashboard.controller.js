const asyncHandler = require('../../app/utils/asyncHandler');
const dashboardService = require('./dashboard.service');

const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await dashboardService.getDashboard(req.user);
  res.json(dashboard);
});

module.exports = {
  getDashboard,
};
