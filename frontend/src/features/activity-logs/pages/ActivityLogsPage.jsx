import { Fragment, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Filter, RefreshCw, Trash2, X } from 'lucide-react';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import { useActivityLogs } from '../hooks/useActivityLogs';

const formatDate = (value) => {
  if (!value) {
    return 'Not available';
  }

  return new Date(value).toLocaleString();
};

const pageSizes = [25, 50, 100];

const formatJson = (value) => {
  if (!value || (typeof value === 'object' && !Object.keys(value).length)) {
    return '{}';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const detailValue = (value) => {
  if (value === undefined || value === null || value === '') {
    return 'Not available';
  }

  return String(value);
};

const ActivityLogsPage = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [expandedLogIds, setExpandedLogIds] = useState(() => new Set());
  const [filters, setFilters] = useState({
    actorEmail: '',
    entity: '',
    dateFrom: '',
    dateTo: '',
  });
  const { deleteOldestLogs, deleting, filterOptions, logs, loading, error, pagination, reload } = useActivityLogs({
    page,
    limit,
    ...filters,
  });

  const updateFilter = (field, value) => {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({
      actorEmail: '',
      entity: '',
      dateFrom: '',
      dateTo: '',
    });
    setPage(1);
  };

  const handleLimitChange = (value) => {
    setLimit(Number(value));
    setPage(1);
  };

  const handleDeleteOldestLogs = async () => {
    const confirmed = window.confirm(
      'Permanently delete the oldest 100 activity logs? This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    try {
      const data = await deleteOldestLogs();
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
    }
  };

  const visibleStart = pagination.total ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const visibleEnd = Math.min(pagination.page * pagination.limit, pagination.total);
  const allVisibleExpanded = logs.length > 0 && logs.every((log) => expandedLogIds.has(log.id));

  const toggleLogDetails = (logId) => {
    setExpandedLogIds((current) => {
      const next = new Set(current);

      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }

      return next;
    });
  };

  const toggleAllVisibleDetails = () => {
    setExpandedLogIds((current) => {
      const next = new Set(current);

      if (allVisibleExpanded) {
        logs.forEach((log) => next.delete(log.id));
      } else {
        logs.forEach((log) => next.add(log.id));
      }

      return next;
    });
  };

  return (
    <div>
      <DashboardHeader
        title="Activity Logs"
        description="Review account and admin actions across the dashboard."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDeleteOldestLogs}
              disabled={deleting}
              className="flex h-11 items-center gap-2 rounded-xl border border-red-100 bg-white px-4 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-70"
            >
              <Trash2 size={17} strokeWidth={2.2} />
              {deleting ? 'Deleting...' : 'Delete oldest 100'}
            </button>
            <button
              type="button"
              onClick={reload}
              className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
            >
              <RefreshCw size={17} strokeWidth={2.2} />
              Refresh
            </button>
          </div>
        }
      />

      {error ? <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <DashboardPanel title="Filters">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_160px_160px_120px_auto]">
          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Actor</span>
            <select
              value={filters.actorEmail}
              onChange={(event) => updateFilter('actorEmail', event.target.value)}
              className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              <option value="">All actors</option>
              {filterOptions.actors.map((actor) => (
                <option key={actor.email} value={actor.email}>
                  {actor.name && actor.name !== 'System' ? `${actor.name} (${actor.email})` : actor.email}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Entity</span>
            <select
              value={filters.entity}
              onChange={(event) => updateFilter('entity', event.target.value)}
              className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              <option value="">All entities</option>
              {filterOptions.entities.map((entity) => (
                <option key={entity} value={entity}>
                  {entity}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">From</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => updateFilter('dateFrom', event.target.value)}
              className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">To</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => updateFilter('dateTo', event.target.value)}
              className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">Rows</span>
            <select
              value={limit}
              onChange={(event) => handleLimitChange(event.target.value)}
              className="h-11 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={clearFilters}
              className="flex h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
            >
              <X size={16} strokeWidth={2.2} />
              Clear
            </button>
          </div>
        </div>
      </DashboardPanel>

      <DashboardPanel className="mt-4">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
            <Filter size={17} strokeWidth={2.2} className="text-sky-600" />
            Showing {visibleStart}-{visibleEnd} of {pagination.total} logs
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleAllVisibleDetails}
              disabled={!logs.length || loading}
              className="flex h-10 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-50"
            >
              {allVisibleExpanded ? <ChevronUp size={16} strokeWidth={2.2} /> : <ChevronDown size={16} strokeWidth={2.2} />}
              {allVisibleExpanded ? 'Collapse details' : 'Expand details'}
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={!pagination.hasPrevious || loading}
              className="flex h-10 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-50"
            >
              <ChevronLeft size={16} strokeWidth={2.2} />
              Previous
            </button>
            <span className="min-w-24 text-center text-sm font-black text-slate-700">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={!pagination.hasNext || loading}
              className="flex h-10 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-50"
            >
              Next
              <ChevronRight size={16} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="h-80 animate-pulse rounded-2xl bg-sky-50" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-sky-50">
                <thead className="bg-sky-50/70">
                  <tr>
                    {['Actor', 'Action', 'Entity', 'Date', 'Details'].map((heading) => (
                      <th key={heading} className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-50">
                  {logs.map((log) => {
                    const isExpanded = expandedLogIds.has(log.id);
                    const requestDetails = [
                      ['Log ID', log.id],
                      ['Actor ID', log.actorId],
                      ['Actor role', log.actorRole],
                      ['Entity ID', log.entityId],
                      ['IP address', log.ipAddress],
                      ['Request method', log.requestMethod],
                      ['Request path', log.requestPath],
                      ['User agent', log.userAgent],
                      ['Created at', formatDate(log.createdAt)],
                      ['Updated at', formatDate(log.updatedAt)],
                    ];

                    return (
                      <Fragment key={log.id}>
                        <tr className="align-top">
                          <td className="px-5 py-4">
                            <p className="font-black text-slate-950">{log.actorName}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-500">{log.actorEmail}</p>
                            {log.actorRole ? (
                              <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-sky-700">{log.actorRole}</p>
                            ) : null}
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-black text-slate-800">{log.action.replaceAll('_', ' ')}</p>
                            <p className="mt-1 font-mono text-xs font-semibold text-slate-400">{log.action}</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-black text-slate-700">{log.entity}</p>
                            {log.entityId ? <p className="mt-1 break-all text-xs font-semibold text-slate-400">{log.entityId}</p> : null}
                          </td>
                          <td className="px-5 py-4 text-sm font-semibold text-slate-500">{formatDate(log.createdAt)}</td>
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() => toggleLogDetails(log.id)}
                              className="flex h-10 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-sky-50"
                            >
                              {isExpanded ? <ChevronUp size={16} strokeWidth={2.2} /> : <ChevronDown size={16} strokeWidth={2.2} />}
                              {isExpanded ? 'Hide' : 'View'}
                            </button>
                          </td>
                        </tr>

                        {isExpanded ? (
                          <tr>
                            <td colSpan={5} className="bg-sky-50/40 px-5 py-5">
                              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                                <div className="rounded-2xl border border-sky-100 bg-white p-4">
                                  <h4 className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Request and entity details</h4>
                                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    {requestDetails.map(([label, value]) => (
                                      <div key={label} className="rounded-xl border border-sky-50 bg-sky-50/60 px-3 py-2">
                                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-sky-700">{label}</p>
                                        <p className="mt-1 break-words text-sm font-semibold text-slate-700">{detailValue(value)}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-sky-100 bg-white p-4">
                                  <h4 className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Full metadata</h4>
                                  <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs font-semibold leading-5 text-sky-50">{formatJson(log.metadata)}</pre>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
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
