import { useState } from 'react';

const ForgotPasswordForm = ({ onSubmit, onBack, loading, initialEmail = '' }) => {
  const [email, setEmail] = useState(initialEmail);

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(email);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="reset-email" className="text-sm font-semibold text-slate-700">
          Account email
        </label>
        <input
          id="reset-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          placeholder="admin@example.com"
        />
      </div>

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
          {loading ? 'Sending...' : 'Send OTP'}
        </button>
      </div>
    </form>
  );
};

export default ForgotPasswordForm;
