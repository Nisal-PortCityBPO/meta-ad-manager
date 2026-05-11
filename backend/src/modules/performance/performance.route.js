const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('../users/user.model');
const performanceController = require('./performance.controller');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN));
router.get('/options', performanceController.getPerformanceOptions);
router.get('/report', performanceController.getPerformanceReport);

module.exports = router;
