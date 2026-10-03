// Cliente de la API (packages/api-server). Todas las respuestas tienen la forma { status, data | message }.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Evento global: la sesión dejó de valer (token vencido, contraseña cambiada, usuario desactivado)
export const SESSION_EXPIRED_EVENT = 'staff-pwa:session-expired';

export async function apiFetch<T>(
  path: string,
  { method = 'GET', body, token }: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError(res.status, json?.message ?? `Error ${res.status}`, json?.errors);
  }
  return json?.data as T;
}

// ---- Tipos de la API ----

export interface SessionUser {
  id: string;
  fullName: string | null;
  email: string;
  role: 'admin' | 'cashier';
  branchId: string | null;
  branchName: string | null;
}

export interface SessionTenant {
  id: string;
  name: string;
  slug: string;
}

export interface LoginResult {
  token: string;
  user: SessionUser;
  tenant: SessionTenant;
}

export interface PassDetails {
  id: string;
  serialNumber: string;
  status: 'active' | 'suspended';
  currentStamps: number;
  carryoverAmount: string;
  rewardsRedeemed: number;
  customer: { id: string; firstName: string; lastName: string | null; phone: string };
  program: {
    id: string;
    title: string;
    rewardTitle: string;
    stampRuleType: 'per_amount' | 'per_visit';
    amountPerStamp: string;
    minPurchaseAmount: string;
    totalStamps: number;
  };
  pendingRewards: { id: string; rewardTitle: string; earnedAt: string }[];
}

export interface StampResult {
  passId: string;
  transactionId: string;
  stampsEarned: number;
  currentStamps: number;
  totalStamps: number;
  carryoverAmount: string;
  rewardsEarned: number;
  pendingRewards: number;
  belowMinimum: boolean;
}

export interface RedeemResult {
  redemptionId: string;
  rewardTitle: string;
  transactionId: string;
  redeemedAt: string;
}

export interface Program {
  id: string;
  title: string;
  rewardTitle: string;
  stampRuleType: 'per_amount' | 'per_visit';
  amountPerStamp: string;
  minPurchaseAmount: string;
  totalStamps: number;
  primaryColor: string;
}

export interface CustomerSummary {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  email: string | null;
  passes: { id: string; serialNumber: string; currentStamps: number; status: string }[];
}

export interface CustomerDetail extends Omit<CustomerSummary, 'passes'> {
  passes: {
    id: string;
    programId: string;
    serialNumber: string;
    currentStamps: number;
    status: string;
    appleDownloadUrl: string;
    program: { id: string; title: string; totalStamps: number; rewardTitle: string };
  }[];
}

export interface IssuedPass {
  id: string;
  serialNumber: string;
  program: { id: string; title: string };
  wallet: { provider: 'mock' | 'production'; appleDownloadUrl: string; googleSaveUrl: string | null };
}

// ---- Utilidades ----

/** "35,5" → 35.5; null si no es un monto válido (> 0 y máximo 2 decimales). */
export function parseAmount(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value > 0 ? value : null;
}

export const formatMoney = (value: string | number) =>
  Number(value).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

/** Mismo formato que guarda la API: sin espacios, guiones, paréntesis ni puntos. */
export const normalizePhone = (phone: string) => phone.replace(/[\s\-().]/g, '');
