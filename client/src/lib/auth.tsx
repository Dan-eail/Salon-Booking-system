import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { get, onSessionLost, post, refreshSession, setAccessToken } from './api';
import type { User } from './types';

type Registration = { fullName: string; email: string; phone: string; password: string; role: 'CUSTOMER' | 'OWNER'; salonName?: string; neighborhood?: string; address?: string };
type AuthState = {
  user: User | null; ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (r: Registration) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
};
const Ctx = createContext<AuthState | null>(null);
/** Non-secret marker so signed-out visitors don't fire a pointless refresh request (the real cookie is HTTP-only). */
const HINT = 'belle.session';
const hint = () => { try { return localStorage.getItem(HINT) === '1'; } catch { return true; } };
const setHint = (on: boolean) => { try { on ? localStorage.setItem(HINT, '1') : localStorage.removeItem(HINT); } catch { /* ignore */ } };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    let live = true;
    (async () => {
      // Restore the session from the HTTP-only refresh cookie; the access token only lives in memory.
      if (hint() && (await refreshSession())) {
        try { const me = await get<{ user: User }>('/auth/me'); if (live) setUser(me.user); } catch { /* signed out */ }
      }
      if (live) setReady(true);
    })();
    onSessionLost(() => { setHint(false); setUser(null); qc.clear(); });
    return () => { live = false; };
  }, [qc]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await post<{ user: User; accessToken: string }>('/auth/login', { email, password });
    setAccessToken(r.accessToken); setHint(true); qc.clear(); setUser(r.user); return r.user;
  }, [qc]);
  const register = useCallback(async (b: Registration) => {
    const r = await post<{ user: User; accessToken: string }>('/auth/register', b);
    setAccessToken(r.accessToken); setHint(true); qc.clear(); setUser(r.user); return r.user;
  }, [qc]);
  const logout = useCallback(async () => {
    try { await post('/auth/logout'); } catch { /* cookie may already be gone */ }
    setAccessToken(null); setHint(false); setUser(null); qc.clear();
  }, [qc]);

  const value = useMemo(() => ({ user, ready, login, register, logout, setUser }), [user, ready, login, register, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside AuthProvider');
  return c;
}
export const homeFor = (u: User) => (u.role === 'ADMIN' ? '/admin' : u.role === 'OWNER' || u.role === 'STAFF' ? '/salon' : '/dashboard');
