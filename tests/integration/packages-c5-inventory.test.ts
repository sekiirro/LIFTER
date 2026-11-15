// T052 [FR-022, SC-013] RED first. Complete target-stack synthetic-only inventory and
// package dependency enumeration (FK, registration-link, subscription, payment, audit).
// No legacy mapping/classification of existing mocks (C5).
//
// RED handling: the preflight (T064a) does not exist, so tests that call it are `it.fails`
// with the T052 marker; each flips to a failure the moment T064a lands, forcing removal of
// `.fails` in that PR. The catalog-oracle tests are GREEN and pin the FK graph the preflight
// must cover (a new package-id column without an FK edge fails them).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLegacySynthetic,
  packagesFixture,
  publishedFixture,
  sql,
  type PackagesFixture,
} from './packages-fixture';
import {
  catalogFkEdges,
  packageReferenceColumns,
  rowSnapshot,
  runPreflight,
} from './packages-c5-preflight-contract';

const db = sql();
let f: PackagesFixture;

beforeAll(async () => {
  f = await packagesFixture();
});
afterAll(async () => {
  await db.end();
});

describe('T052 catalog oracle (GREEN): dependency graph the preflight must enumerate', () => {
  it('has FK edges from every required dependency family into the package tables', async () => {
    const edges = (await catalogFkEdges(db)).join('\n');
    for (const table of [
      'public.package_offers',
      'public.package_versions',
      'public.registration_links',
      'public.clients',
      'public.subscriptions',
      'public.subscription_renewals',
      'public.subscription_upgrades',
    ])
      expect(edges, `missing FK edge from ${table}`).toContain(`${table}#`);
  });

  it('has no package-id column without an FK edge (otherwise the stack has unknown dependency state)', async () => {
    const edgeTables = new Set(
      (await catalogFkEdges(db)).map((e) => e.split('#')[0]),
    );
    const columns = await packageReferenceColumns(db);
    const uncovered = columns.filter(
      (c) => !edgeTables.has(c.split('.').slice(0, 2).join('.')),
    );
    expect(uncovered).toEqual([]);
  });
});

describe('T052 preflight inventory (RED until T064a)', () => {
  it.fails(
    'T052 inventories every package row in the target stack without reclassifying',
    async () => {
      const mock = await createLegacySynthetic(f);
      const before = await rowSnapshot(db);
      const report = await runPreflight(db, null);
      const [counted] =
        await db`select count(*)::int as n from public.packages`;
      expect(report.targets).toHaveLength(counted!.n as number);
      expect(
        report.targets.find((t) => t.package_id === mock.id),
      ).toMatchObject({
        code: mock.code,
        synthetic: true,
      });
      // No legacy mapping/classification: the legacy row keeps null workspace/market/type.
      const [legacy] =
        await db`select workspace_id,market,type from public.packages where id=${mock.id}`;
      expect(legacy).toEqual({ workspace_id: null, market: null, type: null });
      expect(await rowSnapshot(db)).toEqual(before);
    },
  );

  it.fails(
    'T052 enumerates every catalog FK table plus registration-link, subscription, payment and audit references',
    async () => {
      const report = await runPreflight(db, null);
      const oracleTables = new Set(
        (await catalogFkEdges(db)).map((e) => e.split('#')[0]),
      );
      const reported = new Set(
        report.dependencies.map((d) => d.edge.split('.').slice(0, 2).join('.')),
      );
      for (const t of oracleTables)
        expect(reported, `preflight omitted ${t}`).toContain(t);
      const kinds = new Set(report.dependencies.map((d) => d.kind));
      for (const k of [
        'fk',
        'registration_link',
        'subscription',
        'payment',
        'audit',
      ])
        expect(kinds, `preflight omitted kind ${k}`).toContain(k);
    },
  );

  it.fails(
    'T052 counts attached offers, versions and audit rows for a published synthetic package',
    async () => {
      const p = await publishedFixture(f, { tier_rank: 1 });
      await db`
      insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
      values (${f.po.userId},'package_version.test_fixture','package_versions',${p.versionId},${p.workspace_id},'{}'::jsonb)`;
      const report = await runPreflight(db, [p.id]);
      const count = (edge: string) =>
        report.dependencies.find((d) => d.edge === edge)?.count;
      expect(count('public.package_offers.package_id')).toBe(1);
      expect(count('public.package_versions.offer_id')).toBe(1);
      expect(
        report.dependencies.find((d) => d.kind === 'audit')?.count,
      ).toBeGreaterThanOrEqual(1);
      expect(report.status).not.toBe('clean');
    },
  );

  it.fails('T052 never reports an unknown package id as clean', async () => {
    const report = await runPreflight(db, [randomUUID()]);
    expect(report.status).not.toBe('clean');
  });
});
