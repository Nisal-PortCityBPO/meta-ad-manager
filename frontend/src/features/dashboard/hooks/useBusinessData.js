import { useEffect, useState } from 'react';
import { businessDataApi } from '../api/businessDataApi';

const defaultProfilePagination = {
  page: 1,
  limit: 5,
  total: 0,
  totalPages: 1,
  hasPrevious: false,
  hasNext: false,
};

const defaultProfileFilterOptions = {
  tokenLabels: [],
};

const defaultSocialAccountPagination = {
  page: 1,
  limit: 5,
  total: 0,
  totalPages: 1,
  hasPrevious: false,
  hasNext: false,
};

const defaultSocialAccountFilterOptions = {
  tokenLabels: [],
};

export const useBusinessData = (socialAccountQuery = {}) => {
  const { agencyId, brandId, limit, page, search, tokenLabel } = socialAccountQuery;
  const [brands, setBrands] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [socialAccounts, setSocialAccounts] = useState([]);
  const [profilePagination, setProfilePagination] = useState(defaultProfilePagination);
  const [profileFilterOptions, setProfileFilterOptions] = useState(defaultProfileFilterOptions);
  const [socialAccountPagination, setSocialAccountPagination] = useState(defaultSocialAccountPagination);
  const [socialAccountFilterOptions, setSocialAccountFilterOptions] = useState(defaultSocialAccountFilterOptions);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({
    brands: '',
    agencies: '',
    profiles: '',
    socialAccounts: '',
  });

  const error = Object.values(errors).filter(Boolean).join(' ');

  const setDataResult = (key, result, setter, responseKey, afterSet) => {
    if (result.status === 'fulfilled') {
      setter(result.value[responseKey]);
      afterSet?.(result.value);
      setErrors((current) => ({
        ...current,
        [key]: '',
      }));
      return;
    }

    setErrors((current) => ({
      ...current,
      [key]: result.reason.message,
    }));
  };

  const loadBusinessData = async ({ showLoading = true } = {}) => {
    if (showLoading) {
      setLoading(true);
    }

    const [brandResult, agencyResult, profileResult, socialAccountResult] = await Promise.allSettled([
      businessDataApi.getBrands(),
      businessDataApi.getAgencies(),
      businessDataApi.getBusinessProfiles({ agencyId, brandId, limit, page, search, tokenLabel }),
      businessDataApi.getSocialAccounts({ agencyId, brandId, limit, page, search, tokenLabel }),
    ]);

    setDataResult('brands', brandResult, setBrands, 'brands');
    setDataResult('agencies', agencyResult, setAgencies, 'agencies');
    setDataResult('profiles', profileResult, setProfiles, 'profiles', (data) => {
      setProfilePagination(data.pagination || defaultProfilePagination);
      setProfileFilterOptions(data.filterOptions || defaultProfileFilterOptions);
    });
    setDataResult('socialAccounts', socialAccountResult, setSocialAccounts, 'socialAccounts', (data) => {
      setSocialAccountPagination(data.pagination || defaultSocialAccountPagination);
      setSocialAccountFilterOptions(data.filterOptions || defaultSocialAccountFilterOptions);
    });

    if (showLoading) {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    Promise.allSettled([
      businessDataApi.getBrands(),
      businessDataApi.getAgencies(),
      businessDataApi.getBusinessProfiles({ agencyId, brandId, limit, page, search, tokenLabel }),
      businessDataApi.getSocialAccounts({ agencyId, brandId, limit, page, search, tokenLabel }),
    ])
      .then(([brandResult, agencyResult, profileResult, socialAccountResult]) => {
        if (isMounted) {
          setDataResult('brands', brandResult, setBrands, 'brands');
          setDataResult('agencies', agencyResult, setAgencies, 'agencies');
          setDataResult('profiles', profileResult, setProfiles, 'profiles', (data) => {
            setProfilePagination(data.pagination || defaultProfilePagination);
            setProfileFilterOptions(data.filterOptions || defaultProfileFilterOptions);
          });
          setDataResult('socialAccounts', socialAccountResult, setSocialAccounts, 'socialAccounts', (data) => {
            setSocialAccountPagination(data.pagination || defaultSocialAccountPagination);
            setSocialAccountFilterOptions(data.filterOptions || defaultSocialAccountFilterOptions);
          });
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
  }, [
    agencyId,
    brandId,
    limit,
    page,
    search,
    tokenLabel,
  ]);

  return {
    agencies,
    brands,
    error,
    loadBusinessData,
    loading,
    profileFilterOptions,
    profilePagination,
    profiles,
    socialAccountFilterOptions,
    socialAccountPagination,
    socialAccounts,
    setAgencies,
    setBrands,
    setProfiles,
    setSocialAccounts,
  };
};
