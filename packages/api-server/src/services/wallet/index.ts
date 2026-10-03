import type { FastifyBaseLogger } from 'fastify';
import { and, count, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { passes, rewardRedemptions } from '../../db/schema.js';
import { env } from '../../env.js';
import { loadAppleCertificates } from '../pass-engine.service.js';
import { MockWalletService } from './mock-wallet.service.js';
import { ProductionWalletService } from './production-wallet.service.js';
import type { IWalletService, PassSnapshot } from './wallet.interface.js';

function createWalletService(provider: typeof env.WALLET_PROVIDER): IWalletService {
  if (provider === 'production') {
    // Lee los certificados al arrancar: si faltan o son inválidos, el servidor no inicia
    return new ProductionWalletService(loadAppleCertificates());
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
      authenticationToken: true,
      status: true,
      updatedAt: true,
      currentStamps: true,
      rewardsRedeemed: true,
      googleLoyaltyObjectId: true,
    },
    with: {
      tenant: { columns: { name: true } },
      program: {
        columns: {
          title: true,
          rewardTitle: true,
          rewardDescription: true,
          totalStamps: true,
          primaryColor: true,
          backgroundColor: true,
          labelColor: true,
        },
      },
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
    tenantName: pass.tenant.name,
    serialNumber: pass.serialNumber,
    authenticationToken: pass.authenticationToken,
    status: pass.status,
    updatedAt: pass.updatedAt,
    currentStamps: pass.currentStamps,
    totalStamps: pass.program.totalStamps,
    pendingRewards: pending,
    rewardsRedeemed: pass.rewardsRedeemed,
    programTitle: pass.program.title,
    rewardTitle: pass.program.rewardTitle,
    rewardDescription: pass.program.rewardDescription,
    colors: {
      primary: pass.program.primaryColor,
      background: pass.program.backgroundColor,
      label: pass.program.labelColor,
    },
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

/** Igual que notifyPassChanged para varios pases (p. ej. al editar un programa). Uno a la vez. */
export async function notifyPassesChanged(passIds: string[], log: FastifyBaseLogger): Promise<void> {
  for (const passId of passIds) {
    await notifyPassChanged(passId, log);
  }
}
