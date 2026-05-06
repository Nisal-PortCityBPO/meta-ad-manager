import { useEffect, useState } from 'react';
import { activityLogsApi } from '../api/activityLogsApi';

export const useActivityLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await activityLogsApi.getLogs();
      setLogs(data.logs);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    activityLogsApi
      .getLogs()
      .then((data) => {
        if (isMounted) {
          setLogs(data.logs);
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
  }, []);

  return {
    error,
    loading,
    logs,
    reload: loadLogs,
  };
};
