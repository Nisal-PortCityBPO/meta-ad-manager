const express = require('express');
const { authenticate } = require('../../app/middleware/auth');
const authController = require('./auth.controller');

const router = express.Router();

router.post('/login', authController.login);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-otp', authController.verifyOtp);
router.post('/reset-password', authController.resetPassword);

module.exports = router;
