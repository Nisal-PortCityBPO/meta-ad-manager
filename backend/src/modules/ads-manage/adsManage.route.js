const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('../users/user.model');
const adsManageController = require('./adsManage.controller');

const router = express.Router();
const adminOrSuperAdmin = authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN);
const superAdminOnly = authorize(USER_ROLES.SUPER_ADMIN);

router.use(authenticate);

router.get('/dynamic-history', adminOrSuperAdmin, adsManageController.listDynamicHistory);
router.get('/errors', adminOrSuperAdmin, adsManageController.listErrors);
router.delete('/errors/success', adminOrSuperAdmin, adsManageController.clearRecoveredErrors);
router.post('/errors/:campaignId/check', adminOrSuperAdmin, adsManageController.checkErrorAccess);
router.post('/errors/:campaignId/retry', adminOrSuperAdmin, adsManageController.retryFailedLaunch);
router.post('/campaigns/search', superAdminOnly, adsManageController.listCampaigns);
router.post('/campaigns/:campaignId/sync', superAdminOnly, adsManageController.syncCampaignDetails);
router.post('/campaigns/:campaignId/retry', superAdminOnly, adsManageController.retryFailedLaunch);
router.post('/campaigns/:campaignId/status', superAdminOnly, adsManageController.updateCampaignStatus);
router.post('/campaigns/:campaignId/duplicate', superAdminOnly, adsManageController.duplicateCampaign);
router.delete('/campaigns/:campaignId', superAdminOnly, adsManageController.deleteCampaign);

module.exports = router;
