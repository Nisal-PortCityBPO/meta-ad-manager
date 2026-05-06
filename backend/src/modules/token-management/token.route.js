const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('../users/user.model');
const tokenController = require('./token.controller');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN));
router.get('/', tokenController.getTokens);
router.post('/', tokenController.createToken);
router.put('/:id', tokenController.updateToken);
router.delete('/:id', tokenController.deleteToken);
router.post('/:id/api-calls', tokenController.recordApiCall);

module.exports = router;
