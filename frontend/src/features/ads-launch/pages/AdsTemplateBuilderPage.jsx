import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { LoaderCircle, Pencil, Plus, Save, Settings2, Trash2, X } from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { adsLaunchApi } from '../api/adsLaunchApi';
import { useLaunchTemplates } from '../hooks/useLaunchTemplates';

const TEMPLATE_TYPES = {
  CAMPAIGN: 'CAMPAIGN',
  MEDIA: 'MEDIA',
};

const campaignDefaults = {
  name: '',
  launchLabel: '',
  countries: ['ID'],
  objective: 'OUTCOME_TRAFFIC',
  websiteEvent: 'LEAD',
  dailyBudget: '15',
  scheduleStart: '',
  scheduleEnd: '',
  staticDefaults: {
    campaignStatus: 'PAUSED',
    budgetLevel: 'AD_SET',
    dynamicCreative: 'ON',
    audienceAgeMin: '21',
    audienceAgeMax: '65',
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
  headline: '',
  primaryText: '',
  description: '',
  websiteUrl: '',
  displayUrl: '',
  urlParameters: '',
  callToAction: 'LEARN_MORE',
};

const TRAFFIC_OBJECTIVE = 'OUTCOME_TRAFFIC';

const objectiveOptions = [
  { value: TRAFFIC_OBJECTIVE, label: 'Traffic' },
  { value: 'OUTCOME_ENGAGEMENT', label: 'Engagement' },
  { value: 'OUTCOME_LEADS', label: 'Leads' },
  { value: 'OUTCOME_SALES', label: 'Sales' },
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
  staticDefaults: {
    ...campaignDefaults.staticDefaults,
  },
});

const createMediaDefaults = () => ({
  ...mediaDefaults,
});

const normalizeTemplateCountries = (config = {}) => {
  const countries = Array.isArray(config.countries) ? config.countries.filter(Boolean) : [];
  return countries.length ? countries : config.country ? [config.country] : ['ID'];
};

const normalizeCampaignStatus = (value) => (String(value || '').trim().toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'PAUSED');

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
          : `${template.config?.headline || 'Copy template'} | ${template.config?.callToAction || 'CTA'} | ${template.config?.websiteUrl || 'No URL'}`}
      </p>
    </div>
  );
};

const AdsTemplateBuilderPage = () => {
  const { error, loadTemplates, loading, templates } = useLaunchTemplates();
  const [campaignForm, setCampaignForm] = useState(createCampaignDefaults);
  const [mediaForm, setMediaForm] = useState(createMediaDefaults);
  const [editingCampaignTemplateId, setEditingCampaignTemplateId] = useState('');
  const [editingMediaTemplateId, setEditingMediaTemplateId] = useState('');
  const [urlParameterDraft, setUrlParameterDraft] = useState({ key: '', value: '' });
  const [savingType, setSavingType] = useState('');

  const campaignTemplates = useMemo(() => templates.filter((template) => template.templateType === TEMPLATE_TYPES.CAMPAIGN), [templates]);
  const mediaTemplates = useMemo(() => templates.filter((template) => template.templateType === TEMPLATE_TYPES.MEDIA), [templates]);
  const selectedCampaignCountries = useMemo(() => campaignForm.countries || ['ID'], [campaignForm.countries]);
  const availableCampaignCountries = useMemo(
    () => countryOptions.filter((country) => !selectedCampaignCountries.includes(country.value)),
    [selectedCampaignCountries]
  );
  const mediaUrlParameterEntries = useMemo(() => parseUrlParameterEntries(mediaForm.urlParameters), [mediaForm.urlParameters]);
  const campaignPixelRequired = campaignForm.objective === 'OUTCOME_LEADS' || campaignForm.objective === 'OUTCOME_SALES';
  const mediaEditMode = Boolean(editingMediaTemplateId);
  const campaignEditMode = Boolean(editingCampaignTemplateId);

  const updateCampaignField = (field, value) => {
    setCampaignForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleCampaignObjectiveChange = (objective) => {
    if (objective !== TRAFFIC_OBJECTIVE) {
      toast.error('Only Traffic objective is enabled for now');
    }

    setCampaignForm((current) => {
      return {
        ...current,
        objective: TRAFFIC_OBJECTIVE,
        websiteEvent: '',
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
      staticDefaults: {
        ...current.staticDefaults,
        [field]: value,
      },
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
    const staticDefaults = {
      ...campaignDefaults.staticDefaults,
      ...(config.staticDefaults || {}),
    };

    setCampaignForm({
      ...createCampaignDefaults(),
      name: template.name || '',
      launchLabel: config.launchLabel || '',
      countries,
      objective: TRAFFIC_OBJECTIVE,
      websiteEvent: '',
      dailyBudget: config.dailyBudget || '15',
      scheduleStart: config.scheduleStart || '',
      scheduleEnd: config.scheduleEnd || '',
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

    setSavingType(TEMPLATE_TYPES.CAMPAIGN);
    try {
      const countries = (campaignForm.countries || [])
        .map((country) => country.trim().toUpperCase())
        .filter(Boolean);
      const payload = {
        name: campaignForm.name.trim(),
        templateType: TEMPLATE_TYPES.CAMPAIGN,
        config: {
          launchLabel: campaignForm.launchLabel.trim(),
          country: countries[0] || 'ID',
          countries: countries.length ? countries : ['ID'],
          objective: TRAFFIC_OBJECTIVE,
          websiteEvent: campaignPixelRequired ? campaignForm.websiteEvent : '',
          dailyBudget: campaignForm.dailyBudget,
          scheduleStart: campaignForm.scheduleStart,
          scheduleEnd: campaignForm.scheduleEnd,
          staticDefaults: campaignForm.staticDefaults,
        },
        snapshot: {},
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
                    <option key={option.value} value={option.value} disabled={option.value !== TRAFFIC_OBJECTIVE}>
                      {option.value === TRAFFIC_OBJECTIVE ? option.label : `${option.label} (disabled)`}
                    </option>
                  ))}
                </select>
                <p className="text-xs font-semibold text-slate-400">Only Traffic is enabled in the frontend for now.</p>
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
                <FieldLabel htmlFor="campaign-status">Publish status</FieldLabel>
                <select id="campaign-status" value={campaignForm.staticDefaults.campaignStatus} onChange={(event) => updateCampaignDefault('campaignStatus', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  {campaignStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="text-xs font-semibold text-slate-400">Active can deliver inside the schedule window. Paused stays stopped until you manually activate it.</p>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-budget-level">Budget level</FieldLabel>
                <select id="campaign-budget-level" value={campaignForm.staticDefaults.budgetLevel} onChange={(event) => updateCampaignDefault('budgetLevel', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  <option value="AD_SET">Ad set budget</option>
                  <option value="CAMPAIGN">Campaign budget</option>
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-dynamic">Dynamic creative</FieldLabel>
                <select id="campaign-dynamic" value={campaignForm.staticDefaults.dynamicCreative} onChange={(event) => updateCampaignDefault('dynamicCreative', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  <option value="ON">On</option>
                  <option value="OFF">Off</option>
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
                <FieldLabel htmlFor="campaign-schedule-start">Schedule start</FieldLabel>
                <input id="campaign-schedule-start" type="datetime-local" value={campaignForm.scheduleStart} onChange={(event) => updateCampaignField('scheduleStart', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="campaign-schedule-end">Schedule end</FieldLabel>
                <input id="campaign-schedule-end" type="datetime-local" value={campaignForm.scheduleEnd} onChange={(event) => updateCampaignField('scheduleEnd', event.target.value)} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
              </div>
            </div>
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
              <input value={mediaForm.name} onChange={(event) => updateMediaField('name', event.target.value)} className="h-12 rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder="Template name" />
              <input value={mediaForm.headline} onChange={(event) => updateMediaField('headline', event.target.value)} className="h-12 rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder="Headline" />
              <textarea value={mediaForm.primaryText} onChange={(event) => updateMediaField('primaryText', event.target.value)} className="min-h-24 rounded-xl border border-sky-100 px-4 py-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 xl:col-span-2" placeholder="Primary text" />
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
          <DashboardPanel title="Campaign templates">
            {loading ? <div className="h-32 animate-pulse rounded-xl bg-sky-50" /> : campaignTemplates.length ? (
              <div className="space-y-3">{campaignTemplates.map((template) => <TemplateCard key={template.id} template={template} onEdit={editCampaignTemplate} onDelete={deleteTemplate} />)}</div>
            ) : <p className="rounded-xl bg-sky-50 px-4 py-5 text-sm font-semibold text-slate-500">No campaign templates yet.</p>}
          </DashboardPanel>
          <DashboardPanel title="Media templates">
            {loading ? <div className="h-32 animate-pulse rounded-xl bg-sky-50" /> : mediaTemplates.length ? (
              <div className="space-y-3">{mediaTemplates.map((template) => <TemplateCard key={template.id} template={template} onEdit={editMediaTemplate} onDelete={deleteTemplate} />)}</div>
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
