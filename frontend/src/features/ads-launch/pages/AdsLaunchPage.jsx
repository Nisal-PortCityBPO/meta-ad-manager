import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  Globe2,
  ImageIcon,
  Layers3,
  MousePointerClick,
  Rocket,
  Upload,
  Video,
  Wand2,
} from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { useBusinessData } from '../../dashboard/hooks/useBusinessData';

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
  businessProfileId: '',
  country: 'LK',
  objective: 'OUTCOME_TRAFFIC',
  dailyBudget: '15',
  pageId: '',
  pageName: '',
  adAccountIdsText: '',
  headline: '',
  primaryText: '',
  description: '',
  websiteUrl: '',
  callToAction: 'LEARN_MORE',
};

const parseLineItems = (value) =>
  value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const buildName = (...parts) => parts.filter(Boolean).join(' | ');

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

const AdsLaunchPage = () => {
  const { error, loading, profiles } = useBusinessData();
  const [form, setForm] = useState(emptyForm);
  const [mediaFile, setMediaFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState('');

  const selectedProfile = profiles.find((profile) => profile.id === form.businessProfileId) || null;
  const adAccountIds = useMemo(() => parseLineItems(form.adAccountIdsText), [form.adAccountIdsText]);
  const isVideoAsset = mediaFile?.type?.startsWith('video/') || false;
  const canGenerate = Boolean(
    form.launchLabel.trim() &&
      form.country &&
      form.headline.trim() &&
      form.primaryText.trim() &&
      form.websiteUrl.trim() &&
      adAccountIds.length
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

  const previewItems = useMemo(
    () =>
      adAccountIds.map((accountId, index) => ({
        accountId,
        campaignName: buildName(form.launchLabel.trim(), countryOptions.find((item) => item.value === form.country)?.label, `Campaign ${index + 1}`),
        adSetName: buildName(form.launchLabel.trim(), form.country, 'Ad Set'),
        adName: buildName(form.launchLabel.trim(), form.pageName || form.pageId || 'Ad', `Creative ${index + 1}`),
      })),
    [adAccountIds, form.country, form.launchLabel, form.pageId, form.pageName]
  );

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
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
      toast.error('Add the launch name, copy, URL, and at least one ad account id');
      return;
    }

    toast.success('Launch plan generated. Backend publish endpoints are the next step.');
  };

  const handlePublish = () => {
    toast.error('Meta publish is not connected yet. We still need ad account, page, media, and campaign creation endpoints.');
  };

  return (
    <div>
      <DashboardHeader
        title="Ads Launch"
        description="Prepare a one-click campaign, ad set, and ad workflow on top of the current business-profile system."
        action={
          <InfoPill icon={Rocket} tone="amber">
            Builder mode
          </InfoPill>
        }
      />

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_420px]">
        <DashboardPanel title="One-click launch builder">
          <div className="mb-5 flex flex-wrap gap-2">
            <InfoPill icon={Layers3}>Campaign + ad set + ad naming</InfoPill>
            <InfoPill icon={Globe2}>Country-based launch preset</InfoPill>
            <InfoPill icon={MousePointerClick}>Manual fallback for unsynced assets</InfoPill>
          </div>

          <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
            <div className="grid gap-4 lg:grid-cols-2">
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

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2 lg:col-span-2">
                <FieldLabel htmlFor="business-profile">Business profile</FieldLabel>
                <select
                  id="business-profile"
                  value={form.businessProfileId}
                  onChange={(event) => updateField('businessProfileId', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  disabled={loading}
                >
                  <option value="">Select saved Meta business profile</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
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
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-2">
                <FieldLabel htmlFor="ad-account-ids">Ad accounts</FieldLabel>
                <textarea
                  id="ad-account-ids"
                  value={form.adAccountIdsText}
                  onChange={(event) => updateField('adAccountIdsText', event.target.value)}
                  className="min-h-28 w-full rounded-xl border border-sky-100 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="Paste one or many ad account ids, separated by comma or new line"
                  required
                />
                <p className="text-xs font-semibold text-slate-400">
                  This is the practical fallback until we add synced multi-select ad accounts from Meta.
                </p>
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
                <p className="text-xs font-semibold text-slate-400">Use this as the default ad set budget per account.</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="page-id">Facebook page id</FieldLabel>
                <input
                  id="page-id"
                  value={form.pageId}
                  onChange={(event) => updateField('pageId', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="123456789012345"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="page-name">Page name</FieldLabel>
                <input
                  id="page-name"
                  value={form.pageName}
                  onChange={(event) => updateField('pageName', event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="Brand Facebook Page"
                />
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
                  <p className="mt-1 text-xs font-semibold text-slate-500">This should become Meta image or video upload in the backend.</p>
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
                The current app already stores Meta tokens and business profiles. That is the right foundation for a launch tool, but
                we still need synced ad accounts, Facebook pages, media upload, and final Meta publish endpoints.
              </p>
              <div className="rounded-2xl bg-amber-50 px-4 py-4 text-amber-800">
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                  <p className="text-sm font-semibold">
                    Best next backend step: sync `owned_ad_accounts`, `client_ad_accounts`, and business-owned pages for each saved Meta
                    business profile.
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
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Saved business profiles</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{profiles.length}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                These are already available from the current sync flow and should become the source for ad-account and page syncing.
              </p>
            </div>

            {selectedProfile ? (
              <div className="rounded-2xl border border-sky-100 bg-white px-4 py-4">
                <p className="font-black text-slate-950">{selectedProfile.name}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">Meta ID: {selectedProfile.metaBusinessId}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedProfile.brand ? <InfoPill icon={Layers3}>{selectedProfile.brand.name}</InfoPill> : null}
                  {selectedProfile.agency ? (
                    <InfoPill icon={MousePointerClick} tone="amber">
                      {selectedProfile.agency.name}
                    </InfoPill>
                  ) : null}
                </div>
              </div>
            ) : (
              <EmptyState>Select a saved business profile to anchor the launch workflow.</EmptyState>
            )}

            <EmptyState>
              No synced ad accounts or pages exist yet in this system. For now, this page uses manual account and page fields as a safe
              bridge.
            </EmptyState>
          </div>
        </DashboardPanel>

        <DashboardPanel title="Generated launch plan">
          {previewItems.length ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-sky-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Ad accounts</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{previewItems.length}</p>
                </div>
                <div className="rounded-2xl bg-sky-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Objective</p>
                  <p className="mt-2 text-lg font-black text-slate-950">
                    {objectiveOptions.find((item) => item.value === form.objective)?.label || 'Not selected'}
                  </p>
                </div>
                <div className="rounded-2xl bg-sky-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Creative</p>
                  <p className="mt-2 text-lg font-black text-slate-950">{mediaFile ? mediaFile.name : 'Not uploaded yet'}</p>
                </div>
              </div>

              <div className="space-y-3">
                {previewItems.map((item) => (
                  <div key={item.accountId} className="rounded-2xl border border-sky-100 bg-white px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Ad Account {item.accountId}</p>
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
            <EmptyState>
              Add at least one ad account id to generate the launch structure that should later be sent to Meta with one action.
            </EmptyState>
          )}
        </DashboardPanel>
      </div>
    </div>
  );
};

export default AdsLaunchPage;
