// T064 [FR-022, FR-028, SC-019] Read-only synthetic-only verification that
// enumerates every dependency; non-synthetic, required financial/audit, or unknown
// dependency state must refuse/escalate BEFORE any write; and the preflight is provably read-only.
//
// T064a landed (migration 20261121100000): these tests are GREEN gates, no longer `it.fails`.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  checked,
  createLegacySynthetic,
  publish,
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
  xactWrites,
  type PreflightReport,
} from './packages-c5-preflight-contract';

const db = sql();
let f: PackagesFixture;

beforeAll(async () => {
  f = await packagesFixture();
});
afterAll(async () => {
  await db.end();
});

describe('T064 C5 preflight is read-only', () => {
  it('T064 exists, is STABLE/IMMUTABLE and is not executable by API roles', async () => {
    const [fn] = await db`
      select p.provolatile,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authed,
             has_function_privilege('service_role', p.oid, 'execute') as svc
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname||'.'||p.proname = ${PREFLIGHT_FN}`;
    expect(fn).toBeDefined();
    expect(['s', 'i']).toContain(fn!.provolatile);
    expect([fn!.anon, fn!.authed, fn!.svc]).toEqual([false, false, false]);
  });

  it('T064 runs inside a READ ONLY transaction with zero row writes and unchanged row identity', async () => {
    const mock = await createLegacySynthetic(f);
    const before = await rowSnapshot(db);
    const report = await db.begin('read only', async (tx) => {
      const r = await runPreflight(tx, [mock.id]);
      expect(await xactWrites(tx)).toBe(0);
      return r;
    });
    expect(report.status).toBe('clean');
    expect(await rowSnapshot(db)).toEqual(before);
  });

  it('T064 refusal path is also write-free (no audit row, no state change)', async () => {
    const p = await publishedFixture(f, { tier_rank: 1 });
    const before = await rowSnapshot(db);
    await db.begin('read only', async (tx) => {
      const r = await runPreflight(tx, [p.id]);
      expect(r.status).not.toBe('clean');
      expect(await xactWrites(tx)).toBe(0);
    });
    expect(await rowSnapshot(db)).toEqual(before);
  });
});

describe('T064 refuse/escalate before any write', () => {
  it('T064 a verified synthetic package with no dependencies is clean', async () => {
    const mock = await createLegacySynthetic(f);
    const report = await runPreflight(db, [mock.id]);
    expect(report).toMatchObject({ status: 'clean', synthetic_only: true });
    expect(report.refusals).toEqual([]);
  });

  it('T064 refuses a non-synthetic package (code is not test-/fixture-)', async () => {
    const id = randomUUID();
    await db`insert into public.packages(id,code,created_by) values (${id},${'legacy-pkg-' + randomUUID()},${f.po.userId})`;
    const report = await runPreflight(db, [id]);
    expect(report.status).toBe('refused');
    expect(report.synthetic_only).toBe(false);
    expect(report.refusals).toContainEqual({
      package_id: id,
      code: 'non_synthetic',
    });
  });

  it('T064 refuses a mock with attached offers/versions (no teardown before T064b)', async () => {
    const p = await publishedFixture(f, { tier_rank: 1 });
    const report = await runPreflight(db, [p.id]);
    expect(report.status).toBe('refused');
    expect(report.refusals.map((r) => r.code)).toContain(
      'attached_offers_or_versions',
    );
  });

  it('T064 audit rows that merely name a mock offer do not block, but the attached offer does (PO Q1=A, S61-PO-2)', async () => {
    const mock = await createLegacySynthetic(f);
    const offerId = randomUUID();
    await db`
      insert into public.package_offers(id,workspace_id,package_id,duration_days,duration_months,tier_rank)
      values (${offerId},${mock.workspace_id},${mock.id},777,null,1)`;
    await db`
      insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
      values (${f.po.userId},'package_offer.test_fixture','package_offers',${offerId},${mock.workspace_id},'{}'::jsonb)`;
    const report = await runPreflight(db, [mock.id]);
    expect(report.status).toBe('refused');
    const codes = report.refusals.map((r) => r.code);
    expect(codes).toContain('attached_offers_or_versions');
    expect(codes).not.toContain('required_audit_dependency');
    expect(
      report.dependencies.find(
        (d) => d.edge === 'public.audit_events.target_id',
      )?.count,
    ).toBeGreaterThanOrEqual(1);
  });

  it('T064 refuses a real catalog row (package with workspace_id set) even with a test- code', async () => {
    const id = randomUUID();
    await db`insert into public.packages(id,code,created_by,workspace_id,market,type) values (${id},${'test-pkg-' + randomUUID()},${f.po.userId},${f.wsA.id},'Egypt','Year-round')`;
    const report = await runPreflight(db, [id]);
    expect(report.status).toBe('refused');
    expect(report.refusals).toContainEqual({
      package_id: id,
      code: 'real_catalog_row',
    });
  });

  it('T064 refuses a mock with an available offer as a real catalog row', async () => {
    const mock = await createLegacySynthetic(f);
    await db`
      insert into public.package_offers(id,workspace_id,package_id,duration_days,duration_months,tier_rank,available)
      values (${randomUUID()},${mock.workspace_id},${mock.id},778,null,1,true)`;
    const report = await runPreflight(db, [mock.id]);
    expect(report.refusals.map((r) => r.code)).toContain('real_catalog_row');
  });

  it('T064 escalates when a package id is stored in a jsonb column with no FK', async () => {
    const mock = await createLegacySynthetic(f);
    class Done extends Error {
      constructor(readonly report: PreflightReport) {
        super('rollback');
      }
    }
    const report = await db
      .begin(async (tx) => {
        await tx.unsafe(`create table public.t064_json_ref (id int, d jsonb)`);
        await tx.unsafe(
          `insert into public.t064_json_ref values (1, jsonb_build_object('v','${mock.id}'))`,
        );
        throw new Done(await runPreflight(tx, [mock.id]));
      })
      .catch((e: unknown) => {
        if (e instanceof Done) return e.report;
        throw e;
      });
    expect(report.status).toBe('escalate');
  });

  it('T064 refuses when a real approved subscription and payment reference the package', async () => {
    const ctx = await clientContext();
    await bought(ctx);
    const report = await runPreflight(db, [ctx.p.id]);
    expect(report.status).toBe('refused');
    const codes = report.refusals.map((r) => r.code);
    expect(codes).toContain('required_financial_dependency');
    const kinds = report.dependencies
      .filter((d) => d.count > 0)
      .map((d) => d.kind);
    expect(kinds).toEqual(expect.arrayContaining(['subscription', 'payment']));
  });

  it('T064 escalates on unknown dependency state (a package column with no known edge)', async () => {
    const mock = await createLegacySynthetic(f);
    class Done extends Error {
      constructor(readonly report: PreflightReport) {
        super('rollback');
      }
    }
    const report = await db
      .begin(async (tx) => {
        await tx.unsafe(
          `create table public.t064_unknown_ref (id uuid primary key default gen_random_uuid(), package_id uuid)`,
        );
        await tx.unsafe(
          `insert into public.t064_unknown_ref(package_id) values ('${mock.id}')`,
        );
        throw new Done(await runPreflight(tx, [mock.id]));
      })
      .catch((e: unknown) => {
        if (e instanceof Done) return e.report;
        throw e;
      });
    expect(report.status).toBe('escalate');
    expect(report.refusals.map((r) => r.code)).toContain(
      'unknown_dependency_state',
    );
  });

  it('T064 refuses a mixed target set as a whole; nothing is partially cleared', async () => {
    const safe = await createLegacySynthetic(f);
    const unsafe = randomUUID();
    await db`insert into public.packages(id,code,created_by) values (${unsafe},${'legacy-pkg-' + randomUUID()},${f.po.userId})`;
    const before = await rowSnapshot(db);
    const report = await runPreflight(db, [safe.id, unsafe]);
    expect(report.status).toBe('refused');
    expect(report.refusals.every((r) => r.package_id === unsafe)).toBe(true);
    expect(await rowSnapshot(db)).toEqual(before);
  });
});

describe('T064 deletable contract, input modes and v2 checks (N1-N5)', () => {
  it('N1 a mock with offers is refused with exactly attached_offers_or_versions and is deletable; a childless mock is clean and deletable', async () => {
    const withOffer = await createLegacySynthetic(f);
    checked(await publish(f, withOffer.id, { tier_rank: 1 }));
    const bare = await createLegacySynthetic(f);
    const a = await runPreflight(db, [withOffer.id]);
    expect(a.status).toBe('refused');
    expect(new Set(a.refusals.map((r) => r.code))).toEqual(
      new Set(['attached_offers_or_versions']),
    );
    expect(a.deletable).toBe(true);
    expect(a.workspace_ids).toContain(withOffer.workspace_id);
    const b = await runPreflight(db, [bare.id]);
    expect(b).toMatchObject({ status: 'clean', deletable: true });
  });

  it('N1 empty and NULL inputs are never deletable', async () => {
    const empty = await runPreflight(db, []);
    expect(empty).toMatchObject({
      status: 'refused',
      input_mode: 'empty',
      deletable: false,
    });
    const all = await runPreflight(db, null);
    expect(all).toMatchObject({ input_mode: 'all', deletable: false });
  });

  it('N1 any other refusal code or escalation makes the set not deletable', async () => {
    const legacy = randomUUID();
    await db`insert into public.packages(id,code,created_by) values (${legacy},${'legacy-pkg-' + randomUUID()},${f.po.userId})`;
    const mock = await createLegacySynthetic(f);
    expect((await runPreflight(db, [legacy])).deletable).toBe(false);
    expect((await runPreflight(db, [mock.id, legacy])).deletable).toBe(false);
    expect((await runPreflight(db, [randomUUID()])).deletable).toBe(false);
  });

  it('N2 a NULL code is non_synthetic and synthetic=false', async () => {
    const id = randomUUID();
    await db`insert into public.packages(id,code,created_by,workspace_id,market,type) values (${id},null,${f.po.userId},${f.wsA.id},'International','Year-round')`;
    const report = await runPreflight(db, [id]);
    expect(report.targets[0]).toMatchObject({ code: null, synthetic: false });
    expect(report.synthetic_only).toBe(false);
    expect(report.refusals.map((r) => r.code)).toContain('non_synthetic');
  });

  it('N3 escalates per column: a package-looking column without an FK, uuid[] and upper-case jsonb ids', async () => {
    const mock = await createLegacySynthetic(f);
    class Done extends Error {
      constructor(readonly report: PreflightReport) {
        super('rollback');
      }
    }
    const run = (ddl: string, dml: string) =>
      db
        .begin(async (tx) => {
          await tx.unsafe(ddl);
          await tx.unsafe(dml);
          throw new Done(await runPreflight(tx, [mock.id]));
        })
        .catch((e: unknown) => {
          if (e instanceof Done) return e.report;
          throw e;
        });
    for (const [ddl, dml] of [
      [
        'create table public.t064_col (id int, my_offer_id uuid)',
        'insert into public.t064_col values (1, gen_random_uuid())',
      ],
      [
        'create table public.t064_arr (ids uuid[])',
        `insert into public.t064_arr values (array['${mock.id}']::uuid[])`,
      ],
      [
        'create table public.t064_up (d jsonb)',
        `insert into public.t064_up values (jsonb_build_object('v', upper('${mock.id}')))`,
      ],
    ] as const)
      expect((await run(ddl, dml)).status).toBe('escalate');
  });

  it('N4 reports every workspace of a shared legacy package offers', async () => {
    const mock = await createLegacySynthetic(f);
    for (const ws of [f.wsA.id, f.wsB.id])
      await db`
        insert into public.package_offers(id,workspace_id,package_id,duration_days,duration_months,tier_rank)
        values (${randomUUID()},${ws},${mock.id},779,null,1)`;
    const report = await runPreflight(db, [mock.id]);
    expect([...report.workspace_ids].sort()).toEqual(
      [f.wsA.id, f.wsB.id].sort(),
    );
  });
});

describe('T064 re-review N3/N5 tests', () => {
  class Done extends Error {
    constructor(readonly report: PreflightReport) {
      super('rollback');
    }
  }
  const inRolledBackTx = (
    targets: string[],
    prepare: (tx: TransactionSql) => Promise<void>,
  ) =>
    db
      .begin(async (tx) => {
        await prepare(tx);
        throw new Done(await runPreflight(tx, targets));
      })
      .catch((e: unknown) => {
        if (e instanceof Done) return e.report;
        throw e;
      });

  it('N5 an unknown table that references a package offer escalates (level 1)', async () => {
    const mock = await createLegacySynthetic(f);
    checked(await publish(f, mock.id, { tier_rank: 1 }));
    const report = await inRolledBackTx([mock.id], async (tx) => {
      await tx.unsafe(
        'create table public.t064_unknown_dep (id uuid primary key default gen_random_uuid(), oid uuid references public.package_offers(id))',
      );
      await tx.unsafe(
        `insert into public.t064_unknown_dep(oid) select id from public.package_offers where package_id='${mock.id}'`,
      );
    });
    expect(report.status).toBe('escalate');
    expect(report.deletable).toBe(false);
    expect(report.refusals.map((r) => r.code)).toContain(
      'unknown_dependency_state',
    );
    expect(
      report.dependencies.find((d) => d.edge === 'public.t064_unknown_dep.oid')
        ?.kind,
    ).toBe('unknown_dependency');
  });

  it('N5 an unknown table under a known dependent is labelled unknown_dependency and subsumed by the financial refusal', async () => {
    const ctx = await clientContext();
    await bought(ctx);
    const report = await inRolledBackTx([ctx.p.id], async (tx) => {
      await tx.unsafe(
        'create table public.t064_nested (id uuid primary key default gen_random_uuid(), sub uuid references public.subscriptions(id))',
      );
      await tx.unsafe(
        `insert into public.t064_nested(sub) select s.id from public.subscriptions s
           join public.package_versions v on v.id = s.package_version_id
           join public.package_offers o on o.id = v.offer_id where o.package_id='${ctx.p.id}'`,
      );
    });
    const nested = report.dependencies.find(
      (d) => d.edge === 'public.t064_nested.sub',
    );
    expect(nested?.kind).toBe('unknown_dependency');
    expect(nested?.count).toBeGreaterThan(0);
    const codes = report.refusals.map((r) => r.code);
    expect(codes).toContain('required_financial_dependency');
    expect(codes).not.toContain('unknown_dependency_state');
    expect(report.status).toBe('refused');
    expect(report.deletable).toBe(false);
  });

  it('N5 a caller that cannot see rows (no BYPASSRLS) escalates with caller_cannot_see_rows', async () => {
    const mock = await createLegacySynthetic(f);
    const report = await inRolledBackTx([mock.id], async (tx) => {
      await tx.unsafe('create role t064_blind nologin');
      // PG16+: the creator holds ADMIN only; SET membership is needed for SET ROLE.
      const [v] =
        await tx`select current_setting('server_version_num')::int as n`;
      await tx.unsafe(
        (v!.n as number) >= 160000
          ? 'grant t064_blind to current_user with set true'
          : 'grant t064_blind to current_user',
      );
      await tx.unsafe(
        'grant usage on schema public, app_private to t064_blind',
      );
      await tx.unsafe(
        'grant select on all tables in schema public, app_private to t064_blind',
      );
      await tx.unsafe(
        `grant execute on function ${PREFLIGHT_FN}(uuid[]) to t064_blind`,
      );
      await tx.unsafe('set local role t064_blind');
    });
    expect(report.status).toBe('escalate');
    expect(report.deletable).toBe(false);
    expect(report.refusals.map((r) => r.code)).toContain(
      'caller_cannot_see_rows',
    );
  });

  it('N3 the named exception column is verified and applies to that exact column only', async () => {
    const [col] = await db`
      select exists (
        select 1 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='app_private' and c.relname='branding_render_handles' and a.attname='version_id' and not a.attisdropped
           and not exists (select 1 from pg_constraint k where k.contype='f' and k.conrelid=c.oid and a.attnum = any(k.conkey))
      ) as no_fk`;
    expect(col!.no_fk).toBe(true); // the exception is needed: no FK covers it
    const mock = await createLegacySynthetic(f);
    expect((await runPreflight(db, [mock.id])).status).toBe('clean');
    const other = await inRolledBackTx([mock.id], async (tx) => {
      await tx.unsafe(
        'create table public.t064_same_name (id int, version_id uuid)',
      );
    });
    expect(other.status).toBe('escalate');
  });
});
