import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { computeDocumentValues } from '../../lib/plans/nutrition/macros';
import type { NutritionDocumentV1 } from '../../lib/plans/nutrition/types';
import { clientContext, graph, sql } from './registration-approval-fixture';

let db: ReturnType<typeof sql>;
let fixture: Awaited<ReturnType<typeof clientContext>>;
let seeded: Awaited<ReturnType<typeof graph>>;

beforeAll(async () => {
  fixture = await clientContext();
  db = sql();
  seeded = await db.begin((tx) => graph(tx, fixture));
});

afterAll(async () => db?.end());

const nutritionDocument = {
  schemaVersion: 1,
  structure: 'single_day',
  implicitDayTypeId: 'dt-release',
  dayTypes: [
    {
      id: 'dt-release',
      name: { ar: 'ÙŠÙˆÙ…', en: 'Day' },
      trainingDay: false,
      targets: null,
    },
  ],
  meals: [],
  title: { ar: 'Ø®Ø·Ø©', en: 'Plan' },
  notes: null,
};

async function expectDirectDmlDenied(
  table: string,
  query: ReturnType<typeof sql> | postgres.TransactionSql = db,
) {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      const [grant] = await query`
        select has_table_privilege(${role}, ${table}, ${privilege}) as allowed
      `;
      expect(grant?.allowed, `${role} ${privilege} ${table}`).toBe(false);
    }
  }
}

describe('F18 T027 release gate', () => {
  it('keeps every nutrition data table under forced RLS with direct DML denied', async () => {
    const tables = [
      'public.nutrition_plan_version_contents',
      'public.nutrition_global_templates',
      'public.nutrition_global_template_versions',
      'public.nutrition_workspace_templates',
      'public.nutrition_workspace_template_versions',
      'public.nutrition_template_assignment_batches',
      'public.nutrition_template_assignment_items',
      'public.client_nutrition_alternative_selections',
      'public.client_nutrition_selection_revision_counters',
    ];

    for (const table of tables) {
      const [catalog] = await db`
        select relrowsecurity, relforcerowsecurity
        from pg_catalog.pg_class where oid = ${table}::regclass
      `;
      expect(catalog, `${table} RLS`).toEqual({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });

      await expectDirectDmlDenied(table);
    }
  });

  it('kills a direct-DML grant mutant and rolls back the mutation', async () => {
    const table = 'public.nutrition_plan_version_contents';
    const rollbackMarker = 'release_gate_mutation_rollback';
    try {
      await db.begin(async (tx) => {
        await tx`grant update on public.nutrition_plan_version_contents to authenticated`;
        await expect(expectDirectDmlDenied(table, tx)).rejects.toThrow(
          /authenticated UPDATE public\.nutrition_plan_version_contents/,
        );
        throw new Error(rollbackMarker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(rollbackMarker);
    }
    await expectDirectDmlDenied(table);
  });

  it('persists exact schema, algorithm, computation, and safe publish audit on an immutable revision', async () => {
    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'nutrition',
      p_content: nutritionDocument,
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();

    const published = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: created.data as string,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(published.error).toBeNull();
    expect(published.data).toMatchObject({ status: 'ok' });
    const revisionId = (published.data as { revision_id: string }).revision_id;

    const [content] = await db`
      select schema_version, algorithm_version, document, snapshot_map, computed_values
      from public.nutrition_plan_version_contents
      where workspace_id = ${fixture.wsA.id} and revision_id = ${revisionId}
    `;
    expect(content).toMatchObject({
      schema_version: 1,
      algorithm_version: 1,
      document: nutritionDocument,
      snapshot_map: {},
    });
    expect(content?.computed_values).toEqual(
      computeDocumentValues(nutritionDocument as NutritionDocumentV1, {}),
    );
    const [sqlParity] = await db`
      select app_private.nutrition_compute_values(
        ${db.json(nutritionDocument as never)}, '{}'::jsonb, null
      ) as computed
    `;
    expect(sqlParity?.computed).toEqual(content?.computed_values);

    await expect(db`
      update public.nutrition_plan_version_contents
      set algorithm_version = 2
      where workspace_id = ${fixture.wsA.id} and revision_id = ${revisionId}
    `).rejects.toThrow(/nutrition_plan_version_contents_immutable|23514/);

    const [audit] = await db`
      select action, details from public.audit_events
      where workspace_id = ${fixture.wsA.id} and target_id = ${revisionId}
        and action = 'plan.nutrition_publish'
    `;
    expect(audit?.action).toBe('plan.nutrition_publish');
    expect(
      Object.keys(audit?.details as Record<string, unknown>).sort(),
    ).toEqual([
      'changed_fields',
      'delivery_id',
      'plan_id',
      'revision_id',
      'revision_number',
    ]);
    expect(audit?.details).toMatchObject({ changed_fields: ['document'] });
    expect(JSON.stringify(audit?.details)).not.toContain('schemaVersion');
  });
});
