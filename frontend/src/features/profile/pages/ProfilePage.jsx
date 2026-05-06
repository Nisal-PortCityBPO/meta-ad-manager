import { useState } from 'react';
import toast from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { useAuth } from '../../auth/hooks/useAuth';
import { profileApi } from '../api/profileApi';
import { useProfile } from '../hooks/useProfile';

const PasswordField = ({ id, label, value, visible, onToggle, onChange, placeholder }) => {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-semibold text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 pr-12 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          placeholder={placeholder}
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-100"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          title={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <EyeOff size={18} strokeWidth={2.2} /> : <Eye size={18} strokeWidth={2.2} />}
        </button>
      </div>
    </div>
  );
};

const ProfilePage = () => {
  const { refreshUser } = useAuth();
  const { profile, loading, error, setProfile } = useProfile();
  const [name, setName] = useState(null);
  const [email, setEmail] = useState(null);
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [visiblePasswords, setVisiblePasswords] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [passwordError, setPasswordError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const updatePassword = (field, value) => {
    setPasswords((current) => ({
      ...current,
      [field]: value,
    }));
    setPasswordError('');
  };

  const togglePasswordVisibility = (field) => {
    setVisiblePasswords((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const data = await profileApi.updateProfile({
        name: name ?? profile?.name ?? '',
        email: email ?? profile?.email ?? '',
      });
      setProfile(data.user);
      setName(data.user.name);
      setEmail(data.user.email);
      await refreshUser();
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const validatePasswordForm = () => {
    if (!passwords.currentPassword || !passwords.newPassword || !passwords.confirmPassword) {
      return 'All password fields are required';
    }

    if (passwords.newPassword.length < 8) {
      return 'New password must be at least 8 characters';
    }

    if (passwords.newPassword !== passwords.confirmPassword) {
      return 'New password and re-entered password do not match';
    }

    if (passwords.currentPassword === passwords.newPassword) {
      return 'New password must be different from the current password';
    }

    return '';
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();

    const validationMessage = validatePasswordForm();
    if (validationMessage) {
      setPasswordError(validationMessage);
      return;
    }

    setSavingPassword(true);
    try {
      const data = await profileApi.changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordError('');
      toast.success(data.message);
    } catch (requestError) {
      setPasswordError(requestError.message);
      toast.error(requestError.message);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div>
      <DashboardHeader title="Profile" description="Keep your account name, email, and password current." />

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <DashboardPanel title="Account">
          {loading ? (
            <div className="h-48 animate-pulse rounded-xl bg-sky-50" />
          ) : (
            <div className="space-y-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-sky-100 text-2xl font-black text-sky-700">
                {profile?.name
                  ?.split(' ')
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div>
                <p className="text-2xl font-black text-slate-950">{profile?.name}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{profile?.email}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-sky-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Role</p>
                  <p className="mt-2 font-black text-slate-950">{profile?.role?.replace('_', ' ')}</p>
                </div>
                <div className="rounded-xl bg-sky-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Status</p>
                  <p className="mt-2 font-black text-slate-950">{profile?.status}</p>
                </div>
              </div>
            </div>
          )}
        </DashboardPanel>

        <div className="space-y-4">
          <DashboardPanel title="Edit profile">
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="profile-name" className="text-sm font-semibold text-slate-700">
                  User name
                </label>
                <input
                  id="profile-name"
                  value={name ?? profile?.name ?? ''}
                  onChange={(event) => setName(event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="profile-email" className="text-sm font-semibold text-slate-700">
                  Email address
                </label>
                <input
                  id="profile-email"
                  type="email"
                  value={email ?? profile?.email ?? ''}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="h-11 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-70"
              >
                {savingProfile ? 'Saving...' : 'Save profile'}
              </button>
            </form>
          </DashboardPanel>

          <DashboardPanel title="Change password">
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <PasswordField
                id="current-password"
                label="Current password"
                value={passwords.currentPassword}
                visible={visiblePasswords.currentPassword}
                onToggle={() => togglePasswordVisibility('currentPassword')}
                onChange={(value) => updatePassword('currentPassword', value)}
                placeholder="Enter current password"
              />

              <PasswordField
                id="new-profile-password"
                label="New password"
                value={passwords.newPassword}
                visible={visiblePasswords.newPassword}
                onToggle={() => togglePasswordVisibility('newPassword')}
                onChange={(value) => updatePassword('newPassword', value)}
                placeholder="Minimum 8 characters"
              />

              <PasswordField
                id="confirm-profile-password"
                label="Re-enter new password"
                value={passwords.confirmPassword}
                visible={visiblePasswords.confirmPassword}
                onToggle={() => togglePasswordVisibility('confirmPassword')}
                onChange={(value) => updatePassword('confirmPassword', value)}
                placeholder="Retype new password"
              />

              {passwordError ? (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{passwordError}</p>
              ) : null}

              <button
                type="submit"
                disabled={savingPassword}
                className="h-11 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-70"
              >
                {savingPassword ? 'Updating...' : 'Update password'}
              </button>
            </form>
          </DashboardPanel>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
