import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Eye, ImageIcon, LoaderCircle, RefreshCw, Rocket, Shuffle, Upload, Video, X } from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { businessDataApi } from '../../dashboard/api/businessDataApi';
import { useTokens } from '../../token-management/hooks/useTokens';
import { usePublishProgress } from '../../notifications/PublishProgressContext';
import { useMetaKeySettings } from '../../settings/MetaKeySettingsContext';
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

const TRAFFIC_OBJECTIVE = 'OUTCOME_TRAFFIC';
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

const formatFileSize = (bytes = 0) => {
  if (!bytes) {
    return '0 KB';
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${Math.max(Math.round(bytes / 1024), 1)} KB`;
};

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

const MediaLibraryPicker = ({
  description = 'Saved videos are stored without thumbnails. Choose a separate image media asset when a video needs a thumbnail.',
  mode = 'media',
  loading,
  mediaAssets,
  onClose,
  onRefresh,
  onSelect,
  selectedMediaAssetId,
}) => {
  if (!onClose) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-sky-100 bg-white p-5 shadow-2xl shadow-slate-950/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Media library</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">{mode === 'thumbnail' ? 'Choose video thumbnail' : 'Choose image or video'}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/ads-media-library"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"
            >
              <Upload size={16} strokeWidth={2.3} />
              Upload media
            </a>
            <button type="button" onClick={onRefresh} disabled={loading} className="flex h-10 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-sky-50 disabled:opacity-50">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-100 text-slate-500 transition hover:bg-sky-50">
              <X size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => <div key={item} className="h-72 animate-pulse rounded-3xl bg-sky-50" />)}
          </div>
        ) : mediaAssets.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {mediaAssets.map((mediaAsset) => {
              const isVideo = mediaAsset.mediaType === 'VIDEO';
              const media = mediaAsset.media || {};
              const canSelect = mode === 'thumbnail' ? !isVideo : true;
              const selected = selectedMediaAssetId === mediaAsset.id;

              return (
                <button
                  key={mediaAsset.id}
                  type="button"
                  onClick={() => {
                    if (canSelect) {
                      onSelect(mediaAsset);
                    }
                  }}
                  disabled={!canSelect}
                  className={`overflow-hidden rounded-3xl border bg-white text-left shadow-sm transition ${
                    selected
                      ? 'border-sky-500 ring-4 ring-sky-100'
                      : 'border-sky-100 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-100'
                  } ${canSelect ? '' : 'cursor-not-allowed opacity-60'}`}
                >
                  <div className="relative bg-slate-950">
                    {isVideo ? (
                      <video src={media.url} className="h-44 w-full object-contain" />
                    ) : (
                      <img src={media.url} alt={mediaAsset.name} className="h-44 w-full object-cover" />
                    )}
                    <span className={`absolute left-3 top-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${isVideo ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>
                      {isVideo ? <Video size={14} strokeWidth={2.4} /> : <ImageIcon size={14} strokeWidth={2.4} />}
                      {isVideo ? 'Video' : 'Image'}
                    </span>
                    {selected ? (
                      <span className="absolute right-3 top-3 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                        Selected
                      </span>
                    ) : null}
                  </div>
                  <div className="p-4">
                    <p className="truncate text-sm font-black text-slate-950">{mediaAsset.name}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-400">{media.width}x{media.height} | {formatFileSize(media.size)}</p>
                    <p className="mt-2 inline-flex rounded-full bg-sky-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-sky-700">
                      {mediaAsset.brandName || 'Unassigned brand'}
                    </p>
                    {isVideo ? (
                      <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                        Select an image thumbnail separately
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-sky-50 px-4 py-8 text-sm font-semibold text-slate-500">
            {mode === 'thumbnail'
              ? 'No image assets available for thumbnails. Open Ads Media Library, upload an image, then refresh this picker.'
              : 'No saved media yet. Open Ads Media Library, upload an image or video, then refresh this picker.'}
          </p>
        )}
      </div>
    </div>
  );
};

const PixelPublishPrompt = ({
  loadingPixels,
  onClose,
  onLoadPixels,
  prompt,
}) => {
  if (!prompt) {
    return null;
  }

  const affectedAccounts = prompt.accounts?.slice(0, 5) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-sky-100 bg-white p-5 shadow-2xl shadow-slate-950/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <AlertTriangle size={21} strokeWidth={2.4} />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Pixel required</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">Select pixel per ad account</h3>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-100 text-slate-500 transition hover:bg-sky-50">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
          {prompt.accountCount} ready ad account{prompt.accountCount === 1 ? '' : 's'} use campaign templates that need website-event tracking. Choose the correct pixel in each row, then publish again.
        </p>

        {affectedAccounts.length ? (
          <div className="mt-4 rounded-2xl bg-sky-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-600">Rows needing pixel</p>
            <div className="mt-2 space-y-2">
              {affectedAccounts.map((item) => (
                <div key={`${item.accountName}-${item.templateName}`} className="rounded-xl bg-white px-3 py-2 shadow-sm shadow-sky-100">
                  <p className="text-xs font-black text-slate-800">{item.accountName}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{item.templateName}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onLoadPixels} disabled={loadingPixels} className="h-11 rounded-xl border border-sky-100 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-sky-50 disabled:opacity-50">
            {loadingPixels ? 'Loading pixels...' : 'Load pixels'}
          </button>
          <button type="button" onClick={onClose} className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800">
            Back to rows
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

const DynamicAdsLaunchPage = () => {
  const { loading: tokensLoading, tokens } = useTokens();
  const { accountPixels, adAccounts, loadAccountPixels, loadAssets, loadingAssets, loadingPixels, pages } = useTokenMetaAssets();
  const { error: templatesError, loading: templatesLoading, templates } = useLaunchTemplates();
  const { beginPublish, completePublish, failPublish, isPublishing, pushPublishEvent } = usePublishProgress();
  const assignmentScrollRef = useRef(null);
  const scrollAnimationRef = useRef(null);
  const scrollDirectionRef = useRef(0);
  const { publishTokenType } = useMetaKeySettings();
  const [brands, setBrands] = useState([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [brandId, setBrandId] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [pageId, setPageId] = useState('');
  const [assignments, setAssignments] = useState({});
  const [mediaAssets, setMediaAssets] = useState([]);
  const [mediaAssetsLoading, setMediaAssetsLoading] = useState(true);
  const [mediaPickerAccountId, setMediaPickerAccountId] = useState('');
  const [thumbnailPickerAccountId, setThumbnailPickerAccountId] = useState('');
  const [pixelPrompt, setPixelPrompt] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [assignmentScrollState, setAssignmentScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });

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
    () =>
      templates.filter(
        (template) =>
          template.templateType === 'CAMPAIGN' &&
          (!template.config?.objective || template.config.objective === TRAFFIC_OBJECTIVE) &&
          (!brandId || !template.config?.brandId || template.config.brandId === brandId)
      ),
    [brandId, templates]
  );
  const mediaTemplates = useMemo(
    () => templates.filter((template) => template.templateType === 'MEDIA' && (!brandId || !template.config?.brandId || template.config.brandId === brandId)),
    [brandId, templates]
  );
  const brandScopedMediaAssets = useMemo(
    () => mediaAssets.filter((mediaAsset) => !brandId || !mediaAsset.brandId || mediaAsset.brandId === brandId),
    [brandId, mediaAssets]
  );
  const selectedAssignments = useMemo(
    () =>
      scopedAdAccounts
        .map((account) => ({
          account,
          ...(assignments[account.id] || {}),
        }))
        .filter((assignment) =>
          assignment.campaignTemplateId &&
          assignment.mediaTemplateId &&
          assignment.mediaAssetId &&
          brandScopedMediaAssets.some((mediaAsset) => {
            if (mediaAsset.id !== assignment.mediaAssetId) {
              return false;
            }

            return mediaAsset.mediaType !== 'VIDEO' || brandScopedMediaAssets.some((asset) => asset.id === assignment.thumbnailAssetId && asset.mediaType === 'IMAGE');
          })
        ),
    [assignments, brandScopedMediaAssets, scopedAdAccounts]
  );

  const getAssignmentCampaignTemplate = (assignment) =>
    campaignTemplates.find((template) => template.id === assignment.campaignTemplateId);

  const getAssignmentMediaAsset = (assignment) =>
    brandScopedMediaAssets.find((mediaAsset) => mediaAsset.id === assignment.mediaAssetId);

  const getAssignmentThumbnailAsset = (assignment) =>
    brandScopedMediaAssets.find((mediaAsset) => mediaAsset.id === assignment.thumbnailAssetId && mediaAsset.mediaType === 'IMAGE');

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

  const getAssignmentPixelId = (assignment) => {
    const campaignTemplate = getAssignmentCampaignTemplate(assignment);
    return assignment.pixelId || campaignTemplate?.config?.pixelId || '';
  };

  const getAccountPixelOptions = (accountId) => accountPixels[accountId] || [];

  const getPixelNameById = (nextPixelId, accountId) =>
    getAccountPixelOptions(accountId).find((pixel) => pixel.id === nextPixelId)?.name || '';

  const getAssignmentPixelName = (assignment) => {
    const assignmentPixelId = getAssignmentPixelId(assignment);
    const campaignTemplate = getAssignmentCampaignTemplate(assignment);
    return getPixelNameById(assignmentPixelId, assignment.account?.id) || campaignTemplate?.snapshot?.pixelName || '';
  };

  const getPixelPromptDetails = () => {
    const requiredMissing = [];

    selectedAssignments.forEach((assignment) => {
      const campaignTemplate = getAssignmentCampaignTemplate(assignment);
      const assignmentPixelId = getAssignmentPixelId(assignment);

      if (assignmentPixelId) {
        return;
      }

      const item = {
        accountName: assignment.account.name,
        templateName: campaignTemplate?.name || 'Campaign template',
      };

      if (campaignRequiresPixel(campaignTemplate)) {
        requiredMissing.push(item);
      }
    });

    return {
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

  const loadMediaAssets = async (nextBrandId = brandId) => {
    setMediaAssetsLoading(true);
    try {
      const data = await adsLaunchApi.getMediaAssets({
        brandId: nextBrandId,
        includeUnassigned: Boolean(nextBrandId),
      });
      setMediaAssets(data.mediaAssets || []);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setMediaAssetsLoading(false);
    }
  };

  useEffect(() => {
    loadMediaAssets(brandId);
  }, [brandId]);

  const updateAssignmentScrollState = () => {
    const scrollElement = assignmentScrollRef.current;

    if (!scrollElement) {
      return;
    }

    const nextState = {
      canScrollLeft: scrollElement.scrollLeft > 6,
      canScrollRight: scrollElement.scrollLeft + scrollElement.clientWidth < scrollElement.scrollWidth - 6,
    };

    setAssignmentScrollState((current) =>
      current.canScrollLeft === nextState.canScrollLeft && current.canScrollRight === nextState.canScrollRight
        ? current
        : nextState
    );
  };

  const stopAssignmentAutoScroll = () => {
    scrollDirectionRef.current = 0;

    if (scrollAnimationRef.current) {
      window.cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }
  };

  const startAssignmentAutoScroll = (direction) => {
    if (scrollDirectionRef.current === direction && scrollAnimationRef.current) {
      return;
    }

    stopAssignmentAutoScroll();
    scrollDirectionRef.current = direction;

    const tick = () => {
      const scrollElement = assignmentScrollRef.current;

      if (!scrollElement || !scrollDirectionRef.current) {
        scrollAnimationRef.current = null;
        return;
      }

      scrollElement.scrollLeft += scrollDirectionRef.current * 14;
      updateAssignmentScrollState();
      scrollAnimationRef.current = window.requestAnimationFrame(tick);
    };

    scrollAnimationRef.current = window.requestAnimationFrame(tick);
  };

  const handleAssignmentScrollPointerMove = (event) => {
    const scrollElement = assignmentScrollRef.current;

    if (!scrollElement || scrollElement.scrollWidth <= scrollElement.clientWidth) {
      stopAssignmentAutoScroll();
      return;
    }

    const bounds = scrollElement.getBoundingClientRect();
    const edgeSize = Math.min(120, bounds.width * 0.18);

    if (event.clientX > bounds.right - edgeSize) {
      startAssignmentAutoScroll(1);
      return;
    }

    if (event.clientX < bounds.left + edgeSize) {
      startAssignmentAutoScroll(-1);
      return;
    }

    stopAssignmentAutoScroll();
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(updateAssignmentScrollState, 0);
    return () => window.clearTimeout(timeoutId);
  }, [assignments, brandScopedMediaAssets.length, campaignTemplates.length, mediaTemplates.length, scopedAdAccounts.length]);

  useEffect(() => stopAssignmentAutoScroll, []);

  const handleBrandChange = (nextBrandId) => {
    setBrandId(nextBrandId);
    setTokenId('');
    setPageId('');
    setAssignments({});
    loadAssets('');
  };

  const handleTokenChange = async (nextTokenId) => {
    setTokenId(nextTokenId);
    setPageId('');
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

  const selectMediaAssetForAccount = (accountId, mediaAsset) => {
    setAssignments((current) => {
      const previousAssignment = current[accountId] || {};
      const nextAssignment = {
        ...previousAssignment,
        mediaAssetId: mediaAsset.id,
      };

      if (mediaAsset.mediaType !== 'VIDEO') {
        nextAssignment.thumbnailAssetId = '';
      } else if (!brandScopedMediaAssets.some((asset) => asset.id === previousAssignment.thumbnailAssetId && asset.mediaType === 'IMAGE')) {
        nextAssignment.thumbnailAssetId = '';
      }

      return {
        ...current,
        [accountId]: nextAssignment,
      };
    });

    setMediaPickerAccountId('');

    if (mediaAsset.mediaType === 'VIDEO') {
      toast.success('Video selected. Choose a thumbnail image next.');
      window.setTimeout(() => setThumbnailPickerAccountId(accountId), 150);
      return;
    }

    toast.success(`Selected ${mediaAsset.name}`);
  };

  const selectThumbnailAssetForAccount = (accountId, thumbnailAsset) => {
    setAssignments((current) => ({
      ...current,
      [accountId]: {
        ...(current[accountId] || {}),
        thumbnailAssetId: thumbnailAsset.id,
      },
    }));
    setThumbnailPickerAccountId('');
    toast.success(`Selected thumbnail ${thumbnailAsset.name}`);
  };

  const buildPublishPayload = () => {
    const firstAssignment = selectedAssignments[0];
    const firstCampaignTemplate = campaignTemplates.find((template) => template.id === firstAssignment.campaignTemplateId);
    const firstMediaTemplate = mediaTemplates.find((template) => template.id === firstAssignment.mediaTemplateId);
    const firstMediaAsset = brandScopedMediaAssets.find((mediaAsset) => mediaAsset.id === firstAssignment.mediaAssetId);
    const firstThumbnailAsset = brandScopedMediaAssets.find((mediaAsset) => mediaAsset.id === firstAssignment.thumbnailAssetId);
    const campaignConfig = firstCampaignTemplate?.config || {};
    const mediaConfig = firstMediaTemplate?.config || {};
    const countries = sanitizeCountries(campaignConfig);
    const firstPageId = getAssignmentPageId(firstAssignment);
    const firstPage = pages.find((page) => page.id === firstPageId) || selectedPage;
    const firstPixelId = getAssignmentPixelId(firstAssignment);
    const websiteEvent = campaignConfig.websiteEvent || defaultWebsiteEventByObjective[campaignConfig.objective] || '';

    return {
      templateId: firstAssignment.mediaTemplateId,
      launchLabel: firstCampaignTemplate?.name || campaignConfig.launchLabel || 'Dynamic launch',
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
      pixelName: getAssignmentPixelName(firstAssignment),
      websiteEvent,
      headline: mediaConfig.headline || firstMediaTemplate?.name || 'Ad',
      primaryText: mediaConfig.primaryText || ' ',
      description: mediaConfig.description || '',
      websiteUrl: mediaConfig.websiteUrl || '',
      displayUrl: mediaConfig.displayUrl || '',
      urlParameters: mediaConfig.urlParameters || '',
      scheduleStart: toSchedulePayloadValue(campaignConfig.scheduleStart),
      scheduleEnd: toSchedulePayloadValue(campaignConfig.scheduleEnd),
      callToAction: mediaConfig.callToAction || 'LEARN_MORE',
      media: firstMediaAsset?.media || null,
      thumbnail: firstThumbnailAsset?.media || null,
      staticDefaults: {
        ...defaultStaticDefaults,
        ...(campaignConfig.staticDefaults || {}),
      },
      accountLaunches: selectedAssignments.map((assignment) => ({
        adAccountId: assignment.account.id,
        campaignTemplateId: assignment.campaignTemplateId,
        mediaTemplateId: assignment.mediaTemplateId,
        mediaAssetId: assignment.mediaAssetId,
        thumbnailAssetId: assignment.thumbnailAssetId || '',
        pageId: getAssignmentPageId(assignment),
        pageName: getAssignmentPageName(assignment),
        pixelId: getAssignmentPixelId(assignment),
        pixelName: getAssignmentPixelName(assignment),
      })),
    };
  };

  const loadRowPixels = () => loadAccountPixels(tokenId, scopedAdAccounts.map((account) => account.id));

  const showPixelPrompt = ({ items }) => {
    setPixelPrompt({
      accountCount: items.length,
      accounts: items,
    });
  };

  const publishDynamicLaunch = async () => {
    if (isPublishing || publishing) {
      toast.error('A publish is already processing');
      return;
    }

    if (!brandId || !tokenId) {
      toast.error('Select brand and token before publishing');
      return;
    }

    const missingAssignments = scopedAdAccounts.filter((account) => {
      const assignment = assignments[account.id];
      const selectedMediaAsset = brandScopedMediaAssets.find((mediaAsset) => mediaAsset.id === assignment?.mediaAssetId);
      const hasMediaAsset = Boolean(selectedMediaAsset);
      const needsThumbnail = selectedMediaAsset?.mediaType === 'VIDEO';
      const hasThumbnailAsset = brandScopedMediaAssets.some((mediaAsset) => mediaAsset.id === assignment?.thumbnailAssetId && mediaAsset.mediaType === 'IMAGE');
      return assignment?.campaignTemplateId || assignment?.mediaTemplateId || assignment?.mediaAssetId
        ? !assignment.campaignTemplateId || !assignment.mediaTemplateId || !assignment.mediaAssetId || !hasMediaAsset || (needsThumbnail && !hasThumbnailAsset)
        : false;
    });

    if (missingAssignments.length) {
      toast.error('Every selected account row must have campaign template, media template, media asset, and thumbnail for videos');
      return;
    }

    if (!selectedAssignments.length) {
      toast.error('Assign campaign template, media template, media asset, and video thumbnail when needed to at least one ad account');
      return;
    }

    const missingRequiredPage = selectedAssignments.some((assignment) => !getAssignmentPageId(assignment));

    if (missingRequiredPage) {
      toast.error('Select a page for every assigned account, or choose a shared fallback page');
      return;
    }

    const pixelPromptDetails = getPixelPromptDetails();

    if (pixelPromptDetails.requiredMissing.length) {
      showPixelPrompt({
        items: pixelPromptDetails.requiredMissing,
      });
      return;
    }

    setPixelPrompt(null);
    setPublishing(true);
    beginPublish();

    try {
      const payload = {
        ...buildPublishPayload(),
        tokenType: publishTokenType,
      };
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
        description="Select a brand token, assign campaign templates, copy templates, and media assets per ad account, then publish all selected accounts in one click."
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
      {mediaPickerAccountId ? (
        <MediaLibraryPicker
          loading={mediaAssetsLoading}
          mediaAssets={brandScopedMediaAssets}
          onClose={() => setMediaPickerAccountId('')}
          onRefresh={loadMediaAssets}
          onSelect={(mediaAsset) => selectMediaAssetForAccount(mediaPickerAccountId, mediaAsset)}
          selectedMediaAssetId={assignments[mediaPickerAccountId]?.mediaAssetId || ''}
        />
      ) : null}
      {thumbnailPickerAccountId ? (
        <MediaLibraryPicker
          description="Choose an image from the library to use as this video ad thumbnail."
          loading={mediaAssetsLoading}
          mediaAssets={brandScopedMediaAssets.filter((mediaAsset) => mediaAsset.mediaType === 'IMAGE')}
          mode="thumbnail"
          onClose={() => setThumbnailPickerAccountId('')}
          onRefresh={loadMediaAssets}
          onSelect={(mediaAsset) => selectThumbnailAssetForAccount(thumbnailPickerAccountId, mediaAsset)}
          selectedMediaAssetId={assignments[thumbnailPickerAccountId]?.thumbnailAssetId || ''}
        />
      ) : null}
      <PixelPublishPrompt
        loadingPixels={loadingPixels}
        onClose={() => setPixelPrompt(null)}
        onLoadPixels={loadRowPixels}
        prompt={pixelPrompt}
      />

      {templatesError ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{templatesError}</p> : null}

      <div className="space-y-4">
        <DashboardPanel title="Launch scope">
          <div className="grid gap-3 xl:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(220px,1.1fr)_auto_minmax(220px,1.1fr)] xl:items-end">
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
            </div>
            <button type="button" onClick={loadRowPixels} disabled={!tokenId || !scopedAdAccounts.length} className="h-12 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-50">
              {loadingPixels ? 'Loading pixels...' : 'Load account pixels'}
            </button>
            <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-500">
              Shared page is optional. Each row can override page and pixel before publishing.
            </p>
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
          {templatesLoading || loadingAssets || mediaAssetsLoading ? (
            <div className="h-64 animate-pulse rounded-2xl bg-sky-50" />
          ) : scopedAdAccounts.length ? (
            <div className="relative">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-2">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Wide table</p>
                <p className="text-xs font-semibold text-slate-500">Move your mouse near the left or right edge to auto-scroll.</p>
              </div>
              {assignmentScrollState.canScrollLeft ? (
                <div className="pointer-events-none absolute left-2 top-1/2 z-30 flex -translate-y-1/2 items-center text-white">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/85 shadow-lg shadow-slate-300 ring-1 ring-white/80">
                    <ChevronLeft size={19} strokeWidth={2.5} />
                  </span>
                </div>
              ) : null}
              {assignmentScrollState.canScrollRight ? (
                <div className="pointer-events-none absolute right-2 top-1/2 z-30 flex -translate-y-1/2 items-center text-white">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/85 shadow-lg shadow-slate-300 ring-1 ring-white/80">
                    <ChevronRight size={19} strokeWidth={2.5} />
                  </span>
                </div>
              ) : null}
              <div
                ref={assignmentScrollRef}
                onMouseMove={handleAssignmentScrollPointerMove}
                onMouseLeave={stopAssignmentAutoScroll}
                onScroll={updateAssignmentScrollState}
                className="overflow-x-auto overscroll-x-contain rounded-2xl border border-sky-100 bg-white pb-2 shadow-inner shadow-sky-50 [scrollbar-gutter:stable] [scrollbar-width:thin]"
              >
              <table className="min-w-[1420px] text-left text-sm">
                <thead className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                  <tr>
                    <th className="sticky left-0 z-20 min-w-56 bg-white px-3 py-3 shadow-[8px_0_16px_-16px_rgba(15,23,42,0.45)]">Ad account</th>
                    <th className="px-3 py-3">Page</th>
                    <th className="px-3 py-3">Pixel</th>
                    <th className="px-3 py-3">Campaign template</th>
                    <th className="px-3 py-3">Media template</th>
                    <th className="px-3 py-3">Media asset</th>
                    <th className="px-3 py-3">Ready</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-50">
                  {scopedAdAccounts.map((account) => {
                    const assignment = {
                      account,
                      ...(assignments[account.id] || {}),
                    };
                    const campaignTemplate = campaignTemplates.find((template) => template.id === assignment.campaignTemplateId);
                    const mediaTemplate = mediaTemplates.find((template) => template.id === assignment.mediaTemplateId);
                    const mediaAsset = getAssignmentMediaAsset(assignment);
                    const thumbnailAsset = getAssignmentThumbnailAsset(assignment);
                    const videoMediaSelected = mediaAsset?.mediaType === 'VIDEO';
                    const accountPageId = assignment.pageId || campaignTemplate?.config?.pageId || pageId;
                    const accountPage = pages.find((page) => page.id === accountPageId);
                    const accountPixelOptions = getAccountPixelOptions(account.id);
                    const accountPixelId = getAssignmentPixelId(assignment);
                    const accountPixelName = getAssignmentPixelName(assignment);
                    const requiresPixel = campaignRequiresPixel(campaignTemplate);
                    const campaignStatus = getCampaignStatus(campaignTemplate);
                    const hasSchedule = Boolean(campaignTemplate?.config?.scheduleStart && campaignTemplate?.config?.scheduleEnd);
                    const ready = Boolean(campaignTemplate && mediaTemplate && mediaAsset && (!videoMediaSelected || thumbnailAsset) && accountPageId && (!requiresPixel || accountPixelId));

                    return (
                      <tr key={account.id} className="align-top">
                        <td className="sticky left-0 z-10 min-w-56 bg-white px-3 py-3 shadow-[8px_0_16px_-16px_rgba(15,23,42,0.45)]">
                          <p className="font-black text-slate-950">{account.name}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-400">{account.accountId} {account.currency || ''}</p>
                        </td>
                        <td className="px-3 py-3">
                          <select value={assignment.pageId || ''} onChange={(event) => updateAssignment(account.id, 'pageId', event.target.value)} disabled={!pages.length} className="h-10 min-w-48 rounded-xl border border-sky-100 px-3 text-xs font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50">
                            <option value="">{pageId ? `Use shared: ${selectedPage?.name || pageId}` : 'Select page'}</option>
                            {pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
                          </select>
                          <p className="mt-1 text-xs font-semibold text-slate-400">
                            {accountPage ? accountPage.name : campaignTemplate?.config?.pageId ? `Template page ${campaignTemplate.config.pageId}` : 'Required before publish'}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={accountPixelId}
                            onChange={(event) => updateAssignment(account.id, 'pixelId', event.target.value)}
                            disabled={loadingPixels || !accountPixelOptions.length}
                            className="h-10 min-w-40 rounded-xl border border-sky-100 px-3 text-xs font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50"
                          >
                            <option value="">{requiresPixel ? 'Select pixel' : 'No pixel'}</option>
                            {accountPixelId && !accountPixelOptions.some((pixel) => pixel.id === accountPixelId) ? (
                              <option value={accountPixelId}>{accountPixelName || accountPixelId}</option>
                            ) : null}
                            {accountPixelOptions.map((pixel) => <option key={pixel.id} value={pixel.id}>{pixel.name}</option>)}
                          </select>
                          <p className={`mt-1 text-xs font-semibold ${requiresPixel && !accountPixelId ? 'text-red-500' : 'text-slate-400'}`}>
                            {requiresPixel
                              ? accountPixelId
                                ? accountPixelName || 'Pixel selected'
                                : 'Required for this template'
                              : accountPixelId
                                ? accountPixelName || 'Optional pixel selected'
                                : 'Optional for tracking'}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <select value={assignment.campaignTemplateId || ''} onChange={(event) => updateAssignment(account.id, 'campaignTemplateId', event.target.value)} className="h-10 min-w-52 rounded-xl border border-sky-100 px-3 text-xs font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
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
                            <select value={assignment.mediaTemplateId || ''} onChange={(event) => updateAssignment(account.id, 'mediaTemplateId', event.target.value)} className="h-10 min-w-52 rounded-xl border border-sky-100 px-3 text-xs font-semibold outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
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
                          {mediaTemplate ? (
                            <p className="mt-1 text-xs font-semibold text-slate-400">
                              {mediaTemplate.config?.headline || getTemplateLabel(mediaTemplate)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => setMediaPickerAccountId(account.id)}
                            className="flex min-h-10 min-w-48 items-center gap-3 rounded-xl border border-sky-100 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-sky-50"
                          >
                            {mediaAsset?.media?.url ? (
                              <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-950">
                                {mediaAsset.mediaType === 'VIDEO' ? (
                                  <video src={mediaAsset.media.url} className="h-full w-full object-cover" />
                                ) : (
                                  <img src={mediaAsset.media.url} alt={mediaAsset.name} className="h-full w-full object-cover" />
                                )}
                              </span>
                            ) : (
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                                <ImageIcon size={17} strokeWidth={2.4} />
                              </span>
                            )}
                            <span className="min-w-0">
                              <span className="block truncate font-black text-slate-900">{mediaAsset?.name || 'Choose media'}</span>
                              <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-400">
                                {mediaAsset ? `${mediaAsset.mediaType === 'VIDEO' ? 'Video' : 'Image'} | ${mediaAsset.media?.width || 0}x${mediaAsset.media?.height || 0}` : 'Open library'}
                              </span>
                            </span>
                          </button>
                          {videoMediaSelected ? (
                            <button
                              type="button"
                              onClick={() => setThumbnailPickerAccountId(account.id)}
                              className={`mt-2 flex min-h-10 min-w-48 items-center gap-3 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                                thumbnailAsset
                                  ? 'border-emerald-100 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                  : 'border-amber-100 bg-amber-50 text-amber-800 hover:bg-amber-100'
                              }`}
                            >
                              {thumbnailAsset?.media?.url ? (
                                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-950">
                                  <img src={thumbnailAsset.media.url} alt={thumbnailAsset.name} className="h-full w-full object-cover" />
                                </span>
                              ) : (
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/80 text-amber-700">
                                  <ImageIcon size={17} strokeWidth={2.4} />
                                </span>
                              )}
                              <span className="min-w-0">
                                <span className="block truncate font-black">{thumbnailAsset?.name || 'Choose thumbnail'}</span>
                                <span className="mt-0.5 block truncate text-[11px] font-semibold opacity-75">
                                  {thumbnailAsset ? `${thumbnailAsset.media?.width || 0}x${thumbnailAsset.media?.height || 0}` : 'Required for video'}
                                </span>
                              </span>
                            </button>
                          ) : null}
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
