const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('../users/user.model');
const metaAssetsController = require('./metaAssets.controller');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN));
router.get('/', metaAssetsController.getMetaAssets);
router.get('/pixels', metaAssetsController.getMetaPixels);

module.exports = router;
