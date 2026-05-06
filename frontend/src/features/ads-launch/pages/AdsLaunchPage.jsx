import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  Check,
  Globe2,
  ImageIcon,
  KeyRound,
  Layers3,
  MousePointerClick,
  Rocket,
  Upload,
  Video,
  Wand2,
} from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { useTokens } from '../../token-management/hooks/useTokens';
import { useTokenMetaAssets } from '../hooks/useTokenMetaAssets';

const countryOptions = [
  { value: 'LK', label: 'Sri Lanka' },
  { value: 'IN', label: 'India' },
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

const formatTokenUsage = (value) => {
  if (!value) {
    return 'No API calls yet';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const buildName = (...parts) => parts.filter(Boolean).join(' | ');

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
  const [form, setForm] = useState(emptyForm);
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
  const isVideoAsset = mediaFile?.type?.startsWith('video/') || false;
  const requiresPixel = form.selectedAdAccountIds.length > 0;
  const canGenerate = Boolean(
    form.tokenId &&
      form.launchLabel.trim() &&
      form.country &&
      form.selectedAdAccountIds.length &&
      form.pageId &&
      form.headline.trim() &&
      form.primaryText.trim() &&
      form.websiteUrl.trim() &&
      (!requiresPixel || form.pixelId)
  );

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
    setForm((current) => ({
      ...current,
      selectedAdAccountIds: [],
      pageId: '',
      pixelId: '',
    }));
  }, [form.tokenId]);

  useEffect(() => {
    if (pages.length === 1 && !form.pageId) {
      setForm((current) => ({
        ...current,
        pageId: pages[0].id,
      }));
    }
  }, [form.pageId, pages]);

  useEffect(() => {
    loadPixels(form.tokenId, form.selectedAdAccountIds);
  }, [form.selectedAdAccountIds, form.tokenId, loadPixels]);

  useEffect(() => {
    if (pixels.length === 1 && !form.pixelId) {
      setForm((current) => ({
        ...current,
        pixelId: pixels[0].id,
      }));
      return;
    }

    if (form.pixelId && !pixels.some((pixel) => pixel.id === form.pixelId)) {
      setForm((current) => ({
        ...current,
        pixelId: '',
      }));
    }
  }, [form.pixelId, pixels]);

  const previewItems = useMemo(
    () =>
      selectedAdAccounts.map((account, index) => ({
        account,
        campaignName: buildName(
          form.launchLabel.trim(),
          countryOptions.find((item) => item.value === form.country)?.label,
          `Campaign ${index + 1}`
        ),
        adSetName: buildName(form.launchLabel.trim(), account.name, 'Ad Set'),
        adName: buildName(form.launchLabel.trim(), selectedPage?.name || 'Ad', `Creative ${index + 1}`),
      })),
    [form.country, form.launchLabel, selectedAdAccounts, selectedPage]
  );

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const toggleAdAccount = (accountId) => {
    setForm((current) => {
      const nextSelection = current.selectedAdAccountIds.includes(accountId)
        ? current.selectedAdAccountIds.filter((id) => id !== accountId)
        : [...current.selectedAdAccountIds, accountId];

      return {
        ...current,
        selectedAdAccountIds: nextSelection,
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

  const handleGenerate = () => {
    if (!canGenerate) {
      toast.error('Select the token, ad accounts, page, pixel, and required copy fields first');
      return;
    }

    toast.success('Launch plan generated from live token assets.');
  };

  const handlePublish = () => {
    toast.error('Live Meta publish is still the next backend step after this asset-loading phase.');
  };

  return (
    <div>
      <DashboardHeader
        title="Ads Launch"
        description="Load ad accounts, pages, and pixels from the selected Meta token, then prepare one-click campaign batches."
        action={
          <InfoPill icon={Rocket} tone="amber">
            Live asset loading
          </InfoPill>
        }
      />

      {tokensError ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{tokensError}</p> : null}
      {assetsError ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{assetsError}</p> : null}
      {pixelError ? <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{pixelError}</p> : null}
      {warnings.length ? (
        <div className="mb-4 space-y-2">
          {warnings.map((warning) => (
            <p key={`${warning.scope}-${warning.message}`} className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {warning.scope}: {warning.message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_420px]">
        <DashboardPanel title="One-click launch builder">
          <div className="mb-5 flex flex-wrap gap-2">
            <InfoPill icon={KeyRound}>Token-scoped assets</InfoPill>
            <InfoPill icon={Layers3}>Multi-account batch</InfoPill>
            <InfoPill icon={Globe2}>Country-based naming</InfoPill>
            <InfoPill icon={MousePointerClick}>Page + pixel from API</InfoPill>
          </div>

          <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
            <div className="grid gap-4 lg:grid-cols-3">
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
                <FieldLabel htmlFor="source-token">Source token</FieldLabel>
                <select
                  id="source-token"
                  value={form.tokenId}
                  onChange={(event) => updateField('tokenId', event.target.value)}
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

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
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
                <div
                  id="ad-account-list"
                  className="max-h-72 overflow-y-auto rounded-2xl border border-sky-100 bg-white p-3"
                >
                  {loadingAssets ? (
                    <div className="h-40 animate-pulse rounded-xl bg-sky-50" />
                  ) : adAccounts.length ? (
                    <div className="space-y-2">
                      {adAccounts.map((account) => {
                        const checked = form.selectedAdAccountIds.includes(account.id);

                        return (
                          <label
                            key={account.id}
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
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
                                {account.accountId} {account.currency ? `• ${account.currency}` : ''}
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

              <div className="space-y-2">
                <FieldLabel htmlFor="daily-budget">Daily budget</FieldLabel>
                <input
                  id="daily-budget"
                  type="number"
                  min="1"
                  step="1"
                  value={form.dailyBudget}
                  onChange={(event) => updateField('dailyBudget', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="15"
                />
                <p className="text-xs font-semibold text-slate-400">Applies as the default budget for each selected ad account.</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
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
                <p className="text-xs font-semibold text-slate-400">Loaded from `me/accounts` for the selected token.</p>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="pixel-id">Pixel</FieldLabel>
                <select
                  id="pixel-id"
                  value={form.pixelId}
                  onChange={(event) => updateField('pixelId', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  disabled={loadingPixels || !pixels.length}
                  required={requiresPixel}
                >
                  <option value="">{loadingPixels ? 'Loading shared pixels...' : 'Select shared pixel'}</option>
                  {pixels.map((pixel) => (
                    <option key={pixel.id} value={pixel.id}>
                      {pixel.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs font-semibold text-slate-400">
                  Pixel options are the common pixels shared across the selected ad accounts.
                </p>
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

            <div className="grid gap-4 lg:grid-cols-2">
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

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="media-upload">Image or video</FieldLabel>
                <label
                  htmlFor="media-upload"
                  className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-sky-200 bg-sky-50/70 px-5 py-6 text-center transition hover:border-sky-400 hover:bg-sky-50"
                >
                  <Upload size={26} strokeWidth={2.1} className="text-sky-600" />
                  <p className="mt-3 text-sm font-black text-slate-950">Upload image or video</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">This will later map to Meta image or video upload endpoints.</p>
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
                  className={`flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-6 text-center transition ${
                    isVideoAsset
                      ? 'cursor-pointer border-sky-200 bg-sky-50/70 hover:border-sky-400 hover:bg-sky-50'
                      : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                  }`}
                >
                  <Upload size={26} strokeWidth={2.1} className={isVideoAsset ? 'text-sky-600' : 'text-slate-300'} />
                  <p className="mt-3 text-sm font-black text-slate-950">Upload thumbnail</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Needed only when the main creative is a video.</p>
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
                className="flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white transition hover:bg-sky-700"
              >
                <Wand2 size={17} strokeWidth={2.2} />
                Generate one-click plan
              </button>
              <button
                type="button"
                onClick={handlePublish}
                className="flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                <Rocket size={17} strokeWidth={2.2} />
                Publish to Meta
              </button>
            </div>
          </form>
        </DashboardPanel>

        <div className="space-y-4">
          <DashboardPanel title="Static template">
            <div className="space-y-3">
              {lockedDefaults.map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-3 rounded-xl bg-sky-50/70 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-500">{item.label}</span>
                  <span className="text-right text-sm font-black text-slate-950">{item.value}</span>
                </div>
              ))}
            </div>
          </DashboardPanel>

          <DashboardPanel title="Current system fit">
            <div className="space-y-3 text-sm leading-6 text-slate-600">
              <p>
                This launch flow now starts from the saved Meta token, because that token decides which ad accounts, pages, and pixels
                can actually be used.
              </p>
              <div className="rounded-2xl bg-amber-50 px-4 py-4 text-amber-800">
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                  <p className="text-sm font-semibold">
                    The backend now loads ad accounts and pages from the selected token, and pixels from the selected ad accounts. The
                    remaining gap is final campaign/ad set/ad creation.
                  </p>
                </div>
              </div>
            </div>
          </DashboardPanel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <DashboardPanel title="Dynamic data status">
          <div className="space-y-4">
            <div className="rounded-2xl bg-sky-50/70 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Active launch tokens</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{activeTokens.length}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Pick one token to load accessible ad accounts, pages, and pixels directly from Meta.
              </p>
            </div>

            {selectedToken ? (
              <div className="rounded-2xl border border-sky-100 bg-white px-4 py-4">
                <p className="font-black text-slate-950">{selectedToken.label}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">{selectedToken.accessToken}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <InfoPill icon={KeyRound}>Status: {selectedToken.status}</InfoPill>
                  <InfoPill icon={Layers3}>API calls: {selectedToken.apiCallCount}</InfoPill>
                  <InfoPill icon={MousePointerClick} tone="amber">
                    {formatTokenUsage(selectedToken.lastApiCallAt)}
                  </InfoPill>
                </div>
              </div>
            ) : (
              <EmptyState>Select an active token to load API-backed asset options.</EmptyState>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-sky-100 bg-white px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Loaded ad accounts</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{adAccounts.length}</p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-white px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Loaded pages</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{pages.length}</p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-white px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Shared pixels</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{pixels.length}</p>
              </div>
            </div>

            {!loadingPixels && form.selectedAdAccountIds.length > 1 && !pixels.length ? (
              <EmptyState>No common pixel was found across the selected ad accounts for this token.</EmptyState>
            ) : null}
          </div>
        </DashboardPanel>

        <DashboardPanel title="Generated launch plan">
          {previewItems.length ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-sky-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Source token</p>
                  <p className="mt-2 text-lg font-black text-slate-950">{selectedToken?.label || 'Not selected'}</p>
                </div>
                <div className="rounded-2xl bg-sky-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Selected accounts</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{previewItems.length}</p>
                </div>
                <div className="rounded-2xl bg-sky-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Objective</p>
                  <p className="mt-2 text-lg font-black text-slate-950">
                    {objectiveOptions.find((item) => item.value === form.objective)?.label || 'Not selected'}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-sky-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Page</p>
                  <p className="mt-2 text-lg font-black text-slate-950">{selectedPage?.name || 'Not selected'}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">{selectedPage?.id || 'Missing page'}</p>
                </div>
                <div className="rounded-2xl bg-sky-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Pixel</p>
                  <p className="mt-2 text-lg font-black text-slate-950">{selectedPixel?.name || 'Not selected'}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">{selectedPixel?.id || 'Missing pixel'}</p>
                </div>
                <div className="rounded-2xl bg-sky-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Creative</p>
                  <p className="mt-2 text-lg font-black text-slate-950">{mediaFile ? mediaFile.name : 'Not uploaded yet'}</p>
                </div>
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
