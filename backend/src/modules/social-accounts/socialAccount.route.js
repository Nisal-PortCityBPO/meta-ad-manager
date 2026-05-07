const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('../users/user.model');
const socialAccountController = require('./socialAccount.controller');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN));
router.get('/', socialAccountController.getSocialAccounts);
router.put('/:id', socialAccountController.assignSocialAccount);

module.exports = router;
