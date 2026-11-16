import { randomUUID } from 'node:crypto';
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

const validWorkoutDocument = { schema_version: 1, days: [] };

async function createWorkout(content: unknown, operationKey = randomUUID()) {
  return fixture.context.trainerA.client.rpc('create_plan_draft', {
    p_workspace_id: fixture.workspaceId,
    p_client_id: fixture.clientId,
    p_plan_kind: 'workout',
    p_content: content,
    p_operation_key: operationKey,
  });
}

describe('F17 plan content attached to F19 Plan Core', () => {
  it('exposes the selected published revision only through authorized workspace RLS', async () => {
    const created = await createWorkout({
      schema_version: 1,
      notes: 'synthetic prompt note',
      days: [],
    });
    expect(created.error).toBeNull();
    const planId = String(created.data);
    const [root] = await db()`
      select created_by from public.plan_roots
      where workspace_id=${fixture.workspaceId} and id=${planId}
    `;
    const revisionId = randomUUID();
    await db()`insert into public.plan_revisions (id,workspace_id,plan_id,revision_number,source_draft_version,plan_kind,content,authored_by)
      select ${revisionId},d.workspace_id,d.plan_id,1,d.draft_version,'workout',d.content,${root!.created_by}
      from public.plan_drafts d where d.workspace_id=${fixture.workspaceId} and d.plan_id=${planId}`;
    const read = (client: typeof fixture.context.trainerA.client) =>
      client
        .from('plan_revisions')
        .select('id,workspace_id,plan_kind,content')
        .eq('id', revisionId)
        .eq('plan_kind', 'workout');
    const [allowed, sales, foreign] = await Promise.all([
      read(fixture.context.trainerA.client),
      read(fixture.context.salesA.client),
      read(fixture.context.trainerB.client),
    ]);
    expect(allowed.data).toMatchObject([
      {
        id: revisionId,
        workspace_id: fixture.workspaceId,
        plan_kind: 'workout',
      },
    ]);
    expect(sales).toMatchObject({ error: null, data: [] });
    expect(foreign).toMatchObject({ error: null, data: [] });
  });

  it('uses F19 rows with composite workspace keys and no duplicate plan lifecycle tables', async () => {
    const [tables] = await db()`
      select
        to_regclass('public.plan_roots') as roots,
        to_regclass('public.plan_drafts') as drafts,
        to_regclass('public.plan_revisions') as revisions,
        to_regclass('public.plan_deliveries') as deliveries,
        to_regclass('public.workout_plan_roots') as duplicate_roots,
        to_regclass('public.workout_plan_drafts') as duplicate_drafts,
        to_regclass('public.workout_plan_revisions') as duplicate_revisions
    `;
    expect(tables).toEqual({
      roots: 'plan_roots',
      drafts: 'plan_drafts',
      revisions: 'plan_revisions',
      deliveries: 'plan_deliveries',
      duplicate_roots: null,
      duplicate_drafts: null,
      duplicate_revisions: null,
    });

    const keys = await db()`
      select conrelid::regclass::text as relation, cardinality(conkey) as key_width
      from pg_constraint
      where contype = 'f'
        and conrelid in ('public.plan_drafts'::regclass, 'public.plan_revisions'::regclass)
        and confrelid = 'public.plan_roots'::regclass
      order by relation
    `;
    expect(keys).toEqual([
      { relation: 'plan_drafts', key_width: 2 },
      { relation: 'plan_revisions', key_width: 2 },
    ]);
  });

  it('persists schema v1 on the private F19 draft row and rejects unknown versions without writing', async () => {
    const created = await createWorkout(validWorkoutDocument);
    expect(created.error).toBeNull();
    expect(typeof created.data).toBe('string');
    const planId = created.data as string;

    const saved = await db()`
      select content from public.plan_drafts
      where workspace_id = ${fixture.workspaceId} and plan_id = ${planId}
    `;
    expect(saved[0]?.content).toEqual(validWorkoutDocument);

    const before = await db()`
      select count(*)::int as count from public.plan_roots
      where workspace_id = ${fixture.workspaceId}
    `;
    const unknown = await createWorkout({ schema_version: 99, days: [] });
    expect(unknown.error).not.toBeNull();
    const missingVersion = await createWorkout({ days: [] });
    expect(missingVersion.error).not.toBeNull();
    const after = await db()`
      select count(*)::int as count from public.plan_roots
      where workspace_id = ${fixture.workspaceId}
    `;
    expect(after[0]?.count).toBe(before[0]?.count);
  });

  it('rejects changing an existing draft to an unknown schema without advancing its version', async () => {
    const created = await createWorkout(validWorkoutDocument);
    expect(created.error).toBeNull();
    const planId = created.data as string;

    const result = await fixture.context.trainerA.client.rpc(
      'save_plan_draft',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_content: { schema_version: 2, days: [] },
        p_operation_key: randomUUID(),
      },
    );
    expect(result.error).not.toBeNull();

    const row = await db()`
      select draft_version::int as draft_version, content from public.plan_drafts
      where workspace_id = ${fixture.workspaceId} and plan_id = ${planId}
    `;
    expect(row[0]?.draft_version).toBe(1);
    expect(row[0]?.content).toEqual(validWorkoutDocument);
  });

  it('rejects workout content above the provisional 512 KiB cap without creating a plan', async () => {
    const before = await db()`
      select count(*)::int as count from public.plan_roots
      where workspace_id = ${fixture.workspaceId}
    `;
    const oversized = await createWorkout({
      schema_version: 1,
      days: [],
      notes: 'x'.repeat(512 * 1024),
    });
    expect(oversized.error).not.toBeNull();

    const after = await db()`
      select count(*)::int as count from public.plan_roots
      where workspace_id = ${fixture.workspaceId}
    `;
    expect(after[0]?.count).toBe(before[0]?.count);
  });

  it('validates published F19 revision content with the same schema registry', async () => {
    const created = await createWorkout(validWorkoutDocument);
    expect(created.error).toBeNull();
    const planId = created.data as string;
    const [root] = await db()`
      select created_by from public.plan_roots
      where workspace_id = ${fixture.workspaceId} and id = ${planId}
    `;

    await expect(db()`
      insert into public.plan_revisions (
        workspace_id, plan_id, revision_number, source_draft_version,
        plan_kind, content, authored_by
      ) values (
        ${fixture.workspaceId}, ${planId}, 1, 1,
        'workout', ${JSON.stringify({ schema_version: 99, days: [] })}::jsonb,
        ${root!.created_by}
      )
    `).rejects.toThrow();
  });
});
