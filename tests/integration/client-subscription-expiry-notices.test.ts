import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asUser,
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

let p: PortalFixture;
let client: PortalClient;
let other: PortalClient;

beforeAll(async () => {
  p = await portalFixture();
  client = await p.makeClient({ activate: true, label: 'expiry inbox owner' });
  other = await p.makeClient({ activate: true, label: 'expiry inbox other' });
});
afterAll(async () => p?.close());

async function moveExpiryToTwoDays(subject: PortalClient) {
  await p.db.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`update public.subscription_activations a
      set activated_at = app_private.f23_cairo_date_start(
        (clock_timestamp() at time zone 'Africa/Cairo')::date + 2 - s.duration_days)
      from public.subscriptions s
      where a.workspace_id = s.workspace_id and a.subscription_id = s.id
        and s.workspace_id = ${p.fixture.wsA.id}::uuid
        and s.id = ${subject.subscriptionId}::uuid`;
    await tx`set local session_replication_role = origin`;
  });
}

async function expiryAt(subject: PortalClient): Promise<Date> {
  const [core] = await p.db`
    select app_private.f22_subscription_core(${p.fixture.wsA.id}::uuid,
      ${subject.clientId}::uuid) as value`;
  const endDay = (core!.value as { effective_end_exclusive: string })
    .effective_end_exclusive;
  const [row] = await p.db`
    select app_private.f23_cairo_date_start(${endDay}::date) as value`;
  return row!.value as Date;
}

async function evaluate(at: Date) {
  await p.db`select app_private.f23_subscription_expiry_notices_run(
    ${at.toISOString()}::timestamptz, 250)`;
}

async function readAs(subject: PortalClient): Promise<Record<string, unknown>> {
  return p.db.begin((tx) =>
    asUser(tx, subject.authUserId, async (inner) => {
      const [row] = await inner`select public.read_client_notices(100, null) as value`;
      return row!.value as Record<string, unknown>;
    }),
  );
}

const kinds = (value: Record<string, unknown>) =>
  (value.notices as Array<{ notice_kind: string }>).map((row) => row.notice_kind);

describe('Spec 028 FR-001 client expiry notices through the existing F22 inbox', () => {
  it('delivers only to the client account, with staff and another client unable to read it', async () => {
    await moveExpiryToTwoDays(client);
    const expiry = await expiryAt(client);
    const t3 = new Date(expiry.getTime() - 72 * 60 * 60 * 1000);
    await evaluate(t3);

    const own = await readAs(client);
    expect(own.status).toBe('ok');
    expect(kinds(own)).toContain('subscription_expiring_t3');
    expect(kinds(await readAs(other))).not.toContain('subscription_expiring_t3');
    for (const actor of [p.fixture.trainerA, p.fixture.woA, p.fixture.po]) {
      const result = await actor.client.rpc('read_client_notices', {
        p_limit: 100,
        p_before: null,
      });
      expect(result.data).toEqual({ status: 'invalid' });
    }
  });

  it('deduplicates client T-3 under concurrent evaluator retries', async () => {
    await moveExpiryToTwoDays(other);
    const expiry = await expiryAt(other);
    const t3 = new Date(expiry.getTime() - 72 * 60 * 60 * 1000);
    await Promise.all(Array.from({ length: 20 }, () => evaluate(t3)));

    const [row] = await p.db`
      select count(*)::integer as n
      from app_private.client_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and client_id = ${other.clientId}::uuid
        and source_key = ${other.subscriptionId}::uuid
        and notice_kind = 'subscription_expiring_t3'`;
    expect(Number(row!.n)).toBe(1);
  });

  it('catches up T-3 once when first eligible under 72 hours and sends T-1 only at its instant', async () => {
    const late = await p.makeClient({ activate: true, label: 'expiry short lead' });
    await moveExpiryToTwoDays(late);
    const expiry = await expiryAt(late);

    await evaluate(new Date(expiry.getTime() - 48 * 60 * 60 * 1000));
    expect(kinds(await readAs(late))).toContain('subscription_expiring_t3_short_lead');
    expect(kinds(await readAs(late))).not.toContain('subscription_expiring_t1');

    await evaluate(new Date(expiry.getTime() - 24 * 60 * 60 * 1000 - 1));
    expect(kinds(await readAs(late))).not.toContain('subscription_expiring_t1');
    await evaluate(new Date(expiry.getTime() - 24 * 60 * 60 * 1000));
    expect(kinds(await readAs(late))).toContain('subscription_expiring_t1');
  });

  it('uses the F13 Cairo first-existing expiry instant for T-3, T-1 and expiry stages', async () => {
    const [row] = await p.db`
      select
        to_char(app_private.f23_cairo_date_start(date '2026-04-24') at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"') as spring,
        to_char(app_private.f23_cairo_date_start(date '2026-10-30') at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"') as autumn`;
    expect(row).toEqual({
      spring: '2026-04-23T22:00:00Z',
      autumn: '2026-10-29T22:00:00Z',
    });

    await moveExpiryToTwoDays(client);
    const expiry = await expiryAt(client);
    await evaluate(new Date(expiry.getTime() - 72 * 60 * 60 * 1000));
    expect(kinds(await readAs(client))).toContain('subscription_expiring_t3');
    await evaluate(new Date(expiry.getTime() - 24 * 60 * 60 * 1000));
    expect(kinds(await readAs(client))).toContain('subscription_expiring_t1');
    await evaluate(expiry);
    expect(kinds(await readAs(client))).toContain('subscription_expired');
  });
});
