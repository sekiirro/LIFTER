import { afterAll, expect, it } from 'vitest';
import {
  call,
  clientContext,
  registered,
  request,
  sql,
} from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());

it('T020 reports distinct Sales funnel milestones in their Cairo event month', async () => {
  const f = await clientContext();
  const target = await registered(f, null, undefined, f.salesA.client);
  const approval = request(f, target);
  expect((await call(f.po.client, 'approve', approval)).status).toBe('ok');
  expect((await call(f.po.client, 'approve', approval)).status).toBe('ok');

  const [period] = await db`
    select date_trunc('month', now() at time zone 'Africa/Cairo')::date as month`;
  const { data, error } = await f.po.client.rpc('get_sales_funnel', {
    workspace_id: f.wsA.id,
    month: period?.month,
  });

  expect(error).toBeNull();
  expect(data).toEqual([
    {
      month: period?.month,
      sales_user_id: f.salesA.userId,
      link_count: 1,
      registration_count: 1,
      approval_count: 1,
    },
  ]);
  expect(JSON.stringify(data)).not.toMatch(/client|email|phone|name|token/i);
});

it('T020 denies Sales before resolving existing or nonexistent workspaces', async () => {
  const f = await clientContext();
  const unknownWorkspace = '00000000-0000-0000-0000-000000000001';

  for (const workspaceId of [f.wsA.id, unknownWorkspace]) {
    const { data, error } = await f.salesA.client.rpc('get_sales_funnel', {
      workspace_id: workspaceId,
      month: '2026-11-01',
    });
    expect(data).toBeNull();
    expect(error).toMatchObject({ code: '42501', message: 'not_permitted' });
  }
});
