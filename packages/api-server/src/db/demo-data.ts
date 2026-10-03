import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db as defaultDb } from './index.js';
import {
  branches,
  customers,
  loyaltyPrograms,
  passes,
  staffUsers,
  tenants,
  transactions,
} from './schema.js';

// Datos demo compartidos por `npm run db:seed` y por las pruebas automáticas.
export const DEMO = {
  tenantSlug: 'agencia-demo',
  admin: { email: 'admin@agenciademo.com', password: 'admin1234' },
  cashier: { email: 'cajero@agenciademo.com', password: 'demo1234', pin: '1234' },
  passSerial: 'DEMO-0001',
} as const;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Guardrail anti-destrucción: seedDemoData BORRA el tenant demo en cascada.
 * Devuelve el motivo para no ejecutarlo, o null si es seguro.
 * Se compara el hostname ya parseado: buscar "localhost" en el texto de la URL
 * aceptaría, por ejemplo, una contraseña "localhost" de una BD remota.
 */
export function seedBlockReason(nodeEnv: string, databaseUrl: string): string | null {
  if (nodeEnv === 'production') return 'NODE_ENV=production';
  let host = '';
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    // URL ilegible: no se puede saber a dónde apunta
  }
  return LOCAL_HOSTS.has(host) ? null : `la BD no es local (host actual: "${host || '?'}")`;
}

// bcrypt es lento a propósito: se calcula una vez por proceso (las pruebas resetean seguido)
let hashes: Promise<[string, string, string]> | undefined;
const demoHashes = () =>
  (hashes ??= Promise.all([
    bcrypt.hash(DEMO.admin.password, 10),
    bcrypt.hash(DEMO.cashier.password, 10),
    bcrypt.hash(DEMO.cashier.pin, 10),
  ]));

type Database = typeof defaultDb;

/** Recrea el tenant demo desde cero (idempotente). */
export async function seedDemoData(database: Database = defaultDb) {
  const [adminHash, cashierHash, pinHash] = await demoHashes();

  return database.transaction(async (tx) => {
    // Borra el tenant demo anterior (todo lo demás cae en cascada).
    await tx.delete(tenants).where(eq(tenants.slug, DEMO.tenantSlug));

    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: 'Agencia Demo',
        slug: DEMO.tenantSlug,
        ownerEmail: 'contacto@agenciademo.com',
        planTier: 'pro',
      })
      .returning();

    const [branch] = await tx
      .insert(branches)
      .values({
        tenantId: tenant.id,
        name: 'Sucursal Centro',
        code: 'CENTRO',
        address: 'Av. Principal 123',
        phone: '+520000000001',
      })
      .returning();

    // Administrador del tenant (sin sucursal: gestiona todas)
    await tx.insert(staffUsers).values({
      tenantId: tenant.id,
      email: DEMO.admin.email,
      passwordHash: adminHash,
      fullName: 'Admin Demo',
      role: 'admin',
    });

    const [staff] = await tx
      .insert(staffUsers)
      .values({
        tenantId: tenant.id,
        branchId: branch.id,
        email: DEMO.cashier.email,
        passwordHash: cashierHash,
        pinHash,
        fullName: 'Cajero Demo',
        role: 'cashier',
      })
      .returning();

    const [program] = await tx
      .insert(loyaltyPrograms)
      .values({
        tenantId: tenant.id,
        title: 'Programa VIP Tarjeta Digital',
        stampRuleType: 'per_amount',
        amountPerStamp: '10.00',
        totalStamps: 10,
        rewardTitle: 'Café gratis',
        primaryColor: '#1E3A8A',
      })
      .returning();

    const [customer] = await tx
      .insert(customers)
      .values({
        tenantId: tenant.id,
        phone: '+520000000000',
        firstName: 'Cliente',
        lastName: 'Prueba',
        email: 'cliente@ejemplo.com',
      })
      .returning();

    const [pass] = await tx
      .insert(passes)
      .values({
        tenantId: tenant.id,
        programId: program.id,
        customerId: customer.id,
        serialNumber: DEMO.passSerial, // fijo para poder probar el escaneo del QR
        authenticationToken: randomBytes(32).toString('hex'),
        currentStamps: 3,
        carryoverAmount: '5.00',
      })
      .returning();

    // Compra de $35 con regla $10 = 1 sello → 3 sellos y $5 de sobrante.
    await tx.insert(transactions).values({
      tenantId: tenant.id,
      passId: pass.id,
      staffId: staff.id,
      branchId: branch.id,
      type: 'add_stamp',
      purchaseAmount: '35.00',
      stampsAdded: 3,
    });

    return { tenantId: tenant.id, branchId: branch.id, programId: program.id, customerId: customer.id, passId: pass.id };
  });
}
