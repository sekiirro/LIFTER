import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, checked, createStaff, sql } from './harness';

const db = sql();
let po: Awaited<ReturnType<typeof createStaff>>;
let trainer: Awaited<ReturnType<typeof createStaff>>;
let sales: Awaited<ReturnType<typeof createStaff>>;

beforeAll(async () => {
  po = await createStaff('platform_owner', 'p7-payroll-po');
  trainer = await createStaff('trainer', 'p7-payroll-trainer');
  sales = await createStaff('sales', 'p7-payroll-sales');
});

afterAll(async () => {
  await db.end();
  for (const actor of [po, trainer, sales]) {
    if (actor) await admin().auth.admin.deleteUser(actor.userId);
  }
});

const input = (overrides: Record<string, unknown> = {}) => ({
  p_employee_id: trainer.userId,
  p_effective_month: '2026-11-01',
  p_category: 'incentive',
  p_amount_minor: 9223372036854770000n.toString(),
  p_currency: 'EGP',
  p_reason_ref: randomUUID(),
  p_supersedes_input_id: null,
  p_idempotency_key: randomUUID(),
  ...overrides,
});

async function post(actor: Awaited<ReturnType<typeof createStaff>>, args: ReturnType<typeof input>) {
  const result = await actor.client.rpc('p7_post_monetary_payroll_input', args);
  if (result.error) throw new Error(result.error.message);
  return result.data as string;
}

describe('P7 manual payroll money inputs', () => {
  it('stores exact minor units, currency, category, actor and immutable correction lineage', async () => {
    const firstKey = randomUUID();
    const firstId = await post(po, input({ p_idempotency_key: firstKey }));
    const correction = input({
      p_category: 'correction',
      p_amount_minor: '-9223372036854770000',
      p_supersedes_input_id: firstId,
    });
    const correctionId = await post(po, correction);
    const rows = await db`
      select id, employee_id, effective_month, category, amount_minor::text as amount_minor,
        currency, actor_id, supersedes_input_id, idempotency_key
      from public.p7_monetary_payroll_inputs
      where id in (${firstId}::uuid, ${correctionId}::uuid)
      order by effective_month, id
    `;
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employee_id: trainer.userId,
          effective_month: '2026-11-01',
          category: 'incentive',
          amount_minor: '9223372036854770000',
          currency: 'EGP',
          actor_id: po.userId,
          supersedes_input_id: null,
          idempotency_key: firstKey,
        }),
        expect.objectContaining({
          category: 'correction',
          amount_minor: '-9223372036854770000',
          currency: 'EGP',
          actor_id: po.userId,
          supersedes_input_id: firstId,
        }),
      ]),
    );
    const [triggers] = await db`
      select count(*)::int as count from pg_trigger
      where tgrelid = 'public.p7_monetary_payroll_inputs'::regclass and not tgisinternal
    `;
    expect(triggers.count).toBe(0);
  });

  it('is idempotent for the same request and rejects changed arguments under the same key', async () => {
    const key = randomUUID();
    const args = input({ p_idempotency_key: key });
    const [one, two] = await Promise.all([post(po, args), post(po, args)]);
    expect(one).toBe(two);
    await expect(
      post(po, { ...args, p_amount_minor: '42' }),
    ).rejects.toThrow();
    const [count] = await db`
      select count(*)::int as count from public.p7_monetary_payroll_inputs where idempotency_key = ${key}::uuid
    `;
    expect(count.count).toBe(1);
  });

  it('serializes parallel distinct writes without losing either manual input', async () => {
    const [a, b] = await Promise.all([
      post(po, input({ p_currency: 'USD' })),
      post(po, input({ p_currency: 'SAR' })),
    ]);
    expect(a).not.toBe(b);
    const [count] = await db`
      select count(*)::int as count from public.p7_monetary_payroll_inputs where id in (${a}::uuid, ${b}::uuid)
    `;
    expect(count.count).toBe(2);
  });

  it('rejects staff writes and direct table access while preserving staff identities', async () => {
    await expect(post(trainer, input())).rejects.toThrow();
    await expect(post(sales, input({ p_employee_id: trainer.userId }))).rejects.toThrow();
    const results = await Promise.all([
      trainer.client.from('p7_monetary_payroll_inputs').select('*'),
      sales.client.from('p7_monetary_payroll_inputs').select('*'),
    ]);
    for (const result of results) expect(result.error).not.toBeNull();
  });
});
