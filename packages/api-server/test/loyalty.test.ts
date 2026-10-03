import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO, apiClient, createTestApp, queryOne, resetDatabase, sql } from './helpers.js';

const PASS = `/api/v1/loyalty/pass/${DEMO.passSerial}`;

describe('caja: sellos, premios y canje (/api/v1/loyalty)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let api: ReturnType<typeof apiClient>;
  let cashier: string;

  const stamp = (amountSpent: number, extra: Record<string, unknown> = {}, token = cashier) =>
    api.post('/api/v1/loyalty/stamps', { passToken: DEMO.passSerial, amountSpent, ...extra }, token);
  const redeem = (extra: Record<string, unknown> = {}, token = cashier) =>
    api.post('/api/v1/loyalty/redeem', { passToken: DEMO.passSerial, ...extra }, token);
  const setProgram = (set: ReturnType<typeof sql>) =>
    queryOne(sql`update loyalty_programs set ${set} where id = (select program_id from passes where serial_number = ${DEMO.passSerial})`);

  beforeAll(async () => {
    app = await createTestApp();
    api = apiClient(app);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetDatabase();
    cashier = await api.loginCashier();
  });

  it('GET programas: el cajero ve solo los activos de su negocio', async () => {
    const admin = await api.loginAdmin();
    await api.post('/api/v1/admin/programs', { title: 'Borrador', stampRuleType: 'per_visit', totalStamps: 5, rewardTitle: 'Premio', status: 'draft' }, admin);
    await queryOne(sql`
      with t as (insert into tenants (name, slug, owner_email) values ('Otro', 'test-otro', 'o@o.com') returning id)
      insert into loyalty_programs (tenant_id, title, reward_title) select id, 'Ajeno', 'Premio' from t returning id`);

    const res = await api.get('/api/v1/loyalty/programs', cashier);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { title: string }) => p.title)).toEqual(['Programa VIP Tarjeta Digital']);
    expect(res.body.data[0]).toMatchObject({ totalStamps: 10, rewardTitle: 'Café gratis', stampRuleType: 'per_amount' });
    expect((await api.get('/api/v1/loyalty/programs')).status).toBe(401);
  });

  it('GET pase: estado actual sin exponer authenticationToken', async () => {
    const res = await api.get(PASS, cashier);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ currentStamps: 3, carryoverAmount: '5.00', pendingRewards: [] });
    expect(JSON.stringify(res.body)).not.toContain('authenticationToken');
  });

  it('sobrante en centavos exactos: $35.30 + $5 → 4 sellos, sobra $0.30; luego $0.70 → $1.00', async () => {
    let res = await stamp(35.3);
    expect(res.body.data).toMatchObject({ stampsEarned: 4, currentStamps: 7, carryoverAmount: '0.30' });
    res = await stamp(0.7);
    expect(res.body.data).toMatchObject({ stampsEarned: 0, carryoverAmount: '1.00' });
  });

  it('completar tarjetas genera premios pendientes y conserva el resto de sellos', async () => {
    let res = await stamp(70); // 3 + 7(+5 sobrante → 75/10 = 7) = 10 → 1 premio, quedan 0
    expect(res.body.data).toMatchObject({ rewardsEarned: 1, currentStamps: 0, pendingRewards: 1 });
    res = await stamp(200); // 20 sellos → 2 premios más
    expect(res.body.data).toMatchObject({ rewardsEarned: 2, currentStamps: 0, pendingRewards: 3 });

    const pass = await api.get(PASS, cashier);
    expect(pass.body.data.pendingRewards).toHaveLength(3);
    expect(pass.body.data.pendingRewards[0].rewardTitle).toBe('Café gratis');
  });

  it('dos escaneos simultáneos del mismo QR cuentan ambos (bloqueo FOR UPDATE)', async () => {
    const [a, b] = await Promise.all([stamp(10), stamp(10)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    // 3 sellos + $5 sobrante: 10+5 → 1 sello (sobra 5), 10+5 → 1 sello
    expect((await api.get(PASS, cashier)).body.data.currentStamps).toBe(5);
  });

  it('canje: el más antiguo sin rewardId, uno específico con rewardId, errores 404/409', async () => {
    await stamp(270); // 3 premios
    const pending = (await api.get(PASS, cashier)).body.data.pendingRewards as { id: string }[];

    let res = await redeem();
    expect(res.status).toBe(200);
    expect(res.body.data.redemptionId).toBe(pending[0].id);

    expect((await redeem({ rewardId: pending[0].id })).status).toBe(409); // ya canjeado
    expect((await redeem({ rewardId: pending[2].id, notes: 'canje específico' })).body.data.redemptionId).toBe(pending[2].id);
    expect((await redeem({ rewardId: randomUUID() })).status).toBe(404);

    await redeem();
    res = await redeem();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/no tiene recompensas/);

    const row = await queryOne<{ rewards_redeemed: number }>(
      sql`select rewards_redeemed from passes where serial_number = ${DEMO.passSerial}`,
    );
    expect(row.rewards_redeemed).toBe(3);
  });

  it('bajo el monto mínimo: 0 sellos y el sobrante no cambia', async () => {
    await setProgram(sql`min_purchase_amount = 50`);
    const res = await stamp(30);
    expect(res.body.data).toMatchObject({ stampsEarned: 0, belowMinimum: true, carryoverAmount: '5.00' });
  });

  it('regla por visita: 1 sello sin importar el monto', async () => {
    await setProgram(sql`stamp_rule_type = 'per_visit'`);
    expect((await stamp(500)).body.data).toMatchObject({ stampsEarned: 1, currentStamps: 4 });
  });

  it('pase suspendido o programa no activo → 409', async () => {
    await queryOne(sql`update passes set status = 'suspended' where serial_number = ${DEMO.passSerial}`);
    expect((await stamp(10)).status).toBe(409);
    await queryOne(sql`update passes set status = 'active' where serial_number = ${DEMO.passSerial}`);

    await setProgram(sql`status = 'archived'`);
    const res = await stamp(10);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/no está activo/);
  });

  it('validaciones: pase inexistente 404, montos inválidos 400, sin token 401', async () => {
    expect((await api.get('/api/v1/loyalty/pass/NO-EXISTE', cashier)).status).toBe(404);
    const decimals = await stamp(10.555);
    expect(decimals.status).toBe(400);
    expect(decimals.body.errors.amountSpent).toContain('Máximo 2 decimales');
    expect((await stamp(-5)).status).toBe(400);
    expect((await api.get(PASS)).status).toBe(401);
  });

  describe('sucursal de la operación', () => {
    const txBranch = async (transactionId: string) =>
      (
        await queryOne<{ code: string | null }>(
          sql`select b.code from transactions t left join branches b on b.id = t.branch_id where t.id = ${transactionId}`,
        )
      ).code;

    let admin: string;
    let norte: string;
    beforeEach(async () => {
      admin = await api.loginAdmin();
      norte = (await api.post('/api/v1/admin/branches', { name: 'Sucursal Norte', code: 'NORTE' }, admin)).body.data.id;
    });

    it('cajero: su sucursal por defecto; puede indicarla; otra sucursal → 403', async () => {
      expect(await txBranch((await stamp(10)).body.data.transactionId)).toBe('CENTRO');
      const centro = (await api.get('/api/v1/admin/branches', admin)).body.data.find((b: any) => b.code === 'CENTRO').id;
      expect((await stamp(10, { branchId: centro })).status).toBe(200);
      const other = await stamp(10, { branchId: norte });
      expect(other.status).toBe(403);
      expect((await redeem({ branchId: norte })).status).toBe(403);
    });

    it('admin: sin sucursal por defecto; puede indicar una de su negocio, y queda registrada', async () => {
      expect(await txBranch((await stamp(10, {}, admin)).body.data.transactionId)).toBeNull();
      expect(await txBranch((await stamp(10, { branchId: norte }, admin)).body.data.transactionId)).toBe('NORTE');

      await stamp(200, {}, admin);
      const res = await redeem({ branchId: norte }, admin);
      expect(await txBranch(res.body.data.transactionId)).toBe('NORTE');
      const reward = await queryOne<{ code: string }>(
        sql`select b.code from reward_redemptions r join branches b on b.id = r.redeemed_at_branch_id where r.id = ${res.body.data.redemptionId}`,
      );
      expect(reward.code).toBe('NORTE');
    });

    it('admin con sucursal de OTRO negocio o inexistente → 404; no UUID → 400', async () => {
      const foreign = await queryOne<{ id: string }>(sql`
        with t as (insert into tenants (name, slug, owner_email) values ('Otro', 'test-otro', 'o@o.com') returning id)
        insert into branches (tenant_id, name, code) select id, 'Ajena', 'AJENA' from t returning id`);
      expect((await stamp(10, { branchId: foreign.id }, admin)).status).toBe(404);
      expect((await stamp(10, { branchId: randomUUID() }, admin)).status).toBe(404);
      expect((await stamp(10, { branchId: 'centro' }, admin)).status).toBe(400);
    });
  });
});
