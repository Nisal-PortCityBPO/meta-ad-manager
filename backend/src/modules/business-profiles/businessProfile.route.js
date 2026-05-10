const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('../users/user.model');
const businessProfileController = require('./businessProfile.controller');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN));
router.get('/', businessProfileController.getBusinessProfiles);
router.post('/sync', businessProfileController.syncBusinessProfiles);
router.post('/:profileId/ad-accounts/:adAccountId/sync', businessProfileController.syncAdAccount);
router.post('/:profileId/ad-accounts/:adAccountId/campaigns/:campaignId/duplicate', businessProfileController.duplicateCampaign);
router.patch('/:profileId/ad-accounts/:adAccountId/campaigns/:campaignId/status', businessProfileController.updateCampaignStatus);
router.put('/:id', businessProfileController.assignBusinessProfile);
router.delete('/:id', businessProfileController.deleteBusinessProfile);

module.exports = router;
