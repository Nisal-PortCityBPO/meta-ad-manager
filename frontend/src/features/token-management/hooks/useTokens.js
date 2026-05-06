import { useEffect, useState } from 'react';
import { tokensApi } from '../api/tokensApi';

export const useTokens = () => {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadTokens = async () => {
    setLoading(true);
    try {
      const data = await tokensApi.getTokens();
      setTokens(data.tokens);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    tokensApi
      .getTokens()
      .then((data) => {
        if (isMounted) {
          setTokens(data.tokens);
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
    loadTokens,
    loading,
    tokens,
  };
};
