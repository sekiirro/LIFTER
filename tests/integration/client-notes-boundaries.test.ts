import { randomUUID } from 'node:crypto';
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
  it('resolves client context only for authorized workspace actors', async () => {
    const resolve = (actor: typeof f.context.trainerA) =>
      actor.client.rpc('client_notes_client_context', {
        p_client_id: f.clientId,
      });
    const [trainer, owner, platformOwner] = await Promise.all([
      resolve(f.context.trainerA),
      resolve(f.context.woA),
      resolve(f.context.po),
    ]);
    expect(trainer.error).toBeNull();
    expect(owner.error).toBeNull();
    expect(platformOwner.error).toBeNull();
    expect(trainer.data).toEqual([
      { client_id: f.clientId, workspace_id: f.workspaceId },
    ]);
    expect(owner.data).toEqual(trainer.data);
    expect(platformOwner.data).toEqual(trainer.data);

    const [sales, foreign, unknown] = await Promise.all([
      resolve(f.context.salesA),
      resolve(f.context.trainerB),
      f.context.trainerA.client.rpc('client_notes_client_context', {
        p_client_id: randomUUID(),
      }),
    ]);
    expect(sales.data).toEqual([]);
    expect(foreign.data).toEqual([]);
    expect(unknown.data).toEqual([]);
  });

  it('gives Sales one generic update/delete denial for existing and absent note IDs', async () => {
    const note = await f.createAsTrainer({
      body: 'existence must stay private',
    });
    const absentId = randomUUID();
    const [eventsBefore] = await f.db`
      select count(*)::int as count from public.audit_events
      where target_table = 'client_notes'
    `;

    const updateErrors = await Promise.all(
      [note.id, absentId].map(async (noteId) => {
        const result = await f.context.salesA.client.rpc('update_client_note', {
          p_note_id: noteId,
          p_body: 'unauthorized update',
        });
        return result.error;
      }),
    );
    expect(updateErrors.map((error) => error?.code)).toEqual([
      '42501',
      '42501',
    ]);
    expect(updateErrors[0]?.message).toBe(updateErrors[1]?.message);
    expect(updateErrors[0]?.message).toBe('client note update denied');

    const deleteErrors = await Promise.all(
      [note.id, absentId].map(async (noteId) => {
        const result = await f.context.salesA.client.rpc('delete_client_note', {
          p_note_id: noteId,
        });
        return result.error;
      }),
    );
    expect(deleteErrors.map((error) => error?.code)).toEqual([
      '42501',
      '42501',
    ]);
    expect(deleteErrors[0]?.message).toBe(deleteErrors[1]?.message);
    expect(deleteErrors[0]?.message).toBe('client note delete denied');
    const [eventsAfter] = await f.db`
      select count(*)::int as count from public.audit_events
      where target_table = 'client_notes'
    `;
    expect(eventsAfter?.count).toBe(eventsBefore?.count);
  });

  it('rechecks revoked membership and refuses forged workspace scope', async () => {
    const key = f.key();
    const note = await f.createAsTrainer({ body: 'membership boundary', key });
    const [eventsBefore] = await f.db`
      select count(*)::int as count from public.audit_events
      where target_table = 'client_notes'
    `;
    await f.db`
      update public.workspace_memberships
      set revoked_at = pg_catalog.clock_timestamp(),
          revoked_by = ${f.context.po.userId}
      where workspace_id = ${f.workspaceId}
        and user_id = ${f.context.trainerA.userId}
    `;
    try {
      const read = await f.readNote(f.context.trainerA, String(note.id));
      expect(read.data).toEqual([]);
      const create = await f.context.trainerA.client.rpc(
        'create_client_note',
        {
          p_workspace_id: f.workspaceId,
          p_client_id: f.clientId,
          p_body: 'revoked create',
          p_idempotency_key: f.key(),
        },
      );
      expect(create.error).not.toBeNull();
      const update = await f.context.trainerA.client.rpc('update_client_note', {
        p_note_id: note.id,
        p_body: 'revoked update',
      });
      expect(update.error).not.toBeNull();
      const deletion = await f.context.trainerA.client.rpc(
        'delete_client_note',
        { p_note_id: note.id },
      );
      expect(deletion.error).not.toBeNull();
    } finally {
      await f.db`
        insert into public.workspace_memberships (
          workspace_id, user_id, granted_by
        ) values (
          ${f.workspaceId}, ${f.context.trainerA.userId}, ${f.context.po.userId}
        )
      `;
    }

    const restoredRetry = await f.context.trainerA.client.rpc(
      'create_client_note',
      {
        p_workspace_id: f.workspaceId,
        p_client_id: f.clientId,
        p_body: 'membership boundary',
        p_idempotency_key: key,
      },
    );
    expect(restoredRetry.error).toBeNull();
    const restoredRow = Array.isArray(restoredRetry.data)
      ? restoredRetry.data[0]
      : restoredRetry.data;
    expect(restoredRow).toMatchObject({ id: note.id, outcome: 'existing' });

    const forgedScope = await f.context.trainerA.client.rpc(
      'create_client_note',
      {
        p_workspace_id: f.context.wsB.id,
        p_client_id: f.clientId,
        p_body: 'forged workspace',
        p_idempotency_key: f.key(),
      },
    );
    expect(forgedScope.error).not.toBeNull();
    const [eventsAfter] = await f.db`
      select count(*)::int as count from public.audit_events
      where target_table = 'client_notes'
    `;
    expect(eventsAfter?.count).toBe(eventsBefore?.count);
  });

  it('rolls back create, edit, and delete when the audit insert fails', async () => {
    const note = await f.createAsTrainer({ body: 'before audit failure' });
    const noteCountBefore = await f.countNotes();
    const [eventCountBefore] = await f.db`
      select count(*)::int as count from public.audit_events
      where target_table = 'client_notes'
    `;
    await f.db`
      create or replace function app_private.client_note_test_reject_audit_insert()
      returns trigger language plpgsql set search_path = '' as $$
      begin
        if new.target_table = 'client_notes' then
          raise exception 'synthetic audit insert failure' using errcode = '23514';
        end if;
        return new;
      end;
      $$
    `;
    await f.db`
      create trigger client_note_test_reject_audit_insert
      before insert on public.audit_events
      for each row execute function app_private.client_note_test_reject_audit_insert()
    `;
    try {
      const rejectedCreate = await f.context.trainerA.client.rpc(
        'create_client_note',
        {
          p_workspace_id: f.workspaceId,
          p_client_id: f.clientId,
          p_body: 'create rolls back',
          p_idempotency_key: f.key(),
        },
      );
      expect(rejectedCreate.error).not.toBeNull();

      const rejectedEdit = await f.context.trainerA.client.rpc(
        'update_client_note',
        { p_note_id: note.id, p_body: 'edit rolls back' },
      );
      expect(rejectedEdit.error).not.toBeNull();

      const rejectedDelete = await f.context.po.client.rpc(
        'delete_client_note',
        { p_note_id: note.id },
      );
      expect(rejectedDelete.error).not.toBeNull();
    } finally {
      await f.db`drop trigger if exists client_note_test_reject_audit_insert on public.audit_events`;
      await f.db`drop function if exists app_private.client_note_test_reject_audit_insert()`;
    }

    const [row] = await f.db`
      select body from public.client_notes where id = ${String(note.id)}
    `;
    expect(row?.body).toBe('before audit failure');
    const [eventsAfter] = await f.db`
      select count(*)::int as count from public.audit_events
      where target_table = 'client_notes'
    `;
    expect(eventsAfter?.count).toBe(eventCountBefore?.count);
    expect(await f.countNotes()).toBe(noteCountBefore);
  });

  it('uses the existing immutable audit table without note retention objects', async () => {
    const [objects] = await f.db`
      select
        to_regclass('public.audit_events')::text as audit_table,
        exists (
          select 1 from pg_catalog.pg_trigger
          where tgrelid = 'public.audit_events'::regclass
            and tgname = 'audit_events_immutable'
            and not tgisinternal
        ) as immutable,
        exists (
          select 1 from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname in ('public', 'app_private')
            and c.relkind in ('r', 'p')
            and c.relname ~* 'client_note.*(retention|purge)|(retention|purge).*client_note'
        ) as note_retention_object
    `;
    expect(objects).toMatchObject({
      audit_table: 'audit_events',
      immutable: true,
      note_retention_object: false,
    });
  });

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
    const [editEventCount] = await f.db`
      select count(*)::int as count from public.audit_events
      where action = 'client_note.updated' and target_id = ${String(note.id)}
    `;
    expect(editEventCount?.count).toBe(1);
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
    const [deleteEventCount] = await f.db`
      select count(*)::int as count from public.audit_events
      where action = 'client_note.deleted' and target_id = ${String(note.id)}
    `;
    expect(deleteEventCount?.count).toBe(1);
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
