import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState({ loading: true });

  const refresh = useCallback(async () => {
    try {
      const s = await api.get('/api/auth/status');
      setStatus({ loading: false, ...s });
    } catch (err) {
      setStatus({ loading: false, error: err.message });
    }
  }, []);

  useEffect(() => {
    refresh();
    setUnauthorizedHandler(() => setStatus((s) => ({ ...s, authenticated: false, user: null })));
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setStatus((s) => ({ ...s, authenticated: false, user: null }));
  }, []);

  return <AuthCtx.Provider value={{ ...status, refresh, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
