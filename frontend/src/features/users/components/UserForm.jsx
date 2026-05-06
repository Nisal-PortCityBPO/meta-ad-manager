import { useState } from 'react';

const initialForm = {
  name: '',
  email: '',
  password: '',
};

const UserForm = ({ onSubmit, loading }) => {
  const [form, setForm] = useState(initialForm);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit(form);
    setForm(initialForm);
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-2">
        <label htmlFor="admin-name" className="text-sm font-semibold text-slate-700">
          Admin name
        </label>
        <input
          id="admin-name"
          value={form.name}
          onChange={(event) => updateField('name', event.target.value)}
          className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="admin-email" className="text-sm font-semibold text-slate-700">
          Admin email
        </label>
        <input
          id="admin-email"
          type="email"
          value={form.email}
          onChange={(event) => updateField('email', event.target.value)}
          className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="admin-password" className="text-sm font-semibold text-slate-700">
          Temporary password
        </label>
        <div className="flex gap-2">
          <input
            id="admin-password"
            type="password"
            value={form.password}
            onChange={(event) => updateField('password', event.target.value)}
            className="h-12 min-w-0 flex-1 rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="h-12 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-70"
          >
            {loading ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default UserForm;
