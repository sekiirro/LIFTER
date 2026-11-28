import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';
import { sql } from './harness';

// Spec 028 T008 / SC-001: 1,000 repeated and concurrent expiry scans must not
// duplicate or drop a notice for any recipient, stage or revision. Synthetic
// fixture only; no production or other lane's data is touched.
const SCAN_RUNS = 1000;
const SCAN_CONCURRENCY = 16;

let p: PortalFixture;
let subject: PortalClient;

beforeAll(async () => {
  p = await portalFixture();
  subject = await p.makeClient({
    activate: true,
    label: '1000-scan idempotency',
  });

  // Move F13's effective expiry to the Cairo date two days out while keeping
  // the first activation far outside the T-3 short-lead window.
  const [target] = await p.db`
    select s.duration_days,
      ((clock_timestamp() at time zone 'Africa/Cairo')::date + 2)::date as end_day
    from public.subscriptions s
    where s.workspace_id = ${p.fixture.wsA.id}::uuid and s.id = ${subject.subscriptionId}::uuid`;
  const durationDays = Number(target!.duration_days);
  const endDay = target!.end_day as string;
  await p.db.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`update public.subscription_activations a
      set activated_at = least(a.activated_at, app_private.f23_cairo_date_start(
        ${endDay}::date - ${durationDays + 4}::integer))
      where a.workspace_id = ${p.fixture.wsA.id}::uuid
        and a.subscription_id = ${subject.subscriptionId}::uuid`;
    await tx`insert into public.subscription_manual_date_adjustments(
      workspace_id, client_id, subscription_id,
      new_service_start_date, new_service_end_exclusive,
      request_key, actor_user_id
    ) values (
      ${p.fixture.wsA.id}::uuid, ${subject.clientId}::uuid,
      ${subject.subscriptionId}::uuid,
      ${endDay}::date - ${durationDays}::integer, ${endDay}::date,
      ${randomUUID()}::uuid, ${p.fixture.po.userId}::uuid
    )`;
    await tx`set local session_replication_role = origin`;
  });
});

afterAll(async () => p?.close());

describe('Spec 028 T008 expiry scan idempotency', () => {
  it(
    'runs 1,000 repeated/concurrent scans and keeps exactly one notice per recipient, stage and revision',
    { timeout: 300_000 },
    async () => {
      const [core] = await p.db`
        select app_private.f22_subscription_core(${p.fixture.wsA.id}::uuid,
          ${subject.clientId}::uuid) ->>'effective_end_exclusive' as end_day`;
      const revision = core!.end_day as string;
      const [boundary] = await p.db`
        select app_private.f23_cairo_date_start(${revision}::date) as expiry`;
      const expiry = new Date(boundary!.expiry as Date);
      const t3 = new Date(expiry.getTime() - 72 * 60 * 60 * 1000);

      const started = Date.now();
      const handles = Array.from({ length: SCAN_CONCURRENCY }, () => sql());
      let next = 0;
      try {
        await Promise.all(
          handles.map(async (db) => {
            while (next < SCAN_RUNS) {
              const run = next++;
              // Mix both stage instants across the same 1,000 invocations.
              const at = run % 2 === 0 ? t3 : expiry;
              await db`select app_private.f23_subscription_expiry_notices_run(
                ${at.toISOString()}::timestamptz, 250)`;
            }
          }),
        );
      } finally {
        await Promise.all(handles.map((db) => db.end()));
      }
      const elapsedMs = Date.now() - started;
      console.log(
        `028 T008: ${SCAN_RUNS} scans at concurrency ${SCAN_CONCURRENCY} in ${elapsedMs} ms`,
      );
      expect(elapsedMs).toBeGreaterThan(0);

      const [expectedRow] = await p.db`
        select coalesce(array_agg(distinct user_id order by user_id), '{}'::uuid[]) as users from (
          select user_id from public.staff_profiles
            where role = 'platform_owner'::public.staff_role
          union
          select m.user_id from public.workspace_memberships m
            join public.staff_profiles s on s.user_id = m.user_id
            where m.workspace_id = ${p.fixture.wsA.id}::uuid and m.revoked_at is null
              and s.role = 'workspace_owner'::public.staff_role
          union
          select m.user_id from public.workspace_memberships m
            join public.staff_profiles s on s.user_id = m.user_id
            where m.workspace_id = ${p.fixture.wsA.id}::uuid and m.revoked_at is null
              and s.role = 'trainer'::public.staff_role
              and app_private.role_has_capability(s.role, 'coaching_work')
        ) recipients`;
      const expectedRecipients = (expectedRow!.users as string[])
        .map(String)
        .sort();
      expect(expectedRecipients.length).toBeGreaterThan(0);

      const staffRows = await p.db`
        select recipient_user_id::text as recipient, source_stage, source_revision,
          count(*)::integer as n,
          array_agg(distinct notice_kind order by notice_kind) as kinds
        from app_private.staff_inbox_notices
        where workspace_id = ${p.fixture.wsA.id}::uuid
          and source_key = ${subject.subscriptionId}::uuid
        group by recipient_user_id, source_stage, source_revision
        order by recipient_user_id, source_stage`;
      const staff = staffRows as unknown as Array<{
        recipient: string;
        source_stage: string;
        source_revision: string;
        n: number;
        kinds: string[];
      }>;
      expect(staff).toHaveLength(expectedRecipients.length * 2);
      for (const row of staff) {
        expect(expectedRecipients).toContain(row.recipient);
        expect(row.source_revision).toBe(revision);
        expect(['t3', 'expiry']).toContain(row.source_stage);
        expect(row.n).toBe(1);
        expect(row.kinds).toHaveLength(1);
        if (row.source_stage === 't3')
          expect([
            'subscription_expiring_t3',
            'subscription_expiring_t3_short_lead',
          ]).toContain(row.kinds[0]);
        else expect(row.kinds[0]).toBe('subscription_expired');
      }
      expect(
        staff
          .filter((row) => row.source_stage === 't3')
          .map((row) => row.recipient)
          .sort(),
      ).toEqual(expectedRecipients);
      expect(
        staff
          .filter((row) => row.source_stage === 'expiry')
          .map((row) => row.recipient)
          .sort(),
      ).toEqual(expectedRecipients);

      const clientRows = await p.db`
        select source_stage, source_revision, count(*)::integer as n,
          array_agg(distinct notice_kind order by notice_kind) as kinds
        from app_private.client_inbox_notices
        where workspace_id = ${p.fixture.wsA.id}::uuid
          and client_id = ${subject.clientId}::uuid
          and source_key = ${subject.subscriptionId}::uuid
        group by source_stage, source_revision
        order by source_stage`;
      const client = clientRows as unknown as Array<{
        source_stage: string;
        source_revision: string;
        n: number;
        kinds: string[];
      }>;
      expect(client.map((row) => row.source_stage).sort()).toEqual([
        'expiry',
        't3',
      ]);
      for (const row of client) {
        expect(row.source_revision).toBe(revision);
        expect(row.n).toBe(1);
        expect(row.kinds).toHaveLength(1);
      }
      expect(client.find((row) => row.source_stage === 't3')!.kinds[0]).toMatch(
        /^subscription_expiring_t3(_short_lead)?$/,
      );
      expect(
        client.find((row) => row.source_stage === 'expiry')!.kinds[0],
      ).toBe('subscription_expired');

      const [auditRows] = await p.db`
        select
          count(*) filter (where action = 'staff_notice.enqueued')::integer as staff_audits,
          count(*) filter (where action = 'client_notice.enqueued'
            and details->>'client_id' = ${subject.clientId}::text)::integer as client_audits
        from public.audit_events
        where details->>'subscription_id' = ${subject.subscriptionId}::text
          or (action = 'client_notice.enqueued'
            and details->>'client_id' = ${subject.clientId}::text)`;
      expect(Number(auditRows!.staff_audits)).toBe(
        expectedRecipients.length * 2,
      );
      expect(Number(auditRows!.client_audits)).toBe(2);
    },
  );
});
