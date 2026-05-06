import { useEffect, useState } from 'react';
import { usersApi } from '../api/usersApi';

export const useUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await usersApi.getUsers();
      setUsers(data.users);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    usersApi
      .getUsers()
      .then((data) => {
        if (isMounted) {
          setUsers(data.users);
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
    loadUsers,
    setUsers,
    users,
  };
};
