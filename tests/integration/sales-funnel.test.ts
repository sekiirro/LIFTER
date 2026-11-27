import { afterAll, expect, it } from 'vitest';
import {
  call,
  clientContext,
  registered,
  request,
  sql,
} from './registration-approval-operations-fixture';
import { admin, createStaff } from './harness';

const db = sql();
afterAll(() => db.end());

it('T020 reports distinct Sales funnel milestones in their Cairo event month', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  const secondSales = await createStaff('sales', 'p7-funnel-sales');
  const membership = await admin().from('workspace_memberships').insert({
    workspace_id: f.wsA.id,
    user_id: secondSales.userId,
    granted_by: f.po.userId,
  });
  expect(membership.error).toBeNull();
  const secondTarget = await registered(f, null, undefined, secondSales.client);
  for (const current of [target, secondTarget]) {
    const approval = request(f, current);
    expect((await call(f.po.client, 'approve', approval)).status).toBe('ok');
    expect((await call(f.po.client, 'approve', approval)).status).toBe('ok');
  }

  const [period] = await db`
    select pg_catalog.to_char(
      pg_catalog.date_trunc('month', now() at time zone 'Africa/Cairo'),
      'YYYY-MM-DD'
    ) as month`;
  const { data, error } = await f.po.client.rpc('get_sales_funnel', {
    workspace_id: f.wsA.id,
    p_month: period?.month,
  });

  expect(error).toBeNull();
  expect(data).toHaveLength(2);
  for (const salesUserId of [f.salesA.userId, secondSales.userId]) {
    expect(data).toContainEqual({
      month: period?.month,
      sales_user_id: salesUserId,
      link_count: 1,
      registration_count: 1,
      approval_count: 1,
    });
  }
  expect(JSON.stringify(data)).not.toMatch(/client|email|phone|name|token/i);
});

it('T020 assigns link, registration, and approval to separate Cairo months', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  expect((await call(f.po.client, 'approve', request(f, target))).status).toBe(
    'ok',
  );

  await db.begin(async (tx) => {
    await tx`alter table public.registration_links disable trigger user`;
    await tx`alter table public.clients disable trigger user`;
    await tx`alter table app_private.registration_approval_events disable trigger user`;
    await tx`
      update public.registration_links
      set created_at='2026-10-31 20:30:00+00',
        expires_at='2026-11-01 20:30:00+00'
      where id=${target.link}`;
    await tx`
      update public.clients set created_at='2026-10-31 22:30:00+00'
      where id=${target.id}`;
    await tx`
      update app_private.registration_approval_events
      set approved_at='2026-11-30 22:30:00+00'
      where workspace_id=${f.wsA.id} and client_id=${target.id}`;
    await tx`alter table public.registration_links enable trigger user`;
    await tx`alter table public.clients enable trigger user`;
    await tx`alter table app_private.registration_approval_events enable trigger user`;
  });

  const expected = [
    ['2026-10-01', 1, 0, 0],
    ['2026-11-01', 0, 1, 0],
    ['2026-12-01', 0, 0, 1],
  ] as const;
  for (const [month, links, registrations, approvals] of expected) {
    const { data, error } = await f.po.client.rpc('get_sales_funnel', {
      workspace_id: f.wsA.id,
      p_month: month,
    });
    expect(error).toBeNull();
    expect(data).toEqual([
      {
        month,
        sales_user_id: f.salesA.userId,
        link_count: links,
        registration_count: registrations,
        approval_count: approvals,
      },
    ]);
  }
});

it('T020 denies Sales, WO, and Trainer before workspace resolution', async () => {
  const f = await clientContext();
  const unknownWorkspace = '00000000-0000-0000-0000-000000000001';

  for (const actor of [f.salesA, f.woA, f.trainerA]) {
    for (const workspaceId of [f.wsA.id, unknownWorkspace]) {
      const { data, error } = await actor.client.rpc('get_sales_funnel', {
        workspace_id: workspaceId,
        p_month: '2026-11-01',
      });
      expect(data).toBeNull();
      expect(error).toMatchObject({ code: '42501', message: 'not_permitted' });
    }
  }
});
