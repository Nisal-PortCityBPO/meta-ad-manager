const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('./user.model');
const usersController = require('./users.controller');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN));
router.get('/', usersController.getUsers);
router.post('/', usersController.createAdmin);
router.post('/verify-super-admin-password', usersController.verifySuperAdminPassword);
router.patch('/:id/status', usersController.updateUserStatus);
router.patch('/:id/password', usersController.resetAdminPassword);

module.exports = router;
