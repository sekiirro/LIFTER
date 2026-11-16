import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clientContext,
  graph,
  sql,
  type Context,
} from './registration-approval-fixture';

let fixture: Context;
let db: ReturnType<typeof sql>;
let seeded: Awaited<ReturnType<typeof graph>>;

beforeAll(async () => {
  fixture = await clientContext();
  db = sql();
  seeded = await db.begin((tx) => graph(tx, fixture));
  await db`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,
    delivery_event_id,activation_source)
    values(${fixture.wsA.id},${seeded.subscription},clock_timestamp(),${randomUUID()},'po_override')`;
});

afterAll(async () => db?.end());

function makeDraftDoc(sessionDayId: string, restDayId: string) {
  return {
    schema_version: 1,
    days: [
      { id: sessionDayId, kind: 'session', title: 'Day 1', items: [] },
      { id: restDayId, kind: 'rest', title: 'Rest', items: [] },
    ],
  };
}

describe('F17 T031 — Add exercise RPC', () => {
  it('adds global exercise via bounded search, pins versions/override workspace, copies effective non-video fields & 3 defaults with zero sets, and preserves edits through save/reload/publish while muscles stay pinned and video resolves live', async () => {
    const uniqueName = `T031 Bench ${randomUUID()}`;
    const createGlobal = await fixture.po.client.rpc(
      'catalog_create_exercise',
      {
        p_operation_key: randomUUID(),
        p_request: {
          name_en: uniqueName,
          name_ar: 'بنش برس',
          description: 'Canonical description',
          notes: 'Canonical notes',
          primary_muscle_code: 'chest',
          secondary_muscle_codes: ['triceps'],
          equipment_codes: ['barbell'],
          video_url: 'https://youtu.be/canon000001',
          default_rest_time: 60,
          default_rir: 2,
          default_reps: 10,
        },
      },
    );
    expect(createGlobal.error).toBeNull();
    const exerciseId = (createGlobal.data as { exercise_id: string })
      .exercise_id;

    // Create a second global exercise as an alternative
    const altGlobal = await fixture.po.client.rpc('catalog_create_exercise', {
      p_operation_key: randomUUID(),
      p_request: {
        name_en: `T031 Alt ${randomUUID()}`,
        name_ar: 'بديل',
        primary_muscle_code: 'chest',
        equipment_codes: ['dumbbell'],
      },
    });
    expect(altGlobal.error).toBeNull();
    const altExerciseId = (altGlobal.data as { exercise_id: string })
      .exercise_id;

    // Write workspace A override v1
    const overrideRes = await fixture.trainerA.client.rpc(
      'catalog_write_exercise_override',
      {
        p_workspace_id: fixture.wsA.id,
        p_exercise_id: exerciseId,
        p_expected_version: 0,
        p_operation_key: randomUUID(),
        p_request: {
          name_en: `${uniqueName} WS-A`,
          description: 'WS-A override description',
          notes: 'WS-A override notes',
          video_url: 'https://youtu.be/ovr00000001',
          default_rest_time: 90,
          default_rir: 1,
          default_reps: { min: 8, max: 12 },
          alternatives: [{ global_exercise_id: altExerciseId }],
        },
      },
    );
    expect(overrideRes.error).toBeNull();

    // Bounded search selection
    const searchRes = await fixture.trainerA.client.rpc('catalog_search', {
      kind: 'exercise',
      query: uniqueName,
      filters: { page_size: 10 },
      cursor: null,
      workspace_id: fixture.wsA.id,
    });
    expect(searchRes.error).toBeNull();
    const rows = searchRes.data as Array<{ result_id: string }>;
    expect(rows.some((r) => r.result_id === exerciseId)).toBe(true);

    // Create workout plan draft
    const sessionDayId = randomUUID();
    const restDayId = randomUUID();
    const planRes = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'workout',
      p_content: makeDraftDoc(sessionDayId, restDayId),
      p_operation_key: randomUUID(),
    });
    expect(planRes.error).toBeNull();
    const planId = planRes.data as string;

    // Add exercise via T031 RPC
    const addOpKey = randomUUID();
    const addRes = await fixture.trainerA.client.rpc(
      'f17_add_workout_exercise',
      {
        p_plan_id: planId,
        p_day_id: sessionDayId,
        p_source: 'global',
        p_exercise_id: exerciseId,
        p_expected_draft_version: 1,
        p_operation_key: addOpKey,
      },
    );
    expect(addRes.error).toBeNull();
    const receipt = addRes.data as {
      draft_version: number;
      item_id: string;
      item: Record<string, unknown>;
    };
    expect(receipt.draft_version).toBe(2);
    expect(receipt.item).toMatchObject({
      id: receipt.item_id,
      name: `${uniqueName} WS-A`,
      description: 'WS-A override description',
      notes: 'WS-A override notes',
      restSec: 90,
      rir: 1,
      reps: { min: 8, max: 12 },
      sets: [],
      exercise: {
        source: 'global',
        identity_id: exerciseId,
        version: 1,
        overrideVersion: 1,
        overrideWorkspaceId: fixture.wsA.id,
      },
      alternatives: [
        {
          source: 'global',
          identity_id: altExerciseId,
          version: 1,
        },
      ],
    });
    expect(JSON.stringify(receipt.item)).not.toContain('youtu.be');
    expect(receipt.item).not.toHaveProperty('video');
    expect(receipt.item).not.toHaveProperty('video_url');

    // Exact replay returns same receipt without duplicating item
    const replayRes = await fixture.trainerA.client.rpc(
      'f17_add_workout_exercise',
      {
        p_plan_id: planId,
        p_day_id: sessionDayId,
        p_source: 'global',
        p_exercise_id: exerciseId,
        p_expected_draft_version: 1,
        p_operation_key: addOpKey,
      },
    );
    expect(replayRes.error).toBeNull();
    expect(replayRes.data).toEqual(receipt);

    // Key conflict with changed args
    const conflictRes = await fixture.trainerA.client.rpc(
      'f17_add_workout_exercise',
      {
        p_plan_id: planId,
        p_day_id: sessionDayId,
        p_source: 'global',
        p_exercise_id: altExerciseId,
        p_expected_draft_version: 1,
        p_operation_key: addOpKey,
      },
    );
    expect(conflictRes.error?.message).toContain('key_conflict');

    // Trainer edits name and description via save_plan_draft
    const [draftRow] = await db`
      select content from public.plan_drafts
      where workspace_id = ${fixture.wsA.id} and plan_id = ${planId}
    `;
    const editedContent = structuredClone(draftRow!.content) as {
      schema_version: number;
      days: Array<{
        id: string;
        kind: string;
        items: Array<Record<string, unknown>>;
      }>;
    };
    expect(editedContent.days[0]!.items).toHaveLength(1);
    editedContent.days[0]!.items[0]!.name = 'Trainer Custom Bench';
    editedContent.days[0]!.items[0]!.description = 'Trainer Custom Description';

    const saveRes = await fixture.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 2,
      p_content: editedContent,
      p_operation_key: randomUUID(),
    });
    expect(saveRes.error).toBeNull();
    expect(saveRes.data).toBe(3);

    // Later catalog v2 + override v2 edits (including muscle taxonomy and video)
    const versionGlobal = await fixture.po.client.rpc(
      'catalog_version_exercise',
      {
        p_exercise_id: exerciseId,
        p_expected_version: 1,
        p_operation_key: randomUUID(),
        p_request: {
          name_en: `${uniqueName} V2`,
          name_ar: 'بنش برس 2',
          description: 'Canonical V2 desc',
          primary_muscle_code: 'front_delts',
          secondary_muscle_codes: ['abs'],
          equipment_codes: ['barbell'],
          video_url: 'https://youtu.be/canon000002',
          default_rest_time: 180,
        },
      },
    );
    expect(versionGlobal.error).toBeNull();

    const overrideV2 = await fixture.trainerA.client.rpc(
      'catalog_write_exercise_override',
      {
        p_workspace_id: fixture.wsA.id,
        p_exercise_id: exerciseId,
        p_expected_version: 1,
        p_operation_key: randomUUID(),
        p_request: {
          name_en: `${uniqueName} WS-A V2`,
          description: 'WS-A V2 desc',
          video_url: 'https://youtu.be/ovr00000002',
          default_rest_time: 120,
        },
      },
    );
    expect(overrideV2.error).toBeNull();

    // Draft save/reload still has trainer edits and v1/v1 pins
    const [reloaded] = await db`
      select content from public.plan_drafts
      where workspace_id = ${fixture.wsA.id} and plan_id = ${planId}
    `;
    const reloadedItem = (reloaded!.content as typeof editedContent).days[0]!
      .items[0]!;
    expect(reloadedItem.name).toBe('Trainer Custom Bench');
    expect(reloadedItem.description).toBe('Trainer Custom Description');
    expect(reloadedItem.restSec).toBe(90);
    expect(reloadedItem.exercise).toEqual({
      source: 'global',
      identity_id: exerciseId,
      version: 1,
      overrideVersion: 1,
      overrideWorkspaceId: fixture.wsA.id,
    });

    // Muscle taxonomy resolves from pinned immutable v1 (chest, [triceps]), NOT v2 (shoulders, [core])
    const muscleRes = await fixture.trainerA.client.rpc(
      'f17_resolve_workout_exercise_muscles',
      {
        p_workspace_id: fixture.wsA.id,
        p_reference: reloadedItem.exercise,
      },
    );
    expect(muscleRes.error).toBeNull();
    expect(muscleRes.data).toEqual({
      primary_muscle_code: 'chest',
      secondary_muscle_codes: ['triceps'],
    });

    // Publish and verify trainer-edited name & description + original pins are frozen, no video stored
    const pubRes = await fixture.trainerA.client.rpc('ready_and_publish_plan', {
      p_plan_id: planId,
      p_expected_draft_version: 3,
      p_expected_published_version: 0,
      p_operation_key: randomUUID(),
    });
    expect(pubRes.error).toBeNull();
    expect((pubRes.data as { status: string }).status).toBe('ok');

    const [revRow] = await db`
      select content from public.plan_revisions
      where workspace_id = ${fixture.wsA.id} and plan_id = ${planId} and revision_number = 1
    `;
    const pubItem = (revRow!.content as typeof editedContent).days[0]!
      .items[0]!;
    expect(pubItem.name).toBe('Trainer Custom Bench');
    expect(pubItem.description).toBe('Trainer Custom Description');
    expect(pubItem.exercise).toEqual({
      source: 'global',
      identity_id: exerciseId,
      version: 1,
      overrideVersion: 1,
      overrideWorkspaceId: fixture.wsA.id,
    });
    expect(JSON.stringify(revRow!.content)).not.toContain('youtu.be');

    // Video resolves current via F16
    const detailRes = await fixture.trainerA.client.rpc(
      'catalog_exercise_detail',
      {
        p_exercise_id: exerciseId,
        p_workspace_id: fixture.wsA.id,
      },
    );
    expect(detailRes.error).toBeNull();
    const detailRow = (
      detailRes.data as Array<{ variation: { video_url: string } }>
    )[0]!;
    expect(detailRow.variation.video_url).toBe('https://youtu.be/ovr00000002');
  });

  it('leaves absent defaults blank, rejects rest-day add, and enforces workspace exclusion + foreign-private reference refusal + replay auth recheck', async () => {
    // Global exercise with no defaults
    const noDefRes = await fixture.po.client.rpc('catalog_create_exercise', {
      p_operation_key: randomUUID(),
      p_request: {
        name_en: `T031 NoDefaults ${randomUUID()}`,
        name_ar: 'بدون افتراضيات',
        primary_muscle_code: 'lats',
        equipment_codes: ['cable'],
      },
    });
    expect(noDefRes.error).toBeNull();
    const noDefId = (noDefRes.data as { exercise_id: string }).exercise_id;

    // Workspace B private exercise
    const wsBExRes = await fixture.trainerB.client.rpc(
      'catalog_write_workspace_exercise',
      {
        p_workspace_id: fixture.wsB.id,
        p_exercise_id: null,
        p_expected_version: 0,
        p_operation_key: randomUUID(),
        p_request: {
          name_en: `T031 Private B ${randomUUID()}`,
          name_ar: 'خاص ب',
          primary_muscle_code: 'quads',
          equipment_codes: ['machine'],
        },
      },
    );
    expect(wsBExRes.error).toBeNull();
    const wsBExId = (wsBExRes.data as { exercise_id: string }).exercise_id;

    // Workspace A private exercise
    const wsAExRes = await fixture.trainerA.client.rpc(
      'catalog_write_workspace_exercise',
      {
        p_workspace_id: fixture.wsA.id,
        p_exercise_id: null,
        p_expected_version: 0,
        p_operation_key: randomUUID(),
        p_request: {
          name_en: `T031 Private A ${randomUUID()}`,
          name_ar: 'خاص أ',
          primary_muscle_code: 'glutes',
          equipment_codes: ['kettlebell'],
          default_rir: 0,
        },
      },
    );
    expect(wsAExRes.error).toBeNull();
    const wsAExId = (wsAExRes.data as { exercise_id: string }).exercise_id;

    const sessionDayId = randomUUID();
    const restDayId = randomUUID();
    const planRes = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'workout',
      p_content: makeDraftDoc(sessionDayId, restDayId),
      p_operation_key: randomUUID(),
    });
    expect(planRes.error).toBeNull();
    const planId = planRes.data as string;

    // Rest-day add rejected with invalid_document and no write
    const restAdd = await fixture.trainerA.client.rpc(
      'f17_add_workout_exercise',
      {
        p_plan_id: planId,
        p_day_id: restDayId,
        p_source: 'global',
        p_exercise_id: noDefId,
        p_expected_draft_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(restAdd.error?.message).toContain('invalid_document');

    // Foreign workspace-private exercise add refused with not_permitted
    const foreignAdd = await fixture.trainerA.client.rpc(
      'f17_add_workout_exercise',
      {
        p_plan_id: planId,
        p_day_id: sessionDayId,
        p_source: 'workspace_private',
        p_exercise_id: wsBExId,
        p_expected_draft_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(foreignAdd.error?.message).toContain('not_permitted');

    // Foreign workspace-private reference in save_plan_draft refused
    const foreignDraftSave = await fixture.trainerA.client.rpc(
      'save_plan_draft',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_content: {
          schema_version: 1,
          days: [
            {
              id: sessionDayId,
              kind: 'session',
              items: [
                {
                  id: randomUUID(),
                  exercise: {
                    source: 'workspace_private',
                    identity_id: wsBExId,
                    version: 1,
                    workspace_id: fixture.wsB.id,
                  },
                  name: 'Injected Foreign',
                  alternatives: [],
                  sets: [],
                },
              ],
            },
          ],
        },
        p_operation_key: randomUUID(),
      },
    );
    expect(foreignDraftSave.error).not.toBeNull();

    // Foreign workspace-private muscle resolution refused
    const foreignMuscle = await fixture.trainerA.client.rpc(
      'f17_resolve_workout_exercise_muscles',
      {
        p_workspace_id: fixture.wsA.id,
        p_reference: {
          source: 'workspace_private',
          identity_id: wsBExId,
          version: 1,
          workspace_id: fixture.wsB.id,
        },
      },
    );
    expect(foreignMuscle.error?.message).toContain('not_permitted');

    // Global exercise with absent defaults -> restSec, rir, reps absent
    const addNoDef = await fixture.trainerA.client.rpc(
      'f17_add_workout_exercise',
      {
        p_plan_id: planId,
        p_day_id: sessionDayId,
        p_source: 'global',
        p_exercise_id: noDefId,
        p_expected_draft_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(addNoDef.error).toBeNull();
    const noDefItem = (addNoDef.data as { item: Record<string, unknown> }).item;
    expect(noDefItem).not.toHaveProperty('restSec');
    expect(noDefItem).not.toHaveProperty('rir');
    expect(noDefItem).not.toHaveProperty('reps');

    // Own workspace-private exercise succeeds with 0 RIR preserved
    const replayKey = randomUUID();
    const addOwnPrivate = await fixture.trainerA.client.rpc(
      'f17_add_workout_exercise',
      {
        p_plan_id: planId,
        p_day_id: sessionDayId,
        p_source: 'workspace_private',
        p_exercise_id: wsAExId,
        p_expected_draft_version: 2,
        p_operation_key: replayKey,
      },
    );
    expect(addOwnPrivate.error).toBeNull();
    const ownPrivateItem = (
      addOwnPrivate.data as { item: Record<string, unknown> }
    ).item;
    expect(ownPrivateItem).toMatchObject({
      rir: 0,
      sets: [],
      exercise: {
        source: 'workspace_private',
        identity_id: wsAExId,
        version: 1,
        workspace_id: fixture.wsA.id,
      },
    });

    // Own workspace-private muscle resolution from pinned version
    const ownMuscle = await fixture.trainerA.client.rpc(
      'f17_resolve_workout_exercise_muscles',
      {
        p_workspace_id: fixture.wsA.id,
        p_reference: ownPrivateItem.exercise,
      },
    );
    expect(ownMuscle.error).toBeNull();
    expect(ownMuscle.data).toEqual({
      primary_muscle_code: 'glutes',
      secondary_muscle_codes: [],
    });

    // Foreign trainer denied
    const foreignTrainerAdd = await fixture.trainerB.client.rpc(
      'f17_add_workout_exercise',
      {
        p_plan_id: planId,
        p_day_id: sessionDayId,
        p_source: 'global',
        p_exercise_id: noDefId,
        p_expected_draft_version: 3,
        p_operation_key: randomUUID(),
      },
    );
    expect(foreignTrainerAdd.error?.message).toContain('not_permitted');

    // Revoke trainerA membership inside a rolled-back tx and verify replay re-checks authorization
    await expect(
      db.begin(async (tx) => {
        await tx`
          update public.workspace_memberships
          set revoked_at = clock_timestamp(), revoked_by = ${fixture.po.userId}
          where workspace_id = ${fixture.wsA.id} and user_id = ${fixture.trainerA.userId} and revoked_at is null
        `;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: fixture.trainerA.userId, role: 'authenticated' })}, true)`;
        await tx`select public.f17_add_workout_exercise(${planId}, ${sessionDayId}, 'workspace_private', ${wsAExId}, 2, ${replayKey})`;
      }),
    ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
  });
});
