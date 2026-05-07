import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Eye, LoaderCircle, Rocket, Shuffle, X } from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { businessDataApi } from '../../dashboard/api/businessDataApi';
import { useTokens } from '../../token-management/hooks/useTokens';
import { usePublishProgress } from '../../notifications/PublishProgressContext';
import { adsLaunchApi } from '../api/adsLaunchApi';
import { useLaunchTemplates } from '../hooks/useLaunchTemplates';
import { useTokenMetaAssets } from '../hooks/useTokenMetaAssets';

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
};

const defaultWebsiteEventByObjective = {
  OUTCOME_LEADS: 'LEAD',
  OUTCOME_SALES: 'PURCHASE',
};

const pixelRequiredObjectives = new Set(['OUTCOME_LEADS', 'OUTCOME_SALES']);

const FieldLabel = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-700">
    {children}
  </label>
);

const TemplateDetail = ({ label, value }) => (
  <div className="rounded-xl bg-sky-50/70 px-3 py-3">
    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-600">{label}</p>
    <p className="mt-1 break-words text-sm font-bold text-slate-900">{value || 'Not set'}</p>
  </div>
);

const getCampaignStatus = (template) =>
  String(template?.config?.staticDefaults?.campaignStatus || 'PAUSED').trim().toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'PAUSED';

const getCampaignStatusBadgeClass = (status) =>
  status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';

const campaignRequiresPixel = (template) => pixelRequiredObjectives.has(template?.config?.objective);

const TemplatePreviewModal = ({ template, onClose }) => {
  if (!template) {
    return null;
  }

  const config = template.config || {};
  const media = template.snapshot?.media;
  const thumbnail = template.snapshot?.thumbnail;
  const isMediaTemplate = template.templateType === 'MEDIA' || media?.url;
  const countries = sanitizeCountries(config).join(', ');
  const campaignStatus = getCampaignStatus(template);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-sky-100 bg-white p-5 shadow-2xl shadow-slate-950/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">{template.templateType || 'Template'}</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">{template.name}</h3>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-100 text-slate-500 transition hover:bg-sky-50">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        {isMediaTemplate ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="grid gap-3 sm:grid-cols-2">
              <TemplateDetail label="Headline" value={config.headline} />
              <TemplateDetail label="CTA" value={config.callToAction} />
              <TemplateDetail label="Destination URL" value={config.websiteUrl} />
              <TemplateDetail label="Display URL" value={config.displayUrl} />
              <TemplateDetail label="URL parameters" value={config.urlParameters} />
              <TemplateDetail label="Description" value={config.description} />
              <div className="rounded-xl bg-sky-50/70 px-3 py-3 sm:col-span-2">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-600">Primary text</p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{config.primaryText || 'Not set'}</p>
              </div>
            </div>
            <div className="space-y-3">
              {media?.url ? (
                <div className="overflow-hidden rounded-2xl border border-sky-100 bg-sky-50">
                  {media.type?.startsWith('video/') ? (
                    <video src={media.url} controls className="h-56 w-full bg-slate-950 object-contain" />
                  ) : (
                    <img src={media.url} alt={template.name} className="h-56 w-full object-cover" />
                  )}
                  <p className="truncate px-3 py-2 text-xs font-bold text-slate-500">{media.name}</p>
                </div>
              ) : null}
              {thumbnail?.url ? (
                <div className="overflow-hidden rounded-2xl border border-amber-100 bg-amber-50">
                  <img src={thumbnail.url} alt={`${template.name} thumbnail`} className="h-28 w-full object-cover" />
                  <p className="truncate px-3 py-2 text-xs font-bold text-amber-700">Thumbnail: {thumbnail.name}</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <TemplateDetail label="Launch label" value={config.launchLabel} />
            <TemplateDetail label="Objective" value={config.objective} />
            <TemplateDetail label="Website event" value={config.websiteEvent} />
            <TemplateDetail label="Countries" value={countries} />
            <TemplateDetail label="Daily budget" value={config.dailyBudget} />
            <TemplateDetail label="Publish status" value={campaignStatus} />
            <TemplateDetail label="Budget level" value={config.staticDefaults?.budgetLevel} />
            <TemplateDetail label="Dynamic creative" value={config.staticDefaults?.dynamicCreative} />
            <TemplateDetail label="Audience age" value={`${config.staticDefaults?.audienceAgeMin || '21'} - ${config.staticDefaults?.audienceAgeMax || '65'}`} />
            <TemplateDetail label="Schedule" value={config.scheduleStart && config.scheduleEnd ? `${config.scheduleStart} -> ${config.scheduleEnd}` : 'Not scheduled'} />
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3 sm:col-span-2 lg:col-span-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">Schedule behavior</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">
                Active lets Meta deliver when the schedule window opens. Paused keeps the campaign, ad set, and ad stopped even when a schedule is set.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PixelPublishPrompt = ({
  loadingPixels,
  onClose,
  onLoadPixels,
  onPublishWithoutPixel,
  onPublishWithPixel,
  pixels,
  prompt,
  selectedPixelId,
}) => {
  const [draftPixelId, setDraftPixelId] = useState(selectedPixelId || '');

  useEffect(() => {
    setDraftPixelId(selectedPixelId || '');
  }, [selectedPixelId, prompt]);

  if (!prompt) {
    return null;
  }

  const isRequired = prompt.required;
  const affectedTemplates = prompt.templates?.slice(0, 3) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-sky-100 bg-white p-5 shadow-2xl shadow-slate-950/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${isRequired ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
              <AlertTriangle size={21} strokeWidth={2.4} />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">
                {isRequired ? 'Pixel required' : 'Pixel not selected'}
              </p>
              <h3 className="mt-1 text-xl font-black text-slate-950">
                {isRequired ? 'Select a pixel before publishing' : 'Publish without pixel tracking?'}
              </h3>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-100 text-slate-500 transition hover:bg-sky-50">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
          {isRequired
            ? `${prompt.accountCount} ready ad account${prompt.accountCount === 1 ? '' : 's'} use Leads/Sales templates, so Meta needs a pixel for the website event.`
            : `${prompt.accountCount} ready ad account${prompt.accountCount === 1 ? '' : 's'} can publish without a pixel. Select one if you want tracking, or continue without it.`}
        </p>

        {affectedTemplates.length ? (
          <div className="mt-4 rounded-2xl bg-sky-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-600">Templates checked</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {affectedTemplates.map((templateName) => (
                <span key={templateName} className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 shadow-sm shadow-sky-100">
                  {templateName}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 space-y-2">
          <FieldLabel htmlFor="pixel-publish-select">Pixel</FieldLabel>
          <select
            id="pixel-publish-select"
            value={draftPixelId}
            onChange={(event) => setDraftPixelId(event.target.value)}
            disabled={loadingPixels || !pixels.length}
            className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">{pixels.length ? 'Select pixel' : 'No pixels loaded yet'}</option>
            {pixels.map((pixel) => (
              <option key={pixel.id} value={pixel.id}>{pixel.name}</option>
            ))}
          </select>
          <button type="button" onClick={onLoadPixels} disabled={loadingPixels} className="h-10 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-50">
            {loadingPixels ? 'Loading pixels...' : 'Load pixels'}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {!isRequired ? (
            <button type="button" onClick={onPublishWithoutPixel} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50">
              Publish without pixel
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onPublishWithPixel(draftPixelId)}
            disabled={!draftPixelId}
            className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Use pixel and publish
          </button>
        </div>
      </div>
    </div>
  );
};

const getAdAccountKeys = (account = {}) =>
  [account.id, account.accountId, String(account.id || '').replace(/^act_/, '')]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

const sanitizeCountries = (config = {}) => {
  const countries = Array.isArray(config.countries) ? config.countries.filter(Boolean) : [];
  return countries.length ? countries : config.country ? [config.country] : ['ID'];
};

const getTemplateLabel = (template) => (template ? template.name : 'Not selected');

const DynamicAdsLaunchPage = () => {
  const { loading: tokensLoading, tokens } = useTokens();
  const { adAccounts, loadAssets, loadingAssets, loadPixels, loadingPixels, pages, pixels } = useTokenMetaAssets();
  const { error: templatesError, loading: templatesLoading, templates } = useLaunchTemplates();
  const { beginPublish, completePublish, failPublish, isPublishing, pushPublishEvent } = usePublishProgress();
  const [brands, setBrands] = useState([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [brandId, setBrandId] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [pageId, setPageId] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [assignments, setAssignments] = useState({});
  const [pixelPrompt, setPixelPrompt] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [publishing, setPublishing] = useState(false);

  const activeTokens = useMemo(() => tokens.filter((token) => token.status === 'ACTIVE'), [tokens]);
  const selectedBrand = brands.find((brand) => brand.id === brandId) || null;
  const selectedBrandSocialAccounts = useMemo(
    () => (Array.isArray(selectedBrand?.assignedSocialAccounts) ? selectedBrand.assignedSocialAccounts : []),
    [selectedBrand]
  );
  const brandTokenOptions = useMemo(() => {
    const tokenIds = new Set(selectedBrandSocialAccounts.map((account) => account.sourceTokenId).filter(Boolean));
    return activeTokens.filter((token) => tokenIds.has(token.id)).sort((first, second) => first.label.localeCompare(second.label));
  }, [activeTokens, selectedBrandSocialAccounts]);
  const selectedToken = activeTokens.find((token) => token.id === tokenId) || null;
  const selectedPage = pages.find((page) => page.id === pageId) || null;
  const selectedPixel = pixels.find((pixel) => pixel.id === pixelId) || null;
  const savedBrandAccountKeys = useMemo(() => {
    const keys = new Set();

    selectedBrandSocialAccounts
      .filter((account) => account.sourceTokenId === tokenId)
      .flatMap((account) => account.businessProfiles || [])
      .flatMap((profile) => profile.adAccounts || [])
      .forEach((account) => getAdAccountKeys(account).forEach((key) => keys.add(key)));

    return keys;
  }, [selectedBrandSocialAccounts, tokenId]);
  const scopedAdAccounts = useMemo(() => {
    if (!brandId || !tokenId) {
      return [];
    }

    if (!savedBrandAccountKeys.size) {
      return adAccounts;
    }

    return adAccounts.filter((account) => getAdAccountKeys(account).some((key) => savedBrandAccountKeys.has(key)));
  }, [adAccounts, brandId, savedBrandAccountKeys, tokenId]);
  const campaignTemplates = useMemo(
    () => templates.filter((template) => ['CAMPAIGN', 'FULL'].includes(template.templateType || 'FULL')),
    [templates]
  );
  const mediaTemplates = useMemo(
    () => templates.filter((template) => ['MEDIA', 'FULL'].includes(template.templateType || 'FULL') && template.snapshot?.media?.url),
    [templates]
  );
  const selectedAssignments = useMemo(
    () =>
      scopedAdAccounts
        .map((account) => ({
          account,
          ...(assignments[account.id] || {}),
        }))
        .filter((assignment) => assignment.campaignTemplateId && assignment.mediaTemplateId),
    [assignments, scopedAdAccounts]
  );

  const getAssignmentCampaignTemplate = (assignment) =>
    campaignTemplates.find((template) => template.id === assignment.campaignTemplateId);

  const getAssignmentPageId = (assignment) => {
    const campaignTemplate = getAssignmentCampaignTemplate(assignment);
    return assignment.pageId || campaignTemplate?.config?.pageId || pageId;
  };

  const getAssignmentPageName = (assignment) => {
    const assignmentPageId = getAssignmentPageId(assignment);
    const page = pages.find((item) => item.id === assignmentPageId);
    const campaignTemplate = getAssignmentCampaignTemplate(assignment);
    return page?.name || campaignTemplate?.snapshot?.pageName || selectedPage?.name || '';
  };

  const getAssignmentPixelId = (assignment, fallbackPixelId = pixelId) => {
    const campaignTemplate = getAssignmentCampaignTemplate(assignment);
    return campaignTemplate?.config?.pixelId || fallbackPixelId;
  };

  const getPixelNameById = (nextPixelId) => pixels.find((pixel) => pixel.id === nextPixelId)?.name || '';

  const getAssignmentPixelName = (assignment, fallbackPixelId = pixelId) => {
    const assignmentPixelId = getAssignmentPixelId(assignment, fallbackPixelId);
    const campaignTemplate = getAssignmentCampaignTemplate(assignment);
    return getPixelNameById(assignmentPixelId) || campaignTemplate?.snapshot?.pixelName || '';
  };

  const getPixelPromptDetails = (fallbackPixelId = pixelId) => {
    const requiredMissing = [];
    const optionalMissing = [];

    selectedAssignments.forEach((assignment) => {
      const campaignTemplate = getAssignmentCampaignTemplate(assignment);
      const assignmentPixelId = getAssignmentPixelId(assignment, fallbackPixelId);

      if (assignmentPixelId) {
        return;
      }

      const item = {
        accountName: assignment.account.name,
        templateName: campaignTemplate?.name || 'Campaign template',
      };

      if (campaignRequiresPixel(campaignTemplate)) {
        requiredMissing.push(item);
      } else {
        optionalMissing.push(item);
      }
    });

    return {
      optionalMissing,
      requiredMissing,
    };
  };

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

  const handleBrandChange = (nextBrandId) => {
    setBrandId(nextBrandId);
    setTokenId('');
    setPageId('');
    setPixelId('');
    setAssignments({});
    loadAssets('');
  };

  const handleTokenChange = async (nextTokenId) => {
    setTokenId(nextTokenId);
    setPageId('');
    setPixelId('');
    setAssignments({});
    await loadAssets(nextTokenId);
  };

  const updateAssignment = (accountId, field, value) => {
    setAssignments((current) => ({
      ...current,
      [accountId]: {
        ...(current[accountId] || {}),
        [field]: value,
      },
    }));
  };

  const buildPublishPayload = (fallbackPixelId = pixelId) => {
    const firstAssignment = selectedAssignments[0];
    const firstCampaignTemplate = campaignTemplates.find((template) => template.id === firstAssignment.campaignTemplateId);
    const firstMediaTemplate = mediaTemplates.find((template) => template.id === firstAssignment.mediaTemplateId);
    const campaignConfig = firstCampaignTemplate?.config || {};
    const mediaConfig = firstMediaTemplate?.config || {};
    const countries = sanitizeCountries(campaignConfig);
    const firstPageId = getAssignmentPageId(firstAssignment);
    const firstPage = pages.find((page) => page.id === firstPageId) || selectedPage;
    const firstPixelId = getAssignmentPixelId(firstAssignment, fallbackPixelId);
    const firstPixel = pixels.find((pixel) => pixel.id === firstPixelId) || selectedPixel;
    const websiteEvent = campaignConfig.websiteEvent || defaultWebsiteEventByObjective[campaignConfig.objective] || '';

    return {
      templateId: firstAssignment.mediaTemplateId,
      launchLabel: campaignConfig.launchLabel || firstCampaignTemplate?.name || 'Dynamic launch',
      brandId,
      brandName: selectedBrand?.name || '',
      tokenId,
      country: countries[0] || 'ID',
      countries,
      countryLabel: countries.join(', '),
      objective: campaignConfig.objective || 'OUTCOME_TRAFFIC',
      dailyBudget: campaignConfig.dailyBudget || '15',
      selectedAdAccountIds: selectedAssignments.map((assignment) => assignment.account.id),
      selectedAdAccounts: selectedAssignments.map((assignment) => ({
        id: assignment.account.id,
        accountId: assignment.account.accountId,
        name: assignment.account.name,
        currency: assignment.account.currency,
      })),
      pageId: firstPageId,
      pageName: firstPage?.name || '',
      pixelId: firstPixelId,
      pixelName: firstPixel?.name || '',
      websiteEvent,
      headline: mediaConfig.headline || firstMediaTemplate?.name || 'Ad',
      primaryText: mediaConfig.primaryText || ' ',
      description: mediaConfig.description || '',
      websiteUrl: mediaConfig.websiteUrl || '',
      displayUrl: mediaConfig.displayUrl || '',
      urlParameters: mediaConfig.urlParameters || '',
      scheduleStart: campaignConfig.scheduleStart || '',
      scheduleEnd: campaignConfig.scheduleEnd || '',
      callToAction: mediaConfig.callToAction || 'LEARN_MORE',
      staticDefaults: {
        ...defaultStaticDefaults,
        ...(campaignConfig.staticDefaults || {}),
      },
      accountLaunches: selectedAssignments.map((assignment) => ({
        adAccountId: assignment.account.id,
        campaignTemplateId: assignment.campaignTemplateId,
        mediaTemplateId: assignment.mediaTemplateId,
        pageId: getAssignmentPageId(assignment),
        pageName: getAssignmentPageName(assignment),
        pixelId: getAssignmentPixelId(assignment, fallbackPixelId),
        pixelName: getAssignmentPixelName(assignment, fallbackPixelId),
      })),
    };
  };

  const loadSharedPixels = () => loadPixels(tokenId, scopedAdAccounts.map((account) => account.id));

  const showPixelPrompt = ({ required, items }) => {
    setPixelPrompt({
      accountCount: items.length,
      required,
      templates: Array.from(new Set(items.map((item) => item.templateName).filter(Boolean))),
    });
  };

  const publishDynamicLaunch = async ({ pixelOverride = pixelId, skipOptionalPixelPrompt = false } = {}) => {
    if (isPublishing || publishing) {
      toast.error('A publish is already processing');
      return;
    }

    if (!brandId || !tokenId) {
      toast.error('Select brand and token before publishing');
      return;
    }

    if (!selectedAssignments.length) {
      toast.error('Assign a campaign template and media template to at least one ad account');
      return;
    }

    const missingAssignments = scopedAdAccounts.filter((account) => {
      const assignment = assignments[account.id];
      return assignment?.campaignTemplateId || assignment?.mediaTemplateId
        ? !assignment.campaignTemplateId || !assignment.mediaTemplateId
        : false;
    });

    if (missingAssignments.length) {
      toast.error('Every selected account row must have both campaign and media template');
      return;
    }

    const missingRequiredPage = selectedAssignments.some((assignment) => !getAssignmentPageId(assignment));

    if (missingRequiredPage) {
      toast.error('Select a page for every assigned account, or choose a shared fallback page');
      return;
    }

    const pixelPromptDetails = getPixelPromptDetails(pixelOverride);

    if (pixelPromptDetails.requiredMissing.length) {
      showPixelPrompt({
        required: true,
        items: pixelPromptDetails.requiredMissing,
      });
      return;
    }

    if (!skipOptionalPixelPrompt && pixelPromptDetails.optionalMissing.length) {
      showPixelPrompt({
        required: false,
        items: pixelPromptDetails.optionalMissing,
      });
      return;
    }

    setPixelPrompt(null);
    setPublishing(true);
    beginPublish();

    try {
      const payload = buildPublishPayload(pixelOverride);
      const data = await adsLaunchApi.publishLaunchStream(payload, {
        onProgress: pushPublishEvent,
      });
      completePublish(data);
      toast.success(data.message);
    } catch (requestError) {
      failPublish(requestError.message);
      toast.error(requestError.message);
    } finally {
      setPublishing(false);
    }
  };

  const selectedCount = selectedAssignments.length;

  return (
    <div>
      <DashboardHeader
        title="Dynamic Ads Launch"
        description="Select a brand token, assign different campaign/media templates per ad account, then publish all selected accounts in one click."
        action={
          <button
            type="button"
            onClick={() => publishDynamicLaunch()}
            disabled={publishing || isPublishing}
            className="flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-70"
          >
            {publishing || isPublishing ? <LoaderCircle size={17} className="animate-spin" /> : <Rocket size={17} />}
            Publish assigned accounts
          </button>
        }
      />

      <TemplatePreviewModal template={previewTemplate} onClose={() => setPreviewTemplate(null)} />
      <PixelPublishPrompt
        loadingPixels={loadingPixels}
        onClose={() => setPixelPrompt(null)}
        onLoadPixels={loadSharedPixels}
        onPublishWithoutPixel={() => publishDynamicLaunch({ pixelOverride: '', skipOptionalPixelPrompt: true })}
        onPublishWithPixel={(nextPixelId) => {
          if (!nextPixelId) {
            toast.error('Select a pixel first');
            return;
          }

          setPixelId(nextPixelId);
          publishDynamicLaunch({ pixelOverride: nextPixelId, skipOptionalPixelPrompt: true });
        }}
        pixels={pixels}
        prompt={pixelPrompt}
        selectedPixelId={pixelId}
      />

      {templatesError ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{templatesError}</p> : null}

      <div className="grid gap-4 2xl:grid-cols-[360px_minmax(0,1fr)]">
        <DashboardPanel title="Launch scope">
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel htmlFor="dynamic-brand">Brand</FieldLabel>
              <select id="dynamic-brand" value={brandId} onChange={(event) => handleBrandChange(event.target.value)} disabled={brandsLoading} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                <option value="">Select brand</option>
                {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="dynamic-token">Token key</FieldLabel>
              <select id="dynamic-token" value={tokenId} onChange={(event) => handleTokenChange(event.target.value)} disabled={tokensLoading || !brandTokenOptions.length} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                <option value="">{brandId ? 'Select brand token' : 'Select brand first'}</option>
                {brandTokenOptions.map((token) => <option key={token.id} value={token.id}>{token.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="dynamic-page">Shared fallback page</FieldLabel>
              <select id="dynamic-page" value={pageId} onChange={(event) => setPageId(event.target.value)} disabled={!pages.length} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                <option value="">No shared page</option>
                {pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
              </select>
              <p className="text-xs font-semibold text-slate-400">Optional. Each ad account row can override this page.</p>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="dynamic-pixel">Pixel</FieldLabel>
              <select id="dynamic-pixel" value={pixelId} onChange={(event) => setPixelId(event.target.value)} disabled={loadingPixels || !pixels.length} className="h-12 w-full rounded-xl border border-sky-100 px-4 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                <option value="">Optional shared pixel</option>
                {pixels.map((pixel) => <option key={pixel.id} value={pixel.id}>{pixel.name}</option>)}
              </select>
            </div>
            <button type="button" onClick={loadSharedPixels} disabled={!tokenId || !scopedAdAccounts.length} className="h-10 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-50">
              Load shared pixels
            </button>
          </div>
        </DashboardPanel>

        <DashboardPanel
          title="Ad account template assignments"
          headerAction={
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
              {selectedCount} assigned
            </span>
          }
        >
          {templatesLoading || loadingAssets ? (
            <div className="h-64 animate-pulse rounded-2xl bg-sky-50" />
          ) : scopedAdAccounts.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Ad account</th>
                    <th className="px-3 py-3">Page</th>
                    <th className="px-3 py-3">Campaign template</th>
                    <th className="px-3 py-3">Media template</th>
                    <th className="px-3 py-3">Ready</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-50">
                  {scopedAdAccounts.map((account) => {
                    const assignment = assignments[account.id] || {};
                    const campaignTemplate = campaignTemplates.find((template) => template.id === assignment.campaignTemplateId);
                    const mediaTemplate = mediaTemplates.find((template) => template.id === assignment.mediaTemplateId);
                    const accountPageId = assignment.pageId || campaignTemplate?.config?.pageId || pageId;
                    const accountPage = pages.find((page) => page.id === accountPageId);
                    const campaignStatus = getCampaignStatus(campaignTemplate);
                    const hasSchedule = Boolean(campaignTemplate?.config?.scheduleStart && campaignTemplate?.config?.scheduleEnd);
                    const ready = Boolean(campaignTemplate && mediaTemplate && accountPageId);

                    return (
                      <tr key={account.id} className="align-top">
                        <td className="px-3 py-3">
                          <p className="font-black text-slate-950">{account.name}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-400">{account.accountId} {account.currency || ''}</p>
                        </td>
                        <td className="px-3 py-3">
                          <select value={assignment.pageId || ''} onChange={(event) => updateAssignment(account.id, 'pageId', event.target.value)} disabled={!pages.length} className="h-11 min-w-52 rounded-xl border border-sky-100 px-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50">
                            <option value="">{pageId ? `Use shared: ${selectedPage?.name || pageId}` : 'Select page'}</option>
                            {pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
                          </select>
                          <p className="mt-1 text-xs font-semibold text-slate-400">
                            {accountPage ? accountPage.name : campaignTemplate?.config?.pageId ? `Template page ${campaignTemplate.config.pageId}` : 'Required before publish'}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <select value={assignment.campaignTemplateId || ''} onChange={(event) => updateAssignment(account.id, 'campaignTemplateId', event.target.value)} className="h-11 min-w-56 rounded-xl border border-sky-100 px-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                              <option value="">Select campaign template</option>
                              {campaignTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                            </select>
                            <button
                              type="button"
                              onClick={() => setPreviewTemplate(campaignTemplate)}
                              disabled={!campaignTemplate}
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-white text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-slate-300"
                              title="Preview campaign template"
                            >
                              <Eye size={17} strokeWidth={2.3} />
                            </button>
                          </div>
                          {campaignTemplate ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${getCampaignStatusBadgeClass(campaignStatus)}`}>
                                {campaignStatus}
                              </span>
                              {hasSchedule ? (
                                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-700">
                                  Scheduled
                                </span>
                              ) : null}
                              <span className="text-xs font-semibold text-slate-400">
                                {campaignTemplate.config?.objective || 'Objective'} | {campaignTemplate.config?.dailyBudget || 'Budget'} daily
                              </span>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <select value={assignment.mediaTemplateId || ''} onChange={(event) => updateAssignment(account.id, 'mediaTemplateId', event.target.value)} className="h-11 min-w-56 rounded-xl border border-sky-100 px-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                              <option value="">Select media template</option>
                              {mediaTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                            </select>
                            <button
                              type="button"
                              onClick={() => setPreviewTemplate(mediaTemplate)}
                              disabled={!mediaTemplate}
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-white text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-slate-300"
                              title="Preview media template"
                            >
                              <Eye size={17} strokeWidth={2.3} />
                            </button>
                          </div>
                          {mediaTemplate ? <p className="mt-1 text-xs font-semibold text-slate-400">{mediaTemplate.snapshot?.media?.type || 'Media'} | {getTemplateLabel(mediaTemplate)}</p> : null}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${ready ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {ready ? <CheckCircle2 size={14} /> : <Shuffle size={14} />}
                            {ready ? 'Ready' : 'Waiting'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-2xl bg-sky-50 px-4 py-8 text-sm font-semibold text-slate-500">
              Select a brand and token key to load possible ad accounts.
            </p>
          )}
        </DashboardPanel>
      </div>
    </div>
  );
};

export default DynamicAdsLaunchPage;
