import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BriefcaseBusiness,
  Building2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Filter,
  Handshake,
  KeyRound,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import DashboardHeader from '../components/DashboardHeader';
import DashboardPanel from '../components/DashboardPanel';
import { businessDataApi } from '../api/businessDataApi';
import { useBusinessData } from '../hooks/useBusinessData';
import { useDashboard } from '../hooks/useDashboard';

const defaultBrandForm = {
  name: '',
  color: '#0ea5e9',
};

const defaultAgencyForm = {
  name: '',
};

const socialAccountPageSizes = [5, 10, 20];

const formatDate = (value) => {
  if (!value) {
    return 'Not yet';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const StatCard = ({ icon: Icon, label, value, tone }) => (
  <DashboardPanel>
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
      </div>
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon size={22} strokeWidth={2.2} />
      </div>
    </div>
  </DashboardPanel>
);

const EmptyState = ({ children }) => (
  <p className="rounded-2xl border border-dashed border-sky-100 bg-sky-50/60 px-5 py-8 text-center text-sm font-semibold text-slate-500">
    {children}
  </p>
);

const EntityManager = ({ title, emptyText, items, defaultForm, saving, onSubmit, onDelete, showColor = false }) => {
  const [form, setForm] = useState(defaultForm);
  const [editingItem, setEditingItem] = useState(null);
  const [search, setSearch] = useState('');
  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setForm(defaultForm);
    setEditingItem(null);
  };

  const startEdit = (item) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      ...(showColor ? { color: item.color } : {}),
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const saved = await onSubmit(form, editingItem);
    if (saved) {
      resetForm();
    }
  };

  return (
    <DashboardPanel title={title}>
      <form
        onSubmit={handleSubmit}
        className={`grid gap-3 ${showColor ? 'sm:grid-cols-[minmax(0,1fr)_110px_auto]' : 'sm:grid-cols-[minmax(0,1fr)_auto]'}`}
      >
        <input
          value={form.name}
          onChange={(event) => updateField('name', event.target.value)}
          className="h-11 rounded-xl border border-sky-100 bg-white px-4 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          placeholder={`${title} name`}
          required
        />
        {showColor ? (
          <input
            type="color"
            value={form.color}
            onChange={(event) => updateField('color', event.target.value)}
            className="h-11 w-full rounded-xl border border-sky-100 bg-white px-2 py-1"
            title={`${title} color`}
          />
        ) : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-70"
          >
            {editingItem ? <Save size={16} strokeWidth={2.2} /> : null}
            {editingItem ? 'Save' : 'Add'}
          </button>
          {editingItem ? (
            <button
              type="button"
              onClick={resetForm}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-100 bg-white text-slate-600 transition hover:bg-sky-50"
              title="Cancel edit"
            >
              <X size={17} strokeWidth={2.2} />
            </button>
          ) : null}
        </div>
      </form>

      <label className="mt-4 block">
        <span className="sr-only">Search {title}</span>
        <div className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 transition focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-100">
          <Search size={17} strokeWidth={2.3} className="shrink-0 text-sky-600" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none"
            placeholder={`Search ${title.toLowerCase()}`}
          />
        </div>
      </label>

      <div className="mt-4 max-h-[35rem] space-y-2 overflow-y-auto pr-1">
        {filteredItems.length ? (
          filteredItems.map((item) => (
            <div key={item.id} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-sky-50 bg-white px-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                {showColor ? (
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                ) : (
                  <Handshake size={16} strokeWidth={2.2} className="shrink-0 text-teal-600" />
                )}
                <span className="truncate text-sm font-bold text-slate-800">{item.name}</span>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-sky-50 hover:text-sky-700"
                  title="Edit"
                >
                  <Edit3 size={16} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  disabled={saving}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50 disabled:opacity-70"
                  title="Delete"
                >
                  <Trash2 size={16} strokeWidth={2.2} />
                </button>
              </div>
            </div>
          ))
        ) : search.trim() ? (
          <EmptyState>No matching {title.toLowerCase()} found.</EmptyState>
        ) : (
          <EmptyState>{emptyText}</EmptyState>
        )}
      </div>
    </DashboardPanel>
  );
};

const SocialAccountAvatar = ({ account }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = account.profileImageUrl && !imageFailed;
  const initial = account.name?.trim()?.charAt(0)?.toUpperCase() || 'S';

  if (showImage) {
    return (
      <img
        src={account.profileImageUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setImageFailed(true)}
        className="h-11 w-11 shrink-0 rounded-full border border-sky-100 object-cover"
      />
    );
  }

  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sky-100 bg-sky-50 text-sm font-black text-sky-700">
      {initial}
    </span>
  );
};

const SocialAccountsTable = ({
  agencies,
  brands,
  filters,
  filterOptions,
  loading,
  limit,
  onClearFilters,
  pagination,
  socialAccounts,
  onFilterChange,
  onLimitChange,
  onPageChange,
}) => {
  return (
    <DashboardPanel
      title="Social accounts"
      className="mt-4"
    >
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm leading-6 text-slate-500">
          Social accounts are fetched from saved Meta Connections. Brand and agency ownership comes from the connection settings.
        </p>
      </div>

      <div className="mb-4 grid gap-3 rounded-2xl border border-sky-50 bg-sky-50/50 p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_120px_auto]">
        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Social account</span>
          <input
            value={filters.search}
            onChange={(event) => onFilterChange('search', event.target.value)}
            className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            placeholder="Search accounts"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">API token</span>
          <select
            value={filters.tokenLabel}
            onChange={(event) => onFilterChange('tokenLabel', event.target.value)}
            className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          >
            <option value="">All tokens</option>
            {filterOptions.tokenLabels.map((tokenLabel) => (
              <option key={tokenLabel} value={tokenLabel}>
                {tokenLabel}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Brand</span>
          <select
            value={filters.brandId}
            onChange={(event) => onFilterChange('brandId', event.target.value)}
            className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          >
            <option value="">All brands</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Agency</span>
          <select
            value={filters.agencyId}
            onChange={(event) => onFilterChange('agencyId', event.target.value)}
            className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          >
            <option value="">All agencies</option>
            {agencies.map((agency) => (
              <option key={agency.id} value={agency.id}>
                {agency.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Rows</span>
          <select
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          >
            {socialAccountPageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={onClearFilters}
            className="h-11 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
          <Filter size={17} strokeWidth={2.2} className="text-sky-600" />
          Showing {pagination.total ? (pagination.page - 1) * pagination.limit + 1 : 0}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} accounts
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(pagination.page - 1, 1))}
            disabled={!pagination.hasPrevious || loading}
            className="flex h-10 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-50"
          >
            <ChevronLeft size={16} strokeWidth={2.2} />
            Previous
          </button>
          <span className="min-w-24 text-center text-sm font-black text-slate-700">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(pagination.page + 1)}
            disabled={!pagination.hasNext || loading}
            className="flex h-10 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-50"
          >
            Next
            <ChevronRight size={16} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-72 animate-pulse rounded-2xl bg-sky-50" />
      ) : socialAccounts.length ? (
        <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-sky-50">
              <thead className="bg-sky-50/70">
                <tr>
                  {['Social account', 'API token', 'AdsPower Profile', 'Business profiles', 'Brand', 'Agency', 'Last synced'].map((heading) => (
                    <th key={heading} className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-50">
                {socialAccounts.map((account) => {
                  return (
                    <tr key={account.id} className="align-middle">
                      <td className="px-5 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <SocialAccountAvatar account={account} />
                          <div className="min-w-0">
                            <p className="truncate font-black text-slate-950">{account.name}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-400">
                              Meta account ID: {account.metaAccountId}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {account.sourceTokenLabel ? (
                          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
                            <KeyRound size={13} strokeWidth={2.4} />
                            {account.sourceTokenLabel}
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-slate-400">Not tracked</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-slate-700">
                        {account.adsPowerProfile || <span className="font-semibold text-slate-400">Not set</span>}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                          <BriefcaseBusiness size={13} strokeWidth={2.4} />
                          {account.profileCount} profiles
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {account.brand ? (
                          <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-slate-700">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: account.brand.color }} />
                            {account.brand.name}
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {account.agency ? (
                          <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-slate-700">
                            <Handshake size={13} strokeWidth={2.4} className="text-teal-600" />
                            {account.agency.name}
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-500">
                        {formatDate(account.lastSyncedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState>No social account data yet. Save an active Meta Connection first, then fetch data from Meta Connection.</EmptyState>
      )}
    </DashboardPanel>
  );
};

const DashboardPage = () => {
  const [socialAccountPage, setSocialAccountPage] = useState(1);
  const [socialAccountLimit, setSocialAccountLimit] = useState(5);
  const [socialAccountFilters, setSocialAccountFilters] = useState({
    search: '',
    tokenLabel: '',
    brandId: '',
    agencyId: '',
  });
  const { dashboard, error, loading, reload } = useDashboard();
  const {
    agencies,
    brands,
    error: businessDataError,
    loadBusinessData,
    loading: businessDataLoading,
    socialAccountFilterOptions,
    socialAccountPagination,
    socialAccounts,
    setAgencies,
    setBrands,
  } = useBusinessData({
    page: socialAccountPage,
    limit: socialAccountLimit,
    ...socialAccountFilters,
  });
  const [savingBusinessData, setSavingBusinessData] = useState(false);
  const refreshAllRef = useRef(null);
  const metrics = dashboard?.metrics || {};

  const metricCards = [
    {
      label: 'Brands',
      value: metrics.brands ?? brands.length,
      icon: Building2,
      tone: 'bg-sky-50 text-sky-700',
    },
    {
      label: 'Agencies',
      value: metrics.agencies ?? agencies.length,
      icon: Handshake,
      tone: 'bg-teal-50 text-teal-700',
    },
    {
      label: 'Access Tokens',
      value: metrics.accessTokens ?? 0,
      icon: KeyRound,
      tone: 'bg-indigo-50 text-indigo-700',
    },
    {
      label: 'Social Accounts',
      value: metrics.socialAccounts ?? socialAccounts.length,
      icon: BriefcaseBusiness,
      tone: 'bg-amber-50 text-amber-700',
    },
  ];

  const refreshAll = async () => {
    await Promise.all([reload(), loadBusinessData({ showLoading: false })]);
  };

  useEffect(() => {
    refreshAllRef.current = refreshAll;
  });

  useEffect(() => {
    const refreshAfterSync = () => {
      refreshAllRef.current?.();
    };

    window.addEventListener('meta-sync-completed', refreshAfterSync);
    return () => window.removeEventListener('meta-sync-completed', refreshAfterSync);
  }, []);

  const updateSocialAccountFilter = (field, value) => {
    setSocialAccountFilters((current) => ({
      ...current,
      [field]: value,
    }));
    setSocialAccountPage(1);
  };

  const clearSocialAccountFilters = () => {
    setSocialAccountFilters({
      search: '',
      tokenLabel: '',
      brandId: '',
      agencyId: '',
    });
    setSocialAccountPage(1);
  };

  const updateSocialAccountLimit = (value) => {
    setSocialAccountLimit(value);
    setSocialAccountPage(1);
  };

  const saveBrand = async (form, editingItem) => {
    setSavingBusinessData(true);
    try {
      const data = editingItem
        ? await businessDataApi.updateBrand(editingItem.id, form)
        : await businessDataApi.createBrand(form);
      toast.success(data.message);
      const brandData = await businessDataApi.getBrands();
      setBrands(brandData.brands);
      await reload();
      return true;
    } catch (requestError) {
      toast.error(requestError.message);
      return false;
    } finally {
      setSavingBusinessData(false);
    }
  };

  const saveAgency = async (form, editingItem) => {
    setSavingBusinessData(true);
    try {
      const data = editingItem
        ? await businessDataApi.updateAgency(editingItem.id, { name: form.name })
        : await businessDataApi.createAgency({ name: form.name });
      toast.success(data.message);
      const agencyData = await businessDataApi.getAgencies();
      setAgencies(agencyData.agencies);
      await reload();
      return true;
    } catch (requestError) {
      toast.error(requestError.message);
      return false;
    } finally {
      setSavingBusinessData(false);
    }
  };

  const deleteBrand = async (brand) => {
    if (!window.confirm(`Delete brand "${brand.name}"?`)) {
      return;
    }

    setSavingBusinessData(true);
    try {
      const data = await businessDataApi.deleteBrand(brand.id);
      toast.success(data.message);
      await refreshAll();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSavingBusinessData(false);
    }
  };

  const deleteAgency = async (agency) => {
    if (!window.confirm(`Delete agency "${agency.name}"?`)) {
      return;
    }

    setSavingBusinessData(true);
    try {
      const data = await businessDataApi.deleteAgency(agency.id);
      toast.success(data.message);
      await refreshAll();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSavingBusinessData(false);
    }
  };

  return (
    <div>
      <DashboardHeader
        title="Dashboard"
        description="Manage brands, agencies, Meta access tokens, and saved social accounts."
        action={
          <button
            type="button"
            onClick={refreshAll}
            className="h-11 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
          >
            Refresh
          </button>
        }
      />

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {businessDataError ? (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{businessDataError}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => (
              <DashboardPanel key={index}>
                <div className="h-20 animate-pulse rounded-xl bg-sky-50" />
              </DashboardPanel>
            ))
          : metricCards.map((card) => <StatCard key={card.label} {...card} />)}
      </div>

      <SocialAccountsTable
        agencies={agencies}
        brands={brands}
        filters={socialAccountFilters}
        filterOptions={socialAccountFilterOptions}
        limit={socialAccountLimit}
        loading={businessDataLoading}
        pagination={socialAccountPagination}
        socialAccounts={socialAccounts}
        onClearFilters={clearSocialAccountFilters}
        onFilterChange={updateSocialAccountFilter}
        onLimitChange={updateSocialAccountLimit}
        onPageChange={setSocialAccountPage}
      />

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <EntityManager
          title="Brands"
          emptyText="No brands added yet."
          items={brands}
          defaultForm={defaultBrandForm}
          saving={savingBusinessData}
          onSubmit={saveBrand}
          onDelete={deleteBrand}
          showColor
        />

        <EntityManager
          title="Agencies"
          emptyText="No agencies added yet."
          items={agencies}
          defaultForm={defaultAgencyForm}
          saving={savingBusinessData}
          onSubmit={saveAgency}
          onDelete={deleteAgency}
        />
      </div>
    </div>
  );
};

export default DashboardPage;
