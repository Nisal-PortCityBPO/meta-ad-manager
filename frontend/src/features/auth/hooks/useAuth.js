import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/authApi';
import { authStorage } from '../utils/authStorage';

export const USER_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
};

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => authStorage.getUser());
  const [initializing, setInitializing] = useState(true);

  const setSessionUser = useCallback((nextUser) => {
    setUser(nextUser);
    if (nextUser) {
      authStorage.setUser(nextUser);
    } else {
      authStorage.clear();
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await authApi.me();
    setSessionUser(data.user);
    return data.user;
  }, [setSessionUser]);

  useEffect(() => {
    let isMounted = true;

    authApi
      .me()
      .then((data) => {
        if (isMounted) {
          setSessionUser(data.user);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSessionUser(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setInitializing(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [setSessionUser]);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      authApi
        .me()
        .then((data) => setSessionUser(data.user))
        .catch(() => setSessionUser(null));
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [setSessionUser, user]);

  const login = useCallback(async (credentials) => {
    const data = await authApi.login(credentials);
    setSessionUser(data.user);
    return data.user;
  }, [setSessionUser]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setSessionUser(null);
    }
  }, [setSessionUser]);

  const value = useMemo(
    () => ({
      user,
      initializing,
      isAuthenticated: Boolean(user),
      isSuperAdmin: user?.role === USER_ROLES.SUPER_ADMIN,
      hasRole: (roles) => roles.includes(user?.role),
      login,
      logout,
      refreshUser,
      setSessionUser,
    }),
    [user, initializing, login, logout, refreshUser, setSessionUser]
  );

  return createElement(AuthContext.Provider, { value }, children);
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
};
