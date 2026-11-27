import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { portalFixture, type PortalClient, type PortalFixture } from './client-portal-fixture';

// Spec 028 backend slice 1: expiry rows use F13's projected boundary and the
// current F23 recipient wall. All records in this suite are synthetic.
let p: PortalFixture;
let client: PortalClient;

beforeAll(async () => {
  p = await portalFixture();
  client = await p.makeClient({ activate: true, label: 'expiry notices' });
});
afterAll(async () => p?.close());

async function projectedEnd() {
  const [row] = await p.db`
    select app_private.f22_subscription_core(${p.fixture.wsA.id}::uuid, ${client.clientId}::uuid) as value`;
  const endDate = (row!.value as { effective_end_exclusive: string }).effective_end_exclusive;
  const [boundary] = await p.db`
    select (${endDate}::date::timestamp at time zone 'Africa/Cairo') as value`;
  return boundary!.value as Date;
}

describe('Spec 028 F23 expiry evaluator', () => {
  it('uses F13 expiry and sends one T-3 and expiry row to every authorized workspace recipient', async () => {
    const expiry = await projectedEnd();
    const t3 = new Date(expiry.getTime() - 72 * 60 * 60 * 1000);
    const [t3Result] = await p.db`
      select app_private.f23_subscription_expiry_notices_run(${t3.toISOString()}::timestamptz) as count`;
    expect(Number(t3Result!.count)).toBeGreaterThan(0);

    const [expected] = await p.db`
      select array_agg(distinct user_id order by user_id) as users from (
        select user_id from public.staff_profiles where role = 'platform_owner'::public.staff_role
        union
        select m.user_id from public.workspace_memberships m
          join public.staff_profiles p on p.user_id = m.user_id
          where m.workspace_id = ${p.fixture.wsA.id}::uuid and m.revoked_at is null
            and p.role = 'workspace_owner'::public.staff_role
        union
        select m.user_id from public.workspace_memberships m
          join public.staff_profiles p on p.user_id = m.user_id
          where m.workspace_id = ${p.fixture.wsA.id}::uuid and m.revoked_at is null
            and p.role = 'trainer'::public.staff_role
            and app_private.role_has_capability(p.role, 'coaching_work')
      ) recipients`;
    const [t3Rows] = await p.db`
      select array_agg(recipient_user_id order by recipient_user_id) as users,
        count(*)::integer as n
      from app_private.staff_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and source_key = ${client.subscriptionId}::uuid
        and notice_kind = 'subscription_expiring_t3'`;
    expect(t3Rows!.users).toEqual(expected!.users);
    expect(Number(t3Rows!.n)).toBe(expected!.users.length);

    // Repeated and concurrent scans must keep the same recipient-stage rows.
    await Promise.all(Array.from({ length: 8 }, () => p.db`
      select app_private.f23_subscription_expiry_notices_run(${t3.toISOString()}::timestamptz)`));
    const [afterRetry] = await p.db`
      select count(*)::integer as n from app_private.staff_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and source_key = ${client.subscriptionId}::uuid
        and notice_kind = 'subscription_expiring_t3'`;
    expect(Number(afterRetry!.n)).toBe(expected!.users.length);

    const [expiryResult] = await p.db`
      select app_private.f23_subscription_expiry_notices_run(${expiry.toISOString()}::timestamptz) as count`;
    expect(Number(expiryResult!.count)).toBeGreaterThan(0);
    const [expiredRows] = await p.db`
      select count(*)::integer as n from app_private.staff_inbox_notices
      where workspace_id = ${p.fixture.wsA.id}::uuid
        and source_key = ${client.subscriptionId}::uuid
        and notice_kind = 'subscription_expired'`;
    expect(Number(expiredRows!.n)).toBe(expected!.users.length);
  });

  it('accepts expiring and expired filters through the existing scoped directory RPC', async () => {
    for (const status of ['expiring', 'expired']) {
      const result = await p.fixture.trainerA.client.rpc('staff_client_directory', {
        p_workspace_id: p.fixture.wsA.id,
        p_search: p.run,
        p_approval_state: null,
        p_subscription_status: status,
        p_limit: 100,
        p_offset: 0,
        p_assignment: null,
      });
      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({ status: 'ok' });
    }
  });
});
