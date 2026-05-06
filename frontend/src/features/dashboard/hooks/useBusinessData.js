import { useEffect, useState } from 'react';
import { businessDataApi } from '../api/businessDataApi';

export const useBusinessData = () => {
  const [brands, setBrands] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBusinessData = async ({ showLoading = true } = {}) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const [brandData, agencyData, profileData] = await Promise.all([
        businessDataApi.getBrands(),
        businessDataApi.getAgencies(),
        businessDataApi.getBusinessProfiles(),
      ]);

      setBrands(brandData.brands);
      setAgencies(agencyData.agencies);
      setProfiles(profileData.profiles);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      businessDataApi.getBrands(),
      businessDataApi.getAgencies(),
      businessDataApi.getBusinessProfiles(),
    ])
      .then(([brandData, agencyData, profileData]) => {
        if (isMounted) {
          setBrands(brandData.brands);
          setAgencies(agencyData.agencies);
          setProfiles(profileData.profiles);
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
    agencies,
    brands,
    error,
    loadBusinessData,
    loading,
    profiles,
    setAgencies,
    setBrands,
    setProfiles,
  };
};
