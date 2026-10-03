import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { PassType, PKPass } from 'passkit-generator';
import { env } from '../env.js';
import type { PassSnapshot } from './wallet/wallet.interface.js';

export interface AppleCertificates {
  wwdr: Buffer;
  signerCert: Buffer;
  signerKey: Buffer;
  signerKeyPassphrase?: string;
}

/** Lee los certificados PEM una sola vez (al arrancar en modo production). */
export function loadAppleCertificates(): AppleCertificates {
  const read = (path: string | undefined, name: string) => {
    if (!path) throw new Error(`${name} no está configurado`);
    try {
      return readFileSync(path);
    } catch (err) {
      throw new Error(`No se pudo leer ${name} (${path}): ${(err as Error).message}`);
    }
  };
  return {
    wwdr: read(env.APPLE_WWDR_CERT_PATH, 'APPLE_WWDR_CERT_PATH'),
    signerCert: read(env.APPLE_SIGNER_CERT_PATH, 'APPLE_SIGNER_CERT_PATH'),
    signerKey: read(env.APPLE_SIGNER_KEY_PATH, 'APPLE_SIGNER_KEY_PATH'),
    signerKeyPassphrase: env.APPLE_SIGNER_KEY_PASSPHRASE,
  };
}

// Apple Wallet espera colores como "rgb(r, g, b)"; en la BD se guardan como #RRGGBB
export function hexToRgb(hex: string) {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

// PNG de un color sólido. Apple exige icon.png en todo pase; mientras no haya logos subidos,
// se genera uno con el color del programa (sin guardar imágenes en el repo).
function solidPng(size: number, hex: string): Buffer {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const row = Buffer.from([0, ...Array.from({ length: size }, () => rgb).flat()]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));

  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // color type RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Genera el .pkpass firmado (tarjeta tipo storeCard) con el estado actual del pase. */
export function generateApplePKPass(snapshot: PassSnapshot, certificates: AppleCertificates): Buffer {
  const icon = snapshot.colors.primary;
  const pass = new PKPass(
    {
      'icon.png': solidPng(29, icon),
      'icon@2x.png': solidPng(58, icon),
      'icon@3x.png': solidPng(87, icon),
    },
    certificates,
    {
      formatVersion: 1,
      passTypeIdentifier: env.APPLE_PASS_TYPE_IDENTIFIER,
      teamIdentifier: env.APPLE_TEAM_ID,
      organizationName: snapshot.tenantName,
      description: `${snapshot.programTitle} - ${snapshot.tenantName}`,
      logoText: snapshot.tenantName,
      serialNumber: snapshot.serialNumber,
      // Web service para que el iPhone se registre y descargue actualizaciones (ver apple-wallet.routes)
      webServiceURL: `${env.PUBLIC_BASE_URL}/api/apple`,
      authenticationToken: snapshot.authenticationToken,
      backgroundColor: hexToRgb(snapshot.colors.background),
      foregroundColor: hexToRgb(snapshot.colors.primary),
      labelColor: hexToRgb(snapshot.colors.label),
      sharingProhibited: true,
      voided: snapshot.status !== 'active',
    },
  );
  // Tarjeta de fidelización (storeCard), con la API de tipos de passkit-generator 3.6
  const card = new PassType('storeCard');
  card.headerFields.push({
    key: 'stamps',
    label: 'SELLOS',
    value: `${snapshot.currentStamps}/${snapshot.totalStamps}`,
    changeMessage: 'Ahora tienes %@ sellos',
  });
  card.primaryFields.push({ key: 'program', label: 'PROGRAMA', value: snapshot.programTitle });
  card.secondaryFields.push(
    { key: 'customer', label: 'TITULAR', value: snapshot.customerFirstName },
    {
      key: 'rewards',
      label: 'PREMIOS DISPONIBLES',
      value: snapshot.pendingRewards,
      changeMessage: 'Tienes %@ premios por canjear',
    },
  );
  card.backFields.push(
    { key: 'reward', label: 'Premio', value: snapshot.rewardDescription ?? snapshot.rewardTitle },
    { key: 'redeemed', label: 'Premios canjeados', value: snapshot.rewardsRedeemed },
    { key: 'serial', label: 'Número de tarjeta', value: snapshot.serialNumber },
  );
  pass.types.push(card);

  // El cajero escanea este QR: su contenido es el serial (passToken de /loyalty/stamps)
  pass.setBarcodes({
    format: 'PKBarcodeFormatQR',
    message: snapshot.serialNumber,
    messageEncoding: 'iso-8859-1',
    altText: snapshot.serialNumber,
  });

  return pass.getAsBuffer();
}
