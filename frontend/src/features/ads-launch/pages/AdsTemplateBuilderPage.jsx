import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, LoaderCircle, Pencil, Plus, Save, Settings2, Trash2, X } from 'lucide-react';
import { businessDataApi } from '../../dashboard/api/businessDataApi';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { adsLaunchApi } from '../api/adsLaunchApi';
import AttributionSettingsPanel from '../components/AttributionSettingsPanel';
import { useLaunchTemplates } from '../hooks/useLaunchTemplates';
import {
  getMinimumScheduleStartValue,
  getScheduleValidationError,
  INDONESIA_TIME_ZONE_LABEL,
  toDateTimeLocalInputValue,
  toSchedulePayloadValue,
} from '../utils/scheduleTime';
import {
  DEFAULT_ATTRIBUTION_WINDOWS,
  mergeAttributionStaticDefaults,
  withAttributionStaticDefaults,
} from '../utils/attributionSettings';

const TEMPLATE_TYPES = {
  CAMPAIGN: 'CAMPAIGN',
  MEDIA: 'MEDIA',
};

const campaignDefaults = {
  name: '',
  brandId: '',
  launchLabel: '',
  countries: ['ID'],
  objective: 'OUTCOME_TRAFFIC',
  websiteEvent: 'LEAD',
  dailyBudget: '15',
  scheduleStart: '',
  scheduleEnd: '',
  staticDefaults: {
    campaignStatus: 'PAUSED',
    buyingType: 'AUCTION',
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
    attributionSetting: 'CLICK_7D_VIEW_1D',
    attributionWindows: { ...DEFAULT_ATTRIBUTION_WINDOWS },
  },
};

const countryOptions = [
  { value: 'ID', label: 'Indonesia' },
  { value: 'IN', label: 'India' },
  { value: 'CN', label: 'China' },
  { value: 'LK', label: 'Sri Lanka' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
];

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

const campaignStatusOptions = [
  { value: 'PAUSED', label: 'Paused on create' },
  { value: 'ACTIVE', label: 'Active on create' },
];

const mediaDefaults = {
  name: '',
  brandId: '',
  headline: '',
  primaryText: '',
  description: '',
  websiteUrl: '',
  displayUrl: '',
  urlParameters: '',
  callToAction: 'LEARN_MORE',
};

const TRAFFIC_OBJECTIVE = 'OUTCOME_TRAFFIC';
const LEADS_OBJECTIVE = 'OUTCOME_LEADS';
const SALES_OBJECTIVE = 'OUTCOME_SALES';
const supportedObjectiveValues = new Set([TRAFFIC_OBJECTIVE, LEADS_OBJECTIVE, SALES_OBJECTIVE]);
const defaultWebsiteEventByObjective = {
  [LEADS_OBJECTIVE]: 'LEAD',
  [SALES_OBJECTIVE]: 'PURCHASE',
};
const TEMPLATES_PER_PAGE = 2;

const objectiveOptions = [
  { value: TRAFFIC_OBJECTIVE, label: 'Traffic' },
  { value: 'OUTCOME_ENGAGEMENT', label: 'Engagement' },
  { value: LEADS_OBJECTIVE, label: 'Leads' },
  { value: SALES_OBJECTIVE, label: 'Sales' },
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
    label: 'GA4',
    value:
      'utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}',
  },
  {
    label: 'Full Meta',
    value:
      'utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}',
  },
  {
    label: 'Simple',
    value: 'utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}',
  },
];

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

const stringifyUrlParameterEntries = (entries) =>
  entries
    .filter((entry) => entry.key.trim() && entry.value.trim())
    .map((entry) => `${entry.key.trim()}=${entry.value.trim()}`)
    .join('&');

const getUrlParameterValidationError = (value) => {
  const entries = parseUrlParameterEntries(value);
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

const createCampaignDefaults = () => ({
  ...campaignDefaults,
  countries: [...campaignDefaults.countries],
  staticDefaults: withAttributionStaticDefaults(campaignDefaults.staticDefaults),
});

const createMediaDefaults = () => ({
  ...mediaDefaults,
});

const normalizeTemplateCountries = (config = {}) => {
  const countries = Array.isArray(config.countries) ? config.countries.filter(Boolean) : [];
  return countries.length ? countries : config.country ? [config.country] : ['ID'];
};

const normalizeCampaignStatus = (value) => (String(value || '').trim().toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'PAUSED');
const normalizeObjective = (objective) => (supportedObjectiveValues.has(objective) ? objective : TRAFFIC_OBJECTIVE);

const getCampaignStatusBadgeClass = (status) =>
  status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';

const FieldLabel = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-700">
    {children}
  </label>
);

const TemplateCard = ({ template, onDelete, onEdit }) => {
  const isCampaignTemplate = ['CAMPAIGN', 'FULL'].includes(template.templateType || 'FULL');
  const campaignStatus = normalizeCampaignStatus(template.config?.staticDefaults?.campaignStatus);

  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">{template.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-600">{template.templateType}</p>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-700">
              {template.snapshot?.brandName || 'Unassigned brand'}
            </span>
            {isCampaignTemplate ? (
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${getCampaignStatusBadgeClass(campaignStatus)}`}>
                {campaignStatus}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(template)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-100 text-sky-700 transition hover:bg-sky-50"
            title="Edit template"
          >
            <Pencil size={16} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(template)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 text-red-600 transition hover:bg-red-50"
            title="Delete template"
          >
            <Trash2 size={16} strokeWidth={2.2} />
          </button>
        </div>
      </div>
      <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-slate-500">
        {isCampaignTemplate
          ? `${template.config?.objective || 'Campaign'} | ${campaignStatus} | Budget ${template.config?.dailyBudget || 'not set'}`
          : `${template.config?.headline || 'Copy template'} | ${template.config?.callToAction || 'CTA'} | ${template.config?.description || 'No description'}`}
      </p>
    </div>
  );
};

const TemplatePager = ({ page, pageCount, onPrevious, onNext }) => (
  <div className="flex items-center gap-1">
    <button
      type="button"
      onClick={onPrevious}
      disabled={page <= 1}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-100 bg-white text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-slate-300"
      aria-label="Previous templates"
    >
      <ChevronLeft size={16} strokeWidth={2.4} />
    </button>
    <button
      type="button"
      onClick={onNext}
      disabled={page >= pageCount}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-100 bg-white text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-slate-300"
      aria-label="Next templates"
    >
      <ChevronRight size={16} strokeWidth={2.4} />
    </button>
  </div>
);

const AdsTemplateBuilderPage = () => {
  const { error, loadTemplates, loading, templates } = useLaunchTemplates();
  const [campaignForm, setCampaignForm] = useState(createCampaignDefaults);
  const [mediaForm, setMediaForm] = useState(createMediaDefaults);
  const [editingCampaignTemplateId, setEditingCampaignTemplateId] = useState('');
  const [editingMediaTemplateId, setEditingMediaTemplateId] = useState('');
  const [urlParameterDraft, setUrlParameterDraft] = useState({ key: '', value: '' });
  const [savingType, setSavingType] = useState('');
  const [brands, setBrands] = useState([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [templateBrandFilter, setTemplateBrandFilter] = useState('');
  const [campaignTemplatePage, setCampaignTemplatePage] = useState(1);
  const [mediaTemplatePage, setMediaTemplatePage] = useState(1);

  const campaignTemplateBrand = brands.find((brand) => brand.id === campaignForm.brandId) || null;
  const mediaTemplateBrand = brands.find((brand) => brand.id === mediaForm.brandId) || null;
  const campaignTemplates = useMemo(
    () => templates.filter((template) => template.templateType === TEMPLATE_TYPES.CAMPAIGN && (!templateBrandFilter || template.config?.brandId === templateBrandFilter)),
    [templateBrandFilter, templates]
  );
  const mediaTemplates = useMemo(
    () => templates.filter((template) => template.templateType === TEMPLATE_TYPES.MEDIA && (!templateBrandFilter || template.config?.brandId === templateBrandFilter)),
    [templateBrandFilter, templates]
  );
  const campaignTemplatePageCount = Math.max(Math.ceil(campaignTemplates.length / TEMPLATES_PER_PAGE), 1);
  const mediaTemplatePageCount = Math.max(Math.ceil(mediaTemplates.length / TEMPLATES_PER_PAGE), 1);
  const safeCampaignTemplatePage = Math.min(campaignTemplatePage, campaignTemplatePageCount);
  const safeMediaTemplatePage = Math.min(mediaTemplatePage, mediaTemplatePageCount);
  const visibleCampaignTemplates = campaignTemplates.slice(
    (safeCampaignTemplatePage - 1) * TEMPLATES_PER_PAGE,
    safeCampaignTemplatePage * TEMPLATES_PER_PAGE
  );
  const visibleMediaTemplates = mediaTemplates.slice(
    (safeMediaTemplatePage - 1) * TEMPLATES_PER_PAGE,
    safeMediaTemplatePage * TEMPLATES_PER_PAGE
  );
  const selectedCampaignCountries = useMemo(() => campaignForm.countries || ['ID'], [campaignForm.countries]);
  const availableCampaignCountries = useMemo(
    () => countryOptions.filter((country) => !selectedCampaignCountries.includes(country.value)),
    [selectedCampaignCountries]
  );
  const mediaUrlParameterEntries = useMemo(() => parseUrlParameterEntries(mediaForm.urlParameters), [mediaForm.urlParameters]);
  const campaignPixelRequired = campaignForm.objective === 'OUTCOME_LEADS' || campaignForm.objective === 'OUTCOME_SALES';
  const campaignBidAmountRequired = cappedBidStrategies.has(campaignForm.staticDefaults.bidStrategy);
  const campaignScheduleValidationError = getScheduleValidationError(campaignForm);
  const minimumScheduleStartValue = getMinimumScheduleStartValue();
  const mediaEditMode = Boolean(editingMediaTemplateId);
  const campaignEditMode = Boolean(editingCampaignTemplateId);

  useEffect(() => {
    let mounted = true;

    businessDataApi
      .getBrands()
      .then((data) => {
        if (mounted) {
          setBrands(data.brands || []);
        }
      })
      .catch((requestError) => toast.error(requestError.message))
      .finally(() => {
        if (mounted) {
          setBrandsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setCampaignTemplatePage(1);
    setMediaTemplatePage(1);
  }, [templateBrandFilter, campaignTemplates.length, mediaTemplates.length]);

  const updateCampaignField = (field, value) => {
    setCampaignForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleCampaignObjectiveChange = (objective) => {
    if (!supportedObjectiveValues.has(objective)) {
      toast.error('Engagement is not enabled in this launcher yet');
      return;
    }

    setCampaignForm((current) => {
      return {
        ...current,
        objective,
        websiteEvent: defaultWebsiteEventByObjective[objective] || '',
      };
    });
  };

  const addCampaignCountry = (countryCode) => {
    if (!countryCode) {
      return;
    }

    setCampaignForm((current) => {
      const countries = current.countries || [];

      if (countries.includes(countryCode)) {
        return current;
      }

      return {
        ...current,
        countries: [...countries, countryCode],
      };
    });
  };

  const removeCampaignCountry = (countryCode) => {
    setCampaignForm((current) => {
      const countries = current.countries || [];

      if (countries.length <= 1) {
        return current;
      }

      return {
        ...current,
        countries: countries.filter((country) => country !== countryCode),
      };
    });
  };

  const updateCampaignDefault = (field, value) => {
    setCampaignForm((current) => ({
      ...current,
      staticDefaults: withAttributionStaticDefaults({
        ...current.staticDefaults,
        [field]: value,
      }),
    }));
  };

  const updateCampaignAttributionWindows = (attributionWindows) => {
    setCampaignForm((current) => ({
      ...current,
      staticDefaults: withAttributionStaticDefaults({
        ...current.staticDefaults,
        attributionWindows,
      }),
    }));
  };

  const updateMediaField = (field, value) => {
    setMediaForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateUrlParameter = (key, value) => {
    const normalizedKey = key.trim();
    const normalizedValue = value.trim();
    const nextEntries = parseUrlParameterEntries(mediaForm.urlParameters).filter((entry) => entry.key !== normalizedKey);

    if (normalizedKey && normalizedValue) {
      nextEntries.push({
        key: normalizedKey,
        value: normalizedValue,
      });
    }

    updateMediaField('urlParameters', stringifyUrlParameterEntries(nextEntries));
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
    setUrlParameterDraft({ key: '', value: '' });
  };

  const resetCampaignEditor = () => {
    setCampaignForm(createCampaignDefaults());
    setEditingCampaignTemplateId('');
  };

  const resetMediaEditor = () => {
    setMediaForm(createMediaDefaults());
    setEditingMediaTemplateId('');
    setUrlParameterDraft({ key: '', value: '' });
  };

  const editCampaignTemplate = (template) => {
    const config = template.config || {};
    const countries = normalizeTemplateCountries(config);
    const staticDefaults = mergeAttributionStaticDefaults(campaignDefaults.staticDefaults, config.staticDefaults || {});

    setCampaignForm({
      ...createCampaignDefaults(),
      name: template.name || '',
      brandId: config.brandId || '',
      launchLabel: config.launchLabel || '',
      countries,
      objective: normalizeObjective(config.objective),
      websiteEvent: config.websiteEvent || defaultWebsiteEventByObjective[normalizeObjective(config.objective)] || '',
      dailyBudget: config.dailyBudget || '15',
      scheduleStart: toDateTimeLocalInputValue(config.scheduleStart),
      scheduleEnd: toDateTimeLocalInputValue(config.scheduleEnd),
      staticDefaults: {
        ...staticDefaults,
        campaignStatus: normalizeCampaignStatus(staticDefaults.campaignStatus),
      },
    });
    setEditingCampaignTemplateId(template.id);
    toast.success(`Editing campaign template "${template.name}"`);
  };

  const editMediaTemplate = (template) => {
    const config = template.config || {};

    setMediaForm({
      ...createMediaDefaults(),
      name: template.name || '',
      brandId: config.brandId || '',
      headline: config.headline || '',
      primaryText: config.primaryText || '',
      description: config.description || '',
      websiteUrl: config.websiteUrl || '',
      displayUrl: config.displayUrl || '',
      urlParameters: config.urlParameters || '',
      callToAction: config.callToAction || 'LEARN_MORE',
    });
    setEditingMediaTemplateId(template.id);
    setUrlParameterDraft({ key: '', value: '' });
    toast.success(`Editing media template "${template.name}"`);
  };

  const saveCampaignTemplate = async () => {
    if (!campaignForm.name.trim() || !campaignForm.launchLabel.trim()) {
      toast.error('Campaign template name and launch label are required');
      return;
    }

    if (!campaignForm.brandId) {
      toast.error('Select the ads brand for this campaign template');
      return;
    }

    if (campaignScheduleValidationError) {
      toast.error(campaignScheduleValidationError);
      return;
    }

    if (campaignPixelRequired && !campaignForm.websiteEvent) {
      toast.error('Select the website event for this Lead or Sales campaign template');
      return;
    }

    if (campaignBidAmountRequired && (!campaignForm.staticDefaults.bidAmount || Number(campaignForm.staticDefaults.bidAmount) <= 0)) {
      toast.error('Enter a positive bid amount for Bid cap or Cost cap');
      return;
    }

    setSavingType(TEMPLATE_TYPES.CAMPAIGN);
    try {
      const countries = (campaignForm.countries || [])
        .map((country) => country.trim().toUpperCase())
        .filter(Boolean);
      const payload = {
        name: campaignForm.name.trim(),
        templateType: TEMPLATE_TYPES.CAMPAIGN,
        config: {
          brandId: campaignForm.brandId,
          launchLabel: campaignForm.launchLabel.trim(),
          country: countries[0] || 'ID',
          countries: countries.length ? countries : ['ID'],
          objective: normalizeObjective(campaignForm.objective),
          websiteEvent: campaignPixelRequired ? campaignForm.websiteEvent : '',
          dailyBudget: campaignForm.dailyBudget,
          scheduleStart: toSchedulePayloadValue(campaignForm.scheduleStart),
          scheduleEnd: toSchedulePayloadValue(campaignForm.scheduleEnd),
          staticDefaults: withAttributionStaticDefaults(campaignForm.staticDefaults),
        },
        snapshot: {
          brandName: campaignTemplateBrand?.name || '',
        },
      };
      const data = campaignEditMode
        ? await adsLaunchApi.updateTemplate(editingCampaignTemplateId, payload)
        : await adsLaunchApi.createTemplate(payload);
      toast.success(data.message);
      resetCampaignEditor();
      await loadTemplates();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSavingType('');
    }
  };

  const saveMediaTemplate = async () => {
    if (!mediaForm.name.trim() || !mediaForm.headline.trim() || !mediaForm.primaryText.trim() || !mediaForm.websiteUrl.trim()) {
      toast.error('Media template name, headline, text, and destination URL are required');
      return;
    }

    if (!mediaForm.brandId) {
      toast.error('Select the ads brand for this media template');
      return;
    }

    const urlParameterError = getUrlParameterValidationError(mediaForm.urlParameters);
    if (urlParameterError) {
      toast.error(urlParameterError);
      return;
    }

    setSavingType(TEMPLATE_TYPES.MEDIA);
    try {
      const payload = {
        name: mediaForm.name.trim(),
        templateType: TEMPLATE_TYPES.MEDIA,
        config: {
          brandId: mediaForm.brandId,
          headline: mediaForm.headline.trim(),
          primaryText: mediaForm.primaryText.trim(),
          description: mediaForm.description.trim(),
          websiteUrl: mediaForm.websiteUrl.trim(),
          displayUrl: mediaForm.displayUrl.trim(),
          urlParameters: mediaForm.urlParameters.trim(),
          callToAction: mediaForm.callToAction,
        },
        snapshot: {
          clearMedia: true,
          brandName: mediaTemplateBrand?.name || '',
        },
      };
      const data = mediaEditMode
        ? await adsLaunchApi.updateTemplate(editingMediaTemplateId, payload)
        : await adsLaunchApi.createTemplate(payload);
      toast.success(data.message);
      resetMediaEditor();
      await loadTemplates();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSavingType('');
    }
  };

  const deleteTemplate = async (template) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) {
      return;
    }

    try {
      const data = await adsLaunchApi.deleteTemplate(template.id);
      if (editingCampaignTemplateId === template.id) {
        resetCampaignEditor();
      }
      if (editingMediaTemplateId === template.id) {
        resetMediaEditor();
      }
      toast.success(data.message);
      await loadTemplates();
    } catch (requestError) {
      toast.error(requestError.message);
    }
  };

  return (
    <div>
      <DashboardHeader
        title="Ads Template Builder"
        description="Create campaign templates and media templates as reusable building blocks for dynamic multi-account publishing."
      />

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <DashboardPanel title="Template filters" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(220px,360px)_1fr] sm:items-end">
          <div className="space-y-2">
            <FieldLabel htmlFor="template-brand-filter">Brand</FieldLabel>
            <select
              id="template-brand-filter"
              value={templateBrandFilter}
              onChange={(event) => setTemplateBrandFilter(event.target.value)}
              disabled={brandsLoading}
              className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              <option value="">All brands</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>{brand.name}</option>
              ))}
            </select>
          </div>
          <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm font-semibold text-slate-500">
            Templates are grouped by ads brand so Dynamic Ads Launch only shows the right building blocks for the selected brand.
          </p>
        </div>
      </DashboardPanel>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <DashboardPanel
            title={campaignEditMode ? 'Edit campaign template' : 'Campaign template'}
            headerAction={
              campaignEditMode ? (
                <button type="button" onClick={resetCampaignEditor} className="rounded-lg border border-sky-100 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-sky-50">
                  Cancel
                </button>
              ) : null
            }
          >
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-template-brand">Ads brand</FieldLabel>
                <select id="campaign-template-brand" value={campaignForm.brandId} onChange={(event) => updateCampaignField('brandId', event.target.value)} disabled={brandsLoading} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  <option value="">Select brand</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-template-name">Template name</FieldLabel>
                <input id="campaign-template-name" value={campaignForm.name} onChange={(event) => updateCampaignField('name', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder="ID Traffic 21+" />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-launch-label">Launch label</FieldLabel>
                <input id="campaign-launch-label" value={campaignForm.launchLabel} onChange={(event) => updateCampaignField('launchLabel', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder="CoreSelf Promo" />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-countries">Countries</FieldLabel>
                <div className="min-h-12 rounded-xl border border-sky-100 bg-white px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {selectedCampaignCountries.map((countryCode) => {
                      const country = countryOptions.find((option) => option.value === countryCode);

                      return (
                        <span key={countryCode} className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
                          {country?.label || countryCode}
                          <button
                            type="button"
                            onClick={() => removeCampaignCountry(countryCode)}
                            disabled={selectedCampaignCountries.length <= 1}
                            className="text-sky-500 transition hover:text-red-500 disabled:opacity-30"
                            aria-label={`Remove ${countryCode}`}
                          >
                            <X size={13} strokeWidth={2.4} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  <select
                    id="campaign-countries"
                    value=""
                    onChange={(event) => addCampaignCountry(event.target.value)}
                    className="mt-2 h-9 w-full rounded-lg border border-sky-100 px-3 text-sm font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    <option value="">Add country</option>
                    {availableCampaignCountries.map((country) => (
                      <option key={country.value} value={country.value}>{country.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-objective">Objective</FieldLabel>
                <select id="campaign-objective" value={campaignForm.objective} onChange={(event) => handleCampaignObjectiveChange(event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  {objectiveOptions.map((option) => (
                    <option key={option.value} value={option.value} disabled={!supportedObjectiveValues.has(option.value)}>
                      {supportedObjectiveValues.has(option.value) ? option.label : `${option.label} (disabled)`}
                    </option>
                  ))}
                </select>
                <p className="text-xs font-semibold text-slate-400">Leads and Sales require a pixel in Dynamic Ads Launch before publish.</p>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-website-event">Website event</FieldLabel>
                <select id="campaign-website-event" value={campaignForm.websiteEvent} onChange={(event) => updateCampaignField('websiteEvent', event.target.value)} disabled={!campaignPixelRequired} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400">
                  {websiteEventOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="text-xs font-semibold text-slate-400">Used only when the campaign objective requires a pixel.</p>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-budget">Daily budget</FieldLabel>
                <input id="campaign-budget" type="number" min="1" value={campaignForm.dailyBudget} onChange={(event) => updateCampaignField('dailyBudget', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-buying-type">Buying type</FieldLabel>
                <select id="campaign-buying-type" value={campaignForm.staticDefaults.buyingType} onChange={(event) => updateCampaignDefault('buyingType', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  {staticDefaultOptions.buyingType.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-status">Publish status</FieldLabel>
                <select id="campaign-status" value={campaignForm.staticDefaults.campaignStatus} onChange={(event) => updateCampaignDefault('campaignStatus', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  {campaignStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="text-xs font-semibold text-slate-400">Active can deliver inside the schedule window. Paused stays stopped until you manually activate it.</p>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-special-category">Special ad categories</FieldLabel>
                <select id="campaign-special-category" value={campaignForm.staticDefaults.specialAdCategories} onChange={(event) => updateCampaignDefault('specialAdCategories', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  {staticDefaultOptions.specialAdCategories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-placements">Placements</FieldLabel>
                <select id="campaign-placements" value={campaignForm.staticDefaults.placements} onChange={(event) => updateCampaignDefault('placements', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  {staticDefaultOptions.placements.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-budget-level">Budget level</FieldLabel>
                <select id="campaign-budget-level" value={campaignForm.staticDefaults.budgetLevel} onChange={(event) => updateCampaignDefault('budgetLevel', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  {staticDefaultOptions.budgetLevel.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-dynamic">Dynamic creative</FieldLabel>
                <select id="campaign-dynamic" value={campaignForm.staticDefaults.dynamicCreative} onChange={(event) => updateCampaignDefault('dynamicCreative', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  {staticDefaultOptions.dynamicCreative.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-age-min">Min age</FieldLabel>
                <input id="campaign-age-min" type="number" min="13" value={campaignForm.staticDefaults.audienceAgeMin} onChange={(event) => updateCampaignDefault('audienceAgeMin', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-age-max">Max age</FieldLabel>
                <input id="campaign-age-max" type="number" min="13" value={campaignForm.staticDefaults.audienceAgeMax} onChange={(event) => updateCampaignDefault('audienceAgeMax', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-gender">Gender targeting</FieldLabel>
                <select id="campaign-gender" value={campaignForm.staticDefaults.genderTargeting} onChange={(event) => updateCampaignDefault('genderTargeting', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  {staticDefaultOptions.genderTargeting.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-billing-event">Billing event</FieldLabel>
                <select id="campaign-billing-event" value={campaignForm.staticDefaults.billingEvent} onChange={(event) => updateCampaignDefault('billingEvent', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  {staticDefaultOptions.billingEvent.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-bid-strategy">Bid strategy</FieldLabel>
                <select id="campaign-bid-strategy" value={campaignForm.staticDefaults.bidStrategy} onChange={(event) => updateCampaignDefault('bidStrategy', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  {staticDefaultOptions.bidStrategy.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-bid-amount">Bid/cost cap amount</FieldLabel>
                <input
                  id="campaign-bid-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={campaignForm.staticDefaults.bidAmount || ''}
                  onChange={(event) => updateCampaignDefault('bidAmount', event.target.value)}
                  disabled={!campaignBidAmountRequired}
                  placeholder={campaignBidAmountRequired ? 'Example: 5.00' : 'Only for capped strategies'}
                  className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              <div className="space-y-2 xl:col-span-2">
                <AttributionSettingsPanel
                  idPrefix="campaign-template-attribution"
                  value={campaignForm.staticDefaults}
                  objective={campaignForm.objective}
                  onChange={updateCampaignAttributionWindows}
                />
     
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-schedule-start">Schedule start</FieldLabel>
                <input id="campaign-schedule-start" type="datetime-local" value={campaignForm.scheduleStart} min={minimumScheduleStartValue} onChange={(event) => updateCampaignField('scheduleStart', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                <p className="text-xs font-semibold text-slate-400">
                  Optional. Must be at least 10 minutes ahead in {INDONESIA_TIME_ZONE_LABEL}.
                </p>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-schedule-end">Schedule end</FieldLabel>
                <input id="campaign-schedule-end" type="datetime-local" value={campaignForm.scheduleEnd} min={campaignForm.scheduleStart || minimumScheduleStartValue} onChange={(event) => updateCampaignField('scheduleEnd', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
              </div>
            </div>
            {campaignScheduleValidationError ? (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {campaignScheduleValidationError}
              </p>
            ) : campaignBidAmountRequired ? (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                Capped bidding uses this amount in the ad account currency. Meta receives it as the ad set bid amount.
              </p>
            ) : campaignForm.scheduleStart && campaignForm.scheduleEnd ? (
              <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                Schedule looks valid. It will be saved as {INDONESIA_TIME_ZONE_LABEL} for Meta.
              </p>
            ) : null}
            <button type="button" onClick={saveCampaignTemplate} disabled={Boolean(savingType)} className="mt-5 flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-70">
              {savingType === TEMPLATE_TYPES.CAMPAIGN ? <LoaderCircle size={17} className="animate-spin" /> : <Settings2 size={17} />}
              {campaignEditMode ? 'Update campaign template' : 'Save campaign template'}
            </button>
          </DashboardPanel>

          <DashboardPanel
            title={mediaEditMode ? 'Edit media template' : 'Media template'}
            headerAction={
              mediaEditMode ? (
                <button type="button" onClick={resetMediaEditor} className="rounded-lg border border-sky-100 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-sky-50">
                  Cancel
                </button>
              ) : null
            }
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <select value={mediaForm.brandId} onChange={(event) => updateMediaField('brandId', event.target.value)} disabled={brandsLoading} className="h-12 rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                <option value="">Select ads brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </select>
              <input value={mediaForm.name} onChange={(event) => updateMediaField('name', event.target.value)} className="h-12 rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder="Template name" />
              <input value={mediaForm.headline} onChange={(event) => updateMediaField('headline', event.target.value)} className="h-12 rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder="Headline" />
              <textarea value={mediaForm.primaryText} onChange={(event) => updateMediaField('primaryText', event.target.value)} className="min-h-24 rounded-xl border border-sky-100 px-4 py-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 xl:col-span-2" placeholder="Primary text" />
              <textarea value={mediaForm.description} onChange={(event) => updateMediaField('description', event.target.value)} className="min-h-20 rounded-xl border border-sky-100 px-4 py-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 xl:col-span-2" placeholder="Description (optional)" />
              <input value={mediaForm.websiteUrl} onChange={(event) => updateMediaField('websiteUrl', event.target.value)} className="h-12 rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder="Destination URL" />
              <input value={mediaForm.displayUrl} onChange={(event) => updateMediaField('displayUrl', event.target.value)} className="h-12 rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder="Display URL" />
              <select value={mediaForm.callToAction} onChange={(event) => updateMediaField('callToAction', event.target.value)} className="h-12 rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                <option value="LEARN_MORE">Learn More</option>
                <option value="SHOP_NOW">Shop Now</option>
                <option value="SIGN_UP">Sign Up</option>
                <option value="CONTACT_US">Contact Us</option>
                <option value="APPLY_NOW">Apply Now</option>
              </select>
              <div className="space-y-4 rounded-2xl border border-sky-100 bg-white p-4 xl:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950">URL parameter builder</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">Saved into the media template and sent to Meta as `url_tags`.</p>
                  </div>
                  {mediaForm.urlParameters ? (
                    <button type="button" onClick={() => updateMediaField('urlParameters', '')} className="h-9 rounded-lg border border-red-100 bg-white px-3 text-xs font-black uppercase tracking-[0.14em] text-red-600 transition hover:bg-red-50">
                      Clear
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {urlParameterPresets.map((preset) => (
                    <button key={preset.label} type="button" onClick={() => updateMediaField('urlParameters', normalizeUrlParameterString(preset.value))} className="rounded-full border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 transition hover:border-sky-300 hover:bg-sky-100">
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {urlParameterBuilderRows.map((row) => (
                    <div key={row.key} className="rounded-xl border border-sky-100 bg-sky-50/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor={`template-url-param-${row.key}`} className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">{row.label}</label>
                        <span className="text-[11px] font-bold text-slate-400">{row.key}</span>
                      </div>
                      <input id={`template-url-param-${row.key}`} value={getUrlParameterEntryValue(mediaUrlParameterEntries, row.key)} onChange={(event) => updateUrlParameter(row.key, event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-sky-100 bg-white px-3 text-sm font-semibold outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder={row.placeholder} />
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
                          <option key={macro.value} value={macro.value}>{macro.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 rounded-xl border border-dashed border-sky-200 bg-white p-3 md:grid-cols-[minmax(130px,0.55fr)_minmax(180px,1fr)_auto]">
                  <input value={urlParameterDraft.key} onChange={(event) => setUrlParameterDraft((current) => ({ ...current, key: event.target.value }))} className="h-10 rounded-lg border border-sky-100 bg-white px-3 text-sm font-semibold outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder="custom_key" />
                  <input value={urlParameterDraft.value} onChange={(event) => setUrlParameterDraft((current) => ({ ...current, value: event.target.value }))} className="h-10 rounded-lg border border-sky-100 bg-white px-3 text-sm font-semibold outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder="custom_value or {{ad.id}}" />
                  <button type="button" onClick={addCustomUrlParameter} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800">
                    <Plus size={15} strokeWidth={2.3} />
                    Add
                  </button>
                </div>

                <textarea value={mediaForm.urlParameters} onChange={(event) => updateMediaField('urlParameters', normalizeUrlParameterString(event.target.value))} className="min-h-20 w-full rounded-xl border border-sky-100 bg-white px-4 py-3 font-mono text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder="utm_source={{site_source_name}}&utm_campaign={{campaign.name}}" />
                <div className="rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-slate-100">
                  <span className="text-slate-400">Preview: </span>
                  {mediaForm.urlParameters ? `?${mediaForm.urlParameters}` : 'No URL parameters added'}
                </div>
              </div>
              <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/70 px-4 py-4 text-sm font-semibold text-slate-600 xl:col-span-2">
                Media files are now managed in the Ads Media Library. This template only saves copy, destination URL, CTA, and tracking parameters.
              </div>
            </div>
            <button type="button" onClick={saveMediaTemplate} disabled={Boolean(savingType)} className="mt-5 flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-70">
              {savingType === TEMPLATE_TYPES.MEDIA ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}
              {mediaEditMode ? 'Update media template' : 'Save media template'}
            </button>
          </DashboardPanel>
        </div>

        <div className="space-y-4">
          <DashboardPanel
            title="Campaign templates"
            headerAction={
              <TemplatePager
                page={safeCampaignTemplatePage}
                pageCount={campaignTemplatePageCount}
                onPrevious={() => setCampaignTemplatePage((page) => Math.max(page - 1, 1))}
                onNext={() => setCampaignTemplatePage((page) => Math.min(page + 1, campaignTemplatePageCount))}
              />
            }
          >
            {loading ? <div className="h-32 animate-pulse rounded-xl bg-sky-50" /> : campaignTemplates.length ? (
              <div className="space-y-3">
                {visibleCampaignTemplates.map((template) => (
                  <TemplateCard key={template.id} template={template} onEdit={editCampaignTemplate} onDelete={deleteTemplate} />
                ))}
              </div>
            ) : <p className="rounded-xl bg-sky-50 px-4 py-5 text-sm font-semibold text-slate-500">No campaign templates yet.</p>}
          </DashboardPanel>
          <DashboardPanel
            title="Media templates"
            headerAction={
              <TemplatePager
                page={safeMediaTemplatePage}
                pageCount={mediaTemplatePageCount}
                onPrevious={() => setMediaTemplatePage((page) => Math.max(page - 1, 1))}
                onNext={() => setMediaTemplatePage((page) => Math.min(page + 1, mediaTemplatePageCount))}
              />
            }
          >
            {loading ? <div className="h-32 animate-pulse rounded-xl bg-sky-50" /> : mediaTemplates.length ? (
              <div className="space-y-3">
                {visibleMediaTemplates.map((template) => (
                  <TemplateCard key={template.id} template={template} onEdit={editMediaTemplate} onDelete={deleteTemplate} />
                ))}
              </div>
            ) : <p className="rounded-xl bg-sky-50 px-4 py-5 text-sm font-semibold text-slate-500">No media templates yet.</p>}
          </DashboardPanel>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-800">
            Build campaign settings and media/content separately. Dynamic Ads Launch lets every ad account pick a different pair.
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdsTemplateBuilderPage;
