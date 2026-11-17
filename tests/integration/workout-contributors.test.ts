import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, createStaff } from './harness';
import { clientContext, graph, sql } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';
import { seedSubmittedIntake } from './f17-plan-publish-fixture';

let fixture: Context;
let db: ReturnType<typeof sql>;
let seeded: Awaited<ReturnType<typeof graph>>;
let trainer2: Awaited<ReturnType<typeof createStaff>>;

beforeAll(async () => {
  fixture = await clientContext();
  db = sql();
  trainer2 = await createStaff('trainer', 'f17-contributor-b');
  const membership = await admin().from('workspace_memberships').insert({
    workspace_id: fixture.wsA.id,
    user_id: trainer2.userId,
    granted_by: fixture.po.userId,
  });
  if (membership.error)
    throw new Error(
      `Failed to add second trainer: ${membership.error.message}`,
    );
  seeded = await db.begin((tx) => graph(tx, fixture));
});

afterAll(async () => db?.end());

const workout = (notes: string) => ({
  schema_version: 1,
  days: [],
  notes,
});

describe('F17 T022 workout revision contributors', () => {
  it('publishes per-revision save/publish actions without plan content', async () => {
    const [column] = await db`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'plan_revision_contributors'
          and column_name = 'action_codes'
      ) as action_codes
    `;
    expect(column?.action_codes).toBe(true);

    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'workout',
      p_content: workout('first revision content'),
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();
    const planId = created.data as string;

    const firstSave = await fixture.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_content: workout('first saved content'),
      p_operation_key: randomUUID(),
    });
    expect(firstSave.error).toBeNull();
    await db.begin((tx) =>
      seedSubmittedIntake(tx, fixture.wsA.id, seeded.client),
    );

    const firstPublish = await fixture.trainerA.client.rpc(
      'ready_and_publish_plan',
      {
        p_plan_id: planId,
        p_expected_draft_version: 2,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(firstPublish.error).toBeNull();
    const firstRevision = (firstPublish.data as { revision_id: string })
      .revision_id;

    const secondSave = await trainer2.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 2,
      p_content: workout('second revision content'),
      p_operation_key: randomUUID(),
    });
    expect(secondSave.error).toBeNull();
    const thirdSave = await fixture.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 3,
      p_content: workout('final saved content'),
      p_operation_key: randomUUID(),
    });
    expect(thirdSave.error).toBeNull();

    const secondPublish = await fixture.trainerA.client.rpc(
      'ready_and_publish_plan',
      {
        p_plan_id: planId,
        p_expected_draft_version: 4,
        p_expected_published_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(secondPublish.error).toBeNull();
    const secondRevision = (secondPublish.data as { revision_id: string })
      .revision_id;
    expect(secondRevision).not.toBe(firstRevision);

    const rows = await db`
      select workspace_id, plan_id, revision_id, user_id, action_codes,
        first_contributed_at
      from public.plan_revision_contributors
      where revision_id = ${secondRevision}
      order by user_id
    `;
    expect(rows).toHaveLength(2);
    expect(
      rows.map(({ user_id, action_codes }) => ({ user_id, action_codes })),
    ).toEqual(
      expect.arrayContaining([
        { user_id: trainer2.userId, action_codes: ['save'] },
        { user_id: fixture.trainerA.userId, action_codes: ['save', 'publish'] },
      ]),
    );
    expect(rows.every((row) => row.first_contributed_at instanceof Date)).toBe(
      true,
    );
    expect(
      rows.every(
        (row) => row.workspace_id === fixture.wsA.id && row.plan_id === planId,
      ),
    ).toBe(true);
    expect(
      rows.every(
        (row) =>
          Object.keys(row).sort().join(',') ===
          'action_codes,first_contributed_at,plan_id,revision_id,user_id,workspace_id',
      ),
    ).toBe(true);

    const firstRows = await db`
      select user_id, action_codes
      from public.plan_revision_contributors
      where revision_id = ${firstRevision}
    `;
    expect(firstRows).toEqual([
      { user_id: fixture.trainerA.userId, action_codes: ['save', 'publish'] },
    ]);
  });
});
