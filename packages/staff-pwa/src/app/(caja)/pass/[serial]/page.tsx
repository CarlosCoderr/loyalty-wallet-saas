'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Field, Spinner, StampProgress } from '@/components/ui';
import {
  ApiError,
  apiFetch,
  formatMoney,
  parseAmount,
  type PassDetails,
  type RedeemResult,
  type StampResult,
} from '@/lib/api';
import { useToken } from '@/lib/session';

type Feedback = { tone: 'success' | 'warning' | 'error'; text: string } | null;

export default function PassPage() {
  const token = useToken();
  const serial = decodeURIComponent(useParams<{ serial: string }>().serial);

  const [pass, setPass] = useState<PassDetails | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string>();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<'stamp' | string | null>(null); // 'stamp' o id del premio en canje

  const load = useCallback(async () => {
    try {
      setPass(await apiFetch<PassDetails>(`/api/v1/loyalty/pass/${encodeURIComponent(serial)}`, { token }));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err : new ApiError(0, 'No se pudo cargar la tarjeta.'));
    }
  }, [serial, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onStamp(e: FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    if (value === null) {
      setAmountError('Escribe un monto mayor a 0, con máximo 2 decimales.');
      return;
    }
    setAmountError(undefined);
    setFeedback(null);
    setBusy('stamp');
    try {
      const r = await apiFetch<StampResult>('/api/v1/loyalty/stamps', {
        method: 'POST',
        token,
        body: { passToken: serial, amountSpent: value },
      });
      setAmount('');
      // Primero la tarjeta actualizada y después el mensaje: nunca se ve el mensaje con datos viejos
      await load();
      setFeedback(
        r.belowMinimum
          ? { tone: 'warning', text: `Compra de ${formatMoney(value)} registrada, pero no alcanza el monto mínimo: sin sellos.` }
          : r.rewardsEarned > 0
            ? { tone: 'success', text: `¡+${r.stampsEarned} sellos! Completó ${r.rewardsEarned === 1 ? 'una tarjeta: ganó un premio' : `${r.rewardsEarned} tarjetas: ganó ${r.rewardsEarned} premios`}. 🎉` }
            : { tone: 'success', text: `+${r.stampsEarned} ${r.stampsEarned === 1 ? 'sello' : 'sellos'} por ${formatMoney(value)}.` },
      );
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof ApiError ? err.message : 'No se pudo registrar la compra.' });
    } finally {
      setBusy(null);
    }
  }

  async function onRedeem(rewardId: string, title: string) {
    if (!window.confirm(`¿Entregar "${title}" al cliente? Esta acción no se puede deshacer.`)) return;
    setFeedback(null);
    setBusy(rewardId);
    try {
      const r = await apiFetch<RedeemResult>('/api/v1/loyalty/redeem', {
        method: 'POST',
        token,
        body: { passToken: serial, rewardId },
      });
      await load();
      setFeedback({ tone: 'success', text: `Premio entregado: ${r.rewardTitle}.` });
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof ApiError ? err.message : 'No se pudo canjear el premio.' });
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <>
        <Alert>{loadError.status === 404 ? `No existe una tarjeta con el número "${serial}".` : loadError.message}</Alert>
        <Link href="/scan" className="text-center font-semibold text-brand-600">
          ← Escanear otra tarjeta
        </Link>
      </>
    );
  }

  if (!pass) {
    return (
      <div className="flex flex-1 items-center justify-center text-brand-600">
        <Spinner className="size-8" />
      </div>
    );
  }

  const fullName = [pass.customer.firstName, pass.customer.lastName].filter(Boolean).join(' ');
  const perVisit = pass.program.stampRuleType === 'per_visit';
  const minPurchase = Number(pass.program.minPurchaseAmount);

  return (
    <>
      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-slate-500">{pass.program.title}</p>
          <h1 className="text-2xl font-bold">{fullName}</h1>
          <p className="text-xs text-slate-500">Tarjeta {pass.serialNumber}</p>
        </div>
        {pass.status !== 'active' && <Alert tone="warning">Esta tarjeta está suspendida: no suma sellos.</Alert>}
        <StampProgress current={pass.currentStamps} total={pass.program.totalStamps} />
        <p className="text-sm text-slate-600">
          {perVisit ? '1 sello por visita' : `1 sello por cada ${formatMoney(pass.program.amountPerStamp)}`}
          {minPurchase > 0 && ` · compra mínima ${formatMoney(minPurchase)}`}
          {!perVisit && Number(pass.carryoverAmount) > 0 && ` · acumulado ${formatMoney(pass.carryoverAmount)}`}
        </p>
      </Card>

      {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}

      <Card>
        <form onSubmit={onStamp} className="flex flex-col gap-3">
          <Field
            label="Monto de la compra"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={amountError}
            disabled={pass.status !== 'active'}
          />
          <Button type="submit" loading={busy === 'stamp'} disabled={busy !== null || pass.status !== 'active'}>
            Registrar compra
          </Button>
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Premios por entregar ({pass.pendingRewards.length})</h2>
        {pass.pendingRewards.length === 0 ? (
          <p className="text-sm text-slate-500">
            Le faltan {pass.program.totalStamps - pass.currentStamps} sellos para ganar: {pass.program.rewardTitle}.
          </p>
        ) : (
          pass.pendingRewards.map((reward) => (
            <div key={reward.id} className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 p-3">
              <div className="min-w-0">
                <p className="font-semibold text-emerald-900">{reward.rewardTitle}</p>
                <p className="text-xs text-emerald-700">Ganado el {new Date(reward.earnedAt).toLocaleDateString('es-MX')}</p>
              </div>
              <Button
                variant="secondary"
                className="min-h-10 shrink-0 px-4 text-sm"
                loading={busy === reward.id}
                disabled={busy !== null}
                onClick={() => onRedeem(reward.id, reward.rewardTitle)}
              >
                Entregar
              </Button>
            </div>
          ))
        )}
      </Card>

      <Link href="/scan" className="py-2 text-center font-semibold text-brand-600">
        ← Escanear otra tarjeta
      </Link>
    </>
  );
}
