const HttpError = require('../../app/utils/httpError');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const AppSetting = require('./appSetting.model');

const SETTINGS_KEY = 'global';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function maskBotToken(value) {
  const token = normalizeText(value);

  if (!token) {
    return '';
  }

  const [botId, secret = ''] = token.split(':');
  const visibleSecret = secret.slice(-4);
  return `${botId || 'bot'}:${'*'.repeat(Math.max(secret.length - visibleSecret.length, 6))}${visibleSecret}`;
}

async function getGlobalSettingsDoc() {
  return AppSetting.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $setOnInsert: { key: SETTINGS_KEY } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

function toTelegramSafeObject(settings) {
  const telegram = settings?.telegram || {};

  return {
    enabled: Boolean(telegram.enabled),
    chatId: telegram.chatId || '',
    botTokenSet: Boolean(telegram.botToken),
    botTokenMasked: maskBotToken(telegram.botToken),
  };
}

async function getTelegramSettings() {
  const settings = await getGlobalSettingsDoc();
  return toTelegramSafeObject(settings);
}

async function updateTelegramSettings({ enabled, botToken, chatId, actor, req }) {
  const settings = await getGlobalSettingsDoc();
  const nextEnabled = Boolean(enabled);
  const nextChatId = normalizeText(chatId);
  const nextBotToken = normalizeText(botToken);

  if (nextEnabled && !nextChatId) {
    throw new HttpError(400, 'Telegram chat id is required when Telegram notifications are enabled');
  }

  if (nextBotToken) {
    settings.telegram.botToken = nextBotToken;
  }

  if (nextEnabled && !settings.telegram.botToken) {
    throw new HttpError(400, 'Telegram bot token is required when Telegram notifications are enabled');
  }

  settings.telegram.enabled = nextEnabled;
  settings.telegram.chatId = nextChatId;
  settings.telegram.updatedBy = actor?._id || null;
  await settings.save();

  await writeActivityLog({
    user: actor,
    action: 'SETTINGS_TELEGRAM_UPDATED',
    entity: 'Settings',
    metadata: {
      enabled: settings.telegram.enabled,
      chatId: settings.telegram.chatId,
      botTokenSet: Boolean(settings.telegram.botToken),
    },
    req,
  });

  return toTelegramSafeObject(settings);
}

async function sendTelegramMessage({ text }) {
  const settings = await getGlobalSettingsDoc();
  const telegram = settings.telegram || {};

  if (!telegram.enabled || !telegram.botToken || !telegram.chatId) {
    return { sent: false, skipped: true };
  }

  const response = await fetch(`https://api.telegram.org/bot${telegram.botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: telegram.chatId,
      disable_web_page_preview: true,
      text,
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    throw new HttpError(400, payload.description || 'Telegram message failed');
  }

  return { sent: true, payload };
}

async function testTelegramSettings({ actor, req }) {
  const result = await sendTelegramMessage({
    text: `Meta Manager test message\nSent by ${actor?.email || actor?.name || 'admin'}`,
  });

  await writeActivityLog({
    user: actor,
    action: 'SETTINGS_TELEGRAM_TEST_SENT',
    entity: 'Settings',
    req,
  });

  return result;
}

function buildPublishSummaryText({ launch, result }) {
  const failed = Array.isArray(result?.failed) ? result.failed : [];
  const results = Array.isArray(result?.results) ? result.results : [];
  const summary = result?.summary || {};
  const lines = [
    'Meta publish completed',
    `Launch: ${launch?.launchLabel || 'Ads Launch'}`,
    `Requested: ${summary.requested ?? results.length + failed.length}`,
    `Published: ${summary.published ?? results.length}`,
    `Failed: ${summary.failed ?? failed.length}`,
  ];

  if (failed.length) {
    lines.push('', 'Failed accounts:');
    failed.slice(0, 8).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.adAccountName || item.adAccountId}: ${item.message || 'Failed'}`);
    });
  }

  if (results.length) {
    lines.push('', 'Published accounts:');
    results.slice(0, 8).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.adAccountName || item.adAccountId}: ${item.campaignId || 'Campaign created'}`);
    });
  }

  return lines.join('\n').slice(0, 3900);
}

async function notifyPublishSummary({ launch, result }) {
  try {
    return await sendTelegramMessage({
      text: buildPublishSummaryText({ launch, result }),
    });
  } catch (error) {
    return {
      sent: false,
      error: error.message,
    };
  }
}

module.exports = {
  getTelegramSettings,
  notifyPublishSummary,
  testTelegramSettings,
  updateTelegramSettings,
};
