import { describe, expect, it } from 'vitest';
import { seedBlockReason } from '../src/db/demo-data.js';

// El seed BORRA el tenant demo en cascada: solo puede correr en local y fuera de producción
describe('seedBlockReason', () => {
  it('permite BD locales fuera de producción', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(seedBlockReason('development', `postgres://u:p@${host}:5433/loyalty`)).toBeNull();
    }
  });

  it('bloquea siempre con NODE_ENV=production, aunque la BD sea local', () => {
    expect(seedBlockReason('production', 'postgres://u:p@localhost:5432/x')).toMatch(/production/);
  });

  it('bloquea BD remotas aunque "localhost" aparezca en otra parte de la URL', () => {
    expect(seedBlockReason('development', 'postgres://u:localhost@db.prod.com:5432/x')).toMatch(/db\.prod\.com/);
    expect(seedBlockReason('development', 'postgres://localhost:p@db.prod.com/x')).toMatch(/no es local/);
    expect(seedBlockReason('development', 'postgres://u:p@localhost.attacker.com/x')).toMatch(/no es local/);
    expect(seedBlockReason('development', 'postgres://u:p@db.prod.com/localhost')).toMatch(/no es local/);
  });

  it('bloquea URLs ilegibles', () => {
    expect(seedBlockReason('development', 'no-es-una-url')).toMatch(/no es local/);
  });
});
