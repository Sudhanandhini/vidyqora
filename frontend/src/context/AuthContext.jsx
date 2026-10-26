import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('vq_token')) { setReady(true); return; }
    api.get('/auth/me').then((r) => setUser(r.data)).catch(() => localStorage.removeItem('vq_token')).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('vq_token', data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => { localStorage.removeItem('vq_token'); setUser(null); }, []);

  return <AuthCtx.Provider value={{ user, setUser, ready, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
