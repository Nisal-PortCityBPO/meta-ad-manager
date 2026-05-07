const DEFAULT_META_API_REQUEST_DELAY_MS = 700;
const MAX_META_API_REQUEST_DELAY_MS = 15000;

let nextAllowedRequestAt = 0;
let pacingQueue = Promise.resolve();

function getMetaApiRequestDelayMs() {
  const configuredDelay = Number(process.env.META_API_REQUEST_DELAY_MS);

  if (!Number.isFinite(configuredDelay)) {
    return DEFAULT_META_API_REQUEST_DELAY_MS;
  }

  return Math.min(Math.max(Math.round(configuredDelay), 0), MAX_META_API_REQUEST_DELAY_MS);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForMetaApiPacing() {
  const delayMs = getMetaApiRequestDelayMs();

  if (!delayMs) {
    return;
  }

  const queuedWait = pacingQueue.then(async () => {
    const waitMs = Math.max(nextAllowedRequestAt - Date.now(), 0);

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    nextAllowedRequestAt = Date.now() + delayMs;
  });

  pacingQueue = queuedWait.catch(() => {});
  await queuedWait;
}

module.exports = {
  getMetaApiRequestDelayMs,
  waitForMetaApiPacing,
};
