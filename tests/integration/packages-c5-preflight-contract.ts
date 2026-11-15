// Shared contract + helpers for the F9 C5 preflight RED tests (T052, T064).
// The preflight (T064a) does NOT exist yet. This file pins the interface the RED
// tests expect so T064a can implement it; if T064a deliberately differs, change it HERE only.
//
//   app_private.package_c5_preflight(target_package_ids uuid[] default null) returns jsonb
//     null target_package_ids = the whole target stack (every row in public.packages).
//     {
//       status: 'clean' | 'refused' | 'escalate',
//       synthetic_only: boolean,
//       targets: [{ package_id, code, synthetic: boolean }],         -- complete inventory, no classification
//       dependencies: [{ edge: 'schema.table.column', kind, count }], -- every FK/registration-link/subscription/payment/audit edge
//       refusals: [{ package_id, code }]
//     }
//   kind: fk | registration_link | subscription | payment | audit
//   refusal codes: non_synthetic | attached_offers_or_versions | required_financial_dependency
//                  | required_audit_dependency | unknown_dependency_state
//   Zero writes of any kind (STABLE, executable inside a read-only transaction).
import type { Sql, TransactionSql } from 'postgres';

export const PREFLIGHT_FN = 'app_private.package_c5_preflight';

export type PreflightReport = {
  status: 'clean' | 'refused' | 'escalate';
  synthetic_only: boolean;
  targets: { package_id: string; code: string | null; synthetic: boolean }[];
  dependencies: { edge: string; kind: string; count: number }[];
  refusals: { package_id: string; code: string }[];
};

type Q = Sql | TransactionSql;

export async function runPreflight(
  q: Q,
  targets: string[] | null,
): Promise<PreflightReport> {
  const [row] = await q.unsafe(`select ${PREFLIGHT_FN}($1::uuid[]) as report`, [
    targets,
  ] as never);
  return row!.report as PreflightReport;
}

export const SNAPSHOT_TABLES = [
  'packages',
  'package_offers',
  'package_versions',
  'registration_links',
  'clients',
  'subscriptions',
  'subscription_renewals',
  'subscription_upgrades',
  'payment_events',
  'audit_events',
] as const;

// Row identity + version snapshot (count and xmin/ctid digest per table): any insert,
// update (new tuple version) or delete changes it.
export async function rowSnapshot(q: Q) {
  const out: Record<string, string> = {};
  for (const t of SNAPSHOT_TABLES) {
    const [r] = await q.unsafe(
      `select count(*)::text||':'||coalesce(md5(string_agg(x.xmin::text||'/'||x.ctid::text, ',' order by x.ctid)),'') as s from public.${t} x`,
    );
    out[t] = r!.s as string;
  }
  return out;
}

// Row writes observed so far inside THIS transaction (pg_stat_xact_user_tables).
export async function xactWrites(q: Q) {
  const [r] = await q.unsafe(
    `select coalesce(sum(n_tup_ins+n_tup_upd+n_tup_del),0)::int as writes
       from pg_stat_xact_user_tables where schemaname in ('public','app_private')`,
  );
  return r!.writes as number;
}

// Catalog oracle, independent of the preflight: every FK pointing at the package tables.
export async function catalogFkEdges(q: Q) {
  const rows = await q.unsafe(`
    select distinct cn.nspname||'.'||cc.relname as source_table, con.conname,
           pn.nspname||'.'||pc.relname as target_table
      from pg_constraint con
      join pg_class cc on cc.oid=con.conrelid join pg_namespace cn on cn.oid=cc.relnamespace
      join pg_class pc on pc.oid=con.confrelid join pg_namespace pn on pn.oid=pc.relnamespace
     where con.contype='f' and pn.nspname='public'
       and pc.relname in ('packages','package_offers','package_versions')
     order by 1,2`);
  return rows.map((r) => `${r.source_table}#${r.conname}->${r.target_table}`);
}

// Any column that names a package id, whether or not an FK covers it (unknown-state oracle).
export async function packageReferenceColumns(q: Q) {
  const rows = await q.unsafe(`
    select table_schema||'.'||table_name||'.'||column_name as col
      from information_schema.columns
     where table_schema in ('public','app_private')
       and column_name in ('package_id','package_offer_id','package_version_id')
       and table_name not in ('packages','package_offers','package_versions')
     order by 1`);
  return rows.map((r) => r.col as string);
}
