/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { tokensApi } from '../../token-management/api/tokensApi';
import { getMetaKeyTypeLabel, META_KEY_TYPES, useMetaKeySettings } from '../../settings/MetaKeySettingsContext';
import { businessDataApi } from '../api/businessDataApi';

const MetaSyncContext = createContext(null);
const SYNC_TOAST_ID = 'meta-social-account-sync';
const CLEAR_DELAY_MS = 8000;
const API_CALL_POLL_MS = 1500;

export const getAdAccountSyncKey = (profileId, adAccountId) =>
  profileId && adAccountId ? `${profileId}:${adAccountId}` : '';

const getSyncSummaryMessage = (accountName, summary = {}) =>
  `${accountName}: ${summary.created || 0} new, ${summary.updated || 0} updated, ${summary.skipped || 0} skipped, ${summary.apiCalls || 0} API calls`;

const getAdAccountIdForSync = (adAccount = {}) => adAccount.id || adAccount.accountId || '';

export const MetaSyncProvider = ({ children }) => {
  const { fetchTokenType } = useMetaKeySettings();
  const [syncState, setSyncState] = useState({
    active: false,
    adAccountId: null,
    accountId: null,
    accountName: '',
    apiCallsSent: 0,
    message: '',
    profileId: null,
    scope: 'idle',
    sourceTokenId: null,
    status: 'idle',
    syncKey: null,
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
        adAccountId: null,
        accountId: null,
        accountName: '',
        apiCallsSent: 0,
        message: '',
        profileId: null,
        scope: 'idle',
        sourceTokenId: null,
        status: 'idle',
        syncKey: null,
      });
    }, CLEAR_DELAY_MS);
  }, []);

  const getTokenApiCallCount = useCallback(async (tokenId, tokenType = META_KEY_TYPES.PROFILE) => {
    if (!tokenId) {
      return null;
    }

    const data = await tokensApi.getTokens();
    const token = data.tokens.find((item) => item.id === tokenId);

    if (!token) {
      return null;
    }

    return tokenType === META_KEY_TYPES.SYSTEM_USER
      ? Number(token.systemUserApiCallCount) || 0
      : Number(token.profileApiCallCount ?? token.apiCallCount) || 0;
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
      const keyLabel = getMetaKeyTypeLabel(fetchTokenType);
      const baseMessage = 'Fetching real Meta campaigns, ad sets, ads, media, pages, and insights';
      const getLoadingMessage = (apiCallsSent) =>
        `${baseMessage} using ${keyLabel}. API calls sent: ${apiCallsSent}`;
      const updateLoadingToast = (apiCallsSent) => {
        toast.loading(`Fetching ${account.sourceTokenLabel || 'Meta connection'} / ${account.name} with ${keyLabel}. API calls sent: ${apiCallsSent}`, {
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
          apiCallBaseline = await getTokenApiCallCount(sourceTokenId, fetchTokenType) ?? 0;
        } catch {
          apiCallBaseline = 0;
        }
      }

      setSyncState({
        active: true,
        adAccountId: null,
        accountId: account.id,
        accountName: account.name,
        apiCallsSent: 0,
        message: getLoadingMessage(0),
        profileId: null,
        scope: 'social-account',
        sourceTokenId,
        status: 'active',
        syncKey: null,
      });
      updateLoadingToast(0);

      if (sourceTokenId) {
        const pollApiCallCount = async () => {
          try {
            const currentCount = await getTokenApiCallCount(sourceTokenId, fetchTokenType);

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
        const data = await businessDataApi.syncSocialAccount(account.id, fetchTokenType);
        if (pollId) {
          window.clearInterval(pollId);
          pollId = null;
        }
        const message = getSyncSummaryMessage(account.name, data.summary);
        const finalApiCallsSent = Number(data.summary?.apiCalls) || latestApiCallsSent;

        setSyncState({
          active: false,
          adAccountId: null,
          accountId: account.id,
          accountName: account.name,
          apiCallsSent: finalApiCallsSent,
          message,
          profileId: null,
          scope: 'social-account',
          sourceTokenId,
          status: 'completed',
          syncKey: null,
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
          adAccountId: null,
          accountId: account.id,
          accountName: account.name,
          apiCallsSent: latestApiCallsSent,
          message,
          profileId: null,
          scope: 'social-account',
          sourceTokenId,
          status: 'failed',
          syncKey: null,
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
    [clearLater, fetchTokenType, getTokenApiCallCount]
  );

  const startAdAccountSync = useCallback(
    async ({ account = {}, profile = {}, adAccount = {} } = {}) => {
      if (activeRef.current) {
        toast('A Meta data fetch is already running. You can keep working while it finishes.', {
          position: 'top-center',
        });
        return null;
      }

      const profileId = profile.id;
      const adAccountId = getAdAccountIdForSync(adAccount);

      if (!profileId || !adAccountId) {
        toast.error('Select a saved ad account before fetching.', {
          position: 'top-center',
        });
        return null;
      }

      activeRef.current = true;
      let pollId = null;
      let apiCallBaseline = 0;
      let latestApiCallsSent = 0;
      const sourceTokenId = account.sourceTokenId || profile.sourceTokenId || null;
      const keyLabel = getMetaKeyTypeLabel(fetchTokenType);
      const adAccountName = adAccount.name || 'Selected ad account';
      const syncKey = getAdAccountSyncKey(profileId, adAccountId);
      const connectionLabel = account.sourceTokenLabel || profile.sourceTokenLabel || 'Meta connection';
      const baseMessage = `Fetching selected ad account data for ${adAccountName}`;
      const getLoadingMessage = (apiCallsSent) =>
        `${baseMessage} using ${keyLabel}. API calls sent: ${apiCallsSent}`;
      const updateLoadingToast = (apiCallsSent) => {
        toast.loading(`Fetching ${connectionLabel} / ${adAccountName} with ${keyLabel}. API calls sent: ${apiCallsSent}`, {
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
          apiCallBaseline = await getTokenApiCallCount(sourceTokenId, fetchTokenType) ?? 0;
        } catch {
          apiCallBaseline = 0;
        }
      }

      setSyncState({
        active: true,
        adAccountId,
        accountId: account.id || null,
        accountName: account.name || '',
        apiCallsSent: 0,
        message: getLoadingMessage(0),
        profileId,
        scope: 'ad-account',
        sourceTokenId,
        status: 'active',
        syncKey,
      });
      updateLoadingToast(0);

      if (sourceTokenId) {
        const pollApiCallCount = async () => {
          try {
            const currentCount = await getTokenApiCallCount(sourceTokenId, fetchTokenType);

            if (currentCount === null) {
              return;
            }

            latestApiCallsSent = Math.max(currentCount - apiCallBaseline, 0);
            setSyncState((current) =>
              current.active && current.syncKey === syncKey
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
        const data = await businessDataApi.syncAdAccount(profileId, adAccountId, fetchTokenType, sourceTokenId);
        if (pollId) {
          window.clearInterval(pollId);
          pollId = null;
        }
        const message = getSyncSummaryMessage(adAccountName, data.summary);
        const finalApiCallsSent = Number(data.summary?.apiCalls) || latestApiCallsSent;

        setSyncState({
          active: false,
          adAccountId,
          accountId: account.id || null,
          accountName: account.name || '',
          apiCallsSent: finalApiCallsSent,
          message,
          profileId,
          scope: 'ad-account',
          sourceTokenId,
          status: 'completed',
          syncKey,
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
              accountId: account.id || null,
              adAccountId,
              profileId,
              scope: 'ad-account',
              summary: data.summary,
            },
          })
        );
        clearLater();
        return data;
      } catch (requestError) {
        const message = requestError.message || 'Ad account fetch failed';

        setSyncState({
          active: false,
          adAccountId,
          accountId: account.id || null,
          accountName: account.name || '',
          apiCallsSent: latestApiCallsSent,
          message,
          profileId,
          scope: 'ad-account',
          sourceTokenId,
          status: 'failed',
          syncKey,
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
    [clearLater, fetchTokenType, getTokenApiCallCount]
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
      startAdAccountSync,
      syncState,
      syncingAdAccountKey: syncState.active && syncState.scope === 'ad-account' ? syncState.syncKey : null,
      syncingAccountId: syncState.active ? syncState.accountId : null,
    }),
    [startAdAccountSync, startSocialAccountSync, syncState]
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
