import { useEffect, useState } from 'react';
import { performanceApi } from '../api/performanceApi';

export const defaultPerformanceFilters = {
  brandId: '',
  tokenId: '',
  adAccountKey: '',
  detailLevel: 'campaign',
  dateRange: 'one_week',
};

export const usePerformanceReport = (filters) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReport = async ({ showLoading = true } = {}) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const data = await performanceApi.getReport(filters);
      setReport(data);
      setError('');
      return data;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let mounted = true;

    Promise.resolve()
      .then(() => {
        if (mounted) {
          setLoading(true);
        }

        return performanceApi.getReport(filters);
      })
      .then((data) => {
        if (!mounted) {
          return;
        }

        setReport(data);
        setError('');
      })
      .catch((requestError) => {
        if (mounted) {
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [filters]);

  return {
    error,
    loading,
    reload: loadReport,
    report,
  };
};
