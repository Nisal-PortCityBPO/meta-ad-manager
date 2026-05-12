const express = require('express');
const { authenticate } = require('../../app/middleware/auth');
const systemIntegrityController = require('./systemIntegrity.controller');

const router = express.Router();

router.use(authenticate);

router.get('/footer', systemIntegrityController.getFooterPackage);
router.get('/footer/validate', systemIntegrityController.validateFooterProof);

module.exports = router;
