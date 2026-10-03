import type { FastifyBaseLogger } from 'fastify';
import { generateApplePKPass, type AppleCertificates } from '../pass-engine.service.js';
import type { IWalletService, PassSnapshot } from './wallet.interface.js';

// Apple real: genera .pkpass firmados con los certificados del Pass Type ID.
// Pendiente: push por APNs a los dispositivos registrados y Google Wallet.
export class ProductionWalletService implements IWalletService {
  readonly provider = 'production' as const;

  constructor(private readonly certificates: AppleCertificates) {}

  async notifyPassUpdate(snapshot: PassSnapshot, log: FastifyBaseLogger): Promise<void> {
    if (snapshot.appleDevices.length === 0 && !snapshot.googleLoyaltyObjectId) return;
    // Se lanza para que notifyPassChanged lo registre como error: no se oculta que no hubo aviso
    log.warn({ serialNumber: snapshot.serialNumber }, 'Wallet production: el pase cambió pero aún no hay envío APNs/Google');
    throw new Error('Push APNs y Google Wallet aún no implementados');
  }

  async generatePassBundle(snapshot: PassSnapshot) {
    return { applePassBuffer: generateApplePKPass(snapshot, this.certificates) };
  }
}
