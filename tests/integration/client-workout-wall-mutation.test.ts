import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  asUser,
  workoutDocument,
  workoutFixture,
  type WorkoutClient,
  type WorkoutFixture,
} from './client-workout-fixture';

// F17 T054 review follow-up: negative fixtures and DB mutation kills for the
// wall filters that the first slice covered only by structure, plus the
// export-audit recorder scrub and entitlement rules. Every client, plan and
// name is synthetic. Fixture state edits use session_replication_role
// (triggers off) because the product guards refuse these states by design.
let p: WorkoutFixture;
let good: WorkoutClient;
let pending: WorkoutClient;
let deactivated: WorkoutClient;
let swapped: WorkoutClient;
let lapsed: WorkoutClient;
let other: WorkoutClient;
let goodPlan: string;
let pendingPlan: string;
let deactivatedPlan: string;
let swappedPlan: string;
let lapsedPlan: string;
let otherPlan: string;
let nutritionPlan: string;
let goodRevision1: string;
let otherRevision: string;
let lapsedRevision: string;

const PLAN_SIGNATURE = 'public.client_portal_workout_plan(uuid,integer)';
const PORTAL_SIGNATURE = 'app_private.f22_portal_client()';
const AUDIT_SIGNATURE =
  'public.record_workout_export_audit(uuid,uuid,uuid,text,text,text)';
const ZERO = '00000000-0000-0000-0000-000000000000';

async function replica(body: (tx: TransactionSql) => Promise<unknown>) {
  await p.db.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await body(tx);
    await tx`set local session_replication_role = origin`;
  });
}

beforeAll(async () => {
  p = await workoutFixture();
  good = await p.makeClient({ activate: true });
  pending = await p.makeClient({ activate: true });
  deactivated = await p.makeClient({ activate: true });
  swapped = await p.makeClient({ activate: true });
  lapsed = await p.makeClient({ activate: false });
  other = await p.makeClient({ activate: true });
  const globalId = await p.createGlobal(`F17W ${randomUUID()}`, null);
  const doc = (title: string) =>
    workoutDocument(title, [
      { exercise: { source: 'global', identity_id: globalId } },
    ]);
  const plan = async (client: WorkoutClient, title: string) => {
    const id = await p.createDraft(client.clientId, doc(title));
    await p.publish(id, 1, 0);
    return id;
  };
  goodPlan = await plan(good, 'good');
  pendingPlan = await plan(pending, 'pending');
  deactivatedPlan = await plan(deactivated, 'deactivated');
  swappedPlan = await plan(swapped, 'swapped');
  lapsedPlan = await plan(lapsed, 'lapsed');
  otherPlan = await plan(other, 'other');
  goodRevision1 = await p.revisionId(goodPlan, 1);
  otherRevision = await p.revisionId(otherPlan, 1);
  lapsedRevision = await p.revisionId(lapsedPlan, 1);

  // Published but never delivered: a second revision with no delivery row.
  await replica(
    (tx) => tx`insert into public.plan_revisions(
      id, workspace_id, plan_id, revision_number, source_draft_version,
      plan_kind, content, authored_by)
      select ${randomUUID()}, workspace_id, plan_id, 2, source_draft_version,
        plan_kind, content, authored_by
      from public.plan_revisions where id = ${goodRevision1}`,
  );

  // A nutrition plan (root, revision, delivery) whose content would otherwise
  // satisfy the workout projection shape.
  const nutritionRoot = randomUUID();
  const nutritionRevision = randomUUID();
  nutritionPlan = nutritionRoot;
  await replica(async (tx) => {
    const [sub] = await tx`select id from public.subscriptions
      where client_id = ${good.clientId} limit 1`;
    const [creator] = await tx`select created_by from public.plan_roots
      where id = ${goodPlan}`;
    await tx`insert into public.plan_roots(id, workspace_id, client_id, plan_kind, created_by)
      values (${nutritionRoot}, ${p.fixture.wsA.id}, ${good.clientId}, 'nutrition', ${creator!.created_by})`;
    await tx`insert into public.plan_revisions(
      id, workspace_id, plan_id, revision_number, source_draft_version,
      plan_kind, content, authored_by)
      values (${nutritionRevision}, ${p.fixture.wsA.id}, ${nutritionRoot}, 1, 1,
        'nutrition', ${tx.json({ schema_version: 1, days: [] } as never)}, ${creator!.created_by})`;
    await tx`insert into public.plan_deliveries(
      workspace_id, subscription_id, client_id, plan_id, plan_kind, revision_id,
      delivery_event_id, delivered_by)
      values (${p.fixture.wsA.id}, ${sub!.id}, ${good.clientId}, ${nutritionRoot},
        'nutrition', ${nutritionRevision}, ${randomUUID()}, ${creator!.created_by})`;
  });

  // Pending and deactivated clients.
  await replica(async (tx) => {
    await tx`update public.clients set approval_state = 'pending-approval'
      where id = ${pending.clientId}`;
    await tx`update public.clients set deactivated_at = clock_timestamp()
      where id = ${deactivated.clientId}`;
    // Delivery bound to a different client's subscription.
    await tx`update public.plan_deliveries set subscription_id = ${other.subscriptionId}
      where plan_id = ${swappedPlan}`;
  });
});
afterAll(async () => p?.close());

const rollback = new Error('rollback F17 wall mutation');

async function underMutant(
  signature: string,
  mutations: [control: string, replacement: string][],
  userId: string,
  probe: (tx: TransactionSql) => Promise<unknown>,
): Promise<unknown> {
  let observed: unknown = 'not-reached';
  try {
    await p.db.begin(async (tx) => {
      const [row] =
        await tx`select pg_get_functiondef(${signature}::regprocedure) as definition`;
      let mutated = row!.definition as string;
      for (const [control, replacement] of mutations) {
        expect(mutated, `control present: ${control}`).toContain(control);
        mutated = mutated.replaceAll(control, replacement);
      }
      await tx.unsafe(mutated);
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      observed = await probe(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return observed;
}

async function stillInstalled(signature: string, controls: string[]) {
  const [row] =
    await p.db`select pg_get_functiondef(${signature}::regprocedure) as definition`;
  for (const control of controls)
    expect(row!.definition as string).toContain(control);
}

const read =
  (planId: string, revision: number | null) => (tx: TransactionSql) =>
    tx`select public.client_portal_workout_plan(${planId}::uuid, ${revision}::integer) as value`.then(
      (rows) => (rows[0]!.value as { status: string }).status,
    );

const asClient = (userId: string, planId: string, revision: number | null) =>
  p.db.begin((tx) => asUser(tx, userId, read(planId, revision)));

describe('F17 client workout wall: negative fixtures and kills', () => {
  it('a published-but-undelivered revision is not_found; the delivered one stays readable (kill: revision binding)', async () => {
    expect(await asClient(good.authUserId, goodPlan, 2)).toBe('not_found');
    expect(await asClient(good.authUserId, goodPlan, null)).toBe('ok');
    expect(await asClient(good.authUserId, goodPlan, 1)).toBe('ok');
    const control = 'and r.id = d.revision_id';
    const mutant = await underMutant(
      PLAN_SIGNATURE,
      [[control, '']],
      good.authUserId,
      read(goodPlan, 2),
    );
    expect(mutant).toBe('ok');
    await stillInstalled(PLAN_SIGNATURE, [control]);
  });

  it('a nutrition plan id is not_found (kill: both plan_kind filters)', async () => {
    expect(await asClient(good.authUserId, nutritionPlan, null)).toBe(
      'not_found',
    );
    const controls = [
      "and d.plan_kind = 'workout'",
      "and r.plan_kind = 'workout'",
    ];
    const mutant = await underMutant(
      PLAN_SIGNATURE,
      controls.map((c) => [c, 'and true'] as [string, string]),
      good.authUserId,
      read(nutritionPlan, null),
    );
    expect(mutant).toBe('ok');
    await stillInstalled(PLAN_SIGNATURE, controls);
  });

  it('each plan_kind filter alone is enough to refuse a nutrition plan', async () => {
    for (const control of [
      "and d.plan_kind = 'workout'",
      "and r.plan_kind = 'workout'",
    ]) {
      const mutant = await underMutant(
        PLAN_SIGNATURE,
        [[control, 'and true']],
        good.authUserId,
        read(nutritionPlan, null),
      );
      expect(mutant, control).toBe('not_found');
    }
  });

  it('a pending client is refused (kill: approval_state)', async () => {
    expect(await asClient(pending.authUserId, pendingPlan, null)).toBe(
      'invalid',
    );
    const control = "and c.approval_state = 'approved'";
    const mutant = await underMutant(
      PORTAL_SIGNATURE,
      [[control, 'and true']],
      pending.authUserId,
      read(pendingPlan, null),
    );
    expect(mutant).toBe('ok');
    await stillInstalled(PORTAL_SIGNATURE, [control]);
  });

  it('a deactivated client is refused (kill: deactivated_at)', async () => {
    expect(await asClient(deactivated.authUserId, deactivatedPlan, null)).toBe(
      'invalid',
    );
    const control = 'and c.deactivated_at is null';
    const mutant = await underMutant(
      PORTAL_SIGNATURE,
      [[control, 'and true']],
      deactivated.authUserId,
      read(deactivatedPlan, null),
    );
    expect(mutant).toBe('ok');
    await stillInstalled(PORTAL_SIGNATURE, [control]);
  });

  it('a delivery bound to a different subscription is refused (kill: subscription binding alone)', async () => {
    expect(await asClient(swapped.authUserId, swappedPlan, null)).toBe(
      'not_found',
    );
    const control = "= (summary->>'subscription_id')::uuid";
    const mutant = await underMutant(
      PLAN_SIGNATURE,
      [[control, 'is not null']],
      swapped.authUserId,
      read(swappedPlan, null),
    );
    expect(mutant).toBe('ok');
    await stillInstalled(PLAN_SIGNATURE, [control]);
  });
});

async function audit(
  userId: string,
  args: {
    planId: string | null;
    revisionId: string | null;
    format?: string;
    outcome: string;
    reason?: string | null;
  },
  tx?: TransactionSql,
) {
  const run = (inner: TransactionSql) =>
    inner`select public.record_workout_export_audit(
      ${null}::uuid, ${args.planId}::uuid, ${args.revisionId}::uuid,
      ${args.format ?? 'pdf'}, ${args.outcome}, ${args.reason ?? null})`;
  return tx ? run(tx) : p.db.begin((inner) => asUser(inner, userId, run));
}

async function rowsFor(userId: string) {
  return p.db`select workspace_id, target_id, details from public.audit_events
    where actor_user_id = ${userId} and action = 'plan.workout_export' order by id`;
}

describe('F17 workout export audit recorder: scrub and entitlement', () => {
  it('scrubs a denial from a pending client and from a foreign trainer', async () => {
    for (const userId of [pending.authUserId, p.fixture.trainerB.userId]) {
      await audit(userId, {
        planId: goodPlan,
        revisionId: goodRevision1,
        outcome: 'denied',
        reason: 'not_permitted',
      });
      const rows = await rowsFor(userId);
      const last = rows[rows.length - 1]!;
      expect(last.workspace_id, userId).toBeNull();
      expect(last.target_id, userId).toBe(ZERO);
      expect(last.details).toEqual({
        format: 'pdf',
        outcome: 'denied',
        reason: 'not_permitted',
      });
    }
  });

  it('keeps own-plan context for an approved client and the own workspace staff', async () => {
    await audit(good.authUserId, {
      planId: goodPlan,
      revisionId: goodRevision1,
      outcome: 'denied',
      reason: 'not_permitted',
    });
    const rows = await rowsFor(good.authUserId);
    expect(rows[rows.length - 1]).toMatchObject({
      workspace_id: p.fixture.wsA.id,
      target_id: goodRevision1,
    });
    await audit(p.fixture.trainerA.userId, {
      planId: goodPlan,
      revisionId: goodRevision1,
      outcome: 'denied',
      reason: 'not_found',
    });
    const staff = await rowsFor(p.fixture.trainerA.userId);
    expect(staff[staff.length - 1]).toMatchObject({
      workspace_id: p.fixture.wsA.id,
      target_id: goodRevision1,
    });
  });

  it('never stores a revision id that does not belong to the given plan (non-staff)', async () => {
    await audit(good.authUserId, {
      planId: goodPlan,
      revisionId: otherRevision,
      outcome: 'denied',
      reason: 'not_found',
    });
    const rows = await rowsFor(good.authUserId);
    const last = rows[rows.length - 1]!;
    expect(last.target_id).toBe(goodPlan);
    expect(last.details).toEqual({
      plan_id: goodPlan,
      format: 'pdf',
      outcome: 'denied',
      reason: 'not_found',
    });
    expect(JSON.stringify(last)).not.toContain(otherRevision);
  });

  it('refuses a success record for a client whose F13 status is not active (kill: active gate)', async () => {
    await expect(
      audit(lapsed.authUserId, {
        planId: lapsedPlan,
        revisionId: lapsedRevision,
        outcome: 'success',
      }),
    ).rejects.toMatchObject({ code: '42501' });
    const control =
      "(app_private.f22_subscription_summary(v_workspace_id, v_client_id) ->> 'status') = 'active'";
    const mutant = await underMutant(
      AUDIT_SIGNATURE,
      [[control, 'true']],
      lapsed.authUserId,
      async (tx) => {
        try {
          await audit(
            lapsed.authUserId,
            {
              planId: lapsedPlan,
              revisionId: lapsedRevision,
              outcome: 'success',
            },
            tx,
          );
          return 'recorded';
        } catch {
          return 'refused';
        }
      },
    );
    expect(mutant).toBe('recorded');
    await stillInstalled(AUDIT_SIGNATURE, [control]);
    // An active own client still records.
    await audit(good.authUserId, {
      planId: goodPlan,
      revisionId: goodRevision1,
      outcome: 'success',
      format: 'excel',
    });
  });

  async function storedAfter(
    mutations: [string, string][],
    userId: string,
    planId: string,
    revisionId: string,
  ) {
    return underMutant(AUDIT_SIGNATURE, mutations, userId, async (tx) => {
      await audit(
        userId,
        { planId, revisionId, outcome: 'denied', reason: 'not_found' },
        tx,
      );
      await tx`reset role`;
      const rows = await tx`select workspace_id, target_id, details
        from public.audit_events where actor_user_id = ${userId}
        order by id desc limit 1`;
      return rows[0];
    });
  }

  it('kills: dropping the non-staff scrub or the revision-plan match leaks identity', async () => {
    const scrub = 'if not v_staff and not v_own_client then';
    const leaked = (await storedAfter(
      [[scrub, 'if false then']],
      pending.authUserId,
      goodPlan,
      goodRevision1,
    )) as { workspace_id: string | null };
    expect(leaked.workspace_id).toBe(p.fixture.wsA.id);

    const tail = ') then\n    -- A revision id';
    const match = `where r.id = v_revision_id and r.plan_id = v_plan_id\n  ${tail}`;
    const stored = (await storedAfter(
      [[match, `where true\n  ${tail}`]],
      good.authUserId,
      goodPlan,
      otherRevision,
    )) as { target_id: string };
    expect(stored.target_id).toBe(otherRevision);
    await stillInstalled(AUDIT_SIGNATURE, [scrub, match]);
  });
});
