import { useState } from 'react';
import toast from 'react-hot-toast';
import { Edit3, Plus, Save, Trash2, X } from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { tokensApi } from '../api/tokensApi';
import { useTokens } from '../hooks/useTokens';

const emptyForm = {
  label: '',
  purpose: '',
  accessToken: '',
  status: 'ACTIVE',
};

const statusStyles = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  BLOCKED: 'bg-red-50 text-red-700',
};

const TokenManagementPage = () => {
  const { tokens, loading, error, loadTokens } = useTokens();
  const [form, setForm] = useState(emptyForm);
  const [editingToken, setEditingToken] = useState(null);
  const [saving, setSaving] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingToken(null);
  };

  const startEdit = (token) => {
    setEditingToken(token);
    setForm({
      label: token.label,
      purpose: token.purpose,
      accessToken: '',
      status: token.status,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      const payload = {
        label: form.label,
        purpose: form.purpose,
        status: form.status,
        ...(form.accessToken.trim() ? { accessToken: form.accessToken } : {}),
      };

      if (editingToken) {
        const data = await tokensApi.updateToken(editingToken.id, payload);
        toast.success(data.message);
      } else {
        const data = await tokensApi.createToken({
          ...payload,
          accessToken: form.accessToken,
        });
        toast.success(data.message);
      }

      resetForm();
      await loadTokens();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (token) => {
    const confirmed = window.confirm(`Delete token "${token.label}"?`);
    if (!confirmed) {
      return;
    }

    setSaving(true);
    try {
      const data = await tokensApi.deleteToken(token.id);
      toast.success(data.message);
      await loadTokens();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <DashboardHeader
        title="Token Management"
        description="Store and manage Meta API tokens with encrypted database storage and API call tracking."
        action={
          editingToken ? (
            <button
              type="button"
              onClick={resetForm}
              className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
            >
              <X size={17} strokeWidth={2.2} />
              Cancel edit
            </button>
          ) : null
        }
      />

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <DashboardPanel title={editingToken ? 'Edit token' : 'Add token'}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="token-label" className="text-sm font-semibold text-slate-700">
                Token label
              </label>
              <input
                id="token-label"
                value={form.label}
                onChange={(event) => updateField('label', event.target.value)}
                className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="Production Meta token"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="token-purpose" className="text-sm font-semibold text-slate-700">
                Purpose
              </label>
              <input
                id="token-purpose"
                value={form.purpose}
                onChange={(event) => updateField('purpose', event.target.value)}
                className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="Campaign insights, page messages, catalog sync"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="access-token" className="text-sm font-semibold text-slate-700">
                Access token
              </label>
              <textarea
                id="access-token"
                value={form.accessToken}
                onChange={(event) => updateField('accessToken', event.target.value)}
                className="min-h-28 w-full resize-y rounded-xl border border-sky-100 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder={editingToken ? 'Leave blank to keep the current token' : 'Paste Meta access token'}
                required={!editingToken}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="token-status" className="text-sm font-semibold text-slate-700">
                Status
              </label>
              <select
                id="token-status"
                value={form.status}
                onChange={(event) => updateField('status', event.target.value)}
                className="h-12 w-full rounded-xl border border-sky-100 bg-white px-4 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              >
                <option value="ACTIVE">Active</option>
                <option value="BLOCKED">Blocked</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-70"
              >
                {editingToken ? <Save size={17} strokeWidth={2.2} /> : <Plus size={17} strokeWidth={2.2} />}
                {saving ? 'Saving...' : editingToken ? 'Save token' : 'Add token'}
              </button>
              {editingToken ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="h-11 rounded-xl border border-sky-100 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </DashboardPanel>

        <DashboardPanel title="Saved Meta API tokens">
          {loading ? (
            <div className="h-72 animate-pulse rounded-2xl bg-sky-50" />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-sky-50">
                  <thead className="bg-sky-50/70">
                    <tr>
                      {['Token label', 'Purpose', 'Access token', 'Status', 'API calls', 'Actions'].map((heading) => (
                        <th key={heading} className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-50">
                    {tokens.map((token) => (
                      <tr key={token.id} className="align-middle">
                        <td className="px-5 py-4">
                          <p className="font-black text-slate-950">{token.label}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-400">
                            Updated {new Date(token.updatedAt).toLocaleDateString()}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-600">{token.purpose}</td>
                        <td className="px-5 py-4 font-mono text-sm font-bold text-slate-700">{token.accessToken}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${statusStyles[token.status]}`}>
                            {token.status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-black text-slate-950">{token.apiCallCount}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-400">
                            {token.lastApiCallAt ? new Date(token.lastApiCallAt).toLocaleString() : 'No calls yet'}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(token)}
                              className="flex h-10 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
                            >
                              <Edit3 size={16} strokeWidth={2.2} />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(token)}
                              disabled={saving}
                              className="flex h-10 items-center gap-2 rounded-xl border border-red-100 bg-white px-3 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-70"
                            >
                              <Trash2 size={16} strokeWidth={2.2} />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!tokens.length ? (
                <p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">No Meta API tokens saved yet.</p>
              ) : null}
            </div>
          )}
        </DashboardPanel>
      </div>
    </div>
  );
};

export default TokenManagementPage;
