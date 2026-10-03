import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { env } from '../env.js';
import { db } from './index.js';
import {
  branches,
  customers,
  loyaltyPrograms,
  passes,
  staffUsers,
  tenants,
  transactions,
} from './schema.js';

const DEMO_SLUG = 'agencia-demo';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// Guardrail anti-destrucción: el seed BORRA el tenant demo en cascada.
// Se compara el hostname ya parseado: buscar "localhost" en el texto de la URL
// aceptaría, por ejemplo, una contraseña "localhost" de una BD remota.
function assertSafeToSeed() {
  let host = '';
  try {
    host = new URL(env.DATABASE_URL).hostname;
  } catch {
    // URL ilegible: no se puede saber a dónde apunta → no se ejecuta
  }
  if (env.NODE_ENV === 'production' || !LOCAL_HOSTS.has(host)) {
    console.error(
      `❌ SEED ABORTADO: solo se ejecuta fuera de producción y contra una BD local (host actual: "${host || '?'}").`,
    );
    process.exit(1);
  }
}

async function seed() {
  assertSafeToSeed();
  console.log('🌱 Iniciando carga de datos de prueba...');

  const tenantData = await db.transaction(async (tx) => {
    // Idempotente: borra el tenant demo anterior (todo lo demás cae en cascada).
    await tx.delete(tenants).where(eq(tenants.slug, DEMO_SLUG));

    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: 'Agencia Demo',
        slug: DEMO_SLUG,
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
      email: 'admin@agenciademo.com',
      passwordHash: await bcrypt.hash('admin1234', 10),
      fullName: 'Admin Demo',
      role: 'admin',
    });

    const [staff] = await tx
      .insert(staffUsers)
      .values({
        tenantId: tenant.id,
        branchId: branch.id,
        email: 'cajero@agenciademo.com',
        passwordHash: await bcrypt.hash('demo1234', 10),
        pinHash: await bcrypt.hash('1234', 10),
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
        serialNumber: 'DEMO-0001', // fijo para poder probar el escaneo del QR
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

    return tx.query.tenants.findFirst({
      where: eq(tenants.id, tenant.id),
      with: {
        branches: { with: { staffUsers: { columns: { passwordHash: false, pinHash: false } } } },
        loyaltyPrograms: true,
        customers: { with: { passes: { with: { transactions: true } } } },
      },
    });
  });

  console.log('\n📊 Datos verificados con db.query:');
  console.dir(tenantData, { depth: null });
  console.log('\n✅ Seed completado. Tenant: agencia-demo');
  console.log('   Cajero: cajero@agenciademo.com / demo1234 (PIN 1234)');
  console.log('   Admin:  admin@agenciademo.com / admin1234');
}

seed()
  .catch((err) => {
    console.error('❌ Error ejecutando el seed:', err);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());