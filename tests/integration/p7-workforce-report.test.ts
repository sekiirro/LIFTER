import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { clientContext, sql } from './registration-approval-fixture';

const db = sql();
afterAll(async () => db.end());

describe('P7 T013 PO workforce report RPC (p7_workforce_report)', () => {
  it('installs and hardens public.p7_workforce_report(uuid,date)', async () => {
    const [proc] = await db`
      select p.prosecdef, p.proconfig, pg_catalog.pg_get_userbyid(p.proowner) as owner,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
      from pg_proc p where p.oid='public.p7_workforce_report(uuid,date)'::regprocedure`;
    expect(proc).toMatchObject({
      prosecdef: true,
      owner: 'postgres',
      authenticated: true,
      anon: false,
      service_role: false,
    });
    expect(proc!.proconfig).toContain('search_path=""');
  });

  it('denies non-PO roles (trainer, sales, WO) and foreign/nonexistent workspaces with 42501 not_permitted', async () => {
    const context = await clientContext();
    const [period] = await db`
      select date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date::text as month`;
    const month = period!.month as string;

    // Trainer denied
    const trainerCall = await context.trainerA.client.rpc(
      'p7_workforce_report',
      {
        p_workspace_id: context.wsA.id,
        p_month: month,
      },
    );
    expect(trainerCall.error).not.toBeNull();
    expect(trainerCall.error?.code).toBe('42501');
    expect(trainerCall.error?.message).toContain('not_permitted');

    // Sales denied
    const salesCall = await context.salesA.client.rpc('p7_workforce_report', {
      p_workspace_id: context.wsA.id,
      p_month: month,
    });
    expect(salesCall.error).not.toBeNull();
    expect(salesCall.error?.code).toBe('42501');
    expect(salesCall.error?.message).toContain('not_permitted');

    // Workspace Owner denied
    const woCall = await context.woA.client.rpc('p7_workforce_report', {
      p_workspace_id: context.wsA.id,
      p_month: month,
    });
    expect(woCall.error).not.toBeNull();
    expect(woCall.error?.code).toBe('42501');
    expect(woCall.error?.message).toContain('not_permitted');

    // PO on foreign / nonexistent workspace denied with identical 42501 not_permitted (no existence disclosure)
    const nonexistentWs = randomUUID();
    const foreignCall = await context.po.client.rpc('p7_workforce_report', {
      p_workspace_id: nonexistentWs,
      p_month: month,
    });
    expect(foreignCall.error).not.toBeNull();
    expect(foreignCall.error?.code).toBe('42501');
    expect(foreignCall.error?.message).toContain('not_permitted');
  });

  it('rejects invalid period with 22023 invalid_period', async () => {
    const context = await clientContext();
    const invalidCall = await context.po.client.rpc('p7_workforce_report', {
      p_workspace_id: context.wsA.id,
      p_month: '2026-11-15', // not 1st day of month
    });
    expect(invalidCall.error).not.toBeNull();
    expect(invalidCall.error?.code).toBe('22023');
    expect(invalidCall.error?.message).toContain('invalid_period');
  });

  it('returns empty workforce data for open month with no entries', async () => {
    const context = await clientContext();
    const [period] = await db`
      select (date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date
        + interval '1 month')::date::text as future_month`;
    const month = period!.future_month as string;

    const res = await context.po.client.rpc('p7_workforce_report', {
      p_workspace_id: context.wsA.id,
      p_month: month,
    });
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({
      workspace_id: context.wsA.id,
      month: month,
      status: 'current',
      is_closed: false,
      snapshot: null,
      ledger: [],
    });
  });

  it('computes exact signed totals from p7_earned_points and p7_adjustment_entries for PO in open month', async () => {
    const context = await clientContext();
    const [period] = await db`
      select date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date::text as month`;
    const month = period!.month as string;

    const trainerAward = randomUUID();
    const salesAward = randomUUID();
    const adjustmentKey = randomUUID();

    // Insert earned fact for trainer (+1.00)
    await db`
      insert into public.p7_earned_points(workspace_id, staff_user_id, points,
        effective_month, trigger_at, rule_version, source_key, source_hash)
      values (${context.wsA.id}, ${context.trainerA.userId}, 1.00,
        ${month}, statement_timestamp(), 'p7-activation-v1', ${trainerAward}, 'hash-trainer-earned')
      on conflict (workspace_id, source_key) do nothing`;

    // Insert earned fact for sales (+1.00)
    await db`
      insert into public.p7_earned_points(workspace_id, staff_user_id, points,
        effective_month, trigger_at, rule_version, source_key, source_hash)
      values (${context.wsA.id}, ${context.salesA.userId}, 1.00,
        ${month}, statement_timestamp(), 'p7-activation-v1', ${salesAward}, 'hash-sales-earned')
      on conflict (workspace_id, source_key) do nothing`;

    // Insert adjustment for trainer (-2.25)
    await db`
      insert into public.p7_adjustment_entries(workspace_id, staff_user_id, points,
        effective_month, source_key, source_hash, reason_code)
      values (${context.wsA.id}, ${context.trainerA.userId}, -2.25,
        ${month}, ${adjustmentKey}, 'hash-adj-1', 'p7-test-adjustment')
      on conflict (workspace_id, source_key) do nothing`;

    const res = await context.po.client.rpc('p7_workforce_report', {
      p_workspace_id: context.wsA.id,
      p_month: month,
    });
    expect(res.error).toBeNull();
    const data = res.data;

    expect(data.is_closed).toBe(false);
    expect(data.status).toBe('current');
    expect(data.snapshot).toBeNull();

    // Verify trainer totals
    const trainerRow = (
      data.totals as Array<{
        staff_user_id: string;
        role: string;
        points: string;
        is_negative: boolean;
      }>
    ).find((t) => t.staff_user_id === context.trainerA.userId);
    expect(trainerRow).toBeDefined();
    expect(trainerRow?.role).toBe('trainer');
    expect(trainerRow?.points).toBe('-1.25');
    expect(trainerRow?.is_negative).toBe(true);

    // Verify sales totals
    const salesRow = (
      data.totals as Array<{
        staff_user_id: string;
        role: string;
        points: string;
        is_negative: boolean;
      }>
    ).find((t) => t.staff_user_id === context.salesA.userId);
    expect(salesRow).toBeDefined();
    expect(salesRow?.role).toBe('sales');
    expect(salesRow?.points).toBe('1.00');
    expect(salesRow?.is_negative).toBe(false);

    // Verify ledger
    expect(data.ledger.length).toBeGreaterThanOrEqual(3);
    const trainerAdj = (
      data.ledger as Array<{
        id: string;
        staff_user_id: string;
        category: string;
        points: string;
        reason_code: string | null;
      }>
    ).find(
      (l) =>
        l.id &&
        l.staff_user_id === context.trainerA.userId &&
        l.category === 'poAdjustment',
    );
    expect(trainerAdj).toBeDefined();
    expect(trainerAdj?.points).toBe('-2.25');
    expect(trainerAdj?.reason_code).toBe('p7-test-adjustment');
  });

  it('reflects frozen snapshot totals and closed month state after finalization', async () => {
    const context = await clientContext();
    const [period] = await db`
      select (date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date
        - interval '2 month')::date::text as past_month`;
    const pastMonth = period!.past_month as string;

    const tAward = randomUUID();
    await db`
      insert into public.p7_earned_points(workspace_id, staff_user_id, points,
        effective_month, trigger_at, rule_version, source_key, source_hash)
      values (${context.wsA.id}, ${context.trainerA.userId}, 1.00,
        ${pastMonth}, (${pastMonth}::date + 1) at time zone 'Africa/Cairo',
        'p7-activation-v1', ${tAward}, 'hash-freeze-test')
      on conflict (workspace_id, source_key) do nothing`;

    // Finalize the month
    const finRes = await context.po.client.rpc('p7_finalize_month', {
      p_workspace_id: context.wsA.id,
      p_month: pastMonth,
    });
    expect(finRes.error).toBeNull();

    // Read workforce report for the finalized month
    const repRes = await context.po.client.rpc('p7_workforce_report', {
      p_workspace_id: context.wsA.id,
      p_month: pastMonth,
    });
    expect(repRes.error).toBeNull();
    const data = repRes.data;

    expect(data.is_closed).toBe(true);
    expect(data.status).toBe('closed');
    expect(data.snapshot).not.toBeNull();
    expect(data.snapshot.snapshot_version).toBe(1);
    expect(data.snapshot.totals[context.trainerA.userId]).toBe('1.00');

    const trainerRow = (
      data.totals as Array<{ staff_user_id: string; points: string }>
    ).find((t) => t.staff_user_id === context.trainerA.userId);
    expect(trainerRow?.points).toBe('1.00');
  });
});
