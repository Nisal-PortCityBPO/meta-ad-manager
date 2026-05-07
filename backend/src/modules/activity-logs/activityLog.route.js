const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('../users/user.model');
const { deleteOldestLogs, getActivityLogs } = require('./activityLog.controller');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN));
router.get('/', getActivityLogs);
router.delete('/oldest', deleteOldestLogs);

module.exports = router;
