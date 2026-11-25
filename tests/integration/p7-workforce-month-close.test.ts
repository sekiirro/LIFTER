import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { clientContext, graph, sql } from './registration-approval-fixture';

const db = sql();
afterAll(async () => db.end());

describe('P7 T028 monthly snapshots and T029 period fence', () => {
  it('keeps earned facts non-PII and installs the shared period and snapshot seams', async () => {
    const [catalog] = await db`
      select to_regclass('public.p7_earned_points')::text as earned,
        to_regclass('public.p7_adjustment_entries')::text as adjustments,
        to_regclass('public.p7_month_snapshots')::text as snapshots,
        to_regprocedure('app_private.p7_lock_period(uuid,date)')::text as period_lock,
        to_regprocedure('app_private.p7_month_for_trigger(timestamptz)')::text as month_for_trigger,
        to_regprocedure('public.p7_finalize_month(uuid,date)')::text as finalizer,
        exists(select 1 from information_schema.columns where table_schema='public'
          and table_name='p7_earned_points' and column_name='client_id') as has_client_id`;
    expect(catalog).toEqual({
      earned: 'p7_earned_points',
      adjustments: 'p7_adjustment_entries',
      snapshots: 'p7_month_snapshots',
      period_lock: 'app_private.p7_lock_period(uuid,date)',
      month_for_trigger:
        'app_private.p7_month_for_trigger(timestamp with time zone)',
      finalizer: 'p7_finalize_month(uuid,date)',
      has_client_id: false,
    });
  });

  it('assigns the Cairo trigger month across local midnight', async () => {
    const [boundary] = await db`
      with local_midnight as (
        select '2026-11-01 00:00:00'::timestamp at time zone 'Africa/Cairo' as instant
      )
      select app_private.p7_month_for_trigger(instant - interval '1 microsecond')::text as before_month,
        app_private.p7_month_for_trigger(instant)::text as at_month from local_midnight`;
    expect(boundary).toEqual({
      before_month: '2026-10-01',
      at_month: '2026-11-01',
    });
  });

  it('denies non-PO finalization and returns the same snapshot for concurrent retries', async () => {
    const context = await clientContext();
    const [period] = await db`
      select (date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date
        - interval '1 month')::date::text as month`;
    const args = {
      p_workspace_id: context.wsA.id,
      p_month: period!.month as string,
    };
    const denied = await context.trainerA.client.rpc('p7_finalize_month', args);
    expect(denied.error).toBeNull();
    expect(denied.data).toMatchObject({ status: 'not_permitted' });

    const results = await Promise.all([
      context.po.client.rpc('p7_finalize_month', args),
      context.po.client.rpc('p7_finalize_month', args),
    ]);
    expect(results.every((result) => result.error === null)).toBe(true);
    expect(results.map((result) => result.data?.status)).toEqual([
      'finalized',
      'finalized',
    ]);
    expect(results[0]!.data!.snapshot_id).toBe(results[1]!.data!.snapshot_id);
    const [count] = await db`
      select count(*)::int as count from public.p7_month_snapshots
      where workspace_id=${context.wsA.id} and effective_month=${period!.month}`;
    expect(count!.count).toBe(1);
  });

  it('snapshots exact signed totals and carries a late adjustment into the current open month', async () => {
    const context = await clientContext();
    const [periods] = await db`
      select (date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date
        - interval '1 month')::date::text as closed_month,
        date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date::text as open_month`;
    const closedMonth = periods!.closed_month as string;
    const openMonth = periods!.open_month as string;
    const trainerAward = randomUUID();
    const salesAward = randomUUID();
    const correctionKey = randomUUID();
    const firstAdjustment = sql();
    const secondAdjustment = sql();
    await db`
      insert into public.p7_earned_points(workspace_id, staff_user_id, points,
        effective_month, trigger_at, rule_version, source_key, source_hash)
      values
        (${context.wsA.id}, ${context.trainerA.userId}, 1.00,
          ${closedMonth}, (${closedMonth}::date + 1) at time zone 'Africa/Cairo',
          'p7-test-v1', ${trainerAward}, 'test-hash-a'),
        (${context.wsA.id}, ${context.salesA.userId}, 1.00,
          ${closedMonth}, (${closedMonth}::date + 1) at time zone 'Africa/Cairo',
          'p7-test-v1', ${salesAward}, 'test-hash-b')`;
    try {
      await Promise.all([
        firstAdjustment`
          insert into public.p7_adjustment_entries(workspace_id, staff_user_id, points,
            effective_month, source_key, source_hash, reason_code)
          values (${context.wsA.id}, ${context.trainerA.userId}, -2.00,
            ${closedMonth}, ${randomUUID()}, 'adjustment-test-hash-a', 'p7-test-correction')`,
        secondAdjustment`
          insert into public.p7_adjustment_entries(workspace_id, staff_user_id, points,
            effective_month, source_key, source_hash, reason_code)
          values (${context.wsA.id}, ${context.trainerA.userId}, -0.25,
            ${closedMonth}, ${randomUUID()}, 'adjustment-test-hash-b', 'p7-test-correction')`,
      ]);
    } finally {
      await Promise.all([firstAdjustment.end(), secondAdjustment.end()]);
    }

    const finalized = await context.po.client.rpc('p7_finalize_month', {
      p_workspace_id: context.wsA.id,
      p_month: closedMonth,
    });
    expect(finalized.error).toBeNull();
    expect(finalized.data).toMatchObject({ status: 'finalized' });
    const [snapshot] = await db`
      select totals from public.p7_month_snapshots
      where workspace_id=${context.wsA.id} and effective_month=${closedMonth}`;
    expect(snapshot!.totals).toEqual({
      [context.trainerA.userId]: '-1.25',
      [context.salesA.userId]: '1.00',
    });

    await db`
      insert into public.p7_adjustment_entries(workspace_id, staff_user_id, points,
        effective_month, source_key, source_hash, reason_code)
      values (${context.wsA.id}, ${context.trainerA.userId}, 0.10,
        ${closedMonth}, ${correctionKey}, 'late-adjustment-hash', 'p7-test-correction')`;
    const [late] = await db`
      select effective_month::text as effective_month, original_month::text as original_month
      from public.p7_adjustment_entries
      where workspace_id=${context.wsA.id} and source_key=${correctionKey}`;
    expect(late).toEqual({
      effective_month: openMonth,
      original_month: closedMonth,
    });
    const [unchanged] = await db`
      select totals from public.p7_month_snapshots
      where workspace_id=${context.wsA.id} and effective_month=${closedMonth}`;
    expect(unchanged!.totals).toEqual(snapshot!.totals);
  });

  it('serializes month close against an adjustment producer on the same period fence', async () => {
    const context = await clientContext();
    const [periods] = await db`
      select (date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date
        - interval '1 month')::date::text as closed_month,
        date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date::text as open_month`;
    const closedMonth = periods!.closed_month as string;
    const openMonth = periods!.open_month as string;
    const sourceKey = randomUUID();
    const adjustmentKey = randomUUID();
    await db`
      insert into public.p7_earned_points(workspace_id, staff_user_id, points,
        effective_month, trigger_at, rule_version, source_key, source_hash)
      values (${context.wsA.id}, ${context.trainerA.userId}, 1.00,
        ${closedMonth}, (${closedMonth}::date + 1) at time zone 'Africa/Cairo',
        'p7-activation-v1', ${sourceKey}, 'race-award-hash')`;

    const writer = sql();
    try {
      const [closed, inserted] = await Promise.all([
        context.po.client.rpc('p7_finalize_month', {
          p_workspace_id: context.wsA.id,
          p_month: closedMonth,
        }),
        writer`
          insert into public.p7_adjustment_entries(workspace_id, staff_user_id, points,
            effective_month, source_key, source_hash, reason_code)
          values (${context.wsA.id}, ${context.trainerA.userId}, -0.50,
            ${closedMonth}, ${adjustmentKey}, 'close-race-hash', 'p7-test-correction')
          returning effective_month::text as effective_month`,
      ]);
      expect(closed.error).toBeNull();
      expect(closed.data).toMatchObject({ status: 'finalized' });
      const [snapshot] = await db`
        select totals from public.p7_month_snapshots
        where workspace_id=${context.wsA.id} and effective_month=${closedMonth}`;
      if (inserted[0]?.effective_month === closedMonth)
        expect(snapshot!.totals).toEqual({ [context.trainerA.userId]: '0.50' });
      else {
        expect(inserted[0]?.effective_month).toBe(openMonth);
        expect(snapshot!.totals).toEqual({ [context.trainerA.userId]: '1.00' });
      }
    } finally {
      await writer.end();
    }
  });

  it('routes a late F19 activation out of a finalized month and keeps its snapshot unchanged', async () => {
    const context = await clientContext();
    const seeded = await db.begin((tx) => graph(tx, context));
    const [periods] = await db`
      select (date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date
        - interval '1 month')::date::text as closed_month,
        date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date::text as open_month`;
    const closedMonth = periods!.closed_month as string;
    const openMonth = periods!.open_month as string;
    const finalized = await context.po.client.rpc('p7_finalize_month', {
      p_workspace_id: context.wsA.id,
      p_month: closedMonth,
    });
    expect(finalized.error).toBeNull();
    expect(finalized.data).toMatchObject({ status: 'finalized' });
    const [snapshotBefore] = await db`
      select totals from public.p7_month_snapshots
      where workspace_id=${context.wsA.id} and effective_month=${closedMonth}`;

    const activationId = randomUUID();
    const unitId = randomUUID();
    await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })},true)`;
      await tx`
        insert into public.subscription_activations(id,workspace_id,subscription_id,activated_at,
          delivery_event_id,activation_source)
        values(${activationId},${context.wsA.id},${seeded.subscription},
          (${closedMonth}::date + 10) at time zone 'Africa/Cairo',${randomUUID()},'po_override')`;
      await tx`
        insert into public.productivity_units(id,workspace_id,client_id,subscription_id,activation_id,
          recipient_trainer_user_id)
        values(${unitId},${context.wsA.id},${seeded.client},${seeded.subscription},
          ${activationId},${context.trainerA.userId})`;
    });

    const [earned] = await db`
      select effective_month::text as effective_month, original_month::text as original_month
      from public.p7_earned_points where workspace_id=${context.wsA.id} and source_key=${unitId}`;
    expect(earned).toEqual({ effective_month: openMonth, original_month: closedMonth });
    const [snapshotAfter] = await db`
      select totals from public.p7_month_snapshots
      where workspace_id=${context.wsA.id} and effective_month=${closedMonth}`;
    expect(snapshotAfter!.totals).toEqual(snapshotBefore!.totals);

    await db`
      insert into public.p7_earned_points(workspace_id,staff_user_id,points,effective_month,
        trigger_at,rule_version,source_key,source_hash,original_month)
      values(${context.wsA.id},${context.trainerA.userId},1.00,${closedMonth},
        (${closedMonth}::date + 10) at time zone 'Africa/Cairo','p7-activation-v1',${unitId},
        'late-f19-idempotent-retry',${closedMonth})
      on conflict (workspace_id,source_key) do nothing`;
    const [count] = await db`
      select count(*)::int as count from public.p7_earned_points
      where workspace_id=${context.wsA.id} and source_key=${unitId}`;
    expect(count!.count).toBe(1);
  });

  it('serializes finalization against a late F19 activation producer', async () => {
    const context = await clientContext();
    const seeded = await db.begin((tx) => graph(tx, context));
    const [periods] = await db`
      select (date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date
        - interval '1 month')::date::text as closed_month,
        date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date::text as open_month`;
    const closedMonth = periods!.closed_month as string;
    const openMonth = periods!.open_month as string;
    const activationId = randomUUID();
    const unitId = randomUUID();
    const producer = db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })},true)`;
      await tx`
        insert into public.subscription_activations(id,workspace_id,subscription_id,activated_at,
          delivery_event_id,activation_source)
        values(${activationId},${context.wsA.id},${seeded.subscription},
          (${closedMonth}::date + 10) at time zone 'Africa/Cairo',${randomUUID()},'po_override')`;
      await tx`
        insert into public.productivity_units(id,workspace_id,client_id,subscription_id,activation_id,
          recipient_trainer_user_id)
        values(${unitId},${context.wsA.id},${seeded.client},${seeded.subscription},
          ${activationId},${context.trainerA.userId})`;
    });
    const [finalized] = await Promise.all([
      context.po.client.rpc('p7_finalize_month', {
        p_workspace_id: context.wsA.id,
        p_month: closedMonth,
      }),
      producer,
    ]);
    expect(finalized.error).toBeNull();
    expect(finalized.data).toMatchObject({ status: 'finalized' });
    const [snapshot] = await db`
      select totals from public.p7_month_snapshots
      where workspace_id=${context.wsA.id} and effective_month=${closedMonth}`;
    const [earned] = await db`
      select effective_month::text as effective_month, original_month::text as original_month
      from public.p7_earned_points where workspace_id=${context.wsA.id} and source_key=${unitId}`;
    expect(earned).toBeDefined();
    if (earned!.effective_month === closedMonth) {
      expect(earned!.original_month).toBe(closedMonth);
      expect(snapshot!.totals).toEqual({ [context.trainerA.userId]: '1.00' });
    } else {
      expect(earned).toEqual({ effective_month: openMonth, original_month: closedMonth });
      expect(snapshot!.totals).toEqual({});
    }
  });
});
