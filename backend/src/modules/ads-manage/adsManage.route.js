const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('../users/user.model');
const adsManageController = require('./adsManage.controller');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN));

router.post('/campaigns/search', adsManageController.listCampaigns);
router.post('/campaigns/:campaignId/sync', adsManageController.syncCampaignDetails);
router.post('/campaigns/:campaignId/retry', adsManageController.retryFailedLaunch);
router.post('/campaigns/:campaignId/status', adsManageController.updateCampaignStatus);
router.post('/campaigns/:campaignId/duplicate', adsManageController.duplicateCampaign);
router.delete('/campaigns/:campaignId', adsManageController.deleteCampaign);

module.exports = router;
