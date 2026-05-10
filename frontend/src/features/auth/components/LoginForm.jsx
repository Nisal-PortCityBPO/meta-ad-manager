import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const LoginForm = ({ onSubmit, onForgotPassword, loading }) => {
  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-semibold text-slate-700">
          Email address
        </label>
        <input
          id="email"
          type="email"
          value={form.email}
          onChange={(event) => updateField('email', event.target.value)}
          required
          className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          placeholder="admin@example.com"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="password" className="text-sm font-semibold text-slate-700">
            Password
          </label>
          {/* <button
            type="button"
            onClick={onForgotPassword}
            className="text-sm font-semibold text-sky-700 transition hover:text-sky-900"
          >
            Forgot password?
          </button> */}
        </div>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={form.password}
            onChange={(event) => updateField('password', event.target.value)}
            required
            className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 pr-12 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            placeholder="Enter password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-100"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={18} strokeWidth={2.2} /> : <Eye size={18} strokeWidth={2.2} />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="h-12 w-full rounded-xl bg-sky-600 px-4 text-sm font-bold text-white shadow-lg shadow-sky-200 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
};

export default LoginForm;
