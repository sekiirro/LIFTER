import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import {
  clientContext,
  graph,
  sql,
  type Context,
} from './registration-approval-fixture';
import { checked, issue } from './registration-links-fixture';
import { seedSubmittedIntake } from './f17-plan-publish-fixture';

// F16/F17 client workout projection fixtures. Every client, plan, exercise
// and name is generated synthetic test data.
export type WorkoutClient = {
  clientId: string;
  subscriptionId: string;
  authUserId: string;
};

export type WorkoutReference =
  | { source: 'global'; identity_id: string; overrideWorkspaceId?: string }
  | { source: 'workspace_private'; identity_id: string; workspace_id: string };

export type WorkoutFixture = Awaited<ReturnType<typeof workoutFixture>>;

/** F17 document v1 with one session item per entry (alternatives optional). */
export function workoutDocument(
  title: string,
  items: { exercise: WorkoutReference; alternatives?: WorkoutReference[] }[],
) {
  const withVersion = (ref: WorkoutReference) => ({
    ...ref,
    version: 1,
    ...(ref.source === 'global' && ref.overrideWorkspaceId
      ? { overrideVersion: 1 }
      : {}),
  });
  return {
    schema_version: 1,
    notes: title,
    days: [
      {
        id: randomUUID(),
        kind: 'session',
        title: 'Day 1',
        items: items.map((item, index) => ({
          id: randomUUID(),
          name: `Item ${index + 1}`,
          description: 'Client-visible coach description',
          notes: 'Client-visible coach note',
          reps: { value: 8 },
          restSec: 90,
          rir: 2,
          exercise: withVersion(item.exercise),
          alternatives: (item.alternatives ?? []).map(withVersion),
          sets: [
            {
              id: randomUUID(),
              type: 'working',
              load: { mode: 'added_weight', value: '40', unit: 'kg' },
            },
          ],
        })),
      },
    ],
  };
}

export async function workoutFixture() {
  const fixture: Context = await clientContext();
  const db = sql();
  let firstLinkUsed = false;
  const intakeSeeded = new Set<string>();

  async function makeClient(options: {
    activate: boolean;
  }): Promise<WorkoutClient> {
    const linkId = firstLinkUsed
      ? (checked(await issue(fixture)) as string)
      : fixture.link;
    firstLinkUsed = true;
    const ids = await db.begin((tx) => graph(tx, fixture, { linkId }));
    if (options.activate)
      // F19 T021 guard: a synthetic activation without deliveries is a PO override.
      await db`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
        values(${fixture.wsA.id},${ids.subscription},clock_timestamp(),${randomUUID()},'po_override')`;
    const [row] =
      await db`select auth_user_id from public.clients where id=${ids.client}`;
    return {
      clientId: ids.client,
      subscriptionId: ids.subscription,
      authUserId: row!.auth_user_id as string,
    };
  }

  async function createDraft(
    clientId: string,
    content: unknown,
  ): Promise<string> {
    if (!intakeSeeded.has(clientId)) {
      await db.begin((tx) => seedSubmittedIntake(tx, fixture.wsA.id, clientId));
      intakeSeeded.add(clientId);
    }
    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: clientId,
      p_plan_kind: 'workout',
      p_content: content,
      p_operation_key: randomUUID(),
    });
    if (created.error) throw new Error('workout fixture draft failed');
    return created.data as string;
  }

  async function publish(
    planId: string,
    expectedDraftVersion: number,
    expectedPublishedVersion: number,
  ) {
    const result = await fixture.trainerA.client.rpc('ready_and_publish_plan', {
      p_plan_id: planId,
      p_expected_draft_version: expectedDraftVersion,
      p_expected_published_version: expectedPublishedVersion,
      p_operation_key: randomUUID(),
    });
    if (result.error || (result.data as { status?: string })?.status !== 'ok')
      throw new Error('workout fixture publish failed');
  }

  async function revise(
    planId: string,
    draftVersion: number,
    content: unknown,
  ) {
    const saved = await fixture.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: draftVersion,
      p_content: content,
      p_operation_key: randomUUID(),
    });
    if (saved.error) throw new Error('workout fixture save failed');
  }

  /**
   * Publish a valid plan, then overwrite its immutable revision content with
   * `poisoned` while triggers are bypassed (session_replication_role). The F17
   * guards refuse foreign private references at write time, so this is the
   * only way to prove the client wall refuses them as defense in depth.
   * Synthetic test fixture only.
   */
  async function publishPoisoned(
    clientId: string,
    safeContent: unknown,
    poisoned: unknown,
  ): Promise<string> {
    const planId = await createDraft(clientId, safeContent);
    await publish(planId, 1, 0);
    await db.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.plan_revisions set content = ${tx.json(poisoned as never)}
        where plan_id = ${planId} and revision_number = 1`;
      await tx`set local session_replication_role = origin`;
    });
    return planId;
  }

  async function revisionId(planId: string, revision: number) {
    const [row] = await db`select id from public.plan_revisions
      where plan_id=${planId} and revision_number=${revision}`;
    return row!.id as string;
  }

  // ---- exercise catalog seeding (real F16 RPCs, synthetic names) ----------
  async function asActor<T>(
    actorId: string,
    body: (tx: TransactionSql) => Promise<T>,
  ): Promise<T> {
    return (await db.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
      return body(tx);
    })) as T;
  }

  async function createGlobal(name: string, videoUrl: string | null) {
    return asActor(fixture.po.userId, async (tx) => {
      const request = {
        name_en: name,
        name_ar: 'تمرين',
        primary_muscle_code: 'chest',
        equipment_codes: ['barbell'],
        ...(videoUrl === null ? {} : { video_url: videoUrl }),
      };
      const [row] = await tx`select public.catalog_create_exercise(
        ${randomUUID()}, ${tx.json(request)}) as result`;
      return (row!.result as { exercise_id: string }).exercise_id;
    });
  }

  async function overrideGlobalVideo(
    exerciseId: string,
    videoUrl: string | null,
    expectedVersion = 0,
  ) {
    await asActor(
      fixture.trainerA.userId,
      (tx) => tx`select public.catalog_write_exercise_override(
        ${fixture.wsA.id}, ${exerciseId}, ${expectedVersion}, ${randomUUID()},
        ${tx.json({ video_url: videoUrl })})`,
    );
  }

  async function createPrivate(
    workspaceId: string,
    actorId: string,
    payload: Record<string, unknown>,
  ) {
    return asActor(actorId, async (tx) => {
      const [row] = await tx`select public.catalog_write_workspace_exercise(
        ${workspaceId}, null, null, ${randomUUID()}, ${tx.json({
          name_ar: 'تمرين خاص',
          primary_muscle_code: 'chest',
          equipment_codes: ['barbell'],
          ...payload,
        } as never)}) as result`;
      return (row!.result as { exercise_id: string }).exercise_id;
    });
  }

  return {
    fixture,
    db,
    makeClient,
    createDraft,
    publish,
    revise,
    publishPoisoned,
    revisionId,
    asActor,
    createGlobal,
    overrideGlobalVideo,
    createPrivate,
    close: () => db.end(),
  };
}

/** Run SQL as a signed `authenticated` identity inside one transaction. */
export async function asUser<T>(
  tx: TransactionSql,
  userId: string,
  body: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    return await body(tx);
  } finally {
    await tx`reset role`;
  }
}

export async function readWorkoutPlan(
  db: ReturnType<typeof sql>,
  userId: string,
  planId: string | null,
  revision: number | null,
): Promise<Record<string, unknown>> {
  return db.begin((tx) =>
    asUser(tx, userId, async (inner) => {
      const [row] =
        await inner`select public.client_portal_workout_plan(${planId}::uuid,${revision}::integer) as value`;
      return row!.value as Record<string, unknown>;
    }),
  );
}
