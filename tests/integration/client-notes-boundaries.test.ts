import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clientNotesFixture,
  type ClientNotesFixture,
} from './client-notes-fixture';
import { admin, anonClient, createStaff, sql } from './harness';
import { issue } from './registration-links-fixture';

let f: ClientNotesFixture;
beforeAll(async () => {
  f = await clientNotesFixture();
});
afterAll(async () => {
  await f?.close();
});

describe('F20 T004 client note mutation boundaries', () => {
  it('rejects create keys outside the client-generated formats before writing', async () => {
    const notesBefore = await f.countNotes();
    const [keysBefore] = await f.db`
      select count(*)::int as count from app_private.client_note_create_keys
      where workspace_id = ${f.workspaceId} and client_id = ${f.clientId}
    `;
    const invalid = await f.context.trainerA.client.rpc('create_client_note', {
      p_workspace_id: f.workspaceId,
      p_client_id: f.clientId,
      p_body: 'note body used as a key',
      p_idempotency_key: 'note body used as a key',
    });
    expect(invalid.error?.code).toBe('22023');
    expect(await f.countNotes()).toBe(notesBefore);
    const [keysAfter] = await f.db`
      select count(*)::int as count from app_private.client_note_create_keys
      where workspace_id = ${f.workspaceId} and client_id = ${f.clientId}
    `;
    expect(keysAfter?.count).toBe(keysBefore?.count);

    const fallback = await f.context.trainerA.client.rpc('create_client_note', {
      p_workspace_id: f.workspaceId,
      p_client_id: f.clientId,
      p_body: 'fallback key is supported',
      p_idempotency_key: 'cn-1790000000000-7abc123',
    });
    expect(fallback.error).toBeNull();
    expect(fallback.data).toBeTruthy();

    const atMax = await f.context.trainerA.client.rpc('create_client_note', {
      p_workspace_id: f.workspaceId,
      p_client_id: f.clientId,
      p_body: 'the maximum generated UUID key is accepted',
      p_idempotency_key: randomUUID(),
    });
    expect(atMax.error).toBeNull();
    expect(atMax.data).toBeTruthy();

    const notesBeforeOversized = await f.countNotes();
    const oversizedKey = `cn-1790000000000-${'a'.repeat(20)}`;
    expect(oversizedKey).toHaveLength(37);
    const oversized = await f.context.trainerA.client.rpc(
      'create_client_note',
      {
        p_workspace_id: f.workspaceId,
        p_client_id: f.clientId,
        p_body: 'oversized key must not persist',
        p_idempotency_key: oversizedKey,
      },
    );
    expect(oversized.error?.code).toBe('22023');
    expect(await f.countNotes()).toBe(notesBeforeOversized);
    const [oversizedKeyCount] = await f.db`
      select count(*)::int as count from app_private.client_note_create_keys
      where workspace_id = ${f.workspaceId} and client_id = ${f.clientId}
        and idempotency_key = ${oversizedKey}
    `;
    expect(oversizedKeyCount?.count).toBe(0);
  });

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
      const revokedRetry = await f.context.trainerA.client.rpc(
        'create_client_note',
        {
          p_workspace_id: f.workspaceId,
          p_client_id: f.clientId,
          p_body: 'membership boundary',
          p_idempotency_key: key,
        },
      );
      expect(revokedRetry.error).not.toBeNull();
      const create = await f.context.trainerA.client.rpc('create_client_note', {
        p_workspace_id: f.workspaceId,
        p_client_id: f.clientId,
        p_body: 'revoked create',
        p_idempotency_key: f.key(),
      });
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

    const [eventsAfterDenials] = await f.db`
      select count(*)::int as count from public.audit_events
      where target_table = 'client_notes'
    `;
    expect(eventsAfterDenials?.count).toBe(eventsBefore?.count);

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
    const restoredEdit = await f.context.trainerA.client.rpc(
      'update_client_note',
      { p_note_id: note.id, p_body: 'membership restored' },
    );
    expect(restoredEdit.error).toBeNull();

    await f.db`
      update public.staff_profiles set role = 'sales'
      where user_id = ${f.context.trainerA.userId}
    `;
    try {
      const roleRevokedEdit = await f.context.trainerA.client.rpc(
        'update_client_note',
        { p_note_id: note.id, p_body: 'role revoked' },
      );
      expect(roleRevokedEdit.error).not.toBeNull();
    } finally {
      await f.db`
        update public.staff_profiles set role = 'trainer'
        where user_id = ${f.context.trainerA.userId}
      `;
    }

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
    expect(eventsAfter?.count).toBe((eventsBefore?.count ?? 0) + 1);
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
    const [versionTable] = await f.db`
      select to_regclass('public.client_note_versions')::text as name
    `;
    expect(versionTable?.name).toBeNull();
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
      select actor_user_id, action, target_table, target_id, workspace_id,
             details, occurred_at, pg_catalog.to_jsonb(ae) as payload
      from public.audit_events ae
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
    expect(Object.keys((event?.details ?? {}) as object).sort()).toEqual([
      'client_id',
    ]);
    expect(event?.occurred_at).toBeTruthy();
    expect(JSON.stringify(event?.details)).not.toContain('after edit');
    expect(JSON.stringify(event?.payload)).not.toContain('after edit');
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

  it('denies client-role access and all non-PO hard deletes, including the author', async () => {
    const note = await f.createAsTrainer({ body: 'delete access matrix' });
    for (const actor of [
      f.context.trainerA,
      f.context.woA,
      f.context.trainerB,
      f.context.salesA,
    ]) {
      const result = await actor.client.rpc('delete_client_note', {
        p_note_id: note.id,
      });
      expect(result.error).not.toBeNull();
    }

    const email = `client-note-role-${randomUUID()}@example.test`;
    const password = `F20-${randomUUID()}-aA1!`;
    const createdUser = await admin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(createdUser.error).toBeNull();
    const clientUserId = createdUser.data.user?.id;
    if (!clientUserId) throw new Error('Client role fixture user missing');
    const issuedLink = await issue(f.context);
    expect(issuedLink.error).toBeNull();
    const registrationLinkId = Array.isArray(issuedLink.data)
      ? issuedLink.data[0]
      : issuedLink.data;
    const clientId = randomUUID();
    const phone =
      '+201' +
      BigInt('0x' + randomUUID().replaceAll('-', '').slice(0, 10))
        .toString()
        .padStart(10, '0')
        .slice(-10);
    await f.db.begin(async (tx) => {
      await tx`alter table public.clients disable trigger signup_client_insert_guard`;
      await tx`alter table public.clients disable trigger signup_client_integrity`;
      await tx`alter table public.clients disable trigger audit_client_signup`;
      try {
        await tx`insert into public.clients (
          id, workspace_id, auth_user_id, registration_link_id,
          package_version_id, email_normalized, phone_e164, name
        ) values (
          ${clientId}, ${f.workspaceId}, ${clientUserId},
          ${registrationLinkId}, ${f.context.p.versionId}, ${email},
          ${phone}, 'Client Notes role fixture'
        )`;
      } finally {
        await tx`alter table public.clients enable trigger signup_client_insert_guard`;
        await tx`alter table public.clients enable trigger signup_client_integrity`;
        await tx`alter table public.clients enable trigger audit_client_signup`;
      }
    });
    const clientActor = anonClient();
    const signedIn = await clientActor.auth.signInWithPassword({
      email,
      password,
    });
    expect(signedIn.error).toBeNull();
    const created = await f.context.trainerA.client.rpc('create_client_note', {
      p_workspace_id: f.workspaceId,
      p_client_id: clientId,
      p_body: 'client-role denial probe',
      p_idempotency_key: f.key(),
    });
    expect(created.error).toBeNull();
    const createdNote = Array.isArray(created.data)
      ? created.data[0]
      : created.data;
    const clientNoteId = String((createdNote as { id?: string } | null)?.id);
    expect(clientNoteId).not.toBe('undefined');
    const clientRead = await clientActor
      .from('client_notes')
      .select('id')
      .eq('id', clientNoteId);
    expect(clientRead.data).toEqual([]);
    const clientUpdate = await clientActor.rpc('update_client_note', {
      p_note_id: clientNoteId,
      p_body: 'client update',
    });
    expect(clientUpdate.error).not.toBeNull();
    const clientDelete = await clientActor.rpc('delete_client_note', {
      p_note_id: clientNoteId,
    });
    expect(clientDelete.error).not.toBeNull();

    const [row] = await f.db`
      select count(*)::int as count from public.client_notes
      where id = ${String(note.id)}
    `;
    expect(row?.count).toBe(1);
  });

  it('treats a lost-response edit retry as a new last-committed save', async () => {
    const note = await f.createAsTrainer({ body: 'original' });
    const first = await f.context.trainerA.client.rpc('update_client_note', {
      p_note_id: note.id,
      p_body: 'author first save',
    });
    expect(first.error).toBeNull();
    const later = await f.context.po.client.rpc('update_client_note', {
      p_note_id: note.id,
      p_body: 'platform owner later save',
    });
    expect(later.error).toBeNull();
    const retry = await f.context.trainerA.client.rpc('update_client_note', {
      p_note_id: note.id,
      p_body: 'author first save',
    });
    expect(retry.error).toBeNull();

    const [row] = await f.db`
      select body from public.client_notes where id = ${String(note.id)}
    `;
    expect(row?.body).toBe('author first save');
    const [events] = await f.db`
      select count(*)::int as count from public.audit_events
      where action = 'client_note.updated' and target_id = ${String(note.id)}
    `;
    expect(events?.count).toBe(3);
  });

  it('serializes overlapping author and Platform Owner saves under a row lock', async () => {
    const note = await f.createAsTrainer({ body: 'locked original' });
    let releaseLock!: () => void;
    let signalLock!: (backendPid: number) => void;
    const lockGate = new Promise<void>((resolve) => (releaseLock = resolve));
    const lockReady = new Promise<number>((resolve) => (signalLock = resolve));
    const lockHeld = f.db.begin(async (tx) => {
      const [backend] = await tx`select pg_backend_pid() as pid`;
      await tx`select id from public.client_notes
        where id = ${String(note.id)} for update`;
      signalLock(Number(backend?.pid));
      await lockGate;
    });
    const observer = sql();
    try {
      const blockerPid = await lockReady;
      let authorSettled = false;
      let platformOwnerSettled = false;
      const authorSave = f.context.trainerA.client
        .rpc('update_client_note', {
          p_note_id: note.id,
          p_body: 'author locked save',
        })
        .then((result) => {
          authorSettled = true;
          return result;
        });
      const platformOwnerSave = f.context.po.client
        .rpc('update_client_note', {
          p_note_id: note.id,
          p_body: 'platform owner locked save',
        })
        .then((result) => {
          platformOwnerSettled = true;
          return result;
        });
      const deadline = Date.now() + 3000;
      let blockedCount = 0;
      let activity: readonly unknown[] = [];
      while (Date.now() < deadline) {
        activity = await observer`
          select pid from pg_catalog.pg_stat_activity
          where pid <> pg_backend_pid()
            and ${blockerPid} = any(pg_catalog.pg_blocking_pids(pid))
        `;
        blockedCount = activity.length;
        if (blockedCount >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(blockedCount, JSON.stringify(activity)).toBeGreaterThanOrEqual(1);
      expect(authorSettled).toBe(false);
      expect(platformOwnerSettled).toBe(false);

      releaseLock();
      await lockHeld;
      const [authorResult, platformOwnerResult] = await Promise.all([
        authorSave,
        platformOwnerSave,
      ]);
      expect(authorResult.error).toBeNull();
      expect(platformOwnerResult.error).toBeNull();
      const [row] = await f.db`
        select body from public.client_notes where id = ${String(note.id)}
      `;
      const [latestEvent] = await f.db`
        select actor_user_id::text as actor_user_id
        from public.audit_events
        where action = 'client_note.updated' and target_id = ${String(note.id)}
        order by id desc limit 1
      `;
      const latestCommittedBody =
        latestEvent?.actor_user_id === f.context.trainerA.userId
          ? 'author locked save'
          : 'platform owner locked save';
      expect(row?.body).toBe(latestCommittedBody);
      const [events] = await f.db`
        select count(*)::int as count from public.audit_events
        where action = 'client_note.updated' and target_id = ${String(note.id)}
      `;
      expect(events?.count).toBe(2);
    } finally {
      releaseLock();
      await lockHeld;
      await observer.end();
    }
  });

  it('denies unauthorized mutations without waiting for a note lock', async () => {
    const note = await f.createAsTrainer({ body: 'denial lock probe' });
    let releaseLock!: () => void;
    let signalLock!: () => void;
    const lockGate = new Promise<void>((resolve) => (releaseLock = resolve));
    const lockReady = new Promise<void>((resolve) => (signalLock = resolve));
    const lockHeld = f.db.begin(async (tx) => {
      await tx`select id from public.client_notes
        where id = ${String(note.id)} for update`;
      signalLock();
      await lockGate;
    });

    try {
      await lockReady;
      const deniedCalls = Promise.all([
        f.context.salesA.client.rpc('update_client_note', {
          p_note_id: note.id,
          p_body: 'unauthorized lock update',
        }),
        f.context.trainerA.client.rpc('delete_client_note', {
          p_note_id: note.id,
        }),
      ]);
      const completedBeforeUnlock = await Promise.race([
        deniedCalls,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
      ]);
      expect(completedBeforeUnlock).not.toBeNull();
      expect(
        completedBeforeUnlock?.map((result) => result.error?.code),
      ).toEqual(['42501', '42501']);
    } finally {
      releaseLock();
      await lockHeld;
    }
  });

  it('rechecks workspace authorization after a locked update resumes', async () => {
    const revocableTrainer = await createStaff(
      'trainer',
      'client-notes-lock-revoke',
    );
    const membership = await f.context.po.client
      .from('workspace_memberships')
      .insert({
        user_id: revocableTrainer.userId,
        workspace_id: f.workspaceId,
        granted_by: f.context.po.userId,
      });
    expect(membership.error).toBeNull();
    const noteResult = await f.createAs(
      revocableTrainer,
      'revocation lock probe',
    );
    expect(noteResult.error).toBeNull();
    const note = Array.isArray(noteResult.data)
      ? (noteResult.data[0] as { id: string })
      : (noteResult.data as { id: string });
    let releaseLock!: () => void;
    let signalLock!: (backendPid: number) => void;
    const lockGate = new Promise<void>((resolve) => (releaseLock = resolve));
    const lockReady = new Promise<number>((resolve) => (signalLock = resolve));
    const lockHeld = f.db.begin(async (tx) => {
      const [backend] = await tx`select pg_backend_pid() as pid`;
      await tx`select id from public.client_notes
        where id = ${String(note.id)} for update`;
      signalLock(Number(backend?.pid));
      await lockGate;
    });
    const observer = sql();

    try {
      const blockerPid = await lockReady;
      let updateOutcome = 'pending';
      const update = revocableTrainer.client
        .rpc('update_client_note', {
          p_note_id: note.id,
          p_body: 'must be denied after revocation',
        })
        .then((result) => {
          updateOutcome = result.error?.code ?? 'success';
          return result;
        });
      const deadline = Date.now() + 3000;
      let observedBlock = false;
      while (Date.now() < deadline) {
        const blockers = await observer`
          select pid from pg_catalog.pg_stat_activity
          where pid <> pg_backend_pid()
            and ${blockerPid} = any(pg_catalog.pg_blocking_pids(pid))
        `;
        if (blockers.length > 0) {
          observedBlock = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const activity = await observer`
        select state, wait_event_type, wait_event,
          pg_catalog.pg_blocking_pids(pid) as blockers
        from pg_catalog.pg_stat_activity
        where pid <> pg_backend_pid() and state = 'active'
      `;
      expect(observedBlock, JSON.stringify({ activity, updateOutcome })).toBe(
        true,
      );

      const revoked = await admin()
        .from('workspace_memberships')
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: f.context.po.userId,
        })
        .eq('workspace_id', f.workspaceId)
        .eq('user_id', revocableTrainer.userId)
        .is('revoked_at', null);
      expect(revoked.error).toBeNull();
      releaseLock();
      await lockHeld;
      const result = await update;
      expect(result.error?.code).toBe('42501');
      const [current] = await f.db`
        select body from public.client_notes where id = ${String(note.id)}
      `;
      expect(current?.body).toBe('revocation lock probe');
    } finally {
      releaseLock();
      await lockHeld;
      await observer.end();
    }
  });

  it('rechecks authorization after a same-key create retry waits on its key lock', async () => {
    const retryingTrainer = await createStaff(
      'trainer',
      'client-notes-create-key-lock-revoke',
    );
    const membership = await f.context.po.client
      .from('workspace_memberships')
      .insert({
        user_id: retryingTrainer.userId,
        workspace_id: f.workspaceId,
        granted_by: f.context.po.userId,
      });
    expect(membership.error).toBeNull();

    const key = f.key();
    const created = await f.createAs(retryingTrainer, 'same-key retry', key);
    expect(created.error).toBeNull();
    const [note] = await f.db`
      select id from public.client_notes
      where workspace_id = ${f.workspaceId}
        and client_id = ${f.clientId} and idempotency_key = ${key}
    `;
    expect(note?.id).toBeDefined();

    let releaseLock!: () => void;
    let signalLock!: (backendPid: number) => void;
    const lockGate = new Promise<void>((resolve) => (releaseLock = resolve));
    const lockReady = new Promise<number>((resolve) => (signalLock = resolve));
    const lockHeld = f.db.begin(async (tx) => {
      const [backend] = await tx`select pg_backend_pid() as pid`;
      await tx`
        select id from app_private.client_note_create_keys
        where workspace_id = ${f.workspaceId}
          and client_id = ${f.clientId} and idempotency_key = ${key}
        for update
      `;
      signalLock(Number(backend?.pid));
      await lockGate;
    });
    const observer = sql();

    try {
      const blockerPid = await lockReady;
      let retryOutcome = 'pending';
      const retry = retryingTrainer.client
        .rpc('create_client_note', {
          p_workspace_id: f.workspaceId,
          p_client_id: f.clientId,
          p_body: 'same-key retry',
          p_idempotency_key: key,
        })
        .then((result) => {
          retryOutcome = result.error?.code ?? 'success';
          return result;
        });
      const deadline = Date.now() + 3000;
      let observedBlock = false;
      while (Date.now() < deadline) {
        const blockers = await observer`
          select pid from pg_catalog.pg_stat_activity
          where pid <> pg_backend_pid()
            and ${blockerPid} = any(pg_catalog.pg_blocking_pids(pid))
        `;
        if (blockers.length > 0) {
          observedBlock = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(observedBlock, retryOutcome).toBe(true);

      const revoked = await admin()
        .from('workspace_memberships')
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: f.context.po.userId,
        })
        .eq('workspace_id', f.workspaceId)
        .eq('user_id', retryingTrainer.userId)
        .is('revoked_at', null);
      expect(revoked.error).toBeNull();
      releaseLock();
      await lockHeld;
      const result = await retry;
      expect(result.error?.code).toBe('42501');
      expect(result.data).toBeNull();
      const [remaining] = await f.db`
        select id from public.client_notes where id = ${String(note?.id)}
      `;
      expect(remaining?.id).toBe(note?.id);
    } finally {
      releaseLock();
      await lockHeld;
      await observer.end();
      await admin()
        .from('workspace_memberships')
        .update({ revoked_at: null, revoked_by: null })
        .eq('workspace_id', f.workspaceId)
        .eq('user_id', retryingTrainer.userId);
    }
  });

  it('rechecks owner authorization after delete waits on its create-key lock', async () => {
    const key = f.key();
    const note = await f.createAsTrainer({ body: 'delete role race', key });
    let releaseLock!: () => void;
    let signalLock!: (backendPid: number) => void;
    const lockGate = new Promise<void>((resolve) => (releaseLock = resolve));
    const lockReady = new Promise<number>((resolve) => (signalLock = resolve));
    const lockHeld = f.db.begin(async (tx) => {
      const [backend] = await tx`select pg_backend_pid() as pid`;
      await tx`
        select id from app_private.client_note_create_keys
        where workspace_id = ${f.workspaceId}
          and client_id = ${f.clientId} and idempotency_key = ${key}
        for update
      `;
      signalLock(Number(backend?.pid));
      await lockGate;
    });
    const observer = sql();
    const previousRole = 'platform_owner';

    try {
      const blockerPid = await lockReady;
      let deleteOutcome = 'pending';
      const deletion = f.context.po.client
        .rpc('delete_client_note', { p_note_id: note.id })
        .then((result) => {
          deleteOutcome = result.error?.code ?? 'success';
          return result;
        });
      const deadline = Date.now() + 3000;
      let observedBlock = false;
      while (Date.now() < deadline) {
        const blockers = await observer`
          select pid from pg_catalog.pg_stat_activity
          where pid <> pg_backend_pid()
            and ${blockerPid} = any(pg_catalog.pg_blocking_pids(pid))
        `;
        if (blockers.length > 0) {
          observedBlock = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(observedBlock, deleteOutcome).toBe(true);

      const downgraded = await admin()
        .from('staff_profiles')
        .update({ role: 'sales' })
        .eq('user_id', f.context.po.userId);
      expect(downgraded.error).toBeNull();
      releaseLock();
      await lockHeld;
      const result = await deletion;
      expect(result.error?.code).toBe('42501');
      const [remaining] = await f.db`
        select id from public.client_notes where id = ${String(note.id)}
      `;
      expect(remaining?.id).toBe(note.id);
      const [keyRow] = await f.db`
        select outcome from app_private.client_note_create_keys
        where workspace_id = ${f.workspaceId}
          and client_id = ${f.clientId} and idempotency_key = ${key}
      `;
      expect(keyRow?.outcome).toBe('created');
    } finally {
      releaseLock();
      await lockHeld;
      await observer.end();
      await admin()
        .from('staff_profiles')
        .update({ role: previousRole })
        .eq('user_id', f.context.po.userId);
    }
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
      select actor_user_id, action, target_table, target_id, workspace_id,
             details, occurred_at, pg_catalog.to_jsonb(ae) as payload
      from public.audit_events ae
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
    expect(Object.keys((event?.details ?? {}) as object).sort()).toEqual([
      'client_id',
    ]);
    expect(event?.occurred_at).toBeTruthy();
    expect(JSON.stringify(event?.details)).not.toContain('delete atomically');
    expect(JSON.stringify(event?.payload)).not.toContain('delete atomically');
  });
});
