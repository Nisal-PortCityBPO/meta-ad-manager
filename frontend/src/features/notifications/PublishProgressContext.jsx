import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const PublishProgressContext = createContext(null);
const SUCCESS_CLEAR_DELAY_MS = 12000;
const HISTORY_STORAGE_KEY = 'meta-manager.ads-publish-history.v1';
const HISTORY_SEEN_STORAGE_KEY = 'meta-manager.ads-publish-history-seen-at.v1';
const HISTORY_LIMIT = 15;
const HISTORY_EVENT_LIMIT = 120;

const readStoredHistory = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
};

const writeStoredHistory = (history) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
  } catch {
    // Storage can be blocked in private windows; live progress should still work.
  }
};

const readSeenAt = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(HISTORY_SEEN_STORAGE_KEY) || '';
};

const writeSeenAt = (value) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(HISTORY_SEEN_STORAGE_KEY, value);
};

const getHistorySortTime = (item = {}) => item.completedAt || item.progress?.timestamp || item.startedAt || '';

const createInitialProgress = () => ({
  type: 'progress',
  status: 'active',
  step: 'prepare',
  timestamp: new Date().toISOString(),
  message: 'Ad publish started',
  progress: {
    completed: 0,
    total: 0,
    percent: 0,
    etaSeconds: null,
    elapsedSeconds: 0,
  },
});

export const PublishProgressProvider = ({ children }) => {
  const [isPublishing, setIsPublishing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [events, setEvents] = useState([]);
  const [latestResult, setLatestResult] = useState(null);
  const [latestError, setLatestError] = useState('');
  const [showStartPopup, setShowStartPopup] = useState(false);
  const [publishHistory, setPublishHistory] = useState(readStoredHistory);
  const [publishHistorySeenAt, setPublishHistorySeenAt] = useState(readSeenAt);
  const [currentPublishId, setCurrentPublishId] = useState('');
  const activeSessionRef = useRef(null);
  const publishHistoryUnreadCount = publishHistory.filter((item) => getHistorySortTime(item) > publishHistorySeenAt).length;

  const commitHistoryItem = (item) => {
    setPublishHistory((current) => {
      const nextHistory = [item, ...current.filter((historyItem) => historyItem.id !== item.id)].slice(0, HISTORY_LIMIT);
      writeStoredHistory(nextHistory);
      return nextHistory;
    });
  };

  const beginPublish = ({ title = 'Ads publish', source = 'Meta publish' } = {}) => {
    const initialProgress = createInitialProgress();
    const session = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      source,
      status: 'active',
      startedAt: initialProgress.timestamp,
      completedAt: '',
      progress: initialProgress,
      events: [initialProgress],
      latestResult: null,
      latestError: '',
    };

    activeSessionRef.current = session;
    setCurrentPublishId(session.id);
    setIsPublishing(true);
    setLatestResult(null);
    setLatestError('');
    setEvents(session.events);
    setShowStartPopup(true);
    setProgress(initialProgress);
    commitHistoryItem(session);
  };

  const pushPublishEvent = (event) => {
    const nextEvent = {
      timestamp: new Date().toISOString(),
      ...event,
    };
    const session = activeSessionRef.current || {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: 'Ads publish',
      source: 'Meta publish',
      status: 'active',
      startedAt: nextEvent.timestamp,
      completedAt: '',
      events: [],
      latestResult: null,
      latestError: '',
    };
    const nextEvents = [...(session.events || []), nextEvent].slice(-HISTORY_EVENT_LIMIT);
    const nextSession = {
      ...session,
      status: nextEvent.status === 'failed' ? 'failed' : 'active',
      progress: nextEvent,
      events: nextEvents,
    };

    activeSessionRef.current = nextSession;
    setCurrentPublishId(nextSession.id);
    setProgress(nextEvent);
    setEvents(nextEvents.slice(-40));
    commitHistoryItem(nextSession);
  };

  const completePublish = (result) => {
    const failedCount = Number(result?.summary?.failed || result?.failed?.length || 0);
    const queuedCount = Number(result?.summary?.queued || result?.failed?.filter?.((item) => item.queued).length || 0);
    const hardFailedCount = Math.max(failedCount - queuedCount, 0);
    const completedAt = new Date().toISOString();
    const status = hardFailedCount > 0 ? 'failed' : queuedCount > 0 ? 'queued' : 'completed';
    const message = result.message;
    const errorMessage =
      hardFailedCount > 0
        ? `${hardFailedCount} ad account${hardFailedCount === 1 ? '' : 's'} failed during publish`
        : queuedCount > 0
          ? `${queuedCount} ad account${queuedCount === 1 ? '' : 's'} queued for automatic retry`
          : '';

    setLatestResult(result);
    setLatestError(errorMessage);
    setIsPublishing(false);
    setShowStartPopup(false);
    const currentProgress = activeSessionRef.current?.progress || progress || {};
    const finalProgress = {
      ...currentProgress,
      type: 'progress',
      status,
      step: 'complete',
      timestamp: completedAt,
      message,
      progress: {
        ...(currentProgress.progress || {}),
        completed: currentProgress.progress?.total || currentProgress.progress?.completed || 0,
        percent: 100,
        etaSeconds: 0,
      },
    };
    const session = activeSessionRef.current || {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: 'Ads publish',
      source: 'Meta publish',
      startedAt: completedAt,
      events: [],
    };
    const nextSession = {
      ...session,
      status,
      completedAt,
      progress: finalProgress,
      events: [...(session.events || []), finalProgress].slice(-HISTORY_EVENT_LIMIT),
      latestResult: result,
      latestError: errorMessage,
    };

    activeSessionRef.current = nextSession;
    setCurrentPublishId(nextSession.id);
    setEvents(nextSession.events.slice(-40));
    setProgress(finalProgress);
    commitHistoryItem(nextSession);
  };

  const failPublish = (message) => {
    const completedAt = new Date().toISOString();
    setLatestError(message);
    setIsPublishing(false);
    setShowStartPopup(false);
    const currentProgress = activeSessionRef.current?.progress || progress || {};
    const finalProgress = {
      ...currentProgress,
      type: 'progress',
      status: 'failed',
      step: 'failed',
      timestamp: completedAt,
      message,
    };
    const session = activeSessionRef.current || {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: 'Ads publish',
      source: 'Meta publish',
      startedAt: completedAt,
      events: [],
    };
    const nextSession = {
      ...session,
      status: 'failed',
      completedAt,
      progress: finalProgress,
      events: [...(session.events || []), finalProgress].slice(-HISTORY_EVENT_LIMIT),
      latestResult: null,
      latestError: message,
    };

    activeSessionRef.current = nextSession;
    setCurrentPublishId(nextSession.id);
    setEvents(nextSession.events.slice(-40));
    setProgress(finalProgress);
    commitHistoryItem(nextSession);
  };

  const dismissStartPopup = () => {
    setShowStartPopup(false);
  };

  const clearPublishState = () => {
    setIsPublishing(false);
    setProgress(null);
    setEvents([]);
    setLatestResult(null);
    setLatestError('');
    setShowStartPopup(false);
    setCurrentPublishId('');
    activeSessionRef.current = null;
  };

  const clearPublishHistory = () => {
    writeStoredHistory([]);
    setPublishHistory([]);
    writeSeenAt(new Date().toISOString());
    setPublishHistorySeenAt(readSeenAt());
  };

  const markPublishHistorySeen = () => {
    const latestTimestamp = publishHistory
      .map(getHistorySortTime)
      .filter(Boolean)
      .sort()
      .at(-1);

    if (!latestTimestamp || latestTimestamp <= publishHistorySeenAt) {
      return;
    }

    writeSeenAt(latestTimestamp);
    setPublishHistorySeenAt(latestTimestamp);
  };

  useEffect(() => {
    if (!latestResult || isPublishing) {
      return undefined;
    }

    const timeoutId = window.setTimeout(clearPublishState, SUCCESS_CLEAR_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [isPublishing, latestResult]);

  const value = useMemo(
    () => ({
      beginPublish,
      clearPublishHistory,
      clearPublishState,
      completePublish,
      currentPublishId,
      dismissStartPopup,
      events,
      failPublish,
      isPublishing,
      latestError,
      latestResult,
      markPublishHistorySeen,
      progress,
      publishHistory,
      publishHistoryUnreadCount,
      pushPublishEvent,
      showStartPopup,
    }),
    [currentPublishId, events, isPublishing, latestError, latestResult, progress, publishHistory, publishHistorySeenAt, publishHistoryUnreadCount, showStartPopup]
  );

  return <PublishProgressContext.Provider value={value}>{children}</PublishProgressContext.Provider>;
};

export const usePublishProgress = () => {
  const context = useContext(PublishProgressContext);

  if (!context) {
    throw new Error('usePublishProgress must be used within PublishProgressProvider');
  }

  return context;
};
