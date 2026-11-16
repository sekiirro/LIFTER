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
// True where the owner may set session_replication_role (used to build dependents without FK checks).
const replicaOk = await db.begin(async (tx) => {
  try {
    await tx.unsafe("set local session_replication_role = 'replica'");
    return true;
  } catch {
    return false;
  }
});

type Args = {
  pkgs: string[];
  ws: string[];
  runId?: string;
  stackId?: string;
};

// Cluster-unique stack identity, the same value an operator records (control 1).
async function stackIdentity(q: Sql | TransactionSql) {
  try {
    const [r] =
      await q`select system_identifier::text as id from pg_control_system()`;
    return r!.id as string;
  } catch {
    const [r] = await q`select current_setting('lifter.stack_id', true) as id`;
    return r!.id as string;
  }
}
let runCounter = 0;
function newRun() {
  runCounter += 1;
  return `c5-20261116-${Date.now()}${runCounter}`;
}
// Replace exactly one occurrence of a script fragment (mutation checks).
function mutate(needle: string, replacement: string, text: string = CORE) {
  const parts = text.split(needle);
  if (parts.length !== 2)
    throw new Error(`mutation needle not unique: ${needle}`);
  return parts.join(replacement);
}

async function settings(q: Sql | TransactionSql, a: Args) {
  const stack = await stackIdentity(q);
  const set = (k: string, v: string) => q`select set_config(${k}, ${v}, true)`;
  await set('c5.package_ids', a.pkgs.join(','));
  await set('c5.workspace_ids', a.ws.join(','));
  await set('c5.run_id', a.runId ?? newRun());
  await set('c5.review_ref', 'T064b-test-record');
  await set('c5.expected_stack_id', a.stackId ?? stack);
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
      throw new Error('rollback: the script unexpectedly succeeded');
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
    const runId = newRun();

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
    await expectRefused({ ...a, stackId: '1' }, 'stack_identity_mismatch');
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

  it.skipIf(!replicaOk)(
    'refuses session_replication_role = replica (real setting; runs only where the owner can set it)',
    async () => {
      const mock = await legacyMock();
      await expectRefused(
        { pkgs: [mock.id], ws: [f.wsA.id] },
        'replication_role_not_origin',
        async (tx) => {
          await tx.unsafe(`set local session_replication_role = 'replica'`);
        },
      );
      expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
    },
  );

  it('the replica refusal branch is reachable (mutation: pretend the setting is replica)', async () => {
    const mock = await legacyMock();
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id] },
      'replication_role_not_origin',
      undefined,
      mutate(
        "current_setting('session_replication_role') <> 'origin'",
        "'replica' <> 'origin'",
      ),
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

describe('T065 additional refusal branches', () => {
  const cases: [string, string, (tx: TransactionSql) => Promise<void>][] = [
    [
      'not_database_owner',
      'a non-owner role',
      async (tx) => {
        await tx.unsafe('set local role authenticated');
      },
    ],
    [
      'unvalidated_fk',
      'an unvalidated FK onto packages',
      async (tx) => {
        await tx.unsafe('create table public.t065_nv (pid uuid)');
        await tx.unsafe(
          'alter table public.t065_nv add constraint t065_nv_fk foreign key (pid) references public.packages(id) not valid',
        );
      },
    ],
    [
      'fk_not_restrictive',
      'a CASCADE FK onto packages',
      async (tx) => {
        await tx.unsafe(
          'create table public.t065_cascade (pid uuid references public.packages(id) on delete cascade)',
        );
      },
    ],
    [
      'rewrite_rule_present',
      'a rewrite rule on a protected table',
      async (tx) => {
        await tx.unsafe(
          'create rule t065_rule as on update to public.package_versions do instead nothing',
        );
      },
    ],
    [
      'trigger_set_or_state_unexpected',
      'an extra trigger on packages',
      async (tx) => {
        await tx.unsafe(
          'create trigger t065_extra before update on public.packages for each row execute function pg_catalog.suppress_redundant_updates_trigger()',
        );
      },
    ],
  ];
  it.each(cases)('refuses %s (%s)', async (code, _label, prepare) => {
    const mock = await legacyMock();
    await expectRefused({ pkgs: [mock.id], ws: [f.wsA.id] }, code, prepare);
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });

  it('refuses a missing or malformed run id', async () => {
    const mock = await legacyMock();
    const a = { pkgs: [mock.id], ws: [f.wsA.id] };
    await expectRefused({ ...a, runId: '' }, 'missing_run_or_review_reference');
    await expectRefused(
      { ...a, runId: 'run-1' },
      'invalid_run_or_review_reference',
    );
    await expectRefused(
      { ...a, runId: 'c5-20261116-' + '9'.repeat(40) },
      'invalid_run_or_review_reference',
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1 });
  });

  it('refuses an unpinned search_path and unset timeouts', async () => {
    const mock = await legacyMock();
    const a = { pkgs: [mock.id], ws: [f.wsA.id] };
    await expectRefused(
      a,
      'search_path_not_pinned',
      undefined,
      mutate(
        'set local search_path = pg_catalog;',
        'set local search_path = pg_catalog, public;',
      ),
    );
    await expectRefused(
      a,
      'timeouts_not_set',
      undefined,
      mutate(
        "set local statement_timeout = '120s';",
        'set local statement_timeout = 0;',
      ),
    );
  });

  it('requires the operator workspace list to equal the preflight workspaces exactly', async () => {
    const mock = await legacyMock();
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id, f.wsB.id] },
      'workspace_list_mismatch',
    );
  });
});

describe('T065 dependent-category refusals (nothing is written)', () => {
  const LINK_ID = '7f000000-0000-4000-8000-000000000001';
  type Ids = { ws: string; offer: string; ver: string };
  async function idsOf(mockId: string) {
    const [r] = await db`
      select o.workspace_id as ws, o.id as offer, o.current_version_id as ver
        from public.package_offers o where o.package_id=${mockId} limit 1`;
    return r as unknown as Ids;
  }
  const insertLink = async (tx: TransactionSql, x: Ids) => {
    // Same technique as registration-links-fixture: the insert guard needs a signed-in user.
    await tx`alter table public.registration_links disable trigger registration_links_insert_guard`;
    await tx`insert into public.registration_links(id,workspace_id,package_version_id,token_hash,created_by,created_at,expires_at,price_minor,currency,duration_days,commission_rate_bp)
      values (${LINK_ID},${x.ws},${x.ver},repeat('a',64),${f.po.userId},timestamptz '2026-01-01 00:00:00+00',timestamptz '2026-01-02 00:00:00+00',100,'USD',61,10)`;
  };
  async function refusesWith(
    edge: string,
    kind: string,
    build: (tx: TransactionSql, x: Ids) => Promise<void>,
    replica: boolean,
  ) {
    const mock = await legacyMock();
    const x = await idsOf(mock.id);
    await expect(
      db.begin(async (tx) => {
        if (replica)
          await tx.unsafe("set local session_replication_role = 'replica'");
        await build(tx, x);
        if (replica)
          await tx.unsafe("set local session_replication_role = 'origin'");
        const report = await runPreflight(tx, [mock.id]);
        expect(report.deletable).toBe(false);
        const dep = report.dependencies.find((d) => d.edge === edge);
        expect(dep?.kind).toBe(kind);
        expect(dep?.count).toBeGreaterThan(0);
        expect(report.refusals.map((r) => r.code)).toContain(
          'required_financial_dependency',
        );
        await runIn(tx, { pkgs: [mock.id], ws: [f.wsA.id] });
        throw new Error('rollback: the script unexpectedly succeeded');
      }),
    ).rejects.toThrow(/c5_refused:preflight_not_deletable/);
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  }

  it('a registration link refuses', async () => {
    await refusesWith(
      'public.registration_links.package_version_id',
      'registration_link',
      async (tx, x) => {
        await insertLink(tx, x);
      },
      false,
    );
  });

  it('a financial audit row on a dependent refuses with required_audit_dependency', async () => {
    const mock = await legacyMock();
    const x = await idsOf(mock.id);
    await expect(
      db.begin(async (tx) => {
        await insertLink(tx, x);
        await tx`insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
          values (${f.po.userId},'registration_link.test_fixture','registration_links',${LINK_ID},${x.ws},'{}'::jsonb)`;
        const report = await runPreflight(tx, [mock.id]);
        expect(report.refusals.map((r) => r.code)).toEqual(
          expect.arrayContaining([
            'required_financial_dependency',
            'required_audit_dependency',
          ]),
        );
        await runIn(tx, { pkgs: [mock.id], ws: [f.wsA.id] });
        throw new Error('rollback: the script unexpectedly succeeded');
      }),
    ).rejects.toThrow(/c5_refused:preflight_not_deletable/);
  });

  const replicaCases: [string, string, string, string][] = [
    [
      'a client',
      'public.clients.package_version_id',
      'client',
      `insert into public.clients(workspace_id,auth_user_id,registration_link_id,package_version_id,email_normalized,phone_e164,name)
         values ('@ws',gen_random_uuid(),gen_random_uuid(),'@ver','t065@example.test','+15550100065','Test Client')`,
    ],
    [
      'a subscription',
      'public.subscriptions.package_version_id',
      'subscription',
      `insert into public.subscriptions(workspace_id,client_id,package_version_id,price_minor,currency,commission_rate_bp,duration_days,created_by,registration_link_id)
         values ('@ws',gen_random_uuid(),'@ver',100,'USD',10,61,'@po',gen_random_uuid())`,
    ],
    [
      'a renewal',
      'public.subscription_renewals.package_offer_id',
      'subscription',
      `insert into public.subscription_renewals(workspace_id,client_id,predecessor_subscription_id,subscription_id,package_offer_id,package_version_id,expected_revision,recording_date,service_start_date,service_end_exclusive,recorded_by)
         values ('@ws',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'@offer','@ver',0,date '2026-01-01',date '2026-01-01',date '2026-03-01','@po')`,
    ],
    [
      'a subscription upgrade',
      'public.subscription_upgrades.package_version_id',
      'subscription',
      `insert into public.subscription_upgrades(id,workspace_id,client_id,subscription_id,operation_id,package_offer_id,package_version_id,tier_rank,package_price_minor,currency,commission_rate_bp,duration_days,credit_minor,additional_payment_minor,commission_minor,expected_revision,recorded_by,recorded_at)
         values (gen_random_uuid(),'@ws',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'@offer','@ver',2,100,'USD',10,61,0,100,10,0,'@po',now())`,
    ],
  ];
  // These rows are built with FK checks and triggers off (replica role) and the role is restored to
  // origin before the script runs; the whole transaction rolls back. Skipped, visibly, where the owner
  // cannot set the replication role.
  it.skipIf(!replicaOk).each(replicaCases)(
    '%s refuses',
    async (_label, edge, kind, insert) => {
      await refusesWith(
        edge,
        kind,
        async (tx, x) => {
          await tx.unsafe(
            insert
              .replaceAll('@ws', x.ws)
              .replaceAll('@ver', x.ver)
              .replaceAll('@offer', x.offer)
              .replaceAll('@po', f.po.userId),
          );
        },
        true,
      );
    },
  );
});

describe('T065 lock and concurrency (control 6)', () => {
  async function holdScript(
    a: Args,
    text: string,
    during: () => Promise<void>,
  ) {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const ready = new Promise<void>((r) => (entered = r));
    const run = db.begin(async (tx) => {
      await runIn(tx, a, text);
      entered();
      await gate; // the lock is held until the transaction ends
    });
    try {
      await ready;
      await during();
    } finally {
      release();
      await run;
    }
  }
  // A dependent insert (registration link -> version FK) takes only ROW SHARE on the package tables.
  // The script's trigger DDL (SHARE ROW EXCLUSIVE) does not conflict with that; only the
  // EXCLUSIVE table lock does, which is exactly what this test isolates.
  // The transaction ALWAYS rolls back (the trigger DDL and the row never become visible to other
  // files); the return value says whether the insert got through before the rollback.
  class InsertedThenRollback extends Error {}
  const insertDependent = async (conn: Sql, mockId: string) => {
    const [x] = await conn`
      select o.workspace_id as ws, o.current_version_id as ver
        from public.package_offers o where o.package_id=${mockId} limit 1`;
    return conn
      .begin(async (tx) => {
        await tx.unsafe("set local lock_timeout = '700ms'");
        await tx`alter table public.registration_links disable trigger registration_links_insert_guard`;
        await tx`insert into public.registration_links(workspace_id,package_version_id,token_hash,created_by,created_at,expires_at,price_minor,currency,duration_days,commission_rate_bp)
        values (${x!.ws},${x!.ver},md5(random()::text)||md5(random()::text),${f.po.userId},timestamptz '2026-01-01 00:00:00+00',timestamptz '2026-01-02 00:00:00+00',100,'USD',61,10)`;
        throw new InsertedThenRollback('rollback');
      })
      .then(() => false)
      .catch((e: unknown) => {
        if (e instanceof InsertedThenRollback) return true;
        throw e;
      });
  };

  it('a dependent insert for the target blocks while the script holds the lock', async () => {
    const mock = await legacyMock();
    const other = await legacyMock();
    const conn = sql();
    try {
      await holdScript({ pkgs: [mock.id], ws: [f.wsA.id] }, CORE, async () => {
        // Deterministic proof, independent of any insert: while the script is paused after its work,
        // another session sees EXCLUSIVE locks held on all three package tables.
        const held = await conn`
          select c.relname::text as rel from pg_locks l join pg_class c on c.oid = l.relation
           where l.granted and l.mode = 'ExclusiveLock' and l.pid <> pg_backend_pid()
             and c.relname in ('packages','package_offers','package_versions')
           order by 1`;
        expect(held.map((r) => r.rel as string).sort()).toEqual(
          ['package_offers', 'package_versions', 'packages'].sort(),
        );
        await expect(insertDependent(conn, mock.id)).rejects.toThrow(
          /lock timeout|55P03/,
        );
        // A dependent of a NON-target package also queues behind the EXCLUSIVE lock.
        await expect(insertDependent(conn, other.id)).rejects.toThrow(
          /lock timeout|55P03/,
        );
      });
    } finally {
      await conn.end();
    }
    expect((await counts(mock.id)).p).toBe(0);
    expect((await counts(other.id)).p).toBe(1);
  });

  it('mutation: without the LOCK statement a concurrent dependent insert is not blocked', async () => {
    const mock = await legacyMock();
    const other = await legacyMock();
    const conn = sql();
    const needle =
      'lock table public.packages, public.package_offers, public.package_versions in exclusive mode;';
    try {
      await holdScript(
        { pkgs: [mock.id], ws: [f.wsA.id] },
        mutate(needle, 'null;'),
        async () => {
          expect(await insertDependent(conn, other.id)).toBe(true);
        },
      );
    } finally {
      await conn.end();
    }
  });
});

describe('T065 mutation checks on scoping and post-conditions', () => {
  it('delete scoping mutants are rejected and leave every non-target row untouched', async () => {
    const mock = await legacyMock();
    const other = await legacyMock();
    const a = { pkgs: [mock.id], ws: [f.wsA.id] };
    const mutants = [
      mutate(
        'where v.workspace_id = c.workspace_id and v.id = c.id',
        'where v.workspace_id = c.workspace_id',
      ),
      mutate(
        'where o.workspace_id = c.workspace_id and o.id = c.id\n    returning o.id)\n  select count(*) into m from d;\n  alter table public.package_offers enable trigger package_offers_no_delete;'.replaceAll(
          '\\n',
          '\n',
        ),
        'where o.workspace_id = c.workspace_id\n    returning o.id)\n  select count(*) into m from d;\n  alter table public.package_offers enable trigger package_offers_no_delete;'.replaceAll(
          '\\n',
          '\n',
        ),
      ),
      mutate(
        'where p.id = any(v_pkgs) and p.workspace_id is null',
        'where p.id = any(v_pkgs) or p.workspace_id is null',
      ),
    ];
    for (const text of mutants) {
      await expect(teardown(a, text)).rejects.toThrow();
      expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
      expect(await counts(other.id)).toMatchObject({ p: 1, o: 1, v: 1 });
    }
  });

  it('non_target_rows_changed fires when a non-target package disappears', async () => {
    const mock = await legacyMock();
    const other = await createLegacySynthetic(f);
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id] },
      'non_target_rows_changed',
      undefined,
      mutate(
        '  -- Control 9 (finding 10)',
        `  alter table public.packages disable trigger packages_no_delete;
  delete from public.packages where id = '${other.id}';
  alter table public.packages enable trigger packages_no_delete;
  -- Control 9 (finding 10)`,
      ),
    );
    expect((await counts(other.id)).p).toBe(1);
    expect((await counts(mock.id)).p).toBe(1);
  });

  it('targets_remain fires when a target row reappears', async () => {
    const mock = await legacyMock();
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id] },
      'targets_remain',
      undefined,
      mutate(
        '  -- Control 10: post-conditions',
        `  insert into public.packages(id, code, created_by)
    select v_pkgs[1], 'test-pkg-reappeared', s.user_id from public.staff_profiles s limit 1;
  -- Control 10: post-conditions`,
      ),
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });

  it('teardown_event_count_mismatch fires when an audit event is missing', async () => {
    const mock = await legacyMock();
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id] },
      'teardown_event_count_mismatch',
      undefined,
      mutate(
        'from pg_temp.c5_counts c;',
        'from pg_temp.c5_counts c where false;',
      ),
    );
    expect((await counts(mock.id)).p).toBe(1);
  });

  it('the current-version update is verified (count and other columns)', async () => {
    const mock = await legacyMock();
    const a = { pkgs: [mock.id], ws: [f.wsA.id] };
    await expectRefused(
      a,
      'current_version_update_count_mismatch',
      undefined,
      mutate(
        'and o.current_version_id is not null\n      returning o.id)'.replaceAll(
          '\\n',
          '\n',
        ),
        'and o.current_version_id is not null and false\n      returning o.id)'.replaceAll(
          '\\n',
          '\n',
        ),
      ),
    );
    await expectRefused(
      a,
      'offer_other_column_changed',
      undefined,
      mutate(
        'set current_version_id = null',
        'set current_version_id = null, tier_rank = 3',
      ),
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });
});
