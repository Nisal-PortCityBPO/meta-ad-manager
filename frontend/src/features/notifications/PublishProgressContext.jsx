import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { adsLaunchApi } from '../ads-launch/api/adsLaunchApi';

const PublishProgressContext = createContext(null);
const SUCCESS_CLEAR_DELAY_MS = 12000;
const HISTORY_STORAGE_KEY = 'meta-manager.ads-publish-history.v1';
const HISTORY_SEEN_STORAGE_KEY = 'meta-manager.ads-publish-history-seen-at.v1';
const HISTORY_LIMIT = 15;
const HISTORY_EVENT_LIMIT = 120;
const ACTIVE_SESSION_STATUSES = new Set(['active', 'pausing']);
const LIVE_QUEUE_RAW_STATUSES = new Set(['PENDING']);
const TRACKED_LIVE_STATUSES = new Set(['active', 'pausing', 'queued']);

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

const normalizeServerSession = (session) => {
  if (!session?.id && !session?.sessionId) {
    return null;
  }

  const events = Array.isArray(session.events) ? session.events.slice(-HISTORY_EVENT_LIMIT) : [];
  const progress = session.progress || events.at(-1) || null;

  return {
    id: session.id || session.sessionId,
    title: session.title || 'Ads publish',
    source: session.source || 'Meta publish',
    status: session.status || progress?.status || 'active',
    rawStatus: session.rawStatus || '',
    startedAt: session.startedAt || progress?.timestamp || new Date().toISOString(),
    completedAt: session.completedAt || '',
    progress,
    events,
    latestResult: session.latestResult || null,
    latestError: session.latestError || '',
    canPause: Boolean(session.canPause),
    canResume: Boolean(session.canResume),
    resumeCount: session.resumeCount || 0,
    pauseRequested: Boolean(session.pauseRequested),
    queue: session.queue || null,
  };
};

const sortHistory = (history) =>
  [...history].sort((first, second) => String(getHistorySortTime(second)).localeCompare(String(getHistorySortTime(first))));

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
  const [pauseBusy, setPauseBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const activeSessionRef = useRef(null);
  const publishHistoryUnreadCount = publishHistory.filter((item) => getHistorySortTime(item) > publishHistorySeenAt).length;

  const commitHistoryItem = (item) => {
    setPublishHistory((current) => {
      const nextHistory = sortHistory([item, ...current.filter((historyItem) => historyItem.id !== item.id)]).slice(0, HISTORY_LIMIT);
      writeStoredHistory(nextHistory);
      return nextHistory;
    });
  };

  const applyServerSessions = useCallback((sessions = []) => {
    const normalizedSessions = sessions.map(normalizeServerSession).filter(Boolean);

    if (!normalizedSessions.length) {
      return;
    }

    setPublishHistory((current) => {
      const serverIds = new Set(normalizedSessions.map((session) => session.id));
      const nextHistory = sortHistory([
        ...normalizedSessions,
        ...current.filter((historyItem) => !serverIds.has(historyItem.id)),
      ]).slice(0, HISTORY_LIMIT);
      writeStoredHistory(nextHistory);
      return nextHistory;
    });

    const activeSession =
      normalizedSessions.find(
        (session) =>
          session.id === activeSessionRef.current?.id &&
          (ACTIVE_SESSION_STATUSES.has(session.status) || LIVE_QUEUE_RAW_STATUSES.has(session.rawStatus) || (session.status === 'paused' && session.canResume))
      ) ||
      normalizedSessions.find((session) => ACTIVE_SESSION_STATUSES.has(session.status)) ||
      normalizedSessions.find((session) => LIVE_QUEUE_RAW_STATUSES.has(session.rawStatus)) ||
      normalizedSessions.find((session) => session.status === 'paused' && session.canResume);

    if (!activeSession) {
      return;
    }

    activeSessionRef.current = activeSession;
    setCurrentPublishId(activeSession.id);
    setIsPublishing(ACTIVE_SESSION_STATUSES.has(activeSession.status) || LIVE_QUEUE_RAW_STATUSES.has(activeSession.rawStatus));
    setLatestResult(activeSession.latestResult || null);
    setLatestError(activeSession.latestError || '');
    setEvents((activeSession.events || []).slice(-40));
    setProgress(activeSession.progress || null);
  }, []);

  const applyPublishSessions = useCallback((sessions = []) => {
    applyServerSessions(sessions);
  }, [applyServerSessions]);

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
    return session.id;
  };

  const pushPublishEvent = (event) => {
    if (event?.type === 'session' && event.session) {
      applyServerSessions([event.session]);
      return;
    }

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
      id: nextEvent.sessionId || session.id,
      status: ['failed', 'paused', 'pausing'].includes(nextEvent.status) ? nextEvent.status : 'active',
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
    const pausedCount = Number(result?.summary?.paused || result?.resumeCount || 0);
    const hardFailedCount = Math.max(failedCount - queuedCount, 0);
    const completedAt = new Date().toISOString();
    const status = pausedCount > 0 || result?.paused ? 'paused' : hardFailedCount > 0 ? 'failed' : queuedCount > 0 ? 'queued' : 'completed';
    const message = result.message;
    const errorMessage =
      status === 'paused'
        ? ''
        : hardFailedCount > 0
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
        completed:
          status === 'paused'
            ? currentProgress.progress?.completed || 0
            : currentProgress.progress?.total || currentProgress.progress?.completed || 0,
        percent: status === 'paused' ? currentProgress.progress?.percent || 0 : 100,
        etaSeconds: status === 'paused' ? null : 0,
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
      canResume: status === 'paused',
      resumeCount: pausedCount,
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
    setPauseBusy(false);
    setResumeBusy(false);
    activeSessionRef.current = null;
  };

  const clearPublishHistory = useCallback(async () => {
    const result = await adsLaunchApi.clearPublishSessionsHistory();
    writeStoredHistory([]);
    setPublishHistory([]);
    const seenAt = new Date().toISOString();
    writeSeenAt(seenAt);
    setPublishHistorySeenAt(readSeenAt());

    try {
      const data = await adsLaunchApi.getPublishSessions({ limit: HISTORY_LIMIT });
      applyServerSessions(data.sessions || []);
    } catch {
      // The delete already succeeded; the next poll will restore active/queued sessions if needed.
    }

    return result;
  }, [applyServerSessions]);

  const focusPublishSession = useCallback((sessionId) => {
    const session = publishHistory.find((item) => item.id === sessionId);

    if (!session) {
      return false;
    }

    activeSessionRef.current = session;
    setCurrentPublishId(session.id);
    setIsPublishing(ACTIVE_SESSION_STATUSES.has(session.status) || LIVE_QUEUE_RAW_STATUSES.has(session.rawStatus));
    setLatestResult(session.latestResult || null);
    setLatestError(session.latestError || '');
    setEvents((session.events || []).slice(-40));
    setProgress(session.progress || null);
    setShowStartPopup(false);
    return true;
  }, [publishHistory]);

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

  const refreshPublishSessions = useCallback(async () => {
    try {
      const data = await adsLaunchApi.getPublishSessions({ limit: HISTORY_LIMIT });
      applyServerSessions(data.sessions || []);
    } catch {
      // Local history still works if the backend is momentarily unreachable.
    }
  }, [applyServerSessions]);

  const requestPausePublish = useCallback(async (sessionId = currentPublishId) => {
    if (!sessionId) {
      throw new Error('No live publish session to pause');
    }

    setPauseBusy(true);
    try {
      const data = await adsLaunchApi.pausePublishSession(sessionId);
      if (data.session) {
        applyServerSessions([data.session]);
      }
      return data;
    } finally {
      setPauseBusy(false);
    }
  }, [applyServerSessions, currentPublishId]);

  const resumePausedPublish = useCallback(async (sessionId = currentPublishId) => {
    if (!sessionId) {
      throw new Error('No paused publish session to continue');
    }

    setResumeBusy(true);
    try {
      const data = await adsLaunchApi.resumePublishSession(sessionId);
      if (data.session) {
        applyServerSessions([data.session]);
      }
      setShowStartPopup(true);
      return data;
    } finally {
      setResumeBusy(false);
    }
  }, [applyServerSessions, currentPublishId]);

  useEffect(() => {
    refreshPublishSessions();
  }, [refreshPublishSessions]);

  useEffect(() => {
    const hasTrackedLivePublish = publishHistory.some(
      (item) => TRACKED_LIVE_STATUSES.has(item.status) || LIVE_QUEUE_RAW_STATUSES.has(item.rawStatus)
    );

    if (!isPublishing && !hasTrackedLivePublish && !ACTIVE_SESSION_STATUSES.has(progress?.status) && activeSessionRef.current?.rawStatus !== 'PENDING') {
      return undefined;
    }

    const pollMs = progress?.step === 'account-interval' || progress?.status === 'waiting' ? 1000 : 4000;
    const intervalId = window.setInterval(refreshPublishSessions, pollMs);
    return () => window.clearInterval(intervalId);
  }, [isPublishing, progress?.status, progress?.step, publishHistory, refreshPublishSessions]);

  useEffect(() => {
    if (!latestResult || isPublishing || progress?.status === 'paused') {
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
      focusPublishSession,
      isPublishing,
      latestError,
      latestResult,
      markPublishHistorySeen,
      pauseBusy,
      progress,
      publishHistory,
      publishHistoryUnreadCount,
      applyPublishSessions,
      pushPublishEvent,
      refreshPublishSessions,
      requestPausePublish,
      resumeBusy,
      resumePausedPublish,
      showStartPopup,
    }),
    [
      currentPublishId,
      events,
      isPublishing,
      latestError,
      latestResult,
      pauseBusy,
      progress,
      publishHistory,
      publishHistorySeenAt,
      publishHistoryUnreadCount,
      applyPublishSessions,
      clearPublishHistory,
      focusPublishSession,
      refreshPublishSessions,
      requestPausePublish,
      resumeBusy,
      resumePausedPublish,
      showStartPopup,
    ]
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
