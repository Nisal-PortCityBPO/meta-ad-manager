const HttpError = require('../../app/utils/httpError');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const AppSetting = require('./appSetting.model');

const SETTINGS_KEY = 'global';
const PUBLISH_INTERVAL_MIN_MINUTES = 10 / 60;
const PUBLISH_INTERVAL_DEFAULT_MIN_MINUTES = 0.167;
const PUBLISH_INTERVAL_MAX_MINUTES = 10;

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

function normalizeIntervalMinutes(value, fallback) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.round(numericValue * 1000) / 1000;
}

async function getGlobalSettingsDoc() {
  return AppSetting.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $setOnInsert: { key: SETTINGS_KEY } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

function toPublishIntervalSafeObject(settings) {
  const publishInterval = settings?.publishInterval || {};
  const minMinutes = normalizeIntervalMinutes(publishInterval.minMinutes, PUBLISH_INTERVAL_DEFAULT_MIN_MINUTES);
  const maxMinutes = normalizeIntervalMinutes(publishInterval.maxMinutes, PUBLISH_INTERVAL_MAX_MINUTES);

  return {
    enabled: publishInterval.enabled !== false,
    minMinutes,
    maxMinutes: Math.max(minMinutes, maxMinutes),
  };
}

async function upgradeLegacyPublishIntervalDefault(settings) {
  const publishInterval = settings?.publishInterval;

  if (!publishInterval) {
    return settings;
  }

  const legacyDefaultMin = normalizeIntervalMinutes(publishInterval.minMinutes, PUBLISH_INTERVAL_DEFAULT_MIN_MINUTES);
  const legacyDefaultMax = normalizeIntervalMinutes(publishInterval.maxMinutes, 10);
  let changed = false;

  if (!publishInterval.updatedBy && legacyDefaultMin === 0.3) {
    publishInterval.minMinutes = PUBLISH_INTERVAL_DEFAULT_MIN_MINUTES;
    changed = true;
  }

  if (!publishInterval.updatedBy && legacyDefaultMax === 2) {
    publishInterval.maxMinutes = PUBLISH_INTERVAL_MAX_MINUTES;
    changed = true;
  }

  if (changed) {
    await settings.save();
  }

  return settings;
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

async function getPublishIntervalSettings() {
  const settings = await upgradeLegacyPublishIntervalDefault(await getGlobalSettingsDoc());
  return toPublishIntervalSafeObject(settings);
}

async function updatePublishIntervalSettings({ enabled, minMinutes, maxMinutes, actor, req }) {
  const settings = await getGlobalSettingsDoc();
  const nextMinMinutes = normalizeIntervalMinutes(minMinutes, PUBLISH_INTERVAL_DEFAULT_MIN_MINUTES);
  const nextMaxMinutes = normalizeIntervalMinutes(maxMinutes, PUBLISH_INTERVAL_MAX_MINUTES);

  if (nextMinMinutes < PUBLISH_INTERVAL_MIN_MINUTES || nextMinMinutes > PUBLISH_INTERVAL_MAX_MINUTES) {
    throw new HttpError(400, 'Minimum ad account interval must be between 10 seconds and 10 minutes');
  }

  if (nextMaxMinutes < PUBLISH_INTERVAL_MIN_MINUTES || nextMaxMinutes > PUBLISH_INTERVAL_MAX_MINUTES) {
    throw new HttpError(400, 'Maximum ad account interval must be between 10 seconds and 10 minutes');
  }

  if (nextMaxMinutes < nextMinMinutes) {
    throw new HttpError(400, 'Maximum ad account interval must be greater than or equal to minimum interval');
  }

  settings.publishInterval.enabled = Boolean(enabled);
  settings.publishInterval.minMinutes = nextMinMinutes;
  settings.publishInterval.maxMinutes = nextMaxMinutes;
  settings.publishInterval.updatedBy = actor?._id || null;
  await settings.save();

  await writeActivityLog({
    user: actor,
    action: 'SETTINGS_PUBLISH_INTERVAL_UPDATED',
    entity: 'Settings',
    metadata: {
      enabled: settings.publishInterval.enabled,
      minMinutes: settings.publishInterval.minMinutes,
      maxMinutes: settings.publishInterval.maxMinutes,
    },
    req,
  });

  return toPublishIntervalSafeObject(settings);
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
  const queuedCount = summary.queued ?? failed.filter((item) => item.queued).length;
  const failedCount = Math.max((summary.failed ?? failed.length) - queuedCount, 0);
  const lines = [
    'Meta publish completed',
    `Launch: ${launch?.launchLabel || 'Ads Launch'}`,
    `Requested: ${summary.requested ?? results.length + failed.length}`,
    `Published: ${summary.published ?? results.length}`,
    `Failed: ${failedCount}`,
    `Queued: ${queuedCount}`,
  ];

  if (failed.length) {
    lines.push('', 'Failed accounts:');
    failed.slice(0, 8).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.adAccountName || item.adAccountId}: ${item.message || 'Failed'}${item.queued ? ' (queued)' : ''}`);
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

function buildPublishQueueStatusText({ status, message, records = [] }) {
  const lines = [
    `Meta publish queue ${status}`,
    message || '',
  ].filter(Boolean);

  if (records.length) {
    lines.push('', 'Queue records:');
    records.slice(0, 8).forEach((record, index) => {
      const queue = record.publishQueue || {};
      const nextAttempt = queue.nextAttemptAt ? new Date(queue.nextAttemptAt).toLocaleString() : '';
      lines.push(
        `${index + 1}. ${record.adAccount?.name || record.adAccount?.id || record.campaignId}: ${queue.status || record.status}${nextAttempt ? `, next ${nextAttempt}` : ''}`
      );
      if (queue.lastError || record.lastMetaError) {
        lines.push(`   ${queue.lastError || record.lastMetaError}`);
      }
    });
  }

  return lines.join('\n').slice(0, 3900);
}

async function notifyPublishQueueStatus({ status, message, records = [] }) {
  try {
    return await sendTelegramMessage({
      text: buildPublishQueueStatusText({ status, message, records }),
    });
  } catch (error) {
    return {
      sent: false,
      error: error.message,
    };
  }
}

module.exports = {
  getPublishIntervalSettings,
  getTelegramSettings,
  notifyPublishQueueStatus,
  notifyPublishSummary,
  testTelegramSettings,
  updatePublishIntervalSettings,
  updateTelegramSettings,
};
