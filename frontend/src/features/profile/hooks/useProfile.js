import { useEffect, useState } from 'react';
import { profileApi } from '../api/profileApi';

export const useProfile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProfile = async () => {
    setLoading(true);
    try {
      const data = await profileApi.getProfile();
      setProfile(data.user);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    profileApi
      .getProfile()
      .then((data) => {
        if (isMounted) {
          setProfile(data.user);
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
    profile,
    reload: loadProfile,
    setProfile,
  };
};
