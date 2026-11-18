// T065 [FR-028, SC-019] C5 operator teardown script (supabase/cleanup/20261121_t065_c5_mock_package_teardown.sql).
// Not a migration: the tests execute the script text exactly as the operator does, as `postgres`,
// inside one transaction, with the same transaction-local settings psql would copy from its variables.
// Test plan: specs/009-packages/reviews/t064b-teardown-design.md section 7. S61-PO-2 (Q1=A, Q2=A, Q3=A).
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql, TransactionSql } from 'postgres';
import { admin, anonClient } from './harness';
import {
  checked,
  createLegacySynthetic,
  createLegacyPublishedSynthetic,
  packagesFixture,
  publishedFixture,
  sql,
  type PackagesFixture,
} from './packages-fixture';
import { bought } from './registration-approval-payment-fixture';
import { clientContext } from './client-accounts-fixture';
import {
  PREFLIGHT_FN,
  rowSnapshot,
  runPreflight,
} from './packages-c5-preflight-contract';

const db = sql();
const script = readFileSync(
  'supabase/cleanup/20261121_t065_c5_mock_package_teardown.sql',
  'utf8',
);
const SCRIPT_SHA256 = createHash('sha256').update(script, 'utf8').digest('hex');
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
  pkgs: string[] | null;
  rawPkgs?: string;
  ws: string[];
  rawWs?: string;
  runId?: string;
  runUtc?: string;
  operatorId?: string;
  reviewerId?: string;
  reviewRef?: string;
  scriptSha256?: string;
  preflightCapturedUtc?: string;
  stackId?: string;
  stackIdSource?: string;
  stackEnv?: string;
  poApprovalRef?: string;
  backupRestoreRef?: string;
  runRecord?: Record<string, unknown>;
  prepareAfterSettings?: boolean;
};

// Cluster-unique stack identity, the same value an operator records (control A5).
async function stackIdentity(q: Sql | TransactionSql) {
  try {
    const [r] =
      await q`select system_identifier::text as id from pg_control_system()`;
    return { id: r!.id as string, source: 'pg_control_system' as const };
  } catch {
    const [r] = await q`select current_setting('lifter.stack_id', true) as id`;
    return { id: r!.id as string, source: 'lifter.stack_id' as const };
  }
}

let runCounter = 0;
function newRun() {
  runCounter += 1;
  return `c5-20261118-${Date.now()}${runCounter}`;
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
  const preflight = await runPreflight(q, a.pkgs);
  const runId = a.runId ?? newRun();
  const runUtc = a.runUtc ?? '2026-11-18T08:00:00Z';
  const operatorId = a.operatorId ?? 'operator:t065-test';
  const reviewerId = a.reviewerId ?? 'reviewer:t064b-r2';
  const reviewRef = a.reviewRef ?? 'T064b-r2-PASS';
  const scriptSha256 = a.scriptSha256 ?? SCRIPT_SHA256;
  const stackId = a.stackId ?? stack.id;
  const stackIdSource = a.stackIdSource ?? stack.source;
  const stackEnv = a.stackEnv ?? 'local';
  const preflightCapturedUtc = a.preflightCapturedUtc ?? '2026-11-18T07:59:00Z';
  const poApprovalRef = a.poApprovalRef ?? '';
  const backupRestoreRef = a.backupRestoreRef ?? '';
  const runRecord = {
    status: 'PASS',
    run_id: runId,
    run_utc: runUtc,
    operator_id: operatorId,
    reviewer_id: reviewerId,
    review_ref: reviewRef,
    script_sha256: scriptSha256,
    expected_stack_id: stackId,
    stack_id_source: stackIdSource,
    stack_env: stackEnv,
    package_ids: a.pkgs?.slice().sort() ?? null,
    workspace_ids: a.ws.slice().sort(),
    preflight_captured_utc: preflightCapturedUtc,
    preflight,
    po_approval_ref: poApprovalRef,
    backup_restore_ref: backupRestoreRef,
  };
  const record = { ...runRecord, ...a.runRecord };
  const set = (k: string, v: string) => q`select set_config(${k}, ${v}, true)`;
  if (a.rawPkgs !== undefined) {
    await set('c5.package_ids', a.rawPkgs);
  } else if (a.pkgs !== null) {
    await set('c5.package_ids', a.pkgs.join(','));
  }
  await set('c5.workspace_ids', a.rawWs ?? a.ws.join(','));
  await set('c5.run_id', runId);
  await set('c5.run_utc', runUtc);
  await set('c5.operator_id', operatorId);
  await set('c5.reviewer_id', reviewerId);
  await set('c5.review_ref', reviewRef);
  await set('c5.script_sha256', scriptSha256);
  await set('c5.preflight_captured_utc', preflightCapturedUtc);
  await set('c5.expected_stack_id', stackId);
  await set('c5.stack_id_source', stackIdSource);
  await set('c5.stack_env', stackEnv);
  await set('c5.po_approval_ref', poApprovalRef);
  await set('c5.backup_restore_ref', backupRestoreRef);
  await set('c5.run_record', JSON.stringify(record));
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
      if (prepare && a.prepareAfterSettings) {
        await settings(tx, a);
        await prepare(tx);
        await tx.unsafe(text);
      } else {
        if (prepare) await prepare(tx);
        await runIn(tx, a, text);
      }
      throw new Error('rollback: the script unexpectedly succeeded');
    }),
  ).rejects.toThrow(new RegExp(`c5_refused:${code}`));
}

async function legacyMock(workspaces: string[] = [f.wsA.id]) {
  const mock = await createLegacyPublishedSynthetic(f);
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

const GUARD_FN_NAMES = [
  'forbid_delete',
  'audit_events_immutable',
  'guard_package_offer_update',
  'guard_package_offer_category',
  'guard_package_version_insert',
  'guard_package_version_market',
  'audit_row_change',
  'audit_package_created',
  'package_c5_preflight',
];

async function guardFunctionHashes() {
  const rows = await db`
    select p.proname::text as name, md5(pg_get_functiondef(p.oid)) as hash
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='app_private' and p.proname = any(${GUARD_FN_NAMES})
     order by 1`;
  return rows.map((r) => `${r.name}:${r.hash}`);
}

// Content-level snapshot of rows + catalog state for D5 rollback-invariant proof (Section 7 item 11).
async function stackContentSnapshot(q: Sql | TransactionSql = db) {
  const [pkgRows] = await q`
    select count(*)::int as n,
           md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by t.id), '')) as h
      from public.packages t`;
  const [offerRows] = await q`
    select count(*)::int as n,
           md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by t.id), '')) as h
      from public.package_offers t`;
  const [verRows] = await q`
    select count(*)::int as n,
           md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by t.id), '')) as h
      from public.package_versions t`;
  const [auditRows] = await q`
    select count(*)::int as n,
           coalesce(max(t.id), 0)::text as max_id,
           md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by t.id), '')) as h
      from public.audit_events t`;
  const triggers = await q`
    select c.relname||'.'||t.tgname as name, t.tgenabled::text as enabled, t.tgisinternal as internal
      from pg_trigger t join pg_class c on c.oid=t.tgrelid
     where c.relname in ('packages','package_offers','package_versions','audit_events')
     order by 1, 3`;
  const constraints = await q`
    select con.conname::text as name, con.convalidated as validated, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
     where con.conrelid in ('public.packages'::regclass,'public.package_offers'::regclass,'public.package_versions'::regclass)
        or con.confrelid in ('public.packages'::regclass,'public.package_offers'::regclass,'public.package_versions'::regclass)
     order by 1, 3`;
  const grants = await q`
    select table_name, grantee, privilege_type
      from information_schema.table_privileges
     where table_schema='public' and table_name in ('packages','package_offers','package_versions','audit_events')
     order by 1, 2, 3`;
  const fns = await guardFunctionHashes();
  return {
    pkgRows,
    offerRows,
    verRows,
    auditRows,
    triggers,
    constraints,
    grants,
    fns,
  };
}

async function namedAuditRows(
  packageId: string,
  extraTargetIds: string[] = [],
) {
  const targetIds = [packageId, ...extraTargetIds];
  return db`
    select id, occurred_at::text as occurred_at, actor_user_id, action, target_table, target_id, workspace_id, details
      from public.audit_events
     where (target_table='packages' and target_id=${packageId})
        or (target_table in ('package_offers','package_versions') and target_id = any(${targetIds}))
     order by id`;
}

async function childIds(packageId: string) {
  const offers =
    await db`select id from public.package_offers where package_id=${packageId}`;
  const versions =
    await db`select v.id from public.package_versions v join public.package_offers o on o.id=v.offer_id where o.package_id=${packageId}`;
  return [
    ...offers.map((r) => r.id as string),
    ...versions.map((r) => r.id as string),
  ];
}

beforeAll(async () => {
  f = await packagesFixture();
});
afterAll(async () => {
  await db.end();
});

describe('T065 successful teardown of a verified synthetic mock', () => {
  it('deletes versions, offers and the package atomically; audit preserved; non-targets untouched; guards intact', async () => {
    const mock = await legacyMock();
    const keep = await createLegacyPublishedSynthetic(f);
    const keepBefore =
      await db`select to_jsonb(p) as j from public.packages p where id=${keep.id}`;
    const keepOffersBefore =
      await db`select to_jsonb(o) as j from public.package_offers o where package_id=${keep.id} order by id`;
    const keepVersBefore =
      await db`select to_jsonb(v) as j from public.package_versions v join public.package_offers o on o.id=v.offer_id where o.package_id=${keep.id} order by v.id`;
    const before = await counts(mock.id);
    expect(before).toMatchObject({ p: 1, o: 1, v: 1 });
    const mockChildIds = await childIds(mock.id);
    const auditRowsBefore = await namedAuditRows(mock.id, mockChildIds);
    expect(auditRowsBefore.length).toBeGreaterThanOrEqual(1);
    const triggersBefore = await triggerStates();
    const hashesBefore = await guardFunctionHashes();
    const runId = newRun();

    await teardown({ pkgs: [mock.id], ws: [f.wsA.id], runId });

    expect(await counts(mock.id)).toEqual({ p: 0, o: 0, v: 0 });
    expect(
      await db`select to_jsonb(p) as j from public.packages p where id=${keep.id}`,
    ).toEqual(keepBefore);
    expect(
      await db`select to_jsonb(o) as j from public.package_offers o where package_id=${keep.id} order by id`,
    ).toEqual(keepOffersBefore);
    expect(
      await db`select to_jsonb(v) as j from public.package_versions v join public.package_offers o on o.id=v.offer_id where o.package_id=${keep.id} order by v.id`,
    ).toEqual(keepVersBefore);

    // Pre-existing audit rows naming the target are identical in count and full row content (E1, D4).
    const auditRowsAfter = await namedAuditRows(mock.id, mockChildIds);
    expect(auditRowsAfter.length).toBe(auditRowsBefore.length + 1);
    expect(
      auditRowsAfter.filter((r) => r.action !== 'package.teardown_executed'),
    ).toEqual(auditRowsBefore);

    const [event] = await db`
      select actor_user_id, action, target_table, target_id, workspace_id, details
        from public.audit_events where action='package.teardown_executed' and details->>'run_id'=${runId}`;
    expect(event).toMatchObject({
      actor_user_id: null,
      target_table: 'packages',
      target_id: mock.id,
      workspace_id: null,
    });
    expect(Object.keys(event!.details as object).sort()).toEqual([
      'offer_count',
      'review_ref',
      'run_id',
      'version_count',
    ]);
    expect(await triggerStates()).toEqual(triggersBefore);
    expect(await guardFunctionHashes()).toEqual(hashesBefore);
  });

  it('a childless synthetic mock (no offers) is also removed', async () => {
    const mock = await createLegacySynthetic(f);
    await teardown({ pkgs: [mock.id], ws: [] });
    expect((await counts(mock.id)).p).toBe(0);
  });

  it('shared legacy package requires exact workspace set (subset and superset refuse); foreign rows untouched', async () => {
    const mock = await legacyMock([f.wsA.id, f.wsB.id]);
    const foreign = await publishedFixture(f, { tier_rank: 1 });
    const foreignBefore = await counts(foreign.id);
    // Strict SUBSET refuses (B3).
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id] },
      'workspace_not_verified_synthetic',
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 2, v: 1 });
    // Strict SUPERSET refuses (B3).
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id, f.wsB.id, randomUUID()] },
      'workspace_list_mismatch',
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 2, v: 1 });
    // Exact workspace match removes across all workspaces; foreign untouched.
    await teardown({ pkgs: [mock.id], ws: [f.wsA.id, f.wsB.id] });
    expect(await counts(mock.id)).toEqual({ p: 0, o: 0, v: 0 });
    expect(await counts(foreign.id)).toEqual(foreignBefore);
  });

  it('is not reachable from application roles and adds no function, trigger or grant (catalog diff)', async () => {
    const catalogState = async () => {
      const fns = await db`
        select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as sig,
               p.prosecdef
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname in ('public','app_private')
         order by 1`;
      const grants = await db`
        select table_name, grantee, privilege_type
          from information_schema.table_privileges
         where table_schema='public' and table_name in ('packages','package_offers','package_versions','audit_events')
         order by 1, 2, 3`;
      return { fns, grants };
    };
    const catBefore = await catalogState();
    const mock = await legacyMock();
    await teardown({ pkgs: [mock.id], ws: [f.wsA.id] });
    expect(await catalogState()).toEqual(catBefore);

    const keep = await createLegacySynthetic(f);
    for (const client of [
      anonClient(),
      admin(),
      f.actors.noProfile.client,
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
             has_table_privilege('service_role','public.packages','delete') as c,
             has_table_privilege('public','public.packages','delete') as d`;
    expect(priv).toEqual({ a: false, b: false, c: false, d: false });
  });
});

describe('T065 post-run FR-006 regression across EVERY role and EVERY operation (D12, section 7 item 9)', () => {
  it('after a completed teardown, UPDATE, DELETE and TRUNCATE on remaining published versions and protected tables refuse for every role', async () => {
    const mock = await legacyMock();
    await teardown({ pkgs: [mock.id], ws: [f.wsA.id] });

    const remaining = await publishedFixture(f, { tier_rank: 1 });
    const hashesBefore = await guardFunctionHashes();

    // 1. PostgREST / API clients: anon, authenticated (noProfile), service_role (admin), PO, WO
    for (const client of [
      anonClient(),
      f.actors.noProfile.client,
      admin(),
      f.po.client,
      f.actors.woA.client,
    ]) {
      const verUpd = await client
        .from('package_versions')
        .update({ price_minor: 999 })
        .eq('id', remaining.versionId);
      expect(verUpd.error).not.toBeNull();
      const verDel = await client
        .from('package_versions')
        .delete()
        .eq('id', remaining.versionId);
      expect(verDel.error).not.toBeNull();

      const offUpd = await client
        .from('package_offers')
        .update({ duration_days: 999 })
        .eq('id', remaining.offer.id);
      expect(offUpd.error).not.toBeNull();
      const offDel = await client
        .from('package_offers')
        .delete()
        .eq('id', remaining.offer.id);
      expect(offDel.error).not.toBeNull();

      const pkgUpd = await client
        .from('packages')
        .update({ market: 'Egypt' })
        .eq('id', remaining.id);
      expect(pkgUpd.error).not.toBeNull();
      const pkgDel = await client
        .from('packages')
        .delete()
        .eq('id', remaining.id);
      expect(pkgDel.error).not.toBeNull();
    }

    // 2. Direct SQL across every role (anon, authenticated, service_role, PO, WO, postgres owner):
    //    UPDATE, DELETE and TRUNCATE on package_versions, package_offers, packages.
    const sqlRoles: { label: string; pgRole: string; sub?: string }[] = [
      { label: 'anon', pgRole: 'anon' },
      {
        label: 'authenticated',
        pgRole: 'authenticated',
        sub: f.actors.noProfile.userId,
      },
      { label: 'service_role', pgRole: 'service_role' },
      { label: 'po', pgRole: 'authenticated', sub: f.po.userId },
      { label: 'wo', pgRole: 'authenticated', sub: f.actors.woA.userId },
      { label: 'owner', pgRole: 'postgres' },
    ];

    const attemptSql = async (
      r: { pgRole: string; sub?: string },
      stmt: string,
    ) => {
      await expect(
        db.begin(async (tx) => {
          if (r.sub) {
            await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: r.sub, role: r.pgRole })}, true)`;
          }
          if (r.pgRole !== 'postgres') {
            await tx.unsafe(`set local role ${r.pgRole}`);
          }
          await tx.unsafe(stmt);
          throw new Error('rollback: guard failed to reject');
        }),
      ).rejects.toThrow();
    };

    for (const r of sqlRoles) {
      await attemptSql(
        r,
        `update public.package_versions set price_minor = 999 where id = '${remaining.versionId}'`,
      );
      await attemptSql(
        r,
        `delete from public.package_versions where id = '${remaining.versionId}'`,
      );
      await attemptSql(r, 'truncate public.package_versions');

      await attemptSql(
        r,
        `update public.package_offers set duration_days = 999 where id = '${remaining.offer.id}'`,
      );
      await attemptSql(
        r,
        `delete from public.package_offers where id = '${remaining.offer.id}'`,
      );
      await attemptSql(r, 'truncate public.package_offers');

      await attemptSql(
        r,
        `update public.packages set market = 'Egypt' where id = '${remaining.id}'`,
      );
      await attemptSql(
        r,
        `delete from public.packages where id = '${remaining.id}'`,
      );
      await attemptSql(r, 'truncate public.packages');
    }

    await attemptSql(
      { pgRole: 'postgres' },
      `update public.audit_events set details='{}'::jsonb where action='package.teardown_executed'`,
    );
    await attemptSql(
      { pgRole: 'postgres' },
      `delete from public.audit_events where action='package.teardown_executed'`,
    );
    await attemptSql({ pgRole: 'postgres' }, 'truncate public.audit_events');

    expect(await counts(remaining.id)).toMatchObject({ p: 1, o: 1, v: 1 });
    expect(await guardFunctionHashes()).toEqual(hashesBefore);
  });
});

describe('T065 refusals write nothing', () => {
  it('refuses a non-synthetic package (non-test code and NULL code)', async () => {
    const id = randomUUID();
    await db`insert into public.packages(id,code,created_by) values (${id},${'legacy-pkg-' + randomUUID()},${f.po.userId})`;
    await expectRefused({ pkgs: [id], ws: [] }, 'preflight_not_deletable');
    expect((await counts(id)).p).toBe(1);

    const nullCodeId = randomUUID();
    await db`insert into public.packages(id,code,created_by,workspace_id,market,type) values (${nullCodeId},null,${f.po.userId},${f.wsA.id},'International','Promotional')`;
    await expectRefused(
      { pkgs: [nullCodeId], ws: [f.wsA.id] },
      'preflight_not_deletable',
    );
    expect((await counts(nullCodeId)).p).toBe(1);
  });

  it('refuses a real category (workspace_id set) and a legacy mock whose version has market set', async () => {
    const p = await publishedFixture(f, { tier_rank: 1 });
    await expectRefused(
      { pkgs: [p.id], ws: [p.workspace_id] },
      'preflight_not_deletable',
    );
    expect(await counts(p.id)).toMatchObject({ p: 1, o: 1, v: 1 });

    // Legacy package (workspace_id IS NULL) with a version carrying market set -> real_catalog_row.
    const mock = await createLegacySynthetic(f);
    const offerId = randomUUID();
    const versionId = randomUUID();
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id] },
      'preflight_not_deletable',
      async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })}, true)`;
        await tx`insert into public.package_offers(id,workspace_id,package_id,duration_days,duration_months,tier_rank)
          values (${offerId},${f.wsA.id},${mock.id},61,null,1)`;
        await tx`alter table public.package_versions disable trigger package_versions_market_guard`;
        await tx`insert into public.package_versions(id,workspace_id,offer_id,version,name_ar,name_en,price_minor,currency,commission_rate_bp,duration_days,duration_months,published_by,market,type)
          values (${versionId},${f.wsA.id},${offerId},1,'test-authored-ar','test-authored-en',1200,'EGP',0,61,null,${f.po.userId},'Egypt','Year-round')`;
        await tx`alter table public.package_versions enable trigger package_versions_market_guard`;
        const rep = await runPreflight(tx, [mock.id]);
        expect(rep.refusals.map((r) => r.code)).toContain('real_catalog_row');
      },
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 0, v: 0 });
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

  it('refuses unknown dependency state: an unknown table and a jsonb reference (escalate never deletes)', async () => {
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

  it('refuses empty, NULL/unset, unknown, malformed (D8), and mismatching allow-lists', async () => {
    await expectRefused({ pkgs: [], ws: [] }, 'empty_allow_list');
    await expectRefused({ pkgs: null, ws: [] }, 'empty_allow_list');
    expect((await runPreflight(db, null)).deletable).toBe(false);
    expect((await runPreflight(db, null)).input_mode).toBe('all');

    const mock = await legacyMock();
    // D8 / Test 13: malformed allow-list produces machine-readable c5_refused:malformed_allow_list, not raw 22P02 cast error.
    for (const bad of ['not-a-uuid', `${mock.id},not-a-uuid`, `${mock.id},`]) {
      await expectRefused(
        { pkgs: null, rawPkgs: bad, ws: [f.wsA.id] },
        'malformed_allow_list',
      );
    }
    await expectRefused(
      { pkgs: [mock.id], ws: [], rawWs: 'not-a-uuid' },
      'malformed_allow_list',
    );

    await expectRefused(
      { pkgs: [randomUUID()], ws: [] },
      'preflight_not_deletable',
    );
    // A package changed after review (a package id that is not in the reviewed set) is not swept in.
    await expectRefused(
      { pkgs: [mock.id, randomUUID()], ws: [f.wsA.id] },
      'preflight_not_deletable',
    );
    expect((await counts(mock.id)).p).toBe(1);
  });

  it('refuses outside one transaction, on a stack identity mismatch, and on caller_cannot_see_rows', async () => {
    const mock = await legacyMock();
    const a: Args = { pkgs: [mock.id], ws: [f.wsA.id] };
    // The settings die with their own transaction, so the DO block runs in a different one.
    await db.begin((tx) => settings(tx, a));
    await expect(db.unsafe(DO_BLOCK)).rejects.toThrow(
      /c5_refused:not_single_transaction/,
    );
    await expectRefused({ ...a, stackId: '1' }, 'stack_identity_mismatch');

    // Blind caller without BYPASSRLS reports caller_cannot_see_rows in preflight and refuses in script.
    await db
      .begin(async (tx) => {
        await tx.unsafe('create role t065_blind nologin');
        const [v] =
          await tx`select current_setting('server_version_num')::int as n`;
        await tx.unsafe(
          (v!.n as number) >= 160000
            ? 'grant t065_blind to current_user with set true'
            : 'grant t065_blind to current_user',
        );
        await tx.unsafe(
          'grant usage on schema public, app_private to t065_blind',
        );
        await tx.unsafe(
          'grant select on all tables in schema public, app_private to t065_blind',
        );
        await tx.unsafe(
          `grant execute on function ${PREFLIGHT_FN}(uuid[]) to t065_blind`,
        );
        await tx.unsafe('set local role t065_blind');
        const rep = await runPreflight(tx, [mock.id]);
        expect(rep.status).toBe('escalate');
        expect(rep.refusals.map((r) => r.code)).toContain(
          'caller_cannot_see_rows',
        );
        await tx.unsafe('reset role');
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });

    expect(await counts(mock.id)).toMatchObject({ p: 1 });
  });
});

describe('T065 guard-state refusals and trigger inventory (C6)', () => {
  it('refuses a pre-disabled guard trigger on each protected table and never repairs it', async () => {
    const mock = await legacyMock();
    const triggersBefore = await triggerStates();
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
    expect(await triggerStates()).toEqual(triggersBefore);
  });

  it('refuses a MISSING user trigger on each protected table and leaves trigger state unchanged', async () => {
    const mock = await legacyMock();
    const triggersBefore = await triggerStates();
    for (const [table, trigger] of [
      ['packages', 'packages_no_delete'],
      ['package_offers', 'package_offers_no_delete'],
      ['package_versions', 'package_versions_no_delete'],
      ['audit_events', 'audit_events_immutable'],
    ] as const) {
      await expectRefused(
        { pkgs: [mock.id], ws: [f.wsA.id] },
        'trigger_set_or_state_unexpected',
        async (tx) => {
          await tx.unsafe(`drop trigger ${trigger} on public.${table}`);
        },
      );
    }
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
    expect(await triggerStates()).toEqual(triggersBefore);
  });

  it('refuses an EXTRA user trigger on each protected table and leaves trigger state unchanged', async () => {
    const mock = await legacyMock();
    const triggersBefore = await triggerStates();
    for (const table of [
      'packages',
      'package_offers',
      'package_versions',
      'audit_events',
    ] as const) {
      await expectRefused(
        { pkgs: [mock.id], ws: [f.wsA.id] },
        'trigger_set_or_state_unexpected',
        async (tx) => {
          await tx.unsafe(
            `create trigger t065_extra before update on public.${table} for each row execute function pg_catalog.suppress_redundant_updates_trigger()`,
          );
        },
      );
    }
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
    expect(await triggerStates()).toEqual(triggersBefore);
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

describe('T065 mutation checks on the script controls (Section 7 items 5, 6, 12)', () => {
  it('the offer guard must be re-enabled before the first DELETE (control C4, dynamic mutant)', async () => {
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

  it('widening trigger disablement (DISABLE TRIGGER USER or leaving *_no_delete disabled) is caught and rolled back', async () => {
    const mock = await legacyMock();
    const a: Args = { pkgs: [mock.id], ws: [f.wsA.id] };
    await expectRefused(
      a,
      'post_trigger_state_unexpected',
      undefined,
      mutate(
        'alter table public.package_offers disable trigger package_offers_guard;',
        'alter table public.package_offers disable trigger user;',
      ),
    );
    await expectRefused(
      a,
      'post_trigger_state_unexpected',
      undefined,
      mutate(
        'alter table public.package_versions enable trigger package_versions_no_delete;',
        'null;',
      ),
    );
    await expectRefused(
      a,
      'post_trigger_state_unexpected',
      undefined,
      mutate(
        'alter table public.package_offers enable trigger package_offers_no_delete;',
        'null;',
      ),
    );
    await expectRefused(
      a,
      'post_trigger_state_unexpected',
      undefined,
      mutate(
        'alter table public.packages enable trigger packages_no_delete;',
        'null;',
      ),
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

  it('the set-equality delete checks fire for versions, offers and packages (control D2)', async () => {
    const mock = await legacyMock();
    const a: Args = { pkgs: [mock.id], ws: [f.wsA.id] };
    await expectRefused(
      a,
      'version_delete_count_mismatch',
      undefined,
      mutate(
        'where v.workspace_id = c.workspace_id and v.id = c.id',
        'where v.workspace_id = c.workspace_id and v.id = c.id and false',
      ),
    );
    await expectRefused(
      a,
      'offer_delete_count_mismatch',
      undefined,
      mutate(
        'where o.workspace_id = c.workspace_id and o.id = c.id\n    returning o.id)',
        'where o.workspace_id = c.workspace_id and o.id = c.id and false\n    returning o.id)',
      ),
    );
    const needle = 'if v_ids is distinct from v_pkgs then';
    expect(CORE.split(needle)).toHaveLength(2);
    await expectRefused(
      a,
      'package_delete_set_mismatch',
      undefined,
      CORE.replace(needle, 'if true then'),
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });

  it('uncovered D5 branches: constraint_changed and internal_fk_trigger_unexpected are executed and roll back', async () => {
    const mock = await legacyMock();
    const a: Args = { pkgs: [mock.id], ws: [f.wsA.id] };

    // 1. Real mid-run constraint modification before Control 10 triggers constraint_changed and rolls back.
    await expectRefused(
      a,
      'constraint_changed',
      undefined,
      mutate(
        '  -- D4: post-conditions, any failure rolls everything back.',
        `  alter table public.packages add constraint t065_mid_run_chk check (true);
  -- D4: post-conditions, any failure rolls everything back.`,
      ),
    );

    // 2. internal_fk_trigger_unexpected: disable an internal RI trigger if permitted, or run mutant proving branch fires.
    const [ri] = await db`
      select c.relname::text as tbl, t.tgname::text as tg
        from pg_trigger t join pg_class c on c.oid=t.tgrelid
       where t.tgrelid in ('public.packages'::regclass,'public.package_offers'::regclass,'public.package_versions'::regclass)
         and t.tgisinternal
       order by 1, 2 limit 1`;
    expect(ri).toBeDefined();
    let riForcedSupported = true;
    try {
      await db.begin(async (tx) => {
        await tx.unsafe(
          `alter table public.${ri!.tbl} disable trigger "${ri!.tg}"`,
        );
        throw new Error('probe_ok');
      });
    } catch (e: unknown) {
      if (!(e instanceof Error) || e.message !== 'probe_ok') {
        riForcedSupported = false;
      }
    }
    if (riForcedSupported) {
      await expectRefused(a, 'internal_fk_trigger_unexpected', async (tx) => {
        await tx.unsafe(
          `alter table public.${ri!.tbl} disable trigger "${ri!.tg}"`,
        );
      });
    } else {
      await expectRefused(
        a,
        'internal_fk_trigger_unexpected',
        undefined,
        mutate("and (t.tgenabled <> 'O'", "and (t.tgenabled = 'O'"),
      );
    }
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });

  it('owner_lacks_bypassrls and target_set_differs_from_allow_list branches fire via executed mutants', async () => {
    const mock = await legacyMock();
    const a: Args = { pkgs: [mock.id], ws: [f.wsA.id] };
    await expectRefused(
      a,
      'owner_lacks_bypassrls',
      undefined,
      mutate(
        '(select r.rolbypassrls or r.rolsuper from pg_catalog.pg_roles r where r.rolname = current_user)',
        'false',
      ),
    );
    await expectRefused(
      a,
      'target_set_differs_from_allow_list',
      undefined,
      mutate(
        "if (select array_agg((t ->> 'package_id')::uuid order by (t ->> 'package_id')::uuid)\n        from jsonb_array_elements(v_rep -> 'targets') t) is distinct from v_pkgs then",
        'if true then',
      ),
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });
});

describe('T065 D5 rollback-invariant proof with non-transactional audit_events.id sequence (Section 7 item 11)', () => {
  it('refusal before and after the teardown audit insert leaves all row data and catalog state identical; only audit_events.id advances', async () => {
    const mock = await legacyMock();
    const a: Args = { pkgs: [mock.id], ws: [f.wsA.id] };

    // Early refusal (before audit insert): row data, catalog state, AND max audit id are identical.
    const snapEarlyBefore = await stackContentSnapshot();
    await expectRefused({ ...a, stackId: '1' }, 'stack_identity_mismatch');
    expect(await stackContentSnapshot()).toEqual(snapEarlyBefore);

    // Late refusal (AFTER Control 9 audit insert, failing inside Control 10 post-conditions):
    // all row data and catalog state are 100% identical, while the non-transactional audit_events.id
    // identity sequence advances across the rolled-back insert.
    const snapLateBefore = await stackContentSnapshot();
    const [seqBefore] = await db`
      select last_value::bigint as v
        from pg_sequences
       where schemaname='public' and sequencename='audit_events_id_seq'`;

    await expectRefused(
      a,
      'preexisting_audit_changed',
      undefined,
      mutate(
        'if audit_named_count_after <> audit_named_count_before or audit_named_hash_after is distinct from audit_named_hash_before then',
        'if true then',
      ),
    );

    const snapLateAfter = await stackContentSnapshot();
    expect(snapLateAfter).toEqual(snapLateBefore);

    // Prove the sequence advanced despite rollback (D5 tolerated difference):
    // a subsequent audit_events insert receives an id strictly above seqBefore + 1.
    const [seqAfterRefusal] = await db`
      select last_value::bigint as v
        from pg_sequences
       where schemaname='public' and sequencename='audit_events_id_seq'`;
    const beforeVal = BigInt((seqBefore?.v as string | number | null) ?? 0);
    const afterRefusalVal = BigInt(
      (seqAfterRefusal?.v as string | number | null) ?? 0,
    );
    expect(afterRefusalVal).toBeGreaterThan(beforeVal);

    let probeId = 0n;
    await db
      .begin(async (tx) => {
        const [inserted] = await tx`
          insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
          values (null, 'package.teardown_probe', 'packages', ${randomUUID()}, null, '{}'::jsonb)
          returning id`;
        probeId = BigInt(inserted!.id as string | number);
        throw new Error('probe_rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'probe_rollback') throw e;
      });
    expect(probeId).toBeGreaterThan(beforeVal + 1n);
  });
});

describe('T065 additional refusal branches (A4/A5/A6/C3/C6/D1/D2/D3/D8)', () => {
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
  ];
  it.each(cases)('refuses %s (%s)', async (code, _label, prepare) => {
    const mock = await legacyMock();
    await expectRefused(
      {
        pkgs: [mock.id],
        ws: [f.wsA.id],
        ...(code === 'not_database_owner'
          ? { prepareAfterSettings: true }
          : {}),
      },
      code,
      prepare,
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });

  it('refuses missing or malformed run_id, review_ref and A4 provenance fields (D1)', async () => {
    const mock = await legacyMock();
    const a: Args = { pkgs: [mock.id], ws: [f.wsA.id] };
    const before = await rowSnapshot(db);
    await expectRefused({ ...a, runId: '' }, 'missing_run_or_review_reference');
    await expectRefused(
      { ...a, reviewRef: '' },
      'missing_run_or_review_reference',
    );
    await expectRefused(
      { ...a, runId: 'run-1' },
      'invalid_run_or_review_reference',
    );
    await expectRefused(
      { ...a, runId: 'c5-20261116-' + '9'.repeat(40) },
      'invalid_run_or_review_reference',
    );
    await expectRefused(
      { ...a, reviewRef: 'bad ref with spaces' },
      'invalid_run_or_review_reference',
    );
    await expectRefused(
      { ...a, operatorId: '' },
      'missing_run_record_provenance',
    );
    await expectRefused(
      { ...a, reviewerId: '' },
      'missing_run_record_provenance',
    );
    await expectRefused(
      { ...a, scriptSha256: '' },
      'missing_run_record_provenance',
    );
    await expectRefused({ ...a, runUtc: '' }, 'missing_run_record_provenance');
    await expectRefused(
      { ...a, preflightCapturedUtc: '' },
      'missing_run_record_provenance',
    );
    await expectRefused(
      { ...a, scriptSha256: 'not-a-sha256' },
      'invalid_run_record_provenance',
    );
    await expectRefused(
      { ...a, runRecord: { script_sha256: 'a'.repeat(64) } },
      'run_record_mismatch',
    );
    await expectRefused(
      { ...a, reviewRef: 'fabricated-pass-reference' },
      'unrecognized_review_pass',
    );
    await expectRefused(
      { ...a, runRecord: { package_ids: [] } },
      'run_record_mismatch',
    );
    await expectRefused(
      { ...a, runRecord: { reviewer_id: 'reviewer:unrelated' } },
      'run_record_mismatch',
    );
    await expectRefused(
      {
        ...a,
        runRecord: {
          preflight: {
            status: 'clean',
            input_mode: 'list',
            deletable: true,
            synthetic_only: true,
            workspace_ids: [],
            targets: [],
            dependencies: [],
            refusals: [],
          },
        },
      },
      'run_record_mismatch',
    );
    await expectRefused(
      { ...a, preflightCapturedUtc: '2026-11-18T09:00:00Z' }, // after runUtc 08:00:00Z
      'invalid_run_record_provenance',
    );
    expect(await rowSnapshot(db)).toEqual(before);
    expect(await counts(mock.id)).toMatchObject({ p: 1 });
  });

  it('enforces explicit stack_id_source with no silent fallback (D3) and non-local PO/backup approvals (D2)', async () => {
    const mock = await legacyMock();
    const a: Args = { pkgs: [mock.id], ws: [f.wsA.id] };
    const before = await rowSnapshot(db);

    await expectRefused(
      { ...a, stackEnv: 'production' },
      'invalid_stack_environment',
    );
    await expectRefused(
      { ...a, stackEnv: 'non_local', poApprovalRef: '', backupRestoreRef: '' },
      'missing_non_local_approvals',
    );
    await expectRefused(
      {
        ...a,
        stackEnv: 'local',
        stackId: 'unclassified-production-system-id',
        poApprovalRef: 'PO-S61-PO-2',
        backupRestoreRef: 'D14-RESTORE-TEST-20261118',
      },
      'stack_identity_mismatch',
    );
    await expectRefused(
      {
        ...a,
        stackEnv: 'non_local',
        poApprovalRef: 'placeholder',
        backupRestoreRef: 'placeholder',
      },
      'invalid_non_local_approval_reference',
    );
    await expectRefused(
      {
        ...a,
        stackEnv: 'non_local',
        stackIdSource: 'unknown',
        poApprovalRef: 'PO-S61-PO-2',
        backupRestoreRef: 'D14-RESTORE-20261118-T064B',
      },
      'invalid_stack_id_source',
    );
    // D3: if pg_control_system raises insufficient_privilege, it MUST NOT silently fall back to lifter.stack_id.
    await expectRefused(
      {
        ...a,
        stackEnv: 'non_local',
        stackIdSource: 'pg_control_system',
        poApprovalRef: 'PO-S61-PO-2',
        backupRestoreRef: 'D14-RESTORE-20261118-T064B',
      },
      'stack_identity_source_unavailable',
      async (tx) => {
        await tx.unsafe(`set local lifter.stack_id = 'forced-fallback-id'`);
      },
      mutate(
        'select system_identifier::text into v_actual_stack from pg_catalog.pg_control_system();',
        "raise insufficient_privilege using message = 'simulated';",
      ),
    );
    expect(await rowSnapshot(db)).toEqual(before);
    // Explicit lifter.stack_id source works when declared.
    await teardown(
      {
        ...a,
        stackIdSource: 'lifter.stack_id',
        stackId: 'explicit-stack-id',
        stackEnv: 'non_local',
        poApprovalRef: 'PO-S61-PO-2',
        backupRestoreRef: 'D14-RESTORE-20261118-T064B',
      },
      CORE.replace(
        'set local search_path = pg_catalog;',
        "set local lifter.stack_id = 'explicit-stack-id';\nset local search_path = pg_catalog;",
      ),
    );
    expect(await counts(mock.id)).toEqual({ p: 0, o: 0, v: 0 });
  });

  it('refuses an unpinned search_path and unset timeouts (both statement_timeout and lock_timeout)', async () => {
    const mock = await legacyMock();
    const a: Args = { pkgs: [mock.id], ws: [f.wsA.id] };
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
    await expectRefused(
      a,
      'timeouts_not_set',
      undefined,
      mutate("set local lock_timeout = '5s';", 'set local lock_timeout = 0;'),
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
  const SUB_ID = '7f000000-0000-4000-8000-000000000002';
  const INST_ID = '7f000000-0000-4000-8000-000000000003';
  const OP_ID = '7f000000-0000-4000-8000-000000000004';
  const REN_ID = '7f000000-0000-4000-8000-000000000006';
  type Ids = { ws: string; offer: string; ver: string };
  async function idsOf(mockId: string) {
    const [r] = await db`
      select o.workspace_id as ws, o.id as offer, o.current_version_id as ver
        from public.package_offers o where o.package_id=${mockId} limit 1`;
    return r as unknown as Ids;
  }
  const insertLink = async (tx: TransactionSql, x: Ids) => {
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
    [
      'an installment',
      'public.subscription_installments.subscription_id',
      'payment',
      `insert into public.subscriptions(id,workspace_id,client_id,package_version_id,price_minor,currency,commission_rate_bp,duration_days,created_by,registration_link_id)
         values ('${SUB_ID}','@ws',gen_random_uuid(),'@ver',100,'USD',10,61,'@po',gen_random_uuid());
       insert into public.subscription_installments(id,workspace_id,subscription_id,seq,amount_minor,currency,issued_day_offset,source_kind)
         values ('${INST_ID}','@ws','${SUB_ID}',1,100,'USD',0,'issued_schedule')`,
    ],
    [
      'a payment event',
      'public.payment_events.obligation_id',
      'payment',
      `insert into public.subscription_renewals(id,workspace_id,client_id,predecessor_subscription_id,subscription_id,package_offer_id,package_version_id,expected_revision,recording_date,service_start_date,service_end_exclusive,recorded_by)
         values ('${REN_ID}','@ws',gen_random_uuid(),'${SUB_ID}','${SUB_ID}','@offer','@ver',0,date '2026-01-01',date '2026-01-01',date '2026-03-01','@po');
       insert into public.subscription_installments(id,workspace_id,subscription_id,seq,amount_minor,currency,issued_day_offset,source_kind,due_on,renewal_id,renewal_commission_rate_bp)
         values ('${INST_ID}','@ws','${SUB_ID}',1,100,'USD',0,'renewal_schedule',date '2026-01-01','${REN_ID}',10);
       insert into public.payment_events(id,workspace_id,subscription_id,obligation_id,installment_seq,revision,previous_event_id,kind,reverses_event_id,amount_minor,currency,commission_minor,collected_on,effective_on,recorded_by,operation_id)
         values ('7f000000-0000-4000-8000-000000000005','@ws','${SUB_ID}','${INST_ID}',1,1,null,'collection',null,100,'USD',10,date '2026-01-01',date '2026-01-01','@po','${OP_ID}')`,
    ],
  ];
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

describe('T065 lock and concurrency (control C9)', () => {
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
    const a: Args = { pkgs: [mock.id], ws: [f.wsA.id] };
    const mutants = [
      mutate(
        'where v.workspace_id = c.workspace_id and v.id = c.id',
        'where v.workspace_id = c.workspace_id',
      ),
      mutate(
        'where o.workspace_id = c.workspace_id and o.id = c.id\n    returning o.id)\n  select count(*) into m from d;\n  alter table public.package_offers enable trigger package_offers_no_delete;',
        'where o.workspace_id = c.workspace_id\n    returning o.id)\n  select count(*) into m from d;\n  alter table public.package_offers enable trigger package_offers_no_delete;',
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
        '  -- E2: one teardown audit event per deleted package',
        `  alter table public.packages disable trigger packages_no_delete;
  delete from public.packages where id = '${other.id}';
  alter table public.packages enable trigger packages_no_delete;
  -- E2: one teardown audit event per deleted package`,
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
        '  -- D4: post-conditions, any failure rolls everything back.',
        `  insert into public.packages(id, code, created_by)
    select v_pkgs[1], 'test-pkg-reappeared', s.user_id from public.staff_profiles s limit 1;
  -- D4: post-conditions, any failure rolls everything back.`,
      ),
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });

  it('teardown_event_count_mismatch and preexisting_audit_changed fire via executed mutants', async () => {
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
    await expectRefused(
      { pkgs: [mock.id], ws: [f.wsA.id] },
      'preexisting_audit_changed',
      undefined,
      mutate(
        '  -- D4: post-conditions, any failure rolls everything back.',
        `  alter table public.audit_events disable trigger audit_events_immutable;
  delete from public.audit_events where target_table = 'packages' and target_id = v_pkgs[1] and action <> 'package.teardown_executed';
  alter table public.audit_events enable trigger audit_events_immutable;
  -- D4: post-conditions, any failure rolls everything back.`,
      ),
    );
    expect((await counts(mock.id)).p).toBe(1);
  });

  it('the current-version update is verified (count, state, and other columns)', async () => {
    const mock = await legacyMock();
    const a: Args = { pkgs: [mock.id], ws: [f.wsA.id] };
    await expectRefused(
      a,
      'current_version_update_count_mismatch',
      undefined,
      mutate(
        'and o.current_version_id is not null\n      returning o.id)',
        'and o.current_version_id is not null and false\n      returning o.id)',
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
    await expectRefused(
      a,
      'offer_state_unexpected',
      undefined,
      mutate(
        'set current_version_id = null',
        'set current_version_id = null, available = true',
      ),
    );
    expect(await counts(mock.id)).toMatchObject({ p: 1, o: 1, v: 1 });
  });
});
