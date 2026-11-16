import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clientNotesFixture,
  type ClientNotesFixture,
} from './client-notes-fixture';

let fixture: ClientNotesFixture;
let revisionId: string;
const db = () => fixture.db;

beforeAll(async () => {
  fixture = await clientNotesFixture();
  const content = {
    schema_version: 1,
    notes: 'synthetic prompt note',
    days: [],
  };
  const draft = await fixture.context.trainerA.client.rpc('create_plan_draft', {
    p_workspace_id: fixture.workspaceId,
    p_client_id: fixture.clientId,
    p_plan_kind: 'workout',
    p_content: content,
    p_operation_key: randomUUID(),
  });
  if (draft.error || typeof draft.data !== 'string')
    throw new Error('Unable to create synthetic workout draft');
  const [root] = await db()`
    select created_by from public.plan_roots
    where workspace_id=${fixture.workspaceId} and id=${draft.data}
  `;
  revisionId = randomUUID();
  await db()`
    insert into public.plan_revisions (
      id, workspace_id, plan_id, revision_number, source_draft_version,
      plan_kind, content, authored_by
    )
    select ${revisionId}, d.workspace_id, d.plan_id, 1, d.draft_version,
      'workout', d.content, ${root!.created_by}
    from public.plan_drafts d
    where d.workspace_id=${fixture.workspaceId} and d.plan_id=${draft.data}
  `;
});

afterAll(async () => fixture?.close());

describe('F17 Copy AI Prompt published revision access (T040, FR-019)', () => {
  it('lets export-authorized staff read the selected published revision', async () => {
    const result = await fixture.context.trainerA.client
      .from('plan_revisions')
      .select('id,workspace_id,plan_kind,content')
      .eq('id', revisionId)
      .eq('plan_kind', 'workout');
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]).toMatchObject({
      id: revisionId,
      workspace_id: fixture.workspaceId,
      plan_kind: 'workout',
    });
  });

  it.each([
    ['Sales', (f: ClientNotesFixture) => f.context.salesA.client],
    [
      'a foreign workspace trainer',
      (f: ClientNotesFixture) => f.context.trainerB.client,
    ],
  ])(
    'hides published content from %s under database RLS',
    async (_label, getClient) => {
      const result = await getClient(fixture)
        .from('plan_revisions')
        .select('id,workspace_id,plan_kind,content')
        .eq('id', revisionId)
        .eq('plan_kind', 'workout');
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    },
  );
});
