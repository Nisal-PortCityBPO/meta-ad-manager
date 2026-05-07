import { useCallback, useEffect, useState } from 'react';
import { activityLogsApi } from '../api/activityLogsApi';

const defaultPagination = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 1,
  hasPrevious: false,
  hasNext: false,
};

const defaultFilterOptions = {
  actors: [],
  entities: [],
};

export const useActivityLogs = (query) => {
  const { actorEmail, dateFrom, dateTo, entity, limit, page } = query;
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState(defaultPagination);
  const [filterOptions, setFilterOptions] = useState(defaultFilterOptions);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await activityLogsApi.getLogs({ actorEmail, dateFrom, dateTo, entity, limit, page });
      setLogs(data.logs);
      setPagination(data.pagination || defaultPagination);
      setFilterOptions(data.filterOptions || defaultFilterOptions);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [actorEmail, dateFrom, dateTo, entity, limit, page]);

  const deleteOldestLogs = async () => {
    setDeleting(true);
    try {
      const data = await activityLogsApi.deleteOldestLogs();
      await loadLogs();
      return data;
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    activityLogsApi
      .getLogs({ actorEmail, dateFrom, dateTo, entity, limit, page })
      .then((data) => {
        if (isMounted) {
          setLogs(data.logs);
          setPagination(data.pagination || defaultPagination);
          setFilterOptions(data.filterOptions || defaultFilterOptions);
          setError('');
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [actorEmail, dateFrom, dateTo, entity, limit, page]);

  return {
    deleteOldestLogs,
    deleting,
    error,
    filterOptions,
    loading,
    logs,
    pagination,
    reload: loadLogs,
  };
};
