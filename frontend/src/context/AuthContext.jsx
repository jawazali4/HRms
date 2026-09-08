import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api, getToken, setToken } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('hrms_user') || 'null');
    } catch {
      return null;
    }
  });
  const [initializing, setInitializing] = useState(Boolean(getToken()));

  const storeUser = useCallback((u) => {
    setUser(u);
    if (u) localStorage.setItem('hrms_user', JSON.stringify(u));
    else localStorage.removeItem('hrms_user');
  }, []);

  useEffect(() => {
    const onLogout = () => storeUser(null);
    window.addEventListener('hrms:logout', onLogout);
    return () => window.removeEventListener('hrms:logout', onLogout);
  }, [storeUser]);

  // if a token exists, verify it once on load
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    api('GET', '/api/auth/me')
      .then((data) => {
        if (!cancelled) {
          storeUser(data.user);
          setInitializing(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setToken(null);
          storeUser(null);
          setInitializing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [storeUser]);

  const login = useCallback(
    async (email, password) => {
      const data = await api('POST', '/api/auth/login', { email, password });
      setToken(data.token);
      storeUser(data.user);
      return data.user;
    },
    [storeUser]
  );

  const logout = useCallback(() => {
    setToken(null);
    storeUser(null);
  }, [storeUser]);

  const value = useMemo(
    () => ({ user, initializing, login, logout, refresh: storeUser }),
    [user, initializing, login, logout, storeUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useRole() {
  const { user } = useAuth();
  return user ? user.role : 'guest';
}
