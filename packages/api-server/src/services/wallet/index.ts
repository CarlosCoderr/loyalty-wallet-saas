import type { FastifyBaseLogger } from 'fastify';
import { and, count, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { passes, rewardRedemptions } from '../../db/schema.js';
import { env } from '../../env.js';
import { MockWalletService } from './mock-wallet.service.js';
import type { IWalletService, PassSnapshot } from './wallet.interface.js';

function createWalletService(provider: typeof env.WALLET_PROVIDER): IWalletService {
  if (provider === 'production') {
    // Falla al arrancar en vez de simular en silencio: en producción nadie se enteraría.
    throw new Error(
      'WALLET_PROVIDER=production todavía no está implementado (falta ProductionWalletService). Usa WALLET_PROVIDER=mock.',
    );
  }
  return new MockWalletService();
}

export const walletService = createWalletService(env.WALLET_PROVIDER);

export async function loadPassSnapshot(passId: string): Promise<PassSnapshot | null> {
  const pass = await db.query.passes.findFirst({
    where: eq(passes.id, passId),
    columns: {
      id: true,
      tenantId: true,
      serialNumber: true,
      status: true,
      currentStamps: true,
      rewardsRedeemed: true,
      googleLoyaltyObjectId: true,
    },
    with: {
      program: { columns: { title: true, rewardTitle: true, totalStamps: true } },
      customer: { columns: { firstName: true } },
      appleRegistrations: {
        with: { device: { columns: { deviceLibraryIdentifier: true, pushToken: true } } },
      },
    },
  });
  if (!pass) return null;

  const [{ pending }] = await db
    .select({ pending: count() })
    .from(rewardRedemptions)
    .where(and(eq(rewardRedemptions.passId, passId), eq(rewardRedemptions.status, 'pending')));

  return {
    passId: pass.id,
    tenantId: pass.tenantId,
    serialNumber: pass.serialNumber,
    status: pass.status,
    currentStamps: pass.currentStamps,
    totalStamps: pass.program.totalStamps,
    pendingRewards: pending,
    rewardsRedeemed: pass.rewardsRedeemed,
    programTitle: pass.program.title,
    rewardTitle: pass.program.rewardTitle,
    customerFirstName: pass.customer.firstName,
    googleLoyaltyObjectId: pass.googleLoyaltyObjectId,
    appleDevices: pass.appleRegistrations.map((r) => r.device),
  };
}

/**
 * Avisa a Apple/Google que el pase cambió. Llamar DESPUÉS del commit y sin await:
 * nunca lanza, así un fallo de red no afecta la respuesta al cajero ni la compra guardada.
 */
export async function notifyPassChanged(passId: string, log: FastifyBaseLogger): Promise<void> {
  try {
    const snapshot = await loadPassSnapshot(passId);
    if (!snapshot) {
      log.warn({ passId }, 'Wallet: pase no encontrado al notificar');
      return;
    }
    await walletService.notifyPassUpdate(snapshot, log);
  } catch (err) {
    log.error({ err, passId }, '⚠️ Error al notificar actualización de tarjeta Wallet');
  }
}
