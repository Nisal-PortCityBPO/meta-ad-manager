const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('./user.model');
const usersController = require('./users.controller');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN));
router.get('/', usersController.getUsers);
router.post('/', usersController.createAdmin);
router.patch('/:id/status', usersController.updateUserStatus);

module.exports = router;
