import { Eye, EyeOff, KeyRound, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';

const PasswordInput = ({ label, value, onChange, placeholder }) => {
  const [visible, setVisible] = useState(false);

  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <span className="relative">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 pr-12 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-sky-50 hover:text-sky-700"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={17} strokeWidth={2.2} /> : <Eye size={17} strokeWidth={2.2} />}
        </button>
      </span>
    </label>
  );
};

const ResetAdminPasswordModal = ({
  loading,
  onClose,
  onResetPassword,
  onVerifySuperAdminPassword,
  user,
}) => {
  const [step, setStep] = useState('verify');
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  if (!user) {
    return null;
  }

  const verifyPassword = async (event) => {
    event.preventDefault();
    await onVerifySuperAdminPassword(superAdminPassword);
    setStep('reset');
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    await onResetPassword({
      newPassword,
      superAdminPassword,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-2xl shadow-sky-200/70">
        <div className="flex items-start justify-between gap-4 border-b border-sky-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <KeyRound size={20} strokeWidth={2.3} />
            </span>
            <div>
              <h2 className="text-lg font-black text-slate-950">Reset admin password</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{user.name} - {user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-red-700">
            <div className="flex gap-3">
              <TriangleAlert size={19} strokeWidth={2.3} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-black">Warning!</p>
                <p className="mt-1 text-sm font-semibold leading-5">
                  If you do this admin password will change and he cannot access the system until you give the new password.
                </p>
              </div>
            </div>
          </div>

          {step === 'verify' ? (
            <form className="grid gap-5" onSubmit={verifyPassword}>
              <PasswordInput
                label="Super Admin Password"
                value={superAdminPassword}
                onChange={setSuperAdminPassword}
                placeholder="Confirm your password"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !superAdminPassword}
                  className="h-11 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  Verify
                </button>
              </div>
            </form>
          ) : (
            <form className="grid gap-5" onSubmit={resetPassword}>
              <PasswordInput
                label={`New Password for ${user.name} (${user.email})`}
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Enter new admin password"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStep('verify')}
                  className="h-11 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || newPassword.length < 8}
                  className="h-11 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-60"
                >
                  Save new password
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetAdminPasswordModal;
