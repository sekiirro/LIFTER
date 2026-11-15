import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { loadEnv, sql, twoWorkspaceFixture } from './harness';

const db = sql();
const concurrencyDb = postgres(loadEnv().dbUrl, { max: 4 });
type Tx = postgres.TransactionSql;
let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;

beforeAll(async () => {
  f = await twoWorkspaceFixture();
});
afterAll(async () => {
  await Promise.all([db.end(), concurrencyDb.end()]);
});

async function asActor<T>(tx: Tx, id: string, body: () => Promise<T>) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id, role: 'authenticated' })}, true)`;
  return body();
}

const doc = (id: string) => ({
  schemaVersion: 1,
  structure: 'single_day',
  implicitDayTypeId: id,
  dayTypes: [
    { id, name: { ar: 'يوم', en: 'Day' }, trainingDay: true, targets: null },
  ],
  meals: [],
  title: { ar: 'خطة', en: 'Plan' },
  notes: null,
});

async function global(tx: Tx, actor: string, suffix: string) {
  const rows = await asActor(
    tx,
    actor,
    () => tx`select public.create_nutrition_global_template(
    ${tx.json(doc(`day-${suffix}`))}, 1, ${randomUUID()}) result`,
  );
  return (rows[0]!.result as { template_id: string }).template_id;
}

describe('F18 T014 nutrition template assignment', () => {
  it('honors All Except and refuses an empty resolved template set', async () => {
    const marker = 'rollback_t014_modes';
    try {
      await db.begin(async (tx) => {
        const excluded = await global(tx, f.po.userId, 'excluded');
        const included = await global(tx, f.po.userId, 'included');
        const result = await asActor(
          tx,
          f.po.userId,
          () => tx`
          select public.assign_nutrition_templates('all_except', null, ${[excluded]}::uuid[], 'specific',
            ${[f.wsB.id]}::uuid[], ${randomUUID()}) result`,
        );
        const assigned = result[0]?.result as {
          assigned_count: number;
          items: { global_template_id: string }[];
        };
        expect(assigned.assigned_count).toBeGreaterThan(0);
        expect(
          assigned.items.some((item) => item.global_template_id === excluded),
        ).toBe(false);
        expect(
          assigned.items.some((item) => item.global_template_id === included),
        ).toBe(true);
        const active =
          await tx`select array_agg(id) ids from public.nutrition_global_templates where status='active'`;
        await expect(
          tx.savepoint((sp) =>
            asActor(
              sp,
              f.po.userId,
              () => sp`select public.assign_nutrition_templates('all_except', null, ${active[0]!.ids as string[]}::uuid[], 'specific',
                ${[f.wsB.id]}::uuid[], ${randomUUID()})`,
            ),
          ),
        ).rejects.toMatchObject({ code: '22023' });
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });

  it('rejects retired Specific targets and omits retired templates from All', async () => {
    const marker = 'rollback_t014_retired_template';
    try {
      await db.begin(async (tx) => {
        const retiredId = await global(tx, f.po.userId, 'retired');
        await asActor(
          tx,
          f.po.userId,
          () => tx`select public.retire_nutrition_global_template(
          ${retiredId}, 1, ${randomUUID()})`,
        );
        const activeId = await global(tx, f.po.userId, 'active');
        await expect(
          tx.savepoint((sp) =>
            asActor(
              sp,
              f.po.userId,
              () => sp`select public.assign_nutrition_templates('specific', ${[retiredId]}::uuid[], null, 'specific',
                ${[f.wsB.id]}::uuid[], ${randomUUID()})`,
            ),
          ),
        ).rejects.toMatchObject({ code: '22023' });
        const all = await asActor(
          tx,
          f.po.userId,
          () => tx`
          select public.assign_nutrition_templates('all', null, null, 'specific',
            ${[f.wsB.id]}::uuid[], ${randomUUID()}) result`,
        );
        const items = (
          all[0]?.result as { items: { global_template_id: string }[] }
        ).items;
        expect(
          items.some((item) => item.global_template_id === retiredId),
        ).toBe(false);
        expect(items.some((item) => item.global_template_id === activeId)).toBe(
          true,
        );
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });

  it('does not include a workspace created after All, including on exact-key replay', async () => {
    const marker = 'rollback_t014_future_workspace';
    try {
      await db.begin(async (tx) => {
        const templateId = await global(tx, f.po.userId, 'future');
        const key = randomUUID();
        const first = await asActor(
          tx,
          f.po.userId,
          () => tx`
          select public.assign_nutrition_templates('specific', ${[templateId]}::uuid[], null, 'all', null, ${key}) result`,
        );
        await tx`select set_config('role', 'none', true)`;
        const created = await tx`
          insert into public.workspaces(name,slug,created_by)
          values('F18 post-operation workspace',${`f18-post-${randomUUID().slice(0, 8)}`},${f.po.userId})
          returning id`;
        const futureId = created[0]!.id as string;
        const replay = await asActor(
          tx,
          f.po.userId,
          () => tx`
          select public.assign_nutrition_templates('specific', ${[templateId]}::uuid[], null, 'all', null, ${key}) result`,
        );
        expect(replay[0]?.result).toEqual(first[0]?.result);
        const laterItems =
          await tx`select * from public.nutrition_template_assignment_items
          where workspace_id=${futureId}`;
        expect(laterItems).toEqual([]);
        await asActor(
          tx,
          f.po.userId,
          () => tx`
          select public.assign_nutrition_templates('specific', ${[templateId]}::uuid[], null, 'all', null, ${randomUUID()})`,
        );
        const laterOperation =
          await tx`select outcome from public.nutrition_template_assignment_items
          where workspace_id=${futureId}`;
        expect(laterOperation).toEqual([{ outcome: 'assigned' }]);
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });

  it('rechecks a template retired after set resolution and skips it in the batch', async () => {
    const retiredId = await db.begin((tx) =>
      global(tx, f.po.userId, 'retire-after-resolution'),
    );
    const activeId = await db.begin((tx) =>
      global(tx, f.po.userId, 'active-after-resolution'),
    );
    let assignPromise: ReturnType<typeof concurrencyDb.begin> | undefined;
    await concurrencyDb.begin(async (lockTx) => {
      await lockTx`select id from public.nutrition_global_templates
        where id=${retiredId} for update`;
      assignPromise = concurrencyDb.begin((tx) =>
        asActor(
          tx,
          f.po.userId,
          () => tx`select public.assign_nutrition_templates(
            'specific', ${[retiredId, activeId]}::uuid[], null, 'specific',
            ${[f.wsA.id]}::uuid[], ${randomUUID()}) result`,
        ),
      );
      const deadline = Date.now() + 5_000;
      let waiting = false;
      while (Date.now() < deadline && !waiting) {
        const [activity] = await concurrencyDb`
          select count(*)::int count from pg_catalog.pg_stat_activity
          where wait_event_type='Lock' and query ilike '%assign_nutrition_templates%'`;
        waiting = Number(activity?.count ?? 0) > 0;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await asActor(
        lockTx,
        f.po.userId,
        () => lockTx`select public.retire_nutrition_global_template(
          ${retiredId}, 1, ${randomUUID()})`,
      );
    });
    const assigned = (await assignPromise!) as { result: unknown }[];
    const result = assigned[0]?.result as {
      assigned_count: number;
      items: { global_template_id: string; outcome: string }[];
    };
    expect(result.assigned_count).toBe(1);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          global_template_id: retiredId,
          outcome: 'skipped_ineligible',
        }),
        expect.objectContaining({
          global_template_id: activeId,
          outcome: 'assigned',
        }),
      ]),
    );
  });

  it('serializes exact-key concurrent retries and rejects a distinct zero-copy operation', async () => {
    for (const table of [
      'nutrition_template_assignment_batches',
      'nutrition_template_assignment_items',
    ]) {
      const [rls] = await db`
        select relrowsecurity, relforcerowsecurity from pg_catalog.pg_class
        where oid=${`public.${table}`}::regclass`;
      expect(rls).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
      const [readGrant] = await db`
        select has_table_privilege('authenticated',${`public.${table}`},'SELECT') allowed`;
      expect(readGrant?.allowed).toBe(true);
      const [writeGrant] = await db`
        select has_table_privilege('authenticated',${`public.${table}`},'INSERT') allowed`;
      expect(writeGrant?.allowed).toBe(false);
    }
    const templateId = await db.begin((tx) => global(tx, f.po.userId, 'race'));
    const key = randomUUID();
    const invoke = (operationKey: string) =>
      concurrencyDb.begin((tx) =>
        asActor(
          tx,
          f.po.userId,
          () => tx`
      select public.assign_nutrition_templates('specific', ${[templateId]}::uuid[], null, 'specific',
        ${[f.wsA.id]}::uuid[], ${operationKey}::uuid) result`,
        ),
      );
    const parallel = await Promise.all([invoke(key), invoke(key)]);
    expect(parallel[0]?.[0]?.result).toEqual(parallel[1]?.[0]?.result);
    const replay = await invoke(key);
    expect(replay[0]?.result).toEqual(parallel[0]?.[0]?.result);
    await expect(
      concurrencyDb.begin((tx) =>
        asActor(
          tx,
          f.po.userId,
          () => tx`
          select public.assign_nutrition_templates('specific', ${[templateId]}::uuid[], null, 'specific',
            ${[f.wsB.id]}::uuid[], ${key}::uuid)`,
        ),
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(invoke(randomUUID())).rejects.toMatchObject({ code: '22023' });
    const rows =
      await db`select count(*)::int n from public.nutrition_template_assignment_items
      where workspace_id=${f.wsA.id} and global_template_id=${templateId}`;
    expect(rows[0]?.n).toBe(1);
    const hidden = await db.begin((tx) =>
      asActor(
        tx,
        f.trainerA.userId,
        () => tx`select * from public.nutrition_template_assignment_items
          where workspace_id=${f.wsA.id}`,
      ),
    );
    expect(hidden).toEqual([]);
    await expect(
      concurrencyDb.begin((tx) =>
        asActor(
          tx,
          f.trainerA.userId,
          () => tx`insert into public.nutrition_template_assignment_batches
            (template_selection_mode,workspace_selection_mode,operation_receipt_id,created_by,assigned_count,skipped_count)
            values('all','all',${randomUUID()},${f.trainerA.userId},1,0)`,
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });

    const racedTemplate = await db.begin((tx) =>
      global(tx, f.po.userId, 'single-race'),
    );
    const race = (operationKey: string) =>
      concurrencyDb.begin((tx) =>
        asActor(
          tx,
          f.po.userId,
          () => tx`
      select public.assign_nutrition_templates('specific', ${[racedTemplate]}::uuid[], null, 'specific',
        ${[f.wsA.id]}::uuid[], ${operationKey}::uuid) result`,
        ),
      );
    const contenders = await Promise.allSettled([
      race(randomUUID()),
      race(randomUUID()),
    ]);
    expect(contenders.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(contenders.filter((x) => x.status === 'rejected')).toHaveLength(1);
    const loser = contenders.find((x) => x.status === 'rejected');
    expect(loser?.status === 'rejected' ? loser.reason : null).toMatchObject({
      code: '22023',
    });
    const racedRows =
      await db`select count(*)::int n from public.nutrition_template_assignment_items
      where workspace_id=${f.wsA.id} and global_template_id=${racedTemplate}`;
    expect(racedRows[0]?.n).toBe(1);
  });

  it('keeps All away from partial workspaces and reports held copies without overwriting them', async () => {
    const marker = 'rollback_t014';
    try {
      await db.begin(async (tx) => {
        const first = await global(tx, f.po.userId, 'a');
        const second = await global(tx, f.po.userId, 'b');
        const initial = await asActor(
          tx,
          f.po.userId,
          () => tx`select public.assign_nutrition_templates(
          'specific', ${[first]}::uuid[], null, 'specific', ${[f.wsA.id]}::uuid[], ${randomUUID()}) result`,
        );
        expect(initial[0]?.result).toMatchObject({ assigned_count: 1 });
        await tx`select set_config('role', 'none', true)`;
        const firstCopy =
          await tx`select id from public.nutrition_workspace_templates
          where workspace_id=${f.wsA.id} and origin_global_template_id=${first}`;
        const initialDisplayName =
          await tx`select display_name from public.nutrition_workspace_templates
          where workspace_id=${f.wsA.id} and id=${firstCopy[0]!.id as string}`;
        expect(initialDisplayName[0]?.display_name).toBe(
          `${f.wsA.name} — Plan`,
        );
        await asActor(
          tx,
          f.po.userId,
          () => tx`select public.version_nutrition_workspace_template(
          ${f.wsA.id}, ${firstCopy[0]!.id as string}, 1, 'customized', ${tx.json(doc('customized'))}, 1, ${randomUUID()})`,
        );
        await asActor(
          tx,
          f.po.userId,
          () => tx`select public.retire_nutrition_workspace_template(
          ${f.wsA.id}, ${firstCopy[0]!.id as string}, 2, ${randomUUID()})`,
        );

        const all = await asActor(
          tx,
          f.po.userId,
          () => tx`select public.assign_nutrition_templates(
          'all', null, null, 'all', null, ${randomUUID()}) result`,
        );
        const allResult = all[0]?.result as {
          assigned_count: number;
          items: { workspace_id: string; global_template_id: string }[];
        };
        expect(allResult.items.some((i) => i.workspace_id === f.wsA.id)).toBe(
          false,
        );
        expect(
          allResult.items.some(
            (i) =>
              i.workspace_id === f.wsB.id && i.global_template_id === second,
          ),
        ).toBe(true);

        const assignedThird = await global(tx, f.po.userId, 'c');
        const report = await asActor(
          tx,
          f.po.userId,
          () => tx`select public.assign_nutrition_templates(
          'specific', ${[first, assignedThird]}::uuid[], null, 'specific', ${[f.wsA.id]}::uuid[], ${randomUUID()}) result`,
        );
        const reportResult = report[0]?.result as {
          items: { global_template_id: string; outcome: string }[];
        };
        expect(reportResult.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              global_template_id: first,
              outcome: 'skipped_existing',
            }),
            expect.objectContaining({
              global_template_id: assignedThird,
              outcome: 'assigned',
            }),
          ]),
        );
        await tx`select set_config('role', 'none', true)`;
        const copyAfter =
          await tx`select display_name from public.nutrition_workspace_templates
          where workspace_id=${f.wsA.id} and origin_global_template_id=${first}`;
        expect(copyAfter[0]?.display_name).toBe('customized');

        await expect(
          tx.savepoint((sp) =>
            asActor(
              sp,
              f.trainerA.userId,
              () => sp`select public.assign_nutrition_templates(
          'specific', ${[first]}::uuid[], null, 'specific', ${[f.wsA.id]}::uuid[], ${randomUUID()})`,
            ),
          ),
        ).rejects.toMatchObject({ code: '42501' });
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });
});
