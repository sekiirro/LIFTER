import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  clientContext,
  graph,
  probe,
  sql,
  type Context,
} from './registration-approval-fixture';

const db = sql();
let f: Context;
beforeAll(async () => {
  f = await clientContext();
});
afterAll(() => db.end());

it('uses the fixed generic unavailable result for multiple approved subscriptions of one client', async () => {
  let result: unknown;
  await probe(async (tx) => {
    // Model an inconsistent legacy history only in this rolled-back fixture;
    // normal writes retain the unique initial-subscription index and guard.
    await tx`drop index public.f12_initial_subscription`;
    await tx`alter table public.subscriptions disable trigger f12_subscription_insert`;
    const first = await graph(tx, f);
    const secondSubscription = randomUUID();
    await tx`insert into public.subscriptions(
      id,workspace_id,client_id,registration_link_id,package_version_id,
      price_minor,currency,commission_rate_bp,duration_days,duration_months,created_by
    ) select ${secondSubscription},workspace_id,client_id,registration_link_id,
      package_version_id,price_minor,currency,commission_rate_bp,duration_days,
      duration_months,created_by from public.subscriptions where id=${first.subscription}`;
    await tx`insert into app_private.registration_approval_events(
      id,workspace_id,client_id,subscription_id
    ) select ${randomUUID()},workspace_id,client_id,${secondSubscription}
      from app_private.registration_approval_events where subscription_id=${first.subscription}`;
    await tx`select set_config(
      'request.jwt.claims',
      ${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},
      true
    )`;
    await tx`set local role authenticated`;
    try {
      const rows = await tx`select public.registration_approval_correction(
        ${f.wsA.id}::uuid,${first.client}::uuid
      ) as result`;
      result = rows[0]?.result;
    } finally {
      await tx`reset role`;
    }
  });

  expect(result).toEqual({ status: 'unavailable' });
  expect(JSON.stringify(result)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
});
