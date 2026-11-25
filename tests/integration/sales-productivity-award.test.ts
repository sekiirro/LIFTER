import { afterAll, expect, it } from 'vitest';
import { admin } from './harness';
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
  }
});
