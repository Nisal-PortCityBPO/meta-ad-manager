const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('../users/user.model');
const { getActivityLogs } = require('./activityLog.controller');

const router = express.Router();

router.get('/', authenticate, authorize(USER_ROLES.SUPER_ADMIN), getActivityLogs);

module.exports = router;
