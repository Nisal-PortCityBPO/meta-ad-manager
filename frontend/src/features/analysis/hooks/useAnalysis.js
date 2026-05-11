import { useEffect, useState } from 'react';
import { analysisApi } from '../api/analysisApi';

const defaultConfig = {
  actions: [],
  logicModes: [],
  metrics: [],
  operators: [],
};

const defaultRecommendations = {
  categories: [],
  generatedAt: null,
  inventoryCount: 0,
  ruleCount: 0,
};

export const useAnalysis = () => {
  const [config, setConfig] = useState(defaultConfig);
  const [recommendations, setRecommendations] = useState(defaultRecommendations);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadAnalysis = async ({ showLoading = true } = {}) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const [configData, ruleData, recommendationData] = await Promise.all([
        analysisApi.getConfig(),
        analysisApi.getRules(),
        analysisApi.getRecommendations(),
      ]);

      setConfig(configData);
      setRules(ruleData.rules || []);
      setRecommendations(recommendationData);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const saveRule = async (payload, editingRuleId = '') => {
    setSaving(true);

    try {
      const data = editingRuleId
        ? await analysisApi.updateRule(editingRuleId, payload)
        : await analysisApi.createRule(payload);

      await loadAnalysis({ showLoading: false });
      return data;
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (ruleId) => {
    setSaving(true);

    try {
      const data = await analysisApi.deleteRule(ruleId);
      await loadAnalysis({ showLoading: false });
      return data;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    Promise.all([analysisApi.getConfig(), analysisApi.getRules(), analysisApi.getRecommendations()])
      .then(([configData, ruleData, recommendationData]) => {
        if (!mounted) {
          return;
        }

        setConfig(configData);
        setRules(ruleData.rules || []);
        setRecommendations(recommendationData);
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
  }, []);

  return {
    config,
    deleteRule,
    error,
    loading,
    recommendations,
    reload: loadAnalysis,
    rules,
    saveRule,
    saving,
  };
};
