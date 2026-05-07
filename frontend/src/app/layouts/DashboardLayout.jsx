import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BarChart3, Bell, ClipboardList, KeyRound, LayoutDashboard, LogOut, UserCircle, Users } from 'lucide-react';
import { USER_ROLES, useAuth } from '../../features/auth/hooks/useAuth';
import brandLogo from '../../assets/200m-logo.png';

const navItemsConfig = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/overview', label: 'Overview', icon: BarChart3 },
  { to: '/ads-launch', label: 'Ads Launch', icon: Megaphone, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
  { to: '/tokens', label: 'Token Management', icon: KeyRound, roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN] },
  { to: '/users', label: 'Users', icon: Users, roles: [USER_ROLES.SUPER_ADMIN] },
  { to: '/activity-logs', label: 'Activity Logs', icon: ClipboardList, roles: [USER_ROLES.SUPER_ADMIN] },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/profile', label: 'Profile', icon: UserCircle },
];

const DashboardLayout = () => {
  const navigate = useNavigate();
  const { user, logout, hasRole } = useAuth();
  const navItems = navItemsConfig.filter((item) => !item.roles || hasRole(item.roles));

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-sky-50 to-blue-100 text-slate-900 lg:flex">
      <aside className="border-b border-sky-100 bg-white/85 px-4 py-4 shadow-sm backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-lg shadow-sky-200 ring-1 ring-sky-100">
            <img src={brandLogo} alt="200M logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-lg font-black text-slate-950">Account Manager</p>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>

        <nav className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-bold transition',
                  isActive
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-200'
                    : 'text-slate-600 hover:bg-sky-50 hover:text-slate-950',
                ].join(' ')
              }
            >
              {({ isActive }) => {
                const Icon = item.icon;

                return (
                  <>
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        isActive ? 'bg-white/20' : 'bg-sky-50 text-sky-700'
                      }`}
                    >
                      <Icon size={18} strokeWidth={2.2} />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </>
                );
              }}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-sky-100 bg-white/80 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">Signed in as</p>
              <h1 className="text-xl font-black text-slate-950">{user?.name}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/notifications')}
                className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
              >
                <Bell size={17} strokeWidth={2.2} />
                Notifications
              </button>
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
              >
                <UserCircle size={17} strokeWidth={2.2} />
                Profile
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                <LogOut size={17} strokeWidth={2.2} />
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="w-full px-3 py-4 sm:px-4 lg:px-4 lg:py-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
