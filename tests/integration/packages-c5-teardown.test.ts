// T065 [FR-028, SC-019] C5 operator teardown script (supabase/cleanup/20261121_t065_c5_mock_package_teardown.sql).
// Not a migration: the tests execute the script text exactly as the operator does, as `postgres`,
// inside one transaction, with the same transaction-local settings psql would copy from its variables.
// Test plan: specs/009-packages/review.md section 8. S61-PO-2 (Q1=A, Q2=A, Q3=A).
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql, TransactionSql } from 'postgres';
import {
  checked,
  createLegacySynthetic,
  packagesFixture,
  publish,
  publishedFixture,
  sql,
  type PackagesFixture,
} from './packages-fixture';
import { bought } from './registration-approval-payment-fixture';
import { clientContext } from './client-accounts-fixture';
import { runPreflight } from './packages-c5-preflight-contract';

const db = sql();
const script = readFileSync(
  'supabase/cleanup/20261121_t065_c5_mock_package_teardown.sql',
  'utf8',
);
const CORE = script.split('-- ==== core ====')[1]!;
const DO_BLOCK = CORE.slice(CORE.indexOf('do $c5$'));
let f: PackagesFixture;

type Args = {
  pkgs: string[];
  ws: string[];
  runId?: string;
  database?: string;
};

async function settings(q: Sql | TransactionSql, a: Args) {
  const [row] = await q`select current_database() as db`;
  const current = row!.db as string;
  const set = (k: string, v: string) => q`select set_config(${k}, ${v}, true)`;
  await set('c5.package_ids', a.pkgs.join(','));
  await set('c5.workspace_ids', a.ws.join(','));
  await set('c5.run_id', a.runId ?? `c5-test-${randomUUID()}`);
  await set('c5.review_ref', 'T064b-test-record');
  await set('c5.expected_database', a.database ?? current);
}
async function runIn(tx: TransactionSql, a: Args, text: string = CORE) {
  await settings(tx, a);
  await tx.unsafe(text);
}
async function teardown(a: Args, text: string = CORE) {
  await db.begin((tx) => runIn(tx, a, text));
}
async function expectRefused(
  a: Args,
  code: string,
  prepare?: (tx: TransactionSql) => Promise<void>,
  text: string = CORE,
) {
  await expect(
    db.begin(async (tx) => {
      if (prepare) await prepare(tx);
      await runIn(tx, a, text);
    }),
  ).rejects.toThrow(new RegExp(`c5_refused:${code}`));
}

async function legacyMock(workspaces: string[] = [f.wsA.id]) {
  const mock = await createLegacySynthetic(f);
  checked(await publish(f, mock.id, { tier_rank: 1 }));
  for (const [i, ws] of workspaces.entries())
    if (ws !== f.wsA.id)
      await db`
        insert into public.package_offers(id,workspace_id,package_id,duration_days,duration_months,tier_rank)
        values (${randomUUID()},${ws},${mock.id},${900 + i},null,1)`;
  return mock;
}
async function counts(packageId: string) {
  const [r] = await db`
    select (select count(*) from public.packages where id=${packageId})::int as p,
           (select count(*) from public.package_offers where package_id=${packageId})::int as o,
           (select count(*) from public.package_versions v join public.package_offers o on o.id=v.offer_id
             where o.package_id=${packageId})::int as v`;
  return r as { p: number; o: number; v: number };
}
async function triggerStates() {
  const rows = await db`
    select c.relname||'.'||t.tgname as name, t.tgenabled as state
      from pg_trigger t join pg_class c on c.oid=t.tgrelid
     where c.relname in ('packages','package_offers','package_versions','audit_events') and not t.tgisinternal
     order by 1`;
  return rows.map((r) => `${r.name}:${r.state}`);
}

beforeAll(async () => {
  f = await packagesFixture();
});
afterAll(async () => {
  await db.end();
});

describe('T065 successful teardown of a verified synthetic mock', () => {
  it('deletes versions, offers and the package atomically; audit preserved; guards intact', async () => {
    const mock = await legacyMock();
    const before = await counts(mock.id);
    expect(before).toMatchObject({ p: 1, o: 1, v: 1 });
    const [auditBefore] = await db`
      select count(*)::int as n from public.audit_events where target_id=${mock.id} and target_table='packages'`;
    expect(auditBefore!.n).toBeGreaterThanOrEqual(1);
    const triggersBefore = await triggerStates();
    const runId = `c5-test-${randomUUID()}`;

    await teardown({ pkgs: [mock.id], ws: [f.wsA.id], runId });

    expect(await counts(mock.id)).toEqual({ p: 0, o: 0, v: 0 });
    // Audit rows naming the package stay untouched (Q1=A) and a teardown event was added.
    const [auditAfter] = await db`
      select count(*)::int as n from public.audit_events where target_id=${mock.id} and target_table='packages'`;
    expect(auditAfter!.n).toBe(auditBefore!.n + 1);
    const [event] = await db`
      select actor_user_id, action, target_table, workspace_id, details
        from public.audit_events where action='package.teardown_executed' and details->>'run_id'=${runId}`;
    expect(event).toMatchObject({
      actor_user_id: null,
      target_table: 'packages',
      workspace_id: null,
    });
    expect(Object.keys(event!.details as object).sort()).toEqual([
      'offer_count',
      'review_ref',
      'run_id',
      'version_count',
    ]);
    // Every guard is re-enabled and still rejects afterwards.
    expect(await triggerStates()).toEqual(triggersBefore);
    const other = await createLegacySynthetic(f);
    await expect(
      db`delete from public.packages where id=${other.id}`,
    ).rejects.toThrow();
    await expect(db`truncate public.packages`).rejects.toThrow();
    await expect(db`truncate public.package_offers`).rejects.toThrow();
    await expect(db`truncate public.package_versions`).rejects.toThrow();
    await expect(
      db`update public.audit_events set details='{}'::jsonb where action='package.teardown_executed'`,
    ).rejects.toThrow();
  });

  it('a childless synthetic mock (no offers) is also removed', async () => {
    const mock = await createLegacySynthetic(f);
    await teardown({ pkgs: [mock.id], ws: [] });
    expect((await counts(mock.id)).p).toBe(0);
  });

  it('a shared legacy package across workspaces needs every workspace verified; foreign rows untouched', async () => {
    const mock = await legacyMock([f.wsA.id, f.wsB.id]);
    const foreign = await publishedFixture(f, { tier_rank: 1 });
    const foreignBefore = await counts(foreign.id);
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id] },
      'workspace_not_verified_synthetic',
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 2, v: 1 });
    await teardown({ pkgs: [mock.id], ws: [f.wsA.id, f.wsB.id] });
    expect(await counts(mock.id)).toEqual({ p: 0, o: 0, v: 0 });
    expect(await counts(foreign.id)).toEqual(foreignBefore);
  });

  it('is not reachable from application roles and adds no function or grant', async () => {
    const fnCount = async () => {
      const [r] = await db`
        select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname in ('public','app_private')`;
      return r!.n as number;
    };
    const fnBefore = await fnCount();
    const mock = await legacyMock();
    await teardown({ pkgs: [mock.id], ws: [f.wsA.id] });
    expect(await fnCount()).toBe(fnBefore);
    const keep = await createLegacySynthetic(f);
    for (const client of [
      f.po.client,
      f.actors.woA.client,
      f.actors.salesA.client,
    ]) {
      const del = await client.from('packages').delete().eq('id', keep.id);
      expect(del.error).not.toBeNull();
    }
    expect((await counts(keep.id)).p).toBe(1);
    const [priv] = await db`
      select has_table_privilege('authenticated','public.packages','delete') as a,
             has_table_privilege('anon','public.packages','delete') as b,
             has_table_privilege('service_role','public.packages','delete') as c`;
    expect(priv).toEqual({ a: false, b: false, c: false });
  });
});

describe('T065 refusals write nothing', () => {
  it('refuses a non-synthetic package', async () => {
    const id = randomUUID();
    await db`insert into public.packages(id,code,created_by) values (${id},${'legacy-pkg-' + randomUUID()},${f.po.userId})`;
    await expectRefused({ pkgs: [id], ws: [] }, 'preflight_not_deletable');
    expect((await counts(id)).p).toBe(1);
  });

  it('refuses a real category (workspace_id set), even from a test- code', async () => {
    const p = await publishedFixture(f, { tier_rank: 1 });
    await expectRefused(
      { pkgs: [p.id], ws: [p.workspace_id] },
      'preflight_not_deletable',
    );
    expect(await counts(p.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });

  it('refuses a mock with an available offer', async () => {
    const mock = await legacyMock();
    const [offer] =
      await db`select id from public.package_offers where package_id=${mock.id}`;
    checked(
      await f.po.client.rpc('set_package_offer_available', {
        workspace_id: f.wsA.id,
        offer_id: offer!.id,
        available: true,
      }),
    );
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id] },
      'preflight_not_deletable',
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });

  it('refuses a package with real subscription and payment dependencies', async () => {
    const ctx = await clientContext();
    await bought(ctx);
    await expectRefused(
      { pkgs: [ctx.p.id], ws: [ctx.p.workspace_id] },
      'preflight_not_deletable',
    );
    const report = await runPreflight(db, [ctx.p.id]);
    expect(report.deletable).toBe(false);
    expect(report.refusals.map((r) => r.code)).toContain(
      'required_financial_dependency',
    );
  });

  it('enumerates the subscription_upgrades edges (offer and version FKs)', async () => {
    const mock = await createLegacySynthetic(f);
    const report = await runPreflight(db, [mock.id]);
    const edges = report.dependencies.map((d) => d.edge);
    expect(edges).toContain('public.subscription_upgrades.package_offer_id');
    expect(edges).toContain('public.subscription_upgrades.package_version_id');
  });

  it('refuses unknown dependency state: an unknown table and a jsonb reference', async () => {
    const mock = await legacyMock();
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id] },
      'preflight_not_deletable',
      async (tx) => {
        await tx.unsafe(
          'create table public.t065_unknown_ref (id uuid primary key default gen_random_uuid(), package_id uuid)',
        );
      },
    );
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id] },
      'preflight_not_deletable',
      async (tx) => {
        await tx.unsafe('create table public.t065_json_ref (d jsonb)');
        await tx.unsafe(
          `insert into public.t065_json_ref values (jsonb_build_object('v','${mock.id}'))`,
        );
      },
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });

  it('refuses empty, unknown and mismatching allow-lists', async () => {
    await expectRefused({ pkgs: [], ws: [] }, 'empty_allow_list');
    await expectRefused(
      { pkgs: [randomUUID()], ws: [] },
      'preflight_not_deletable',
    );
    const mock = await legacyMock();
    // A package changed after review (a package id that is not in the reviewed set) is not swept in.
    await expectRefused(
      { pkgs: [mock.id, randomUUID()], ws: [f.wsA.id] },
      'preflight_not_deletable',
    );
    expect((await counts(mock.id)).p).toBe(1);
  });

  it('refuses outside one transaction, on a stack identity mismatch', async () => {
    const mock = await legacyMock();
    const a = { pkgs: [mock.id], ws: [f.wsA.id] };
    // The settings die with their own transaction, so the DO block runs in a different one.
    await db.begin((tx) => settings(tx, a));
    await expect(db.unsafe(DO_BLOCK)).rejects.toThrow(
      /c5_refused:not_single_transaction/,
    );
    await expectRefused(
      { ...a, database: 'some_other_database' },
      'stack_identity_mismatch',
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1 });
  });
});

describe('T065 guard-state refusals', () => {
  it('refuses a pre-disabled guard trigger and never repairs it', async () => {
    const mock = await legacyMock();
    for (const [table, trigger] of [
      ['packages', 'packages_no_delete'],
      ['package_offers', 'package_offers_guard'],
      ['package_versions', 'package_versions_no_delete'],
      ['audit_events', 'audit_events_immutable'],
    ] as const)
      await expectRefused(
        { pkgs: [mock.id], ws: [f.wsA.id] },
        'trigger_set_or_state_unexpected',
        async (tx) => {
          await tx.unsafe(
            `alter table public.${table} disable trigger ${trigger}`,
          );
        },
      );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
    expect((await triggerStates()).every((s) => s.endsWith(':O'))).toBe(true);
  });

  it('refuses session_replication_role = replica', async () => {
    const mock = await legacyMock();
    const canSetReplica = await db.begin(async (tx) => {
      try {
        await tx.unsafe(`set local session_replication_role = 'replica'`);
        return true;
      } catch {
        return false;
      }
    });
    // If the owner cannot even set it on this stack, the state is unreachable and the script
    // would find 'origin'; the assertion below only applies when replica can be set.
    if (canSetReplica)
      await expectRefused(
        { pkgs: [mock.id], ws: [f.wsA.id] },
        'replication_role_not_origin',
        async (tx) => {
          await tx.unsafe(`set local session_replication_role = 'replica'`);
        },
      );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });
});

describe('T065 mutation checks on the script controls', () => {
  it('the offer guard must be re-enabled before the first DELETE (control 7)', async () => {
    const mock = await legacyMock();
    const needle =
      'alter table public.package_offers enable trigger package_offers_guard;';
    expect(CORE.split(needle)).toHaveLength(2);
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id] },
      'offer_guard_not_reenabled',
      undefined,
      CORE.replace(needle, 'null;'),
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });

  it('a failure after the deletes rolls everything back and leaves every guard enabled', async () => {
    const mock = await legacyMock();
    const triggersBefore = await triggerStates();
    const needle = 'if hash_after is distinct from hash_before then';
    expect(CORE.split(needle)).toHaveLength(2);
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id] },
      'guard_function_changed',
      undefined,
      CORE.replace(needle, 'if true then'),
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
    expect(await triggerStates()).toEqual(triggersBefore);
  });

  it('the set-equality delete checks fire (control 8)', async () => {
    const mock = await legacyMock();
    const needle = 'if v_ids is distinct from v_pkgs then';
    expect(CORE.split(needle)).toHaveLength(2);
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id] },
      'package_delete_set_mismatch',
      undefined,
      CORE.replace(needle, 'if true then'),
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });
});
