const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('../users/user.model');
const adsLaunchController = require('./adsLaunch.controller');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN));

router.get('/media', adsLaunchController.getMediaAssets);
router.post('/media', adsLaunchController.createMediaAsset);
router.get('/media/:id/:assetKind', adsLaunchController.getMediaAsset);
router.delete('/media/:id', adsLaunchController.deleteMediaAsset);
router.get('/templates', adsLaunchController.getTemplates);
router.get('/templates/:id/assets/:assetKind', adsLaunchController.getTemplateAsset);
router.post('/templates', adsLaunchController.createTemplate);
router.put('/templates/:id', adsLaunchController.updateTemplate);
router.delete('/templates/:id', adsLaunchController.deleteTemplate);
router.post('/publish', adsLaunchController.publishLaunch);
router.post('/publish-stream', adsLaunchController.publishLaunchStream);

module.exports = router;
