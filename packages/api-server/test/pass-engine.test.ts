import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateApplePKPass, hexToRgb, type AppleCertificates } from '../src/services/pass-engine.service.js';
import type { PassSnapshot } from '../src/services/wallet/wallet.interface.js';

const hasOpenssl = (() => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const snapshot: PassSnapshot = {
  passId: '00000000-0000-0000-0000-000000000001',
  tenantId: '00000000-0000-0000-0000-000000000002',
  tenantName: 'Agencia Demo',
  serialNumber: 'ABC123DEF456',
  authenticationToken: 'a'.repeat(64),
  status: 'active',
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  currentStamps: 7,
  totalStamps: 10,
  pendingRewards: 2,
  rewardsRedeemed: 1,
  programTitle: 'Programa VIP',
  rewardTitle: 'Café gratis',
  rewardDescription: null,
  colors: { primary: '#1E3A8A', background: '#FFFFFF', label: '#000000' },
  customerFirstName: 'María',
  googleLoyaltyObjectId: null,
  appleDevices: [],
};

describe('hexToRgb', () => {
  it('convierte #RRGGBB al formato rgb() que exige Apple', () => {
    expect(hexToRgb('#1E3A8A')).toBe('rgb(30, 58, 138)');
    expect(hexToRgb('#FFFFFF')).toBe('rgb(255, 255, 255)');
  });
});

// Certificados autofirmados SOLO para probar el firmado (iOS no los aceptaría)
describe.skipIf(!hasOpenssl)('generateApplePKPass (firma real con certificados de prueba)', () => {
  let dir: string;
  let certificates: AppleCertificates;
  let files: Record<string, Uint8Array>;
  let passJson: any;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pkpass-test-'));
    const f = (name: string) => join(dir, name);
    const openssl = (...args: string[]) => execFileSync('openssl', args, { stdio: 'pipe' });
    openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('ca.key'), '-out', f('wwdr.pem'), '-days', '2', '-subj', '/CN=Fake WWDR CA');
    openssl('req', '-newkey', 'rsa:2048', '-keyout', f('signer.key'), '-passout', 'pass:prueba123', '-out', f('signer.csr'), '-subj', '/UID=pass.com.test.loyalty/CN=Pass Type ID');
    openssl('x509', '-req', '-in', f('signer.csr'), '-CA', f('wwdr.pem'), '-CAkey', f('ca.key'), '-CAcreateserial', '-out', f('signer.pem'), '-days', '2');

    certificates = {
      wwdr: readFileSync(f('wwdr.pem')),
      signerCert: readFileSync(f('signer.pem')),
      signerKey: readFileSync(f('signer.key')),
      signerKeyPassphrase: 'prueba123',
    };
    files = unzipSync(new Uint8Array(generateApplePKPass(snapshot, certificates)));
    passJson = JSON.parse(Buffer.from(files['pass.json']).toString('utf8'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('contiene pass.json, manifest, firma e íconos', () => {
    expect(Object.keys(files).sort()).toEqual(
      ['icon.png', 'icon@2x.png', 'icon@3x.png', 'manifest.json', 'pass.json', 'signature'].sort(),
    );
  });

  it('pass.json: identidad, web service, colores y datos de la tarjeta', () => {
    expect(passJson).toMatchObject({
      formatVersion: 1,
      passTypeIdentifier: 'pass.com.test.loyalty',
      teamIdentifier: 'TEST123456',
      serialNumber: snapshot.serialNumber,
      organizationName: 'Agencia Demo',
      webServiceURL: 'http://localhost:4000/api/apple',
      authenticationToken: snapshot.authenticationToken,
      foregroundColor: 'rgb(30, 58, 138)',
      voided: false,
    });
    expect(passJson.barcodes[0]).toMatchObject({ format: 'PKBarcodeFormatQR', message: snapshot.serialNumber });
    expect(passJson.storeCard.headerFields[0].value).toBe('7/10');
    expect(passJson.storeCard.secondaryFields).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'rewards', value: 2 })]),
    );
  });

  it('el manifest tiene el SHA-1 correcto de cada archivo', () => {
    const manifest = JSON.parse(Buffer.from(files['manifest.json']).toString('utf8')) as Record<string, string>;
    for (const name of Object.keys(files).filter((n) => n !== 'manifest.json' && n !== 'signature')) {
      expect(manifest[name]).toBe(createHash('sha1').update(files[name]).digest('hex'));
    }
  });

  it('la firma PKCS#7 del manifest es válida y detecta alteraciones', () => {
    const f = (name: string) => join(dir, name);
    writeFileSync(f('signature'), files['signature']);
    writeFileSync(f('manifest.json'), files['manifest.json']);
    const verify = (content: string) =>
      execFileSync('openssl', ['cms', '-verify', '-binary', '-inform', 'DER', '-in', f('signature'), '-content', f(content), '-CAfile', f('wwdr.pem'), '-purpose', 'any', '-out', f('out.txt')], { stdio: 'pipe' });

    expect(() => verify('manifest.json')).not.toThrow();
    writeFileSync(f('tampered.json'), Buffer.from(files['manifest.json']).toString('utf8').replace('a', 'b'));
    expect(() => verify('tampered.json')).toThrow();
  });

  it('un pase suspendido sale como voided', () => {
    const suspended = unzipSync(new Uint8Array(generateApplePKPass({ ...snapshot, status: 'suspended' }, certificates)));
    expect(JSON.parse(Buffer.from(suspended['pass.json']).toString('utf8')).voided).toBe(true);
  });
});
