import { randomUUID } from 'node:crypto';
import type { JSONValue } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  nutritionUnitContextKey,
  validateNutritionDocument,
} from '../../lib/plans/nutrition/schema';
import {
  clientNotesFixture,
  type ClientNotesFixture,
} from './client-notes-fixture';

let fixture: ClientNotesFixture;
const db = () => fixture.db;

beforeAll(async () => {
  fixture = await clientNotesFixture();
});
afterAll(async () => fixture?.close());

async function seedPublishedPlan(
  clientId: string,
  kind: 'workout' | 'nutrition',
  rev1Content: Record<string, JSONValue>,
  rev2Content: Record<string, JSONValue>,
  unpublishedDraft3Content: Record<string, JSONValue>,
) {
  const createRes = await fixture.context.trainerA.client.rpc(
    'create_plan_draft',
    {
      p_workspace_id: fixture.workspaceId,
      p_client_id: clientId,
      p_plan_kind: kind,
      p_content: rev1Content,
      p_operation_key: randomUUID(),
    },
  );
  if (createRes.error || typeof createRes.data !== 'string') {
    throw new Error(`Seed create failed: ${createRes.error?.message}`);
  }
  const planId = createRes.data;
  const trainerId = fixture.context.trainerA.userId;

  await db()`
    insert into public.plan_revisions (
      workspace_id, plan_id, revision_number, source_draft_version,
      plan_kind, content, authored_by
    ) values (
      ${fixture.workspaceId}, ${planId}, 1, 1, ${kind},
      ${db().json(rev1Content)}, ${trainerId}
    )
  `;

  const save2 = await fixture.context.trainerA.client.rpc('save_plan_draft', {
    p_plan_id: planId,
    p_expected_draft_version: 1,
    p_content: rev2Content,
    p_operation_key: randomUUID(),
  });
  if (save2.error) throw new Error(`Seed save2 failed: ${save2.error.message}`);

  await db()`
    insert into public.plan_revisions (
      workspace_id, plan_id, revision_number, source_draft_version,
      plan_kind, content, authored_by
    ) values (
      ${fixture.workspaceId}, ${planId}, 2, 2, ${kind},
      ${db().json(rev2Content)}, ${trainerId}
    )
  `;

  const save3 = await fixture.context.trainerA.client.rpc('save_plan_draft', {
    p_plan_id: planId,
    p_expected_draft_version: 2,
    p_content: unpublishedDraft3Content,
    p_operation_key: randomUUID(),
  });
  if (save3.error) throw new Error(`Seed save3 failed: ${save3.error.message}`);

  return planId;
}

async function seedWorkspaceTemplate(
  workspaceId: string,
  v1Doc: Record<string, JSONValue>,
  v2Doc: Record<string, JSONValue>,
  lifecycleState: 'active' | 'retired' = 'active',
) {
  const templateId = randomUUID();
  const actorId = fixture.context.woA.userId;

  await db().begin(async (tx) => {
    await tx`set constraints all deferred`;
    await tx`
      insert into public.workout_workspace_templates (
        workspace_id, id, lifecycle_state, current_version, created_by,
        retired_at, retired_by
      ) values (
        ${workspaceId}, ${templateId}, ${lifecycleState}, 2, ${actorId},
        ${lifecycleState === 'retired' ? new Date().toISOString() : null},
        ${lifecycleState === 'retired' ? actorId : null}
      )
    `;
    await tx`
      insert into public.workout_workspace_template_versions (
        workspace_id, template_id, version, title, schema_version, document, created_by
      ) values
      (${workspaceId}, ${templateId}, 1, 'Tpl v1', 1, ${tx.json(v1Doc)}, ${actorId}),
      (${workspaceId}, ${templateId}, 2, 'Tpl v2', 1, ${tx.json(v2Doc)}, ${actorId})
    `;
  });

  return templateId;
}

async function seedGlobalTemplate(
  v1Doc: Record<string, JSONValue>,
  lifecycleState: 'active' | 'retired' = 'active',
) {
  const templateId = randomUUID();
  const actorId = fixture.context.po.userId;

  await db().begin(async (tx) => {
    await tx`set constraints all deferred`;
    await tx`
      insert into public.workout_global_templates (
        id, lifecycle_state, current_version, created_by,
        retired_at, retired_by
      ) values (
        ${templateId}, ${lifecycleState}, 1, ${actorId},
        ${lifecycleState === 'retired' ? new Date().toISOString() : null},
        ${lifecycleState === 'retired' ? actorId : null}
      )
    `;
    await tx`
      insert into public.workout_global_template_versions (
        template_id, version, title, schema_version, document, created_by
      ) values
      (${templateId}, 1, 'Global Tpl v1', 1, ${tx.json(v1Doc)}, ${actorId})
    `;
  });

  return templateId;
}

async function seedNutritionWorkspaceTemplate(
  workspaceId: string,
  v1Doc: Record<string, JSONValue>,
  v2Doc: Record<string, JSONValue>,
  status: 'active' | 'retired' = 'active',
) {
  const templateId = randomUUID();
  const actorId = fixture.context.woA.userId;

  await db().begin(async (tx) => {
    await tx`set constraints all deferred`;
    await tx`
      insert into public.nutrition_workspace_templates (
        workspace_id, id, status, display_name, current_version, created_by,
        retired_at
      ) values (
        ${workspaceId}, ${templateId}, ${status}, 'Nutrition Tpl', 2, ${actorId},
        ${status === 'retired' ? new Date().toISOString() : null}
      )
    `;
    await tx`
      insert into public.nutrition_workspace_template_versions (
        workspace_id, template_id, version, document, schema_version, created_by
      ) values
      (${workspaceId}, ${templateId}, 1, ${tx.json(v1Doc)}, 1, ${actorId}),
      (${workspaceId}, ${templateId}, 2, ${tx.json(v2Doc)}, 1, ${actorId})
    `;
  });

  return templateId;
}

async function seedNutritionGlobalTemplate(
  v1Doc: Record<string, JSONValue>,
  status: 'active' | 'retired' = 'active',
) {
  const templateId = randomUUID();
  const actorId = fixture.context.po.userId;

  await db().begin(async (tx) => {
    await tx`set constraints all deferred`;
    await tx`
      insert into public.nutrition_global_templates (
        id, status, current_version, created_by, retired_at
      ) values (
        ${templateId}, ${status}, 1, ${actorId},
        ${status === 'retired' ? new Date().toISOString() : null}
      )
    `;
    await tx`
      insert into public.nutrition_global_template_versions (
        template_id, version, document, schema_version, created_by
      ) values
      (${templateId}, 1, ${tx.json(v1Doc)}, 1, ${actorId})
    `;
  });

  return templateId;
}

function makeValidNutritionTemplateDoc(notes: string) {
  const foodOats = randomUUID();
  const foodRice = randomUUID();
  return {
    foodOats,
    foodRice,
    doc: {
      schemaVersion: 1,
      structure: 'single_day',
      implicitDayTypeId: 'dt-1',
      dayTypes: [
        {
          id: 'dt-1',
          name: { ar: 'يوم تدريب', en: 'Training Day' },
          trainingDay: true,
          targets: { kcal: '2400', protein: '180', carbs: '260', fat: '70' },
        },
      ],
      meals: [
        {
          id: 'meal-1',
          name: { ar: 'الفطار', en: 'Breakfast' },
          note: 'Take with water',
          recipeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          items: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              foodId: foodOats,
              foodVersion: 2,
              quantity: { value: '80', unit: { kind: 'basis', value: 'g' } },
              note: 'Rolled oats',
              alternatives: [
                {
                  id: '22222222-2222-4222-8222-222222222221',
                  foodId: foodRice,
                  foodVersion: 1,
                  quantity: {
                    value: '100',
                    unit: { kind: 'basis', value: 'g' },
                  },
                },
              ],
            },
          ],
        },
      ],
      title: { ar: 'خطة غذائية', en: 'Nutrition Plan' },
      notes,
    } as Record<string, JSONValue>,
  };
}

describe('F19 T012 template and plan copy', () => {
  it('loads one explicit workout template version with remapped ids and blocks promoted RED references', async () => {
    const targetClientId = await fixture.createSiblingClient();
    const exerciseResult = await fixture.context.po.client.rpc(
      'catalog_create_exercise',
      {
        p_operation_key: randomUUID(),
        p_request: {
          name_en: 'Template load exercise',
          name_ar: '\u062A\u0645\u0631\u064A\u0646',
          primary_muscle_code: 'chest',
          equipment_codes: ['barbell'],
        },
      },
    );
    expect(exerciseResult.error).toBeNull();
    const exerciseId = (exerciseResult.data as { exercise_id: string })
      .exercise_id;
    const sourceDoc = {
      schema_version: 1,
      notes: 'Pinned source',
      days: [
        {
          id: randomUUID(),
          name: 'Day',
          items: [
            {
              id: randomUUID(),
              exercise: {
                source: 'global',
                identity_id: exerciseId,
                version: 1,
              },
              name: 'Custom entry',
              rir: 0,
              alternatives: [],
              sets: [
                {
                  id: randomUUID(),
                  type: 'working',
                  load: { mode: 'bodyweight' },
                },
              ],
            },
          ],
        },
      ],
    };
    const laterDoc = { schema_version: 1, notes: 'Later', days: [] };
    const templateId = await seedWorkspaceTemplate(
      fixture.workspaceId,
      sourceDoc,
      laterDoc,
    );
    const createDraft = async (actor: {
      client: typeof fixture.context.trainerA.client;
    }) => {
      const result = await actor.client.rpc('create_plan_draft', {
        p_workspace_id: fixture.workspaceId,
        p_client_id: targetClientId,
        p_plan_kind: 'workout',
        p_content: { schema_version: 1, days: [] },
        p_operation_key: randomUUID(),
      });
      expect(result.error).toBeNull();
      return result.data as string;
    };
    const planId = await createDraft(fixture.context.trainerA);
    const [loadRpc] = await db()`
      select p.prosecdef, p.proconfig,
        pg_catalog.pg_get_userbyid(p.proowner) as owner,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
      from pg_catalog.pg_proc p
      where p.oid = 'public.load_workout_template_version(uuid,text,uuid,integer,uuid)'::regprocedure
    `;
    expect(loadRpc).toMatchObject({
      prosecdef: true,
      owner: 'postgres',
      authenticated_execute: true,
      anon_execute: false,
      service_role_execute: false,
    });
    expect(loadRpc?.proconfig).toContain('search_path=""');
    const loadOperationKey = randomUUID();
    const loaded = await fixture.context.trainerA.client.rpc(
      'load_workout_template_version',
      {
        p_plan_id: planId,
        p_template_kind: 'workspace',
        p_template_id: templateId,
        p_version: 1,
        p_operation_key: loadOperationKey,
      },
    );
    expect(loaded.error).toBeNull();
    expect(loaded.data).toMatchObject({
      loaded: true,
      draft_version: 2,
      version: 1,
    });
    const [loadedDraft] = await db()`
      select content from public.plan_drafts where plan_id=${planId}
    `;
    const copied = loadedDraft?.content as typeof sourceDoc;
    expect(copied).toMatchObject({ schema_version: 1, notes: 'Pinned source' });
    expect(copied.days[0]?.id).not.toBe(sourceDoc.days[0]?.id);
    expect(copied.days[0]?.items[0]?.id).not.toBe(
      sourceDoc.days[0]?.items[0]?.id,
    );
    expect(copied.days[0]?.items[0]?.sets[0]?.id).not.toBe(
      sourceDoc.days[0]?.items[0]?.sets[0]?.id,
    );
    expect(copied.days[0]?.items[0]?.rir).toBe(0);
    expect(copied.days[0]?.items[0]?.exercise).toEqual(
      sourceDoc.days[0]?.items[0]?.exercise,
    );
    const replay = await fixture.context.trainerA.client.rpc(
      'load_workout_template_version',
      {
        p_plan_id: planId,
        p_template_kind: 'workspace',
        p_template_id: templateId,
        p_version: 1,
        p_operation_key: loadOperationKey,
      },
    );
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(loaded.data);
    const foreignActor = await fixture.context.trainerB.client.rpc(
      'load_workout_template_version',
      {
        p_plan_id: planId,
        p_template_kind: 'workspace',
        p_template_id: templateId,
        p_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(foreignActor.error?.code).toBe('42501');
    const [sourceBeforePromotion] = await db()`
      select document from public.workout_workspace_template_versions
      where workspace_id=${fixture.workspaceId} and template_id=${templateId} and version=1
    `;
    expect(sourceBeforePromotion?.document).toEqual(sourceDoc);

    const unresolvedDoc = {
      schema_version: 1,
      days: [
        {
          id: randomUUID(),
          kind: 'session',
          items: [
            {
              id: randomUUID(),
              exercise: {
                source: 'workspace_private',
                identity_id: randomUUID(),
                version: 1,
                workspace_id: fixture.workspaceId,
              },
              name: 'Unresolved promoted ref',
              alternatives: [],
              sets: [],
            },
          ],
        },
      ],
    };
    const unresolvedTemplateId = await seedWorkspaceTemplate(
      fixture.workspaceId,
      unresolvedDoc,
      unresolvedDoc,
    );
    const promoted = await fixture.context.po.client.rpc(
      'promote_workout_workspace_template',
      {
        p_workspace_id: fixture.workspaceId,
        p_template_id: unresolvedTemplateId,
        p_expected_version: 2,
        p_operation_key: randomUUID(),
      },
    );
    expect(promoted.error).toBeNull();
    expect(promoted.data).toMatchObject({
      unresolved_references: [
        { path: '$.days[0].items[0].exercise', status: 'RED' },
      ],
    });
    const promotedId = (promoted.data as { template_id: string }).template_id;
    const staffGlobalLoad = await fixture.context.trainerA.client.rpc(
      'load_workout_template_version',
      {
        p_plan_id: planId,
        p_template_kind: 'global',
        p_template_id: promotedId,
        p_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(staffGlobalLoad.error?.code).toBe('42501');
    const blockedPlanId = await createDraft(fixture.context.po);
    const blocked = await fixture.context.po.client.rpc(
      'load_workout_template_version',
      {
        p_plan_id: blockedPlanId,
        p_template_kind: 'global',
        p_template_id: promotedId,
        p_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(blocked.error?.code).toBe('22023');
    const [unchangedBlockedDraft] = await db()`
      select content,draft_version from public.plan_drafts where plan_id=${blockedPlanId}
    `;
    expect(unchangedBlockedDraft).toEqual({
      content: { schema_version: 1, days: [] },
      draft_version: '1',
    });
    const [sourceAfter] = await db()`
      select document from public.workout_workspace_template_versions
      where workspace_id=${fixture.workspaceId} and template_id=${templateId} and version=1
    `;
    expect(sourceAfter?.document).toEqual(sourceDoc);
  });

  it('copies latest published workout revision (excluding draft, video, ownership, history, delivery) into an independent destination draft', async () => {
    const targetClientId = await fixture.createSiblingClient();
    const dayId = randomUUID();
    const itemId = randomUUID();
    const setId = randomUUID();
    const rev1Content = {
      schema_version: 1,
      notes: 'rev1',
      days: [],
    };
    const rev2Content = {
      schema_version: 1,
      notes: 'Latest published custom notes',
      videoUrl: 'https://cdn.example.com/must-not-copy.mp4',
      ownership: { workspace_id: fixture.workspaceId },
      authored_by: fixture.context.trainerA.userId,
      history: [{ event: 'must-not-copy' }],
      subscription: { id: randomUUID() },
      subscription_id: randomUUID(),
      delivery: { id: randomUUID() },
      delivery_id: randomUUID(),
      plan_deliveries: [{ id: randomUUID() }],
      activation: { id: randomUUID() },
      activation_id: randomUUID(),
      days: [
        {
          id: dayId,
          name: 'Lower A',
          items: [
            {
              id: itemId,
              name: 'Back Squat',
              reps: { min: 5, max: 7 },
              restSec: 180,
              rir: 2,
              notes: 'Custom tempo 3010',
              video: 'must-not-copy',
              sets: [
                {
                  id: setId,
                  type: 'working',
                  load: { mode: 'added_weight', value: '120', unit: 'kg' },
                },
              ],
            },
          ],
        },
      ],
    };
    const draft3Content = {
      schema_version: 1,
      notes: 'UNPUBLISHED DRAFT 3',
      days: [],
    };

    const sourcePlanId = await seedPublishedPlan(
      fixture.clientId,
      'workout',
      rev1Content,
      rev2Content,
      draft3Content,
    );

    const opKey = randomUUID();
    const copyRes = await fixture.context.woA.client.rpc('copy_plan_to_draft', {
      p_workspace_id: fixture.workspaceId,
      p_target_client_id: targetClientId,
      p_create_mode: 'existing_plan',
      p_source_id: sourcePlanId,
      p_operation_key: opKey,
    });
    expect(copyRes.error).toBeNull();
    const destPlanId = copyRes.data as string;
    expect(destPlanId).not.toBe(sourcePlanId);

    // Exact replay returns same destination planId
    const replayRes = await fixture.context.woA.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'existing_plan',
        p_source_id: sourcePlanId,
        p_operation_key: opKey,
      },
    );
    expect(replayRes.error).toBeNull();
    expect(replayRes.data).toBe(destPlanId);

    // Key conflict on different canonical arguments
    const conflictRes = await fixture.context.woA.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: fixture.clientId,
        p_create_mode: 'existing_plan',
        p_source_id: sourcePlanId,
        p_operation_key: opKey,
      },
    );
    expect(conflictRes.error?.code).toBe('23505');

    // Verify destination root, draft, and exclusions
    const [destRoot] = await db()`
      select workspace_id, client_id, plan_kind, created_by
      from public.plan_roots where id = ${destPlanId}
    `;
    expect(destRoot).toEqual({
      workspace_id: fixture.workspaceId,
      client_id: targetClientId,
      plan_kind: 'workout',
      created_by: fixture.context.woA.userId,
    });

    const [destDraft] = await db()`
      select draft_version, content, created_by, updated_by
      from public.plan_drafts where plan_id = ${destPlanId}
    `;
    expect(Number(destDraft?.draft_version)).toBe(1);
    expect(destDraft?.created_by).toBe(fixture.context.woA.userId);
    expect(destDraft?.updated_by).toBe(fixture.context.woA.userId);

    const copiedContent = destDraft?.content as Record<string, unknown>;
    expect(copiedContent).toEqual({
      schema_version: 1,
      notes: 'Latest published custom notes',
      days: [
        {
          id: dayId,
          name: 'Lower A',
          items: [
            {
              id: itemId,
              name: 'Back Squat',
              reps: { min: 5, max: 7 },
              restSec: 180,
              rir: 2,
              notes: 'Custom tempo 3010',
              sets: [
                {
                  id: setId,
                  type: 'working',
                  load: { mode: 'added_weight', value: '120', unit: 'kg' },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(copiedContent.videoUrl).toBeUndefined();
    const days = copiedContent.days as Array<Record<string, unknown>>;
    const items = days[0]?.items as Array<Record<string, unknown>>;
    expect(items[0]?.video).toBeUndefined();

    // No revisions, deliveries, or source audit events copied
    const [counts] = await db()`
      select
        (select count(*)::int from public.plan_revisions where plan_id = ${destPlanId}) as revisions,
        (select count(*)::int from public.plan_deliveries where plan_id = ${destPlanId}) as deliveries,
        (select count(*)::int from public.plan_audit_events where plan_id = ${destPlanId}) as audits
    `;
    expect(counts).toEqual({ revisions: 0, deliveries: 0, audits: 2 });

    // Independent destination persistence: mutating destination draft does not affect source
    const destUpdate = await fixture.context.trainerA.client.rpc(
      'save_plan_draft',
      {
        p_plan_id: destPlanId,
        p_expected_draft_version: 1,
        p_content: {
          schema_version: 1,
          notes: 'Edited destination only',
          days: [],
        },
        p_operation_key: randomUUID(),
      },
    );
    expect(destUpdate.error).toBeNull();
    expect(destUpdate.data).toBe(2);

    const [sourceDraftAfter] = await db()`
      select draft_version, content from public.plan_drafts where plan_id = ${sourcePlanId}
    `;
    expect(Number(sourceDraftAfter?.draft_version)).toBe(3);
    expect((sourceDraftAfter?.content as { notes: string }).notes).toBe(
      'UNPUBLISHED DRAFT 3',
    );
  });

  it('copies latest published nutrition revision preserving nutrition content independently', async () => {
    const targetClientId = await fixture.createSiblingClient();
    const rev1 = {
      kind: 'nutrition',
      schemaVersion: 1,
      document: { schemaVersion: 1, structure: 'single_day', notes: 'old' },
    };
    const rev2 = {
      kind: 'nutrition',
      schemaVersion: 1,
      document: {
        schemaVersion: 1,
        structure: 'single_day',
        notes: 'Published nutrition notes',
        meals: [{ id: 'm1', name: { ar: 'غداء', en: 'Lunch' }, note: 'Grill' }],
      },
    };
    const draft3 = {
      kind: 'nutrition',
      schemaVersion: 1,
      document: { schemaVersion: 1, structure: 'single_day', notes: 'draft3' },
    };

    const sourcePlanId = await seedPublishedPlan(
      fixture.clientId,
      'nutrition',
      rev1,
      rev2,
      draft3,
    );

    const copyRes = await fixture.context.trainerA.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'existing_plan',
        p_source_id: sourcePlanId,
        p_operation_key: randomUUID(),
      },
    );
    expect(copyRes.error).toBeNull();
    const destPlanId = copyRes.data as string;

    const [destRoot] = await db()`
      select plan_kind from public.plan_roots where id = ${destPlanId}
    `;
    expect(destRoot?.plan_kind).toBe('nutrition');

    const [destDraft] = await db()`
      select content from public.plan_drafts where plan_id = ${destPlanId}
    `;
    expect(destDraft?.content).toEqual(rev2);
  });

  it('copies an immutable workout template version (pinned or current_version) without video', async () => {
    const targetClientId = await fixture.createSiblingClient();
    const dayId = randomUUID();
    const itemId = randomUUID();
    const v1Doc = {
      schema_version: 1,
      notes: 'Template v1 immutable',
      days: [],
    };
    const v2Doc = {
      schema_version: 1,
      notes: 'Template v2 current',
      video_url: 'https://cdn.example.com/tpl-video.mp4',
      days: [
        {
          id: dayId,
          name: 'Push',
          items: [
            {
              id: itemId,
              name: 'OHP',
              reps: { value: 8 },
              restSec: 120,
              rir: 2,
              notes: 'Strict',
            },
          ],
        },
      ],
    };
    const templateId = await seedWorkspaceTemplate(
      fixture.workspaceId,
      v1Doc,
      v2Doc,
    );

    // Pinned version 1: stores the schema-v1 document itself (not wrapped)
    const copyV1 = await fixture.context.trainerA.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'template',
        p_source_id: templateId,
        p_operation_key: randomUUID(),
        p_template_version: 1,
      },
    );
    expect(copyV1.error).toBeNull();
    const [draftV1] = await db()`
      select content from public.plan_drafts where plan_id = ${copyV1.data as string}
    `;
    expect(draftV1?.content).toEqual(v1Doc);

    // Current version (2) with video_url stripped, matching field-for-field
    const copyCurrent = await fixture.context.po.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'template',
        p_source_id: templateId,
        p_operation_key: randomUUID(),
      },
    );
    expect(copyCurrent.error).toBeNull();
    const [draftV2] = await db()`
      select content from public.plan_drafts where plan_id = ${copyCurrent.data as string}
    `;
    expect(draftV2?.content).toEqual({
      schema_version: 1,
      notes: 'Template v2 current',
      days: [
        {
          id: dayId,
          name: 'Push',
          items: [
            {
              id: itemId,
              name: 'OHP',
              reps: { value: 8 },
              restSec: 120,
              rir: 2,
              notes: 'Strict',
            },
          ],
        },
      ],
    });
    expect(
      (draftV2?.content as Record<string, unknown>).video_url,
    ).toBeUndefined();
  });

  it('refuses retired workspace and global workout templates with zero rows written while active templates copy', async () => {
    const targetClientId = await fixture.createSiblingClient();
    const doc = {
      schema_version: 1,
      notes: 'Lifecycle test template',
      days: [],
    };
    const retiredWsTplId = await seedWorkspaceTemplate(
      fixture.workspaceId,
      doc,
      doc,
      'retired',
    );
    const retiredGlobalTplId = await seedGlobalTemplate(doc, 'retired');
    const activeGlobalTplId = await seedGlobalTemplate(doc, 'active');

    const [beforeCounts] = await db()`
      select
        (select count(*)::int from public.plan_roots where client_id = ${targetClientId}) as roots,
        (select count(*)::int from public.plan_drafts where workspace_id = ${fixture.workspaceId}) as drafts
    `;

    const wsOpKey = randomUUID();
    const retiredWsRes = await fixture.context.trainerA.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'template',
        p_source_id: retiredWsTplId,
        p_operation_key: wsOpKey,
      },
    );
    expect(retiredWsRes.error?.code).toBe('42501');

    const globalOpKey = randomUUID();
    const retiredGlobalRes = await fixture.context.po.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'template',
        p_source_id: retiredGlobalTplId,
        p_operation_key: globalOpKey,
      },
    );
    expect(retiredGlobalRes.error?.code).toBe('42501');

    const [afterRefusalCounts] = await db()`
      select
        (select count(*)::int from public.plan_roots where client_id = ${targetClientId}) as roots,
        (select count(*)::int from public.plan_drafts where workspace_id = ${fixture.workspaceId}) as drafts,
        (select count(*)::int from app_private.plan_operation_keys where operation_key in (${wsOpKey}, ${globalOpKey})) as op_keys
    `;
    expect(afterRefusalCounts).toEqual({
      roots: beforeCounts?.roots,
      drafts: beforeCounts?.drafts,
      op_keys: 0,
    });

    // Active global template still copies for PO
    const activeGlobalRes = await fixture.context.po.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'template',
        p_source_id: activeGlobalTplId,
        p_operation_key: randomUUID(),
      },
    );
    expect(activeGlobalRes.error).toBeNull();
    const [activeDraft] = await db()`
      select content from public.plan_drafts where plan_id = ${activeGlobalRes.data as string}
    `;
    expect(activeDraft?.content).toEqual(doc);
  });

  it('denies draft-only source plans, Sales, and cross-workspace actors/sources', async () => {
    const targetClientId = await fixture.createSiblingClient();
    const draftOnly = await fixture.context.trainerA.client.rpc(
      'create_plan_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_client_id: fixture.clientId,
        p_plan_kind: 'workout',
        p_content: { schema_version: 1, days: [] },
        p_operation_key: randomUUID(),
      },
    );
    expect(draftOnly.error).toBeNull();

    const noRevRes = await fixture.context.trainerA.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'existing_plan',
        p_source_id: draftOnly.data,
        p_operation_key: randomUUID(),
      },
    );
    expect(noRevRes.error?.code).toBe('22023');

    const salesRes = await fixture.context.salesA.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'existing_plan',
        p_source_id: draftOnly.data,
        p_operation_key: randomUUID(),
      },
    );
    expect(salesRes.error?.code).toBe('42501');

    const foreignRes = await fixture.context.trainerB.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'existing_plan',
        p_source_id: draftOnly.data,
        p_operation_key: randomUUID(),
      },
    );
    expect(foreignRes.error?.code).toBe('42501');
  });

  it('copies an immutable workspace nutrition template version (pinned or current_version) with remapped IDs, valid F18 schema, exclusions, replay, and key conflict', async () => {
    const targetClientId = await fixture.createSiblingClient();
    const v1 = makeValidNutritionTemplateDoc('Nutrition tpl v1');
    const v2 = makeValidNutritionTemplateDoc('Nutrition tpl v2 current');
    const taintedV2Doc = {
      ...v2.doc,
      ownership: { workspaceId: fixture.workspaceId },
      history: [{ event: 'created' }],
      selection: {
        itemId: '11111111-1111-4111-8111-111111111111',
        alternativeId: '22222222-2222-4222-8222-222222222221',
      },
      delivery: { id: 'del-1' },
    };

    const templateId = await seedNutritionWorkspaceTemplate(
      fixture.workspaceId,
      v1.doc,
      taintedV2Doc,
    );

    // Pinned version 1
    const opKeyV1 = randomUUID();
    const copyV1 = await fixture.context.trainerA.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'template',
        p_source_id: templateId,
        p_operation_key: opKeyV1,
        p_template_version: 1,
      },
    );
    expect(copyV1.error).toBeNull();
    const destPlanIdV1 = copyV1.data as string;

    // Exact replay returns original plan id
    const replayV1 = await fixture.context.trainerA.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'template',
        p_source_id: templateId,
        p_operation_key: opKeyV1,
        p_template_version: 1,
      },
    );
    expect(replayV1.error).toBeNull();
    expect(replayV1.data).toBe(destPlanIdV1);

    // Changed args with same operation key -> key_conflict
    const conflictV1 = await fixture.context.trainerA.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: fixture.clientId,
        p_create_mode: 'template',
        p_source_id: templateId,
        p_operation_key: opKeyV1,
        p_template_version: 1,
      },
    );
    expect(conflictV1.error?.code).toBe('23505');

    const [rootV1] = await db()`
      select workspace_id, client_id, plan_kind, created_by
      from public.plan_roots where id = ${destPlanIdV1}
    `;
    expect(rootV1).toEqual({
      workspace_id: fixture.workspaceId,
      client_id: targetClientId,
      plan_kind: 'nutrition',
      created_by: fixture.context.trainerA.userId,
    });

    const [draftV1] = await db()`
      select content from public.plan_drafts where plan_id = ${destPlanIdV1}
    `;
    const validatedV1 = validateNutritionDocument(draftV1?.content, {
      [nutritionUnitContextKey(v1.foodOats, 2)]: {
        basis: 'g',
        servingUnitKeys: [],
      },
      [nutritionUnitContextKey(v1.foodRice, 1)]: {
        basis: 'g',
        servingUnitKeys: [],
      },
    });
    expect(validatedV1.notes).toBe('Nutrition tpl v1');
    expect(validatedV1.dayTypes[0]?.id).not.toBe('dt-1');
    expect(validatedV1.implicitDayTypeId).toBe(validatedV1.dayTypes[0]?.id);
    expect(validatedV1.meals?.[0]?.id).not.toBe('meal-1');
    expect(validatedV1.meals?.[0]?.items[0]?.id).not.toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(validatedV1.meals?.[0]?.items[0]?.foodId).toBe(v1.foodOats);
    expect(validatedV1.meals?.[0]?.items[0]?.foodVersion).toBe(2);
    expect(validatedV1.meals?.[0]?.items[0]?.alternatives[0]?.id).not.toBe(
      '22222222-2222-4222-8222-222222222221',
    );
    expect(validatedV1.meals?.[0]?.items[0]?.alternatives[0]?.foodId).toBe(
      v1.foodRice,
    );

    // Current version (2) with excluded metadata stripped
    const copyCurrent = await fixture.context.woA.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'template',
        p_source_id: templateId,
        p_operation_key: randomUUID(),
      },
    );
    expect(copyCurrent.error).toBeNull();
    const destPlanIdV2 = copyCurrent.data as string;
    const [draftV2] = await db()`
      select content from public.plan_drafts where plan_id = ${destPlanIdV2}
    `;
    const draftV2Record = draftV2?.content as Record<string, unknown>;
    expect(draftV2Record.ownership).toBeUndefined();
    expect(draftV2Record.history).toBeUndefined();
    expect(draftV2Record.selection).toBeUndefined();
    expect(draftV2Record.delivery).toBeUndefined();
    const validatedV2 = validateNutritionDocument(draftV2?.content, {
      [nutritionUnitContextKey(v2.foodOats, 2)]: {
        basis: 'g',
        servingUnitKeys: [],
      },
      [nutritionUnitContextKey(v2.foodRice, 1)]: {
        basis: 'g',
        servingUnitKeys: [],
      },
    });
    expect(validatedV2.notes).toBe('Nutrition tpl v2 current');

    // No revisions, deliveries, or source audit events copied
    const [counts] = await db()`
      select
        (select count(*)::int from public.plan_revisions where plan_id = ${destPlanIdV2}) as revisions,
        (select count(*)::int from public.plan_deliveries where plan_id = ${destPlanIdV2}) as deliveries,
        (select count(*)::int from public.plan_audit_events where plan_id = ${destPlanIdV2}) as audits
    `;
    expect(counts).toEqual({ revisions: 0, deliveries: 0, audits: 2 });
  });

  it('refuses retired workspace and global nutrition templates with zero rows written while active global nutrition template copies for PO only', async () => {
    const targetClientId = await fixture.createSiblingClient();
    const base = makeValidNutritionTemplateDoc('Nutrition lifecycle tpl');
    const retiredWsTplId = await seedNutritionWorkspaceTemplate(
      fixture.workspaceId,
      base.doc,
      base.doc,
      'retired',
    );
    const retiredGlobalTplId = await seedNutritionGlobalTemplate(
      base.doc,
      'retired',
    );
    const activeGlobalTplId = await seedNutritionGlobalTemplate(
      base.doc,
      'active',
    );

    const [beforeCounts] = await db()`
      select
        (select count(*)::int from public.plan_roots where client_id = ${targetClientId}) as roots,
        (select count(*)::int from public.plan_drafts where workspace_id = ${fixture.workspaceId}) as drafts
    `;

    const wsOpKey = randomUUID();
    const retiredWsRes = await fixture.context.trainerA.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'template',
        p_source_id: retiredWsTplId,
        p_operation_key: wsOpKey,
      },
    );
    expect(retiredWsRes.error?.code).toBe('42501');

    const globalOpKey = randomUUID();
    const retiredGlobalRes = await fixture.context.po.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'template',
        p_source_id: retiredGlobalTplId,
        p_operation_key: globalOpKey,
      },
    );
    expect(retiredGlobalRes.error?.code).toBe('42501');

    // Non-PO staff cannot copy active global nutrition template directly
    const nonPoGlobalOpKey = randomUUID();
    const nonPoGlobalRes = await fixture.context.trainerA.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'template',
        p_source_id: activeGlobalTplId,
        p_operation_key: nonPoGlobalOpKey,
      },
    );
    expect(nonPoGlobalRes.error?.code).toBe('42501');

    const [afterRefusalCounts] = await db()`
      select
        (select count(*)::int from public.plan_roots where client_id = ${targetClientId}) as roots,
        (select count(*)::int from public.plan_drafts where workspace_id = ${fixture.workspaceId}) as drafts,
        (select count(*)::int from app_private.plan_operation_keys where operation_key in (${wsOpKey}, ${globalOpKey}, ${nonPoGlobalOpKey})) as op_keys
    `;
    expect(afterRefusalCounts).toEqual({
      roots: beforeCounts?.roots,
      drafts: beforeCounts?.drafts,
      op_keys: 0,
    });

    // Active global nutrition template copies for PO
    const activeGlobalRes = await fixture.context.po.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'template',
        p_source_id: activeGlobalTplId,
        p_operation_key: randomUUID(),
      },
    );
    expect(activeGlobalRes.error).toBeNull();
    const [activeDraft] = await db()`
      select content from public.plan_drafts where plan_id = ${activeGlobalRes.data as string}
    `;
    const validatedGlobal = validateNutritionDocument(activeDraft?.content, {
      [nutritionUnitContextKey(base.foodOats, 2)]: {
        basis: 'g',
        servingUnitKeys: [],
      },
      [nutritionUnitContextKey(base.foodRice, 1)]: {
        basis: 'g',
        servingUnitKeys: [],
      },
    });
    expect(validatedGlobal.notes).toBe('Nutrition lifecycle tpl');
    expect(validatedGlobal.dayTypes[0]?.id).not.toBe('dt-1');
  });

  it('denies Sales and cross-workspace actors from copying nutrition templates with zero writes', async () => {
    const targetClientId = await fixture.createSiblingClient();
    const base = makeValidNutritionTemplateDoc('Nutrition authz tpl');
    const wsTplId = await seedNutritionWorkspaceTemplate(
      fixture.workspaceId,
      base.doc,
      base.doc,
      'active',
    );

    const [beforeCounts] = await db()`
      select
        (select count(*)::int from public.plan_roots where client_id = ${targetClientId}) as roots,
        (select count(*)::int from public.plan_drafts where workspace_id = ${fixture.workspaceId}) as drafts
    `;

    const salesKey = randomUUID();
    const salesRes = await fixture.context.salesA.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'template',
        p_source_id: wsTplId,
        p_operation_key: salesKey,
      },
    );
    expect(salesRes.error?.code).toBe('42501');

    const foreignKey = randomUUID();
    const foreignRes = await fixture.context.trainerB.client.rpc(
      'copy_plan_to_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_target_client_id: targetClientId,
        p_create_mode: 'template',
        p_source_id: wsTplId,
        p_operation_key: foreignKey,
      },
    );
    expect(foreignRes.error?.code).toBe('42501');

    const [afterCounts] = await db()`
      select
        (select count(*)::int from public.plan_roots where client_id = ${targetClientId}) as roots,
        (select count(*)::int from public.plan_drafts where workspace_id = ${fixture.workspaceId}) as drafts,
        (select count(*)::int from app_private.plan_operation_keys where operation_key in (${salesKey}, ${foreignKey})) as op_keys
    `;
    expect(afterCounts).toEqual({
      roots: beforeCounts?.roots,
      drafts: beforeCounts?.drafts,
      op_keys: 0,
    });
  });
});
