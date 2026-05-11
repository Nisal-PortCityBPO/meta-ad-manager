const asyncHandler = require('../../app/utils/asyncHandler');
const performanceService = require('./performance.service');

const getPerformanceOptions = asyncHandler(async (req, res) => {
  const result = await performanceService.getPerformanceOptions(req.query);
  res.json(result);
});

const getPerformanceReport = asyncHandler(async (req, res) => {
  const result = await performanceService.getPerformanceReport(req.query);
  res.json(result);
});

module.exports = {
  getPerformanceOptions,
  getPerformanceReport,
};
