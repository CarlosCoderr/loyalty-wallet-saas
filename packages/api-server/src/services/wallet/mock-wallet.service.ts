import type { FastifyBaseLogger } from 'fastify';
import type { IWalletService, PassSnapshot } from './wallet.interface.js';

// Simula lo que haría el motor real: no envía nada, solo deja constancia en el log.
export class MockWalletService implements IWalletService {
  readonly provider = 'mock' as const;

  async notifyPassUpdate(snapshot: PassSnapshot, log: FastifyBaseLogger): Promise<void> {
    log.info(
      {
        wallet: 'mock',
        serialNumber: snapshot.serialNumber,
        stamps: `${snapshot.currentStamps}/${snapshot.totalStamps}`,
        pendingRewards: snapshot.pendingRewards,
        status: snapshot.status,
        // Solo un prefijo: el push token completo no debe quedar en los logs
        applePushTargets: snapshot.appleDevices.map((d) => `${d.pushToken.slice(0, 8)}…`),
        googleObjectId: snapshot.googleLoyaltyObjectId,
      },
      snapshot.appleDevices.length || snapshot.googleLoyaltyObjectId
        ? '📲 [MOCK WALLET] Actualización de pase simulada'
        : '📲 [MOCK WALLET] Pase sin dispositivos Apple ni objeto Google: nada que notificar',
    );
  }

  async generatePassBundle(snapshot: PassSnapshot) {
    return {
      applePassBuffer: Buffer.from(`MOCK_PKPASS:${snapshot.serialNumber}`),
      googleSaveUrl: `https://pay.google.com/gp/v/save/mock_${snapshot.serialNumber}`,
    };
  }
}
