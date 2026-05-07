/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { tokensApi } from '../../token-management/api/tokensApi';
import { businessDataApi } from '../api/businessDataApi';

const MetaSyncContext = createContext(null);
const SYNC_TOAST_ID = 'meta-social-account-sync';
const CLEAR_DELAY_MS = 8000;
const API_CALL_POLL_MS = 1500;

const getSyncSummaryMessage = (accountName, summary = {}) =>
  `${accountName}: ${summary.created || 0} new, ${summary.updated || 0} updated, ${summary.skipped || 0} skipped, ${summary.apiCalls || 0} API calls`;

export const MetaSyncProvider = ({ children }) => {
  const [syncState, setSyncState] = useState({
    active: false,
    accountId: null,
    accountName: '',
    apiCallsSent: 0,
    message: '',
    sourceTokenId: null,
    status: 'idle',
  });
  const activeRef = useRef(false);
  const clearTimerRef = useRef(null);

  const clearLater = useCallback(() => {
    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current);
    }

    clearTimerRef.current = window.setTimeout(() => {
      setSyncState({
        active: false,
        accountId: null,
        accountName: '',
        apiCallsSent: 0,
        message: '',
        sourceTokenId: null,
        status: 'idle',
      });
    }, CLEAR_DELAY_MS);
  }, []);

  const getTokenApiCallCount = useCallback(async (tokenId) => {
    if (!tokenId) {
      return null;
    }

    const data = await tokensApi.getTokens();
    const token = data.tokens.find((item) => item.id === tokenId);

    return token ? Number(token.apiCallCount) || 0 : null;
  }, []);

  const startSocialAccountSync = useCallback(
    async (account) => {
      if (activeRef.current) {
        toast('A Meta data fetch is already running. You can keep working while it finishes.', {
          position: 'top-center',
        });
        return null;
      }

      activeRef.current = true;
      let pollId = null;
      let apiCallBaseline = 0;
      let latestApiCallsSent = 0;
      const sourceTokenId = account.sourceTokenId || null;
      const baseMessage = 'Fetching real Meta campaigns, ad sets, ads, media, pages, and insights';
      const getLoadingMessage = (apiCallsSent) =>
        `${baseMessage}. API calls sent: ${apiCallsSent}`;
      const updateLoadingToast = (apiCallsSent) => {
        toast.loading(`Fetching real Meta data for ${account.name}... API calls sent: ${apiCallsSent}`, {
          id: SYNC_TOAST_ID,
          duration: Infinity,
          position: 'top-center',
        });
      };

      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current);
      }

      if (sourceTokenId) {
        try {
          apiCallBaseline = await getTokenApiCallCount(sourceTokenId) ?? 0;
        } catch {
          apiCallBaseline = 0;
        }
      }

      setSyncState({
        active: true,
        accountId: account.id,
        accountName: account.name,
        apiCallsSent: 0,
        message: getLoadingMessage(0),
        sourceTokenId,
        status: 'active',
      });
      updateLoadingToast(0);

      if (sourceTokenId) {
        const pollApiCallCount = async () => {
          try {
            const currentCount = await getTokenApiCallCount(sourceTokenId);

            if (currentCount === null) {
              return;
            }

            latestApiCallsSent = Math.max(currentCount - apiCallBaseline, 0);
            setSyncState((current) =>
              current.active && current.accountId === account.id
                ? {
                    ...current,
                    apiCallsSent: latestApiCallsSent,
                    message: getLoadingMessage(latestApiCallsSent),
                  }
                : current
            );
            updateLoadingToast(latestApiCallsSent);
          } catch {
            // Keep the fetch running even if the lightweight progress poll fails.
          }
        };

        pollId = window.setInterval(pollApiCallCount, API_CALL_POLL_MS);
      }

      try {
        const data = await businessDataApi.syncSocialAccount(account.id);
        if (pollId) {
          window.clearInterval(pollId);
          pollId = null;
        }
        const message = getSyncSummaryMessage(account.name, data.summary);
        const finalApiCallsSent = Number(data.summary?.apiCalls) || latestApiCallsSent;

        setSyncState({
          active: false,
          accountId: account.id,
          accountName: account.name,
          apiCallsSent: finalApiCallsSent,
          message,
          sourceTokenId,
          status: 'completed',
        });
        toast.success(`Fetch finished. ${message}`, {
          id: SYNC_TOAST_ID,
          duration: 6000,
          position: 'top-center',
        });

        if (data.summary?.errors?.length) {
          toast.error(data.summary.errors[0].message, {
            duration: 7000,
            position: 'top-center',
          });
        }

        window.dispatchEvent(
          new CustomEvent('meta-sync-completed', {
            detail: {
              accountId: account.id,
              summary: data.summary,
            },
          })
        );
        clearLater();
        return data;
      } catch (requestError) {
        const message = requestError.message || 'Meta data fetch failed';

        setSyncState({
          active: false,
          accountId: account.id,
          accountName: account.name,
          apiCallsSent: latestApiCallsSent,
          message,
          sourceTokenId,
          status: 'failed',
        });
        toast.error(message, {
          id: SYNC_TOAST_ID,
          duration: 7000,
          position: 'top-center',
        });
        clearLater();
        return null;
      } finally {
        if (pollId) {
          window.clearInterval(pollId);
        }
        activeRef.current = false;
      }
    },
    [clearLater, getTokenApiCallCount]
  );

  useEffect(
    () => () => {
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current);
      }
    },
    []
  );

  const value = useMemo(
    () => ({
      startSocialAccountSync,
      syncState,
      syncingAccountId: syncState.active ? syncState.accountId : null,
    }),
    [startSocialAccountSync, syncState]
  );

  return <MetaSyncContext.Provider value={value}>{children}</MetaSyncContext.Provider>;
};

export const useMetaSync = () => {
  const context = useContext(MetaSyncContext);

  if (!context) {
    throw new Error('useMetaSync must be used within MetaSyncProvider');
  }

  return context;
};
