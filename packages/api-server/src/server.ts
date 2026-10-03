import { buildApp } from './app.js';
import { db } from './db/index.js';
import { env } from './env.js';

const app = await buildApp();

// Cierre ordenado: deja de aceptar requests y libera las conexiones a Postgres.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} recibido, cerrando servidor...`);
    await app.close();
    await db.$client.end({ timeout: 5 });
    process.exit(0);
  });
}

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
