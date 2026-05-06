import { useState } from 'react';

const ResetPasswordForm = ({ onSubmit, onBack, loading }) => {
  const [passwords, setPasswords] = useState({
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');

  const updateField = (field, value) => {
    setPasswords((current) => ({
      ...current,
      [field]: value,
    }));
    setError('');
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (passwords.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (passwords.password !== passwords.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    onSubmit(passwords.password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="new-password" className="text-sm font-semibold text-slate-700">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          value={passwords.password}
          onChange={(event) => updateField('password', event.target.value)}
          required
          className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          placeholder="Minimum 8 characters"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="confirm-password" className="text-sm font-semibold text-slate-700">
          Confirm password
        </label>
        <input
          id="confirm-password"
          type="password"
          value={passwords.confirmPassword}
          onChange={(event) => updateField('confirmPassword', event.target.value)}
          required
          className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          placeholder="Retype password"
        />
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-12 flex-1 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={loading}
          className="h-12 flex-1 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white shadow-lg shadow-sky-200 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? 'Saving...' : 'Save password'}
        </button>
      </div>
    </form>
  );
};

export default ResetPasswordForm;
