import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { DownloadCloud, Edit3, Plus, Save, Trash2, X } from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { businessDataApi } from '../../dashboard/api/businessDataApi';
import { getMetaKeyTypeLabel, META_KEY_TYPES, useMetaKeySettings } from '../../settings/MetaKeySettingsContext';
import { tokensApi } from '../api/tokensApi';
import { useTokens } from '../hooks/useTokens';

const emptyForm = {
  label: '',
  adsPowerProfile: '',
  brandId: '',
  agencyId: '',
  profileAccessToken: '',
  profileAccessTokenStatus: 'ACTIVE',
  profilePerHourApiCallLimit: 100,
  systemUserAccessToken: '',
  systemUserAccessTokenStatus: 'ACTIVE',
  systemUserPerHourApiCallLimit: 100,
};

const statusStyles = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  DEACTIVE: 'bg-slate-100 text-slate-600',
};

const statusLabels = {
  ACTIVE: 'Active',
  DEACTIVE: 'Deactive',
};

const connectionStyles = {
  UNKNOWN: 'bg-slate-100 text-slate-600',
  CONNECTED: 'bg-emerald-50 text-emerald-700',
  BLOCKED: 'bg-red-50 text-red-700',
  DISABLED: 'bg-orange-50 text-orange-700',
};

const connectionLabels = {
  UNKNOWN: 'Unknown',
  CONNECTED: 'Connected',
  BLOCKED: 'Blocked',
  DISABLED: 'Disabled',
};

const tableHeadings = [
  { label: 'Connection Details', width: 'w-96' },
  { label: 'Profile Access Token Details', width: 'w-[28rem]' },
  { label: 'System User Access Token Details', width: 'w-[28rem]' },
  { label: 'Actions', width: 'w-44' },
];

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : 'Not checked yet');
const formatCallLimit = (count, limit) => `${Number(count) || 0}/${Number(limit) || 0}`;
const syncMessage = (summary = {}) =>
  `Fetch done: ${summary.created || 0} new, ${summary.updated || 0} updated, ${summary.skipped || 0} skipped, ${summary.apiCalls || 0} API calls`;
const metaConnectionSyncToastId = 'meta-connection-profile-sync';

const isTokenFetchableWithType = (token, tokenType) => {
  if (!token || token.status === 'DEACTIVE') {
    return false;
  }

  if (tokenType === META_KEY_TYPES.SYSTEM_USER) {
    return token.systemUserAccessTokenStatus !== 'DEACTIVE' && Boolean(token.systemUserAccessToken);
  }

  return token.profileAccessTokenStatus !== 'DEACTIVE' && Boolean(token.profileAccessToken || token.accessToken);
};

const getTokenApiCallCountForType = (token, tokenType) =>
  tokenType === META_KEY_TYPES.SYSTEM_USER
    ? Number(token.systemUserApiCallCount) || 0
    : Number(token.profileApiCallCount ?? token.apiCallCount) || 0;

const StatusBadge = ({ status }) => (
  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${statusStyles[status] || statusStyles.DEACTIVE}`}>
    {statusLabels[status] || status || 'Deactive'}
  </span>
);

const ConnectionBadge = ({ status }) => (
  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${connectionStyles[status] || connectionStyles.UNKNOWN}`}>
    {connectionLabels[status] || 'Unknown'}
  </span>
);

const MaskedToken = ({ value }) => (
  <span className="block max-w-80 truncate font-mono text-xs font-bold text-slate-700" title={value || 'Not set'}>
    {value || <span className="font-sans font-semibold text-slate-400">Not set</span>}
  </span>
);

const DetailLine = ({ label, children }) => (
  <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3">
    <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</span>
    <div className="min-w-0 text-sm font-bold text-slate-700">{children}</div>
  </div>
);

const TokenDetailsCell = ({
  connectionMessage,
  connectionStatus,
  hourCount,
  hourLimit,
  lastCallAt,
  lastConnectionAt,
  status,
  tokenValue,
  totalCalls,
}) => (
  <div className="min-w-96 space-y-2 rounded-xl border border-sky-50 bg-sky-50/40 p-3">
    <DetailLine label="Token"><MaskedToken value={tokenValue} /></DetailLine>
    <DetailLine label="Per hour">{formatCallLimit(hourCount, hourLimit)}</DetailLine>
    <DetailLine label="Total calls">{Number(totalCalls) || 0}</DetailLine>
    <DetailLine label="Last call">{formatDateTime(lastCallAt)}</DetailLine>
    <DetailLine label="Connection">
      <div className="space-y-1">
        <ConnectionBadge status={connectionStatus} />
        <p className="text-xs font-semibold leading-5 text-slate-400">
          {connectionMessage || formatDateTime(lastConnectionAt)}
        </p>
      </div>
    </DetailLine>
    <DetailLine label="Our status"><StatusBadge status={status} /></DetailLine>
  </div>
);

const ConnectionDetailsCell = ({ token }) => (
  <div className="min-w-80">
    <p className="text-base font-black text-slate-950">{token.label}</p>
    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
      AdsPower Profile: {token.adsPowerProfile || 'Not set'}
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      {token.brand ? (
        <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-slate-700">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: token.brand.color || '#38bdf8' }} />
          {token.brand.name}
        </span>
      ) : (
        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
          Brand unassigned
        </span>
      )}
      <span className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-slate-700">
        {token.agency?.name || 'Agency unassigned'}
      </span>
    </div>
    <p className="mt-3 text-xs font-semibold text-slate-400">
      Updated {new Date(token.updatedAt).toLocaleDateString()}
    </p>
  </div>
);

const TokenModal = ({
  agencies,
  brands,
  editingToken,
  form,
  onClose,
  onSubmit,
  onUpdateField,
  saving,
}) => {
  const title = editingToken ? 'Edit Meta connection' : 'Add Meta connection';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-2xl shadow-slate-900/20">
        <div className="flex items-center justify-between gap-4 border-b border-sky-100 px-6 py-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Meta Connection</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-100 bg-white text-slate-600 transition hover:bg-sky-50 disabled:opacity-60"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.3} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Token Label</span>
              <input
                value={form.label}
                onChange={(event) => onUpdateField('label', event.target.value)}
                className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="Main Meta connection"
                required
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">AdsPower Profile</span>
              <input
                value={form.adsPowerProfile}
                onChange={(event) => onUpdateField('adsPowerProfile', event.target.value)}
                className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="AdsPower browser profile name"
                required
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Brand</span>
              <select
                value={form.brandId}
                onChange={(event) => onUpdateField('brandId', event.target.value)}
                className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                required
              >
                <option value="">Select brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Agency</span>
              <select
                value={form.agencyId}
                onChange={(event) => onUpdateField('agencyId', event.target.value)}
                className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                required
              >
                <option value="">Select agency</option>
                {agencies.map((agency) => (
                  <option key={agency.id} value={agency.id}>
                    {agency.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">Profile Access token</span>
              <textarea
                value={form.profileAccessToken}
                onChange={(event) => onUpdateField('profileAccessToken', event.target.value)}
                className="min-h-24 w-full resize-y rounded-xl border border-sky-100 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder={editingToken ? 'Leave blank to keep the saved Profile Access token' : 'Paste Profile Access token'}
                required={!editingToken}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Status for Profile Access token</span>
              <select
                value={form.profileAccessTokenStatus}
                onChange={(event) => onUpdateField('profileAccessTokenStatus', event.target.value)}
                className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              >
                <option value="ACTIVE">Active</option>
                <option value="DEACTIVE">Deactive</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Per Hour API calls for Profile Access token</span>
              <input
                type="number"
                min="1"
                max="199"
                value={form.profilePerHourApiCallLimit}
                onChange={(event) => onUpdateField('profilePerHourApiCallLimit', event.target.value)}
                className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                required
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">System User Access token</span>
              <textarea
                value={form.systemUserAccessToken}
                onChange={(event) => onUpdateField('systemUserAccessToken', event.target.value)}
                className="min-h-24 w-full resize-y rounded-xl border border-sky-100 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder={editingToken ? 'Leave blank to keep the saved System User Access token' : 'Paste System User Access token'}
                required={!editingToken}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Status for System User Access token</span>
              <select
                value={form.systemUserAccessTokenStatus}
                onChange={(event) => onUpdateField('systemUserAccessTokenStatus', event.target.value)}
                className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              >
                <option value="ACTIVE">Active</option>
                <option value="DEACTIVE">Deactive</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Per Hour API calls for System User Access token</span>
              <input
                type="number"
                min="1"
                max="199"
                value={form.systemUserPerHourApiCallLimit}
                onChange={(event) => onUpdateField('systemUserPerHourApiCallLimit', event.target.value)}
                className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                required
              />
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-sky-100 pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-11 rounded-xl border border-sky-100 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-70"
            >
              {editingToken ? <Save size={17} strokeWidth={2.2} /> : <Plus size={17} strokeWidth={2.2} />}
              {saving ? 'Saving...' : editingToken ? 'Save connection' : 'Add connection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const TokenManagementPage = () => {
  const { tokens, loading, error, loadTokens } = useTokens();
  const { fetchTokenType } = useMetaKeySettings();
  const [brands, setBrands] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingToken, setEditingToken] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingTokenId, setSyncingTokenId] = useState(null);
  const [syncingAllTokens, setSyncingAllTokens] = useState(false);

  useEffect(() => {
    let isMounted = true;

    Promise.all([businessDataApi.getBrands(), businessDataApi.getAgencies()])
      .then(([brandData, agencyData]) => {
        if (isMounted) {
          setBrands(brandData.brands || []);
          setAgencies(agencyData.agencies || []);
        }
      })
      .catch((requestError) => toast.error(requestError.message));

    return () => {
      isMounted = false;
    };
  }, []);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const openCreateModal = () => {
    setEditingToken(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const startEdit = (token) => {
    setEditingToken(token);
    setForm({
      label: token.label || '',
      adsPowerProfile: token.adsPowerProfile || '',
      brandId: token.brand?.id || '',
      agencyId: token.agency?.id || '',
      profileAccessToken: '',
      profileAccessTokenStatus: token.profileAccessTokenStatus || 'ACTIVE',
      profilePerHourApiCallLimit: token.profilePerHourApiCallLimit || token.perHourApiCallLimit || 100,
      systemUserAccessToken: '',
      systemUserAccessTokenStatus: token.systemUserAccessTokenStatus || 'ACTIVE',
      systemUserPerHourApiCallLimit: token.systemUserPerHourApiCallLimit || token.perHourApiCallLimit || 100,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) {
      return;
    }

    setModalOpen(false);
    setEditingToken(null);
    setForm(emptyForm);
  };

  const validatePerHourLimit = (value, label) => {
    const parsedLimit = Number.parseInt(value, 10);

    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit >= 200) {
      toast.error(`${label} must be a number from 1 to 199`);
      return null;
    }

    return parsedLimit;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    let createdTokenToFetch = null;

    const profilePerHourApiCallLimit = validatePerHourLimit(
      form.profilePerHourApiCallLimit,
      'Profile per hour API calls'
    );
    const systemUserPerHourApiCallLimit = validatePerHourLimit(
      form.systemUserPerHourApiCallLimit,
      'System User per hour API calls'
    );

    if (!profilePerHourApiCallLimit || !systemUserPerHourApiCallLimit) {
      return;
    }

    setSaving(true);

    try {
      const payload = {
        label: form.label,
        adsPowerProfile: form.adsPowerProfile,
        brandId: form.brandId,
        agencyId: form.agencyId,
        profileAccessTokenStatus: form.profileAccessTokenStatus,
        profilePerHourApiCallLimit,
        systemUserAccessTokenStatus: form.systemUserAccessTokenStatus,
        systemUserPerHourApiCallLimit,
      };

      if (editingToken) {
        if (form.profileAccessToken.trim()) {
          payload.profileAccessToken = form.profileAccessToken;
        }

        if (form.systemUserAccessToken.trim()) {
          payload.systemUserAccessToken = form.systemUserAccessToken;
        }

        const data = await tokensApi.updateToken(editingToken.id, payload);
        toast.success(data.message);
      } else {
        const data = await tokensApi.createToken({
          ...payload,
          profileAccessToken: form.profileAccessToken,
          systemUserAccessToken: form.systemUserAccessToken,
        });
        createdTokenToFetch = data.token;
      }

      setModalOpen(false);
      setEditingToken(null);
      setForm(emptyForm);
      await loadTokens();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSaving(false);
    }

    if (createdTokenToFetch) {
      const selectedFetchTokenIsDeactive =
        createdTokenToFetch.status === 'DEACTIVE' ||
        (fetchTokenType === META_KEY_TYPES.SYSTEM_USER
          ? createdTokenToFetch.systemUserAccessTokenStatus === 'DEACTIVE'
          : createdTokenToFetch.profileAccessTokenStatus === 'DEACTIVE');

      if (selectedFetchTokenIsDeactive) {
        toast.success(`Connection added successfully. Auto fetch skipped because ${getMetaKeyTypeLabel(fetchTokenType)} is deactive.`);
        return;
      }

      void runProfileTokenFetch(createdTokenToFetch, { autoStarted: true, tokenType: fetchTokenType });
    }
  };

  const handleDelete = async (token) => {
    const confirmed = window.confirm(`Delete token "${token.label}"?`);
    if (!confirmed) {
      return;
    }

    setSaving(true);
    try {
      const data = await tokensApi.deleteToken(token.id);
      toast.success(data.message);
      await loadTokens();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const getFetchApiCallCount = async (tokenId, tokenType = fetchTokenType) => {
    const data = await tokensApi.getTokens();
    const token = data.tokens.find((item) => item.id === tokenId);

    if (!token) {
      return 0;
    }

    return getTokenApiCallCountForType(token, tokenType);
  };

  const getFetchApiCallCountForTokens = async (tokenIds, tokenType = fetchTokenType) => {
    const tokenIdSet = new Set(tokenIds);
    const data = await tokensApi.getTokens();

    return data.tokens
      .filter((token) => tokenIdSet.has(token.id))
      .reduce((total, token) => total + getTokenApiCallCountForType(token, tokenType), 0);
  };

  const runProfileTokenFetch = async (token, { autoStarted = false, tokenType = fetchTokenType } = {}) => {
    setSyncingTokenId(token.id);
    let profileApiCallBaseline = 0;
    let latestApiCallsSent = 0;
    let pollIntervalId = null;
    const actionLabel = autoStarted ? 'Fetching initial Meta data' : 'Fetching data';
    const keyLabel = getMetaKeyTypeLabel(tokenType);

    const showLoadingToast = (apiCallsSent) => {
      toast.loading(`${actionLabel} for ${token.label} using ${keyLabel}. API calls sent: ${apiCallsSent}`, {
        id: metaConnectionSyncToastId,
        position: 'top-center',
      });
    };

    try {
      showLoadingToast(0);
      profileApiCallBaseline = await getFetchApiCallCount(token.id, tokenType);

      pollIntervalId = window.setInterval(async () => {
        try {
          const currentProfileApiCalls = await getFetchApiCallCount(token.id, tokenType);
          latestApiCallsSent = Math.max(currentProfileApiCalls - profileApiCallBaseline, 0);
          showLoadingToast(latestApiCallsSent);
        } catch {
          // Keep the fetch running even if a polling refresh fails.
        }
      }, 1500);

      const data = await tokensApi.syncBusinessProfiles(token.id, tokenType);
      const finalApiCallsSent = Number(data.summary?.apiCalls) || latestApiCallsSent;
      const finalSummary = {
        ...data.summary,
        apiCalls: finalApiCallsSent,
      };

      toast.success(`${token.label}: ${syncMessage(finalSummary)}`, {
        id: metaConnectionSyncToastId,
        position: 'top-center',
      });

      if (data.summary?.errors?.length) {
        toast.error(data.summary.errors[0].message);
      }

      await loadTokens();
      window.dispatchEvent(new Event('meta-sync-completed'));
    } catch (requestError) {
      toast.error(requestError.message, {
        id: metaConnectionSyncToastId,
        position: 'top-center',
      });
    } finally {
      if (pollIntervalId) {
        window.clearInterval(pollIntervalId);
      }

      setSyncingTokenId(null);
    }
  };

  const handleFetchToken = (token) => {
    void runProfileTokenFetch(token, { tokenType: fetchTokenType });
  };

  const handleFetchAllTokens = async () => {
    const fetchableTokens = tokens.filter((token) => isTokenFetchableWithType(token, fetchTokenType));
    const keyLabel = getMetaKeyTypeLabel(fetchTokenType);

    if (!fetchableTokens.length) {
      toast.error(`No active ${keyLabel} connections are available to fetch.`);
      return;
    }

    setSyncingAllTokens(true);
    let apiCallBaseline = 0;
    let latestApiCallsSent = 0;
    let pollIntervalId = null;
    const tokenIds = fetchableTokens.map((token) => token.id);

    const showLoadingToast = (apiCallsSent) => {
      toast.loading(`Fetching all Meta connections using ${keyLabel}. Tokens: ${fetchableTokens.length}. API calls sent: ${apiCallsSent}`, {
        id: metaConnectionSyncToastId,
        position: 'top-center',
      });
    };

    try {
      showLoadingToast(0);
      apiCallBaseline = await getFetchApiCallCountForTokens(tokenIds, fetchTokenType);

      pollIntervalId = window.setInterval(async () => {
        try {
          const currentApiCalls = await getFetchApiCallCountForTokens(tokenIds, fetchTokenType);
          latestApiCallsSent = Math.max(currentApiCalls - apiCallBaseline, 0);
          showLoadingToast(latestApiCallsSent);
        } catch {
          // Keep the bulk fetch running even if a progress refresh fails.
        }
      }, 1500);

      const data = await tokensApi.syncBusinessProfiles(null, fetchTokenType);
      const finalApiCallsSent = Number(data.summary?.apiCalls) || latestApiCallsSent;
      const finalSummary = {
        ...data.summary,
        apiCalls: finalApiCallsSent,
      };

      toast.success(`All Meta connections: ${syncMessage(finalSummary)}`, {
        id: metaConnectionSyncToastId,
        position: 'top-center',
      });

      if (data.summary?.errors?.length) {
        toast.error(data.summary.errors[0].message);
      }

      await loadTokens();
      window.dispatchEvent(new Event('meta-sync-completed'));
    } catch (requestError) {
      toast.error(requestError.message, {
        id: metaConnectionSyncToastId,
        position: 'top-center',
      });
    } finally {
      if (pollIntervalId) {
        window.clearInterval(pollIntervalId);
      }

      setSyncingAllTokens(false);
    }
  };

  const selectedFetchKeyLabel = getMetaKeyTypeLabel(fetchTokenType);
  const fetchableTokenCount = tokens.filter((token) => isTokenFetchableWithType(token, fetchTokenType)).length;

  return (
    <div>
      <DashboardHeader
        title="Meta Connection"
        description="Store Meta profile and system user access tokens securely, assign brand and agency ownership, and monitor API call usage."
      />

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <DashboardPanel
        title="Saved Meta Connections"
        headerAction={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleFetchAllTokens}
              disabled={saving || loading || syncingAllTokens || Boolean(syncingTokenId) || !fetchableTokenCount}
              className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
              title={
                fetchableTokenCount
                  ? `Fetch all active connections using ${selectedFetchKeyLabel}`
                  : `No active ${selectedFetchKeyLabel} connections available`
              }
            >
              <DownloadCloud size={17} strokeWidth={2.2} className={syncingAllTokens ? 'animate-pulse' : ''} />
              {syncingAllTokens ? 'Fetching all' : 'Fetch From All'}
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white transition hover:bg-sky-700"
            >
              <Plus size={17} strokeWidth={2.2} />
              Add token
            </button>
          </div>
        }
      >
        {loading ? (
          <div className="h-72 animate-pulse rounded-2xl bg-sky-50" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1400px] table-fixed divide-y divide-sky-50">
                <colgroup>
                  <col className="w-96" />
                  <col className="w-[28rem]" />
                  <col className="w-[28rem]" />
                  <col className="w-44" />
                </colgroup>
                <thead className="bg-sky-50/70">
                  <tr>
                    {tableHeadings.map((heading) => (
                      <th
                        key={heading.label}
                        className={[
                          'px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-sky-700',
                          heading.width,
                        ].join(' ')}
                      >
                        {heading.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-50">
                  {tokens.map((token) => {
                      const selectedFetchTokenIsDeactive =
                        !isTokenFetchableWithType(token, fetchTokenType);

                      return (
                        <tr key={token.id} className="align-top">
                          <td className="px-5 py-4"><ConnectionDetailsCell token={token} /></td>
                          <td className="px-5 py-4">
                            <TokenDetailsCell
                              connectionMessage={token.profileAccessTokenConnectionMessage || token.connectionMessage}
                              connectionStatus={token.profileAccessTokenConnectionStatus || token.connectionStatus}
                              hourCount={token.profilePerHourApiCallCount}
                              hourLimit={token.profilePerHourApiCallLimit || token.perHourApiCallLimit}
                              lastCallAt={token.profileLastApiCallAt || token.lastApiCallAt}
                              lastConnectionAt={token.profileAccessTokenLastConnectionCheckedAt}
                              status={token.profileAccessTokenStatus || 'ACTIVE'}
                              tokenValue={token.profileAccessToken || token.accessToken}
                              totalCalls={token.profileApiCallCount || token.apiCallCount}
                            />
                          </td>
                          <td className="px-5 py-4">
                            <TokenDetailsCell
                              connectionMessage={token.systemUserAccessTokenConnectionMessage}
                              connectionStatus={token.systemUserAccessTokenConnectionStatus || 'UNKNOWN'}
                              hourCount={token.systemUserPerHourApiCallCount}
                              hourLimit={token.systemUserPerHourApiCallLimit || token.perHourApiCallLimit}
                              lastCallAt={token.systemUserLastApiCallAt}
                              lastConnectionAt={token.systemUserAccessTokenLastConnectionCheckedAt}
                              status={token.systemUserAccessTokenStatus || 'ACTIVE'}
                              tokenValue={token.systemUserAccessToken}
                              totalCalls={token.systemUserApiCallCount}
                            />
                          </td>
                          <td className="px-5 py-4">
                            <div className="grid gap-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEdit(token)}
                                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-100 bg-white text-slate-700 transition hover:bg-sky-50"
                                  title="Edit token"
                                  aria-label={`Edit ${token.label}`}
                                >
                                  <Edit3 size={16} strokeWidth={2.2} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(token)}
                                  disabled={saving || syncingTokenId === token.id}
                                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-100 bg-white text-red-600 transition hover:bg-red-50 disabled:opacity-70"
                                  title="Delete token"
                                  aria-label={`Delete ${token.label}`}
                                >
                                  <Trash2 size={16} strokeWidth={2.2} />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleFetchToken(token)}
                                disabled={saving || syncingAllTokens || Boolean(syncingTokenId) || selectedFetchTokenIsDeactive}
                                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 text-sm font-bold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                                title={selectedFetchTokenIsDeactive ? `${selectedFetchKeyLabel} is deactive` : `Fetch data using ${selectedFetchKeyLabel}`}
                              >
                                <DownloadCloud size={16} strokeWidth={2.2} className={syncingTokenId === token.id ? 'animate-pulse' : ''} />
                                {syncingTokenId === token.id ? 'Fetching' : 'Fetch'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                  })}
                </tbody>
              </table>
            </div>

            {!tokens.length ? (
              <p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">No Meta connections saved yet.</p>
            ) : null}
          </div>
        )}
      </DashboardPanel>

      {modalOpen ? (
        <TokenModal
          agencies={agencies}
          brands={brands}
          editingToken={editingToken}
          form={form}
          onClose={closeModal}
          onSubmit={handleSubmit}
          onUpdateField={updateField}
          saving={saving}
        />
      ) : null}
    </div>
  );
};

export default TokenManagementPage;
