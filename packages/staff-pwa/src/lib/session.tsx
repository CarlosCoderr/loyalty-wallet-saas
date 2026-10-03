'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SESSION_EXPIRED_EVENT, apiFetch, type LoginResult } from './api';

// La sesión se guarda en el dispositivo de caja para no pedir login en cada apertura de la PWA.
// El token dura máx. 12 h y la API lo invalida al instante si el admin desactiva al cajero
// o cambia su contraseña/PIN.
const SESSION_KEY = 'staff-pwa:session';
// Para el login rápido con PIN: se recuerdan negocio y correo (nunca la clave)
const LAST_LOGIN_KEY = 'staff-pwa:last-login';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface SessionContextValue {
  status: Status;
  session: LoginResult | null;
  expiredNotice: boolean;
  lastLogin: { tenantSlug: string; email: string } | null;
  login: (tenantSlug: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Almacenamiento bloqueado (modo privado): la sesión dura mientras la pestaña esté abierta
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<LoginResult | null>(null);
  const [expiredNotice, setExpiredNotice] = useState(false);
  const [lastLogin, setLastLogin] = useState<{ tenantSlug: string; email: string } | null>(null);

  useEffect(() => {
    const stored = readStorage<LoginResult>(SESSION_KEY);
    setSession(stored);
    setLastLogin(readStorage(LAST_LOGIN_KEY));
    setStatus(stored ? 'authenticated' : 'anonymous');
  }, []);

  const logout = useCallback(() => {
    writeStorage(SESSION_KEY, null);
    setSession(null);
    setStatus('anonymous');
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setExpiredNotice(true);
      logout();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [logout]);

  const login = useCallback(async (tenantSlug: string, email: string, password: string) => {
    const result = await apiFetch<LoginResult>('/api/v1/auth/login', {
      method: 'POST',
      body: { tenantSlug: tenantSlug.trim().toLowerCase(), email: email.trim(), password },
    });
    writeStorage(SESSION_KEY, result);
    const remembered = { tenantSlug: result.tenant.slug, email: result.user.email };
    writeStorage(LAST_LOGIN_KEY, remembered);
    setLastLogin(remembered);
    setSession(result);
    setExpiredNotice(false);
    setStatus('authenticated');
  }, []);

  const value = useMemo(
    () => ({ status, session, expiredNotice, lastLogin, login, logout }),
    [status, session, expiredNotice, lastLogin, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de <SessionProvider>');
  return ctx;
}

/** Token de la sesión activa (las páginas de caja solo se renderizan con sesión). */
export function useToken() {
  const { session } = useSession();
  if (!session) throw new Error('Sin sesión activa');
  return session.token;
}
