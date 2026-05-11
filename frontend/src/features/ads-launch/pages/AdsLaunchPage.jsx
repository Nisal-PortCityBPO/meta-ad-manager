import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  FolderOpen,
  Globe2,
  ImageIcon,
  KeyRound,
  Layers3,
  LoaderCircle,
  MousePointerClick,
  Pencil,
  Plus,
  Rocket,
  Save,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { businessDataApi } from '../../dashboard/api/businessDataApi';
import { useTokens } from '../../token-management/hooks/useTokens';
import { usePublishProgress } from '../../notifications/PublishProgressContext';
import { useMetaKeySettings } from '../../settings/MetaKeySettingsContext';
import { adsLaunchApi } from '../api/adsLaunchApi';
import MediaLibraryFolderPicker from '../components/MediaLibraryFolderPicker';
import { useLaunchTemplates } from '../hooks/useLaunchTemplates';
import { useTokenMetaAssets } from '../hooks/useTokenMetaAssets';
import { createVideoThumbnailFile } from '../utils/videoThumbnail';

const countryOptions = [
  { value: 'ID', label: 'Indonesia' },
  { value: 'IN', label: 'India' },
  { value: 'CN', label: 'China' },
  { value: 'LK', label: 'Sri Lanka' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
];

const TEMPLATES_PER_PAGE = 2;

const TRAFFIC_OBJECTIVE = 'OUTCOME_TRAFFIC';
const LEADS_OBJECTIVE = 'OUTCOME_LEADS';
const SALES_OBJECTIVE = 'OUTCOME_SALES';
const supportedObjectiveValues = new Set([TRAFFIC_OBJECTIVE, LEADS_OBJECTIVE, SALES_OBJECTIVE]);

const objectiveOptions = [
  { value: TRAFFIC_OBJECTIVE, label: 'Traffic' },
  { value: 'OUTCOME_ENGAGEMENT', label: 'Engagement' },
  { value: LEADS_OBJECTIVE, label: 'Leads' },
  { value: SALES_OBJECTIVE, label: 'Sales' },
];

const defaultWebsiteEventByObjective = {
  [LEADS_OBJECTIVE]: 'LEAD',
  [SALES_OBJECTIVE]: 'PURCHASE',
};

const normalizeObjective = (objective) => (supportedObjectiveValues.has(objective) ? objective : TRAFFIC_OBJECTIVE);

const websiteEventOptions = [
  { value: 'LEAD', label: 'Lead' },
  { value: 'PURCHASE', label: 'Purchase' },
  { value: 'COMPLETE_REGISTRATION', label: 'Complete registration' },
  { value: 'ADD_TO_CART', label: 'Add to cart' },
  { value: 'INITIATE_CHECKOUT', label: 'Initiate checkout' },
  { value: 'VIEW_CONTENT', label: 'View content' },
  { value: 'CONTACT', label: 'Contact' },
  { value: 'SUBSCRIBE', label: 'Subscribe' },
];

const callToActionOptions = [
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'CONTACT_US', label: 'Contact Us' },
  { value: 'APPLY_NOW', label: 'Apply Now' },
];

const urlParameterMacroOptions = [
  { value: '{{site_source_name}}', label: 'Source platform' },
  { value: '{{placement}}', label: 'Placement' },
  { value: '{{campaign.name}}', label: 'Campaign name' },
  { value: '{{campaign.id}}', label: 'Campaign ID' },
  { value: '{{adset.name}}', label: 'Ad set name' },
  { value: '{{adset.id}}', label: 'Ad set ID' },
  { value: '{{ad.name}}', label: 'Ad name' },
  { value: '{{ad.id}}', label: 'Ad ID' },
];

const urlParameterBuilderRows = [
  { key: 'utm_source', label: 'Source', placeholder: '{{site_source_name}}' },
  { key: 'utm_medium', label: 'Medium', placeholder: 'paid_social' },
  { key: 'utm_campaign', label: 'Campaign', placeholder: '{{campaign.name}}' },
  { key: 'utm_content', label: 'Content', placeholder: '{{ad.name}}' },
  { key: 'utm_term', label: 'Term', placeholder: '{{adset.name}}' },
  { key: 'placement', label: 'Placement', placeholder: '{{placement}}' },
];

const urlParameterPresets = [
  {
    label: 'GA4 recommended',
    value:
      'utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}',
  },
  {
    label: 'Full Meta detail',
    value:
      'utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}',
  },
  {
    label: 'Simple Meta',
    value: 'utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}',
  },
];

const staticDefaultOptions = {
  buyingType: [
    { value: 'AUCTION', label: 'Auction' },
  ],
  campaignStatus: [
    { value: 'PAUSED', label: 'Paused on create' },
    { value: 'ACTIVE', label: 'Active on create' },
  ],
  specialAdCategories: [
    { value: 'NONE', label: 'None' },
    { value: 'HOUSING', label: 'Housing' },
    { value: 'EMPLOYMENT', label: 'Employment' },
    { value: 'CREDIT', label: 'Credit' },
  ],
  placements: [
    { value: 'ADVANTAGE_PLUS', label: 'Advantage+ placements' },
  ],
  budgetLevel: [
    { value: 'AD_SET', label: 'Ad set budget' },
    { value: 'CAMPAIGN', label: 'Campaign budget' },
  ],
  dynamicCreative: [
    { value: 'ON', label: 'On' },
    { value: 'OFF', label: 'Off' },
  ],
  genderTargeting: [
    { value: 'ALL', label: 'All genders' },
    { value: 'MALE', label: 'Male' },
    { value: 'FEMALE', label: 'Female' },
  ],
  billingEvent: [
    { value: 'IMPRESSIONS', label: 'Impressions' },
    { value: 'LINK_CLICKS', label: 'Link clicks' },
  ],
  bidStrategy: [
    { value: 'LOWEST_COST_WITHOUT_CAP', label: 'Lowest cost' },
    { value: 'LOWEST_COST_WITH_BID_CAP', label: 'Bid cap' },
    { value: 'COST_CAP', label: 'Cost cap' },
  ],
};

const cappedBidStrategies = new Set(['LOWEST_COST_WITH_BID_CAP', 'COST_CAP']);

const defaultStaticDefaults = {
  buyingType: 'AUCTION',
  campaignStatus: 'PAUSED',
  specialAdCategories: 'NONE',
  placements: 'ADVANTAGE_PLUS',
  budgetLevel: 'AD_SET',
  dynamicCreative: 'ON',
  audienceAgeMin: '21',
  audienceAgeMax: '65',
  genderTargeting: 'ALL',
  billingEvent: 'IMPRESSIONS',
  bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
  bidAmount: '',
};

const emptyForm = {
  launchLabel: '',
  brandId: '',
  tokenId: '',
  country: 'ID',
  countries: ['ID'],
  objective: 'OUTCOME_TRAFFIC',
  dailyBudget: '15',
  selectedAdAccountIds: [],
  pageId: '',
  pixelId: '',
  websiteEvent: 'LEAD',
  headline: '',
  primaryText: '',
  description: '',
  websiteUrl: '',
  displayUrl: '',
  urlParameters: '',
  scheduleStart: '',
  scheduleEnd: '',
  callToAction: 'LEARN_MORE',
  staticDefaults: defaultStaticDefaults,
};

const createEmptyForm = () => ({
  ...emptyForm,
  countries: [...emptyForm.countries],
  selectedAdAccountIds: [],
  staticDefaults: {
    ...defaultStaticDefaults,
  },
});

const FieldLabel = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-700">
    {children}
  </label>
);

const InfoPill = ({ icon: Icon, children, tone = 'sky' }) => {
  const tones = {
    amber: 'bg-amber-50 text-amber-700',
    sky: 'bg-sky-50 text-sky-700',
  };

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${tones[tone]}`}>
      <Icon size={13} strokeWidth={2.4} />
      {children}
    </span>
  );
};

const EmptyState = ({ children }) => (
  <div className="rounded-2xl border border-dashed border-sky-100 bg-sky-50/70 px-4 py-6 text-sm font-semibold text-slate-500">
    {children}
  </div>
);

const formatDateTime = (value) => {
  if (!value) {
    return 'Not yet';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const SCHEDULE_MIN_LEAD_MINUTES = 5;

const getLocalDateTimeInputValue = (date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

const getMinimumScheduleStartValue = () => getLocalDateTimeInputValue(new Date(Date.now() + SCHEDULE_MIN_LEAD_MINUTES * 60 * 1000));

const hasExplicitTimezone = (value) => /(Z|[+-]\d{2}:?\d{2})$/i.test(String(value || '').trim());

const getLocalTimezoneOffsetSuffix = (date = new Date()) => {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
  const minutes = String(absoluteMinutes % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
};

const toSchedulePayloadValue = (value) => {
  const normalizedValue = String(value || '').trim();

  if (!normalizedValue) {
    return '';
  }

  if (hasExplicitTimezone(normalizedValue)) {
    return normalizedValue;
  }

  const withSeconds = normalizedValue.length === 16 ? `${normalizedValue}:00` : normalizedValue;
  return `${withSeconds}${getLocalTimezoneOffsetSuffix(new Date(withSeconds))}`;
};

const toDateTimeLocalInputValue = (value) => {
  const normalizedValue = String(value || '').trim();

  if (!normalizedValue) {
    return '';
  }

  if (!hasExplicitTimezone(normalizedValue)) {
    return normalizedValue.slice(0, 16);
  }

  const date = new Date(normalizedValue.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(date.getTime()) ? '' : getLocalDateTimeInputValue(date);
};

const parseHttpUrl = (value) => {
  const normalizedValue = String(value || '').trim();

  if (!normalizedValue) {
    return null;
  }

  const candidate = /^[a-z][a-z\d+\-.]*:\/\//i.test(normalizedValue) ? normalizedValue : `https://${normalizedValue}`;

  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') ? url : null;
  } catch {
    return null;
  }
};

const normalizeUrlParameterString = (value) =>
  String(value || '')
    .trim()
    .replace(/^[?&]+/, '')
    .split('&')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const separatorIndex = segment.indexOf('=');

      if (separatorIndex === -1) {
        return segment;
      }

      const key = segment.slice(0, separatorIndex).trim();
      const parameterValue = segment.slice(separatorIndex + 1).trim();
      return `${key}=${parameterValue}`;
    })
    .join('&');

const parseUrlParameterEntries = (value) => {
  const normalizedValue = normalizeUrlParameterString(value);

  if (!normalizedValue) {
    return [];
  }

  return normalizedValue.split('&').map((segment) => {
    const separatorIndex = segment.indexOf('=');

    if (separatorIndex === -1) {
      return {
        key: segment.trim(),
        value: '',
      };
    }

    return {
      key: segment.slice(0, separatorIndex).trim(),
      value: segment.slice(separatorIndex + 1).trim(),
    };
  });
};

const getUrlParameterEntryValue = (entries, key) => entries.find((entry) => entry.key === key)?.value || '';

const orderUrlParameterEntries = (entries) => {
  const order = new Map(urlParameterBuilderRows.map((row, index) => [row.key, index]));

  return [...entries].sort((first, second) => {
    const firstOrder = order.has(first.key) ? order.get(first.key) : Number.MAX_SAFE_INTEGER;
    const secondOrder = order.has(second.key) ? order.get(second.key) : Number.MAX_SAFE_INTEGER;

    if (firstOrder !== secondOrder) {
      return firstOrder - secondOrder;
    }

    return first.key.localeCompare(second.key);
  });
};

const stringifyUrlParameterEntries = (entries) =>
  orderUrlParameterEntries(entries)
    .filter((entry) => entry.key.trim() && entry.value.trim())
    .map((entry) => `${entry.key.trim()}=${entry.value.trim()}`)
    .join('&');

const getUrlParameterValidationError = (value) => {
  const entries = parseUrlParameterEntries(value);

  if (!entries.length) {
    return '';
  }

  const seenKeys = new Set();

  for (const entry of entries) {
    if (!entry.key || !entry.value) {
      return 'URL parameters must use key=value format and cannot have blank values';
    }

    if (!/^[A-Za-z0-9_.~-]+$/.test(entry.key)) {
      return `URL parameter key "${entry.key}" can only use letters, numbers, dot, underscore, dash, or tilde`;
    }

    if (/\s/.test(entry.key) || /\s/.test(entry.value)) {
      return 'URL parameter keys and values cannot contain spaces. Use underscores or Meta dynamic values instead.';
    }

    if (seenKeys.has(entry.key)) {
      return `URL parameter "${entry.key}" is duplicated`;
    }

    seenKeys.add(entry.key);
  }

  return '';
};

const getLaunchValidationError = (form) => {
  const objective = normalizeObjective(form.objective);
  const pixelRequired = objective === 'OUTCOME_LEADS' || objective === 'OUTCOME_SALES';

  if (pixelRequired && !form.websiteEvent) {
    return 'Select the website event to optimize for';
  }

  if (form.displayUrl.trim() && !parseHttpUrl(form.displayUrl)) {
    return 'Display URL must be a valid domain or URL, for example example.com or https://example.com';
  }

  const urlParameterError = getUrlParameterValidationError(form.urlParameters);
  if (urlParameterError) {
    return urlParameterError;
  }

  if ((form.scheduleStart && !form.scheduleEnd) || (!form.scheduleStart && form.scheduleEnd)) {
    return 'Schedule start and schedule end must both be set, or both left empty';
  }

  if (form.scheduleStart) {
    const scheduleStart = new Date(form.scheduleStart);
    const minimumStart = new Date(Date.now() + SCHEDULE_MIN_LEAD_MINUTES * 60 * 1000);

    if (Number.isNaN(scheduleStart.getTime())) {
      return 'Schedule start must be a valid date and time';
    }

    if (scheduleStart < minimumStart) {
      return `Schedule start must be at least ${SCHEDULE_MIN_LEAD_MINUTES} minutes in the future`;
    }
  }

  if (form.scheduleEnd) {
    const scheduleStart = new Date(form.scheduleStart);
    const scheduleEnd = new Date(form.scheduleEnd);

    if (Number.isNaN(scheduleEnd.getTime())) {
      return 'Schedule end must be a valid date and time';
    }

    if (scheduleEnd <= scheduleStart) {
      return 'Schedule end must be after schedule start';
    }
  }

  return '';
};

const getScheduleValidationError = (form) => {
  if ((form.scheduleStart && !form.scheduleEnd) || (!form.scheduleStart && form.scheduleEnd)) {
    return 'Schedule start and schedule end must both be set, or both left empty';
  }

  if (form.scheduleStart) {
    const scheduleStart = new Date(form.scheduleStart);
    const minimumStart = new Date(Date.now() + SCHEDULE_MIN_LEAD_MINUTES * 60 * 1000);

    if (Number.isNaN(scheduleStart.getTime())) {
      return 'Schedule start must be a valid date and time';
    }

    if (scheduleStart < minimumStart) {
      return `Schedule start must be at least ${SCHEDULE_MIN_LEAD_MINUTES} minutes in the future`;
    }
  }

  if (form.scheduleEnd) {
    const scheduleStart = new Date(form.scheduleStart);
    const scheduleEnd = new Date(form.scheduleEnd);

    if (Number.isNaN(scheduleEnd.getTime())) {
      return 'Schedule end must be a valid date and time';
    }

    if (scheduleEnd <= scheduleStart) {
      return 'Schedule end must be after schedule start';
    }
  }

  return '';
};

const getLaunchMissingFields = ({ activeMediaAsset, activeThumbnailAsset, bidAmountRequired, form, isVideoAsset, loadingAssets, loadingPixels, pixelRequired }) => {
  const missing = [];

  if (!form.countries?.length) missing.push('countries');
  if (!form.brandId) missing.push('brand');
  if (!form.tokenId) missing.push('token');
  if (loadingAssets) missing.push('ad accounts still loading');
  if (!form.selectedAdAccountIds.length) missing.push('ad account');
  if (!form.pageId) missing.push('page');
  if (pixelRequired && loadingPixels) missing.push('pixel still loading');
  if (pixelRequired && !form.pixelId) missing.push('shared pixel');
  if (!form.launchLabel.trim()) missing.push('launch name');
  if (!form.primaryText.trim()) missing.push('primary text');
  if (!form.headline.trim()) missing.push('headline');
  if (!form.websiteUrl.trim()) missing.push('destination URL');
  if (bidAmountRequired && (!form.staticDefaults.bidAmount || Number(form.staticDefaults.bidAmount) <= 0)) missing.push('bid/cost cap amount');
  if (!activeMediaAsset) missing.push('creative file');
  if (isVideoAsset && !activeThumbnailAsset) missing.push('video thumbnail');

  return missing;
};

const readFileAsDataUrl = (file, onProgress) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      onProgress?.(100);
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.min(Math.round((event.loaded / event.total) * 100), 99));
      }
    };
    reader.readAsDataURL(file);
  });

const readImageMetadata = (file) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        duration: 0,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read dimensions for ${file.name}`));
    };
    image.src = url;
  });

const readVideoMetadata = (file) =>
  new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration || 0,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read video details for ${file.name}`));
    };
    video.src = url;
  });

const readMediaMetadata = (file) => (file?.type?.startsWith('video/') ? readVideoMetadata(file) : readImageMetadata(file));

const normalizeStoredAsset = (asset) => {
  if (!asset?.name || !asset?.type) {
    return null;
  }

  const previewUrl = asset.url || asset.dataUrl || '';
  if (!previewUrl) {
    return null;
  }

  return {
    name: asset.name,
    type: asset.type,
    url: previewUrl,
    size: asset.size || 0,
  };
};

const isLocalTemplateAssetUrl = (url) =>
  typeof url === 'string' && url.startsWith('/api/ads-launch/templates/');

const buildName = (...parts) => parts.filter(Boolean).join(' | ');

const normalizeTemplateCountries = (config = {}) => {
  const countries = Array.isArray(config.countries) ? config.countries.filter(Boolean) : [];
  return countries.length ? countries : config.country ? [config.country] : ['ID'];
};

const getAdAccountKeys = (account = {}) =>
  [account.id, account.accountId, String(account.id || '').replace(/^act_/, '')]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

const MetricCard = ({ label, value, detail }) => (
  <div className="rounded-2xl border border-sky-100 bg-white px-4 py-4 shadow-sm shadow-sky-100/70">
    <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">{label}</p>
    <p className="mt-2 break-words text-lg font-black text-slate-950 sm:text-2xl">{value}</p>
    {detail ? <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p> : null}
  </div>
);

const FormFieldCard = ({ htmlFor, label, helper, children }) => (
  <div className="flex h-full flex-col rounded-2xl border border-sky-100 bg-white p-4">
    <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
    <div className="mt-2">{children}</div>
    <p className="mt-2 min-h-10 text-xs font-semibold text-slate-400">{helper}</p>
  </div>
);

const getOptionLabel = (options, value) => options.find((option) => option.value === value)?.label || value;

const AdsLaunchPage = () => {
  const { error: tokensError, loading: tokensLoading, tokens } = useTokens();
  const {
    adAccounts,
    error: assetsError,
    loadAssets,
    loadPixels,
    loadingAssets,
    loadingPixels,
    pages,
    pixelError,
    pixels,
    warnings,
  } = useTokenMetaAssets();
  const { error: templatesError, loadTemplates, loading: templatesLoading, templates } = useLaunchTemplates();
  const {
    applyPublishSessions,
    isPublishing: publishInProgress,
    refreshPublishSessions,
  } = usePublishProgress();
  const { publishTokenType } = useMetaKeySettings();

  const [form, setForm] = useState(createEmptyForm);
  const [brands, setBrands] = useState([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [brandsError, setBrandsError] = useState('');
  const [activeTemplateId, setActiveTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [editingStaticDefaults, setEditingStaticDefaults] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [latestPublish, setLatestPublish] = useState(null);
  const [templatePage, setTemplatePage] = useState(1);
  const [templatePreview, setTemplatePreview] = useState(null);
  const [urlParameterDraft, setUrlParameterDraft] = useState({
    key: '',
    value: '',
  });
  const [mediaFile, setMediaFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [savedMediaAsset, setSavedMediaAsset] = useState(null);
  const [savedThumbnailAsset, setSavedThumbnailAsset] = useState(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState('');
  const [mediaAssets, setMediaAssets] = useState([]);
  const [mediaFolders, setMediaFolders] = useState([]);
  const [mediaAssetsLoading, setMediaAssetsLoading] = useState(false);
  const [mediaLibraryPickerMode, setMediaLibraryPickerMode] = useState('');
  const [creativeSource, setCreativeSource] = useState('saved');
  const [thumbnailSource, setThumbnailSource] = useState('saved');
  const [defaultVideoThumbnail, setDefaultVideoThumbnail] = useState(null);
  const [creativeUploadProgress, setCreativeUploadProgress] = useState(null);

  const activeTokens = useMemo(() => tokens.filter((token) => token.status === 'ACTIVE'), [tokens]);
  const activeTemplate = useMemo(
    () => templates.find((template) => template.id === activeTemplateId) || null,
    [activeTemplateId, templates]
  );
  const selectedBrand = brands.find((brand) => brand.id === form.brandId) || null;
  const selectedBrandSocialAccounts = useMemo(
    () => (Array.isArray(selectedBrand?.assignedSocialAccounts) ? selectedBrand.assignedSocialAccounts : []),
    [selectedBrand]
  );
  const brandTokenOptions = useMemo(() => {
    if (!selectedBrandSocialAccounts.length) {
      return [];
    }

    const tokenSummaries = new Map();

    selectedBrandSocialAccounts.forEach((account) => {
      if (!account.sourceTokenId) {
        return;
      }

      if (!tokenSummaries.has(account.sourceTokenId)) {
        const activeToken = activeTokens.find((token) => token.id === account.sourceTokenId);
        tokenSummaries.set(account.sourceTokenId, {
          id: account.sourceTokenId,
          label: activeToken?.label || account.sourceTokenLabel || 'Meta token',
          accessToken: activeToken?.accessToken || '',
          adsPowerProfile: activeToken?.adsPowerProfile || account.adsPowerProfile || '',
          socialAccountNames: [],
          isActive: Boolean(activeToken),
        });
      }

      tokenSummaries.get(account.sourceTokenId).socialAccountNames.push(account.name);
    });

    return Array.from(tokenSummaries.values())
      .filter((token) => token.isActive)
      .sort((first, second) => first.label.localeCompare(second.label));
  }, [activeTokens, selectedBrandSocialAccounts]);
  const selectedToken = activeTokens.find((token) => token.id === form.tokenId) || null;
  const selectedPage = pages.find((page) => page.id === form.pageId) || null;
  const selectedPixel = pixels.find((pixel) => pixel.id === form.pixelId) || null;
  const selectedBrandSavedAccountKeys = useMemo(() => {
    if (!form.tokenId || !selectedBrandSocialAccounts.length) {
      return new Set();
    }

    const accountKeys = new Set();

    selectedBrandSocialAccounts
      .filter((account) => account.sourceTokenId === form.tokenId)
      .flatMap((account) => (Array.isArray(account.businessProfiles) ? account.businessProfiles : []))
      .flatMap((profile) => (Array.isArray(profile.adAccounts) ? profile.adAccounts : []))
      .forEach((account) => {
        getAdAccountKeys(account).forEach((key) => accountKeys.add(key));
      });

    return accountKeys;
  }, [form.tokenId, selectedBrandSocialAccounts]);
  const scopedAdAccounts = useMemo(() => {
    if (!form.brandId || !form.tokenId) {
      return [];
    }

    if (!selectedBrandSavedAccountKeys.size) {
      return adAccounts;
    }

    return adAccounts.filter((account) => getAdAccountKeys(account).some((key) => selectedBrandSavedAccountKeys.has(key)));
  }, [adAccounts, form.brandId, form.tokenId, selectedBrandSavedAccountKeys]);
  const hasBrandSavedAdAccounts = selectedBrandSavedAccountKeys.size > 0;
  const launchTemplates = useMemo(
    () =>
      templates.filter(
        (template) =>
          (!template.templateType || template.templateType === 'FULL') &&
          (!form.brandId || !template.config?.brandId || template.config.brandId === form.brandId)
      ),
    [form.brandId, templates]
  );
  const templatePageCount = Math.max(Math.ceil(launchTemplates.length / TEMPLATES_PER_PAGE), 1);
  const safeTemplatePage = Math.min(Math.max(templatePage, 1), templatePageCount);
  const visibleTemplates = useMemo(
    () => launchTemplates.slice((safeTemplatePage - 1) * TEMPLATES_PER_PAGE, safeTemplatePage * TEMPLATES_PER_PAGE),
    [launchTemplates, safeTemplatePage]
  );
  const selectedAdAccounts = useMemo(
    () => {
      const selectedKeys = new Set(form.selectedAdAccountIds);
      return scopedAdAccounts.filter((account) => getAdAccountKeys(account).some((key) => selectedKeys.has(key)));
    },
    [scopedAdAccounts, form.selectedAdAccountIds]
  );
  const selectedCountryLabel = useMemo(
    () =>
      (form.countries || [])
        .map((countryCode) => countryOptions.find((country) => country.value === countryCode)?.label || countryCode)
        .join(', '),
    [form.countries]
  );
  const selectedCountryOptions = useMemo(
    () =>
      (form.countries || []).map(
        (countryCode) => countryOptions.find((country) => country.value === countryCode) || { value: countryCode, label: countryCode }
      ),
    [form.countries]
  );
  const urlParameterEntries = useMemo(() => parseUrlParameterEntries(form.urlParameters), [form.urlParameters]);
  const availableCountryOptions = useMemo(
    () => countryOptions.filter((country) => !(form.countries || []).includes(country.value)),
    [form.countries]
  );
  const activeMediaAsset = mediaFile
    ? {
        name: mediaFile.name,
        type: mediaFile.type,
        url: mediaPreviewUrl,
      }
    : savedMediaAsset;
  const activeThumbnailAsset = thumbnailFile
    ? {
        name: thumbnailFile.name,
        type: thumbnailFile.type,
        url: thumbnailPreviewUrl,
      }
    : savedThumbnailAsset;
  const activeMediaPreviewUrl = activeMediaAsset?.url || '';
  const activeThumbnailPreviewUrl = activeThumbnailAsset?.url || '';
  const isVideoAsset = activeMediaAsset?.type?.startsWith('video/') || false;
  const brandScopedMediaAssets = useMemo(
    () => mediaAssets.filter((mediaAsset) => !form.brandId || mediaAsset.brandId === form.brandId),
    [form.brandId, mediaAssets]
  );
  const brandScopedMediaFolders = useMemo(
    () => mediaFolders.filter((mediaFolder) => !form.brandId || mediaFolder.brandId === form.brandId),
    [form.brandId, mediaFolders]
  );
  const imageMediaAssets = useMemo(
    () => brandScopedMediaAssets.filter((mediaAsset) => mediaAsset.mediaType === 'IMAGE'),
    [brandScopedMediaAssets]
  );
  const currentObjective = normalizeObjective(form.objective);
  const pixelRequired = currentObjective === 'OUTCOME_LEADS' || currentObjective === 'OUTCOME_SALES';
  const bidAmountRequired = cappedBidStrategies.has(form.staticDefaults.bidStrategy);
  const scheduleValidationError = getScheduleValidationError(form);
  const canGenerate = Boolean(
    form.brandId &&
      form.tokenId &&
      !loadingAssets &&
      form.launchLabel.trim() &&
      (form.countries || []).length &&
      form.selectedAdAccountIds.length &&
      form.pageId &&
      (!pixelRequired || !loadingPixels) &&
      (!pixelRequired || form.pixelId) &&
      form.headline.trim() &&
      form.primaryText.trim() &&
      form.websiteUrl.trim() &&
      (!bidAmountRequired || Number(form.staticDefaults.bidAmount) > 0) &&
      !scheduleValidationError
  );
  const canPublish = Boolean(canGenerate && activeMediaAsset && (!isVideoAsset || activeThumbnailAsset));
  const publishBusy = publishing;
  const minimumScheduleStartValue = getMinimumScheduleStartValue();

  useEffect(() => {
    if (!mediaFile) {
      setMediaPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(mediaFile);
    setMediaPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [mediaFile]);

  useEffect(() => {
    if (!thumbnailFile) {
      setThumbnailPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(thumbnailFile);
    setThumbnailPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [thumbnailFile]);

  useEffect(() => {
    const normalizedObjective = normalizeObjective(form.objective);

    if (form.objective !== normalizedObjective) {
      setForm((current) => ({
        ...current,
        objective: normalizeObjective(current.objective),
      }));
    }
  }, [form.objective]);

  useEffect(() => {
    let isMounted = true;

    businessDataApi
      .getBrands()
      .then((data) => {
        if (isMounted) {
          setBrands(data.brands || []);
          setBrandsError('');
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setBrandsError(requestError.message);
        }
      })
      .finally(() => {
        if (isMounted) {
          setBrandsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const loadMediaAssets = async (brandId = form.brandId) => {
    setMediaAssetsLoading(true);
    try {
      const [mediaData, folderData] = await Promise.all([
        adsLaunchApi.getMediaAssets({
          brandId,
        }),
        adsLaunchApi.getMediaFolders(),
      ]);
      setMediaAssets(mediaData.mediaAssets || []);
      setMediaFolders(folderData.mediaFolders || []);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setMediaAssetsLoading(false);
    }
  };

  useEffect(() => {
    loadMediaAssets(form.brandId);
  }, [form.brandId]);

  useEffect(() => {
    if (brandsLoading || form.brandId || !form.tokenId || !brands.length) {
      return;
    }

    const matchingBrandIds = new Set(
      brands
        .filter((brand) =>
          (brand.assignedSocialAccounts || []).some((account) => account.sourceTokenId === form.tokenId)
        )
        .map((brand) => brand.id)
    );

    if (matchingBrandIds.size === 1) {
      setForm((current) => ({
        ...current,
        brandId: Array.from(matchingBrandIds)[0],
      }));
    }
  }, [brands, brandsLoading, form.brandId, form.tokenId]);

  useEffect(() => {
    if (brandsLoading || tokensLoading || !form.brandId || !form.tokenId) {
      return;
    }

    if (!brandTokenOptions.some((token) => token.id === form.tokenId)) {
      setForm((current) => ({
        ...current,
        tokenId: '',
        selectedAdAccountIds: [],
        pageId: '',
        pixelId: '',
      }));
    }
  }, [brandTokenOptions, brandsLoading, form.brandId, form.tokenId, tokensLoading]);

  useEffect(() => {
    loadAssets(form.brandId && form.tokenId ? form.tokenId : '');
  }, [form.brandId, form.tokenId, loadAssets]);

  useEffect(() => {
    setTemplatePage((currentPage) => Math.min(Math.max(currentPage, 1), templatePageCount));
  }, [templatePageCount]);

  useEffect(() => {
    loadPixels(form.brandId && form.tokenId ? form.tokenId : '', form.selectedAdAccountIds);
  }, [form.brandId, form.selectedAdAccountIds, form.tokenId, loadPixels]);

  useEffect(() => {
    if (pages.length === 1 && !form.pageId) {
      setForm((current) => ({
        ...current,
        pageId: pages[0].id,
      }));
    }

    if (form.pageId && pages.length && !pages.some((page) => page.id === form.pageId)) {
      setForm((current) => ({
        ...current,
        pageId: '',
      }));
    }
  }, [form.pageId, pages]);

  useEffect(() => {
    if (form.pageId || !activeTemplate?.snapshot?.pageName || !pages.length) {
      return;
    }

    const matchingPage = pages.find((page) => page.name === activeTemplate.snapshot.pageName);
    if (matchingPage) {
      setForm((current) => ({
        ...current,
        pageId: current.pageId || matchingPage.id,
      }));
    }
  }, [activeTemplate, form.pageId, pages]);

  useEffect(() => {
    if (pixelRequired && pixels.length === 1 && !form.pixelId) {
      setForm((current) => ({
        ...current,
        pixelId: pixels[0].id,
      }));
      return;
    }

    if (form.pixelId && pixels.length && !pixels.some((pixel) => pixel.id === form.pixelId)) {
      setForm((current) => ({
        ...current,
        pixelId: '',
      }));
    }
  }, [form.pixelId, pixelRequired, pixels]);

  useEffect(() => {
    if (form.pixelId || !activeTemplate?.snapshot?.pixelName || !pixels.length) {
      return;
    }

    const matchingPixel = pixels.find((pixel) => pixel.name === activeTemplate.snapshot.pixelName);
    if (matchingPixel) {
      setForm((current) => ({
        ...current,
        pixelId: current.pixelId || matchingPixel.id,
      }));
    }
  }, [activeTemplate, form.pixelId, pixels]);

  useEffect(() => {
    if (!form.selectedAdAccountIds.length) {
      return;
    }

    if (form.brandId && form.tokenId && (loadingAssets || !scopedAdAccounts.length)) {
      return;
    }

    const scopedAccountKeyMap = new Map();
    scopedAdAccounts.forEach((account) => {
      getAdAccountKeys(account).forEach((key) => scopedAccountKeyMap.set(key, account.id));
    });

    const validAccountIds = Array.from(
      new Set(
        form.selectedAdAccountIds
          .map((accountId) => scopedAccountKeyMap.get(accountId) || '')
          .filter(Boolean)
      )
    );

    const currentAccountIds = form.selectedAdAccountIds;
    const idsChanged =
      validAccountIds.length !== currentAccountIds.length ||
      validAccountIds.some((accountId, index) => accountId !== currentAccountIds[index]);

    if (idsChanged) {
      setForm((current) => ({
        ...current,
        selectedAdAccountIds: validAccountIds,
      }));
    }
  }, [form.brandId, form.selectedAdAccountIds, form.tokenId, loadingAssets, scopedAdAccounts]);

  const previewItems = useMemo(
    () =>
      selectedAdAccounts.map((account, index) => ({
        account,
        campaignName: buildName(form.launchLabel.trim(), selectedCountryLabel, `Campaign ${index + 1}`),
        adSetName: buildName(form.launchLabel.trim(), account.name, 'Ad Set'),
        adName: buildName(form.launchLabel.trim(), selectedPage?.name || 'Ad', `Creative ${index + 1}`),
      })),
    [form.launchLabel, selectedAdAccounts, selectedCountryLabel, selectedPage]
  );

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleObjectiveChange = (objective) => {
    if (!supportedObjectiveValues.has(objective)) {
      toast.error('Engagement is not enabled in this launcher yet');
      return;
    }

    setForm((current) => {
      return {
        ...current,
        objective,
        websiteEvent: defaultWebsiteEventByObjective[objective] || '',
        pixelId: defaultWebsiteEventByObjective[objective] ? current.pixelId : '',
      };
    });
  };

  const updateUrlParameter = (key, value) => {
    const normalizedKey = key.trim();
    const normalizedValue = value.trim();
    const nextEntries = parseUrlParameterEntries(form.urlParameters).filter((entry) => entry.key !== normalizedKey);

    if (normalizedKey && normalizedValue) {
      nextEntries.push({
        key: normalizedKey,
        value: normalizedValue,
      });
    }

    updateField('urlParameters', stringifyUrlParameterEntries(nextEntries));
  };

  const applyUrlParameterPreset = (value) => {
    updateField('urlParameters', normalizeUrlParameterString(value));
  };

  const addCustomUrlParameter = () => {
    const key = urlParameterDraft.key.trim();
    const value = urlParameterDraft.value.trim();
    const validationError = getUrlParameterValidationError(`${key}=${value}`);

    if (validationError) {
      toast.error(validationError);
      return;
    }

    updateUrlParameter(key, value);
    setUrlParameterDraft({
      key: '',
      value: '',
    });
  };

  const addCountry = (countryCode) => {
    if (!countryCode) {
      return;
    }

    setForm((current) => {
      if ((current.countries || []).includes(countryCode)) {
        return current;
      }

      const countries = [...(current.countries || []), countryCode];

      return {
        ...current,
        country: countries[0] || '',
        countries,
      };
    });
  };

  const removeCountry = (countryCode) => {
    setForm((current) => {
      const currentCountries = current.countries || [];

      if (currentCountries.length <= 1) {
        return current;
      }

      const countries = currentCountries.filter((code) => code !== countryCode);

      return {
        ...current,
        country: countries[0] || '',
        countries,
      };
    });
  };

  const updateStaticDefault = (field, value) => {
    setForm((current) => ({
      ...current,
      staticDefaults: {
        ...current.staticDefaults,
        [field]: value,
      },
    }));
  };

  const clearUploadedCreativeFiles = () => {
    setMediaFile(null);
    setThumbnailFile(null);
    setDefaultVideoThumbnail(null);
  };

  const resetCreativeFiles = () => {
    clearUploadedCreativeFiles();
    setSavedMediaAsset(null);
    setSavedThumbnailAsset(null);
    setCreativeSource('saved');
    setThumbnailSource('saved');
  };

  const resetComposer = () => {
    setForm(createEmptyForm());
    setActiveTemplateId('');
    setTemplateName('');
    setEditingStaticDefaults(false);
    setLatestPublish(null);
    resetCreativeFiles();
  };

  const handleBrandChange = (brandId) => {
    setForm((current) => ({
      ...current,
      brandId,
      tokenId: '',
      selectedAdAccountIds: [],
      pageId: '',
      pixelId: '',
    }));
  };

  const handleTokenChange = (tokenId) => {
    setForm((current) => ({
      ...current,
      tokenId,
      selectedAdAccountIds: [],
      pageId: '',
      pixelId: '',
    }));
  };

  const toggleAdAccount = (accountId) => {
    setForm((current) => {
      const selectedAdAccountIds = current.selectedAdAccountIds.includes(accountId)
        ? current.selectedAdAccountIds.filter((id) => id !== accountId)
        : [...current.selectedAdAccountIds, accountId];

      return {
        ...current,
        selectedAdAccountIds,
      };
    });
  };

  const toggleSelectAllAccounts = () => {
    setForm((current) => ({
      ...current,
      selectedAdAccountIds:
        current.selectedAdAccountIds.length === scopedAdAccounts.length ? [] : scopedAdAccounts.map((account) => account.id),
    }));
  };

  const handleMediaChange = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    setMediaFile(file);
    setSavedMediaAsset(null);
    setSavedThumbnailAsset(null);
    setDefaultVideoThumbnail(null);
    setCreativeSource(file ? 'upload' : 'saved');

    if (file && !file.type.startsWith('video/')) {
      setThumbnailFile(null);
      setThumbnailSource('saved');
      return;
    }

    if (!file) {
      setThumbnailFile(null);
      setThumbnailSource('saved');
      return;
    }

    setThumbnailFile(null);
    setThumbnailSource('saved');
    setCreativeUploadProgress({ label: 'Generating video thumbnail', percent: 20 });

    try {
      const generatedThumbnail = await createVideoThumbnailFile(file);
      setDefaultVideoThumbnail(generatedThumbnail);
      setThumbnailFile(generatedThumbnail.file);
      setThumbnailSource('auto');
      setCreativeUploadProgress({ label: 'Video thumbnail ready', percent: 100 });
      window.setTimeout(() => setCreativeUploadProgress(null), 500);
      toast.success('Video thumbnail generated automatically');
    } catch (error) {
      setCreativeUploadProgress(null);
      toast.error(error.message);
    }
  };

  const handleThumbnailChange = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    setThumbnailFile(file);
    setSavedThumbnailAsset(null);
    setThumbnailSource(file ? 'upload' : 'saved');
  };

  const restoreDefaultVideoThumbnail = () => {
    if (mediaFile && defaultVideoThumbnail?.file) {
      setThumbnailFile(defaultVideoThumbnail.file);
      setSavedThumbnailAsset(null);
      setThumbnailSource('auto');
      toast.success('Default video thumbnail restored');
      return;
    }

    if (savedMediaAsset?.defaultThumbnail) {
      setThumbnailFile(null);
      setSavedThumbnailAsset(savedMediaAsset.defaultThumbnail);
      setThumbnailSource('auto');
      toast.success('Default video thumbnail restored');
      return;
    }

    toast.error('No default thumbnail is available for this video');
  };

  const normalizeMediaLibraryMediaAsset = (mediaAsset) => {
    if (!mediaAsset?.media?.url) {
      return null;
    }

    return {
      name: mediaAsset.media.name || mediaAsset.name,
      type: mediaAsset.media.type,
      url: mediaAsset.media.url,
      size: mediaAsset.media.size || 0,
      mediaAssetId: mediaAsset.id,
      defaultThumbnail: mediaAsset.thumbnail?.url
        ? {
            name: mediaAsset.thumbnail.name || `${mediaAsset.name} thumbnail`,
            type: mediaAsset.thumbnail.type || 'image/jpeg',
            url: mediaAsset.thumbnail.url,
            size: mediaAsset.thumbnail.size || 0,
          }
        : null,
    };
  };

  const normalizeMediaLibraryThumbnailAsset = (mediaAsset) => {
    if (!mediaAsset) {
      return null;
    }

    if (mediaAsset.mediaType === 'IMAGE') {
      return normalizeMediaLibraryMediaAsset(mediaAsset);
    }
    return null;
  };

  const selectMediaFromLibrary = (mediaAsset) => {
    const libraryMedia = normalizeMediaLibraryMediaAsset(mediaAsset);

    if (!libraryMedia) {
      toast.error('Selected media is missing its saved file');
      return;
    }

    setMediaFile(null);
    setSavedMediaAsset(libraryMedia);
    setDefaultVideoThumbnail(null);
    setCreativeSource('library');

    if (mediaAsset.mediaType === 'VIDEO') {
      setThumbnailFile(null);
      setSavedThumbnailAsset(libraryMedia.defaultThumbnail || null);
      setThumbnailSource(libraryMedia.defaultThumbnail ? 'auto' : 'saved');
      toast.success(
        libraryMedia.defaultThumbnail
          ? 'Video selected with its auto thumbnail'
          : 'Video selected. Choose or upload a separate image thumbnail.'
      );
    } else {
      setThumbnailFile(null);
      setSavedThumbnailAsset(null);
      setThumbnailSource('saved');
      toast.success(`Selected ${mediaAsset.name}`);
    }

    setMediaLibraryPickerMode('');
  };

  const selectThumbnailFromLibrary = (mediaAsset) => {
    const libraryThumbnail = normalizeMediaLibraryThumbnailAsset(mediaAsset);

    if (!libraryThumbnail) {
      toast.error('Selected thumbnail is missing its saved image');
      return;
    }

    setThumbnailFile(null);
    setSavedThumbnailAsset(libraryThumbnail);
    setThumbnailSource('library');
    setMediaLibraryPickerMode('');
    toast.success(`Selected thumbnail ${mediaAsset.name}`);
  };

  const serializeAssetForTemplate = async (file, label = 'Preparing creative file') => {
    if (!file) {
      return null;
    }

    return {
      name: file.name,
      type: file.type,
      dataUrl: await readFileAsDataUrl(file, (percent) => setCreativeUploadProgress({ label, percent })),
    };
  };

  const serializeStoredAssetForTemplate = async (asset) => {
    if (!asset?.url) {
      return null;
    }

    const response = await fetch(asset.url, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to load saved asset "${asset.name}"`);
    }

    const blob = await response.blob();

    return {
      name: asset.name,
      type: asset.type || blob.type,
      dataUrl: await readFileAsDataUrl(blob),
    };
  };

  const saveUploadedCreativeToMediaLibrary = async ({ label = 'creative upload' } = {}) => {
    if (!mediaFile) {
      return null;
    }

    const mediaMetadata = await readMediaMetadata(mediaFile);
    const isVideoUpload = mediaFile.type.startsWith('video/');
    const linkedVideoThumbnailFile = isVideoUpload ? thumbnailFile || defaultVideoThumbnail?.file || null : null;
    const thumbnailMetadata = linkedVideoThumbnailFile ? await readImageMetadata(linkedVideoThumbnailFile) : null;
    const uploadLabel = `Uploading ${isVideoUpload ? `${label} video` : `${label} image`}`;
    const data = await adsLaunchApi.uploadMediaAssetWithProgress({
      name: (templateName || form.launchLabel || mediaFile.name).trim(),
      brandId: form.brandId,
      brandName: selectedBrand?.name || '',
      mediaFile,
      mediaMetadata,
      thumbnailFile: linkedVideoThumbnailFile,
      thumbnailMetadata,
    }, {
      onUploadProgress: (percent) => {
        setCreativeUploadProgress({
          label: uploadLabel,
          percent,
        });
      },
    });

    return data.mediaAsset;
  };

  const saveUploadedThumbnailToMediaLibrary = async ({ label = 'thumbnail upload' } = {}) => {
    if (!thumbnailFile) {
      return null;
    }

    const thumbnailMetadata = await readImageMetadata(thumbnailFile);
    const data = await adsLaunchApi.uploadMediaAssetWithProgress({
      name: `${(templateName || form.launchLabel || thumbnailFile.name).trim()} thumbnail`,
      brandId: form.brandId,
      brandName: selectedBrand?.name || '',
      mediaFile: thumbnailFile,
      mediaMetadata: thumbnailMetadata,
    }, {
      onUploadProgress: (percent) => {
        setCreativeUploadProgress({
          label: `Uploading ${label}`,
          percent,
        });
      },
    });

    return data.mediaAsset;
  };

  const buildTemplatePayload = async ({ includeStoredAssets = false } = {}) => {
    const thumbnailAttachedToUploadedVideo = Boolean(
      mediaFile?.type?.startsWith('video/') && (thumbnailFile || defaultVideoThumbnail?.file)
    );
    const uploadedMediaAsset = mediaFile ? await saveUploadedCreativeToMediaLibrary({ label: 'template media' }) : null;
    const uploadedThumbnailAsset = thumbnailFile && !thumbnailAttachedToUploadedVideo
      ? await saveUploadedThumbnailToMediaLibrary({ label: 'template thumbnail' })
      : null;
    const mediaAssetId = uploadedMediaAsset?.id || (creativeSource === 'library' ? savedMediaAsset?.mediaAssetId : '');
    const thumbnailAssetId = uploadedThumbnailAsset?.id || (thumbnailSource === 'library' ? savedThumbnailAsset?.mediaAssetId : '');
    const media = mediaFile
      ? null
      : mediaAssetId
        ? null
        : includeStoredAssets || creativeSource === 'library'
        ? await serializeStoredAssetForTemplate(savedMediaAsset)
        : null;
    const thumbnail = isVideoAsset
      ? thumbnailFile
        ? null
        : thumbnailAssetId || mediaAssetId
          ? null
          : includeStoredAssets || thumbnailSource === 'library'
          ? await serializeStoredAssetForTemplate(savedThumbnailAsset)
          : null
      : null;

    return {
      name: (templateName || form.launchLabel).trim(),
      config: {
        ...form,
        objective: currentObjective,
        websiteEvent: pixelRequired ? form.websiteEvent : '',
        scheduleStart: toSchedulePayloadValue(form.scheduleStart),
        scheduleEnd: toSchedulePayloadValue(form.scheduleEnd),
        staticDefaults: {
          ...form.staticDefaults,
        },
      },
      snapshot: {
        brandName: selectedBrand?.name || '',
        tokenLabel: selectedToken?.label || '',
        pageName: selectedPage?.name || '',
        pixelName: selectedPixel?.name || '',
        adAccounts: selectedAdAccounts.map((account) => ({
          id: account.id,
          name: account.name,
        })),
        media,
        thumbnail,
        mediaAssetId,
        thumbnailAssetId,
      },
    };
  };

  const buildPublishPayload = async () => {
    const thumbnailAttachedToUploadedVideo = Boolean(
      mediaFile?.type?.startsWith('video/') && (thumbnailFile || defaultVideoThumbnail?.file)
    );
    const uploadedMediaAsset = mediaFile ? await saveUploadedCreativeToMediaLibrary({ label: 'publish media' }) : null;
    const uploadedThumbnailAsset = thumbnailFile && !thumbnailAttachedToUploadedVideo
      ? await saveUploadedThumbnailToMediaLibrary({ label: 'publish thumbnail' })
      : null;
    const mediaAssetId = uploadedMediaAsset?.id || (creativeSource === 'library' ? activeMediaAsset?.mediaAssetId : '');
    const thumbnailAssetId = uploadedThumbnailAsset?.id || (thumbnailSource === 'library' ? activeThumbnailAsset?.mediaAssetId : '');
    const media = mediaFile
      ? null
      : mediaAssetId || activeTemplateId
        ? null
        : activeMediaAsset
        ? await serializeStoredAssetForTemplate(activeMediaAsset)
        : null;
    const thumbnail = isVideoAsset
      ? thumbnailFile
        ? null
        : thumbnailAssetId || mediaAssetId || activeTemplateId
          ? null
          : activeThumbnailAsset
          ? await serializeStoredAssetForTemplate(activeThumbnailAsset)
          : null
      : null;

    return {
      templateId: activeTemplateId || undefined,
      launchLabel: form.launchLabel.trim(),
      brandId: form.brandId,
      brandName: selectedBrand?.name || '',
      tokenId: form.tokenId,
      country: (form.countries || [])[0] || form.country,
      countries: form.countries || [],
      countryLabel: selectedCountryLabel,
      objective: currentObjective,
      dailyBudget: form.dailyBudget,
      selectedAdAccountIds: form.selectedAdAccountIds,
      selectedAdAccounts: selectedAdAccounts.map((account) => ({
        id: account.id,
        accountId: account.accountId,
        name: account.name,
        currency: account.currency,
      })),
      pageId: form.pageId,
      pageName: selectedPage?.name || '',
      pixelId: form.pixelId,
      pixelName: selectedPixel?.name || '',
      websiteEvent: pixelRequired ? form.websiteEvent : '',
      headline: form.headline.trim(),
      primaryText: form.primaryText.trim(),
      description: form.description.trim(),
      websiteUrl: form.websiteUrl.trim(),
      displayUrl: form.displayUrl.trim(),
      urlParameters: form.urlParameters.trim(),
      scheduleStart: toSchedulePayloadValue(form.scheduleStart),
      scheduleEnd: toSchedulePayloadValue(form.scheduleEnd),
      callToAction: form.callToAction,
      staticDefaults: {
        ...form.staticDefaults,
      },
      media,
      thumbnail,
      mediaAssetId,
      thumbnailAssetId,
    };
  };

  const getTemplateNameConflict = (name) => {
    const normalizedName = name.trim().toLowerCase();
    return templates.find((template) => template.name.trim().toLowerCase() === normalizedName) || null;
  };

  const saveTemplate = async ({ createNew = false } = {}) => {
    const nextTemplateName = (templateName || form.launchLabel).trim();
    if (!nextTemplateName) {
      toast.error('Add a template name or launch name before saving');
      return;
    }

    if (createNew) {
      if (activeTemplate && nextTemplateName.trim().toLowerCase() === activeTemplate.name.trim().toLowerCase()) {
        toast.error('Use a different template name before creating a new template');
        return;
      }

      const existingTemplate = getTemplateNameConflict(nextTemplateName);
      if (existingTemplate) {
        toast.error(`Template name already exists: "${existingTemplate.name}"`);
        return;
      }
    }

    setSavingTemplate(true);
    setCreativeUploadProgress(null);

    try {
      const payload = await buildTemplatePayload({
        includeStoredAssets: createNew,
      });
      const data = activeTemplateId && !createNew
        ? await adsLaunchApi.updateTemplate(activeTemplateId, payload)
        : await adsLaunchApi.createTemplate(payload);

      setActiveTemplateId(data.template.id);
      setTemplateName(data.template.name);
      setSavedMediaAsset(normalizeStoredAsset(data.template.snapshot?.media));
      setSavedThumbnailAsset(normalizeStoredAsset(data.template.snapshot?.thumbnail));
      setDefaultVideoThumbnail(null);
      setCreativeSource('saved');
      setThumbnailSource('saved');
      clearUploadedCreativeFiles();
      await loadTemplates();
      setTemplatePage(1);
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSavingTemplate(false);
      setCreativeUploadProgress(null);
    }
  };

  const handleSaveTemplate = () => saveTemplate();

  const handleCreateTemplate = () => saveTemplate({ createNew: true });

  const handleDeleteTemplate = async (template) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) {
      return;
    }

    setSavingTemplate(true);

    try {
      const data = await adsLaunchApi.deleteTemplate(template.id);
      if (activeTemplateId === template.id) {
        setActiveTemplateId('');
        setTemplateName('');
        setSavedMediaAsset(null);
        setSavedThumbnailAsset(null);
        setDefaultVideoThumbnail(null);
        setCreativeSource('saved');
        setThumbnailSource('saved');
      }
      await loadTemplates();
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  const getUniqueBrandIdForToken = (tokenId) => {
    if (!tokenId) {
      return '';
    }

    const matchingBrandIds = new Set(
      brands
        .filter((brand) => (brand.assignedSocialAccounts || []).some((account) => account.sourceTokenId === tokenId))
        .map((brand) => brand.id)
    );

    return matchingBrandIds.size === 1 ? Array.from(matchingBrandIds)[0] : '';
  };

  const getTemplateTokenId = (config = {}, snapshot = {}) => {
    if (config.tokenId) {
      return config.tokenId;
    }

    if (!snapshot.tokenLabel) {
      return '';
    }

    const matchingTokens = activeTokens.filter((token) => token.label === snapshot.tokenLabel);
    return matchingTokens.length === 1 ? matchingTokens[0].id : '';
  };

  const getTemplateBrandId = ({ brandName, tokenId }) => {
    if (!tokenId) {
      return '';
    }

    if (brandName) {
      const matchingBrand = brands.find(
        (brand) =>
          brand.name === brandName &&
          (brand.assignedSocialAccounts || []).some((account) => account.sourceTokenId === tokenId)
      );

      if (matchingBrand) {
        return matchingBrand.id;
      }
    }

    return getUniqueBrandIdForToken(tokenId);
  };

  const handleLoadTemplate = (template) => {
    if (template.templateType && template.templateType !== 'FULL') {
      toast.error('Use Template Builder or Dynamic Ads Launch for campaign/media templates');
      return;
    }

    const config = template.config || {};
    const snapshot = template.snapshot || {};
    const tokenId = getTemplateTokenId(config, snapshot);
    const countries = normalizeTemplateCountries(config);
    const objective = normalizeObjective(config.objective);
    const brandId = config.brandId || getTemplateBrandId({
      brandName: snapshot.brandName,
      tokenId,
    });
    const selectedAdAccountIds = Array.isArray(config.selectedAdAccountIds) && config.selectedAdAccountIds.length
      ? config.selectedAdAccountIds
      : Array.isArray(snapshot.adAccounts)
        ? snapshot.adAccounts.map((account) => account.id).filter(Boolean)
        : [];

    setForm({
      ...createEmptyForm(),
      ...config,
      brandId,
      tokenId,
      country: countries[0] || '',
      countries,
      objective,
      websiteEvent: config.websiteEvent || defaultWebsiteEventByObjective[objective] || '',
      scheduleStart: toDateTimeLocalInputValue(config.scheduleStart),
      scheduleEnd: toDateTimeLocalInputValue(config.scheduleEnd),
      selectedAdAccountIds,
      staticDefaults: {
        ...defaultStaticDefaults,
        ...(config.staticDefaults || {}),
      },
    });
    setActiveTemplateId(template.id);
    setTemplateName(template.name);
    setEditingStaticDefaults(false);
    setLatestPublish(null);
    clearUploadedCreativeFiles();
    setSavedMediaAsset(normalizeStoredAsset(template.snapshot?.media));
    setSavedThumbnailAsset(normalizeStoredAsset(template.snapshot?.thumbnail));
    setDefaultVideoThumbnail(null);
    setCreativeSource('saved');
    setThumbnailSource('saved');
    toast.success(`Loaded template "${template.name}"`);
  };

  const openTemplatePreview = (template) => {
    const media = template.snapshot?.media;

    if (!media?.url) {
      return;
    }

    if (!isLocalTemplateAssetUrl(media.url)) {
      toast.error('Saved template preview is only available for local stored assets');
      return;
    }

    setTemplatePreview({
      name: media.name || template.name,
      templateName: template.name,
      type: media.type || '',
      url: media.url,
      thumbnailUrl: isLocalTemplateAssetUrl(template.snapshot?.thumbnail?.url) ? template.snapshot.thumbnail.url : '',
    });
  };

  const handlePublish = async () => {
    if (publishBusy) {
      toast.error('This publish request is already being queued.');
      return;
    }

    const validationError = getLaunchValidationError(form);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (!canPublish) {
      const missingFields = getLaunchMissingFields({
        activeMediaAsset,
        activeThumbnailAsset,
        bidAmountRequired,
        form,
        isVideoAsset,
        loadingAssets,
        loadingPixels,
        pixelRequired,
      });
      toast.error(missingFields.length ? `Complete before publishing: ${missingFields.join(', ')}` : 'Complete the launch setup before publishing');
      return;
    }

    setPublishing(true);
    setLatestPublish(null);
    setCreativeUploadProgress(null);
    const publishTitle = form.launchLabel ? `Ads Launch: ${form.launchLabel}` : 'Ads Launch publish';
    const publishSource = 'Ads Launch';

    try {
      const payload = {
        ...(await buildPublishPayload()),
        tokenType: publishTokenType,
        publishTitle,
        publishSource,
      };
      const data = await adsLaunchApi.publishLaunch(payload);
      setLatestPublish(data);
      if (data.session) {
        applyPublishSessions([data.session]);
      }
      await refreshPublishSessions();
      await loadTemplates();
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setPublishing(false);
      setCreativeUploadProgress(null);
    }
  };

  return (
    <div>
      <DashboardHeader
        title="Ads Launch"
        description="Choose a brand, pick one of its assigned Meta tokens, then publish campaign, ad set, creative, and ad batches."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={resetComposer}
              className="h-11 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
            >
              New draft
            </button>
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={savingTemplate}
              className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-70"
            >
              <Save size={16} strokeWidth={2.2} />
              {activeTemplateId ? 'Update template' : 'Save template'}
            </button>
            {activeTemplateId ? (
              <button
                type="button"
                onClick={handleCreateTemplate}
                disabled={savingTemplate}
                className="flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-70"
              >
                <Plus size={16} strokeWidth={2.2} />
                Create new template
              </button>
            ) : null}
          </div>
        }
      />

      {mediaLibraryPickerMode ? (
        <MediaLibraryFolderPicker
          description={
            mediaLibraryPickerMode === 'thumbnail'
              ? 'Choose an image from the library to use as this video thumbnail.'
              : 'Choose an image or video from the library. Videos with auto thumbnails will fill the thumbnail section automatically.'
          }
          loading={mediaAssetsLoading}
          mediaAssets={mediaLibraryPickerMode === 'thumbnail' ? imageMediaAssets : brandScopedMediaAssets}
          mediaFolders={brandScopedMediaFolders}
          mode={mediaLibraryPickerMode}
          onClose={() => setMediaLibraryPickerMode('')}
          onRefresh={loadMediaAssets}
          onSelect={mediaLibraryPickerMode === 'thumbnail' ? selectThumbnailFromLibrary : selectMediaFromLibrary}
          selectedMediaAssetUrl={mediaLibraryPickerMode === 'thumbnail' ? activeThumbnailAsset?.url : activeMediaAsset?.url}
        />
      ) : null}

      {brandsError ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{brandsError}</p> : null}
      {tokensError ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{tokensError}</p> : null}
      {assetsError ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{assetsError}</p> : null}
      {pixelError ? <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{pixelError}</p> : null}
      {templatesError ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{templatesError}</p> : null}
      {warnings.length ? (
        <div className="mb-4 space-y-2">
          {warnings.map((warning) => (
            <p key={`${warning.scope}-${warning.message}`} className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {warning.scope}: {warning.message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,420px)]">
        <DashboardPanel title="One-click launch builder">
          <div className="mb-5 flex flex-wrap gap-2">
            <InfoPill icon={KeyRound}>Brand-scoped tokens</InfoPill>
            <InfoPill icon={Layers3}>Reusable templates</InfoPill>
            <InfoPill icon={Globe2}>China and Indonesia ready</InfoPill>
            <InfoPill icon={MousePointerClick}>Page + pixel from one asset call</InfoPill>
          </div>

          <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
            <div className="grid gap-4 xl:grid-cols-4">
              <div className="space-y-2 xl:col-span-2">
                <FieldLabel htmlFor="template-name">Template name</FieldLabel>
                <input
                  id="template-name"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="Evergreen Website Visits"
                />
                <p className="text-xs font-semibold text-slate-400">
                  Templates can keep the launch setup and the saved creative asset for later reuse.
                </p>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="launch-label">Launch name</FieldLabel>
                <input
                  id="launch-label"
                  value={form.launchLabel}
                  onChange={(event) => updateField('launchLabel', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="May Promo 2026"
                  required
                />
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="country-add">Countries</FieldLabel>
                <div className="min-h-12 rounded-xl border border-sky-100 bg-white px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {selectedCountryOptions.map((country) => (
                      <span
                        key={country.value}
                        className="inline-flex max-w-full items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-sm font-black text-sky-800"
                      >
                        <span className="truncate">{country.label}</span>
                        <span className="text-xs text-sky-500">{country.value}</span>
                        <button
                          type="button"
                          onClick={() => removeCountry(country.value)}
                          disabled={selectedCountryOptions.length <= 1}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-sky-600 transition hover:text-red-600 disabled:cursor-not-allowed disabled:text-slate-300"
                          aria-label={`Remove ${country.label}`}
                          title={selectedCountryOptions.length <= 1 ? 'At least one country is required' : `Remove ${country.label}`}
                        >
                          <X size={12} strokeWidth={2.6} />
                        </button>
                      </span>
                    ))}
                  </div>

                  <select
                    id="country-add"
                    value=""
                    onChange={(event) => addCountry(event.target.value)}
                    disabled={!availableCountryOptions.length}
                    className="mt-3 h-10 w-full rounded-lg border border-sky-100 bg-sky-50/60 px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:text-slate-300"
                  >
                    <option value="">{availableCountryOptions.length ? 'Add country' : 'All countries selected'}</option>
                    {availableCountryOptions.map((country) => (
                      <option key={country.value} value={country.value}>
                        {country.label} ({country.value})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-6">
              <div className="space-y-2">
                <FieldLabel htmlFor="brand-id">Brand</FieldLabel>
                <select
                  id="brand-id"
                  value={form.brandId}
                  onChange={(event) => handleBrandChange(event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  disabled={brandsLoading}
                  required
                >
                  <option value="">{brandsLoading ? 'Loading brands...' : 'Select brand'}</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name} ({brand.socialAccountCount || 0} account{brand.socialAccountCount === 1 ? '' : 's'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="source-token">Source token</FieldLabel>
                <select
                  id="source-token"
                  value={form.tokenId}
                  onChange={(event) => handleTokenChange(event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  disabled={tokensLoading || !selectedBrand || !brandTokenOptions.length}
                  required
                >
                  <option value="">
                    {!selectedBrand
                      ? 'Select brand first'
                      : brandTokenOptions.length
                        ? 'Select brand token'
                        : 'No active token assigned'}
                  </option>
                  {brandTokenOptions.map((token) => (
                    <option key={token.id} value={token.id}>
                      {token.label}{token.accessToken ? ` (${token.accessToken})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="objective">Objective</FieldLabel>
                <select
                  id="objective"
                  value={currentObjective}
                  onChange={(event) => handleObjectiveChange(event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                >
                  {objectiveOptions.map((objective) => (
                    <option key={objective.value} value={objective.value} disabled={!supportedObjectiveValues.has(objective.value)}>
                      {supportedObjectiveValues.has(objective.value) ? objective.label : `${objective.label} (disabled)`}
                    </option>
                  ))}
                </select>
                <p className="text-xs font-semibold text-slate-400">Traffic can publish without a pixel. Leads and Sales require a shared pixel and website event.</p>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="dynamic-creative">Dynamic creative</FieldLabel>
                <select
                  id="dynamic-creative"
                  value={form.staticDefaults.dynamicCreative}
                  onChange={(event) => updateStaticDefault('dynamicCreative', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                >
                  {staticDefaultOptions.dynamicCreative.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="budget-level">Budget level</FieldLabel>
                <select
                  id="budget-level"
                  value={form.staticDefaults.budgetLevel}
                  onChange={(event) => updateStaticDefault('budgetLevel', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                >
                  {staticDefaultOptions.budgetLevel.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  <option value="AD" disabled>
                    Ad budget is not supported by Meta
                  </option>
                </select>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="daily-budget">Daily budget amount</FieldLabel>
                <input
                  id="daily-budget"
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.dailyBudget}
                  onChange={(event) => updateField('dailyBudget', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="15"
                />
                <p className="text-xs font-semibold text-slate-400">
                  Applied to the selected {form.staticDefaults.budgetLevel === 'CAMPAIGN' ? 'campaign' : 'ad set'}.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="ad-account-list">Ad accounts</FieldLabel>
                  <button
                    type="button"
                    onClick={toggleSelectAllAccounts}
                    disabled={!scopedAdAccounts.length}
                    className="text-xs font-black uppercase tracking-[0.16em] text-sky-600 disabled:text-slate-300"
                  >
                    {form.selectedAdAccountIds.length === scopedAdAccounts.length && scopedAdAccounts.length ? 'Clear all' : 'Select all'}
                  </button>
                </div>

                <div id="ad-account-list" className="rounded-2xl border border-sky-100 bg-white p-3">
                  {loadingAssets ? (
                    <div className="h-44 animate-pulse rounded-xl bg-sky-50" />
                  ) : scopedAdAccounts.length ? (
                    <div className="grid max-h-80 gap-2 overflow-y-auto md:grid-cols-2">
                      {scopedAdAccounts.map((account) => {
                        const checked = getAdAccountKeys(account).some((key) => form.selectedAdAccountIds.includes(key));

                        return (
                          <label
                            key={account.id}
                            className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 transition ${
                              checked ? 'border-sky-300 bg-sky-50' : 'border-sky-100 bg-white hover:bg-sky-50/60'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAdAccount(account.id)}
                              className="mt-1 h-4 w-4 rounded border-sky-200 text-sky-600 focus:ring-sky-500"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-950">{account.name}</p>
                              <p className="mt-1 text-xs font-semibold text-slate-400">
                                {account.accountId} {account.currency ? `| ${account.currency}` : ''}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState>
                      {!form.brandId
                        ? 'Select a brand first. Only tokens assigned to that brand will be available.'
                        : !form.tokenId
                          ? 'Select a brand token to load ad accounts.'
                          : hasBrandSavedAdAccounts && adAccounts.length
                            ? 'No loaded ad accounts match this brand. Sync the brand in Dashboard or choose another token.'
                            : 'This token did not return ad accounts with `ads_management` access.'}
                    </EmptyState>
                  )}
                </div>
                {selectedBrand && form.tokenId ? (
                  <p className="text-xs font-semibold text-slate-400">
                    Showing {scopedAdAccounts.length} account{scopedAdAccounts.length === 1 ? '' : 's'} for {selectedBrand.name}
                    {hasBrandSavedAdAccounts ? ' from saved brand business profiles.' : ' from the selected token.'}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <FormFieldCard htmlFor="page-id" label="Facebook page" helper="Loaded directly from the selected token page access.">
                  <select
                    id="page-id"
                    value={form.pageId}
                    onChange={(event) => updateField('pageId', event.target.value)}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    disabled={loadingAssets || !pages.length}
                    required
                  >
                    <option value="">Select accessible page</option>
                    {pages.map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.name}
                      </option>
                    ))}
                  </select>
                </FormFieldCard>

                <FormFieldCard
                  htmlFor="pixel-id"
                  label="Pixel"
                  helper={
                    pixelRequired
                      ? 'Shared pixels are required for leads and sales. Only common pixels across the selected accounts are shown.'
                      : 'Shared pixels are optional for traffic. A shared pixel can be kept in the template, but publish does not depend on it.'
                  }
                >
                  <select
                    id="pixel-id"
                    value={form.pixelId}
                    onChange={(event) => updateField('pixelId', event.target.value)}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    disabled={loadingPixels || !pixels.length}
                  >
                    <option value="">
                      {loadingPixels
                        ? 'Loading shared pixels...'
                        : pixelRequired
                          ? 'Select shared pixel'
                          : 'No shared pixel selected (optional)'}
                    </option>
                    {pixels.map((pixel) => (
                      <option key={pixel.id} value={pixel.id}>
                        {pixel.name}
                      </option>
                    ))}
                  </select>
                </FormFieldCard>

                <FormFieldCard
                  htmlFor="website-event"
                  label="Website event"
                  helper={
                    pixelRequired
                      ? 'Used with the selected pixel as the Meta conversion event for optimization.'
                      : 'Only used for Leads and Sales objectives. Traffic ignores this field.'
                  }
                >
                  <select
                    id="website-event"
                    value={form.websiteEvent}
                    onChange={(event) => updateField('websiteEvent', event.target.value)}
                    disabled={!pixelRequired}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {websiteEventOptions.map((eventOption) => (
                      <option key={eventOption.value} value={eventOption.value}>
                        {eventOption.label}
                      </option>
                    ))}
                  </select>
                </FormFieldCard>
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="primary-text">Primary text</FieldLabel>
              <textarea
                id="primary-text"
                value={form.primaryText}
                onChange={(event) => updateField('primaryText', event.target.value)}
                className="min-h-28 w-full rounded-xl border border-sky-100 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="Write the main ad copy here"
                required
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="headline">Headline</FieldLabel>
                <input
                  id="headline"
                  value={form.headline}
                  onChange={(event) => updateField('headline', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="Shop the latest offer"
                  required
                />
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="call-to-action">Call to action</FieldLabel>
                <select
                  id="call-to-action"
                  value={form.callToAction}
                  onChange={(event) => updateField('callToAction', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                >
                  {callToActionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <textarea
                id="description"
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                className="min-h-24 w-full rounded-xl border border-sky-100 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="Optional supporting description for the ad"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="website-url">Destination URL</FieldLabel>
                <input
                  id="website-url"
                  type="url"
                  value={form.websiteUrl}
                  onChange={(event) => updateField('websiteUrl', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="https://example.com/landing-page"
                  required
                />
                <p className="text-xs font-semibold text-slate-400">Where people go after clicking the ad.</p>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="display-url">Display URL</FieldLabel>
                <input
                  id="display-url"
                  value={form.displayUrl}
                  onChange={(event) => updateField('displayUrl', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="https://example.com"
                />
                <p className="text-xs font-semibold text-slate-400">
                  Optional. Use a real domain or URL. Invalid Display URLs are blocked before Meta publish.
                </p>
              </div>

              <div className="space-y-4 rounded-2xl border border-sky-100 bg-white p-4 xl:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <FieldLabel htmlFor="url-parameters">URL parameter builder</FieldLabel>
                    <p className="mt-1 text-xs font-semibold text-slate-400">
                      Build clean tracking tags for Meta `url_tags`. Use presets, dynamic values, or edit the raw string.
                    </p>
                  </div>
                  {form.urlParameters ? (
                    <button
                      type="button"
                      onClick={() => updateField('urlParameters', '')}
                      className="h-9 rounded-lg border border-red-100 bg-white px-3 text-xs font-black uppercase tracking-[0.14em] text-red-600 transition hover:bg-red-50"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {urlParameterPresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyUrlParameterPreset(preset.value)}
                      className="rounded-full border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {urlParameterBuilderRows.map((row) => (
                    <div key={row.key} className="rounded-xl border border-sky-100 bg-sky-50/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor={`url-param-${row.key}`} className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">
                          {row.label}
                        </label>
                        <span className="text-[11px] font-bold text-slate-400">{row.key}</span>
                      </div>
                      <input
                        id={`url-param-${row.key}`}
                        value={getUrlParameterEntryValue(urlParameterEntries, row.key)}
                        onChange={(event) => updateUrlParameter(row.key, event.target.value)}
                        className="mt-2 h-10 w-full rounded-lg border border-sky-100 bg-white px-3 text-sm font-semibold outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                        placeholder={row.placeholder}
                      />
                      <select
                        value=""
                        onChange={(event) => {
                          if (event.target.value) {
                            updateUrlParameter(row.key, event.target.value);
                          }
                        }}
                        className="mt-2 h-9 w-full rounded-lg border border-sky-100 bg-white px-2 text-xs font-bold text-slate-600 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      >
                        <option value="">Insert dynamic value</option>
                        {urlParameterMacroOptions.map((macro) => (
                          <option key={macro.value} value={macro.value}>
                            {macro.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 rounded-xl border border-dashed border-sky-200 bg-white p-3 md:grid-cols-[minmax(130px,0.55fr)_minmax(180px,1fr)_auto]">
                  <input
                    value={urlParameterDraft.key}
                    onChange={(event) =>
                      setUrlParameterDraft((current) => ({
                        ...current,
                        key: event.target.value,
                      }))
                    }
                    className="h-10 rounded-lg border border-sky-100 bg-white px-3 text-sm font-semibold outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="custom_key"
                  />
                  <input
                    value={urlParameterDraft.value}
                    onChange={(event) =>
                      setUrlParameterDraft((current) => ({
                        ...current,
                        value: event.target.value,
                      }))
                    }
                    className="h-10 rounded-lg border border-sky-100 bg-white px-3 text-sm font-semibold outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="custom_value or {{ad.id}}"
                  />
                  <button
                    type="button"
                    onClick={addCustomUrlParameter}
                    className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"
                  >
                    Add
                  </button>
                </div>

                <div className="space-y-2">
                  <textarea
                    id="url-parameters"
                    value={form.urlParameters}
                    onChange={(event) => updateField('urlParameters', normalizeUrlParameterString(event.target.value))}
                    className="min-h-20 w-full rounded-xl border border-sky-100 bg-white px-4 py-3 font-mono text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="utm_source={{site_source_name}}&utm_campaign={{campaign.name}}"
                  />
                  <div className="rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-slate-100">
                    <span className="text-slate-400">Preview: </span>
                    {form.urlParameters ? `?${form.urlParameters}` : 'No URL parameters added'}
                  </div>
                  <p className="text-xs font-semibold text-slate-400">
                    Dynamic values supported: {urlParameterMacroOptions.map((macro) => macro.value).join(', ')}
                  </p>
                </div>
              </div>
            </div>
            {scheduleValidationError ? (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {scheduleValidationError}
              </p>
            ) : form.scheduleStart && form.scheduleEnd ? (
              <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                Schedule looks valid. Meta will receive the selected local time with your timezone offset.
              </p>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="schedule-start">Schedule start</FieldLabel>
                <input
                  id="schedule-start"
                  type="datetime-local"
                  value={form.scheduleStart}
                  min={minimumScheduleStartValue}
                  onChange={(event) => updateField('scheduleStart', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
                <p className="text-xs font-semibold text-slate-400">
                  Optional. If scheduling, start and end are both required and start must be at least 5 minutes ahead.
                </p>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="schedule-end">Schedule end</FieldLabel>
                <input
                  id="schedule-end"
                  type="datetime-local"
                  value={form.scheduleEnd}
                  min={form.scheduleStart || minimumScheduleStartValue}
                  onChange={(event) => updateField('scheduleEnd', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
                <p className="text-xs font-semibold text-slate-400">Optional. End time must be after the start time.</p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FieldLabel htmlFor="media-upload">Image or video</FieldLabel>
                  <button
                    type="button"
                    onClick={() => {
                      if (!mediaAssets.length) {
                        loadMediaAssets();
                      }
                      setMediaLibraryPickerMode('media');
                    }}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-sky-100 bg-white px-3 text-xs font-black uppercase tracking-[0.14em] text-sky-700 transition hover:bg-sky-50"
                  >
                    <FolderOpen size={14} strokeWidth={2.3} />
                    Library
                  </button>
                </div>
                <label
                  htmlFor="media-upload"
                  className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-sky-200 bg-sky-50/70 px-5 py-6 text-center transition hover:border-sky-400 hover:bg-sky-50"
                >
                  <Upload size={26} strokeWidth={2.1} className="text-sky-600" />
                  <p className="mt-3 text-sm font-black text-slate-950">Upload image or video</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Upload a new file or use Library above. Either option can be saved with the template.</p>
                </label>
                <input id="media-upload" type="file" accept="image/jpeg,video/mp4,video/quicktime" onChange={handleMediaChange} className="hidden" />

                {activeMediaPreviewUrl ? (
                  <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
                    {isVideoAsset ? (
                      <video src={activeMediaPreviewUrl} controls className="h-56 w-full bg-slate-950 object-contain" />
                    ) : (
                      <img src={activeMediaPreviewUrl} alt="Uploaded creative preview" className="h-56 w-full object-cover" />
                    )}
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950">{activeMediaAsset?.name}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-400">
                          {activeMediaAsset?.type || 'Unknown file type'}
                          {creativeSource === 'library' ? ' | Ads Media Library' : ''}
                        </p>
                      </div>
                      {isVideoAsset ? (
                        <InfoPill icon={Video} tone="amber">
                          Video
                        </InfoPill>
                      ) : (
                        <InfoPill icon={ImageIcon}>Image</InfoPill>
                      )}
                    </div>
                  </div>
                ) : null}
                {creativeUploadProgress ? (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.14em] text-amber-700">
                      <span>{creativeUploadProgress.label}</span>
                      <span>{creativeUploadProgress.percent}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-amber-500 transition-all duration-200" style={{ width: `${creativeUploadProgress.percent}%` }} />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-amber-800">
                      Large videos can take a little while to prepare before the live Meta publish steps start.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FieldLabel htmlFor="thumbnail-upload">Thumbnail for video</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={restoreDefaultVideoThumbnail}
                      disabled={!isVideoAsset || (!defaultVideoThumbnail?.file && !savedMediaAsset?.defaultThumbnail)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Reload default
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!mediaAssets.length) {
                          loadMediaAssets();
                        }
                        setMediaLibraryPickerMode('thumbnail');
                      }}
                      disabled={!isVideoAsset}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-sky-100 bg-white px-3 text-xs font-black uppercase tracking-[0.14em] text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <FolderOpen size={14} strokeWidth={2.3} />
                      Library
                    </button>
                  </div>
                </div>
                <label
                  htmlFor="thumbnail-upload"
                  className={`flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-6 text-center transition ${
                    isVideoAsset
                      ? 'cursor-pointer border-sky-200 bg-sky-50/70 hover:border-sky-400 hover:bg-sky-50'
                      : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                  }`}
                >
                  <Upload size={26} strokeWidth={2.1} className={isVideoAsset ? 'text-sky-600' : 'text-slate-300'} />
                  <p className="mt-3 text-sm font-black text-slate-950">Upload thumbnail</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Required for video. Upload one or choose an image from the library.</p>
                </label>
                <input
                  id="thumbnail-upload"
                  type="file"
                  accept="image/jpeg"
                  onChange={handleThumbnailChange}
                  className="hidden"
                  disabled={!isVideoAsset}
                />

                {activeThumbnailPreviewUrl ? (
                  <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
                    <img src={activeThumbnailPreviewUrl} alt="Video thumbnail preview" className="h-56 w-full object-cover" />
                    <div className="px-4 py-3">
                      <p className="truncate text-sm font-black text-slate-950">{activeThumbnailAsset?.name}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-400">
                        {activeThumbnailAsset?.type || 'Unknown file type'}
                        {thumbnailSource === 'library'
                          ? ' | Ads Media Library'
                          : thumbnailSource === 'auto'
                            ? ' | Auto thumbnail'
                            : ''}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={savingTemplate}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-70 sm:w-auto"
              >
                {savingTemplate ? <LoaderCircle size={17} strokeWidth={2.2} className="animate-spin" /> : <Save size={17} strokeWidth={2.2} />}
                {activeTemplateId ? 'Update template' : 'Save template'}
              </button>
              {activeTemplateId ? (
                <button
                  type="button"
                  onClick={handleCreateTemplate}
                  disabled={savingTemplate}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-sky-100 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-70 sm:w-auto"
                >
                  <Plus size={17} strokeWidth={2.2} />
                  Create new template
                </button>
              ) : null}
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishBusy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-70 sm:w-auto"
              >
                {publishBusy ? <LoaderCircle size={17} strokeWidth={2.2} className="animate-spin" /> : <Rocket size={17} strokeWidth={2.2} />}
                {publishBusy ? 'Queuing...' : publishInProgress ? 'Add to queue' : 'Publish to Meta'}
              </button>
            </div>
          </form>
        </DashboardPanel>

        <div className="space-y-4">
          <DashboardPanel
            title="Saved templates"
            headerAction={
              launchTemplates.length > TEMPLATES_PER_PAGE ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTemplatePage((currentPage) => Math.max(currentPage - 1, 1))}
                    disabled={safeTemplatePage <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-100 bg-white text-slate-600 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Previous saved templates page"
                  >
                    <ChevronLeft size={16} strokeWidth={2.4} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplatePage((currentPage) => Math.min(currentPage + 1, templatePageCount))}
                    disabled={safeTemplatePage >= templatePageCount}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-100 bg-white text-slate-600 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Next saved templates page"
                  >
                    <ChevronRight size={16} strokeWidth={2.4} />
                  </button>
                </div>
              ) : null
            }
          >
            {templatesLoading ? (
              <div className="h-56 animate-pulse rounded-2xl bg-sky-50" />
            ) : launchTemplates.length ? (
              <div className="space-y-3">
                {visibleTemplates.map((template) => (
                  <div key={template.id} className="rounded-2xl border border-sky-100 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950">{template.name}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-400">Updated {formatDateTime(template.updatedAt)}</p>
                      </div>
                      {activeTemplateId === template.id ? <InfoPill icon={Check}>Loaded</InfoPill> : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {template.snapshot?.brandName ? <InfoPill icon={Layers3}>{template.snapshot.brandName}</InfoPill> : null}
                      {template.snapshot?.tokenLabel ? <InfoPill icon={KeyRound}>{template.snapshot.tokenLabel}</InfoPill> : null}
                      {template.snapshot?.pageName ? <InfoPill icon={MousePointerClick}>{template.snapshot.pageName}</InfoPill> : null}
                    </div>

                    {template.snapshot?.media?.url ? (
                      <div
                        className="mt-3 cursor-zoom-in overflow-hidden rounded-2xl border border-sky-100 bg-sky-50/60 transition hover:border-sky-300"
                        onDoubleClick={() => openTemplatePreview(template)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            openTemplatePreview(template);
                          }
                        }}
                        aria-label={`Preview ${template.name}`}
                      >
                        {template.snapshot.media.type?.startsWith('video/') ? (
                          template.snapshot?.thumbnail?.url ? (
                            <img
                              src={template.snapshot.thumbnail.url}
                              alt={`${template.name} thumbnail`}
                              className="h-36 w-full object-cover"
                            />
                          ) : (
                            <video src={template.snapshot.media.url} className="h-36 w-full bg-slate-950 object-contain" />
                          )
                        ) : (
                          <img src={template.snapshot.media.url} alt={template.name} className="h-36 w-full object-cover" />
                        )}
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950">{template.snapshot.media.name}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-400">{template.snapshot.media.type}</p>
                          </div>
                          {template.snapshot.media.type?.startsWith('video/') ? (
                            <InfoPill icon={Video} tone="amber">
                              {template.snapshot?.thumbnail?.url ? 'Video + thumbnail' : 'Video'}
                            </InfoPill>
                          ) : (
                            <InfoPill icon={ImageIcon}>Image</InfoPill>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleLoadTemplate(template)}
                        className="flex h-10 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
                      >
                        <FolderOpen size={16} strokeWidth={2.2} />
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(template)}
                        disabled={savingTemplate}
                        className="flex h-10 items-center gap-2 rounded-xl border border-red-100 bg-white px-3 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-70"
                      >
                        <Trash2 size={16} strokeWidth={2.2} />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}

              </div>
            ) : (
              <EmptyState>Save your first launch template to reuse the setup later.</EmptyState>
            )}
          </DashboardPanel>

          <DashboardPanel
            title="Static template defaults"
            headerAction={
              <button
                type="button"
                onClick={() => setEditingStaticDefaults((current) => !current)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-100 bg-white text-slate-600 transition hover:bg-sky-50 hover:text-sky-700"
                title={editingStaticDefaults ? 'Done editing defaults' : 'Edit defaults'}
                aria-label={editingStaticDefaults ? 'Done editing defaults' : 'Edit defaults'}
              >
                {editingStaticDefaults ? <Check size={16} strokeWidth={2.2} /> : <Pencil size={16} strokeWidth={2.2} />}
              </button>
            }
          >
            {editingStaticDefaults ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel htmlFor="default-buying-type">Buying type</FieldLabel>
                  <select
                    id="default-buying-type"
                    value={form.staticDefaults.buyingType}
                    onChange={(event) => updateStaticDefault('buyingType', event.target.value)}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    {staticDefaultOptions.buyingType.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor="default-campaign-status">Campaign status</FieldLabel>
                  <select
                    id="default-campaign-status"
                    value={form.staticDefaults.campaignStatus}
                    onChange={(event) => updateStaticDefault('campaignStatus', event.target.value)}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    {staticDefaultOptions.campaignStatus.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor="default-special-category">Special ad categories</FieldLabel>
                  <select
                    id="default-special-category"
                    value={form.staticDefaults.specialAdCategories}
                    onChange={(event) => updateStaticDefault('specialAdCategories', event.target.value)}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    {staticDefaultOptions.specialAdCategories.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor="default-placements">Placements</FieldLabel>
                  <select
                    id="default-placements"
                    value={form.staticDefaults.placements}
                    onChange={(event) => updateStaticDefault('placements', event.target.value)}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    {staticDefaultOptions.placements.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor="default-budget-level">Budget level</FieldLabel>
                  <select
                    id="default-budget-level"
                    value={form.staticDefaults.budgetLevel}
                    onChange={(event) => updateStaticDefault('budgetLevel', event.target.value)}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    {staticDefaultOptions.budgetLevel.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    <option value="AD" disabled>
                      Ad budget is not supported by Meta
                    </option>
                  </select>
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor="default-dynamic-creative">Dynamic creative</FieldLabel>
                  <select
                    id="default-dynamic-creative"
                    value={form.staticDefaults.dynamicCreative}
                    onChange={(event) => updateStaticDefault('dynamicCreative', event.target.value)}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    {staticDefaultOptions.dynamicCreative.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <FieldLabel htmlFor="default-age-min">Audience age</FieldLabel>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      id="default-age-min"
                      type="number"
                      min="13"
                      max="65"
                      value={form.staticDefaults.audienceAgeMin}
                      onChange={(event) => updateStaticDefault('audienceAgeMin', event.target.value)}
                      className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      placeholder="Min age"
                    />
                    <input
                      id="default-age-max"
                      type="number"
                      min="13"
                      max="65"
                      value={form.staticDefaults.audienceAgeMax}
                      onChange={(event) => updateStaticDefault('audienceAgeMax', event.target.value)}
                      className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      placeholder="Max age"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor="default-gender">Gender targeting</FieldLabel>
                  <select
                    id="default-gender"
                    value={form.staticDefaults.genderTargeting}
                    onChange={(event) => updateStaticDefault('genderTargeting', event.target.value)}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    {staticDefaultOptions.genderTargeting.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor="default-billing-event">Billing event</FieldLabel>
                  <select
                    id="default-billing-event"
                    value={form.staticDefaults.billingEvent}
                    onChange={(event) => updateStaticDefault('billingEvent', event.target.value)}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    {staticDefaultOptions.billingEvent.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <FieldLabel htmlFor="default-bid-strategy">Bid strategy</FieldLabel>
                  <select
                    id="default-bid-strategy"
                    value={form.staticDefaults.bidStrategy}
                    onChange={(event) => updateStaticDefault('bidStrategy', event.target.value)}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    {staticDefaultOptions.bidStrategy.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <FieldLabel htmlFor="default-bid-amount">Bid/cost cap amount</FieldLabel>
                  <input
                    id="default-bid-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.staticDefaults.bidAmount || ''}
                    onChange={(event) => updateStaticDefault('bidAmount', event.target.value)}
                    disabled={!bidAmountRequired}
                    placeholder={bidAmountRequired ? 'Example: 5.00' : 'Only for capped strategies'}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                  <p className="text-xs font-semibold text-slate-400">
                    {bidAmountRequired
                      ? 'Used as Meta bid_amount in the ad account currency.'
                      : 'Lowest cost does not need a bid amount.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3 rounded-xl bg-sky-50/70 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-500">Buying type</span>
                  <span className="text-right text-sm font-black text-slate-950">
                    {getOptionLabel(staticDefaultOptions.buyingType, form.staticDefaults.buyingType)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 rounded-xl bg-sky-50/70 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-500">Campaign status</span>
                  <span className="text-right text-sm font-black text-slate-950">
                    {getOptionLabel(staticDefaultOptions.campaignStatus, form.staticDefaults.campaignStatus)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 rounded-xl bg-sky-50/70 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-500">Special ad categories</span>
                  <span className="text-right text-sm font-black text-slate-950">
                    {getOptionLabel(staticDefaultOptions.specialAdCategories, form.staticDefaults.specialAdCategories)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 rounded-xl bg-sky-50/70 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-500">Placements</span>
                  <span className="text-right text-sm font-black text-slate-950">
                    {getOptionLabel(staticDefaultOptions.placements, form.staticDefaults.placements)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 rounded-xl bg-sky-50/70 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-500">Budget level</span>
                  <span className="text-right text-sm font-black text-slate-950">
                    {getOptionLabel(staticDefaultOptions.budgetLevel, form.staticDefaults.budgetLevel)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 rounded-xl bg-sky-50/70 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-500">Dynamic creative</span>
                  <span className="text-right text-sm font-black text-slate-950">
                    {getOptionLabel(staticDefaultOptions.dynamicCreative, form.staticDefaults.dynamicCreative)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 rounded-xl bg-sky-50/70 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-500">Audience age</span>
                  <span className="text-right text-sm font-black text-slate-950">
                    {form.staticDefaults.audienceAgeMin} to {form.staticDefaults.audienceAgeMax}+
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 rounded-xl bg-sky-50/70 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-500">Gender targeting</span>
                  <span className="text-right text-sm font-black text-slate-950">
                    {getOptionLabel(staticDefaultOptions.genderTargeting, form.staticDefaults.genderTargeting)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 rounded-xl bg-sky-50/70 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-500">Billing event</span>
                  <span className="text-right text-sm font-black text-slate-950">
                    {getOptionLabel(staticDefaultOptions.billingEvent, form.staticDefaults.billingEvent)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 rounded-xl bg-sky-50/70 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-500">Bid strategy</span>
                  <span className="text-right text-sm font-black text-slate-950">
                    {getOptionLabel(staticDefaultOptions.bidStrategy, form.staticDefaults.bidStrategy)}
                  </span>
                </div>
                {bidAmountRequired ? (
                  <div className="flex items-start justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3">
                    <span className="text-sm font-semibold text-amber-700">Bid/cost cap amount</span>
                    <span className="text-right text-sm font-black text-amber-900">
                      {form.staticDefaults.bidAmount || 'Missing'}
                    </span>
                  </div>
                ) : null}
              </div>
            )}
          </DashboardPanel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          label="Brand Tokens"
          value={selectedBrand ? brandTokenOptions.length : activeTokens.length}
          detail={selectedBrand ? 'Active tokens assigned to this brand.' : 'Select a brand to narrow token choices.'}
        />
        <MetricCard label="Brand Accounts" value={scopedAdAccounts.length} detail="Accounts available after brand and token selection." />
        <MetricCard label="Loaded Pages" value={pages.length} detail="Page options come directly from Meta token access." />
        <MetricCard label="Shared Pixels" value={pixels.length} detail="Common pixels across the selected accounts." />
      </div>

      <div className="mt-4 grid gap-4 2xl:grid-cols-[360px_minmax(0,1fr)]">
        <DashboardPanel title="Current launch context">
          <div className="space-y-4">
            {selectedBrand ? (
              <div className="rounded-2xl border border-sky-100 bg-white px-4 py-4">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedBrand.color || '#0ea5e9' }} />
                  <p className="font-black text-slate-950">{selectedBrand.name}</p>
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-400">
                  {selectedBrand.socialAccountCount || 0} assigned social account{selectedBrand.socialAccountCount === 1 ? '' : 's'}
                </p>
              </div>
            ) : (
              <EmptyState>Select a brand first. Token and ad account options will follow that brand assignment.</EmptyState>
            )}

            {selectedToken ? (
              <div className="rounded-2xl border border-sky-100 bg-white px-4 py-4">
                <p className="font-black text-slate-950">{selectedToken.label}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">{selectedToken.accessToken}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <InfoPill icon={KeyRound}>Status: {selectedToken.status}</InfoPill>
                  <InfoPill icon={Layers3}>API calls: {selectedToken.apiCallCount}</InfoPill>
                  <InfoPill icon={MousePointerClick} tone="amber">
                    Last used {formatDateTime(selectedToken.lastApiCallAt)}
                  </InfoPill>
                </div>
              </div>
            ) : (
              <EmptyState>Select a brand token to load API-backed asset options.</EmptyState>
            )}

            {!loadingPixels && form.selectedAdAccountIds.length > 1 && !pixels.length ? (
              <EmptyState>
                {pixelRequired
                  ? 'No common pixel was found across the selected ad accounts for this token.'
                  : 'No common pixel was found across the selected ad accounts. Traffic and engagement launches can still publish without one.'}
              </EmptyState>
            ) : null}

            <div className="rounded-2xl bg-amber-50 px-4 py-4 text-amber-800">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                <p className="text-sm font-semibold">
                  Templates now keep the launch configuration and can also keep the saved creative asset. Reload a template to preview,
                  adjust, and send it again with the same permissions enforced for the signed-in admin.
                </p>
              </div>
            </div>
          </div>
        </DashboardPanel>

        <DashboardPanel title="Automatic launch plan">
          {previewItems.length ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Source Token" value={selectedToken?.label || 'Not selected'} />
                <MetricCard label="Selected Accounts" value={previewItems.length} />
                <MetricCard label="Page" value={selectedPage?.name || 'Not selected'} />
                <MetricCard label="Pixel" value={selectedPixel?.name || 'Not selected'} />
              </div>

              <div className="space-y-3">
                {previewItems.map((item) => (
                  <div key={item.account.id} className="rounded-2xl border border-sky-100 bg-white px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Ad Account</p>
                        <p className="mt-1 text-sm font-black text-slate-950">
                          {item.account.name} ({item.account.accountId})
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                        <Check size={13} strokeWidth={2.4} />
                        Ready for batch
                      </span>
                    </div>

                    <div className="mt-3 grid gap-3 lg:grid-cols-3">
                      <div className="rounded-xl bg-sky-50/70 p-3">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">Campaign</p>
                        <p className="mt-2 text-sm font-black text-slate-950">{item.campaignName}</p>
                      </div>
                      <div className="rounded-xl bg-sky-50/70 p-3">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">Ad set</p>
                        <p className="mt-2 text-sm font-black text-slate-950">{item.adSetName}</p>
                      </div>
                      <div className="rounded-xl bg-sky-50/70 p-3">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">Ad</p>
                        <p className="mt-2 text-sm font-black text-slate-950">{item.adName}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {latestPublish ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <p className="text-sm font-black text-emerald-900">{latestPublish.message}</p>
                  {latestPublish.summary ? (
                    <p className="mt-2 text-sm font-semibold text-emerald-800">
                      Published {latestPublish.summary?.published || 0} of {latestPublish.summary?.requested || 0} requested accounts.
                    </p>
                  ) : (
                    <p className="mt-2 text-sm font-semibold text-emerald-800">
                      You can watch this queued publish from the notification panel while it runs in the background.
                    </p>
                  )}

                  {latestPublish.results?.length ? (
                    <div className="mt-4 space-y-2">
                      {latestPublish.results.map((result) => (
                        <div key={`${result.adAccountId}-${result.adId}`} className="rounded-xl bg-white/80 px-3 py-3 text-sm text-slate-700">
                          <p className="font-black text-slate-950">{result.adAccountName || result.adAccountId}</p>
                          <p className="mt-1">Campaign: {result.campaignId}</p>
                          <p>Ad set: {result.adSetId}</p>
                          <p>Creative: {result.creativeId}</p>
                          <p>Ad: {result.adId}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {latestPublish.failed?.length ? (
                    <div className="mt-4 space-y-2">
                      {latestPublish.failed.map((item) => (
                        <p key={`${item.adAccountId}-${item.message}`} className="rounded-xl bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-800">
                          {item.adAccountId}: {item.message}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState>Select the token and one or more ad accounts to preview the launch structure.</EmptyState>
          )}
        </DashboardPanel>
      </div>
    </div>
  );
};

export default AdsLaunchPage;
