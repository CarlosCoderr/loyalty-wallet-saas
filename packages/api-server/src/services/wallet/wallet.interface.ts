import type { FastifyBaseLogger } from 'fastify';

export interface AppleDeviceTarget {
  deviceLibraryIdentifier: string;
  pushToken: string;
}

// Estado actual del pase, leído de la BD después del commit.
// Apple: se envía un push VACÍO a cada dispositivo y el iPhone descarga el pase nuevo
// desde el web service. Google: se actualiza el loyaltyObject vía API con estos datos.
export interface PassSnapshot {
  passId: string;
  tenantId: string;
  tenantName: string;
  serialNumber: string;
  // Secreto del web service de Apple: va dentro del .pkpass. Nunca loguearlo ni devolverlo en JSON.
  authenticationToken: string;
  status: 'active' | 'suspended';
  updatedAt: Date;
  currentStamps: number;
  totalStamps: number;
  pendingRewards: number;
  rewardsRedeemed: number;
  programTitle: string;
  rewardTitle: string;
  rewardDescription: string | null;
  colors: { primary: string; background: string; label: string };
  customerFirstName: string;
  googleLoyaltyObjectId: string | null;
  appleDevices: AppleDeviceTarget[];
}

export interface IWalletService {
  readonly provider: 'mock' | 'production';

  /**
   * Notifica a los proveedores (Apple Push / Google API) que la tarjeta ha cambiado
   */
  notifyPassUpdate(snapshot: PassSnapshot, log: FastifyBaseLogger): Promise<void>;

  /**
   * Genera el archivo firmado para descargar (.pkpass para Apple o URL de adición para Google)
   */
  generatePassBundle(snapshot: PassSnapshot): Promise<{ applePassBuffer?: Buffer; googleSaveUrl?: string }>;
}
