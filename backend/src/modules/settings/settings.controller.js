const asyncHandler = require('../../app/utils/asyncHandler');
const settingsService = require('./settings.service');

const getTelegramSettings = asyncHandler(async (_req, res) => {
  const telegram = await settingsService.getTelegramSettings();
  res.json({ telegram });
});

const getPublishIntervalSettings = asyncHandler(async (_req, res) => {
  const publishInterval = await settingsService.getPublishIntervalSettings();
  res.json({ publishInterval });
});

const updatePublishIntervalSettings = asyncHandler(async (req, res) => {
  const publishInterval = await settingsService.updatePublishIntervalSettings({
    enabled: req.body.enabled,
    minMinutes: req.body.minMinutes,
    maxMinutes: req.body.maxMinutes,
    actor: req.user,
    req,
  });

  res.json({
    message: 'Publish interval settings saved',
    publishInterval,
  });
});

const updateTelegramSettings = asyncHandler(async (req, res) => {
  const telegram = await settingsService.updateTelegramSettings({
    enabled: req.body.enabled,
    botToken: req.body.botToken,
    chatId: req.body.chatId,
    actor: req.user,
    req,
  });

  res.json({
    message: 'Telegram settings saved',
    telegram,
  });
});

const testTelegramSettings = asyncHandler(async (req, res) => {
  await settingsService.testTelegramSettings({
    actor: req.user,
    req,
  });

  res.json({
    message: 'Telegram test message sent',
  });
});

module.exports = {
  getPublishIntervalSettings,
  getTelegramSettings,
  testTelegramSettings,
  updatePublishIntervalSettings,
  updateTelegramSettings,
};
