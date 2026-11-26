import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, anonClient, createStaff, sql } from './harness';

const db = sql();
let po: Awaited<ReturnType<typeof createStaff>>;
let wo: Awaited<ReturnType<typeof createStaff>>;
let trainer: Awaited<ReturnType<typeof createStaff>>;
let sales: Awaited<ReturnType<typeof createStaff>>;

beforeAll(async () => {
  po = await createStaff('platform_owner', 'p7-payroll-po');
  wo = await createStaff('workspace_owner', 'p7-payroll-wo');
  trainer = await createStaff('trainer', 'p7-payroll-trainer');
  sales = await createStaff('sales', 'p7-payroll-sales');
  await setSalary(po, {
    p_employee_id: trainer.userId,
    p_effective_month: '2026-11-01',
    p_market: 'Egypt',
    p_amount_minor: '100000',
    p_currency: 'EGP',
    p_expected_revision: 0,
    p_idempotency_key: randomUUID(),
  });
});

afterAll(async () => {
  await db.end();
  for (const actor of [po, wo, trainer, sales]) {
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

async function post(
  actor: Awaited<ReturnType<typeof createStaff>>,
  args: ReturnType<typeof input>,
) {
  const result = await actor.client.rpc('p7_post_monetary_payroll_input', args);
  if (result.error) throw new Error(result.error.message);
  return result.data as string;
}

type SalaryArgs = {
  p_employee_id: string;
  p_effective_month: string;
  p_market: 'Egypt' | 'International';
  p_amount_minor: string;
  p_currency: string;
  p_expected_revision: number;
  p_idempotency_key: string;
};

async function setSalary(
  actor: Awaited<ReturnType<typeof createStaff>>,
  args: SalaryArgs,
) {
  const result = await actor.client.rpc('p7_set_basic_salary', args);
  if (result.error) throw new Error(result.error.message);
  return result.data as { id: string; revision: number };
}

async function snapshot(
  actor: Awaited<ReturnType<typeof createStaff>>,
  employeeId: string,
  month: string,
) {
  const result = await actor.client.rpc('p7_create_payroll_snapshot', {
    p_employee_id: employeeId,
    p_effective_month: month,
    p_idempotency_key: randomUUID(),
  });
  if (result.error) throw new Error(result.error.message);
  return result.data as {
    id: string;
    version: number;
    amount_minor: string;
    currency: string;
  };
}

async function approve(
  actor: Awaited<ReturnType<typeof createStaff>>,
  employeeId: string,
  month: string,
  reviewed: {
    id: string;
    version: number;
    amount_minor: string;
    currency: string;
  },
  idempotencyKey = randomUUID(),
) {
  const result = await actor.client.rpc('p7_approve_external_payroll', {
    p_employee_id: employeeId,
    p_effective_month: month,
    p_snapshot_id: reviewed.id,
    p_snapshot_version: reviewed.version,
    p_amount_minor: reviewed.amount_minor,
    p_currency: reviewed.currency,
    p_idempotency_key: idempotencyKey,
  });
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
      select id, employee_id, effective_month::text as effective_month, category, amount_minor::text as amount_minor,
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
        and (tgtype & 4) <> 0
    `;
    expect(triggers?.count).toBe(0);
  });

  it('is idempotent for the same request and rejects changed arguments under the same key', async () => {
    const key = randomUUID();
    const args = input({ p_idempotency_key: key });
    const [one, two] = await Promise.all([post(po, args), post(po, args)]);
    expect(one).toBe(two);
    await expect(post(po, { ...args, p_amount_minor: '42' })).rejects.toThrow();
    const [count] = await db`
      select count(*)::int as count from public.p7_monetary_payroll_inputs where idempotency_key = ${key}::uuid
    `;
    expect(count?.count).toBe(1);
  });

  it('serializes parallel distinct writes without losing either manual input', async () => {
    const [a, b] = await Promise.all([post(po, input()), post(po, input())]);
    expect(a).not.toBe(b);
    const [count] = await db`
      select count(*)::int as count from public.p7_monetary_payroll_inputs where id in (${a}::uuid, ${b}::uuid)
    `;
    expect(count?.count).toBe(2);
  });

  it('rejects staff writes and direct table access while preserving staff identities', async () => {
    await expect(post(trainer, input())).rejects.toThrow();
    await expect(
      post(sales, input({ p_employee_id: trainer.userId })),
    ).rejects.toThrow();
    await setSalary(po, {
      p_employee_id: trainer.userId,
      p_effective_month: '2027-03-01',
      p_market: 'Egypt',
      p_amount_minor: '100000',
      p_currency: 'EGP',
      p_expected_revision: 0,
      p_idempotency_key: randomUUID(),
    });
    const reviewed = await snapshot(po, trainer.userId, '2027-03-01');
    await expect(
      setSalary(trainer, {
        p_employee_id: trainer.userId,
        p_effective_month: '2027-03-01',
        p_market: 'Egypt',
        p_amount_minor: '100000',
        p_currency: 'EGP',
        p_expected_revision: 1,
        p_idempotency_key: randomUUID(),
      }),
    ).rejects.toThrow(/p7_platform_owner_required/);
    await expect(
      snapshot(trainer, trainer.userId, '2027-03-01'),
    ).rejects.toThrow(/p7_platform_owner_required/);
    await expect(
      approve(trainer, trainer.userId, '2027-03-01', reviewed),
    ).rejects.toThrow(/p7_platform_owner_required/);
    await expect(post(wo, input())).rejects.toThrow(
      /p7_platform_owner_required/,
    );
    await expect(snapshot(wo, trainer.userId, '2027-03-01')).rejects.toThrow(
      /p7_platform_owner_required/,
    );
    const results = await Promise.all([
      trainer.client.from('p7_monetary_payroll_inputs').select('*'),
      sales.client.from('p7_monetary_payroll_inputs').select('*'),
    ]);
    for (const result of results) expect(result.error).not.toBeNull();
  });
});

describe('P7 own compensation read', () => {
  it('returns only the requested caller-owned compensation and approved snapshot total', async () => {
    const own = await trainer.client.rpc('p7_get_own_compensation', {
      p_employee_id: trainer.userId,
      p_effective_month: '2026-11-01',
    });
    expect(own.error).toBeNull();
    expect(own.data).toMatchObject([
      {
        basic_salary_amount_minor: '100000',
        basic_salary_amount: '1000.00',
        currency: 'EGP',
        approved: false,
        approved_snapshot_total_minor: null,
        approved_snapshot_total: null,
      },
    ]);
    expect(Object.keys((own.data as unknown[])[0] as object).sort()).toEqual([
      'approved',
      'approved_snapshot_total',
      'approved_snapshot_total_minor',
      'basic_salary_amount',
      'basic_salary_amount_minor',
      'currency',
    ]);

    const saleSalary = await setSalary(po, {
      p_employee_id: sales.userId,
      p_effective_month: '2030-01-01',
      p_market: 'International',
      p_amount_minor: '250050',
      p_currency: 'USD',
      p_expected_revision: 0,
      p_idempotency_key: randomUUID(),
    });
    expect(saleSalary.revision).toBe(1);
    const reviewed = await snapshot(po, sales.userId, '2030-01-01');
    const approvalId = await approve(po, sales.userId, '2030-01-01', reviewed);
    expect(approvalId).toBeTruthy();
    const saleOwn = await sales.client.rpc('p7_get_own_compensation', {
      p_employee_id: sales.userId,
      p_effective_month: '2030-01-01',
    });
    expect(saleOwn.error).toBeNull();
    expect(saleOwn.data).toMatchObject([
      {
        basic_salary_amount_minor: '250050',
        basic_salary_amount: '2500.50',
        currency: 'USD',
        approved: true,
        approved_snapshot_total_minor: reviewed.amount_minor,
        approved_snapshot_total: '2500.50',
      },
    ]);

    const poRead = await po.client.rpc('p7_get_own_compensation', {
      p_employee_id: sales.userId,
      p_effective_month: '2030-01-01',
    });
    expect(poRead.error).toBeNull();
    expect(poRead.data).toEqual(saleOwn.data);
  });

  it('denies other staff, WO and anon with the same not_permitted error', async () => {
    const otherStaff = await trainer.client.rpc('p7_get_own_compensation', {
      p_employee_id: sales.userId,
      p_effective_month: '2026-11-01',
    });
    const workspaceOwner = await wo.client.rpc('p7_get_own_compensation', {
      p_employee_id: trainer.userId,
      p_effective_month: '2026-11-01',
    });
    const anonymous = await anonClient().rpc('p7_get_own_compensation', {
      p_employee_id: trainer.userId,
      p_effective_month: '2026-11-01',
    });
    for (const result of [otherStaff, workspaceOwner, anonymous]) {
      expect(result.data).toBeNull();
      expect(result.error).toMatchObject({ code: '42501' });
      expect(result.error?.message).toMatch(/not_permitted/);
    }
  });

  it('T019 kill test: removing the own-id predicate exposes the other salary', async () => {
    const [definition] = await db`
      select pg_catalog.pg_get_functiondef(
        'public.p7_get_own_compensation(uuid,date)'::regprocedure
      ) as sql
    `;
    const predicate = /or\s+p_employee_id\s+is distinct from\s+auth\.uid\(\)/i;
    expect(definition!.sql).toMatch(predicate);
    const mutant = definition!.sql.replace(predicate, 'or false');

    await db
      .begin(async (tx) => {
        await tx.unsafe(mutant);
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: trainer.userId, role: 'authenticated' })}, true)`;
        const rows = await tx`
          select basic_salary_amount_minor
          from public.p7_get_own_compensation(${sales.userId}::uuid, '2030-01-01'::date)
        `;
        expect(rows).toEqual([{ basic_salary_amount_minor: '250050' }]);
        throw new Error('rollback own-id guard mutation');
      })
      .catch((error: { message?: string }) => {
        expect(error.message).toBe('rollback own-id guard mutation');
      });
  });
});

describe('P7 salary snapshots and external-paid approval', () => {
  it('enforces one market-valid salary entitlement per employee/month with append-only revisions', async () => {
    await expect(
      setSalary(po, {
        p_employee_id: sales.userId,
        p_effective_month: '2026-11-01',
        p_market: 'Egypt',
        p_amount_minor: '50000',
        p_currency: 'USD',
        p_expected_revision: 0,
        p_idempotency_key: randomUUID(),
      }),
    ).rejects.toThrow(/invalid_market_currency/);
    const first = await setSalary(po, {
      p_employee_id: sales.userId,
      p_effective_month: '2026-11-01',
      p_market: 'International',
      p_amount_minor: '50000',
      p_currency: 'USD',
      p_expected_revision: 0,
      p_idempotency_key: randomUUID(),
    });
    expect(first.revision).toBe(1);
    const revised = await setSalary(po, {
      p_employee_id: sales.userId,
      p_effective_month: '2026-11-01',
      p_market: 'International',
      p_amount_minor: '60000',
      p_currency: 'USD',
      p_expected_revision: 1,
      p_idempotency_key: randomUUID(),
    });
    expect(revised.revision).toBe(2);
    await expect(
      setSalary(po, {
        p_employee_id: sales.userId,
        p_effective_month: '2026-11-01',
        p_market: 'International',
        p_amount_minor: '70000',
        p_currency: 'USD',
        p_expected_revision: 1,
        p_idempotency_key: randomUUID(),
      }),
    ).rejects.toThrow(/stale_salary_revision/);
    const [current] = await db`
      select revision, amount_minor::text as amount_minor, currency, market
      from public.p7_salary_revisions where employee_id = ${sales.userId}::uuid
        and effective_month = '2026-11-01'::date order by revision desc limit 1
    `;
    expect(current).toEqual({
      revision: 2,
      amount_minor: '60000',
      currency: 'USD',
      market: 'International',
    });
  });

  it('freezes exact salary plus manual inputs and binds one immutable approval to the reviewed snapshot', async () => {
    await setSalary(po, {
      p_employee_id: sales.userId,
      p_effective_month: '2026-12-01',
      p_market: 'International',
      p_amount_minor: '200000',
      p_currency: 'SAR',
      p_expected_revision: 0,
      p_idempotency_key: randomUUID(),
    });
    await post(
      po,
      input({
        p_employee_id: sales.userId,
        p_effective_month: '2026-12-01',
        p_category: 'incentive',
        p_amount_minor: '12345',
        p_currency: 'SAR',
      }),
    );
    await post(
      po,
      input({
        p_employee_id: sales.userId,
        p_effective_month: '2026-12-01',
        p_category: 'deduction',
        p_amount_minor: '2000',
        p_currency: 'SAR',
      }),
    );
    const reviewed = await snapshot(po, sales.userId, '2026-12-01');
    expect(reviewed).toMatchObject({
      amount_minor: '210345',
      currency: 'SAR',
      version: 1,
    });
    const approvalId = await approve(po, sales.userId, '2026-12-01', reviewed);
    const [approval] = await db`
      select snapshot_id, snapshot_version, amount_minor::text as amount_minor, currency, actor_id
      from public.p7_payroll_approvals where id = ${approvalId}::uuid
    `;
    expect(approval).toEqual({
      snapshot_id: reviewed.id,
      snapshot_version: 1,
      amount_minor: '210345',
      currency: 'SAR',
      actor_id: po.userId,
    });
    const [immutability] = await db`
      select count(*)::int as count from pg_trigger
      where tgrelid = 'public.p7_payroll_snapshots'::regclass and not tgisinternal
    `;
    expect(immutability?.count).toBeGreaterThan(0);
    const [approvalGuard] = await db`
      select count(*)::int as count from pg_trigger
      where tgrelid = 'public.p7_payroll_approvals'::regclass and not tgisinternal
    `;
    expect(approvalGuard?.count).toBeGreaterThan(0);
  });

  it('rejects stale snapshots, caller amount/currency changes and mixed-currency months', async () => {
    await setSalary(po, {
      p_employee_id: trainer.userId,
      p_effective_month: '2026-12-01',
      p_market: 'Egypt',
      p_amount_minor: '100000',
      p_currency: 'EGP',
      p_expected_revision: 0,
      p_idempotency_key: randomUUID(),
    });
    await expect(
      post(
        po,
        input({
          p_employee_id: trainer.userId,
          p_effective_month: '2026-12-01',
          p_amount_minor: '20',
          p_currency: 'USD',
        }),
      ),
    ).rejects.toThrow(/salary_currency_mismatch/);
    const first = await snapshot(po, trainer.userId, '2026-12-01');
    await post(
      po,
      input({
        p_employee_id: trainer.userId,
        p_effective_month: '2026-12-01',
        p_amount_minor: '500',
        p_currency: 'EGP',
      }),
    );
    const second = await snapshot(po, trainer.userId, '2026-12-01');
    expect(second).toMatchObject({
      amount_minor: '100500',
      version: 2,
      currency: 'EGP',
    });
    await expect(
      approve(po, trainer.userId, '2026-12-01', first),
    ).rejects.toThrow(/stale_payroll_snapshot/);
    await expect(
      approve(po, trainer.userId, '2026-12-01', {
        ...second,
        amount_minor: '100501',
      }),
    ).rejects.toThrow(/snapshot_binding_mismatch/);
    await expect(
      approve(po, trainer.userId, '2026-12-01', {
        ...second,
        currency: 'USD',
      }),
    ).rejects.toThrow(/snapshot_binding_mismatch/);
    await setSalary(po, {
      p_employee_id: trainer.userId,
      p_effective_month: '2026-12-01',
      p_market: 'International',
      p_amount_minor: '100000',
      p_currency: 'USD',
      p_expected_revision: 1,
      p_idempotency_key: randomUUID(),
    });
    await post(
      po,
      input({
        p_employee_id: trainer.userId,
        p_effective_month: '2026-12-01',
        p_amount_minor: '100',
        p_currency: 'USD',
      }),
    );
    await expect(snapshot(po, trainer.userId, '2026-12-01')).rejects.toThrow(
      /payroll_currency_mismatch/,
    );
    const [captured] = await db`
      select currency, amount_minor::text as amount_minor from public.p7_monetary_payroll_inputs
      where employee_id = ${trainer.userId}::uuid and effective_month = '2026-12-01'::date
        and currency = 'EGP'
      order by created_at limit 1
    `;
    expect(captured).toEqual({ currency: 'EGP', amount_minor: '500' });
  });

  it('allows exactly one employee/month approval under two concurrent idempotency keys', async () => {
    await setSalary(po, {
      p_employee_id: sales.userId,
      p_effective_month: '2027-01-01',
      p_market: 'Egypt',
      p_amount_minor: '80000',
      p_currency: 'EGP',
      p_expected_revision: 0,
      p_idempotency_key: randomUUID(),
    });
    const reviewed = await snapshot(po, sales.userId, '2027-01-01');
    const attempts = await Promise.allSettled([
      approve(po, sales.userId, '2027-01-01', reviewed, randomUUID()),
      approve(po, sales.userId, '2027-01-01', reviewed, randomUUID()),
    ]);
    expect(attempts.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(attempts.filter((item) => item.status === 'rejected')).toHaveLength(
      1,
    );
    const [count] = await db`
      select count(*)::int as count from public.p7_payroll_approvals
      where employee_id = ${sales.userId}::uuid and effective_month = '2027-01-01'::date
    `;
    expect(count?.count).toBe(1);
  });

  it('serializes concurrent salary revisions and snapshot version creation', async () => {
    const salaryAttempts = await Promise.allSettled([
      setSalary(po, {
        p_employee_id: trainer.userId,
        p_effective_month: '2027-02-01',
        p_market: 'Egypt',
        p_amount_minor: '70000',
        p_currency: 'EGP',
        p_expected_revision: 0,
        p_idempotency_key: randomUUID(),
      }),
      setSalary(po, {
        p_employee_id: trainer.userId,
        p_effective_month: '2027-02-01',
        p_market: 'Egypt',
        p_amount_minor: '71000',
        p_currency: 'EGP',
        p_expected_revision: 0,
        p_idempotency_key: randomUUID(),
      }),
    ]);
    expect(
      salaryAttempts.filter((item) => item.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      salaryAttempts.filter((item) => item.status === 'rejected'),
    ).toHaveLength(1);
    const versions = await Promise.all([
      snapshot(po, trainer.userId, '2027-02-01'),
      snapshot(po, trainer.userId, '2027-02-01'),
    ]);
    expect(versions.map((item) => item.version).sort()).toEqual([1, 2]);
    expect(new Set(versions.map((item) => item.id)).size).toBe(2);
  });
});
