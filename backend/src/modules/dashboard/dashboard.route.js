const express = require('express');
const { authenticate } = require('../../app/middleware/auth');
const dashboardController = require('./dashboard.controller');

const router = express.Router();

router.get('/', authenticate, dashboardController.getDashboard);

module.exports = router;
