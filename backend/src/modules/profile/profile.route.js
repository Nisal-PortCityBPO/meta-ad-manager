const express = require('express');
const { authenticate } = require('../../app/middleware/auth');
const profileController = require('./profile.controller');

const router = express.Router();

router.use(authenticate);
router.get('/', profileController.getProfile);
router.put('/', profileController.updateProfile);
router.put('/password', profileController.changePassword);

module.exports = router;
