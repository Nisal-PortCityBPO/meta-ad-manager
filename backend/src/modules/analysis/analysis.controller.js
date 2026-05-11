const asyncHandler = require('../../app/utils/asyncHandler');
const analysisService = require('./analysis.service');

const getConfig = asyncHandler(async (req, res) => {
  res.json(analysisService.getAnalysisConfig());
});

const getRecommendations = asyncHandler(async (req, res) => {
  const result = await analysisService.getRecommendations();
  res.json(result);
});

const getRules = asyncHandler(async (req, res) => {
  const rules = await analysisService.listRules();
  res.json({ rules });
});

const createRule = asyncHandler(async (req, res) => {
  const rule = await analysisService.createRule({
    actor: req.user,
    payload: req.body,
    req,
  });

  res.status(201).json({
    message: 'Analysis rule created successfully',
    rule,
  });
});

const updateRule = asyncHandler(async (req, res) => {
  const rule = await analysisService.updateRule({
    actor: req.user,
    payload: req.body,
    req,
    ruleId: req.params.id,
  });

  res.json({
    message: 'Analysis rule updated successfully',
    rule,
  });
});

const deleteRule = asyncHandler(async (req, res) => {
  await analysisService.deleteRule({
    actor: req.user,
    req,
    ruleId: req.params.id,
  });

  res.json({ message: 'Analysis rule deleted successfully' });
});

module.exports = {
  createRule,
  deleteRule,
  getConfig,
  getRecommendations,
  getRules,
  updateRule,
};
