import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientContext, graph, sql } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';

let fixture: Context;
let db: ReturnType<typeof sql>;
let seeded: Awaited<ReturnType<typeof graph>>;
let planId: string;
let revisionId: string;
let workoutPlanId: string;
let workoutRevisionId: string;

const SAMPLE_DOCUMENT = {
  schemaVersion: 1,
  structure: 'single_day',
  implicitDayTypeId: 'dt-1',
  dayTypes: [
    {
      id: 'dt-1',
      name: { ar: 'راحة', en: 'Rest' },
      trainingDay: false,
      targets: null,
    },
  ],
  meals: [],
  title: null,
  notes: null,
};

const SAMPLE_WORKOUT_DOCUMENT = { schema_version: 1, days: [] };
const SAMPLE_SNAPSHOT_MAP = {};
const SAMPLE_COMPUTED_VALUES = {
  schemaVersion: 1,
  algorithmVersion: 1,
  items: {},
  meals: {},
  days: { '0': { kcal: '0', protein: '0', carbs: '0', fat: '0' } },
  totals: { kcal: '0', protein: '0', carbs: '0', fat: '0' },
};

beforeAll(async () => {
  fixture = await clientContext();
  db = sql();
  seeded = await db.begin((tx) => graph(tx, fixture));

  // Create a nutrition plan root, draft, and revision for wsA
  const created = await fixture.trainerA.client.rpc('create_plan_draft', {
    p_workspace_id: fixture.wsA.id,
    p_client_id: seeded.client,
    p_plan_kind: 'nutrition',
    p_content: SAMPLE_DOCUMENT,
    p_operation_key: randomUUID(),
  });
  expect(created.error).toBeNull();
  planId = created.data as string;

  const [rev] = await db`
    insert into public.plan_revisions (
      workspace_id, plan_id, revision_number, source_draft_version,
      plan_kind, content, authored_by
    ) values (
      ${fixture.wsA.id}, ${planId}, 1, 1,
      'nutrition', ${db.json(SAMPLE_DOCUMENT)}, ${fixture.trainerA.userId}
    )
    returning id
  `;
  revisionId = rev!.id as string;

  // Also create a workout plan + revision to verify nutrition content cannot attach to workout revisions
  const createdWorkout = await fixture.trainerA.client.rpc(
    'create_plan_draft',
    {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'workout',
      p_content: SAMPLE_WORKOUT_DOCUMENT,
      p_operation_key: randomUUID(),
    },
  );
  expect(createdWorkout.error).toBeNull();
  workoutPlanId = createdWorkout.data as string;

  const [wRev] = await db`
    insert into public.plan_revisions (
      workspace_id, plan_id, revision_number, source_draft_version,
      plan_kind, content, authored_by
    ) values (
      ${fixture.wsA.id}, ${workoutPlanId}, 1, 1,
      'workout', ${db.json(SAMPLE_WORKOUT_DOCUMENT)}, ${fixture.trainerA.userId}
    )
    returning id
  `;
  workoutRevisionId = wRev!.id as string;
});

afterAll(async () => db?.end());

describe('F18 T007 nutrition_plan_version_contents and immutability', () => {
  it('installs the table with RLS enabled and forced, and revokes direct DML', async () => {
    const [meta] = await db`
      select
        to_regclass('public.nutrition_plan_version_contents')::text as tbl,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'nutrition_plan_version_contents'
    `;
    expect(meta).toEqual({
      tbl: 'nutrition_plan_version_contents',
      rls_enabled: true,
      rls_forced: true,
    });

    const [privs] = await db`
      select
        has_table_privilege('anon', 'public.nutrition_plan_version_contents', 'SELECT') as anon_select,
        has_table_privilege('authenticated', 'public.nutrition_plan_version_contents', 'INSERT') as auth_insert,
        has_table_privilege('authenticated', 'public.nutrition_plan_version_contents', 'UPDATE') as auth_update,
        has_table_privilege('authenticated', 'public.nutrition_plan_version_contents', 'DELETE') as auth_delete,
        has_table_privilege('authenticated', 'public.nutrition_plan_version_contents', 'TRUNCATE') as auth_truncate,
        has_table_privilege('service_role', 'public.nutrition_plan_version_contents', 'INSERT') as svc_insert,
        has_table_privilege('service_role', 'public.nutrition_plan_version_contents', 'UPDATE') as svc_update,
        has_table_privilege('service_role', 'public.nutrition_plan_version_contents', 'DELETE') as svc_delete
    `;
    expect(privs).toEqual({
      anon_select: false,
      auth_insert: false,
      auth_update: false,
      auth_delete: false,
      auth_truncate: false,
      svc_insert: false,
      svc_update: false,
      svc_delete: false,
    });
  });

  it('rejects content without a matching revision (composite FK)', async () => {
    await expect(
      db`
        insert into public.nutrition_plan_version_contents (
          workspace_id, plan_id, revision_id, schema_version, algorithm_version,
          document, snapshot_map, computed_values, created_by
        ) values (
          ${fixture.wsA.id}, ${planId}, ${randomUUID()}, 1, 1,
          ${db.json(SAMPLE_DOCUMENT)}, ${db.json(SAMPLE_SNAPSHOT_MAP)},
          ${db.json(SAMPLE_COMPUTED_VALUES)}, ${fixture.trainerA.userId}
        )
      `,
    ).rejects.toThrow();
  });

  it('rejects nutrition content attached to a workout revision', async () => {
    await expect(
      db`
        insert into public.nutrition_plan_version_contents (
          workspace_id, plan_id, revision_id, schema_version, algorithm_version,
          document, snapshot_map, computed_values, created_by
        ) values (
          ${fixture.wsA.id}, ${workoutPlanId}, ${workoutRevisionId}, 1, 1,
          ${db.json(SAMPLE_DOCUMENT)}, ${db.json(SAMPLE_SNAPSHOT_MAP)},
          ${db.json(SAMPLE_COMPUTED_VALUES)}, ${fixture.trainerA.userId}
        )
      `,
    ).rejects.toThrow(/nutrition_revision_kind_mismatch|23514/);
  });

  it('enforces 1:1 per revision, rejects UPDATE/DELETE/TRUNCATE, and isolates foreign workspaces', async () => {
    // 1. Insert valid 1:1 row
    await db`
      insert into public.nutrition_plan_version_contents (
        workspace_id, plan_id, revision_id, schema_version, algorithm_version,
        document, snapshot_map, computed_values, created_by
      ) values (
        ${fixture.wsA.id}, ${planId}, ${revisionId}, 1, 1,
        ${db.json(SAMPLE_DOCUMENT)}, ${db.json(SAMPLE_SNAPSHOT_MAP)},
        ${db.json(SAMPLE_COMPUTED_VALUES)}, ${fixture.trainerA.userId}
      )
    `;

    // 2. Second content row for the same revision must fail
    await expect(
      db`
        insert into public.nutrition_plan_version_contents (
          workspace_id, plan_id, revision_id, schema_version, algorithm_version,
          document, snapshot_map, computed_values, created_by
        ) values (
          ${fixture.wsA.id}, ${planId}, ${revisionId}, 1, 1,
          ${db.json(SAMPLE_DOCUMENT)}, ${db.json(SAMPLE_SNAPSHOT_MAP)},
          ${db.json(SAMPLE_COMPUTED_VALUES)}, ${fixture.trainerA.userId}
        )
      `,
    ).rejects.toThrow(/duplicate key|23505/);

    // 3. UPDATE rejected by immutability trigger
    await expect(
      db`
        update public.nutrition_plan_version_contents
        set schema_version = 2
        where workspace_id = ${fixture.wsA.id} and revision_id = ${revisionId}
      `,
    ).rejects.toThrow(/nutrition_plan_version_contents_immutable|23514/);

    // 4. DELETE rejected by immutability trigger
    await expect(
      db`
        delete from public.nutrition_plan_version_contents
        where workspace_id = ${fixture.wsA.id} and revision_id = ${revisionId}
      `,
    ).rejects.toThrow(/nutrition_plan_version_contents_immutable|23514/);

    // 5. TRUNCATE rejected by immutability trigger
    await expect(
      db`truncate table public.nutrition_plan_version_contents`,
    ).rejects.toThrow(/nutrition_plan_version_contents_immutable|23514/);

    // 6. Own-workspace staff can read
    const ownRead = await fixture.trainerA.client
      .from('nutrition_plan_version_contents')
      .select(
        'workspace_id, plan_id, revision_id, schema_version, algorithm_version',
      )
      .eq('revision_id', revisionId);
    expect(ownRead.error).toBeNull();
    expect(ownRead.data).toHaveLength(1);
    expect(ownRead.data?.[0]).toMatchObject({
      workspace_id: fixture.wsA.id,
      plan_id: planId,
      revision_id: revisionId,
      schema_version: 1,
      algorithm_version: 1,
    });

    // 7. Foreign-workspace staff cannot read
    const foreignRead = await fixture.trainerB.client
      .from('nutrition_plan_version_contents')
      .select('revision_id')
      .eq('revision_id', revisionId);
    expect(foreignRead.error).toBeNull();
    expect(foreignRead.data).toEqual([]);

    // 8. Direct insert via authenticated client is denied
    const directInsert = await fixture.trainerA.client
      .from('nutrition_plan_version_contents')
      .insert({
        workspace_id: fixture.wsA.id,
        plan_id: planId,
        revision_id: revisionId,
        schema_version: 1,
        algorithm_version: 1,
        document: SAMPLE_DOCUMENT,
        snapshot_map: SAMPLE_SNAPSHOT_MAP,
        computed_values: SAMPLE_COMPUTED_VALUES,
        created_by: fixture.trainerA.userId,
      });
    expect(directInsert.error).not.toBeNull();
  });
});
