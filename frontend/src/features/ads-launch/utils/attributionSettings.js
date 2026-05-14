export const DEFAULT_ATTRIBUTION_WINDOWS = Object.freeze({
  clickThrough: '7D',
  engagedView: '1D',
  viewThrough: '1D',
});

export const clickThroughWindowOptions = [
  { value: '1D', label: '1 day' },
  { value: '7D', label: '7 days' },
];

export const engagedViewWindowOptions = [
  { value: 'NONE', label: 'None' },
  { value: '1D', label: '1 day' },
];

export const viewThroughWindowOptions = [
  { value: 'NONE', label: 'None' },
  { value: '1D', label: '1 day' },
];

const clickThroughLabels = {
  '1D': '1-day',
  '7D': '7-day',
};

const optionalWindowLabels = {
  NONE: 'No',
  '1D': '1-day',
};

const normalizeClickThrough = (value) => (value === '1D' || value === '7D' ? value : DEFAULT_ATTRIBUTION_WINDOWS.clickThrough);
const normalizeOptionalWindow = (value, fallback) => (value === 'NONE' || value === '1D' ? value : fallback);

const windowsFromLegacySetting = (setting) => {
  const normalizedSetting = String(setting || '').trim().toUpperCase();

  if (normalizedSetting === 'CLICK_1D') {
    return {
      clickThrough: '1D',
      engagedView: 'NONE',
      viewThrough: 'NONE',
    };
  }

  if (normalizedSetting === 'CLICK_7D') {
    return {
      clickThrough: '7D',
      engagedView: 'NONE',
      viewThrough: 'NONE',
    };
  }

  if (normalizedSetting === 'CLICK_1D_VIEW_1D') {
    return {
      clickThrough: '1D',
      engagedView: 'NONE',
      viewThrough: '1D',
    };
  }

  if (normalizedSetting === 'CLICK_7D_VIEW_1D') {
    return {
      clickThrough: '7D',
      engagedView: 'NONE',
      viewThrough: '1D',
    };
  }

  return { ...DEFAULT_ATTRIBUTION_WINDOWS };
};

export const normalizeAttributionWindows = (staticDefaults = {}) => {
  const rawWindows = staticDefaults?.attributionWindows || {};
  const hasStructuredWindows = ['clickThrough', 'engagedView', 'viewThrough'].some((key) => rawWindows[key]);
  const fallbackWindows = hasStructuredWindows
    ? DEFAULT_ATTRIBUTION_WINDOWS
    : windowsFromLegacySetting(staticDefaults?.attributionSetting);

  return {
    clickThrough: normalizeClickThrough(rawWindows.clickThrough || fallbackWindows.clickThrough),
    engagedView: normalizeOptionalWindow(rawWindows.engagedView || fallbackWindows.engagedView, fallbackWindows.engagedView),
    viewThrough: normalizeOptionalWindow(rawWindows.viewThrough || fallbackWindows.viewThrough, fallbackWindows.viewThrough),
  };
};

export const getAttributionSettingFromWindows = (windows = {}) => {
  const normalizedWindows = normalizeAttributionWindows({
    attributionWindows: windows,
  });
  const clickPrefix = normalizedWindows.clickThrough === '1D' ? 'CLICK_1D' : 'CLICK_7D';

  return normalizedWindows.viewThrough === '1D' ? `${clickPrefix}_VIEW_1D` : clickPrefix;
};

export const withAttributionStaticDefaults = (staticDefaults = {}) => {
  const attributionWindows = normalizeAttributionWindows(staticDefaults);

  return {
    ...staticDefaults,
    attributionWindows,
    attributionSetting: getAttributionSettingFromWindows(attributionWindows),
  };
};

export const mergeAttributionStaticDefaults = (baseDefaults = {}, overrideDefaults = {}) => {
  const hasOverrideDefaults = overrideDefaults && Object.keys(overrideDefaults).length > 0;
  const mergedDefaults = {
    ...baseDefaults,
    ...overrideDefaults,
  };

  if (hasOverrideDefaults && !overrideDefaults.attributionWindows) {
    delete mergedDefaults.attributionWindows;
  }

  return withAttributionStaticDefaults(mergedDefaults);
};

export const formatAttributionWindows = (staticDefaults = {}) => {
  const attributionWindows = normalizeAttributionWindows(staticDefaults);
  const parts = [
    `${clickThroughLabels[attributionWindows.clickThrough]} click`,
    `${optionalWindowLabels[attributionWindows.engagedView]} engaged-view`,
    `${optionalWindowLabels[attributionWindows.viewThrough]} view`,
  ];

  return parts.join(' + ');
};
