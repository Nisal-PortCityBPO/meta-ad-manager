const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('../users/user.model');
const agencyController = require('./agency.controller');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN));
router.get('/', agencyController.getAgencies);
router.post('/', agencyController.createAgency);
router.put('/:id', agencyController.updateAgency);
router.delete('/:id', agencyController.deleteAgency);

module.exports = router;
