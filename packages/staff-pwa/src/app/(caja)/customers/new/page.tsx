'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { QrImage } from '@/components/QrImage';
import { Alert, Button, Card, Field } from '@/components/ui';
import {
  ApiError,
  apiFetch,
  normalizePhone,
  type CustomerDetail,
  type CustomerSummary,
  type IssuedPass,
  type Program,
} from '@/lib/api';
import { useToken } from '@/lib/session';

type Step =
  | { name: 'phone' }
  | { name: 'form'; phone: string }
  | { name: 'existing'; customer: CustomerDetail }
  | { name: 'done'; customerName: string; pass: IssuedPass };

const PHONE_RE = /^\+?\d{7,15}$/;
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export default function NewCustomerPage() {
  const token = useToken();
  const [step, setStep] = useState<Step>({ name: 'phone' });
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [programId, setProgramId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    apiFetch<Program[]>('/api/v1/loyalty/programs', { token })
      .then((list) => {
        setPrograms(list);
        if (list.length === 1) setProgramId(list[0].id);
      })
      .catch((err) => setError(errorText(err, 'No se pudieron cargar los programas.')));
  }, [token]);

  function restart() {
    setStep({ name: 'phone' });
    setPhone('');
    setFirstName('');
    setLastName('');
    setEmail('');
    setError(null);
  }

  // Paso 1: buscar por teléfono para no duplicar clientes
  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    if (!PHONE_RE.test(normalized)) {
      setError('Teléfono inválido: de 7 a 15 dígitos, opcionalmente con +.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { items } = await apiFetch<{ items: CustomerSummary[] }>(
        `/api/v1/customers?search=${encodeURIComponent(normalized)}&limit=10`,
        { token },
      );
      const match = items.find((c) => c.phone === normalized);
      if (match) {
        setStep({ name: 'existing', customer: await apiFetch<CustomerDetail>(`/api/v1/customers/${match.id}`, { token }) });
      } else {
        setStep({ name: 'form', phone: normalized });
      }
    } catch (err) {
      setError(errorText(err, 'No se pudo buscar el cliente.'));
    } finally {
      setBusy(false);
    }
  }

  async function issuePass(customerId: string, customerName: string) {
    const pass = await apiFetch<IssuedPass>(`/api/v1/customers/${customerId}/passes`, {
      method: 'POST',
      token,
      body: { programId },
    });
    setStep({ name: 'done', customerName, pass });
  }

  // Paso 2a: cliente nuevo → alta + tarjeta
  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (step.name !== 'form') return;
    setError(null);
    setBusy(true);
    try {
      const customer = await apiFetch<{ id: string; firstName: string }>('/api/v1/customers', {
        method: 'POST',
        token,
        body: {
          firstName: firstName.trim(),
          lastName: lastName.trim() || null,
          phone: step.phone,
          email: email.trim() || null,
        },
      });
      await issuePass(customer.id, customer.firstName);
    } catch (err) {
      setError(errorText(err, 'No se pudo inscribir al cliente.'));
    } finally {
      setBusy(false);
    }
  }

  // Paso 2b: cliente existente → solo tarjeta
  async function onIssueExisting() {
    if (step.name !== 'existing') return;
    setError(null);
    setBusy(true);
    try {
      await issuePass(step.customer.id, step.customer.firstName);
    } catch (err) {
      setError(errorText(err, 'No se pudo emitir la tarjeta.'));
    } finally {
      setBusy(false);
    }
  }

  const programPicker =
    programs && programs.length > 1 ? (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-slate-700">Programa</legend>
        {programs.map((p) => (
          <label key={p.id} className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-slate-200 has-checked:ring-2 has-checked:ring-brand-600">
            <input type="radio" name="program" value={p.id} checked={programId === p.id} onChange={() => setProgramId(p.id)} />
            <span>
              <span className="font-semibold">{p.title}</span>
              <span className="block text-xs text-slate-500">
                {p.totalStamps} sellos → {p.rewardTitle}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
    ) : null;

  if (programs && programs.length === 0) {
    return <Alert tone="warning">No hay programas activos. Pide a un administrador que active uno para inscribir clientes.</Alert>;
  }

  return (
    <>
      <h1 className="text-xl font-bold">Nuevo cliente</h1>
      {error && <Alert>{error}</Alert>}

      {step.name === 'phone' && (
        <Card>
          <form onSubmit={onSearch} className="flex flex-col gap-3">
            <Field
              label="Teléfono del cliente"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              hint="Primero revisamos si ya está registrado."
              required
            />
            <Button type="submit" loading={busy}>
              Continuar
            </Button>
          </form>
        </Card>
      )}

      {step.name === 'form' && (
        <Card>
          <form onSubmit={onCreate} className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Cliente nuevo con teléfono <span className="font-semibold">{step.phone}</span>.
            </p>
            <Field label="Nombre" name="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={100} />
            <Field label="Apellido (opcional)" name="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={100} />
            <Field label="Correo (opcional)" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {programPicker}
            <Button type="submit" loading={busy} disabled={!programId}>
              Inscribir y crear tarjeta
            </Button>
            <Button type="button" variant="ghost" onClick={restart}>
              Cambiar teléfono
            </Button>
          </form>
        </Card>
      )}

      {step.name === 'existing' && (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-slate-500">Este teléfono ya está registrado:</p>
          <p className="text-lg font-semibold">
            {[step.customer.firstName, step.customer.lastName].filter(Boolean).join(' ')}
          </p>
          {step.customer.passes.map((p) => (
            <Link key={p.id} href={`/pass/${p.serialNumber}`} className="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
              <span className="font-semibold">{p.program.title}</span> · {p.currentStamps}/{p.program.totalStamps} sellos →
            </Link>
          ))}
          {programPicker}
          {step.customer.passes.some((p) => p.programId === programId) ? (
            <Alert tone="info">Ya tiene tarjeta en este programa: ábrela arriba para sumar sellos.</Alert>
          ) : (
            <Button onClick={onIssueExisting} loading={busy} disabled={!programId}>
              Crear tarjeta en este programa
            </Button>
          )}
          <Button variant="ghost" onClick={restart}>
            Buscar otro teléfono
          </Button>
        </Card>
      )}

      {step.name === 'done' && (
        <Card className="flex flex-col gap-4 text-center">
          <Alert tone="success">
            Tarjeta de {step.customerName} creada en {step.pass.program.title}.
          </Alert>
          <p className="font-semibold">Pide al cliente que escanee este código con la cámara de su iPhone</p>
          <QrImage value={step.pass.wallet.appleDownloadUrl} label="Código para agregar la tarjeta a Apple Wallet" />
          {step.pass.wallet.provider === 'mock' && (
            <Alert tone="warning">Modo de prueba: el enlace descarga un archivo de prueba que iOS no puede instalar.</Alert>
          )}
          <ShareLink url={step.pass.wallet.appleDownloadUrl} />
          <Link
            href={`/pass/${step.pass.serialNumber}`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-600 px-5 font-semibold text-white"
          >
            Registrar su primera compra
          </Link>
          <Button variant="ghost" onClick={restart}>
            Inscribir a otro cliente
          </Button>
        </Card>
      )}
    </>
  );
}

// Enviar el enlace por WhatsApp/SMS con la hoja nativa de compartir, o copiarlo
function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function onClick() {
    if (canShare) {
      await navigator.share({ title: 'Tu tarjeta de lealtad', url }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="secondary" onClick={onClick}>
      {canShare ? 'Enviar enlace al cliente' : copied ? 'Enlace copiado ✓' : 'Copiar enlace'}
    </Button>
  );
}
