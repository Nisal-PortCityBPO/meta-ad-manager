import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  Check,
  FolderOpen,
  Globe2,
  ImageIcon,
  KeyRound,
  Layers3,
  LoaderCircle,
  MousePointerClick,
  Rocket,
  Save,
  Trash2,
  Upload,
  Video,
  Wand2,
} from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { useTokens } from '../../token-management/hooks/useTokens';
import { adsLaunchApi } from '../api/adsLaunchApi';
import { useLaunchTemplates } from '../hooks/useLaunchTemplates';
import { useTokenMetaAssets } from '../hooks/useTokenMetaAssets';

const countryOptions = [
  { value: 'LK', label: 'Sri Lanka' },
  { value: 'IN', label: 'India' },
  { value: 'ID', label: 'Indonesia' },
  { value: 'CN', label: 'China' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
];

const objectiveOptions = [
  { value: 'OUTCOME_TRAFFIC', label: 'Traffic' },
  { value: 'OUTCOME_ENGAGEMENT', label: 'Engagement' },
  { value: 'OUTCOME_LEADS', label: 'Leads' },
  { value: 'OUTCOME_SALES', label: 'Sales' },
];

const callToActionOptions = [
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'CONTACT_US', label: 'Contact Us' },
  { value: 'APPLY_NOW', label: 'Apply Now' },
];

const lockedDefaults = [
  { label: 'Buying type', value: 'Auction' },
  { label: 'Campaign status', value: 'Paused on create' },
  { label: 'Special ad categories', value: 'None' },
  { label: 'Placements', value: 'Advantage+ placements' },
  { label: 'Audience age', value: '18 to 65+' },
  { label: 'Gender targeting', value: 'All genders' },
  { label: 'Billing event', value: 'Impressions' },
  { label: 'Bid strategy', value: 'Lowest cost' },
];

const emptyForm = {
  launchLabel: '',
  tokenId: '',
  country: 'LK',
  objective: 'OUTCOME_TRAFFIC',
  dailyBudget: '15',
  selectedAdAccountIds: [],
  pageId: '',
  pixelId: '',
  headline: '',
  primaryText: '',
  description: '',
  websiteUrl: '',
  callToAction: 'LEARN_MORE',
};

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

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });

const buildName = (...parts) => parts.filter(Boolean).join(' | ');

const MetricCard = ({ label, value, detail }) => (
  <div className="rounded-2xl border border-sky-100 bg-white px-4 py-4 shadow-sm shadow-sky-100/70">
    <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">{label}</p>
    <p className="mt-2 break-words text-lg font-black text-slate-950 sm:text-2xl">{value}</p>
    {detail ? <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p> : null}
  </div>
);

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

  const [form, setForm] = useState(emptyForm);
  const [activeTemplateId, setActiveTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [latestPublish, setLatestPublish] = useState(null);
  const [mediaFile, setMediaFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState('');

  const activeTokens = useMemo(() => tokens.filter((token) => token.status === 'ACTIVE'), [tokens]);
  const selectedToken = activeTokens.find((token) => token.id === form.tokenId) || null;
  const selectedPage = pages.find((page) => page.id === form.pageId) || null;
  const selectedPixel = pixels.find((pixel) => pixel.id === form.pixelId) || null;
  const selectedAdAccounts = useMemo(
    () => adAccounts.filter((account) => form.selectedAdAccountIds.includes(account.id)),
    [adAccounts, form.selectedAdAccountIds]
  );
  const selectedCountry = countryOptions.find((country) => country.value === form.country) || null;
  const isVideoAsset = mediaFile?.type?.startsWith('video/') || false;
  const canGenerate = Boolean(
    form.tokenId &&
      form.launchLabel.trim() &&
      form.selectedAdAccountIds.length &&
      form.pageId &&
      form.pixelId &&
      form.headline.trim() &&
      form.primaryText.trim() &&
      form.websiteUrl.trim()
  );
  const canPublish = Boolean(canGenerate && mediaFile && (!isVideoAsset || thumbnailFile));

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
    loadAssets(form.tokenId);
  }, [form.tokenId, loadAssets]);

  useEffect(() => {
    loadPixels(form.tokenId, form.selectedAdAccountIds);
  }, [form.selectedAdAccountIds, form.tokenId, loadPixels]);

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
    if (pixels.length === 1 && !form.pixelId) {
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
  }, [form.pixelId, pixels]);

  useEffect(() => {
    if (!adAccounts.length || !form.selectedAdAccountIds.length) {
      return;
    }

    const validAccountIds = form.selectedAdAccountIds.filter((accountId) => adAccounts.some((account) => account.id === accountId));

    if (validAccountIds.length !== form.selectedAdAccountIds.length) {
      setForm((current) => ({
        ...current,
        selectedAdAccountIds: validAccountIds,
      }));
    }
  }, [adAccounts, form.selectedAdAccountIds]);

  const previewItems = useMemo(
    () =>
      selectedAdAccounts.map((account, index) => ({
        account,
        campaignName: buildName(form.launchLabel.trim(), selectedCountry?.label, `Campaign ${index + 1}`),
        adSetName: buildName(form.launchLabel.trim(), account.name, 'Ad Set'),
        adName: buildName(form.launchLabel.trim(), selectedPage?.name || 'Ad', `Creative ${index + 1}`),
      })),
    [form.launchLabel, selectedAdAccounts, selectedCountry, selectedPage]
  );

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetCreativeFiles = () => {
    setMediaFile(null);
    setThumbnailFile(null);
  };

  const resetComposer = () => {
    setForm(emptyForm);
    setActiveTemplateId('');
    setTemplateName('');
    setLatestPublish(null);
    resetCreativeFiles();
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
        current.selectedAdAccountIds.length === adAccounts.length ? [] : adAccounts.map((account) => account.id),
    }));
  };

  const handleMediaChange = (event) => {
    const file = event.target.files?.[0] || null;
    setMediaFile(file);

    if (file && !file.type.startsWith('video/')) {
      setThumbnailFile(null);
    }
  };

  const handleThumbnailChange = (event) => {
    const file = event.target.files?.[0] || null;
    setThumbnailFile(file);
  };

  const buildTemplatePayload = () => ({
    name: (templateName || form.launchLabel).trim(),
    config: {
      ...form,
    },
    snapshot: {
      tokenLabel: selectedToken?.label || '',
      pageName: selectedPage?.name || '',
      pixelName: selectedPixel?.name || '',
      adAccounts: selectedAdAccounts.map((account) => ({
        id: account.id,
        name: account.name,
      })),
    },
  });

  const buildPublishPayload = async () => {
    const mediaDataUrl = await readFileAsDataUrl(mediaFile);
    const thumbnailDataUrl = thumbnailFile ? await readFileAsDataUrl(thumbnailFile) : null;

    return {
      templateId: activeTemplateId || undefined,
      launchLabel: form.launchLabel.trim(),
      tokenId: form.tokenId,
      country: form.country,
      objective: form.objective,
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
      headline: form.headline.trim(),
      primaryText: form.primaryText.trim(),
      description: form.description.trim(),
      websiteUrl: form.websiteUrl.trim(),
      callToAction: form.callToAction,
      media: {
        name: mediaFile.name,
        type: mediaFile.type,
        dataUrl: mediaDataUrl,
      },
      thumbnail: thumbnailDataUrl
        ? {
            name: thumbnailFile.name,
            type: thumbnailFile.type,
            dataUrl: thumbnailDataUrl,
          }
        : null,
    };
  };

  const handleSaveTemplate = async () => {
    const nextTemplateName = (templateName || form.launchLabel).trim();
    if (!nextTemplateName) {
      toast.error('Add a template name or launch name before saving');
      return;
    }

    setSavingTemplate(true);

    try {
      const payload = buildTemplatePayload();
      const data = activeTemplateId
        ? await adsLaunchApi.updateTemplate(activeTemplateId, payload)
        : await adsLaunchApi.createTemplate(payload);

      setActiveTemplateId(data.template.id);
      setTemplateName(data.template.name);
      await loadTemplates();
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSavingTemplate(false);
    }
  };

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
      }
      await loadTemplates();
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleLoadTemplate = (template) => {
    setForm({
      ...emptyForm,
      ...template.config,
      selectedAdAccountIds: Array.isArray(template.config.selectedAdAccountIds) ? template.config.selectedAdAccountIds : [],
    });
    setActiveTemplateId(template.id);
    setTemplateName(template.name);
    setLatestPublish(null);
    resetCreativeFiles();
    toast.success(`Loaded template "${template.name}"`);
  };

  const handleGenerate = () => {
    if (!canGenerate) {
      toast.error('Select the token, ad accounts, page, pixel, and required copy fields first');
      return;
    }

    toast.success('Launch plan generated from the current selections.');
  };

  const handlePublish = async () => {
    if (!canPublish) {
      toast.error('Add the creative file, and for video also upload a thumbnail before publishing');
      return;
    }

    setPublishing(true);

    try {
      const payload = await buildPublishPayload();
      const data = await adsLaunchApi.publishLaunch(payload);
      setLatestPublish(data);
      await loadTemplates();
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div>
      <DashboardHeader
        title="Ads Launch"
        description="Load token-based Meta assets, save reusable launch templates, and publish campaign, ad set, creative, and ad batches."
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
          </div>
        }
      />

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
            <InfoPill icon={KeyRound}>Token-scoped assets</InfoPill>
            <InfoPill icon={Layers3}>Reusable templates</InfoPill>
            <InfoPill icon={Globe2}>China and Indonesia ready</InfoPill>
            <InfoPill icon={MousePointerClick}>Page + pixel from API</InfoPill>
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
                  Templates save the configuration only. Creative files are re-uploaded when you publish again.
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
                <FieldLabel htmlFor="country">Country</FieldLabel>
                <select
                  id="country"
                  value={form.country}
                  onChange={(event) => updateField('country', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                >
                  {countryOptions.map((country) => (
                    <option key={country.value} value={country.value}>
                      {country.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="space-y-2">
                <FieldLabel htmlFor="source-token">Source token</FieldLabel>
                <select
                  id="source-token"
                  value={form.tokenId}
                  onChange={(event) => handleTokenChange(event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  disabled={tokensLoading}
                  required
                >
                  <option value="">Select active Meta token</option>
                  {activeTokens.map((token) => (
                    <option key={token.id} value={token.id}>
                      {token.label} ({token.accessToken})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="objective">Objective</FieldLabel>
                <select
                  id="objective"
                  value={form.objective}
                  onChange={(event) => updateField('objective', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                >
                  {objectiveOptions.map((objective) => (
                    <option key={objective.value} value={objective.value}>
                      {objective.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="daily-budget">Daily budget</FieldLabel>
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
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="ad-account-list">Ad accounts</FieldLabel>
                  <button
                    type="button"
                    onClick={toggleSelectAllAccounts}
                    disabled={!adAccounts.length}
                    className="text-xs font-black uppercase tracking-[0.16em] text-sky-600 disabled:text-slate-300"
                  >
                    {form.selectedAdAccountIds.length === adAccounts.length && adAccounts.length ? 'Clear all' : 'Select all'}
                  </button>
                </div>

                <div id="ad-account-list" className="rounded-2xl border border-sky-100 bg-white p-3">
                  {loadingAssets ? (
                    <div className="h-44 animate-pulse rounded-xl bg-sky-50" />
                  ) : adAccounts.length ? (
                    <div className="grid max-h-80 gap-2 overflow-y-auto md:grid-cols-2">
                      {adAccounts.map((account) => {
                        const checked = form.selectedAdAccountIds.includes(account.id);

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
                    <EmptyState>Select a token with `ads_management` access to load ad accounts.</EmptyState>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-2">
                  <FieldLabel htmlFor="page-id">Facebook page</FieldLabel>
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
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor="pixel-id">Pixel</FieldLabel>
                  <select
                    id="pixel-id"
                    value={form.pixelId}
                    onChange={(event) => updateField('pixelId', event.target.value)}
                    className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    disabled={loadingPixels || !pixels.length}
                    required
                  >
                    <option value="">{loadingPixels ? 'Loading shared pixels...' : 'Select shared pixel'}</option>
                    {pixels.map((pixel) => (
                      <option key={pixel.id} value={pixel.id}>
                        {pixel.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs font-semibold text-slate-400">
                    Shared pixels are only shown when they are available across the selected ad accounts.
                  </p>
                </div>
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
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="media-upload">Image or video</FieldLabel>
                <label
                  htmlFor="media-upload"
                  className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-sky-200 bg-sky-50/70 px-5 py-6 text-center transition hover:border-sky-400 hover:bg-sky-50"
                >
                  <Upload size={26} strokeWidth={2.1} className="text-sky-600" />
                  <p className="mt-3 text-sm font-black text-slate-950">Upload image or video</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">This file is uploaded to Meta during publish.</p>
                </label>
                <input id="media-upload" type="file" accept="image/*,video/*" onChange={handleMediaChange} className="hidden" />

                {mediaPreviewUrl ? (
                  <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
                    {isVideoAsset ? (
                      <video src={mediaPreviewUrl} controls className="h-56 w-full bg-slate-950 object-contain" />
                    ) : (
                      <img src={mediaPreviewUrl} alt="Uploaded creative preview" className="h-56 w-full object-cover" />
                    )}
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950">{mediaFile?.name}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-400">{mediaFile?.type || 'Unknown file type'}</p>
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
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="thumbnail-upload">Thumbnail for video</FieldLabel>
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
                  <p className="mt-1 text-xs font-semibold text-slate-500">Required when the main creative is a video.</p>
                </label>
                <input
                  id="thumbnail-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleThumbnailChange}
                  className="hidden"
                  disabled={!isVideoAsset}
                />

                {thumbnailPreviewUrl ? (
                  <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
                    <img src={thumbnailPreviewUrl} alt="Video thumbnail preview" className="h-56 w-full object-cover" />
                    <div className="px-4 py-3">
                      <p className="truncate text-sm font-black text-slate-950">{thumbnailFile?.name}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-400">{thumbnailFile?.type || 'Unknown file type'}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleGenerate}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-sky-100 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-sky-50 sm:w-auto"
              >
                <Wand2 size={17} strokeWidth={2.2} />
                Generate one-click plan
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={savingTemplate}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-70 sm:w-auto"
              >
                {savingTemplate ? <LoaderCircle size={17} strokeWidth={2.2} className="animate-spin" /> : <Save size={17} strokeWidth={2.2} />}
                {activeTemplateId ? 'Update template' : 'Save template'}
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-70 sm:w-auto"
              >
                {publishing ? <LoaderCircle size={17} strokeWidth={2.2} className="animate-spin" /> : <Rocket size={17} strokeWidth={2.2} />}
                Publish to Meta
              </button>
            </div>
          </form>
        </DashboardPanel>

        <div className="space-y-4">
          <DashboardPanel title="Saved templates">
            {templatesLoading ? (
              <div className="h-56 animate-pulse rounded-2xl bg-sky-50" />
            ) : templates.length ? (
              <div className="space-y-3">
                {templates.map((template) => (
                  <div key={template.id} className="rounded-2xl border border-sky-100 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950">{template.name}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-400">Updated {formatDateTime(template.updatedAt)}</p>
                      </div>
                      {activeTemplateId === template.id ? <InfoPill icon={Check}>Loaded</InfoPill> : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {template.snapshot?.tokenLabel ? <InfoPill icon={KeyRound}>{template.snapshot.tokenLabel}</InfoPill> : null}
                      {template.snapshot?.pageName ? <InfoPill icon={MousePointerClick}>{template.snapshot.pageName}</InfoPill> : null}
                    </div>

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

          <DashboardPanel title="Static template defaults">
            <div className="space-y-3">
              {lockedDefaults.map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-3 rounded-xl bg-sky-50/70 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-500">{item.label}</span>
                  <span className="text-right text-sm font-black text-slate-950">{item.value}</span>
                </div>
              ))}
            </div>
          </DashboardPanel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <MetricCard label="Active Tokens" value={activeTokens.length} detail="Available Meta access sources for this launch." />
        <MetricCard label="Loaded Accounts" value={adAccounts.length} detail="Accounts retrieved from the selected token." />
        <MetricCard label="Loaded Pages" value={pages.length} detail="Page options come directly from Meta token access." />
        <MetricCard label="Shared Pixels" value={pixels.length} detail="Common pixels across the selected accounts." />
      </div>

      <div className="mt-4 grid gap-4 2xl:grid-cols-[360px_minmax(0,1fr)]">
        <DashboardPanel title="Current launch context">
          <div className="space-y-4">
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
              <EmptyState>Select an active token to load API-backed asset options.</EmptyState>
            )}

            {!loadingPixels && form.selectedAdAccountIds.length > 1 && !pixels.length ? (
              <EmptyState>No common pixel was found across the selected ad accounts for this token.</EmptyState>
            ) : null}

            <div className="rounded-2xl bg-amber-50 px-4 py-4 text-amber-800">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                <p className="text-sm font-semibold">
                  Templates store the launch configuration only. To publish again later, reload the template and upload the current
                  image or video before sending.
                </p>
              </div>
            </div>
          </div>
        </DashboardPanel>

        <DashboardPanel title="Generated launch plan">
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
                  <p className="mt-2 text-sm font-semibold text-emerald-800">
                    Published {latestPublish.summary?.published || 0} of {latestPublish.summary?.requested || 0} requested accounts.
                  </p>

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
            <EmptyState>Select the token and one or more ad accounts to generate the launch structure.</EmptyState>
          )}
        </DashboardPanel>
      </div>
    </div>
  );
};

export default AdsLaunchPage;
