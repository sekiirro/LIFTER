import { afterAll, expect, it } from 'vitest';
import { admin, createStaff } from './harness';
import {
  call,
  clientContext,
  registered,
  request,
  sql,
} from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());

it('T044a awards an issuance-time Sales link after the issuer is promoted before approval', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  const [issued] = await db`
    select created_by_role_snapshot::text as role
    from public.registration_links where id=${target.link}`;
  expect(issued?.role).toBe('sales');

  const changed = await admin()
    .from('staff_profiles')
    .update({ role: 'workspace_owner' })
    .eq('user_id', f.salesA.userId);
  expect(changed.error).toBeNull();

  const approval = request(f, target);
  expect((await call(f.po.client, 'approve', approval)).status).toBe('ok');
  expect((await call(f.po.client, 'approve', approval)).status).toBe('ok');
  const units = await db`
    select recipient_sales_user_id from public.sales_productivity_units
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  expect(units).toEqual([{ recipient_sales_user_id: f.salesA.userId }]);
  const facts = await db`
    select staff_user_id, points::text as points, source_key
    from public.p7_earned_points
    where workspace_id=${f.wsA.id}`;
  expect(facts).toEqual([
    {
      staff_user_id: f.salesA.userId,
      points: '1.00',
      source_key: expect.any(String),
    },
  ]);
});

it('T020/T021 maps one confirmed first-payment Sales unit to one durable P7 fact under concurrent retries', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  const approval = request(f, target);
  const results = await Promise.all([
    call(f.po.client, 'approve', approval),
    call(f.po.client, 'approve', approval),
  ]);
  expect(results.map((result) => result.status)).toEqual(['ok', 'ok']);

  const [source] = await db`
    select id, recipient_sales_user_id, recorded_at
    from public.sales_productivity_units
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  expect(source?.recipient_sales_user_id).toBe(f.salesA.userId);
  const facts = await db`
    select staff_user_id, points::text as points, effective_month, trigger_at,
      rule_version, source_key, source_hash
    from public.p7_earned_points
    where workspace_id=${f.wsA.id} and source_key=${source?.id}`;
  expect(facts).toHaveLength(1);
  expect(facts[0]).toMatchObject({
    staff_user_id: f.salesA.userId,
    points: '1.00',
    rule_version: 'p7-sales-acquisition-v1',
    source_key: source?.id,
  });
  expect(facts[0]?.effective_month).toBeInstanceOf(Date);
  expect(facts[0]?.trigger_at).toBeInstanceOf(Date);
  expect(facts[0]?.source_hash).toMatch(/^[a-f0-9]{32}$/);
});

it('T020 awards one acquisition point after the confirmed first installment, independent of plan size', async () => {
  const f = await clientContext();
  const single = await registered(f, null, undefined, f.salesA.client);
  const installments = await registered(
    f,
    [
      { seq: 1, amount_minor: '400', due_offset_days: 0 },
      { seq: 2, amount_minor: '400', due_offset_days: 30 },
      { seq: 3, amount_minor: '400', due_offset_days: 60 },
    ],
    undefined,
    f.salesA.client,
  );

  expect((await call(f.po.client, 'approve', request(f, single))).status).toBe(
    'ok',
  );
  expect(
    (await call(f.po.client, 'approve', request(f, installments))).status,
  ).toBe('ok');
  const [counts] = await db`
    select count(*)::int as facts,
      count(distinct staff_user_id)::int as staff
    from public.p7_earned_points where workspace_id=${f.wsA.id}`;
  expect(counts).toEqual({ facts: 2, staff: 1 });
});

it('T021 backfills a pre-P7 unit repeatedly without reattributing it after a role change', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  const changed = await admin()
    .from('staff_profiles')
    .update({ role: 'workspace_owner' })
    .eq('user_id', f.salesA.userId);
  expect(changed.error).toBeNull();
  expect((await call(f.po.client, 'approve', request(f, target))).status).toBe(
    'ok',
  );
  const [source] = await db`
    select id from public.sales_productivity_units
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  expect(source?.id).toBeTruthy();

  await db.begin(async (tx) => {
    await tx`alter table public.p7_earned_points disable trigger p7_earned_points_immutable`;
    await tx`delete from public.p7_earned_points
      where workspace_id=${f.wsA.id} and source_key=${source!.id}`;
    await tx`alter table public.p7_earned_points enable trigger p7_earned_points_immutable`;
    await tx`select app_private.p7_backfill_sales_productivity_units()`;
    await tx`select app_private.p7_backfill_sales_productivity_units()`;
    const [counts] = await tx`
      select count(*)::int as facts from public.p7_earned_points
      where workspace_id=${f.wsA.id} and source_key=${source!.id}`;
    expect(counts?.facts).toBe(1);
  });

  const [fact] = await db`
    select staff_user_id from public.p7_earned_points
    where workspace_id=${f.wsA.id} and source_key=${source!.id}`;
  expect(fact?.staff_user_id).toBe(f.salesA.userId);
});

it('T021 does not award a non-Sales-issued unit even if inserted outside the F10 guard', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.woA.client);
  expect((await call(f.po.client, 'approve', request(f, target))).status).toBe(
    'ok',
  );
  const [approval] = await db`
    select id from app_private.registration_approval_events
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  expect(approval?.id).toBeTruthy();

  await db.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
    await tx`alter table public.sales_productivity_units disable trigger sales_productivity_units_immutable`;
    await tx`insert into public.sales_productivity_units(
      workspace_id,client_id,registration_link_id,approval_event_id,recipient_sales_user_id
    ) values (${f.wsA.id},${target.id},${target.link},${approval!.id},${f.woA.userId})`;
    await tx`alter table public.sales_productivity_units enable trigger sales_productivity_units_immutable`;
  });

  const [facts] = await db`
    select count(*)::int as count from public.p7_earned_points
    where workspace_id=${f.wsA.id}`;
  expect(facts?.count).toBe(0);
});

it('T044a awards no point when a Workspace-Owner-issued link is approved after demotion', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.woA.client);
  const [issued] = await db`
    select created_by_role_snapshot::text as role
    from public.registration_links where id=${target.link}`;
  expect(issued?.role).toBe('workspace_owner');

  const changed = await admin()
    .from('staff_profiles')
    .update({ role: 'sales' })
    .eq('user_id', f.woA.userId);
  expect(changed.error).toBeNull();

  expect((await call(f.po.client, 'approve', request(f, target))).status).toBe(
    'ok',
  );
  const units = await db`
    select count(*)::int as count from public.sales_productivity_units
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  expect(units[0]?.count).toBe(0);
});

it('T044a snapshot-check mutation would award a Workspace-Owner-issued link', async () => {
  const [originalAward] = await db`
    select pg_get_functiondef('app_private.f13_award_sales_productivity_unit()'::regprocedure) as definition`;
  const [originalGuard] = await db`
    select pg_get_functiondef('app_private.f13_guard_sales_productivity_unit()'::regprocedure) as definition`;
  const awardSource = originalAward?.definition as string | undefined;
  const guardSource = originalGuard?.definition as string | undefined;
  const awardSnapshotCheck =
    "if not found or link.created_by_role_snapshot is distinct from 'sales'::public.staff_role then";
  const guardSnapshotCheck =
    "and l.created_by_role_snapshot = 'sales'::public.staff_role";
  expect(awardSource).toContain(awardSnapshotCheck);
  expect(guardSource).toContain(guardSnapshotCheck);
  await db.unsafe(
    awardSource!.replace(awardSnapshotCheck, 'if not found then'),
  );
  await db.unsafe(guardSource!.replace(guardSnapshotCheck, ''));
  try {
    const f = await clientContext();
    const target = await registered(f, null, undefined, f.woA.client);
    await admin()
      .from('staff_profiles')
      .update({ role: 'sales' })
      .eq('user_id', f.woA.userId);
    expect(
      (await call(f.po.client, 'approve', request(f, target))).status,
    ).toBe('ok');
    const units = await db`
      select count(*)::int as count from public.sales_productivity_units
      where workspace_id=${f.wsA.id} and client_id=${target.id}`;
    // The expected zero-point assertion fails under this mutant.
    expect(units[0]?.count).toBe(1);
  } finally {
    await db.unsafe(awardSource!);
    await db.unsafe(guardSource!);
  }
});

it('T044a gives no Sales point for a legacy link with a NULL role snapshot', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  await db.begin(async (tx) => {
    await tx`alter table public.registration_links disable trigger registration_links_update_guard`;
    await tx`update public.registration_links set created_by_role_snapshot=null where id=${target.link}`;
    await tx`alter table public.registration_links enable trigger registration_links_update_guard`;
  });

  expect((await call(f.po.client, 'approve', request(f, target))).status).toBe(
    'ok',
  );
  const units = await db`
    select count(*)::int as count from public.sales_productivity_units
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  expect(units[0]?.count).toBe(0);
});

it('T044a refuses updates to the link role snapshot', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  await expect(
    db`update public.registration_links set created_by_role_snapshot='workspace_owner'
      where id=${target.link}`,
  ).rejects.toMatchObject({ code: '23514' });
});

it('T044a rejects Sales awards for a registration that is never approved', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  expect(
    (await call(f.po.client, 'reject', request(f, target, 'reject'))).status,
  ).toBe('ok');
  const units = await db`
    select count(*)::int as count from public.sales_productivity_units
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  expect(units[0]?.count).toBe(0);
});

it('T044a awards no point when a rejected registration is later reconsidered', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  expect(
    (await call(f.po.client, 'reject', request(f, target, 'reject'))).status,
  ).toBe('ok');
  expect(
    (await call(f.po.client, 'reconsider', request(f, target, 'reconsider')))
      .status,
  ).toBe('ok');
  const units = await db`
    select count(*)::int as count from public.sales_productivity_units
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  expect(units[0]?.count).toBe(0);
});

it('T044a binds a Sales unit to its source workspace and approval event', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  expect((await call(f.po.client, 'approve', request(f, target))).status).toBe(
    'ok',
  );
  const [unit] = await db`
    select approval_event_id from public.sales_productivity_units
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  await expect(
    db`insert into public.sales_productivity_units(
      workspace_id,client_id,registration_link_id,approval_event_id,recipient_sales_user_id
    ) values (${f.wsB.id},${target.id},${target.link},${unit!.approval_event_id},${f.salesA.userId})`,
  ).rejects.toMatchObject({ code: '23514' });
});

it('T044a denies direct reads and writes to anon and authenticated roles', async () => {
  const f = await clientContext();
  for (const client of [f.actors.anon.client, f.salesA.client]) {
    const read = await client
      .from('sales_productivity_units')
      .select('id')
      .limit(1);
    expect(read.error).not.toBeNull();
    const write = await client.from('sales_productivity_units').insert({
      workspace_id: f.wsA.id,
      client_id: '00000000-0000-0000-0000-000000000001',
      registration_link_id: f.link,
      approval_event_id: '00000000-0000-0000-0000-000000000002',
      recipient_sales_user_id: f.salesA.userId,
    });
    expect(write.error).not.toBeNull();
    const p7Read = await client.from('p7_earned_points').select('id').limit(1);
    expect(p7Read.error).not.toBeNull();
  }
});

// ---- S71 review round 2: 343-B2 / B3 / B4 ----

it('343-B2 rechecks authorization after the period-fence wait and raises 42501 on revocation during the wait', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  expect((await call(f.po.client, 'approve', request(f, target))).status).toBe(
    'ok',
  );
  const [source] = await db`
    select id, recorded_at::text as recorded_at from public.sales_productivity_units
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  expect(source?.id).toBeTruthy();
  const [approval] = await db`
    select id from app_private.registration_approval_events
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  expect(approval?.id).toBeTruthy();
  const [monthRow] = await db`
    select app_private.p7_month_for_trigger(${source!.recorded_at}::timestamptz)::text as month`;

  // Remove the normally awarded fact so the AFTER INSERT producer can run again.
  await db.begin(async (tx) => {
    await tx`alter table public.p7_earned_points disable trigger p7_earned_points_immutable`;
    await tx`delete from public.p7_earned_points
      where workspace_id=${f.wsA.id} and source_key=${source!.id}`;
    await tx`alter table public.p7_earned_points enable trigger p7_earned_points_immutable`;
    await tx`alter table public.sales_productivity_units disable trigger sales_productivity_units_immutable`;
    await tx`delete from public.sales_productivity_units where id=${source!.id}`;
    await tx`alter table public.sales_productivity_units enable trigger sales_productivity_units_immutable`;
  });

  const actor = await createStaff('platform_owner', 'b2-postwait-actor');
  const lockConnection = sql();
  const evaluator = sql();
  let lockOpen = false;
  try {
    await lockConnection`begin`;
    lockOpen = true;
    // Hold the same workspace+month fence the producer must wait on.
    await lockConnection`select app_private.p7_lock_period(${f.wsA.id}, ${monthRow!.month}::date)`;

    const [session] = await evaluator`select pg_backend_pid() as pid`;
    const pid = session!.pid as number;
    let finished = false;
    let evaluationError: unknown;
    const probeRollback = new Error('rollback B2 probe');
    const pending = evaluator
      .begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor.userId, role: 'authenticated' })}, true)`;
        await tx`alter table public.sales_productivity_units disable trigger sales_productivity_units_immutable`;
        await tx`insert into public.sales_productivity_units(
          workspace_id, client_id, registration_link_id, approval_event_id,
          recipient_sales_user_id, recorded_at
        ) values (${f.wsA.id}, ${target.id}, ${target.link}, ${approval!.id},
          ${f.salesA.userId}, ${source!.recorded_at}::timestamptz)`;
        throw probeRollback;
      })
      .catch((error) => {
        if (error !== probeRollback) evaluationError = error;
      })
      .finally(() => {
        finished = true;
      });

    try {
      await expect
        .poll(
          async () => {
            const [activity] = await lockConnection`
              select wait_event_type, wait_event
              from pg_catalog.pg_stat_activity where pid=${pid}`;
            if (activity?.wait_event_type === 'Lock')
              return activity.wait_event;
            return finished ? 'finished' : null;
          },
          { timeout: 8000 },
        )
        .toBe('advisory');

      // Revoke the actor's authority while it is blocked on the fence.
      await db`update public.staff_profiles set role='trainer' where user_id=${actor.userId}`;
      await lockConnection`commit`;
      lockOpen = false;
      await pending;
      expect(evaluationError).toMatchObject({ code: '42501' });
    } finally {
      if (lockOpen) {
        await lockConnection`rollback`.catch(() => undefined);
        lockOpen = false;
      }
      await pending;
    }
  } finally {
    await lockConnection.end();
    await evaluator.end();
    await db`update public.staff_profiles set role='trainer' where user_id=${actor.userId}`;
  }
});

it('343-B2 kill-test: the post-wait 42501 guard follows both the fence wait and the closed-month insert', async () => {
  const [row] = await db`
    select prosrc from pg_proc
    where oid='app_private.p7_earn_sales_productivity_unit()'::regprocedure`;
  const definition = row!.prosrc as string;
  const fence = definition.indexOf('p7_lock_period');
  const insert = definition.indexOf('insert into public.p7_earned_points');
  const firstGuard = definition.indexOf("errcode = '42501'");
  const secondGuard = definition.indexOf("errcode = '42501'", firstGuard + 1);
  expect(fence).toBeGreaterThanOrEqual(0);
  expect(insert).toBeGreaterThan(fence);
  expect(firstGuard).toBeGreaterThan(fence);
  expect(firstGuard).toBeLessThan(insert);
  expect(secondGuard).toBeGreaterThan(insert);
});

it('343-B3 writes one opaque audit reference per newly backfilled P7 fact and is idempotent on rerun', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  expect((await call(f.po.client, 'approve', request(f, target))).status).toBe(
    'ok',
  );
  const [source] = await db`
    select id from public.sales_productivity_units
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  expect(source?.id).toBeTruthy();

  const auditRows = () => db`
    select count(*)::int as n from public.audit_events
    where workspace_id=${f.wsA.id}
      and action='workforce.earned_fact_recorded'
      and target_table='p7_earned_points'`;
  const [before] = await auditRows();

  await db.begin(async (tx) => {
    await tx`alter table public.p7_earned_points disable trigger p7_earned_points_immutable`;
    await tx`delete from public.p7_earned_points
      where workspace_id=${f.wsA.id} and source_key=${source!.id}`;
    await tx`alter table public.p7_earned_points enable trigger p7_earned_points_immutable`;
    await tx`select app_private.p7_backfill_sales_productivity_units()`;
    await tx`select app_private.p7_backfill_sales_productivity_units()`;
  });

  const [after] = await auditRows();
  expect(after!.n - before!.n).toBe(1);
  const [fact] = await db`
    select id from public.p7_earned_points
    where workspace_id=${f.wsA.id} and source_key=${source!.id}`;
  const [audit] = await db`
    select target_id, details from public.audit_events
    where workspace_id=${f.wsA.id}
      and action='workforce.earned_fact_recorded'
      and target_table='p7_earned_points'
    order by id desc limit 1`;
  expect(audit?.target_id).toBe(fact?.id);
  expect(audit?.details).toMatchObject({
    reference: expect.stringContaining('p7-sales-backfill:'),
  });
});

it('343-B3 kill-test: a broken backfill audit insert rolls back the mapped fact', async () => {
  const [row] = await db`
    select pg_get_functiondef('app_private.p7_backfill_sales_productivity_units()'::regprocedure) as definition`;
  const definition = row!.definition as string;
  const auditInsert = 'insert into public.audit_events(';
  expect(definition).toContain(auditInsert);
  const mutant = definition.replace(
    auditInsert,
    'insert into public.audit_events_missing(',
  );

  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  expect((await call(f.po.client, 'approve', request(f, target))).status).toBe(
    'ok',
  );
  const [source] = await db`
    select id from public.sales_productivity_units
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  await db.begin(async (tx) => {
    await tx`alter table public.p7_earned_points disable trigger p7_earned_points_immutable`;
    await tx`delete from public.p7_earned_points
      where workspace_id=${f.wsA.id} and source_key=${source!.id}`;
    await tx`alter table public.p7_earned_points enable trigger p7_earned_points_immutable`;
  });

  await db.unsafe(mutant);
  try {
    await expect(
      db`select app_private.p7_backfill_sales_productivity_units()`,
    ).rejects.toThrow();
    const [facts] = await db`
      select count(*)::int as n from public.p7_earned_points
      where workspace_id=${f.wsA.id} and source_key=${source!.id}`;
    expect(facts?.n).toBe(0);
  } finally {
    await db.unsafe(definition);
  }
});

it('343-B4 derives the same source_hash under different TimeZone and DateStyle sessions', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  expect((await call(f.po.client, 'approve', request(f, target))).status).toBe(
    'ok',
  );
  const [source] = await db`
    select id from public.sales_productivity_units
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  const [first] = await db`
    select source_hash from public.p7_earned_points
    where workspace_id=${f.wsA.id} and source_key=${source!.id}`;
  expect(first?.source_hash).toMatch(/^[a-f0-9]{32}$/);

  await db.begin(async (tx) => {
    await tx`select set_config('TimeZone', 'Pacific/Kiritimati', true)`;
    await tx`select set_config('DateStyle', 'SQL, DMY', true)`;
    await tx`alter table public.p7_earned_points disable trigger p7_earned_points_immutable`;
    await tx`delete from public.p7_earned_points
      where workspace_id=${f.wsA.id} and source_key=${source!.id}`;
    await tx`alter table public.p7_earned_points enable trigger p7_earned_points_immutable`;
    await tx`select app_private.p7_backfill_sales_productivity_units()`;
  });

  const [replayed] = await db`
    select source_hash from public.p7_earned_points
    where workspace_id=${f.wsA.id} and source_key=${source!.id}`;
  expect(replayed?.source_hash).toBe(first?.source_hash);
});

it('343-B4 kill-test: both producers hash a UTC-canonical timestamp, not the session rendering', async () => {
  for (const name of [
    'app_private.p7_earn_sales_productivity_unit()',
    'app_private.p7_backfill_sales_productivity_units()',
  ]) {
    const [row] = await db`
      select prosrc from pg_proc where oid=${name}::regprocedure`;
    expect(row!.prosrc as string).toContain('to_char(');
    expect(row!.prosrc as string).toContain("at time zone 'UTC'");
  }
});
