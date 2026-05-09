const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { authenticate, authorize } = require('../../app/middleware/auth');
const HttpError = require('../../app/utils/httpError');
const { USER_ROLES } = require('../users/user.model');
const adsLaunchController = require('./adsLaunch.controller');

const router = express.Router();
const MEDIA_UPLOAD_TEMP_DIR = path.resolve(__dirname, '../../../storage/ads-launch-media-uploads');
const MEDIA_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

fs.mkdirSync(MEDIA_UPLOAD_TEMP_DIR, { recursive: true });

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, MEDIA_UPLOAD_TEMP_DIR);
    },
    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname || '');
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
      cb(null, uniqueName);
    },
  }),
  limits: {
    fileSize: MEDIA_UPLOAD_MAX_BYTES,
    files: 2,
    fields: 8,
  },
});

const mediaChunkUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, MEDIA_UPLOAD_TEMP_DIR);
    },
    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname || '');
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
      cb(null, uniqueName);
    },
  }),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
    fields: 8,
  },
});

const handleMediaUpload = (req, res, next) => {
  mediaUpload.fields([
    { name: 'media', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ])(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      next(new HttpError(400, 'Media upload is too large. Videos can be up to 100MB.'));
      return;
    }

    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      next(new HttpError(400, 'Unexpected media upload field. Please upload one media file.'));
      return;
    }

    next(error);
  });
};

const handleMediaChunkUpload = (req, res, next) => {
  mediaChunkUpload.single('chunk')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      next(new HttpError(400, 'Upload chunk is too large. Please try again with the current uploader.'));
      return;
    }

    next(error);
  });
};

router.use(authenticate, authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN));

router.get('/media-folders', adsLaunchController.getMediaFolders);
router.post('/media-folders', adsLaunchController.createMediaFolder);
router.get('/media', adsLaunchController.getMediaAssets);
router.post('/media', handleMediaUpload, adsLaunchController.createMediaAsset);
router.post('/media/chunk', handleMediaChunkUpload, adsLaunchController.uploadMediaChunk);
router.post('/media/complete', adsLaunchController.completeChunkedMediaAsset);
router.patch('/media/:id/brand', adsLaunchController.updateMediaAssetBrand);
router.get('/media/:id/:assetKind', adsLaunchController.getMediaAsset);
router.delete('/media/:id', adsLaunchController.deleteMediaAsset);
router.post('/failed-launches/:campaignId/retry', adsLaunchController.retryFailedLaunch);
router.get('/publish-queue', adsLaunchController.getPublishQueue);
router.post('/publish-queue/run', adsLaunchController.runPublishQueue);
router.delete('/publish-queue', adsLaunchController.clearPublishQueue);
router.get('/templates', adsLaunchController.getTemplates);
router.get('/templates/:id/assets/:assetKind', adsLaunchController.getTemplateAsset);
router.post('/templates', adsLaunchController.createTemplate);
router.put('/templates/:id', adsLaunchController.updateTemplate);
router.delete('/templates/:id', adsLaunchController.deleteTemplate);
router.post('/publish', adsLaunchController.publishLaunch);
router.post('/publish-stream', adsLaunchController.publishLaunchStream);

module.exports = router;
