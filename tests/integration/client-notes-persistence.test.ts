import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
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

describe('F20 T003 client note persistence and constraints', () => {
  it('installs tenant-scoped note and content-free create-key tables', async () => {
    const [relations] = await f.db`
      select
        to_regclass('public.client_notes') as notes,
        to_regclass('app_private.client_note_create_keys') as create_keys
    `;
    expect(relations?.notes).toBe('client_notes');
    expect(relations?.create_keys).toBe('app_private.client_note_create_keys');
    expect(await f.keyRecordHasBodyColumn()).toBe(false);
  });

  it('trims Unicode whitespace before the code-point limit and stores the trimmed body', async () => {
    const note = await f.createAsTrainer({
      body: '\u00a0' + 'x'.repeat(5000) + '\u3000',
    });
    expect(note).toMatchObject({ body: 'x'.repeat(5000), outcome: 'created' });
    expect(Array.from(String(note.body))).toHaveLength(5000);

    const astral = await f.createAsTrainer({ body: '🧪'.repeat(5000) });
    expect(Array.from(String(astral.body))).toHaveLength(5000);
    const formatted = await f.createAsTrainer({ body: 'one\ninside\ttext' });
    expect(formatted.body).toBe('one\ninside\ttext');
  });

  it('refuses blank, oversized, and NUL bodies without persisting a row', async () => {
    const before = await f.countNotes();
    for (const body of ['', ' \t\n', 'x'.repeat(5001), 'a\u0000b']) {
      const result = await f.createAs(f.context.trainerA, body);
      expect(result.error).not.toBeNull();
    }
    expect(await f.countNotes()).toBe(before);
  });

  it('enforces trimmed body limits at the direct database boundary', async () => {
    const before = await f.countNotes();
    await f.rawInsertNote({ key: f.key(), body: 'x' });
    await f.rawInsertNote({ key: f.key(), body: 'x'.repeat(5000) });
    expect(await f.countNotes()).toBe(before + 2);
    for (const body of [
      ` ${'x'.repeat(5000)}`,
      `${'x'.repeat(5000)}\t`,
      'x'.repeat(5001),
      ' \t\n',
    ]) {
      await expect(
        f.rawInsertNote({ key: f.key(), body }),
      ).rejects.toBeDefined();
    }
    await expect(
      f.db.begin((tx) =>
        tx`insert into public.client_notes (
          workspace_id, client_id, author_user_id, body, idempotency_key
        ) values (
          ${f.workspaceId}, ${f.clientId}, ${f.context.trainerA.userId},
          pg_catalog.convert_from(pg_catalog.decode('610062', 'hex'), 'UTF8'),
          ${f.key()}
        )`,
      ),
    ).rejects.toBeDefined();
    expect(await f.countNotes()).toBe(before + 2);
  });

  it('returns one live note for a same-key same-body retry and rejects mismatch', async () => {
    const before = await f.countNotes();
    const key = f.key();
    const first = await f.createAsTrainer({ body: '  same body  ', key });
    const retry = await f.createAsTrainer({ body: 'same body', key });
    expect(retry).toMatchObject({ id: first.id, outcome: 'existing' });
    const mismatch = await f.createAs(f.context.trainerA, 'different', key);
    expect(mismatch.error).not.toBeNull();
    expect(await f.countNotes()).toBe(before + 1);
  });

  it('checks retries against the original body fingerprint and preserves edits', async () => {
    const before = await f.countNotes();
    const key = f.key();
    const note = await f.createAsTrainer({ body: 'original submission', key });
    const edit = await f.context.trainerA.client.rpc('update_client_note', {
      p_note_id: note.id,
      p_body: 'committed edit',
    });
    expect(edit.error).toBeNull();

    const sameSubmission = await f.createAs(
      f.context.trainerA,
      '  original submission  ',
      key,
    );
    expect(sameSubmission.error).toBeNull();
    const sameRow = Array.isArray(sameSubmission.data)
      ? sameSubmission.data[0]
      : sameSubmission.data;
    expect(sameRow).toMatchObject({ id: note.id, outcome: 'existing' });

    const editedBodyRetry = await f.createAs(
      f.context.trainerA,
      'committed edit',
      key,
    );
    expect(editedBodyRetry.error).not.toBeNull();
    const [row] = await f.db`
      select body from public.client_notes where id = ${String(note.id)}
    `;
    expect(row?.body).toBe('committed edit');
    const [counts] = await f.db`
      select count(*)::int as notes from public.client_notes
        where workspace_id = ${f.workspaceId} and client_id = ${f.clientId};
    `;
    expect(counts?.notes).toBe(before + 1);
    const [createEvents] = await f.db`
      select count(*)::int as count from public.audit_events
      where action = 'client_note.created' and target_id = ${String(note.id)}
    `;
    expect(createEvents?.count).toBe(1);
  });

  it('creates independent notes for distinct idempotency keys', async () => {
    const before = await f.countNotes();
    const first = await f.createAsTrainer({ body: 'first independent note' });
    const second = await f.createAsTrainer({ body: 'second independent note' });
    expect(second.id).not.toBe(first.id);
    expect(await f.countNotes()).toBe(before + 2);
  });

  it('serializes concurrent same-key creates and refuses direct duplicate note rows', async () => {
    const key = f.key();
    const results = await Promise.all([
      f.createAsTrainer({ body: 'concurrent body', key }),
      f.createAsTrainer({ body: 'concurrent body', key }),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual([
      'created',
      'existing',
    ]);
    expect(results[0]?.id).toBe(results[1]?.id);
    await expect(
      f.db.begin(async (tx) => {
        await tx`
          insert into public.client_notes (
            workspace_id, client_id, author_user_id, body, idempotency_key
          ) values (
            ${f.workspaceId}, ${f.clientId}, ${f.context.trainerA.userId},
            'concurrent body', ${key}
          )
        `;
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('refuses updates to note identity, scope, author, creation time, and key', async () => {
    const note = await f.createAsTrainer({ body: 'immutable fields' });
    const expressions = [
      ['id', 'gen_random_uuid()'],
      ['workspace_id', 'gen_random_uuid()'],
      ['client_id', 'gen_random_uuid()'],
      ['author_user_id', 'gen_random_uuid()'],
      ['created_at', "created_at + interval '1 second'"],
      ['idempotency_key', "idempotency_key || '-changed'"],
    ] as const;
    for (const [column, expression] of expressions) {
      await expect(
        f.db.begin((tx) =>
          tx.unsafe(
            `update public.client_notes set ${column} = ${expression} where id = $1`,
            [String(note.id)],
          ),
        ),
      ).rejects.toMatchObject({ code: '23514' });
    }
    const [row] = await f.db`
      select id, workspace_id, client_id, author_user_id, body,
             created_at, idempotency_key
      from public.client_notes where id = ${String(note.id)}
    `;
    expect(row).toMatchObject({
      id: note.id,
      workspace_id: f.workspaceId,
      client_id: f.clientId,
      author_user_id: f.context.trainerA.userId,
      body: 'immutable fields',
      idempotency_key: note.idempotency_key,
    });
  });

  it('permits workspace Trainer access and denies Sales, foreign workspace, and anonymous reads', async () => {
    const note = await f.createAsTrainer({ body: 'workspace note' });
    const trainerRead = await f.readNote(f.context.trainerA, String(note.id));
    expect(trainerRead.data).toHaveLength(1);
    const directInsert = await f.context.trainerA.client
      .from('client_notes')
      .insert({
        workspace_id: f.workspaceId,
        client_id: f.clientId,
        author_user_id: f.context.trainerA.userId,
        body: 'direct insert must be refused',
        idempotency_key: f.key(),
      });
    expect(directInsert.error).not.toBeNull();
    const ownerRead = await f.readNote(f.context.woA, String(note.id));
    expect(ownerRead.data).toHaveLength(1);
    const platformOwnerRead = await f.readNote(f.context.po, String(note.id));
    expect(platformOwnerRead.data).toHaveLength(1);
    const salesRead = await f.readNote(f.context.salesA, String(note.id));
    expect(salesRead.data).toEqual([]);
    const foreignTrainerRead = await f.readNote(
      f.context.trainerB,
      String(note.id),
    );
    expect(foreignTrainerRead.data).toEqual([]);
    const anonymousRead = await anonClient()
      .from('client_notes')
      .select('id')
      .eq('id', note.id);
    expect(anonymousRead.data).toBeNull();
    expect(anonymousRead.error).not.toBeNull();
  });

  it('checks write access by role and preserves the membership-free PO branch', async () => {
    const [poMembership] = await f.db`
      select exists (
        select 1 from public.workspace_memberships
        where workspace_id = ${f.workspaceId}
          and user_id = ${f.context.po.userId}
          and revoked_at is null
      ) as active
    `;
    expect(poMembership?.active).toBe(false);

    const poCreate = await f.context.po.client.rpc('create_client_note', {
      p_workspace_id: f.workspaceId,
      p_client_id: f.clientId,
      p_body: 'platform owner workspace note',
      p_idempotency_key: f.key(),
    });
    expect(poCreate.error).toBeNull();

    for (const actor of [f.context.salesA, f.context.trainerB]) {
      const denied = await f.createAs(
        actor,
        'unauthorized role create',
        f.key(),
      );
      expect(denied.error).not.toBeNull();
    }
    const anonymousCreate = await anonClient().rpc('create_client_note', {
      p_workspace_id: f.workspaceId,
      p_client_id: f.clientId,
      p_body: 'anonymous create',
      p_idempotency_key: f.key(),
    });
    expect(anonymousCreate.error).not.toBeNull();
  });

  it('writes one metadata-only create audit event', async () => {
    const note = await f.createAsTrainer({ body: 'private note text' });
    const [eventCount] = await f.db`
      select count(*)::int as count from public.audit_events
      where action = 'client_note.created' and target_id = ${String(note.id)}
    `;
    expect(eventCount?.count).toBe(1);
    const [event] = await f.db`
      select actor_user_id, action, target_table, target_id, workspace_id,
             details, occurred_at
      from public.audit_events
      where action = 'client_note.created' and target_id = ${String(note.id)}
    `;
    expect(event).toMatchObject({
      actor_user_id: f.context.trainerA.userId,
      action: 'client_note.created',
      target_table: 'client_notes',
      target_id: note.id,
      workspace_id: f.workspaceId,
      details: { client_id: f.clientId },
    });
    expect(Object.keys((event?.details ?? {}) as object).sort()).toEqual([
      'client_id',
    ]);
    expect(event?.occurred_at).toBeTruthy();
    expect(JSON.stringify(event?.details)).not.toContain('private note text');
  });
});
