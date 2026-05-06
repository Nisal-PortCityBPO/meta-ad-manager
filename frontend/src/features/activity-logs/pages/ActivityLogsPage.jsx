import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { useActivityLogs } from '../hooks/useActivityLogs';

const formatDate = (value) => {
  if (!value) {
    return 'Not available';
  }

  return new Date(value).toLocaleString();
};

const ActivityLogsPage = () => {
  const { logs, loading, error, reload } = useActivityLogs();

  return (
    <div>
      <DashboardHeader
        title="Activity Logs"
        description="Review account and admin actions across the dashboard."
        action={
          <button
            type="button"
            onClick={reload}
            className="h-11 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
          >
            Refresh
          </button>
        }
      />

      {error ? <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <DashboardPanel>
        {loading ? (
          <div className="h-80 animate-pulse rounded-2xl bg-sky-50" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-sky-50">
                <thead className="bg-sky-50/70">
                  <tr>
                    {['Actor', 'Action', 'Entity', 'Date'].map((heading) => (
                      <th key={heading} className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-50">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-5 py-4">
                        <p className="font-black text-slate-950">{log.actorName}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{log.actorEmail}</p>
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-slate-700">{log.action.replaceAll('_', ' ')}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-500">{log.entity}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-500">{formatDate(log.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!logs.length ? <p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">No activity logs found.</p> : null}
          </div>
        )}
      </DashboardPanel>
    </div>
  );
};

export default ActivityLogsPage;
