import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../api/authApi';
import LoginForm from '../components/LoginForm';
import ForgotPasswordForm from '../components/ForgotPasswordForm';
import ResetPasswordForm from '../components/ResetPasswordForm';
import { useAuth } from '../hooks/useAuth';
import brandLogo from '../../../assets/200m-logo.png';

const copyByMode = {
  login: {
    eyebrow: 'Secure access',
    title: 'Welcome back',
    description: 'Sign in to continue to the Meta Account Manager.',
  },
  forgot: {
    eyebrow: 'Password recovery',
    title: 'Verify your email',
    description: 'Enter the account email and continue with the 6 digit OTP.',
  },
  otp: {
    eyebrow: 'OTP verification',
    title: 'Enter the code',
    description: 'Use the OTP from the reset request to continue.',
  },
  reset: {
    eyebrow: 'New password',
    title: 'Create a new password',
    description: 'Choose a new password for this account.',
  },
};

const LoginPage = ({ initialMode = 'login' }) => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [resetToken, setResetToken] = useState('');

  const panelCopy = useMemo(() => copyByMode[mode], [mode]);

  const handleLogin = async (credentials) => {
    setLoading(true);
    try {
      await login(credentials);
      toast.success('Login successful');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (email) => {
    setLoading(true);
    try {
      const result = await authApi.forgotPassword({ email });
      setResetEmail(email);
      setDevOtp(result.devOtp || '');
      setMode('otp');
      toast.success(result.message);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await authApi.verifyOtp({
        email: resetEmail,
        otp,
      });
      setResetToken(result.resetToken);
      setMode('reset');
      toast.success(result.message);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (password) => {
    setLoading(true);
    try {
      await authApi.resetPassword({
        email: resetEmail,
        resetToken,
        password,
      });
      toast.success('Password reset completed');
      setMode('login');
      setOtp('');
      setResetToken('');
      setDevOtp('');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-white via-sky-50 to-blue-100 px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-[2rem] border border-white/80 bg-white/80 shadow-2xl shadow-sky-200/60 backdrop-blur lg:grid-cols-[minmax(0,0.92fr)_480px]">
          <div className="hidden min-h-[640px] bg-gradient-to-br from-sky-600 via-sky-500 to-blue-400 p-8 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="mb-10 flex h-20 w-20 items-center justify-center rounded-3xl bg-white p-3 shadow-lg shadow-sky-700/20">
                <img src={brandLogo} alt="200M logo" className="h-full w-full object-contain" />
              </div>
              <p className="text-sm font-bold uppercase tracking-[0.28em] text-sky-100">Meta Account Manager</p>
              <h1 className="mt-5 max-w-xs text-4xl font-black leading-tight">
                Operational access with calm control.
              </h1>
            </div>
            <div className="grid gap-4">
              {['Morning handover', 'Inventory desk', 'Quality checks'].map((item) => (
                <div key={item} className="rounded-2xl border border-white/20 bg-white/15 p-4 shadow-lg shadow-sky-700/10">
                  <p className="text-sm font-bold">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex min-h-[640px] items-center justify-center p-6 sm:p-10">
            <div className="w-full max-w-[440px]">
              <div className="mb-8">
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-sky-600">{panelCopy.eyebrow}</p>
                <h2 className="mt-3 text-3xl font-black text-slate-950">{panelCopy.title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-500">{panelCopy.description}</p>
              </div>

              {mode === 'login' ? (
                <LoginForm onSubmit={handleLogin} onForgotPassword={() => setMode('forgot')} loading={loading} />
              ) : null}

              {mode === 'forgot' ? (
                <ForgotPasswordForm
                  initialEmail={resetEmail}
                  onSubmit={handleForgotPassword}
                  onBack={() => setMode('login')}
                  loading={loading}
                />
              ) : null}

              {mode === 'otp' ? (
                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  {devOtp ? (
                    <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Demo OTP</p>
                      <p className="mt-1 text-2xl font-black tracking-[0.2em] text-slate-950">{devOtp}</p>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <label htmlFor="otp" className="text-sm font-semibold text-slate-700">
                      6 digit OTP
                    </label>
                    <input
                      id="otp"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      minLength={6}
                      maxLength={6}
                      className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 text-center text-lg font-black tracking-[0.35em] text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      placeholder="000000"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="h-12 flex-1 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading || otp.length !== 6}
                      className="h-12 flex-1 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white shadow-lg shadow-sky-200 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {loading ? 'Checking...' : 'Verify'}
                    </button>
                  </div>
                </form>
              ) : null}

              {mode === 'reset' ? (
                <ResetPasswordForm onSubmit={handleResetPassword} onBack={() => setMode('otp')} loading={loading} />
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default LoginPage;
