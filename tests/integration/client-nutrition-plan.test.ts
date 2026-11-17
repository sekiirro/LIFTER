import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient } from './harness';
import {
  asUser,
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// F22 T024/T025/T027/T029 (FR-004, FR-006, FR-008, FR-010, SC-005, SC-006,
// SC-009), nutrition scope: the client-wall read behind the client plan view
// and export. Synthetic data only.
let p: PortalFixture;
let active: PortalClient;
let awaiting: PortalClient;
let other: PortalClient;
let nutritionPlan: string;
let draftOnlyPlan: string;
let otherPlan: string;
let workoutPlan: string;
let awaitingPlan: string;
let rev1Id: string;
let rev2Id: string;

async function read(
  userId: string,
  planId: string | null,
  revision: number | null,
): Promise<Record<string, unknown>> {
  return p.db.begin((tx) =>
    asUser(tx, userId, async (inner) => {
      const [row] =
        await inner`select public.client_portal_nutrition_plan(${planId}::uuid,${revision}::integer) as value`;
      return row!.value as Record<string, unknown>;
    }),
  );
}

async function revisionId(planId: string, revision: number): Promise<string> {
  const [row] = await p.db`select id from public.plan_revisions
    where plan_id=${planId} and revision_number=${revision}`;
  return row!.id as string;
}

async function select(
  clientId: string,
  planId: string,
  revisionIdValue: string,
  itemId: string,
  alternativeId: string,
) {
  await p.db.begin(async (tx) => {
    await tx`set local app.nutrition_selection_write = 'on'`;
    await tx`insert into public.client_nutrition_alternative_selections(
      workspace_id, plan_id, plan_version_id, client_id, item_id, alternative_id, created_by)
      values(${p.fixture.wsA.id}, ${planId}, ${revisionIdValue}, ${clientId},
        ${itemId}, ${alternativeId}, ${p.fixture.trainerA.userId})`;
  });
}

beforeAll(async () => {
  p = await portalFixture();
  active = await p.makeClient({ activate: true, label: 'nutrition-active' });
  awaiting = await p.makeClient({ activate: false, label: 'nutrition-await' });
  other = await p.makeClient({ activate: true, label: 'nutrition-other' });

  nutritionPlan = await p.createDraft(active.clientId, 'nutrition', 'F22 n1');
  await p.publish(nutritionPlan, 1, 0);
  await p.revise(nutritionPlan, 1, 'F22 n2');
  await p.publish(nutritionPlan, 2, 1);
  draftOnlyPlan = await p.createDraft(
    active.clientId,
    'nutrition',
    'F22 draft',
  );
  workoutPlan = await p.createDraft(active.clientId, 'workout', 'F22 w');
  await p.publish(workoutPlan, 1, 0);
  otherPlan = await p.createDraft(other.clientId, 'nutrition', 'F22 other');
  await p.publish(otherPlan, 1, 0);
  awaitingPlan = await p.createDraft(awaiting.clientId, 'nutrition', 'F22 aw');
  await p.publish(awaitingPlan, 1, 0);

  rev1Id = await revisionId(nutritionPlan, 1);
  rev2Id = await revisionId(nutritionPlan, 2);
  // Per-revision selections: the client's own, plus another client's rows.
  await select(
    active.clientId,
    nutritionPlan,
    rev1Id,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  );
  await select(
    active.clientId,
    nutritionPlan,
    rev2Id,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  );
  await select(
    other.clientId,
    otherPlan,
    await revisionId(otherPlan, 1),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  );
});
afterAll(async () => p?.close());

describe('F22 client nutrition plan read (T024/T029)', () => {
  it('returns the latest delivered revision with the F18 content and own selection for that revision', async () => {
    const result = await read(active.authUserId, nutritionPlan, null);
    expect(result.status).toBe('ok');
    expect(result.subscription).toMatchObject({ status: 'active' });
    expect(result.plan).toMatchObject({
      plan_id: nutritionPlan,
      workspace_id: p.fixture.wsA.id,
      client_id: active.clientId,
      revision_id: rev2Id,
      revision_number: 2,
    });
    const content = result.content as Record<string, unknown>;
    expect(content.document).toMatchObject({ schemaVersion: 1 });
    expect(content.snapshot_map).toBeTypeOf('object');
    expect(content.computed_values).toBeTruthy();
    expect(result.selections).toEqual([
      {
        item_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        alternative_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      },
    ]);
  });

  it('returns the exact selected historical revision and its own last selection, never another revision’s', async () => {
    const result = await read(active.authUserId, nutritionPlan, 1);
    expect(result.plan).toMatchObject({
      revision_id: rev1Id,
      revision_number: 1,
    });
    expect(result.selections).toEqual([
      {
        item_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        alternative_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      },
    ]);
    expect(await read(active.authUserId, nutritionPlan, 3)).toEqual({
      status: 'not_found',
    });
    expect(await read(active.authUserId, nutritionPlan, 0)).toEqual({
      status: 'not_found',
    });
  });

  it('never returns another client’s selections for the same plan shape', async () => {
    const result = await read(other.authUserId, otherPlan, null);
    expect(result.status).toBe('ok');
    expect(result.selections).toEqual([
      {
        item_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
        alternative_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('aaaaaaaa-aaaa-4aaa');
  });

  it('answers one not_found for draft-only, workout, unknown and another client’s plan', async () => {
    for (const planId of [
      draftOnlyPlan,
      workoutPlan,
      randomUUID(),
      otherPlan,
      null,
    ])
      expect(
        await read(active.authUserId, planId, null),
        String(planId),
      ).toEqual({ status: 'not_found' });
    expect(await read(other.authUserId, nutritionPlan, null)).toEqual({
      status: 'not_found',
    });
  });
});

describe('F22 client nutrition plan authorization (T025/T027)', () => {
  it('returns only the restricted projection when F13 does not project active', async () => {
    const result = await read(awaiting.authUserId, awaitingPlan, null);
    expect(result).toEqual({
      status: 'restricted',
      subscription: {
        status: 'awaiting_activation',
        effective_end_exclusive: null,
      },
    });
    expect(JSON.stringify(result)).not.toContain(awaitingPlan);
  });

  it('refuses every staff role, a foreign-workspace trainer and an unknown identity', async () => {
    for (const actor of [
      p.fixture.po,
      p.fixture.woA,
      p.fixture.trainerA,
      p.fixture.trainerB,
      p.fixture.salesA,
    ])
      expect(
        await read(actor.userId, nutritionPlan, null),
        actor.userId,
      ).toEqual({ status: 'invalid' });
    expect(await read(randomUUID(), nutritionPlan, null)).toEqual({
      status: 'invalid',
    });
    const anon = await anonClient().rpc('client_portal_nutrition_plan', {
      p_plan_id: nutritionPlan,
      p_revision_number: null,
    });
    expect(anon.error).not.toBeNull();
  });

  it('keeps the F18 content table and selections closed to direct client reads of foreign rows', async () => {
    const rows = await p.db.begin(async (tx) =>
      asUser(
        tx,
        other.authUserId,
        async (inner) => inner`select
        (select count(*)::int from public.nutrition_plan_version_contents) as contents,
        (select count(*)::int from public.client_nutrition_alternative_selections
          where client_id=${active.clientId}) as foreign_selections`,
      ),
    );
    expect(rows[0]).toEqual({ contents: 0, foreign_selections: 0 });
  });

  it('is a definer function with an empty search path executable only by authenticated', async () => {
    const signature = 'public.client_portal_nutrition_plan(uuid,integer)';
    const [row] =
      await p.db`select pg_get_userbyid(proowner) as owner, prosecdef, proconfig
      from pg_proc where oid=${signature}::regprocedure`;
    expect(row!.owner).toBe('postgres');
    expect(row!.prosecdef).toBe(true);
    expect(row!.proconfig).toContain('search_path=""');
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const [grant] =
        await p.db`select has_function_privilege(${role},${signature},'EXECUTE') as allowed`;
      expect(grant!.allowed, role).toBe(role === 'authenticated');
    }
  });
});

describe('F22 client export audit through the F18 recorder (T027)', () => {
  async function audit(
    userId: string,
    planId: string,
    revision: string | null,
    outcome: 'success' | 'denied',
  ): Promise<string | null> {
    // Same harness as nutrition-export.test.ts: signed claims, definer RPC.
    return p.db.begin(async (inner) => {
      await inner`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
      await inner`create or replace function pg_temp.try_audit(
          p_plan uuid, p_rev uuid, p_outcome text, p_reason text
        ) returns text language plpgsql as $fn$
        begin
          perform public.record_nutrition_export_audit(null, p_plan, p_rev, p_outcome, p_reason);
          return null;
        exception when others then
          return sqlstate;
        end;
        $fn$`;
      const [row] = await inner`select pg_temp.try_audit(
          ${planId}::uuid, ${revision}::uuid, ${outcome},
          ${outcome === 'denied' ? 'not_permitted' : null}) as code`;
      return row!.code as string | null;
    });
  }

  it('records the plan’s own client success with ids only and refuses another client’s success', async () => {
    expect(
      await audit(active.authUserId, nutritionPlan, rev2Id, 'success'),
    ).toBeNull();
    const [event] =
      await p.db`select workspace_id, details from public.audit_events
      where action='plan.nutrition_export' and actor_user_id=${active.authUserId}
        and target_id=${rev2Id}`;
    expect(event).toMatchObject({
      workspace_id: p.fixture.wsA.id,
      details: {
        plan_id: nutritionPlan,
        revision_id: rev2Id,
        outcome: 'success',
      },
    });
    expect(Object.keys(event!.details as object).sort()).toEqual([
      'outcome',
      'plan_id',
      'revision_id',
    ]);
    // Another client cannot record a success for a plan that is not theirs.
    expect(
      await audit(other.authUserId, nutritionPlan, rev2Id, 'success'),
    ).toBe('42501');
  });
});
