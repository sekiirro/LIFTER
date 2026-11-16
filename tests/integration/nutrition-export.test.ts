import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { snapshotMapKey } from '../../lib/plans/nutrition/macros';
import {
  readNutritionExport,
  buildNutritionWorkbook,
  renderNutritionPrintHtml,
  type NutritionExportActor,
} from '../../lib/plans/nutrition/export';
import { clientContext, graph, sql } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';

let f: Context;
let db: ReturnType<typeof sql>;
let seeded: Awaited<ReturnType<typeof graph>>;

beforeAll(async () => {
  f = await clientContext();
  db = sql();
  seeded = await db.begin(async (tx) => graph(tx, f));
});

afterAll(async () => {
  await db.end();
});

describe('F18 T023 nutrition export integration & database audit', () => {
  it('denies export for unaffiliated/unpermitted actor and logs denial audit', async () => {
    const planId = randomUUID();
    const revisionId = randomUUID();

    const actor: NutritionExportActor = {
      userId: f.trainerA.userId,
      role: 'Sales',
      workspaceRelation: 'own',
      coachingWork: false,
      membershipRevoked: false,
    };

    const result = await readNutritionExport({
      client: f.trainerA.client,
      actor,
      planId,
      revisionId,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('not_permitted');

    // Verify denial audit event was written
    const events = await db`
      select actor_user_id, action, target_table, target_id, details
      from public.audit_events
      where action = 'plan.nutrition_export'
        and actor_user_id = ${f.trainerA.userId}
      order by occurred_at desc
      limit 1
    `;

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor_user_id: f.trainerA.userId,
      action: 'plan.nutrition_export',
      target_table: 'plan_revisions',
      details: {
        plan_id: planId,
        revision_id: revisionId,
        outcome: 'denied',
        reason: 'not_permitted',
      },
    });
    // Strict allowlist: no forbidden fields
    expect(events[0]!.details).not.toHaveProperty('document');
    expect(events[0]!.details).not.toHaveProperty('food_name');
  });

  it('denies export for non-existent revision and logs not_found denial audit', async () => {
    const planId = randomUUID();
    const revisionId = randomUUID();

    const actor: NutritionExportActor = {
      userId: f.trainerA.userId,
      role: 'Trainer',
      workspaceRelation: 'own',
      coachingWork: true,
      membershipRevoked: false,
    };

    const result = await readNutritionExport({
      client: f.trainerA.client,
      actor,
      planId,
      revisionId,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('not_found');

    const events = await db`
      select actor_user_id, action, target_table, target_id, details
      from public.audit_events
      where action = 'plan.nutrition_export'
        and actor_user_id = ${f.trainerA.userId}
        and target_id = ${revisionId}
      order by occurred_at desc
      limit 1
    `;

    expect(events).toHaveLength(1);
    expect(events[0]!.details).toMatchObject({
      plan_id: planId,
      revision_id: revisionId,
      outcome: 'denied',
      reason: 'not_found',
    });
  });

  it('allows authorized export on published revision and logs success audit', async () => {
    const planId = randomUUID();
    const revisionId = randomUUID();

    // Seed a plan root and published revision in workspace A
    await db`
      insert into public.plan_roots (id, workspace_id, client_id, plan_kind, created_by)
      values (${planId}, ${f.wsA.id}, ${seeded.client}, 'nutrition', ${f.trainerA.userId})
    `;

    const dummyDoc = {
      schemaVersion: 1,
      structure: 'single_day',
      implicitDayTypeId: 'dt-rest',
      dayTypes: [
        {
          id: 'dt-rest',
          name: { ar: 'راحة', en: 'Rest' },
          trainingDay: false,
          targets: null,
        },
      ],
      meals: [
        {
          id: 'm-1',
          name: { ar: 'فطور', en: 'Breakfast' },
          note: '=SUM(1+1) meal note',
          recipeUrl: 'https://example.com/recipe',
          items: [
            {
              id: 'i-1',
              foodId: '00000000-0000-4000-8000-000000000001',
              foodVersion: 1,
              quantity: { value: '100', unit: { kind: 'basis', value: 'g' } },
              note: null,
              alternatives: [],
            },
          ],
        },
      ],
      title: { ar: 'خطة تجريبية', en: 'Test Plan' },
      notes: 'Plan document notes',
    };

    const snapKey = snapshotMapKey('00000000-0000-4000-8000-000000000001', 1, {
      kind: 'basis',
      value: 'g',
    });
    const dummySnapshotMap = {
      [snapKey]: {
        foodId: '00000000-0000-4000-8000-000000000001',
        foodVersion: 1,
        kind: 'basis',
        unit: { kind: 'basis', value: 'g' },
        names: { ar: 'شوفان', en: 'Oats' },
        per100: { kcal: '389', protein: '16.9', carbs: '66.3', fat: '6.9' },
      },
    };

    const dummyComputedValues = {
      algorithmVersion: 1,
      items: {
        'i-1': { kcal: '389', protein: '16.9', carbs: '66.3', fat: '6.9' },
      },
      meals: {
        'm-1': { kcal: '389', protein: '16.9', carbs: '66.3', fat: '6.9' },
      },
      totals: { kcal: '389', protein: '16.9', carbs: '66.3', fat: '6.9' },
    };

    await db`
      insert into public.plan_revisions (
        id, workspace_id, plan_id, revision_number, source_draft_version, plan_kind, content, authored_by, published_at
      ) values (
        ${revisionId}, ${f.wsA.id}, ${planId}, 1, 1, 'nutrition', ${db.json(dummyDoc)}, ${f.trainerA.userId}, now()
      )
    `;

    await db`
      insert into public.nutrition_plan_version_contents (
        revision_id, workspace_id, plan_id, schema_version, algorithm_version, document, snapshot_map, computed_values, created_by
      ) values (
        ${revisionId}, ${f.wsA.id}, ${planId}, 1, 1, ${db.json(dummyDoc)}, ${db.json(dummySnapshotMap)}, ${db.json(dummyComputedValues)}, ${f.trainerA.userId}
      )
    `;

    const actor: NutritionExportActor = {
      userId: f.trainerA.userId,
      role: 'Trainer',
      workspaceRelation: 'own',
      coachingWork: true,
      membershipRevoked: false,
    };

    const result = await readNutritionExport({
      client: f.trainerA.client,
      actor,
      planId,
      revisionId,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.projection.plan.id).toBe(planId);
    expect(result.projection.revision.revisionNumber).toBe(1);
    expect(result.projection.content.document).toEqual(dummyDoc);

    // Verify success audit event
    const events = await db`
      select actor_user_id, action, target_table, target_id, workspace_id, details
      from public.audit_events
      where action = 'plan.nutrition_export'
        and target_id = ${revisionId}
        and actor_user_id = ${f.trainerA.userId}
      order by occurred_at desc
      limit 1
    `;

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor_user_id: f.trainerA.userId,
      action: 'plan.nutrition_export',
      target_table: 'plan_revisions',
      target_id: revisionId,
      workspace_id: f.wsA.id,
      details: {
        plan_id: planId,
        revision_id: revisionId,
        outcome: 'success',
      },
    });

    // Test Excel and HTML render with real DB projection
    const workbook = await buildNutritionWorkbook(result.projection, 'en');
    expect(workbook).toBeDefined();

    const html = renderNutritionPrintHtml(result.projection, 'en');
    expect(html).toContain('Test Plan');
    expect(html).toContain('Oats');
    expect(html).toContain('389');
  });

  it('historical-revision export reads that specific revision selection (S43-PO-8; S43-R10)', async () => {
    const planId = randomUUID();
    const rev1Id = randomUUID();
    const rev2Id = randomUUID();

    await db`
      insert into public.plan_roots (id, workspace_id, client_id, plan_kind, created_by)
      values (${planId}, ${f.wsA.id}, ${seeded.client}, 'nutrition', ${f.trainerA.userId})
    `;

    const doc = {
      schemaVersion: 1,
      structure: 'single_day',
      implicitDayTypeId: 'dt-rest',
      dayTypes: [
        {
          id: 'dt-rest',
          name: { ar: 'راحة', en: 'Rest' },
          trainingDay: false,
          targets: null,
        },
      ],
      meals: [
        {
          id: 'm-1',
          name: { ar: 'فطور', en: 'Breakfast' },
          note: null,
          recipeUrl: null,
          items: [
            {
              id: 'i-1',
              foodId: '00000000-0000-4000-8000-000000000001',
              foodVersion: 1,
              quantity: { value: '100', unit: { kind: 'basis', value: 'g' } },
              note: null,
              alternatives: [
                {
                  id: 'a-1',
                  foodId: '00000000-0000-4000-8000-000000000002',
                  foodVersion: 1,
                  quantity: {
                    value: '150',
                    unit: { kind: 'basis', value: 'g' },
                  },
                },
                {
                  id: 'a-2',
                  foodId: '00000000-0000-4000-8000-000000000003',
                  foodVersion: 1,
                  quantity: {
                    value: '200',
                    unit: { kind: 'basis', value: 'g' },
                  },
                },
              ],
            },
          ],
        },
      ],
      title: { ar: 'خطة متعددة الإصدارات', en: 'Multi Revision Plan' },
      notes: null,
    };

    const key1 = snapshotMapKey('00000000-0000-4000-8000-000000000001', 1, {
      kind: 'basis',
      value: 'g',
    });
    const key2 = snapshotMapKey('00000000-0000-4000-8000-000000000002', 1, {
      kind: 'basis',
      value: 'g',
    });
    const key3 = snapshotMapKey('00000000-0000-4000-8000-000000000003', 1, {
      kind: 'basis',
      value: 'g',
    });

    const snapshotMap = {
      [key1]: {
        foodId: '00000000-0000-4000-8000-000000000001',
        foodVersion: 1,
        kind: 'basis',
        unit: { kind: 'basis', value: 'g' },
        names: { ar: 'أصلي', en: 'Coach Original Food' },
        per100: { kcal: '100', protein: '10', carbs: '10', fat: '2' },
      },
      [key2]: {
        foodId: '00000000-0000-4000-8000-000000000002',
        foodVersion: 1,
        kind: 'basis',
        unit: { kind: 'basis', value: 'g' },
        names: { ar: 'بديل ١', en: 'Alternative One' },
        per100: { kcal: '150', protein: '15', carbs: '15', fat: '3' },
      },
      [key3]: {
        foodId: '00000000-0000-4000-8000-000000000003',
        foodVersion: 1,
        kind: 'basis',
        unit: { kind: 'basis', value: 'g' },
        names: { ar: 'بديل ٢', en: 'Alternative Two' },
        per100: { kcal: '200', protein: '20', carbs: '20', fat: '4' },
      },
    };

    const computedValues = {
      algorithmVersion: 1,
      items: { 'i-1': { kcal: '100', protein: '10', carbs: '10', fat: '2' } },
      meals: { 'm-1': { kcal: '100', protein: '10', carbs: '10', fat: '2' } },
      totals: { kcal: '100', protein: '10', carbs: '10', fat: '2' },
    };

    // Insert Revision 1
    await db`
      insert into public.plan_revisions (
        id, workspace_id, plan_id, revision_number, source_draft_version, plan_kind, content, authored_by, published_at
      ) values (
        ${rev1Id}, ${f.wsA.id}, ${planId}, 1, 1, 'nutrition', ${db.json(doc)}, ${f.trainerA.userId}, '2026-11-01T12:00:00Z'
      )
    `;
    await db`
      insert into public.nutrition_plan_version_contents (
        revision_id, workspace_id, plan_id, schema_version, algorithm_version, document, snapshot_map, computed_values, created_by
      ) values (
        ${rev1Id}, ${f.wsA.id}, ${planId}, 1, 1, ${db.json(doc)}, ${db.json(snapshotMap)}, ${db.json(computedValues)}, ${f.trainerA.userId}
      )
    `;

    // Insert Revision 2
    await db`
      insert into public.plan_revisions (
        id, workspace_id, plan_id, revision_number, source_draft_version, plan_kind, content, authored_by, published_at
      ) values (
        ${rev2Id}, ${f.wsA.id}, ${planId}, 2, 1, 'nutrition', ${db.json(doc)}, ${f.trainerA.userId}, '2026-11-10T12:00:00Z'
      )
    `;
    await db`
      insert into public.nutrition_plan_version_contents (
        revision_id, workspace_id, plan_id, schema_version, algorithm_version, document, snapshot_map, computed_values, created_by
      ) values (
        ${rev2Id}, ${f.wsA.id}, ${planId}, 1, 1, ${db.json(doc)}, ${db.json(snapshotMap)}, ${db.json(computedValues)}, ${f.trainerA.userId}
      )
    `;

    // Revision 1 had Alternative One (a-1) selected by client
    // Revision 2 had Alternative Two (a-2) selected by client
    await db.begin(async (tx) => {
      await tx`set local app.nutrition_selection_write = 'on'`;
      await tx`
        insert into public.client_nutrition_alternative_selections (
          workspace_id, plan_id, plan_version_id, client_id, item_id, alternative_id, created_by
        ) values (
          ${f.wsA.id}, ${planId}, ${rev1Id}, ${seeded.client}, 'i-1', 'a-1', ${f.trainerA.userId}
        )
      `;
      await tx`
        insert into public.client_nutrition_alternative_selections (
          workspace_id, plan_id, plan_version_id, client_id, item_id, alternative_id, created_by
        ) values (
          ${f.wsA.id}, ${planId}, ${rev2Id}, ${seeded.client}, 'i-1', 'a-2', ${f.trainerA.userId}
        )
      `;
    });

    const actor: NutritionExportActor = {
      userId: f.trainerA.userId,
      role: 'Trainer',
      workspaceRelation: 'own',
      coachingWork: true,
      membershipRevoked: false,
    };

    // Read Rev 1 export
    const resRev1 = await readNutritionExport({
      client: f.trainerA.client,
      actor,
      planId,
      revisionId: rev1Id,
    });
    expect(resRev1.success).toBe(true);
    if (!resRev1.success) return;

    expect(resRev1.projection.selectedAlternativeIds['i-1']).toBe('a-1');
    expect(resRev1.projection.selectedValues?.items['i-1']?.kcal).toBe(
      '225.00',
    ); // 150g of 150 kcal/100g = 225

    // Read Rev 2 export
    const resRev2 = await readNutritionExport({
      client: f.trainerA.client,
      actor,
      planId,
      revisionId: rev2Id,
    });
    expect(resRev2.success).toBe(true);
    if (!resRev2.success) return;

    expect(resRev2.projection.selectedAlternativeIds['i-1']).toBe('a-2');
    expect(resRev2.projection.selectedValues?.items['i-1']?.kcal).toBe(
      '400.00',
    ); // 200g of 200 kcal/100g = 400

    // Historical export MUST NOT substitute current revision's selection!
    expect(resRev1.projection.selectedAlternativeIds['i-1']).not.toBe(
      resRev2.projection.selectedAlternativeIds['i-1'],
    );
  });
});
