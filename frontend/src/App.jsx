import { useEffect, useState } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AppRouter from './app/router/AppRouter';
import { AuthProvider, USER_ROLES, useAuth } from './features/auth/hooks/useAuth';
import { settingsApi } from './features/settings/api/settingsApi';

const maintenanceAnimationStyles = `
  @keyframes maintenanceFloat {
    0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
    50% { transform: translate3d(0, -18px, 0) scale(1.04); }
  }

  @keyframes maintenanceSweep {
    0% { transform: translateX(-120%); opacity: 0; }
    30% { opacity: 1; }
    100% { transform: translateX(120%); opacity: 0; }
  }

  @keyframes maintenancePulseRing {
    0% { transform: scale(0.84); opacity: 0.75; }
    80%, 100% { transform: scale(1.32); opacity: 0; }
  }

  @keyframes maintenanceDot {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
    40% { transform: translateY(-7px); opacity: 1; }
  }

  .maintenance-float-slow { animation: maintenanceFloat 9s ease-in-out infinite; }
  .maintenance-float-fast { animation: maintenanceFloat 6s ease-in-out infinite reverse; }
  .maintenance-sweep { animation: maintenanceSweep 3.6s ease-in-out infinite; }
  .maintenance-ring { animation: maintenancePulseRing 2.2s cubic-bezier(0.2, 0.8, 0.2, 1) infinite; }
  .maintenance-dot { animation: maintenanceDot 1.3s ease-in-out infinite; }
`;

const MaintenanceLoading = () => (
  <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#e0f2fe,transparent_35%),linear-gradient(135deg,#f8fafc,#e0f2fe_45%,#dbeafe)] px-6">
    <div className="rounded-3xl border border-white/80 bg-white/90 px-8 py-6 text-center shadow-2xl shadow-sky-200/60 backdrop-blur">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-600">Checking system</p>
      <p className="mt-2 text-lg font-black text-slate-950">Preparing workspace access</p>
    </div>
  </div>
);

const MaintenanceScreen = ({ maintenance }) => (
  <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef6f8] px-5 py-10 text-slate-950">
    <style>{maintenanceAnimationStyles}</style>
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(14,165,233,0.22),transparent_32%),radial-gradient(circle_at_82%_18%,rgba(132,204,22,0.2),transparent_28%),linear-gradient(135deg,#f8fafc_0%,#ecfeff_45%,#e0f2fe_100%)]" />
    <div className="maintenance-float-slow absolute -left-20 top-16 h-72 w-72 rounded-full bg-sky-300/35 blur-3xl" />
    <div className="maintenance-float-fast absolute -right-16 bottom-8 h-80 w-80 rounded-full bg-lime-300/30 blur-3xl" />
    <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/80 to-transparent" />
    <div className="absolute inset-x-8 bottom-10 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />

    <div className="relative grid w-full max-w-5xl items-center gap-8 rounded-[2.25rem] border border-white/80 bg-white/82 p-6 shadow-2xl shadow-sky-200/60 backdrop-blur-xl sm:p-9 lg:grid-cols-[0.88fr_1.12fr]">
      <div className="relative mx-auto flex h-64 w-64 items-center justify-center sm:h-72 sm:w-72">
        <div className="maintenance-ring absolute h-52 w-52 rounded-full border border-sky-300/70" />
        <div className="maintenance-ring absolute h-52 w-52 rounded-full border border-lime-300/70 [animation-delay:0.7s]" />
        <div className="absolute h-48 w-48 rounded-full bg-gradient-to-br from-slate-950 via-slate-800 to-sky-950 shadow-2xl shadow-slate-300" />
        <div className="absolute h-36 w-36 rounded-full border border-white/20 bg-white/10 backdrop-blur" />
        <div className="absolute h-24 w-24 rounded-full bg-white shadow-inner shadow-slate-300" />
        <div className="absolute text-center">
          <p className="text-[0.62rem] font-black uppercase tracking-[0.28em] text-sky-700">System</p>
          <p className="mt-1 text-2xl font-black text-slate-950">Pause</p>
        </div>
        <div className="maintenance-float-fast absolute left-5 top-8 h-5 w-5 rounded-full bg-lime-400 shadow-lg shadow-lime-200" />
        <div className="maintenance-float-slow absolute bottom-9 right-4 h-3 w-3 rounded-full bg-sky-500 shadow-lg shadow-sky-200" />
      </div>

      <div>
        <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-sky-100 bg-sky-50 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-sky-700 shadow-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-500 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-600" />
          </span>
          Maintenance break
        </div>
        <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-6xl">
          {maintenance?.title || 'Maintenance break'}
        </h1>
        <p className="mt-5 max-w-2xl text-lg font-semibold leading-8 text-slate-600">
          {maintenance?.message || 'We are improving Meta Account Manager right now. Please check back shortly.'}
        </p>

        <div className="mt-8 overflow-hidden rounded-3xl border border-sky-100 bg-sky-50/80 p-5 shadow-inner shadow-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Current status</p>
              <p className="mt-2 text-base font-black text-slate-900">
                {maintenance?.etaLabel || 'We will be back soon'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 shadow-sm">
              <span className="maintenance-dot h-2 w-2 rounded-full bg-sky-500" />
              <span className="maintenance-dot h-2 w-2 rounded-full bg-sky-500 [animation-delay:0.16s]" />
              <span className="maintenance-dot h-2 w-2 rounded-full bg-sky-500 [animation-delay:0.32s]" />
            </div>
          </div>
          <div className="relative mt-5 h-2 overflow-hidden rounded-full bg-white">
            <div className="maintenance-sweep absolute inset-y-0 w-2/3 rounded-full bg-gradient-to-r from-transparent via-sky-500 to-transparent" />
          </div>
        </div>

        <div className="mt-8">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-2xl border border-sky-100 bg-white px-5 py-3 text-sm font-black text-sky-700 shadow-lg shadow-sky-100 transition hover:-translate-y-0.5 hover:bg-sky-50 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-sky-100"
          >
            Check again
          </button>
        </div>
      </div>
    </div>
  </div>
);

const MaintenanceGate = ({ children }) => {
  const location = useLocation();
  const { initializing, user, hasRole } = useAuth();
  const [maintenance, setMaintenance] = useState(null);
  const [loading, setLoading] = useState(true);
  const isSuperAdmin = hasRole([USER_ROLES.SUPER_ADMIN]);

  useEffect(() => {
    let mounted = true;

    const loadMaintenance = () => {
      settingsApi
        .getMaintenanceStatus()
        .then((data) => {
          if (mounted) {
            setMaintenance(data.maintenance || { enabled: false });
          }
        })
        .catch(() => {
          if (mounted) {
            setMaintenance({ enabled: false });
          }
        })
        .finally(() => {
          if (mounted) {
            setLoading(false);
          }
        });
    };

    loadMaintenance();
    const intervalId = window.setInterval(loadMaintenance, 30000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  if (initializing || loading) {
    return <MaintenanceLoading />;
  }

  const loginAllowedForSuperAdmin = location.pathname === '/login' && !user;

  if (maintenance?.enabled && !isSuperAdmin && !loginAllowedForSuperAdmin) {
    return <MaintenanceScreen maintenance={maintenance} />;
  }

  return children;
};

const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MaintenanceGate>
          <AppRouter />
        </MaintenanceGate>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3200,
            style: {
              borderRadius: '12px',
              border: '1px solid #dbeafe',
              background: '#ffffff',
              color: '#0f172a',
              boxShadow: '0 18px 55px rgba(15, 23, 42, 0.14)',
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
