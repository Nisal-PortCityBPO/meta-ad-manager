import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const PublishProgressContext = createContext(null);
const SUCCESS_CLEAR_DELAY_MS = 12000;

export const PublishProgressProvider = ({ children }) => {
  const [isPublishing, setIsPublishing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [events, setEvents] = useState([]);
  const [latestResult, setLatestResult] = useState(null);
  const [latestError, setLatestError] = useState('');
  const [showStartPopup, setShowStartPopup] = useState(false);

  const beginPublish = () => {
    setIsPublishing(true);
    setLatestResult(null);
    setLatestError('');
    setEvents([]);
    setShowStartPopup(true);
    setProgress({
      type: 'progress',
      status: 'active',
      step: 'prepare',
      message: 'Ad publish started',
      progress: {
        completed: 0,
        total: 0,
        percent: 0,
        etaSeconds: null,
        elapsedSeconds: 0,
      },
    });
  };

  const pushPublishEvent = (event) => {
    setProgress(event);
    setEvents((current) => [...current, event].slice(-40));
  };

  const completePublish = (result) => {
    setLatestResult(result);
    setIsPublishing(false);
    setShowStartPopup(false);
    setProgress((current) => ({
      ...(current || {}),
      type: 'progress',
      status: 'completed',
      step: 'complete',
      message: result.message,
      progress: {
        ...(current?.progress || {}),
        completed: current?.progress?.total || current?.progress?.completed || 0,
        percent: 100,
        etaSeconds: 0,
      },
    }));
  };

  const failPublish = (message) => {
    setLatestError(message);
    setIsPublishing(false);
    setShowStartPopup(false);
    setProgress((current) => ({
      ...(current || {}),
      type: 'progress',
      status: 'failed',
      step: 'failed',
      message,
    }));
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
      clearPublishState,
      completePublish,
      dismissStartPopup,
      events,
      failPublish,
      isPublishing,
      latestError,
      latestResult,
      progress,
      pushPublishEvent,
      showStartPopup,
    }),
    [events, isPublishing, latestError, latestResult, progress, showStartPopup]
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
