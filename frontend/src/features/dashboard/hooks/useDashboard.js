import { useEffect, useState } from 'react';
import { dashboardApi } from '../api/dashboardApi';

export const useDashboard = () => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const data = await dashboardApi.getDashboard();
      setDashboard(data);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    dashboardApi
      .getDashboard()
      .then((data) => {
        if (isMounted) {
          setDashboard(data);
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
    dashboard,
    error,
    loading,
    reload: loadDashboard,
  };
};
