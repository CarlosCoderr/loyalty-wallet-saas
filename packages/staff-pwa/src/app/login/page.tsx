'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function LoginPage() {
  const { status, login, lastLogin, expiredNotice } = useSession();
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/scan');
  }, [status, router]);

  // Login rápido: negocio y correo del último cajero, solo falta el PIN
  useEffect(() => {
    if (lastLogin) {
      setTenantSlug((v) => v || lastLogin.tenantSlug);
      setEmail((v) => v || lastLogin.email);
    }
  }, [lastLogin]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(tenantSlug, email, password);
      router.replace('/scan');
    } catch (err) {
      // 401 credenciales, 403 desactivado, 423 bloqueada, 429 demasiados intentos: la API ya da el mensaje
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Caja</h1>
        <p className="text-slate-600">Inicia sesión para escanear tarjetas y sumar sellos.</p>
      </header>

      {expiredNotice && <Alert tone="warning">Tu sesión terminó. Vuelve a iniciar sesión.</Alert>}
      {error && <Alert>{error}</Alert>}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          label="Negocio"
          name="tenantSlug"
          value={tenantSlug}
          onChange={(e) => setTenantSlug(e.target.value)}
          placeholder="mi-negocio"
          autoCapitalize="none"
          autoCorrect="off"
          required
        />
        <Field
          label="Correo"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          required
        />
        <Field
          label="Contraseña o PIN"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus={!!lastLogin}
          minLength={4}
          required
        />
        <Button type="submit" loading={submitting} className="mt-2">
          Entrar
        </Button>
      </form>
    </main>
  );
}
