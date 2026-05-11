const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('../users/user.model');
const settingsController = require('./settings.controller');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN));

router.get('/publish-interval', settingsController.getPublishIntervalSettings);
router.put('/publish-interval', settingsController.updatePublishIntervalSettings);
router.get('/telegram', settingsController.getTelegramSettings);
router.put('/telegram', settingsController.updateTelegramSettings);
router.post('/telegram/test', settingsController.testTelegramSettings);

module.exports = router;
