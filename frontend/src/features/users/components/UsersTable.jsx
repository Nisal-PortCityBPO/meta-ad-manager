const roleLabel = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
};

const UsersTable = ({ users, onResetPassword, onStatusChange, loading }) => {
  return (
    <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-sky-50">
          <thead className="bg-sky-50/70">
            <tr>
              {['Name', 'Role', 'Status', 'Last login', 'Actions'].map((heading) => (
                <th key={heading} className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sky-50">
            {users.map((user) => (
              <tr key={user.id} className="align-middle">
                <td className="px-5 py-4">
                  <p className="font-black text-slate-950">{user.name}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{user.email}</p>
                </td>
                <td className="px-5 py-4 text-sm font-bold text-slate-700">{roleLabel[user.role] || user.role}</td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${
                      user.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {user.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-slate-500">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Not yet'}
                </td>
                <td className="px-5 py-4">
                  {user.role === 'ADMIN' ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => onStatusChange(user.id, user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}
                        className="h-10 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-70"
                      >
                        {user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => onResetPassword(user)}
                        className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-70"
                      >
                        Reset Password
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm font-semibold text-slate-400">Locked</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!users.length ? <p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">No users found.</p> : null}
    </div>
  );
};

export default UsersTable;
