const express = require('express');
const { authenticate, authorize } = require('../../app/middleware/auth');
const { USER_ROLES } = require('../users/user.model');
const brandController = require('./brand.controller');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN));
router.get('/', brandController.getBrands);
router.post('/', brandController.createBrand);
router.put('/:id', brandController.updateBrand);
router.delete('/:id', brandController.deleteBrand);

module.exports = router;
