import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient } from './harness';
import {
  asUser,
  readWorkoutPlan,
  workoutDocument,
  workoutFixture,
  type WorkoutClient,
  type WorkoutFixture,
} from './client-workout-fixture';

// F16/F17 client-safe workout projection (F22 T017/T024/T025/T028; FR-004,
// FR-006, FR-010; F16 FR-029, F16-MCQ-9). Synthetic data only.
let p: WorkoutFixture;
let active: WorkoutClient;
let awaiting: WorkoutClient;
let other: WorkoutClient;
let plan: string;
let draftOnlyPlan: string;
let otherPlan: string;
let awaitingPlan: string;
let foreignRefPlans: Record<string, string>;
let markerPlan: string;
let removedPlan: string;
let rev1Id: string;
let rev2Id: string;

let globalMain: string;
let globalAlt: string;
let privateOwn: string;
let privateForeign: string;

const CANONICAL = 'https://youtu.be/canonical123';
const OVERRIDE = 'https://youtu.be/override1234';
const OVERRIDE_2 = 'https://youtu.be/override5678';
const PRIVATE = 'https://youtu.be/privatevid1';
const STAFF_ONLY = 'STAFF-ONLY-LIBRARY-TEXT';

const read = (userId: string, planId: string | null, revision: number | null) =>
  readWorkoutPlan(p.db, userId, planId, revision);

const global = (id: string, overrideWorkspaceId?: string) =>
  ({
    source: 'global' as const,
    identity_id: id,
    ...(overrideWorkspaceId ? { overrideWorkspaceId } : {}),
  }) as const;
const priv = (id: string, workspaceId: string) =>
  ({
    source: 'workspace_private' as const,
    identity_id: id,
    workspace_id: workspaceId,
  }) as const;

async function publishedPlan(
  client: WorkoutClient,
  content: unknown,
): Promise<string> {
  const planId = await p.createDraft(client.clientId, content);
  await p.publish(planId, 1, 0);
  return planId;
}

beforeAll(async () => {
  p = await workoutFixture();
  const wsA = p.fixture.wsA.id;
  const wsB = p.fixture.wsB.id;
  active = await p.makeClient({ activate: true });
  awaiting = await p.makeClient({ activate: false });
  other = await p.makeClient({ activate: true });

  globalMain = await p.createGlobal(`F17C main ${randomUUID()}`, CANONICAL);
  globalAlt = await p.createGlobal(`F17C alt ${randomUUID()}`, null);
  await p.overrideGlobalVideo(globalMain, OVERRIDE);
  privateOwn = await p.createPrivate(wsA, p.fixture.trainerA.userId, {
    name_en: `F17C private ${randomUUID()}`,
    video_url: PRIVATE,
    description: STAFF_ONLY,
    notes: STAFF_ONLY,
  });
  privateForeign = await p.createPrivate(wsB, p.fixture.trainerB.userId, {
    name_en: `F17C foreign ${randomUUID()}`,
    video_url: 'https://youtu.be/foreignvid1',
  });

  const content = (title: string) =>
    workoutDocument(title, [
      {
        exercise: global(globalMain),
        alternatives: [global(globalAlt), priv(privateOwn, wsA)],
      },
    ]);
  plan = await p.createDraft(active.clientId, content('F17C v1'));
  await p.publish(plan, 1, 0);
  await p.revise(plan, 1, content('F17C v2'));
  await p.publish(plan, 2, 1);
  rev1Id = await p.revisionId(plan, 1);
  rev2Id = await p.revisionId(plan, 2);
  draftOnlyPlan = await p.createDraft(active.clientId, content('F17C draft'));
  otherPlan = await publishedPlan(other, content('F17C other'));
  awaitingPlan = await publishedPlan(awaiting, content('F17C await'));

  // Revisions carrying references the client wall must refuse as one whole.
  foreignRefPlans = {
    // The F17 write guards refuse foreign private references, so these two
    // revisions are poisoned after publication to prove the client wall.
    foreignPrivate: await p.publishPoisoned(
      active.clientId,
      content('F17C foreign private'),
      workoutDocument('F17C foreign private', [
        { exercise: priv(privateForeign, wsB) },
      ]),
    ),
    foreignPrivateAsOwn: await publishedPlan(
      active,
      workoutDocument('F17C foreign id own ws', [
        { exercise: priv(privateForeign, wsA) },
      ]),
    ),
    foreignOverride: await publishedPlan(
      active,
      workoutDocument('F17C foreign override', [
        { exercise: global(globalMain, wsB) },
      ]),
    ),
    unknownGlobal: await publishedPlan(
      active,
      workoutDocument('F17C unknown', [{ exercise: global(randomUUID()) }]),
    ),
    oneBadAlternative: await p.publishPoisoned(
      active.clientId,
      content('F17C one bad alt'),
      workoutDocument('F17C one bad alt', [
        {
          exercise: global(globalMain),
          alternatives: [global(globalAlt), priv(privateForeign, wsB)],
        },
      ]),
    ),
  };

  // Coach-authored JSON with a key the F17 schema does not define.
  const marked = content('F17C marker') as Record<string, unknown>;
  marked.staff_only_marker = STAFF_ONLY;
  (marked.days as Record<string, unknown>[])[0]!.internal_day = STAFF_ONLY;
  markerPlan = await publishedPlan(active, marked);

  // F16 parity: a removed exercise stays displayable; a merged one resolves
  // to its survivor.
  const removed = await p.createGlobal(`F17C removed ${randomUUID()}`, null);
  const merged = await p.createGlobal(`F17C merged ${randomUUID()}`, null);
  await p.asActor(
    p.fixture.po.userId,
    (tx) =>
      tx`select public.catalog_transition_exercise(${removed}, 0, 'remove', ${randomUUID()})`,
  );
  await p.asActor(
    p.fixture.po.userId,
    (tx) =>
      tx`select public.catalog_merge_exercise(${merged}, ${globalAlt}, 0, ${randomUUID()})`,
  );
  removedPlan = await publishedPlan(
    active,
    workoutDocument('F17C lifecycle', [
      { exercise: global(removed), alternatives: [global(merged)] },
    ]),
  );
});
afterAll(async () => p?.close());

describe('client workout projection read', () => {
  it('returns the latest delivered revision with an allowlisted document and live exercise name and video', async () => {
    const result = await read(active.authUserId, plan, null);
    expect(result.status).toBe('ok');
    expect(result.subscription).toEqual({
      status: 'active',
      effective_end_exclusive: expect.any(String),
    });
    expect(result.plan).toEqual({
      plan_id: plan,
      workspace_id: p.fixture.wsA.id,
      revision_id: rev2Id,
      revision_number: 2,
      published_at: expect.any(String),
    });
    const document = result.document as {
      notes: string;
      days: { items: { exercise: { identity_id: string } }[] }[];
    };
    expect(document.notes).toBe('F17C v2');
    expect(document.days[0]!.items[0]!.exercise.identity_id).toBe(globalMain);
    const exercises = result.exercises as Record<string, unknown>[];
    expect(exercises).toHaveLength(3);
    const byId = new Map(exercises.map((e) => [e.identity_id, e]));
    // Global: workspace override video wins over the canonical one.
    expect(byId.get(globalMain)).toEqual({
      source: 'global',
      identity_id: globalMain,
      name: expect.stringContaining('F17C main'),
      video_url: OVERRIDE,
    });
    // No video anywhere: the key is absent, never a guessed URL.
    expect(byId.get(globalAlt)).toEqual({
      source: 'global',
      identity_id: globalAlt,
      name: expect.stringContaining('F17C alt'),
    });
    // Workspace-private exercise: visible to the client only through this
    // projection (F16-MCQ-9 = a), scoped to the client's own workspace.
    expect(byId.get(privateOwn)).toEqual({
      source: 'workspace_private',
      identity_id: privateOwn,
      workspace_id: p.fixture.wsA.id,
      name: expect.stringContaining('F17C private'),
      video_url: PRIVATE,
    });
  });

  it('keeps the document frozen but the video live (S37-PO-1 Q2 = A)', async () => {
    const before = await read(active.authUserId, plan, 1);
    await p.overrideGlobalVideo(globalMain, OVERRIDE_2, 1);
    const after = await read(active.authUserId, plan, 1);
    expect(after.document).toEqual(before.document);
    const video = (r: Record<string, unknown>) =>
      (r.exercises as { identity_id: string; video_url?: string }[]).find(
        (e) => e.identity_id === globalMain,
      )!.video_url;
    expect(video(before)).toBe(OVERRIDE);
    expect(video(after)).toBe(OVERRIDE_2);
  });

  it('returns the exact selected historical revision and not_found for unknown revision numbers', async () => {
    const first = await read(active.authUserId, plan, 1);
    expect(first.plan).toMatchObject({
      revision_id: rev1Id,
      revision_number: 1,
    });
    expect((first.document as { notes: string }).notes).toBe('F17C v1');
    for (const revision of [3, 0, -1])
      expect(await read(active.authUserId, plan, revision)).toEqual({
        status: 'not_found',
      });
  });

  it('exposes no staff-only or private catalog field', async () => {
    const result = await read(active.authUserId, plan, null);
    const text = JSON.stringify(result);
    for (const forbidden of [
      STAFF_ONLY,
      'created_by',
      'origin_workspace_id',
      'authored_by',
      'effective_fields',
      'name_ar',
      'lifecycle',
      'default_',
      'subscription_id',
      'client_id',
    ])
      expect(text, forbidden).not.toContain(forbidden);
    const allowed = [
      'source',
      'identity_id',
      'workspace_id',
      'overrideWorkspaceId',
      'name',
      'video_url',
    ];
    for (const exercise of result.exercises as Record<string, unknown>[])
      for (const key of Object.keys(exercise))
        expect(allowed, key).toContain(key);
    expect(Object.keys(result).sort()).toEqual([
      'document',
      'exercises',
      'plan',
      'status',
      'subscription',
    ]);
  });

  it('drops keys the F17 schema does not define from coach-authored content', async () => {
    const result = await read(active.authUserId, markerPlan, null);
    expect(result.status).toBe('ok');
    expect(JSON.stringify(result)).not.toContain(STAFF_ONLY);
    const [row] = await p.db`select
      app_private.f17_client_safe_workout_document(${p.db.json({
        schema_version: 1,
        authored_by: STAFF_ONLY,
        days: [
          {
            id: 'd',
            kind: 'session',
            private_day: STAFF_ONLY,
            items: [
              {
                id: 'i',
                name: 'n',
                private_item: STAFF_ONLY,
                exercise: { source: 'global', identity_id: 'x', secret: 1 },
                alternatives: [],
                sets: [
                  {
                    id: 's',
                    type: 'working',
                    load: { mode: 'bodyweight', leak: STAFF_ONLY },
                    private_set: STAFF_ONLY,
                  },
                ],
              },
            ],
          },
        ],
      } as never)}::jsonb) as value`;
    expect(JSON.stringify(row!.value)).not.toContain(STAFF_ONLY);
    expect(row!.value).toMatchObject({ schema_version: 1 });
  });

  it('keeps F16 lifecycle parity: removed shows itself and merged resolves to the survivor', async () => {
    const result = await read(active.authUserId, removedPlan, null);
    expect(result.status).toBe('ok');
    const names = (result.exercises as { name: string }[]).map((e) => e.name);
    expect(names.some((n) => n.includes('F17C removed'))).toBe(true);
    expect(names.some((n) => n.includes('F17C alt'))).toBe(true);
    expect(names.some((n) => n.includes('F17C merged'))).toBe(false);
  });
});

describe('client workout projection negatives', () => {
  it('answers one not_found for draft-only, unknown, undelivered and another client plan', async () => {
    for (const planId of [draftOnlyPlan, randomUUID(), otherPlan, null])
      expect(
        await read(active.authUserId, planId, null),
        String(planId),
      ).toEqual({ status: 'not_found' });
    expect(await read(other.authUserId, plan, null)).toEqual({
      status: 'not_found',
    });
  });

  it('denies the whole call for foreign-workspace and unresolvable exercise references', async () => {
    for (const [label, planId] of Object.entries(foreignRefPlans)) {
      const result = await read(active.authUserId, planId, null);
      expect(result, label).toEqual({ status: 'not_found' });
    }
    expect(
      JSON.stringify(
        await read(active.authUserId, foreignRefPlans.foreignPrivate!, null),
      ),
    ).not.toContain('foreign');
  });

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
      expect(await read(actor.userId, plan, null), actor.userId).toEqual({
        status: 'invalid',
      });
    expect(await read(randomUUID(), plan, null)).toEqual({
      status: 'invalid',
    });
    const anon = await anonClient().rpc('client_portal_workout_plan', {
      p_plan_id: plan,
      p_revision_number: null,
    });
    expect(anon.error).not.toBeNull();
  });

  it('gives a client no direct catalog, revision or staff-detail access', async () => {
    // A client sees no plan revision rows directly: either the privilege is
    // absent or RLS filters every row.
    const revisions = await p.db
      .begin((tx) =>
        asUser(
          tx,
          active.authUserId,
          async (inner) =>
            inner`select count(*)::int as count from public.plan_revisions`,
        ),
      )
      .then((rows) => rows[0]!.count as number)
      .catch((error: { code?: string }) => error.code);
    expect([0, '42501']).toContain(revisions);
    await expect(
      p.db.begin((tx) =>
        asUser(
          tx,
          active.authUserId,
          async (inner) =>
            inner`select * from public.catalog_exercise_detail(${globalMain}, ${p.fixture.wsA.id})`,
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      p.db.begin((tx) =>
        asUser(
          tx,
          active.authUserId,
          async (inner) =>
            inner`select * from public.catalog_workspace_exercise_detail(${p.fixture.wsA.id}, ${privateOwn})`,
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('is a definer function with an empty search path executable only by authenticated; helpers are closed', async () => {
    const signature = 'public.client_portal_workout_plan(uuid,integer)';
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
    for (const helper of [
      'app_private.f22_portal_client()',
      'app_private.f17_client_safe_reference(jsonb)',
      'app_private.f17_client_safe_set(jsonb)',
      'app_private.f17_client_safe_item(jsonb)',
      'app_private.f17_client_safe_workout_document(jsonb)',
      'app_private.f17_client_resolve_global_exercise(uuid)',
    ])
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const [grant] =
          await p.db`select has_function_privilege(${role},${helper},'EXECUTE') as allowed`;
        expect(grant!.allowed, `${helper} ${role}`).toBe(false);
      }
  });
});
