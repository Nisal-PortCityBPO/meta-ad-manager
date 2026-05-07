import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BadgeDollarSign,
  BriefcaseBusiness,
  ChevronDown,
  FileText,
  FolderOpen,
  Handshake,
  Megaphone,
} from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { businessDataApi } from '../../dashboard/api/businessDataApi';

const hardcodedBrandStats = {
  A200M: { adSpend: '$12,480', campaigns: 18 },
  ASIA100: { adSpend: '$8,920', campaigns: 11 },
  ASIA200: { adSpend: '$15,340', campaigns: 23 },
  ASIA300: { adSpend: '$6,175', campaigns: 9 },
};

const fallbackStats = { adSpend: '$3,500', campaigns: 5 };

const statusStyles = {
  CONNECTED: 'bg-emerald-50 text-emerald-700',
  DISABLED: 'bg-red-50 text-red-700',
  UNKNOWN: 'bg-slate-100 text-slate-600',
};

const statusLabels = {
  CONNECTED: 'Connected',
  DISABLED: 'Disabled',
  UNKNOWN: 'Unknown',
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const agencyLabel = (count) => `${count} ${count === 1 ? 'agency' : 'agencies'}`;
const profileLabel = (count) => `${count} ${count === 1 ? 'profile' : 'profiles'}`;

const getBrandStats = (brand) => hardcodedBrandStats[brand.name] || fallbackStats;

const getBrandProfileCount = (brand) =>
  (brand.assignedAgencies || []).reduce(
    (total, agency) => total + (agency.businessProfiles?.length || agency.profileCount || 0),
    0
  );

const numberFromText = (value = '') =>
  value.split('').reduce((total, character) => total + character.charCodeAt(0), 0);

const getAgencyStats = (agency, index) => {
  const seed = numberFromText(`${agency.id}${agency.name}`) + index * 41;

  return {
    adSpend: currencyFormatter.format(1800 + (seed % 9200)),
    campaigns: 3 + (seed % 13),
  };
};

const BrandCard = ({ brand, onSelect }) => {
  const stats = getBrandStats(brand);
  const agencyCount = brand.agencyCount || 0;
  const profileCount = getBrandProfileCount(brand);

  return (
    <button
      type="button"
      onClick={() => onSelect(brand.id)}
      className="rounded-xl border border-sky-100 bg-white p-4 text-left shadow-sm shadow-sky-50 transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg hover:shadow-sky-100 focus:outline-none focus:ring-4 focus:ring-sky-100"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: brand.color }} />
            <h3 className="truncate text-lg font-black text-slate-950">{brand.name}</h3>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Handshake size={14} strokeWidth={2.2} className="text-teal-600" />
            {agencyLabel(agencyCount)} assigned
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <BriefcaseBusiness size={14} strokeWidth={2.2} className="text-amber-600" />
            {profileLabel(profileCount)}
          </p>
        </div>

        <div className="shrink-0 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-right">
          <p className="flex items-center justify-end gap-1 text-xs font-black uppercase tracking-[0.12em] text-sky-700">
            <BadgeDollarSign size={13} strokeWidth={2.2} />
            Spend
          </p>
          <p className="mt-1 text-base font-black text-slate-950">{stats.adSpend}</p>
          <p className="mt-1 flex items-center justify-end gap-1 text-xs font-bold text-slate-500">
            <Megaphone size={13} strokeWidth={2.2} />
            {stats.campaigns} campaigns
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Assigned agencies</p>
        {brand.assignedAgencies?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {brand.assignedAgencies.map((agency) => (
              <span
                key={agency.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-700"
              >
                <Handshake size={13} strokeWidth={2.4} />
                {agency.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-sky-100 bg-sky-50/60 px-4 py-5 text-center text-sm font-semibold text-slate-500">
            No agencies assigned yet.
          </p>
        )}
      </div>
    </button>
  );
};

const BrandAgencyTree = ({ brand }) => (
  <div className="mt-2 rounded-xl border border-sky-50 bg-white p-3">
    <div className="flex items-center gap-2 text-sm font-black text-slate-800">
      <ChevronDown size={16} strokeWidth={2.3} className="text-sky-600" />
      <FolderOpen size={17} strokeWidth={2.3} className="text-sky-600" />
      <span className="min-w-0 truncate">{brand.name}</span>
    </div>

    <div className="ml-4 mt-3 space-y-2 border-l border-sky-100 pl-3">
      {brand.assignedAgencies?.length ? (
        brand.assignedAgencies.map((agency) => (
          <div key={agency.id} className="relative">
            <span className="absolute -left-3 top-4 h-px w-2 bg-sky-100" />
            <div className="rounded-lg bg-sky-50/60 px-2.5 py-2">
              <div className="flex items-center gap-2">
                <FolderOpen size={15} strokeWidth={2.3} className="shrink-0 text-teal-600" />
                <span className="min-w-0 truncate text-xs font-black text-slate-800">{agency.name}</span>
              </div>
              <p className="mt-1 pl-6 text-xs font-semibold text-slate-500">
                {profileLabel(agency.businessProfiles?.length || agency.profileCount || 0)}
              </p>
            </div>
          </div>
        ))
      ) : (
        <p className="rounded-lg border border-dashed border-sky-100 bg-sky-50/60 px-3 py-4 text-center text-xs font-semibold text-slate-500">
          No agencies assigned.
        </p>
      )}
    </div>
  </div>
);

const BrandTreeSidebar = ({ brands, onBack, onSelectBrand, selectedBrandId }) => {
  return (
    <aside className="rounded-2xl border border-sky-100 bg-white p-3 shadow-sm shadow-sky-50">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex h-10 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
      >
        <ArrowLeft size={16} strokeWidth={2.2} />
        All brands
      </button>

      <div className="space-y-3">
        {brands.map((brand) => {
          const stats = getBrandStats(brand);
          const isSelected = brand.id === selectedBrandId;

          return (
            <div key={brand.id}>
              <button
                type="button"
                onClick={() => onSelectBrand(brand.id)}
                className={`w-full rounded-xl border p-3 text-left transition focus:outline-none focus:ring-4 focus:ring-sky-100 ${
                  isSelected
                    ? 'border-sky-300 bg-sky-50 shadow-sm shadow-sky-100'
                    : 'border-sky-100 bg-white hover:border-sky-200 hover:bg-sky-50/60'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: brand.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-950">{brand.name}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{agencyLabel(brand.agencyCount || 0)}</p>
                  </div>
                  <p className="shrink-0 text-xs font-black text-sky-700">{stats.adSpend}</p>
                </div>
              </button>

              {isSelected ? <BrandAgencyTree brand={brand} /> : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

const AgencyDetailCard = ({ agency, index }) => {
  const stats = getAgencyStats(agency, index);
  const profiles = agency.businessProfiles || [];

  return (
    <div className="rounded-xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-50">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Handshake size={18} strokeWidth={2.2} className="shrink-0 text-teal-600" />
            <h3 className="truncate text-base font-black text-slate-950">{agency.name}</h3>
          </div>
          <p className="mt-2 text-xs font-bold text-slate-500">{profileLabel(profiles.length || agency.profileCount || 0)}</p>
        </div>

        <div className="shrink-0 rounded-xl border border-teal-100 bg-teal-50 px-3 py-2 text-right">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-teal-700">Spend</p>
          <p className="mt-1 text-base font-black text-slate-950">{stats.adSpend}</p>
          <p className="mt-1 flex items-center justify-end gap-1 text-xs font-bold text-slate-500">
            <Megaphone size={13} strokeWidth={2.2} />
            {stats.campaigns}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Assigned business profiles</p>
        {profiles.length ? (
          <div className="mt-3 space-y-2">
            {profiles.map((profile) => (
              <div key={profile.id} className="rounded-xl border border-sky-50 bg-sky-50/50 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-black text-slate-800">
                      <FileText size={15} strokeWidth={2.3} className="shrink-0 text-sky-600" />
                      <span className="truncate">{profile.name}</span>
                    </p>
                    <p className="mt-1 pl-6 text-xs font-semibold text-slate-500">
                      Meta ID: {profile.metaBusinessId}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${
                      statusStyles[profile.metaStatus] || statusStyles.UNKNOWN
                    }`}
                  >
                    {statusLabels[profile.metaStatus] || statusLabels.UNKNOWN}
                  </span>
                </div>
                <p className="mt-2 pl-6 text-xs font-semibold text-slate-400">
                  {profile.sourceTokenLabel || 'No token label'}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-sky-100 bg-sky-50/60 px-4 py-5 text-center text-sm font-semibold text-slate-500">
            No business profiles assigned.
          </p>
        )}
      </div>
    </div>
  );
};

const SelectedBrandView = ({ brand, brands, onBack, onSelectBrand, selectedBrandId }) => {
  const stats = getBrandStats(brand);
  const profileCount = getBrandProfileCount(brand);
  const agencies = brand.assignedAgencies || [];

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <BrandTreeSidebar
        brands={brands}
        onBack={onBack}
        onSelectBrand={onSelectBrand}
        selectedBrandId={selectedBrandId}
      />

      <section className="min-w-0">
        <div className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-sky-50">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: brand.color }} />
                <h2 className="truncate text-2xl font-black text-slate-950">{brand.name}</h2>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-700">
                  <Handshake size={13} strokeWidth={2.4} />
                  {agencyLabel(brand.agencyCount || 0)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                  <BriefcaseBusiness size={13} strokeWidth={2.4} />
                  {profileLabel(profileCount)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:w-72">
              <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                <p className="flex items-center gap-1 text-xs font-black uppercase tracking-[0.12em] text-sky-700">
                  <BadgeDollarSign size={13} strokeWidth={2.2} />
                  Spend
                </p>
                <p className="mt-2 text-xl font-black text-slate-950">{stats.adSpend}</p>
              </div>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                <p className="flex items-center gap-1 text-xs font-black uppercase tracking-[0.12em] text-indigo-700">
                  <Megaphone size={13} strokeWidth={2.2} />
                  Campaigns
                </p>
                <p className="mt-2 text-xl font-black text-slate-950">{stats.campaigns}</p>
              </div>
            </div>
          </div>
        </div>

        {agencies.length ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {agencies.map((agency, index) => (
              <AgencyDetailCard key={agency.id} agency={agency} index={index} />
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-sky-100 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500">
            No agencies assigned to this brand yet.
          </p>
        )}
      </section>
    </div>
  );
};

const OverviewPage = () => {
  const [brands, setBrands] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const data = await businessDataApi.getBrands();
      setBrands(data.brands);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    businessDataApi
      .getBrands()
      .then((data) => {
        if (isMounted) {
          setBrands(data.brands);
          setError('');
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div>
      <DashboardHeader
        title="Overview"
        description="Review brand-level agency assignments and placeholder advertising performance."
        action={
          <button
            type="button"
            onClick={loadOverview}
            className="h-11 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
          >
            Refresh
          </button>
        }
      />

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      {loading ? (
        <DashboardPanel title="Brands">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-52 animate-pulse rounded-xl bg-sky-50" />
            ))}
          </div>
        </DashboardPanel>
      ) : selectedBrand ? (
        <SelectedBrandView
          brand={selectedBrand}
          brands={brands}
          onBack={() => setSelectedBrandId(null)}
          onSelectBrand={setSelectedBrandId}
          selectedBrandId={selectedBrandId}
        />
      ) : brands.length ? (
        <DashboardPanel title="Brands">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {brands.map((brand) => (
              <BrandCard key={brand.id} brand={brand} onSelect={setSelectedBrandId} />
            ))}
          </div>
        </DashboardPanel>
      ) : (
        <DashboardPanel title="Brands">
          <p className="rounded-xl border border-dashed border-sky-100 bg-sky-50/60 px-5 py-8 text-center text-sm font-semibold text-slate-500">
            No brands added yet.
          </p>
        </DashboardPanel>
      )}
    </div>
  );
};

export default OverviewPage;
