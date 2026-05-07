import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export const META_KEY_TYPES = Object.freeze({
  PROFILE: 'PROFILE',
  SYSTEM_USER: 'SYSTEM_USER',
});

export const META_KEY_TYPE_LABELS = Object.freeze({
  [META_KEY_TYPES.PROFILE]: 'Profile Access Token',
  [META_KEY_TYPES.SYSTEM_USER]: 'System User Token',
});

const SETTINGS_STORAGE_KEY = 'meta-key-settings';
const defaultSettings = {
  fetchTokenType: META_KEY_TYPES.PROFILE,
  publishTokenType: META_KEY_TYPES.PROFILE,
};
const MetaKeySettingsContext = createContext(null);

function normalizeTokenType(value) {
  return Object.values(META_KEY_TYPES).includes(value) ? value : META_KEY_TYPES.PROFILE;
}

function readStoredSettings() {
  try {
    const storedValue = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsedValue = storedValue ? JSON.parse(storedValue) : {};

    return {
      fetchTokenType: normalizeTokenType(parsedValue.fetchTokenType),
      publishTokenType: normalizeTokenType(parsedValue.publishTokenType),
    };
  } catch {
    return defaultSettings;
  }
}

export const MetaKeySettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(() =>
    typeof window === 'undefined' ? defaultSettings : readStoredSettings()
  );

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const value = useMemo(
    () => ({
      ...settings,
      setFetchTokenType: (tokenType) =>
        setSettings((current) => ({
          ...current,
          fetchTokenType: normalizeTokenType(tokenType),
        })),
      setPublishTokenType: (tokenType) =>
        setSettings((current) => ({
          ...current,
          publishTokenType: normalizeTokenType(tokenType),
        })),
    }),
    [settings]
  );

  return <MetaKeySettingsContext.Provider value={value}>{children}</MetaKeySettingsContext.Provider>;
};

export const getMetaKeyTypeLabel = (tokenType) =>
  META_KEY_TYPE_LABELS[normalizeTokenType(tokenType)] || META_KEY_TYPE_LABELS[META_KEY_TYPES.PROFILE];

export const useMetaKeySettings = () => {
  const context = useContext(MetaKeySettingsContext);

  if (!context) {
    throw new Error('useMetaKeySettings must be used within MetaKeySettingsProvider');
  }

  return context;
};
