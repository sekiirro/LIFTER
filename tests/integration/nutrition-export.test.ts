import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
let otherClientContext: Context;
let db: ReturnType<typeof sql>;
let seeded: Awaited<ReturnType<typeof graph>>;
let otherClientSeeded: Awaited<ReturnType<typeof graph>>;
let auditPlanId: string;
let auditRevisionId: string;
let auditOtherPlanId: string;
let auditOtherRevisionId: string;
let auditClientUserId: string;
let otherClientUserId: string;

beforeAll(async () => {
  f = await clientContext();
  otherClientContext = await clientContext();
  db = sql();
  seeded = await db.begin(async (tx) => graph(tx, f));
  otherClientSeeded = await db.begin(async (tx) =>
    graph(tx, otherClientContext),
  );
  auditPlanId = randomUUID();
  auditRevisionId = randomUUID();
  auditOtherPlanId = randomUUID();
  auditOtherRevisionId = randomUUID();
  const clients = await db`
    select id, auth_user_id from public.clients
    where id in (${seeded.client}, ${otherClientSeeded.client})
  `;
  auditClientUserId = clients.find(
    (row) => row.id === seeded.client,
  )!.auth_user_id;
  otherClientUserId = clients.find(
    (row) => row.id === otherClientSeeded.client,
  )!.auth_user_id;
  await db`
    insert into public.plan_roots (id, workspace_id, client_id, plan_kind, created_by)
    values
      (${auditPlanId}, ${f.wsA.id}, ${seeded.client}, 'nutrition', ${f.trainerA.userId}),
      (${auditOtherPlanId}, ${f.wsA.id}, ${seeded.client}, 'nutrition', ${f.trainerA.userId})
  `;
  await db`
    insert into public.plan_revisions (
      id, workspace_id, plan_id, revision_number, source_draft_version,
      plan_kind, content, authored_by
    ) values
      (${auditRevisionId}, ${f.wsA.id}, ${auditPlanId}, 1, 1, 'nutrition', ${db.json({})}, ${f.trainerA.userId}),
      (${auditOtherRevisionId}, ${f.wsA.id}, ${auditOtherPlanId}, 1, 1, 'nutrition', ${db.json({})}, ${f.trainerA.userId})
  `;
});

afterAll(async () => {
  await db.end();
});

describe('F18 T023 nutrition export integration & database audit', () => {
  async function callAuditAs(
    userId: string,
    args: {
      workspaceId: string | null;
      planId: string;
      revisionId: string | null;
      outcome?: string;
      reason?: string | null;
    },
  ): Promise<string | null> {
    return db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
      await tx`create or replace function pg_temp.try_nutrition_export_audit(
        p_workspace_id uuid, p_plan_id uuid, p_revision_id uuid,
        p_outcome text, p_reason text
      ) returns text language plpgsql as $fn$
      begin
        perform public.record_nutrition_export_audit(
          p_workspace_id, p_plan_id, p_revision_id, p_outcome, p_reason
        );
        return null;
      exception when others then
        return sqlstate;
      end;
      $fn$`;
      const [result] = await tx`
        select pg_temp.try_nutrition_export_audit(
          ${args.workspaceId}::uuid,
          ${args.planId}::uuid,
          ${args.revisionId}::uuid,
          ${args.outcome ?? 'success'},
          ${args.reason ?? null}
        ) as error_code
      `;
      return result!.error_code;
    });
  }

  it('denies a foreign-workspace coach without writing an audit row', async () => {
    const error = await callAuditAs(f.trainerB.userId, {
      workspaceId: f.wsB.id,
      planId: auditPlanId,
      revisionId: auditRevisionId,
    });
    expect(error).toBe('42501');
    const rows = await db`
      select 1 from public.audit_events
      where action = 'plan.nutrition_export' and target_id = ${auditRevisionId}
    `;
    expect(rows).toHaveLength(0);
  });

  it('denies a different approved client without writing an audit row', async () => {
    const error = await callAuditAs(otherClientUserId, {
      workspaceId: f.wsA.id,
      planId: auditPlanId,
      revisionId: auditRevisionId,
    });
    expect(error).toBe('42501');
    const rows = await db`
      select 1 from public.audit_events
      where action = 'plan.nutrition_export' and target_id = ${auditRevisionId}
    `;
    expect(rows).toHaveLength(0);
  });

  it('denies a revision that belongs to a different plan without writing an audit row', async () => {
    const error = await callAuditAs(f.trainerA.userId, {
      workspaceId: f.wsA.id,
      planId: auditPlanId,
      revisionId: auditOtherRevisionId,
    });
    expect(error).toBe('42501');
    const rows = await db`
      select 1 from public.audit_events
      where action = 'plan.nutrition_export' and target_id = ${auditOtherRevisionId}
    `;
    expect(rows).toHaveLength(0);
  });

  it('allows an own-workspace coach and derives workspace from the plan root', async () => {
    const error = await callAuditAs(f.trainerA.userId, {
      workspaceId: f.wsB.id,
      planId: auditPlanId,
      revisionId: auditRevisionId,
    });
    expect(error).toBeNull();
    const [row] = await db`
      select workspace_id, details from public.audit_events
      where action = 'plan.nutrition_export' and target_id = ${auditRevisionId}
    `;
    expect(row).toMatchObject({
      workspace_id: f.wsA.id,
      details: {
        plan_id: auditPlanId,
        revision_id: auditRevisionId,
        outcome: 'success',
      },
    });
  });

  it('allows the plan own approved client and derives workspace from the plan root', async () => {
    const error = await callAuditAs(auditClientUserId, {
      workspaceId: f.wsB.id,
      planId: auditPlanId,
      revisionId: auditRevisionId,
    });
    expect(error).toBeNull();
    const [row] = await db`
      select workspace_id from public.audit_events
      where action = 'plan.nutrition_export' and target_id = ${auditRevisionId}
    `;
    expect(row?.workspace_id).toBe(f.wsA.id);
  });

  it('rejects audit allowlist violations without writing an audit row', async () => {
    const before = await db`
      select count(*)::int as count from public.audit_events
      where action = 'plan.nutrition_export' and target_id = ${auditRevisionId}
    `;
    const error = await callAuditAs(f.trainerA.userId, {
      workspaceId: null,
      planId: auditPlanId,
      revisionId: auditRevisionId,
      outcome: 'forged',
      reason: 'private_content',
    });
    expect(error).toBe('42501');
    const rows = await db`
      select count(*)::int as count from public.audit_events
      where action = 'plan.nutrition_export' and target_id = ${auditRevisionId}
    `;
    expect(rows[0]?.count).toBe(before[0]?.count);
  });

  it('fails closed when the success audit RPC returns an error', async () => {
    const planId = randomUUID();
    const revisionId = randomUUID();
    const doc = {
      schemaVersion: 1,
      structure: 'single_day',
      implicitDayTypeId: 'dt-rest',
      dayTypes: [
        {
          id: 'dt-rest',
          name: { en: 'Rest' },
          trainingDay: false,
          targets: null,
        },
      ],
      meals: [],
    };
    await db`
      insert into public.plan_roots (id, workspace_id, client_id, plan_kind, created_by)
      values (${planId}, ${f.wsA.id}, ${seeded.client}, 'nutrition', ${f.trainerA.userId})
    `;
    await db`
      insert into public.plan_revisions (
        id, workspace_id, plan_id, revision_number, source_draft_version,
        plan_kind, content, authored_by
      ) values (
        ${revisionId}, ${f.wsA.id}, ${planId}, 1, 1, 'nutrition', ${db.json(doc)}, ${f.trainerA.userId}
      )
    `;
    await db`
      insert into public.nutrition_plan_version_contents (
        revision_id, workspace_id, plan_id, schema_version, algorithm_version,
        document, snapshot_map, computed_values, created_by
      ) values (
        ${revisionId}, ${f.wsA.id}, ${planId}, 1, 1, ${db.json(doc)}, ${db.json({})},
        ${db.json({ algorithmVersion: 1, items: {}, meals: {}, totals: { kcal: '0', protein: '0', carbs: '0', fat: '0' } })},
        ${f.trainerA.userId}
      )
    `;
    const rpc = vi.spyOn(f.trainerA.client, 'rpc').mockResolvedValueOnce({
      data: null,
      error: {
        message: 'audit unavailable',
        code: 'XX000',
        details: '',
        hint: '',
      },
    } as never);
    await expect(
      readNutritionExport({
        client: f.trainerA.client,
        actor: {
          userId: f.trainerA.userId,
          role: 'Trainer',
          workspaceRelation: 'own',
          coachingWork: true,
          membershipRevoked: false,
        },
        planId,
        revisionId,
      }),
    ).rejects.toThrow('Nutrition export audit failed');
    rpc.mockRestore();
  });

  it('fails closed when the plan-root read returns a database error', async () => {
    const planId = randomUUID();
    const revisionId = randomUUID();
    const doc = {
      schemaVersion: 1,
      structure: 'single_day',
      implicitDayTypeId: 'dt-rest',
      dayTypes: [
        {
          id: 'dt-rest',
          name: { en: 'Rest' },
          trainingDay: false,
          targets: null,
        },
      ],
      meals: [],
    };
    await db`
      insert into public.plan_roots (id, workspace_id, client_id, plan_kind, created_by)
      values (${planId}, ${f.wsA.id}, ${seeded.client}, 'nutrition', ${f.trainerA.userId})
    `;
    await db`
      insert into public.plan_revisions (
        id, workspace_id, plan_id, revision_number, source_draft_version,
        plan_kind, content, authored_by
      ) values (
        ${revisionId}, ${f.wsA.id}, ${planId}, 1, 1, 'nutrition', ${db.json(doc)}, ${f.trainerA.userId}
      )
    `;
    await db`
      insert into public.nutrition_plan_version_contents (
        revision_id, workspace_id, plan_id, schema_version, algorithm_version,
        document, snapshot_map, computed_values, created_by
      ) values (
        ${revisionId}, ${f.wsA.id}, ${planId}, 1, 1, ${db.json(doc)}, ${db.json({})},
        ${db.json({ algorithmVersion: 1, items: {}, meals: {}, totals: { kcal: '0', protein: '0', carbs: '0', fat: '0' } })},
        ${f.trainerA.userId}
      )
    `;
    const originalFrom = f.trainerA.client.from.bind(f.trainerA.client);
    const from = vi.spyOn(f.trainerA.client, 'from').mockImplementation(((
      table: string,
    ) => {
      if (table !== 'plan_roots') return originalFrom(table as never);
      const query = {
        eq() {
          return query;
        },
        async maybeSingle() {
          return { data: null, error: { message: 'read failed' } };
        },
      };
      return { select: () => query } as never;
    }) as never);
    const result = await readNutritionExport({
      client: f.trainerA.client,
      actor: {
        userId: f.trainerA.userId,
        role: 'Trainer',
        workspaceRelation: 'own',
        coachingWork: true,
        membershipRevoked: false,
      },
      planId,
      revisionId,
    });
    from.mockRestore();
    expect(result).toEqual({ success: false, reason: 'not_found' });
  });

  it('denies export for an actor outside the application-wall export roles', async () => {
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

    const events = await db`
      select actor_user_id, action, target_table, target_id, details
      from public.audit_events
      where action = 'plan.nutrition_export'
        and actor_user_id = ${f.trainerA.userId}
        and target_id = ${revisionId}
      order by occurred_at desc
      limit 1
    `;

    expect(events).toHaveLength(0);
  });

  it('denies export for a non-existent revision without attributing a forged audit target', async () => {
    const planId = auditPlanId;
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

    expect(events).toHaveLength(0);
  });

  it('fails closed when revision content is absent instead of falling back to revision content', async () => {
    const planId = randomUUID();
    const revisionId = randomUUID();
    const revisionDocument = {
      schemaVersion: 1,
      structure: 'single_day',
      implicitDayTypeId: 'dt-rest',
      dayTypes: [
        {
          id: 'dt-rest',
          name: { en: 'Fallback must not render' },
          trainingDay: false,
          targets: null,
        },
      ],
      meals: [],
    };
    await db`
      insert into public.plan_roots (id, workspace_id, client_id, plan_kind, created_by)
      values (${planId}, ${f.wsA.id}, ${seeded.client}, 'nutrition', ${f.trainerA.userId})
    `;
    await db`
      insert into public.plan_revisions (
        id, workspace_id, plan_id, revision_number, source_draft_version,
        plan_kind, content, authored_by
      ) values (
        ${revisionId}, ${f.wsA.id}, ${planId}, 1, 1, 'nutrition',
        ${db.json(revisionDocument)}, ${f.trainerA.userId}
      )
    `;
    const result = await readNutritionExport({
      client: f.trainerA.client,
      actor: {
        userId: f.trainerA.userId,
        role: 'Trainer',
        workspaceRelation: 'own',
        coachingWork: true,
        membershipRevoked: false,
      },
      planId,
      revisionId,
    });
    expect(result).toEqual({ success: false, reason: 'not_found' });
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
