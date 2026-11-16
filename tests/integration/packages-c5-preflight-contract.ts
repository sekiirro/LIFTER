// Shared contract + helpers for the F9 C5 preflight tests (T052, T064).
// T064a is implemented (supabase/migrations/20261121100000_f9_c5_package_preflight.sql). This file pins the interface the
// tests expect; if the preflight deliberately differs, change it HERE only.
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
//   input_mode (v2, migration 20261121110000): NULL -> 'all' (inventory of every package; never deletable),
//   '{}' -> 'empty' (explicit empty allow-list: status 'refused', never deletable), non-empty -> 'list'.
//   deletable (N1): true ONLY for input_mode 'list' with >=1 target, status clean|refused (never escalate)
//   and every refusal code === attached_offers_or_versions. A mock that still has offers/versions is
//   never 'clean' (it is 'refused' with exactly that code) and is deletable; a package with no
//   children (clean) is also deletable. Any other code, an escalation, NULL or '{}' input is not.
//   workspace_ids: distinct workspaces of the targets' offers/versions (and packages.workspace_id).
//   kind: fk | registration_link | client | subscription | payment | audit | unknown_dependency
//   refusal codes: non_synthetic | real_catalog_row | attached_offers_or_versions | required_financial_dependency
//                  | required_audit_dependency | unknown_dependency_state | caller_cannot_see_rows
//   (caller_cannot_see_rows: the calling role lacks BYPASSRLS/superuser, counts would be unreliable: escalate.
//   A target whose code is NULL is non_synthetic and synthetic=false.)
//   real_catalog_row: package with workspace_id set, a version with market set, or an offer with available=true.
//   required_audit_dependency: ONLY audit rows of client/financial dependents block. Audit rows that merely
//   name a mock package/offer/version are reported (kind audit) but do NOT block (PO Q1=A, S61-PO-2).
//   Zero writes of any kind (STABLE, executable inside a read-only transaction).
import type { Sql, TransactionSql } from 'postgres';

export const PREFLIGHT_FN = 'app_private.package_c5_preflight';

export type PreflightReport = {
  status: 'clean' | 'refused' | 'escalate';
  input_mode: 'all' | 'list' | 'empty';
  deletable: boolean;
  synthetic_only: boolean;
  workspace_ids: string[];
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

// Any BASE-TABLE column that names a package id, whether or not an FK covers it (unknown-state oracle).
// Views (for example registration_links_safe) are excluded: they derive from covered tables.
export async function packageReferenceColumns(q: Q) {
  const rows = await q.unsafe(`
    select n.nspname||'.'||c.relname||'.'||a.attname as col
      from pg_attribute a
      join pg_class c on c.oid=a.attrelid
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname in ('public','app_private')
       and c.relkind in ('r','p','f')
       and a.attnum>0 and not a.attisdropped
       and a.attname in ('package_id','package_offer_id','package_version_id')
       and c.relname not in ('packages','package_offers','package_versions')
     order by 1`);
  return rows.map((r) => r.col as string);
}
