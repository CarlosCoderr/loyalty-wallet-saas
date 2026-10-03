import { eq } from 'drizzle-orm';
import { env } from '../env.js';
import { DEMO, seedBlockReason, seedDemoData } from './demo-data.js';
import { db } from './index.js';
import { tenants } from './schema.js';

// CLI: npm run db:seed
async function seed() {
  const blocked = seedBlockReason(env.NODE_ENV, env.DATABASE_URL);
  if (blocked) {
    console.error(`❌ SEED ABORTADO: solo se ejecuta fuera de producción y contra una BD local (${blocked}).`);
    process.exitCode = 1;
    return;
  }

  console.log('🌱 Iniciando carga de datos de prueba...');
  const { tenantId } = await seedDemoData();

  const tenantData = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    with: {
      branches: { with: { staffUsers: { columns: { passwordHash: false, pinHash: false } } } },
      loyaltyPrograms: true,
      customers: { with: { passes: { columns: { authenticationToken: false }, with: { transactions: true } } } },
    },
  });

  console.log('\n📊 Datos verificados con db.query:');
  console.dir(tenantData, { depth: null });
  console.log(`\n✅ Seed completado. Tenant: ${DEMO.tenantSlug}`);
  console.log(`   Cajero: ${DEMO.cashier.email} / ${DEMO.cashier.password} (PIN ${DEMO.cashier.pin})`);
  console.log(`   Admin:  ${DEMO.admin.email} / ${DEMO.admin.password}`);
}

seed()
  .catch((err) => {
    console.error('❌ Error ejecutando el seed:', err);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
