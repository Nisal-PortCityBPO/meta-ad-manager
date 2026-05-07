import { useCallback, useEffect, useState } from 'react';
import { adsLaunchApi } from '../api/adsLaunchApi';

export const useLaunchTemplates = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadTemplates = useCallback(async () => {
    setLoading(true);

    try {
      const data = await adsLaunchApi.getTemplates();
      setTemplates(data.templates || []);
      setError('');
    } catch (requestError) {
      setTemplates([]);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  return {
    error,
    loadTemplates,
    loading,
    saving,
    setSaving,
    setTemplates,
    templates,
  };
};
