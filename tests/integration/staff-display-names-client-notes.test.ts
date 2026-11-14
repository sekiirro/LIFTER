import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clientNotesFixture,
  type ClientNotesFixture,
} from './client-notes-fixture';
import { anonClient } from './harness';

let f: ClientNotesFixture;
beforeAll(async () => {
  f = await clientNotesFixture();
});
afterAll(async () => {
  await f?.close();
});

describe('F21 Client Notes author labels and lifecycle retention', () => {
  it('returns names only for authors present in the caller workspace notes', async () => {
    await f.createAsTrainer({ body: 'display name author lookup' });
    const labels = await f.context.woA.client.rpc(
      'get_client_note_author_names',
      {
        p_workspace_id: f.workspaceId,
        p_author_user_ids: [
          f.context.trainerA.userId,
          f.context.trainerB.userId,
        ],
      },
    );
    expect(labels.error).toBeNull();
    expect(labels.data).toHaveLength(1);
    expect(labels.data?.[0]).toMatchObject({
      author_user_id: f.context.trainerA.userId,
      display_name: expect.any(String),
      deactivated: false,
    });
  });

  it('retains and marks the author name after workspace membership deactivation', async () => {
    await f.createAsTrainer({ body: 'historical author remains named' });
    const before = await f.db`
      select display_name from public.staff_profiles
      where user_id = ${f.context.trainerA.userId}
    `;
    const revoked = await f.context.po.client
      .from('workspace_memberships')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: f.context.po.userId,
      })
      .eq('workspace_id', f.workspaceId)
      .eq('user_id', f.context.trainerA.userId);
    expect(revoked.error).toBeNull();
    const after = await f.db`
      select display_name from public.staff_profiles
      where user_id = ${f.context.trainerA.userId}
    `;
    expect(after[0]?.display_name).toBe(before[0]?.display_name);

    const labels = await f.context.woA.client.rpc(
      'get_client_note_author_names',
      {
        p_workspace_id: f.workspaceId,
        p_author_user_ids: [f.context.trainerA.userId],
      },
    );
    expect(labels.error).toBeNull();
    expect(labels.data).toEqual([
      {
        author_user_id: f.context.trainerA.userId,
        display_name: before[0]?.display_name,
        deactivated: true,
      },
    ]);
  });

  it('denies anonymous and foreign workspace label lookups', async () => {
    const anonymous = await anonClient().rpc('get_client_note_author_names', {
      p_workspace_id: f.workspaceId,
      p_author_user_ids: [f.context.trainerA.userId],
    });
    expect(anonymous.error?.code).toBe('42501');
    const foreign = await f.context.trainerB.client.rpc(
      'get_client_note_author_names',
      {
        p_workspace_id: f.workspaceId,
        p_author_user_ids: [f.context.trainerA.userId],
      },
    );
    expect(foreign.error?.code).toBe('42501');
  });
});
