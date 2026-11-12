import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clientNotesFixture,
  type ClientNotesFixture,
} from './client-notes-fixture';

let f: ClientNotesFixture;
beforeAll(async () => {
  f = await clientNotesFixture();
});
afterAll(async () => {
  await f?.close();
});

describe('F20 T004 client note mutation boundaries', () => {
  it('lets an authorized note author edit in place and writes metadata-only audit', async () => {
    const note = await f.createAsTrainer({ body: 'before edit' });
    const edited = await f.context.trainerA.client.rpc('update_client_note', {
      p_note_id: note.id,
      p_body: '  after edit  ',
    });
    expect(edited.error).toBeNull();
    const [row] = await f.db`
      select id, workspace_id, client_id, author_user_id, body,
             created_at, edited_at
      from public.client_notes where id = ${String(note.id)}
    `;
    expect(row).toMatchObject({
      id: note.id,
      workspace_id: f.workspaceId,
      client_id: f.clientId,
      author_user_id: f.context.trainerA.userId,
      body: 'after edit',
    });
    expect(row?.edited_at).not.toBeNull();
    const [creationTimestamp] = await f.db`
      select created_at::text as saved,
             ${String(note.created_at)} as returned
      from public.client_notes where id = ${String(note.id)}
    `;
    const normalizeTimestamp = (value: string) =>
      value.replace('T', ' ').replace('+00:00', '+00');
    expect(normalizeTimestamp(String(creationTimestamp?.saved ?? ''))).toBe(
      normalizeTimestamp(String(creationTimestamp?.returned ?? '')),
    );
    const [event] = await f.db`
      select actor_user_id, action, target_table, target_id, workspace_id, details
      from public.audit_events
      where action = 'client_note.updated' and target_id = ${String(note.id)}
    `;
    expect(event).toMatchObject({
      actor_user_id: f.context.trainerA.userId,
      action: 'client_note.updated',
      target_table: 'client_notes',
      target_id: note.id,
      workspace_id: f.workspaceId,
      details: { client_id: f.clientId },
    });
    expect(JSON.stringify(event?.details)).not.toContain('after edit');
  });

  it('denies edits to non-authors and permits the Platform Owner branch', async () => {
    const note = await f.createAsTrainer({ body: 'author body' });
    for (const actor of [f.context.woA, f.context.trainerB, f.context.salesA]) {
      const result = await actor.client.rpc('update_client_note', {
        p_note_id: note.id,
        p_body: 'unauthorized edit',
      });
      expect(result.error).not.toBeNull();
    }
    const poEdit = await f.context.po.client.rpc('update_client_note', {
      p_note_id: note.id,
      p_body: 'platform edit',
    });
    expect(poEdit.error).toBeNull();
    const [row] = await f.db`
      select body, author_user_id
      from public.client_notes where id = ${String(note.id)}
    `;
    expect(row).toMatchObject({
      body: 'platform edit',
      author_user_id: f.context.trainerA.userId,
    });
  });

  it('rolls back key state, note deletion, and audit on key-state failure', async () => {
    const key = f.key();
    const note = await f.createAsTrainer({ body: 'delete atomically', key });
    const [before] = await f.db`
      select count(*)::int as count from public.audit_events
      where action = 'client_note.deleted' and target_id = ${String(note.id)}
    `;
    await f.db`
      create or replace function app_private.client_note_test_reject_key_update()
      returns trigger language plpgsql set search_path = '' as $$
      begin
        raise exception 'synthetic key update failure' using errcode = '23514';
      end;
      $$
    `;
    await f.db`
      create trigger client_note_test_reject_key_update
      before update on app_private.client_note_create_keys
      for each row execute function app_private.client_note_test_reject_key_update()
    `;
    try {
      const failedDelete = await f.context.po.client.rpc('delete_client_note', {
        p_note_id: note.id,
      });
      expect(failedDelete.error).not.toBeNull();
      expect(await f.countNotes()).toBeGreaterThan(0);
      const [keyBefore] = await f.db`
        select outcome from app_private.client_note_create_keys
        where workspace_id = ${f.workspaceId}
          and client_id = ${f.clientId} and idempotency_key = ${key}
      `;
      expect(keyBefore?.outcome).toBe('created');
      const [afterFailure] = await f.db`
        select count(*)::int as count from public.audit_events
        where action = 'client_note.deleted' and target_id = ${String(note.id)}
      `;
      expect(afterFailure?.count).toBe(before?.count);
    } finally {
      await f.db`drop trigger if exists client_note_test_reject_key_update on app_private.client_note_create_keys`;
      await f.db`drop function if exists app_private.client_note_test_reject_key_update()`;
    }

    const deleted = await f.context.po.client.rpc('delete_client_note', {
      p_note_id: note.id,
    });
    expect(deleted.error).toBeNull();
    const [remaining] = await f.db`
      select count(*)::int as count from public.client_notes where id = ${String(note.id)}
    `;
    expect(remaining?.count).toBe(0);
    const [keyAfter] = await f.db`
      select outcome from app_private.client_note_create_keys
      where workspace_id = ${f.workspaceId}
        and client_id = ${f.clientId} and idempotency_key = ${key}
    `;
    expect(keyAfter?.outcome).toBe('deleted');
    const retry = await f.context.trainerA.client.rpc('create_client_note', {
      p_workspace_id: f.workspaceId,
      p_client_id: f.clientId,
      p_body: 'different retry body',
      p_idempotency_key: key,
    });
    expect(retry.error).not.toBeNull();
    const [event] = await f.db`
      select actor_user_id, action, target_table, target_id, workspace_id, details
      from public.audit_events
      where action = 'client_note.deleted' and target_id = ${String(note.id)}
    `;
    expect(event).toMatchObject({
      actor_user_id: f.context.po.userId,
      action: 'client_note.deleted',
      target_table: 'client_notes',
      target_id: note.id,
      workspace_id: f.workspaceId,
      details: { client_id: f.clientId },
    });
    expect(JSON.stringify(event?.details)).not.toContain('delete atomically');
  });
});
