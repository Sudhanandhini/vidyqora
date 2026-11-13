import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import api from '../api';
import type { User } from '../types';

interface AuthValue {
  user: User | null;
  setUser: Dispatch<SetStateAction<User | null>>;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

/** Inside the signed-in app (under App's `!user` guard) `user` is always set. */
export type SignedIn = AuthValue & { user: User };

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('vq_token')) { setReady(true); return; }
    api.get('/auth/me').then((r) => setUser(r.data)).catch(() => localStorage.removeItem('vq_token')).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('vq_token', data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => { localStorage.removeItem('vq_token'); setUser(null); }, []);

  return <AuthCtx.Provider value={{ user, setUser, ready, login, logout }}>{children}</AuthCtx.Provider>;
}

/** Auth state for pages rendered after sign-in; App only renders them when `user` is set. */
export const useAuth = () => useContext(AuthCtx) as SignedIn;
/** Auth state where the user may be signed out (App, Login). */
export const useAuthState = () => useContext(AuthCtx) as AuthValue;

/** Wraps a page of a section the admin granted to this user's role, so the page shows its admin tools. */
export function AsAdmin({ children }: { children: ReactNode }) {
  const ctx = useContext(AuthCtx) as SignedIn;
  const value = useMemo((): SignedIn => ({ ...ctx, user: { ...ctx.user, role: 'admin', actualRole: ctx.user.role } }), [ctx]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
