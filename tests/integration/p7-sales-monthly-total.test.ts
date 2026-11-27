import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { anonClient } from './harness';
import { clientContext, sql } from './registration-approval-fixture';

const db = sql();
afterAll(async () => db.end());

describe('P7 T025 Sales monthly projection backend read', () => {
  it('returns own finalized total after Cairo month-end and PO finalization', async () => {
    const context = await clientContext();
    const closedMonth = '2026-10-01';
    const snapshotId = randomUUID();
    const totals = {
      [context.salesA.userId]: '25.00',
      [context.trainerA.userId]: '12.00',
    };

    // Seed a finalized snapshot with salesA total and trainerA total
    await db`
      insert into public.p7_month_snapshots (
        id, workspace_id, effective_month, formula_version,
        source_watermark, totals, finalized_by
      ) values (
        ${snapshotId}, ${context.wsA.id}, ${closedMonth}, 'p7-net-points-v1',
        clock_timestamp(),
        ${db.json(totals)},
        ${context.po.userId}
      )
      on conflict (workspace_id, effective_month) do update
      set totals = ${db.json(totals)}`;

    const res = await context.salesA.client.rpc('p7_get_sales_monthly_total', {
      p_workspace_id: context.wsA.id,
      p_month: closedMonth,
    });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({
      status: 'finalized',
      month: closedMonth,
      total: '25.00',
    });

    // Also verify the alias function
    const aliasRes = await context.salesA.client.rpc(
      'get_sales_monthly_total',
      {
        p_workspace_id: context.wsA.id,
        p_month: closedMonth,
      },
    );
    expect(aliasRes.error).toBeNull();
    expect(aliasRes.data).toEqual({
      status: 'finalized',
      month: closedMonth,
      total: '25.00',
    });

    // Calling with explicit own staff id succeeds identically
    const ownIdRes = await context.salesA.client.rpc(
      'p7_get_sales_monthly_total',
      {
        p_workspace_id: context.wsA.id,
        p_month: closedMonth,
        p_staff_user_id: context.salesA.userId,
      },
    );
    expect(ownIdRes.error).toBeNull();
    expect(ownIdRes.data).toEqual({
      status: 'finalized',
      month: closedMonth,
      total: '25.00',
    });
  });

  it('returns empty state when Sales employee has no total in finalized snapshot', async () => {
    const context = await clientContext();
    const closedMonth = '2026-09-01';
    const snapshotId = randomUUID();
    const totals = {
      [context.trainerA.userId]: '15.00',
    };

    await db`
      insert into public.p7_month_snapshots (
        id, workspace_id, effective_month, formula_version,
        source_watermark, totals, finalized_by
      ) values (
        ${snapshotId}, ${context.wsA.id}, ${closedMonth}, 'p7-net-points-v1',
        clock_timestamp(),
        ${db.json(totals)},
        ${context.po.userId}
      )
      on conflict (workspace_id, effective_month) do update
      set totals = ${db.json(totals)}`;

    const res = await context.salesA.client.rpc('p7_get_sales_monthly_total', {
      p_workspace_id: context.wsA.id,
      p_month: closedMonth,
    });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({
      status: 'empty',
      month: closedMonth,
      total: null,
    });
  });

  it('returns not_available before Cairo month-end or before PO finalization', async () => {
    const context = await clientContext();

    // 1. Current open Cairo month: month has not ended
    const [period] = await db`
      select date_trunc('month', clock_timestamp() at time zone 'Africa/Cairo')::date::text as current_month`;
    const currentMonth = period!.current_month as string;

    const openMonthRes = await context.salesA.client.rpc(
      'p7_get_sales_monthly_total',
      {
        p_workspace_id: context.wsA.id,
        p_month: currentMonth,
      },
    );
    expect(openMonthRes.error).toBeNull();
    expect(openMonthRes.data).toEqual({
      status: 'not_available',
    });

    // 2. Past month that is NOT finalized by PO
    const unfinalizedPastMonth = '2026-07-01';
    await db`
      delete from public.p7_month_snapshots
      where workspace_id = ${context.wsA.id} and effective_month = ${unfinalizedPastMonth}`;

    const unfinalizedRes = await context.salesA.client.rpc(
      'p7_get_sales_monthly_total',
      {
        p_workspace_id: context.wsA.id,
        p_month: unfinalizedPastMonth,
      },
    );
    expect(unfinalizedRes.error).toBeNull();
    expect(unfinalizedRes.data).toEqual({
      status: 'not_available',
    });
  });

  it('denies non-Sales callers, foreign workspaces, and querying another staff id with 42501', async () => {
    const context = await clientContext();
    const closedMonth = '2026-10-01';

    // Anon caller
    const anonRes = await anonClient().rpc('p7_get_sales_monthly_total', {
      p_workspace_id: context.wsA.id,
      p_month: closedMonth,
    });
    expect(anonRes.error).toBeDefined();
    expect(anonRes.error?.code).toBe('42501');

    // WO caller
    const woRes = await context.woA.client.rpc('p7_get_sales_monthly_total', {
      p_workspace_id: context.wsA.id,
      p_month: closedMonth,
    });
    expect(woRes.error).toBeDefined();
    expect(woRes.error?.code).toBe('42501');

    // Trainer caller
    const trainerRes = await context.trainerA.client.rpc(
      'p7_get_sales_monthly_total',
      {
        p_workspace_id: context.wsA.id,
        p_month: closedMonth,
      },
    );
    expect(trainerRes.error).toBeDefined();
    expect(trainerRes.error?.code).toBe('42501');

    // PO caller
    const poRes = await context.po.client.rpc('p7_get_sales_monthly_total', {
      p_workspace_id: context.wsA.id,
      p_month: closedMonth,
    });
    expect(poRes.error).toBeDefined();
    expect(poRes.error?.code).toBe('42501');

    // Sales caller in foreign workspace (where salesA is not a member)
    const foreignRes = await context.salesA.client.rpc(
      'p7_get_sales_monthly_total',
      {
        p_workspace_id: context.wsB.id,
        p_month: closedMonth,
      },
    );
    expect(foreignRes.error).toBeDefined();
    expect(foreignRes.error?.code).toBe('42501');

    // Sales caller attempting to pass another staff id
    const anotherStaffRes = await context.salesA.client.rpc(
      'p7_get_sales_monthly_total',
      {
        p_workspace_id: context.wsA.id,
        p_month: closedMonth,
        p_staff_user_id: context.trainerA.userId,
      },
    );
    expect(anotherStaffRes.error).toBeDefined();
    expect(anotherStaffRes.error?.code).toBe('42501');
  });

  it('kill-test: own-id guard mutation fails authorization check', async () => {
    const [original] = await db`
      select pg_get_functiondef('public.p7_get_sales_monthly_total(uuid,date,uuid)'::regprocedure) as def`;
    const originalDef = original!.def as string;

    const guardCheck = `if p_staff_user_id is not null and p_staff_user_id is distinct from actor then
    raise exception 'not_permitted' using errcode = '42501';
  end if;`;
    expect(originalDef).toContain(
      "raise exception 'not_permitted' using errcode = '42501'",
    );

    // Mutate by removing the own-id guard
    const mutatedDef = originalDef.replace(
      guardCheck,
      '-- own-id guard removed for kill-test',
    );
    expect(mutatedDef).not.toEqual(originalDef);
    await db.unsafe(mutatedDef);

    try {
      const context = await clientContext();
      const closedMonth = '2026-10-01';
      // Calling with another staff id should have thrown 42501, but with mutated guard it does not throw
      const leakedRes = await context.salesA.client.rpc(
        'p7_get_sales_monthly_total',
        {
          p_workspace_id: context.wsA.id,
          p_month: closedMonth,
          p_staff_user_id: context.trainerA.userId,
        },
      );
      // Leak occurred (guard was killed)
      expect(leakedRes.error).toBeNull();
    } finally {
      // Restore byte-identically
      await db.unsafe(originalDef);
    }
  });

  it('kill-test: finalization guard mutation fails unfinalized check', async () => {
    const [original] = await db`
      select pg_get_functiondef('public.p7_get_sales_monthly_total(uuid,date,uuid)'::regprocedure) as def`;
    const originalDef = original!.def as string;

    const finalizationCheck = `if not found or snapshot_totals is null then
    return pg_catalog.jsonb_build_object('status', 'not_available');
  end if;`;
    expect(originalDef).toContain(
      "return pg_catalog.jsonb_build_object('status', 'not_available');",
    );

    // Mutate by bypassing finalization check
    const mutatedDef = originalDef.replace(
      finalizationCheck,
      "snapshot_totals := '{}'::jsonb; -- finalization guard removed",
    );
    expect(mutatedDef).not.toEqual(originalDef);
    await db.unsafe(mutatedDef);

    try {
      const context = await clientContext();
      const unfinalizedPastMonth = '2026-06-01';
      await db`
        delete from public.p7_month_snapshots
        where workspace_id = ${context.wsA.id} and effective_month = ${unfinalizedPastMonth}`;

      const res = await context.salesA.client.rpc(
        'p7_get_sales_monthly_total',
        {
          p_workspace_id: context.wsA.id,
          p_month: unfinalizedPastMonth,
        },
      );
      // Should have returned not_available, but with mutated guard it returns empty
      expect(res.data?.status).toBe('empty');
    } finally {
      // Restore byte-identically
      await db.unsafe(originalDef);
    }
  });
});
