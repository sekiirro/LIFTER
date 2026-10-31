import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import {
  clientContext,
  graph,
  probe,
  sql,
} from './registration-approval-fixture';
import {
  freezeApplicationsFromFacts,
  calculateFreezeContribution,
  projectFreezeEnd,
  type FreezeApplyFact,
  type FreezeEventFact,
} from '../../lib/subscriptions/freeze-service';

const db = sql();
afterAll(() => db.end());

const tables = [
  'public.subscription_freezes',
  'public.subscription_freeze_events',
] as const;

it('T008 freeze facts are tenant-bound, forced-RLS, immutable ledger rows', async () => {
  for (const table of tables) {
    const [row] = await db`
      select c.relrowsecurity, c.relforcerowsecurity,
             pg_get_userbyid(c.relowner) as owner
      from pg_class c where c.oid = to_regclass(${table})`;
    expect(row).toEqual({
      relrowsecurity: true,
      relforcerowsecurity: true,
      owner: 'postgres',
    });
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const [grant] = await db`
        select has_table_privilege(${role}, ${table}, 'SELECT') as read,
               has_table_privilege(${role}, ${table}, 'INSERT') as insert,
               has_table_privilege(${role}, ${table}, 'UPDATE') as update,
               has_table_privilege(${role}, ${table}, 'DELETE') as delete`;
      expect(grant).toEqual({
        read: false,
        insert: false,
        update: false,
        delete: false,
      });
    }
  }
  const f = await clientContext();
  const foreignRead = await f.po.client
    .from('subscription_freezes')
    .select('id')
    .eq('workspace_id', f.wsB.id);
  expect(foreignRead.error).not.toBeNull();
});

it('T008 has a serialized freeze operation with safe replay and expected revisions', async () => {
  const [row] = await db`
    select p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner,
           p.prosrc
    from pg_proc p
    where p.oid = to_regprocedure('public.subscription_freeze_operation(jsonb)')`;
  expect(row).toBeDefined();
  expect(row!.prosecdef).toBe(true);
  expect(row!.proconfig).toContain('search_path=""');
  expect(row!.owner).toBe('postgres');
  expect(row!.prosrc).toMatch(/for update/i);
  expect(row!.prosrc).toMatch(/request_key|registration_operations/i);
  expect(row!.prosrc).toMatch(/expected_revision/i);
  const lockAt = row!.prosrc.indexOf('pg_advisory_xact_lock');
  const receiptAt = row!.prosrc.indexOf(
    'from app_private.registration_operations',
    lockAt,
  );
  const replayAt = row!.prosrc.indexOf(
    'from app_private.subscription_freeze_operations',
    lockAt,
  );
  const postLockAuthAt = row!.prosrc.indexOf('f12_actor_allowed', lockAt);
  expect(lockAt).toBeGreaterThanOrEqual(0);
  expect(postLockAuthAt).toBeGreaterThan(lockAt);
  expect(postLockAuthAt).toBeLessThan(receiptAt);
  expect(postLockAuthAt).toBeLessThan(replayAt);
  expect(row!.prosrc.slice(postLockAuthAt, receiptAt)).toMatch(/not_permitted/);
});

it('T008 preserves F12 activation and delivered-access facts as freeze history changes', async () => {
  const [row] = await db`
    select count(*)::int as n
    from pg_trigger
    where tgrelid = 'public.subscription_freezes'::regclass
      and not tgisinternal and tgenabled = 'O'`;
  expect(row!.n).toBeGreaterThanOrEqual(3);
  const triggerNames = await db`
    select tgname from pg_trigger
    where tgrelid='public.subscription_freezes'::regclass
      and not tgisinternal and tgenabled='O'`;
  expect(triggerNames.map((trigger) => trigger.tgname)).toContain(
    'f13_no_update',
  );
  const [audit] = await db`
    select count(*)::int as n from pg_trigger
    where tgrelid in ('public.subscription_freezes'::regclass,
                      'public.subscription_freeze_events'::regclass)
      and tgname in ('f13_freeze_audit','f13_freeze_event_audit')`;
  expect(audit!.n).toBe(2);
  const [activation] = await db`
    select count(*)::int as n from pg_class
    where oid = 'public.subscription_activations'::regclass`;
  expect(activation!.n).toBe(1);
});

it('T008 migration declares STOP-exclusive interval and deferred overlap validation', async () => {
  const [row] = await db`
    select p.prosrc from pg_proc p
    where p.oid = to_regprocedure('app_private.f13_freeze_contribution(uuid,uuid,uuid)')`;
  expect(row).toBeDefined();
  expect(row!.prosrc).toMatch(/effective_on/i);
  expect(row!.prosrc).toMatch(/applied_on/i);
  expect(row!.prosrc).toMatch(/greatest\(/i);
  expect(row!.prosrc).toMatch(/,\s*1\)/i);
  const [validator] = await db`
    select p.prosrc from pg_proc p
    where p.oid = to_regprocedure('app_private.f13_validate_freeze(uuid,uuid)')`;
  expect(validator!.prosrc).toMatch(/daterange/i);
  expect(validator!.prosrc).toMatch(/overlap/i);
});

it('T008 committed-style freeze facts feed the existing entitlement projection without rewriting activation', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${ids.subscription},now(),${randomUUID()})`;
    const request = {
      action: 'apply',
      workspace_id: f.wsA.id,
      client_id: ids.client,
      subscription_id: ids.subscription,
      duration_days: 10,
      expected_revision: 0,
      request_key: randomUUID(),
    };
    const requestJson = tx.json(request);
    const [shape] = await tx`
      select (select count(*)::int from jsonb_object_keys(${requestJson}::jsonb)) as fields,
        jsonb_typeof((${requestJson}::jsonb)->'duration_days') as duration_type,
        (${requestJson}::jsonb)->>'duration_days' as duration,
        (${requestJson}::jsonb)->>'expected_revision' as revision,
        (${requestJson}::jsonb)->>'workspace_id' ~* '^[0-9a-f-]{36}$' as workspace_uuid,
        (${requestJson}::jsonb)->>'client_id' ~* '^[0-9a-f-]{36}$' as client_uuid,
        (${requestJson}::jsonb)->>'subscription_id' ~* '^[0-9a-f-]{36}$' as subscription_uuid,
        (${requestJson}::jsonb)->>'request_key' ~* '^[0-9a-f-]{36}$' as key_uuid`;
    expect(shape).toEqual({
      fields: 7,
      duration_type: 'number',
      duration: '10',
      revision: '0',
      workspace_uuid: true,
      client_uuid: true,
      subscription_uuid: true,
      key_uuid: true,
    });
    const [result] = await tx`
      select public.subscription_freeze_operation(${requestJson}::jsonb) as receipt`;
    expect(result!.receipt).toMatchObject({ status: 'applied', revision: 1 });
    const [replay] = await tx`
      select public.subscription_freeze_operation(${requestJson}::jsonb) as receipt`;
    expect(replay!.receipt).toEqual(result!.receipt);
    const conflictRequest = tx.json({ ...request, duration_days: 9 });
    const [conflict] = await tx`
      select public.subscription_freeze_operation(${conflictRequest}::jsonb) as receipt`;
    expect(conflict!.receipt).toEqual({ status: 'key_conflict' });
    const stopRequest = tx.json({
      action: 'stop',
      workspace_id: f.wsA.id,
      client_id: ids.client,
      subscription_id: ids.subscription,
      freeze_id: result!.receipt.freeze_id,
      expected_revision: 1,
      request_key: randomUUID(),
    });
    const [stopped] = await tx`
      select public.subscription_freeze_operation(${stopRequest}::jsonb) as receipt`;
    expect(stopped!.receipt).toMatchObject({ status: 'stopped', revision: 2 });
    await tx`set constraints all immediate`;
    const applies = await tx`
      select id,applied_on::text,duration_days from public.subscription_freezes
      where workspace_id=${f.wsA.id} and subscription_id=${ids.subscription}`;
    const events = await tx`
      select freeze_id,kind,effective_on::text from public.subscription_freeze_events
      where workspace_id=${f.wsA.id} and subscription_id=${ids.subscription}`;
    const applications = freezeApplicationsFromFacts(
      applies as unknown as FreezeApplyFact[],
      events as unknown as FreezeEventFact[],
    );
    expect(calculateFreezeContribution(applications[0]!)).toBe(1);
    const [sqlDays] = await tx`
      select app_private.f13_freeze_contribution(${f.wsA.id},${ids.subscription},${applies[0]!.id}) as days`;
    expect(sqlDays!.days).toBe(1);
    expect(projectFreezeEnd('2026-11-20', applications)).toMatchObject({
      extensionDays: 1,
    });
    await expect(
      tx.savepoint(async (inner) => {
        const overlappingRequest = inner.json({
          action: 'apply',
          workspace_id: f.wsA.id,
          client_id: ids.client,
          subscription_id: ids.subscription,
          duration_days: 2,
          expected_revision: 2,
          request_key: randomUUID(),
        });
        await inner`select public.subscription_freeze_operation(${overlappingRequest}::jsonb)`;
        await inner`set constraints all immediate`;
      }),
    ).rejects.toMatchObject({ code: '23514' });
    const activations = await tx`
      select subscription_id,activated_at,delivery_event_id
      from public.subscription_activations where subscription_id=${ids.subscription}`;
    expect(activations).toHaveLength(1);
  });
});

it('T008 Remove preserves the Cairo day on which its fact is recorded', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${ids.subscription},clock_timestamp()-interval '100 days',${randomUUID()})`;
    const apply = tx.json({
      action: 'apply',
      workspace_id: f.wsA.id,
      client_id: ids.client,
      subscription_id: ids.subscription,
      duration_days: 3,
      expected_revision: 0,
      request_key: randomUUID(),
    });
    const [applied] =
      await tx`select public.subscription_freeze_operation(${apply}::jsonb) as receipt`;
    expect(applied!.receipt).toMatchObject({ status: 'applied' });
    const receipt = applied!.receipt as { freeze_id: string };
    const remove = tx.json({
      action: 'remove',
      workspace_id: f.wsA.id,
      client_id: ids.client,
      subscription_id: ids.subscription,
      freeze_id: receipt.freeze_id,
      expected_revision: 1,
      request_key: randomUUID(),
    });
    const [removed] =
      await tx`select public.subscription_freeze_operation(${remove}::jsonb) as receipt`;
    expect(removed!.receipt).toMatchObject({ status: 'removed' });
    const [projection] = await tx`
      select app_private.f13_project_entitlement(
        ${f.wsA.id},${ids.subscription},(clock_timestamp() at time zone 'Africa/Cairo')::date
      ) as value,
      ((clock_timestamp() at time zone 'Africa/Cairo')::date+1)::text as floor`;
    expect(projection!.value).toMatchObject({
      status: 'active',
      effective_end_exclusive: projection!.floor,
    });
  });
});

it('T008 rejects Stop after a freeze has been Removed', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${ids.subscription},clock_timestamp()-interval '100 days',${randomUUID()})`;
    const apply = tx.json({
      action: 'apply',
      workspace_id: f.wsA.id,
      client_id: ids.client,
      subscription_id: ids.subscription,
      duration_days: 3,
      expected_revision: 0,
      request_key: randomUUID(),
    });
    const [applied] =
      await tx`select public.subscription_freeze_operation(${apply}::jsonb) as receipt`;
    expect(applied!.receipt).toMatchObject({ status: 'applied', revision: 1 });
    const freezeId = (applied!.receipt as { freeze_id: string }).freeze_id;
    const remove = tx.json({
      action: 'remove',
      workspace_id: f.wsA.id,
      client_id: ids.client,
      subscription_id: ids.subscription,
      freeze_id: freezeId,
      expected_revision: 1,
      request_key: randomUUID(),
    });
    const [removed] =
      await tx`select public.subscription_freeze_operation(${remove}::jsonb) as receipt`;
    expect(removed!.receipt).toMatchObject({ status: 'removed', revision: 2 });

    const stop = tx.json({
      action: 'stop',
      workspace_id: f.wsA.id,
      client_id: ids.client,
      subscription_id: ids.subscription,
      freeze_id: freezeId,
      expected_revision: 2,
      request_key: randomUUID(),
    });
    await expect(
      tx.savepoint(async (inner) => {
        await inner`select public.subscription_freeze_operation(${stop}::jsonb)`;
      }),
    ).rejects.toMatchObject({ code: '23514' });

    const [events] = await tx`
      select count(*)::int as total,
        count(*) filter (where kind='remove')::int as removed,
        count(*) filter (where kind='stop')::int as stopped
      from public.subscription_freeze_events where freeze_id=${freezeId}`;
    expect(events).toEqual({ total: 1, removed: 1, stopped: 0 });
  });
});

it('T008 bounds Stop at the planned end but permits a late Remove', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    const appliedOn = '2026-10-01';
    const freezeId = randomUUID();
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${ids.subscription},clock_timestamp()-interval '100 days',${randomUUID()})`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    await tx`insert into public.subscription_freezes(id,workspace_id,subscription_id,applied_on,duration_days,applied_by,recorded_at)
      values(${freezeId},${f.wsA.id},${ids.subscription},${appliedOn}::date,3,${f.trainerA.userId},clock_timestamp())`;

    await expect(
      tx.savepoint(async (inner) => {
        await inner`insert into public.subscription_freeze_events(workspace_id,subscription_id,freeze_id,kind,effective_on,actor_user_id)
          values(${f.wsA.id},${ids.subscription},${freezeId},'stop',${appliedOn}::date+3,${f.trainerA.userId})`;
      }),
    ).rejects.toMatchObject({ code: '23514' });

    await tx`insert into public.subscription_freeze_events(workspace_id,subscription_id,freeze_id,kind,effective_on,actor_user_id)
      values(${f.wsA.id},${ids.subscription},${freezeId},'remove',${appliedOn}::date+20,${f.trainerA.userId})`;
    await tx`set constraints all immediate`;
    const [events] = await tx`
      select count(*) filter (where kind='stop')::int as stopped,
        count(*) filter (where kind='remove')::int as removed,
        max(effective_on)::text as removed_on
      from public.subscription_freeze_events where freeze_id=${freezeId}`;
    expect(events).toEqual({
      stopped: 0,
      removed: 1,
      removed_on: '2026-10-21',
    });
  });
});

it('T008 rejects Apply, Stop and Remove facts after a terminal refund', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${ids.subscription},clock_timestamp(),${randomUUID()})`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    const freezeId = randomUUID();
    await tx`insert into public.subscription_freezes(id,workspace_id,subscription_id,applied_on,duration_days,applied_by)
      values(${freezeId},${f.wsA.id},${ids.subscription},(clock_timestamp() at time zone 'Africa/Cairo')::date,3,${f.trainerA.userId})`;

    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    try {
      const [refund] = await tx`select public.record_refund(${tx.json({
        workspace_id: f.wsA.id,
        client_id: ids.client,
        purchase_id: ids.subscription,
        request_key: randomUUID(),
        amount_minor: '600',
        external_confirmation: true,
      })}) as result`;
      expect(refund!.result).toMatchObject({ status: 'ok' });
    } finally {
      await tx`reset role`;
    }

    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
    const applied = randomUUID();
    await expect(
      tx.savepoint(async (inner) => {
        await inner`insert into public.subscription_freezes(id,workspace_id,subscription_id,applied_on,duration_days,applied_by)
        values(${applied},${f.wsA.id},${ids.subscription},(clock_timestamp() at time zone 'Africa/Cairo')::date,2,${f.trainerA.userId})`;
      }),
    ).rejects.toMatchObject({ code: '23514' });

    for (const kind of ['stop', 'remove'] as const) {
      await expect(
        tx.savepoint(async (inner) => {
          await inner`insert into public.subscription_freeze_events(workspace_id,subscription_id,freeze_id,kind,effective_on,actor_user_id)
          select ${f.wsA.id},${ids.subscription},${freezeId},${kind},applied_on+1,${f.trainerA.userId}
          from public.subscription_freezes where id=${freezeId}`;
        }),
      ).rejects.toMatchObject({ code: '23514' });
    }
    const [counts] = await tx`
      select (select count(*)::int from public.subscription_freezes where id=${applied}) as applied,
        (select count(*)::int from public.subscription_freeze_events where freeze_id=${freezeId}) as events`;
    expect(counts).toEqual({ applied: 0, events: 0 });
  });
});

it('T008 audit failure rolls back the Apply fact and idempotency receipt', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
      values(${f.wsA.id},${ids.subscription},now(),${randomUUID()})`;
    const request = tx.json({
      action: 'apply',
      workspace_id: f.wsA.id,
      client_id: ids.client,
      subscription_id: ids.subscription,
      duration_days: 10,
      expected_revision: 0,
      request_key: randomUUID(),
    });
    await expect(
      tx.savepoint(async (inner) => {
        await inner.unsafe(`create function pg_temp.reject_f13_audit() returns trigger
          language plpgsql as $$ begin raise exception 'audit_failed' using errcode='23514'; end $$`);
        await inner.unsafe(`create trigger f13_test_reject_audit before insert on public.audit_events
          for each row execute function pg_temp.reject_f13_audit()`);
        await inner`select public.subscription_freeze_operation(${request}::jsonb)`;
      }),
    ).rejects.toMatchObject({ code: '23514' });
    const [counts] = await tx`
      select (select count(*)::int from public.subscription_freezes where subscription_id=${ids.subscription}) as freezes,
        (select count(*)::int from app_private.subscription_freeze_operations where subscription_id=${ids.subscription}) as receipts,
        (select count(*)::int from public.audit_events where target_table='subscription_freezes'
          and details->>'subscription_id'=${ids.subscription}) as audits`;
    expect(counts).toEqual({ freezes: 0, receipts: 0, audits: 0 });
  });
});
