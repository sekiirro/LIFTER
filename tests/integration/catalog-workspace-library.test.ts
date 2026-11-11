import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;

let po: Awaited<ReturnType<typeof twoWorkspaceFixture>>['po'];
let trainerA: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerA'];
let salesA: Awaited<ReturnType<typeof twoWorkspaceFixture>>['salesA'];
let trainerB: Awaited<ReturnType<typeof twoWorkspaceFixture>>['trainerB'];
let wsA: string;
let wsB: string;

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  po = fixture.po;
  trainerA = fixture.trainerA;
  salesA = fixture.salesA;
  trainerB = fixture.trainerB;
  wsA = fixture.wsA.id;
  wsB = fixture.wsB.id;
});
afterAll(async () => db.end());

async function asActor<T>(actorId: string, body: (tx: Tx) => Promise<T>) {
  return db.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
    return body(tx);
  });
}

async function createGlobal(name: string) {
  return asActor(po.userId, async (tx) => {
    const [row] = await tx`select public.catalog_create_exercise(
      ${randomUUID()},
      ${tx.json({
        name_en: name,
        primary_muscle_code: 'chest',
        equipment_codes: ['barbell'],
      })}
    ) as result`;
    return row!.result.exercise_id as string;
  });
}

async function createPrivate(workspaceId: string, name: string) {
  return asActor(po.userId, async (tx) => {
    const [row] = await tx`select public.catalog_write_workspace_exercise(
      ${workspaceId}, null, null, ${randomUUID()},
      ${tx.json({
        name_en: name,
        primary_muscle_code: 'lats',
        equipment_codes: ['cable'],
      })}
    ) as result`;
    return row!.result.exercise_id as string;
  });
}

async function overrideName(exerciseId: string, nameEn: string) {
  await asActor(
    trainerA.userId,
    (tx) =>
      tx`select public.catalog_write_exercise_override(
      ${wsA}, ${exerciseId}, 0, ${randomUUID()},
      ${tx.json({ name_en: nameEn, name_ar: null })}
    )`,
  );
}

async function removeGlobal(exerciseId: string) {
  await asActor(
    po.userId,
    (tx) =>
      tx`select public.catalog_transition_exercise(
      ${exerciseId}, 0, 'remove', ${randomUUID()}
    )`,
  );
}

async function removePrivate(workspaceId: string, exerciseId: string) {
  await asActor(
    trainerA.userId,
    (tx) =>
      tx`select public.catalog_remove_workspace_exercise(
      ${workspaceId}, ${exerciseId}, 0, ${randomUUID()}
    )`,
  );
}

type LibraryRow = {
  result_id: string;
  result_workspace_id: string | null;
  result_payload: {
    effective_fields: {
      name: {
        value: { name_en: string; name_ar?: string | null };
        source: string;
      };
    };
  };
  result_kind: 'global' | 'private';
  result_cursor: string;
};

async function library(
  actorId: string,
  workspaceId: string,
  options: {
    query?: string;
    cursor?: string | null;
    pageSize?: number;
  } = {},
) {
  return asActor(
    actorId,
    (tx) => tx<LibraryRow[]>`
    select result_id, result_workspace_id, result_payload, result_kind,
      result_cursor
    from public.catalog_workspace_library(
      ${workspaceId},
      ${options.query ?? null},
      '{}'::jsonb,
      ${options.cursor ?? null},
      ${options.pageSize ?? 20}
    )
  `,
  );
}

function names(rows: LibraryRow[]) {
  return rows.map(
    (row) => row.result_payload.effective_fields.name.value.name_en,
  );
}

function cursorFor(row: LibraryRow) {
  const name =
    row.result_payload.effective_fields.name.value.name_en.toLowerCase();
  return Buffer.from(`${name}\x1f${row.result_id}`, 'utf8').toString('hex');
}

describe('T040 workspace library merged read', () => {
  it('returns globals with workspace overrides and private exercises in one A-Z list', async () => {
    const prefix = `T040 merge ${randomUUID().slice(0, 8)}`;
    const globalAlpha = await createGlobal(`${prefix} Alpha`);
    await createGlobal(`${prefix} charlie`);
    const privateBravo = await createPrivate(wsA, `${prefix} Bravo`);
    await createPrivate(wsA, `${prefix} delta`);
    const overridden = await createGlobal(`${prefix} Zulu`);
    await overrideName(overridden, `${prefix} aardvark`);

    const rows = await library(trainerA.userId, wsA, { query: prefix });
    expect(names(rows)).toEqual([
      `${prefix} aardvark`,
      `${prefix} Alpha`,
      `${prefix} Bravo`,
      `${prefix} charlie`,
      `${prefix} delta`,
    ]);
    expect(rows.map((row) => row.result_kind)).toEqual([
      'global',
      'global',
      'private',
      'global',
      'private',
    ]);

    const privateRow = rows.find((row) => row.result_id === privateBravo)!;
    expect(privateRow.result_workspace_id).toBe(wsA);
    expect(privateRow.result_payload.effective_fields.name).toMatchObject({
      value: { name_en: `${prefix} Bravo` },
      source: 'workspace_private',
    });
    const globalRow = rows.find((row) => row.result_id === globalAlpha)!;
    expect(globalRow.result_workspace_id).toBeNull();
    expect(globalRow.result_payload.effective_fields.name.source).toBe(
      'canonical',
    );
    expect(
      rows.find((row) => row.result_id === overridden)!.result_payload
        .effective_fields.name,
    ).toMatchObject({
      value: { name_en: `${prefix} aardvark` },
      source: 'override',
    });
  });

  it('breaks equal names by id ascending', async () => {
    const prefix = `T040 tie ${randomUUID().slice(0, 8)}`;
    const first = await createGlobal(`${prefix} same`);
    const second = await createPrivate(wsA, `${prefix} same`);
    const expected = [first, second].sort();

    const rows = await library(trainerA.userId, wsA, { query: prefix });
    expect(rows.map((row) => row.result_id)).toEqual(expected);
  });

  it('paginates across the global/private boundary with one cursor', async () => {
    const prefix = `T040 page ${randomUUID().slice(0, 8)}`;
    await createGlobal(`${prefix} Alpha`);
    await createPrivate(wsA, `${prefix} Bravo`);
    await createGlobal(`${prefix} charlie`);
    await createPrivate(wsA, `${prefix} delta`);
    await createGlobal(`${prefix} echo`);

    const first = await library(trainerA.userId, wsA, {
      query: prefix,
      pageSize: 2,
    });
    expect(names(first)).toEqual([`${prefix} Alpha`, `${prefix} Bravo`]);

    const second = await library(trainerA.userId, wsA, {
      query: prefix,
      pageSize: 2,
      cursor: first[1]!.result_cursor,
    });
    expect(names(second)).toEqual([`${prefix} charlie`, `${prefix} delta`]);

    const third = await library(trainerA.userId, wsA, {
      query: prefix,
      pageSize: 2,
      cursor: second[1]!.result_cursor,
    });
    expect(names(third)).toEqual([`${prefix} echo`]);
    expect(
      cursorFor(first[1]!),
      'opaque cursor encodes lower(name) and id',
    ).toBe(first[1]!.result_cursor);
  });

  it('excludes removed globals and removed private exercises', async () => {
    const prefix = `T040 removed ${randomUUID().slice(0, 8)}`;
    const removedGlobal = await createGlobal(`${prefix} Alpha`);
    const keptGlobal = await createGlobal(`${prefix} Bravo`);
    const removedPrivate = await createPrivate(wsA, `${prefix} charlie`);
    await createPrivate(wsA, `${prefix} delta`);
    await removeGlobal(removedGlobal);
    await removePrivate(wsA, removedPrivate);

    const rows = await library(trainerA.userId, wsA, { query: prefix });
    expect(names(rows)).toEqual([`${prefix} Bravo`, `${prefix} delta`]);
    expect(rows.map((row) => row.result_id)).not.toContain(removedGlobal);
    expect(rows.map((row) => row.result_id)).not.toContain(removedPrivate);
    expect(rows.map((row) => row.result_id)).toContain(keptGlobal);
  });

  it('never returns another workspace private exercise', async () => {
    const prefix = `T040 foreign ${randomUUID().slice(0, 8)}`;
    const foreignPrivate = await createPrivate(wsB, `${prefix} secret`);
    await createPrivate(wsA, `${prefix} visible`);

    const rows = await library(trainerA.userId, wsA, { query: prefix });
    expect(rows.map((row) => row.result_id)).toContain(
      rows.find((row) => row.result_kind === 'private')!.result_id,
    );
    expect(rows.map((row) => row.result_id)).not.toContain(foreignPrivate);
    expect(rows.every((row) => row.result_workspace_id !== wsB)).toBe(true);
  });

  it('denies foreign, Sales and anonymous callers with the generic error', async () => {
    const [empty] = await db`
      insert into public.workspaces(name, slug, created_by)
      values ('S48 empty library', ${`s48-empty-${randomUUID()}`}, ${po.userId})
      returning id
    `;
    const emptyWorkspaceId = empty!.id as string;
    // A foreign caller must be denied before any row-level helper runs, so an
    // empty workspace cannot be distinguished from a forbidden one.
    await expect(
      library(trainerB.userId, emptyWorkspaceId),
    ).rejects.toMatchObject({ code: '42501' });
    // A query that matches nothing must still be denied before any row-level
    // helper can run (otherwise the top-level membership check is untested).
    await expect(
      library(trainerB.userId, wsA, {
        query: `no-match-${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: '42501' });
    for (const actorId of [trainerB.userId, salesA.userId]) {
      await expect(library(actorId, wsA)).rejects.toMatchObject({
        code: '42501',
      });
    }
    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('role', 'authenticated', true)`;
        return tx`select * from public.catalog_workspace_library(${wsA})`;
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('rejects malformed cursors and page sizes', async () => {
    await expect(
      library(trainerA.userId, wsA, { cursor: 'not-hex' }),
    ).rejects.toMatchObject({ code: '22023' });
    await expect(
      library(trainerA.userId, wsA, { pageSize: 0 }),
    ).rejects.toMatchObject({ code: '22023' });
  });
});
