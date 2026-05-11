const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('../users/user.model');
const analysisController = require('./analysis.controller');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN));
router.get('/config', analysisController.getConfig);
router.get('/recommendations', analysisController.getRecommendations);
router.get('/rules', analysisController.getRules);
router.post('/rules', analysisController.createRule);
router.put('/rules/:id', analysisController.updateRule);
router.delete('/rules/:id', analysisController.deleteRule);

module.exports = router;
