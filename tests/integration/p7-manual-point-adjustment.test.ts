import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, createStaff, sql } from './harness';
import { packagesFixture, type PackagesFixture } from './packages-fixture';

const db = sql();
type Fixture = PackagesFixture & {
  targetTrainer: Awaited<ReturnType<typeof createStaff>>;
};
let fixture: Fixture;
let month: string;

beforeAll(async () => {
  const base = await packagesFixture();
  const target = await createStaff('trainer', 'manual-point-target');
  const membership = await admin().from('workspace_memberships').insert({
    workspace_id: base.wsA.id,
    user_id: target.userId,
    granted_by: base.po.userId,
  });
  if (membership.error) throw new Error(membership.error.message);
  fixture = { ...base, targetTrainer: target };
  const [period] = await db`
    select date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date::text as month`;
  month = period!.month as string;
});

afterAll(async () => db.end());

function adjustment(overrides: Record<string, unknown> = {}) {
  return {
    p_workspace_id: fixture.wsA.id,
    p_staff_user_id: fixture.trainerA.userId,
    p_operation: 'add',
    p_points: '2.50',
    p_effective_month: month,
    p_original_entry_kind: null,
    p_original_entry_id: null,
    p_reason: '  Approved manual point change  ',
    p_idempotency_key: randomUUID(),
    ...overrides,
  };
}

function reattribution(overrides: Record<string, unknown> = {}) {
  return {
    p_workspace_id: fixture.wsA.id,
    p_original_entry_kind: 'adjustment',
    p_original_entry_id: randomUUID(),
    p_target_staff_user_id: fixture.targetTrainer.userId,
    p_reason: '  Correct the responsible Trainer  ',
    p_idempotency_key: randomUUID(),
    ...overrides,
  };
}

async function rowsFor(key: string) {
  return db`
    select id::text as id, staff_user_id, points::text as points,
      effective_month::text as effective_month, original_month::text as original_month,
      actor_user_id, operation, original_entry_id, original_entry_kind,
      reason, reason_code, source_key::text as source_key, source_hash
    from public.p7_adjustment_entries
    where workspace_id=${fixture.wsA.id} and source_key=${key}::uuid
    order by id`;
}

describe('P7 T013 PO manual point changes', () => {
  it('installs authenticated-only SECURITY DEFINER RPCs with empty search paths', async () => {
    const procedures = await db`
      select p.oid::regprocedure::text as signature, p.prosecdef, p.proconfig,
        pg_catalog.pg_get_userbyid(p.proowner) as owner,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
      from pg_proc p
      where p.oid in (
        'public.p7_post_point_adjustment(uuid,uuid,text,text,date,text,uuid,text,uuid)'::regprocedure,
        'public.p7_reattribute_point_entry(uuid,text,uuid,uuid,text,uuid)'::regprocedure
      )
      order by signature`;
    expect(procedures).toHaveLength(2);
    for (const procedure of procedures) {
      expect(procedure).toMatchObject({
        prosecdef: true,
        owner: 'postgres',
        authenticated: true,
        anon: false,
        service_role: false,
      });
      expect(procedure.proconfig).toContain('search_path=""');
    }
  });

  it('lets the PO append add, deduct and correction rows with trimmed bounded reasons', async () => {
    const earnedKey = randomUUID();
    await db`
      insert into public.p7_earned_points(workspace_id, staff_user_id, points,
        effective_month, trigger_at, rule_version, source_key, source_hash)
      values(${fixture.wsA.id},${fixture.trainerA.userId},1.00,${month},
        statement_timestamp(),'p7-test-v1',${earnedKey},'manual-point-earned')`;
    const [earned] = await db`
      select id from public.p7_earned_points
      where workspace_id=${fixture.wsA.id} and source_key=${earnedKey}`;

    const add = adjustment();
    const deduct = adjustment({
      p_operation: 'deduct',
      p_points: '-0.75',
      p_reason: 'Approved deduction',
    });
    const correct = adjustment({
      p_operation: 'correct',
      p_points: '-0.25',
      p_effective_month: null,
      p_original_entry_kind: 'earned',
      p_original_entry_id: earned!.id,
      p_reason: 'Correct the earned amount',
    });
    for (const args of [add, deduct, correct]) {
      const result = await fixture.po.client.rpc(
        'p7_post_point_adjustment',
        args,
      );
      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({ status: 'ok', replayed: false });
    }

    const rows = [
      ...(await rowsFor(add.p_idempotency_key as string)),
      ...(await rowsFor(deduct.p_idempotency_key as string)),
      ...(await rowsFor(correct.p_idempotency_key as string)),
    ];
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.points).sort()).toEqual([
      '-0.25',
      '-0.75',
      '2.50',
    ]);
    expect(rows.every((row) => row.actor_user_id === fixture.po.userId)).toBe(
      true,
    );
    expect(rows.every((row) => row.reason_code === null)).toBe(true);
    expect(rows.find((row) => row.operation === 'add')?.reason).toBe(
      'Approved manual point change',
    );
    expect(rows.find((row) => row.operation === 'correct')).toMatchObject({
      original_entry_id: earned!.id,
      original_entry_kind: 'earned',
      effective_month: month,
      original_month: month,
    });

    const quality = await fixture.po.client.rpc('record_monthly_quality', {
      p_workspace_id: fixture.wsA.id,
      p_trainer_id: fixture.trainerA.userId,
      p_month: month.slice(0, 7),
      p_category: 'feedback',
      p_positive_count: 3,
      p_negative_count: 0,
      p_idempotency_key: randomUUID(),
      p_expected_revision: 0,
    });
    expect(quality.error).toBeNull();
    expect(quality.data).toMatchObject({ net_points: '3.00' });
    const [net] = await db`
      select
        (coalesce((select sum(points::numeric) from public.p7_earned_points
          where workspace_id=${fixture.wsA.id} and effective_month=${month}::date),0)
         + coalesce((select sum(points::numeric) from public.p7_adjustment_entries
          where workspace_id=${fixture.wsA.id} and effective_month=${month}::date),0)
         + coalesce((select sum(net_points::numeric) from (
            select distinct on (trainer_id,category) net_points
            from public.p7_monthly_quality_revisions
            where workspace_id=${fixture.wsA.id} and month=${month.slice(0, 7)}
            order by trainer_id,category,revision desc
          ) quality),0))::numeric(10,2)::text as points`;
    expect(net!.points).toBe('5.50');

    const audit = await db`
      select details from public.audit_events
      where target_table='p7_adjustment_entries' and target_id=${rows[0]!.id}::uuid`;
    expect(audit).toHaveLength(1);
    expect(Object.keys(audit[0]!.details as Record<string, unknown>)).toEqual([
      'reference',
    ]);
  });

  it('requires a trimmed 1..500 character reason and stores exactly 500 characters', async () => {
    for (const reason of [null, '', '   ', '\t\r\n ']) {
      const result = await fixture.po.client.rpc(
        'p7_post_point_adjustment',
        adjustment({ p_reason: reason }),
      );
      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({
        status: 'reason_required',
        message: 'A reason is required.',
        message_ar: 'لازم تكتب السبب.',
      });
    }
    const tooLong = await fixture.po.client.rpc(
      'p7_post_point_adjustment',
      adjustment({ p_reason: 'x'.repeat(501) }),
    );
    expect(tooLong.data).toMatchObject({ status: 'invalid_input' });

    const accepted = adjustment({ p_reason: `  ${'x'.repeat(500)}  ` });
    const result = await fixture.po.client.rpc(
      'p7_post_point_adjustment',
      accepted,
    );
    expect(result.data).toMatchObject({ status: 'ok' });
    const [stored] = await rowsFor(accepted.p_idempotency_key as string);
    expect(stored!.reason).toHaveLength(500);
  });

  it('replays one row for the same key and rejects changed arguments without mutation', async () => {
    const args = adjustment();
    const results = await Promise.all([
      fixture.po.client.rpc('p7_post_point_adjustment', args),
      fixture.po.client.rpc('p7_post_point_adjustment', args),
    ]);
    expect(results.every((result) => result.error === null)).toBe(true);
    expect(results.map((result) => result.data?.replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect(results[0]!.data!.entry_id).toBe(results[1]!.data!.entry_id);
    expect(await rowsFor(args.p_idempotency_key as string)).toHaveLength(1);

    const conflict = await fixture.po.client.rpc('p7_post_point_adjustment', {
      ...args,
      p_reason: 'Different reason',
    });
    expect(conflict.data).toMatchObject({ status: 'key_conflict' });
    expect(await rowsFor(args.p_idempotency_key as string)).toHaveLength(1);
    const crossOperation = await fixture.po.client.rpc(
      'p7_reattribute_point_entry',
      {
        ...reattribution({ p_idempotency_key: args.p_idempotency_key }),
      },
    );
    expect(crossOperation.data).toMatchObject({ status: 'key_conflict' });
  });

  it('rejects WO, Trainer, Sales, client and anonymous callers plus foreign targets', async () => {
    const args = adjustment();
    const denied = [
      fixture.woA.client,
      fixture.trainerA.client,
      fixture.salesA.client,
      fixture.actors.client.client,
      fixture.actors.anon.client,
    ];
    for (const [index, client] of denied.entries()) {
      const result = await client.rpc('p7_post_point_adjustment', args);
      expect(result.data?.status ?? result.error?.message).toMatch(
        /not_permitted|permission denied/i,
      );
      if (index < denied.length - 1) expect(result.error?.code).toBe('42501');
    }
    expect(await rowsFor(args.p_idempotency_key as string)).toHaveLength(0);

    const foreign = await fixture.po.client.rpc('p7_post_point_adjustment', {
      ...args,
      p_workspace_id: fixture.wsB.id,
      p_staff_user_id: fixture.trainerA.userId,
      p_idempotency_key: randomUUID(),
    });
    expect(foreign.data).toMatchObject({ status: 'invalid_target' });
    const foreignActor = await fixture.trainerB.client.rpc(
      'p7_post_point_adjustment',
      { ...args, p_idempotency_key: randomUUID() },
    );
    expect(foreignActor.data?.status ?? foreignActor.error?.message).toMatch(
      /not_permitted|permission denied/i,
    );
  });

  it('reattributes by appending a reversal and replacement without changing the original', async () => {
    const originalKey = randomUUID();
    await db`
      insert into public.p7_adjustment_entries(workspace_id,staff_user_id,points,
        effective_month,source_key,source_hash,reason_code)
      values(${fixture.wsA.id},${fixture.trainerA.userId},-0.50,${month},
        ${originalKey},'reattribution-original','checkin_delay')`;
    const [original] = await db`
      select id from public.p7_adjustment_entries
      where workspace_id=${fixture.wsA.id} and source_key=${originalKey}`;
    const args = reattribution({ p_original_entry_id: original!.id });
    const result = await fixture.po.client.rpc(
      'p7_reattribute_point_entry',
      args,
    );
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      status: 'ok',
      replayed: false,
      original_entry_id: original!.id,
    });
    const rows = await db`
      select staff_user_id,points::text as points,operation,original_entry_id,
        original_entry_kind,reason,actor_user_id
      from public.p7_adjustment_entries
      where original_entry_id=${original!.id} and operation='reattribute'
      order by points`;
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.points)).toEqual(['-0.50', '0.50']);
    expect(rows.map((row) => row.staff_user_id).sort()).toEqual(
      [fixture.trainerA.userId, fixture.targetTrainer.userId].sort(),
    );
    expect(
      rows.every((row) => row.reason === 'Correct the responsible Trainer'),
    ).toBe(true);
    expect(rows.every((row) => row.actor_user_id === fixture.po.userId)).toBe(
      true,
    );
    const [unchanged] = await db`
      select staff_user_id,points::text as points from public.p7_adjustment_entries
      where id=${original!.id}`;
    expect(unchanged).toMatchObject({
      staff_user_id: fixture.trainerA.userId,
      points: '-0.50',
    });

    const replay = await fixture.po.client.rpc(
      'p7_reattribute_point_entry',
      args,
    );
    expect(replay.data).toMatchObject({
      status: 'ok',
      replayed: true,
      reversal_id: result.data.reversal_id,
      replacement_id: result.data.replacement_id,
    });
  });

  it('routes closed-month corrections and reattributions to the open month with lineage', async () => {
    const [periods] = await db`
      select (date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date
        - interval '1 month')::date::text as closed_month,
        date_trunc('month', statement_timestamp() at time zone 'Africa/Cairo')::date::text as open_month`;
    const closedMonth = periods!.closed_month as string;
    const openMonth = periods!.open_month as string;
    const earnedKey = randomUUID();
    await db`
      insert into public.p7_earned_points(workspace_id,staff_user_id,points,
        effective_month,trigger_at,rule_version,source_key,source_hash)
      values(${fixture.wsA.id},${fixture.trainerA.userId},1.00,${closedMonth},
        (${closedMonth}::date + 1) at time zone 'Africa/Cairo','p7-test-v1',
        ${earnedKey},'closed-correction-earned')`;
    const finalized = await fixture.po.client.rpc('p7_finalize_month', {
      p_workspace_id: fixture.wsA.id,
      p_month: closedMonth,
    });
    expect(finalized.error).toBeNull();
    const [snapshotBefore] = await db`
      select totals from public.p7_month_snapshots
      where workspace_id=${fixture.wsA.id} and effective_month=${closedMonth}::date`;
    const [earned] = await db`
      select id from public.p7_earned_points
      where workspace_id=${fixture.wsA.id} and source_key=${earnedKey}`;

    const correction = adjustment({
      p_operation: 'correct',
      p_points: '-0.50',
      p_effective_month: null,
      p_original_entry_kind: 'earned',
      p_original_entry_id: earned!.id,
    });
    const corrected = await fixture.po.client.rpc(
      'p7_post_point_adjustment',
      correction,
    );
    expect(corrected.data).toMatchObject({
      status: 'ok',
      effective_month: openMonth,
      original_month: closedMonth,
    });
    const moved = await fixture.po.client.rpc('p7_reattribute_point_entry', {
      ...reattribution({
        p_original_entry_kind: 'earned',
        p_original_entry_id: earned!.id,
      }),
    });
    expect(moved.data).toMatchObject({
      status: 'ok',
      effective_month: openMonth,
      original_month: closedMonth,
    });
    const [snapshotAfter] = await db`
      select totals from public.p7_month_snapshots
      where workspace_id=${fixture.wsA.id} and effective_month=${closedMonth}::date`;
    expect(snapshotAfter!.totals).toEqual(snapshotBefore!.totals);
  });

  it('keeps strike reason-code constraints and rows untouched by point changes', async () => {
    const [constraint] = await db`
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conrelid='public.workforce_strike_corrections'::regclass
        and conname='workforce_strike_corrections_reason_code_check'`;
    expect(constraint!.definition).toContain('client_caused_delay');
    const before =
      await db`select count(*)::int as count from public.workforce_strike_corrections`;
    await fixture.po.client.rpc('p7_post_point_adjustment', adjustment());
    const after =
      await db`select count(*)::int as count from public.workforce_strike_corrections`;
    expect(after[0]!.count).toBe(before[0]!.count);
  });

  it('fails the authorization and idempotency kill tests when their guards are removed', async () => {
    const args = adjustment();
    await db.begin(async (tx) => {
      await tx`savepoint manual_point_po_mutation`;
      const [fn] = await tx`
        select pg_get_functiondef(
          'public.p7_post_point_adjustment(uuid,uuid,text,text,date,text,uuid,text,uuid)'::regprocedure
        ) as definition`;
      const original = fn!.definition as string;
      const mutated = original.replaceAll(
        'not app_private.is_platform_owner()',
        'false',
      );
      expect(mutated).not.toBe(original);
      await tx.unsafe(mutated);
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.trainerA.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [result] = await tx`
        select public.p7_post_point_adjustment(
          ${args.p_workspace_id},${args.p_staff_user_id},${args.p_operation},${args.p_points},
          ${args.p_effective_month},${args.p_original_entry_kind},${args.p_original_entry_id},
          ${args.p_reason},${args.p_idempotency_key}
        ) as result`;
      expect(result!.result).toMatchObject({ status: 'ok' });
      await tx`rollback to savepoint manual_point_po_mutation`;
    });

    const mutationArgs = adjustment({
      p_reason: 'Idempotency mutation reason',
    });
    await db.begin(async (tx) => {
      await tx`savepoint manual_point_idempotency_mutation`;
      const [fn] = await tx`
        select pg_get_functiondef(
          'public.p7_post_point_adjustment(uuid,uuid,text,text,date,text,uuid,text,uuid)'::regprocedure
        ) as definition`;
      const original = fn!.definition as string;
      const mutated = original
        .replaceAll('if prior.id is not null then', 'if false then')
        .replaceAll(
          'p_idempotency_key,request_hash,written_reason,actor,p_operation,p_idempotency_key,',
          'gen_random_uuid(),request_hash,written_reason,actor,p_operation,gen_random_uuid(),',
        );
      expect(mutated).not.toBe(original);
      await tx.unsafe(mutated);
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.po.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      for (let attempt = 0; attempt < 2; attempt++) {
        await tx`
          select public.p7_post_point_adjustment(
            ${mutationArgs.p_workspace_id},${mutationArgs.p_staff_user_id},${mutationArgs.p_operation},${mutationArgs.p_points},
            ${mutationArgs.p_effective_month},${mutationArgs.p_original_entry_kind},${mutationArgs.p_original_entry_id},
            ${mutationArgs.p_reason},${mutationArgs.p_idempotency_key}
          )`;
      }
      await tx`reset role`;
      const [count] = await tx`
        select count(*)::int as count from public.p7_adjustment_entries
        where workspace_id=${fixture.wsA.id} and reason=${mutationArgs.p_reason}`;
      expect(count!.count).toBe(2);
      await tx`rollback to savepoint manual_point_idempotency_mutation`;
    });
  });
});
