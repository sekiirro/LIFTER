// PI-03 baseline harness (spec 031 slice 1).
// Thin orchestrator over the existing spec 008 tooling: it calls the same
// http-probe.probe(), percentile() and pilot-volume projection, and adds a
// synthetic DB query-class measurement at the spec 008 pilot volumes.
// It creates no duplicate load generator, writes no product data and never
// asserts a pass/fail budget before the PO signs one (S71-PO-7).
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import postgres from 'postgres';
import { probe } from './http-probe.mjs';
import { percentile } from './lib/stats.mjs';
import { projectPilotVolumes } from './lib/pilot-volumes.mjs';
import { parseArgs, requireArgs } from '../backup/lib/args.mjs';
import { isMain, output, run } from './lib/cli.mjs';

const roundUp = (value, step, floor) =>
  Math.max(floor, Math.ceil(value / step) * step);

async function dbClasses(connectionString, requests, concurrency) {
  if (!connectionString) return null;
  const sql = postgres(connectionString, { max: 8, connect_timeout: 10 });
  try {
    const [actor] = await sql`select user_id from public.staff_profiles where role='platform_owner' limit 1`;
    const [workspace] = await sql`select id from public.workspaces order by name limit 1`;
    if (!actor?.user_id || !workspace?.id)
      throw new Error('Synthetic pilot fixture missing (role/workspace)');
    const classes = {
      directory_page_1: [null, 50, 0, null],
      directory_page_6: [null, 50, 250, null],
      directory_search_filter: ['Pilot client 1', 50, 0, null],
      directory_approval_filter: [null, 50, 0, 'approved'],
    };
    const results = [];
    for (const [name, [search, limit, offset, approval]] of Object.entries(classes)) {
      const call = async () =>
        sql.begin(async (tx) => {
          await tx`select set_config('role','authenticated',true)`;
          await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actor.user_id, role: 'authenticated' })},true)`;
          const rows = await tx`select jsonb_agg(t) as payload from public.staff_client_directory(${workspace.id}::uuid,${search}::text,${approval}::text,null::text,${limit},${offset},null::text) t`;
          return { bytes: Buffer.byteLength(rows[0]?.payload === null ? '[]' : JSON.stringify(rows[0]?.payload ?? []), 'utf8'), rows: Array.isArray(rows[0]?.payload) ? rows[0].payload.length : rows[0]?.payload ? 1 : 0 };
        });
      await call(); // warm-up
      const samples = [];
      let errors = 0;
      const started = performance.now();
      for (let i = 0; i < requests; i += concurrency) {
        const batch = await Promise.allSettled(
          Array.from({ length: Math.min(concurrency, requests - i) }, async () => {
            const t0 = performance.now();
            const result = await call();
            return { ms: performance.now() - t0, ...result };
          }),
        );
        for (const item of batch) {
          if (item.status === 'fulfilled') samples.push(item.value);
          else errors += 1;
        }
      }
      const elapsed = performance.now() - started;
      results.push({
        query_class: name,
        requests,
        concurrency,
        errors,
        p50_ms: Number(percentile(samples.map((s) => s.ms), 50).toFixed(2)),
        p95_ms: Number(percentile(samples.map((s) => s.ms), 95).toFixed(2)),
        max_ms: Number(Math.max(...samples.map((s) => s.ms)).toFixed(2)),
        median_bytes: percentile(samples.map((s) => s.bytes), 50),
        median_rows: percentile(samples.map((s) => s.rows), 50),
        throughput_rps: Number((requests / (elapsed / 1000)).toFixed(1)),
        proposed_p95_budget_ms: roundUp(percentile(samples.map((s) => s.ms), 95) * 2, 25, 100),
        proposed_error_budget_pct: 0.5,
      });
    }
    return results;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

export async function baseline(args) {
  const matrix = JSON.parse(await readFile(args.routes, 'utf8'));
  const n = args.n ? Number(args.n) : matrix.n ?? 20;
  const concurrency = args.concurrency ? Number(args.concurrency) : matrix.concurrency ?? 2;
  const httpReport = await probe(
    matrix.base_url,
    matrix.routes,
    n,
    concurrency,
  ).then((rows) =>
    rows.map((row, index) => ({
      ...row,
      surface: matrix.routes[index].surface,
      kind: matrix.routes[index].kind,
      proposed_p95_budget_ms: roundUp(row.p95_ms * 2, 50, 200),
      proposed_error_budget_pct: 1,
    })),
  );
  const volumes = projectPilotVolumes();
  const measured = await dbClasses(process.env.SUPABASE_DB_URL, n, concurrency);
  return {
    generated_utc: new Date().toISOString(),
    gate_status: 'PROPOSED_ONLY_NOT_A_GATE_PENDING_PO_SIGNATURE',
    authority: ['S71-PO-7', 'S70-PO-1 item N', 'S71-R10'],
    environment: {
      target: 'local non-production Stack D (Docker Desktop), Next dev server on loopback:3000',
      hosted_target: 'pending PI-04 approval; not used',
      data: 'synthetic only; no real client data, no secrets',
      cpu: 'not available locally (platform request logs only); pending hosted run',
    },
    tooling: {
      http_probe: 'scripts/free-tier/http-probe.mjs (spec 008, unmodified)',
      stats: 'scripts/free-tier/lib/stats.mjs (spec 008, unmodified)',
      pilot_volumes: 'scripts/free-tier/lib/pilot-volumes.mjs (spec 008, unmodified)',
      harness: 'scripts/free-tier/baseline-031.mjs (orchestration only)',
    },
    pilot_volumes: { inputs: volumes.inputs, derivedVolumes: volumes.derivedVolumes, unverified: volumes.unverified },
    route_matrix: args.routes,
    requests_per_route: n,
    concurrency,
    http_routes: httpReport,
    db_query_classes: measured,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), [
    'routes', 'n', 'concurrency', 'json',
  ]);
  requireArgs(args, ['routes']);
  const report = await baseline(args);
  console.table(
    report.http_routes.map((r) => ({
      route: r.route, p50_ms: r.p50_ms, p95_ms: r.p95_ms,
      statuses: JSON.stringify(r.statuses), proposed: r.proposed_p95_budget_ms,
    })),
  );
  await output(report, args.json);
}

if (isMain(import.meta.url)) run(main);
