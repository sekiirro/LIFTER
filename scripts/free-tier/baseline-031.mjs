// PI-03 baseline harness (spec 031 slice 1).
// Thin orchestrator over the existing spec 008 tooling: it calls the same
// http-probe.probe(), percentile() and pilot-volume projection, and adds a
// synthetic DB query-class measurement at the spec 008 pilot volumes.
// It creates no duplicate load generator, writes no product data and never
// asserts a pass/fail budget before the PO signs one (S71-PO-7).
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { probe } from './http-probe.mjs';
import {
  assertAllHttpSamplesAre200,
  requestWithSyntheticCookies,
} from './lib/authenticated-http.mjs';
import { percentile } from './lib/stats.mjs';
import { projectPilotVolumes } from './lib/pilot-volumes.mjs';
import { parseArgs, requireArgs } from '../backup/lib/args.mjs';
import { isMain, output, run } from './lib/cli.mjs';
import { assertLocalStackTarget, selectStack } from '../local-stack.mjs';

const roundUp = (value, step, floor) =>
  Math.max(floor, Math.ceil(value / step) * step);

export function pilotVolumeReport(volumes) {
  return {
    inputs: volumes.inputs,
    derivedVolumes: volumes.derivedVolumes,
    unverified: volumes.unverified,
  };
}

function sessionClientOptions() {
  return {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
}

async function createSyntheticSession(role, apiUrl, anonKey, admin) {
  const email = `s72-baseline-${role}-${randomUUID()}@example.test`;
  const password = `S72-${randomUUID()}-Aa1!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error(`Could not create synthetic ${role} baseline identity`);
  const userId = created.data.user.id;
  try {
    if (role === 'po') {
      const profile = await admin.from('staff_profiles').insert({
        user_id: userId,
        role: 'platform_owner',
        display_name: 'Test Staff Fixture',
      });
      if (profile.error)
        throw new Error('Could not create synthetic PO baseline profile');
    }
    const identity = createClient(apiUrl, anonKey, sessionClientOptions());
    const signedIn = await identity.auth.signInWithPassword({
      email,
      password,
    });
    if (signedIn.error || !signedIn.data.session)
      throw new Error(`Could not sign in synthetic ${role} baseline identity`);

    const collected = [];
    const serverClient = createServerClient(apiUrl, anonKey, {
      cookies: {
        getAll: () => [],
        setAll: (values) => collected.push(...values),
      },
    });
    const installed = await serverClient.auth.setSession({
      access_token: signedIn.data.session.access_token,
      refresh_token: signedIn.data.session.refresh_token,
    });
    if (installed.error || collected.length === 0)
      throw new Error(`Could not create synthetic ${role} SSR session`);
    return {
      userId,
      cookie: collected.map(({ name, value }) => `${name}=${value}`).join('; '),
    };
  } catch (error) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    throw error;
  }
}

async function createSyntheticSessions() {
  const stack = selectStack();
  const apiUrl = process.env.API_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey =
    process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.DB_URL ?? process.env.SUPABASE_DB_URL;
  if (!apiUrl || !anonKey || !serviceRoleKey || !dbUrl)
    throw new Error('Safe local stack environment is incomplete');
  assertLocalStackTarget({ stack, apiUrl, dbUrl });
  const admin = createClient(apiUrl, serviceRoleKey, sessionClientOptions());
  const cookiesByRole = {};
  const userIds = [];
  let workspaceId;
  const cleanup = async () => {
    let failed = false;
    if (workspaceId) {
      const workspace = await admin
        .from('workspaces')
        .delete()
        .eq('id', workspaceId);
      failed ||= Boolean(workspace.error);
    }
    if (userIds[0]) {
      const profile = await admin
        .from('staff_profiles')
        .delete()
        .eq('user_id', userIds[0]);
      failed ||= Boolean(profile.error);
    }
    for (const userId of userIds) {
      const deleted = await admin.auth.admin.deleteUser(userId);
      failed ||= Boolean(deleted.error);
    }
    if (failed)
      throw new Error('Could not fully clean up synthetic baseline fixtures');
  };
  try {
    for (const role of ['po', 'client']) {
      const session = await createSyntheticSession(
        role,
        apiUrl,
        anonKey,
        admin,
      );
      cookiesByRole[role] = session.cookie;
      userIds.push(session.userId);
    }
    const workspace = await admin
      .from('workspaces')
      .insert({
        name: 'Synthetic baseline workspace',
        slug: `s72-baseline-${randomUUID()}`,
        created_by: userIds[0],
      })
      .select('id')
      .single();
    if (workspace.error || !workspace.data?.id)
      throw new Error('Could not seed synthetic baseline workspace');
    workspaceId = workspace.data.id;
  } catch (error) {
    await cleanup().catch(() => {});
    throw error;
  }
  return {
    cookiesByRole,
    fixture: { actorId: userIds[0], workspaceId },
    cleanup,
  };
}

async function dbClasses(connectionString, requests, concurrency, fixture) {
  if (!connectionString)
    throw new Error('Safe local stack DB_URL is required for DB query classes');
  if (!fixture?.actorId || !fixture?.workspaceId)
    throw new Error('Synthetic baseline workspace fixture is incomplete');
  const sql = postgres(connectionString, { max: 8, connect_timeout: 10 });
  try {
    const classes = {
      directory_page_1: [null, 50, 0, null],
      directory_page_6: [null, 50, 250, null],
      directory_search_filter: ['Pilot client 1', 50, 0, null],
      directory_approval_filter: [null, 50, 0, 'approved'],
    };
    const results = [];
    for (const [name, [search, limit, offset, approval]] of Object.entries(
      classes,
    )) {
      const call = async () =>
        sql.begin(async (tx) => {
          await tx`select set_config('role','authenticated',true)`;
          await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.actorId, role: 'authenticated' })},true)`;
          const rows =
            await tx`select jsonb_agg(t) as payload from public.staff_client_directory(${fixture.workspaceId}::uuid,${search}::text,${approval}::text,null::text,${limit},${offset},null::text) t`;
          return {
            bytes: Buffer.byteLength(
              rows[0]?.payload === null
                ? '[]'
                : JSON.stringify(rows[0]?.payload ?? []),
              'utf8',
            ),
            rows: Array.isArray(rows[0]?.payload)
              ? rows[0].payload.length
              : rows[0]?.payload
                ? 1
                : 0,
          };
        });
      await call(); // warm-up
      const samples = [];
      let errors = 0;
      const started = performance.now();
      for (let i = 0; i < requests; i += concurrency) {
        const batch = await Promise.allSettled(
          Array.from(
            { length: Math.min(concurrency, requests - i) },
            async () => {
              const t0 = performance.now();
              const result = await call();
              return { ms: performance.now() - t0, ...result };
            },
          ),
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
        p50_ms: Number(
          percentile(
            samples.map((s) => s.ms),
            50,
          ).toFixed(2),
        ),
        p95_ms: Number(
          percentile(
            samples.map((s) => s.ms),
            95,
          ).toFixed(2),
        ),
        max_ms: Number(Math.max(...samples.map((s) => s.ms)).toFixed(2)),
        median_bytes: percentile(
          samples.map((s) => s.bytes),
          50,
        ),
        median_rows: percentile(
          samples.map((s) => s.rows),
          50,
        ),
        throughput_rps: Number((requests / (elapsed / 1000)).toFixed(1)),
        proposed_p95_budget_ms: roundUp(
          percentile(
            samples.map((s) => s.ms),
            95,
          ) * 2,
          25,
          100,
        ),
        proposed_error_budget_pct: 0.5,
      });
    }
    return results;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

export async function baseline(args, options = {}) {
  const matrix = JSON.parse(await readFile(args.routes, 'utf8'));
  const n = args.n ? Number(args.n) : (matrix.n ?? 20);
  const concurrency = args.concurrency
    ? Number(args.concurrency)
    : (matrix.concurrency ?? 2);
  const serverMode = options.serverMode ?? args['server-mode'];
  if (!['next-start-production', 'next-dev'].includes(serverMode))
    throw new Error('Choose --server-mode next-start-production or next-dev');
  const fixture = options.cookiesByRole
    ? null
    : await createSyntheticSessions();
  const cookiesByRole = options.cookiesByRole ?? fixture.cookiesByRole;
  try {
    const volumes = projectPilotVolumes();
    const sampledRoutes = await probe(
      matrix.base_url,
      matrix.routes,
      n,
      concurrency,
      requestWithSyntheticCookies(cookiesByRole),
    );
    const baseReport = {
      generated_utc: new Date().toISOString(),
      gate_status: 'PROPOSED_ONLY_NOT_A_GATE_PENDING_PO_SIGNATURE',
      authority: ['S71-PO-7', 'S70-PO-1 item N', 'S71-R10'],
      environment: {
        target: `local non-production Stack ${selectStack().toUpperCase()}, loopback:3000`,
        server_mode: serverMode,
        hosted_target: 'pending PI-04 approval; not used',
        data: 'synthetic only; no real client data, no secrets',
        cpu: 'not available locally; pending hosted run',
      },
      tooling: {
        http_probe:
          'scripts/free-tier/http-probe.mjs (spec 008 probe, extended with per-sample evidence)',
        stats: 'scripts/free-tier/lib/stats.mjs (spec 008, unmodified)',
        pilot_volumes:
          'scripts/free-tier/lib/pilot-volumes.mjs (spec 008, unmodified)',
        harness: 'scripts/free-tier/baseline-031.mjs (orchestration only)',
      },
      pilot_volumes: {
        ...pilotVolumeReport(volumes),
      },
      route_matrix: args.routes,
      requests_per_route: n,
      concurrency,
      http_routes: sampledRoutes.map((row, index) => ({
        ...row,
        surface: matrix.routes[index].surface,
        kind: matrix.routes[index].kind,
      })),
    };
    assertAllHttpSamplesAre200(baseReport);
    const httpReport = baseReport.http_routes.map((row) => ({
      ...row,
      proposed_p95_budget_ms: roundUp(row.p95_ms * 2, 50, 200),
      proposed_error_budget_pct: 1,
    }));
    const dbUrl = process.env.DB_URL ?? process.env.SUPABASE_DB_URL;
    const measured = await dbClasses(dbUrl, n, concurrency, fixture?.fixture);
    return {
      ...baseReport,
      pilot_volumes: {
        ...pilotVolumeReport(volumes),
      },
      http_routes: httpReport,
      db_query_classes: measured,
    };
  } catch (error) {
    if (error?.name === 'NonSuccessfulHttpResponsesError')
      error.report = {
        generated_utc: new Date().toISOString(),
        gate_status: 'PROPOSED_ONLY_NOT_A_GATE_PENDING_PO_SIGNATURE',
        environment: {
          target: `local non-production Stack ${selectStack().toUpperCase()}, loopback:3000`,
          server_mode: serverMode,
          hosted_target: 'pending PI-04 approval; not used',
          data: 'synthetic only; no real client data, no secrets',
        },
        route_matrix: args.routes,
        requests_per_route: n,
        concurrency,
        http_routes: error.report.http_routes,
        run_status: 'FAILED_NON_200_HTTP_SAMPLE',
      };
    throw error;
  } finally {
    await fixture?.cleanup();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2), [
    'routes',
    'n',
    'concurrency',
    'json',
    'server-mode',
  ]);
  requireArgs(args, ['routes']);
  if (!args['server-mode'])
    throw new Error('Missing --server-mode (next-start-production preferred)');
  try {
    const report = await baseline(args);
    console.table(
      report.http_routes.map((r) => ({
        route: r.route,
        p50_ms: r.p50_ms,
        p95_ms: r.p95_ms,
        max_ms: r.max_ms,
        statuses: JSON.stringify(r.statuses),
        proposed: r.proposed_p95_budget_ms,
      })),
    );
    console.table(
      report.db_query_classes.map((row) => ({
        query_class: row.query_class,
        requests: row.requests,
        errors: row.errors,
        p50_ms: row.p50_ms,
        p95_ms: row.p95_ms,
        max_ms: row.max_ms,
      })),
    );
    await output(report, args.json);
  } catch (error) {
    if (error?.report) {
      console.table(
        error.report.http_routes.map((r) => ({
          route: r.route,
          statuses: JSON.stringify(r.statuses),
          samples: r.status_samples.join(','),
        })),
      );
      await output(error.report, args.json);
    }
    throw error;
  }
}

if (isMain(import.meta.url)) run(main);
