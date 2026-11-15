import { randomUUID } from 'node:crypto';
import type { JSONValue } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
) {
  const templateId = randomUUID();
  const actorId = fixture.context.woA.userId;

  await db().begin(async (tx) => {
    await tx`set constraints all deferred`;
    await tx`
      insert into public.workout_workspace_templates (
        workspace_id, id, lifecycle_state, current_version, created_by
      ) values (
        ${workspaceId}, ${templateId}, 'active', 2, ${actorId}
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

describe('F19 T012 template and plan copy', () => {
  it('copies latest published workout revision (excluding draft, video, ownership, history, delivery) into an independent destination draft', async () => {
    const targetClientId = await fixture.createSiblingClient();
    const rev1Content = {
      kind: 'workout',
      schemaVersion: 1,
      document: { schema_version: 1, notes: 'rev1', days: [] },
    };
    const rev2Content = {
      kind: 'workout',
      schemaVersion: 1,
      document: {
        schema_version: 1,
        notes: 'Latest published custom notes',
        videoUrl: 'https://cdn.example.com/must-not-copy.mp4',
        days: [
          {
            id: randomUUID(),
            name: 'Lower A',
            items: [
              {
                id: randomUUID(),
                name: 'Back Squat',
                reps: { min: 5, max: 7 },
                restSec: 180,
                rir: 2,
                notes: 'Custom tempo 3010',
                video: 'must-not-copy',
                sets: [
                  {
                    id: randomUUID(),
                    type: 'working',
                    load: { mode: 'added_weight', value: '120', unit: 'kg' },
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const draft3Content = {
      kind: 'workout',
      schemaVersion: 1,
      document: { schema_version: 1, notes: 'UNPUBLISHED DRAFT 3', days: [] },
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
    const copiedDoc = copiedContent.document as Record<string, unknown>;
    expect(copiedDoc.notes).toBe('Latest published custom notes');
    expect(copiedDoc.videoUrl).toBeUndefined();
    const days = copiedDoc.days as Array<Record<string, unknown>>;
    const items = days[0]?.items as Array<Record<string, unknown>>;
    expect(items[0]?.reps).toEqual({ min: 5, max: 7 });
    expect(items[0]?.restSec).toBe(180);
    expect(items[0]?.rir).toBe(2);
    expect(items[0]?.notes).toBe('Custom tempo 3010');
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
          kind: 'workout',
          schemaVersion: 1,
          document: {
            schema_version: 1,
            notes: 'Edited destination only',
            days: [],
          },
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
    expect(
      (sourceDraftAfter?.content as { document: { notes: string } }).document
        .notes,
    ).toBe('UNPUBLISHED DRAFT 3');
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
          id: randomUUID(),
          name: 'Push',
          items: [
            {
              id: randomUUID(),
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

    // Pinned version 1
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
    expect(draftV1?.content).toEqual({
      kind: 'workout',
      schemaVersion: 1,
      document: v1Doc,
    });

    // Current version (2) with video_url stripped
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
    const docV2 = (draftV2?.content as { document: Record<string, unknown> })
      .document;
    expect(docV2.notes).toBe('Template v2 current');
    expect(docV2.video_url).toBeUndefined();
  });

  it('denies draft-only source plans, Sales, and cross-workspace actors/sources', async () => {
    const targetClientId = await fixture.createSiblingClient();
    const draftOnly = await fixture.context.trainerA.client.rpc(
      'create_plan_draft',
      {
        p_workspace_id: fixture.workspaceId,
        p_client_id: fixture.clientId,
        p_plan_kind: 'workout',
        p_content: { kind: 'workout', schemaVersion: 1, document: {} },
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
});
