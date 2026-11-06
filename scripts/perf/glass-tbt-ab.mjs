import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForServerReady } from './server-readiness.mjs';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import postgres from 'postgres';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const afterRoot = path.resolve(
  process.env.GLASS_AFTER_ROOT ?? path.join(scriptDir, '../..'),
);
if (!process.env.GLASS_BEFORE_ROOT)
  throw new Error('Set GLASS_BEFORE_ROOT to the baseline checkout');
const beforeRoot = path.resolve(process.env.GLASS_BEFORE_ROOT);
const reportRoot = path.resolve(
  process.env.GLASS_REPORT_ROOT ??
    path.join(scriptDir, '../../.reports/glass-tbt-ab'),
);
const beforeUrl = process.env.GLASS_BEFORE_URL ?? 'http://127.0.0.1:4356';
const afterUrl = process.env.GLASS_AFTER_URL ?? 'http://127.0.0.1:4355';
const routePath = '/registration-links';
const measuredPerArm = Number(process.env.GLASS_SAMPLES ?? 15);
const warmupsPerArm = Number(process.env.GLASS_WARMUPS ?? 2);
const traceEnabled = process.env.GLASS_TRACE === '1';
const viewportArg = process.argv.find((argument) =>
  argument.startsWith('--viewport='),
);
const viewportName =
  viewportArg?.slice('--viewport='.length) ??
  process.env.GLASS_VIEWPORT ??
  'mobile';
const viewport =
  viewportName === 'desktop'
    ? { width: 1440, height: 900, isMobile: false, hasTouch: false }
    : viewportName === 'mobile'
      ? { width: 390, height: 844, isMobile: true, hasTouch: true }
      : null;
if (!viewport) throw new Error('Use --viewport=mobile or --viewport=desktop');

if (new URL(beforeUrl).port === '3300' || new URL(afterUrl).port === '3300')
  throw new Error('Port 3300 is forbidden');
if (new URL(beforeUrl).port !== '4356' || new URL(afterUrl).port !== '4355')
  throw new Error('Use the assigned ports: before 4356, after 4355');
if (
  !process.env.DB_URL ||
  !process.env.API_URL ||
  !process.env.ANON_KEY ||
  !process.env.SERVICE_ROLE_KEY
)
  throw new Error(
    'DB_URL, API_URL, ANON_KEY and SERVICE_ROLE_KEY are required',
  );
const apiEndpoint = new URL(process.env.API_URL);
const dbEndpoint = new URL(process.env.DB_URL);
if (
  apiEndpoint.protocol !== 'http:' ||
  apiEndpoint.hostname !== '127.0.0.1' ||
  apiEndpoint.port !== '25421' ||
  dbEndpoint.hostname !== '127.0.0.1' ||
  dbEndpoint.port !== '25422' ||
  dbEndpoint.pathname !== '/postgres'
)
  throw new Error(
    'Use the assigned loopback Stack B API and database endpoints',
  );

process.chdir(afterRoot);

const servers = [];

function spawnServer(root, url, label) {
  const port = new URL(url).port;
  const nextBin = path.join(root, 'node_modules/next/dist/bin/next');
  const child = spawn(
    process.execPath,
    [nextBin, 'start', '--hostname', '127.0.0.1', '--port', port],
    {
      cwd: root,
      env: (() => {
        const environment = { ...process.env };
        delete environment.LIFTER_SHOWCASE;
        return {
          ...environment,
          PORT: port,
          APP_ORIGIN: url,
          NEXT_TELEMETRY_DISABLED: '1',
        };
      })(),
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  servers.push(child);
  return waitForServerReady(child, url, label);
}

async function existingRouteFixture() {
  const admin = createClient(
    process.env.API_URL,
    process.env.SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      perPage: 100,
      page,
    });
    if (error)
      throw new Error(
        `Could not list existing Stack B users: ${error.message}`,
      );
    users.push(...data.users);
    process.stdout.write(
      `Stack B user page ${page}: ${data.users.length} existing users\n`,
    );
    if (data.users.length < 100) break;
  }
  const fixtureUsers = users.filter((user) =>
    user.email?.endsWith('@example.test'),
  );
  const ids = fixtureUsers.map((user) => user.id);
  if (!ids.length) throw new Error('No existing Stack B fixture users found');
  const { data: profiles, error: profilesError } = await admin
    .from('staff_profiles')
    .select('user_id')
    .eq('role', 'trainer')
    .limit(100);
  process.stdout.write(`Found ${profiles?.length ?? 0} trainer profiles\n`);
  if (profilesError)
    throw new Error(
      `Could not find existing trainers: ${profilesError.message}`,
    );
  const trainerIds = (profiles ?? [])
    .map((row) => row.user_id)
    .filter((id) => ids.includes(id));
  const { data: memberships, error: membershipsError } = await admin
    .from('workspace_memberships')
    .select('user_id,workspace_id')
    .in('user_id', trainerIds)
    .is('revoked_at', null);
  process.stdout.write(
    `Found ${memberships?.length ?? 0} active trainer memberships\n`,
  );
  if (membershipsError)
    throw new Error(
      `Could not find existing trainer workspaces: ${membershipsError.message}`,
    );
  const byId = new Map(fixtureUsers.map((user) => [user.id, user]));
  const db = postgres(process.env.DB_URL, { max: 1, connect_timeout: 10 });
  let seededWorkspaces;
  try {
    seededWorkspaces =
      await db`select workspace_id, count(*)::int as link_count from public.registration_links group by workspace_id order by max(created_at) desc`;
  } finally {
    await db.end();
  }
  process.stdout.write(
    `Found ${seededWorkspaces.length} workspaces with seeded rows\n`,
  );
  const linksByWorkspace = new Map(
    seededWorkspaces.map((row) => [row.workspace_id, row.link_count]),
  );
  for (const membership of memberships ?? []) {
    const user = byId.get(membership.user_id);
    if (!user?.email) continue;
    const count = linksByWorkspace.get(membership.workspace_id) ?? 0;
    if (count >= 12)
      return {
        email: user.email,
        workspaceId: membership.workspace_id,
        existingLinkCount: count,
      };
  }
  throw new Error(
    'No existing Stack B trainer workspace has registration links',
  );
}

async function existingSession(email) {
  const admin = createClient(
    process.env.API_URL,
    process.env.SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash)
    throw new Error(
      `Could not issue in-memory Stack B session: ${error?.message ?? 'missing token hash'}`,
    );
  const anon = createClient(process.env.API_URL, process.env.ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const verified = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (verified.error || !verified.data.session)
    throw new Error(
      `Could not verify in-memory Stack B session: ${verified.error?.message ?? 'missing session'}`,
    );
  return verified.data.session;
}

async function verifyExistingLinks(fixture, session) {
  const userClient = createClient(process.env.API_URL, process.env.ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const set = await userClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (set.error)
    throw new Error(
      'Could not set existing trainer session for data verification',
    );
  const { data, error } = await userClient
    .from('registration_links_safe')
    .select('id')
    .eq('workspace_id', fixture.workspaceId)
    .limit(100);
  if (error)
    throw new Error(
      `Existing trainer cannot read seeded registration data: ${error.code ?? 'unknown'}`,
    );
  if (!data?.length)
    throw new Error(
      'Selected existing Stack B trainer workspace has no seeded registration links',
    );
  return data.length;
}

function cookieForBrowser(cookie, origin) {
  const options = cookie.options ?? {};
  const expires =
    options.expires instanceof Date
      ? Math.floor(options.expires.getTime() / 1000)
      : typeof options.expires === 'number'
        ? Math.floor(options.expires)
        : typeof options.maxAge === 'number'
          ? Math.floor(Date.now() / 1000) + options.maxAge
          : Math.floor(Date.now() / 1000) + 3600;
  return {
    name: cookie.name,
    value: cookie.value,
    url: origin,
    expires,
    ...(options.httpOnly !== undefined ? { httpOnly: options.httpOnly } : {}),
    ...(options.sameSite
      ? {
          sameSite:
            options.sameSite === 'strict'
              ? 'Strict'
              : options.sameSite === 'none'
                ? 'None'
                : 'Lax',
        }
      : {}),
  };
}

async function installSession(context, origin, session) {
  const cookies = [];
  const client = createServerClient(process.env.API_URL, process.env.ANON_KEY, {
    cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
  });
  const result = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (result.error || cookies.length === 0)
    throw new Error('Could not create browser session cookies');
  await context.addCookies(
    cookies.map((cookie) => cookieForBrowser(cookie, origin)),
  );
}

async function sample(
  browser,
  arm,
  url,
  session,
  workspaceId,
  ordinal,
  warmup,
) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
  });
  await context.grantPermissions([]).catch(() => {});
  await installSession(context, url, session);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
    connectionType: 'cellular3g',
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '3g', saveData: false, rtt: 150, downlink: 1.6 },
    });
    window.__glassPerf = { lcp: 0, cls: 0, fcp: 0, longTasks: [] };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        window.__glassPerf.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (!entry.hadRecentInput) window.__glassPerf.cls += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        window.__glassPerf.longTasks.push({
          startTime: entry.startTime,
          duration: entry.duration,
          name: entry.name,
          attribution:
            entry.attribution?.map((item) => item.name ?? item.entryType) ?? [],
        });
    }).observe({ type: 'longtask', buffered: true });
  });
  let traceEvents;
  if (traceEnabled && !warmup && ordinal === 1)
    await cdp.send('Tracing.start', {
      categories: 'devtools.timeline,v8.execute,blink.user_timing,loading',
      transferMode: 'ReturnAsStream',
    });
  const target = new URL(
    `${routePath}?workspace=${encodeURIComponent(workspaceId)}`,
    url,
  );
  const response = await page.goto(target.toString(), {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });
  if (!response?.ok())
    throw new Error(
      `${arm} authenticated route returned ${response?.status() ?? 'no response'}`,
    );
  const finalUrl = new URL(page.url());
  if (finalUrl.pathname !== routePath)
    throw new Error(
      `${arm} navigation redirected to ${finalUrl.pathname}; expected ${routePath}`,
    );
  await page
    .getByRole('heading')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(6000);
  const values = await page.evaluate(() => {
    const perf = window.__glassPerf;
    const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
    const fcp = fcpEntry?.startTime ?? 0;
    const windowEnd = fcp + 5000;
    const longTasks = perf.longTasks.filter(
      (task) =>
        task.startTime + task.duration > fcp && task.startTime < windowEnd,
    );
    const tbt = longTasks.reduce(
      (total, task) => total + Math.max(0, task.duration - 50),
      0,
    );
    const modes = [...document.querySelectorAll('[data-glass-runtime]')].map(
      (element) => element.getAttribute('data-glass-runtime'),
    );
    return {
      fcpMs: fcp,
      lcpMs: perf.lcp,
      cls: perf.cls,
      tbtMs: tbt,
      longTasks,
      runtimeModes: modes,
      runtimeMode: modes[0] ?? null,
    };
  });
  if (traceEnabled && !warmup && ordinal === 1) {
    const complete = new Promise((resolve) =>
      cdp.once('Tracing.tracingComplete', resolve),
    );
    await cdp.send('Tracing.end');
    const { stream } = await complete;
    let trace = '';
    try {
      while (true) {
        const chunk = await cdp.send('IO.read', { handle: stream });
        trace += chunk.data;
        if (chunk.eof) break;
      }
    } finally {
      await cdp.send('IO.close', { handle: stream });
    }
    traceEvents = trace;
  }
  await context.close();
  if (traceEvents)
    await writeFile(
      path.join(reportRoot, `trace-${viewportName}-${arm}.json`),
      traceEvents,
    );
  return { arm, ordinal, warmup, ...values };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
function summarize(values) {
  return {
    median: median(values),
    iqr: [quantile(values, 0.25), quantile(values, 0.75)],
    min: Math.min(...values),
    max: Math.max(...values),
  };
}
function bootstrapMedianCI(values, iterations = 10_000) {
  let seed = 0x51a7;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  const estimates = Array.from({ length: iterations }, () =>
    median(
      Array.from(
        { length: values.length },
        () => values[Math.floor(random() * values.length)],
      ),
    ),
  );
  return {
    low: quantile(estimates, 0.025),
    high: quantile(estimates, 0.975),
    resamples: iterations,
  };
}

async function main() {
  await mkdir(reportRoot, { recursive: true });
  process.stdout.write(
    'Selecting an existing Stack B trainer and workspace…\n',
  );
  const fixture = await existingRouteFixture();
  process.stdout.write(
    'Issuing an in-memory session for the existing trainer…\n',
  );
  const session = await existingSession(fixture.email);
  fixture.existingLinkCount = await verifyExistingLinks(fixture, session);
  process.stdout.write(
    `Reusing ${fixture.existingLinkCount} existing links; starting production servers…\n`,
  );
  const raw = [];
  let browser;
  try {
    await Promise.all([
      spawnServer(beforeRoot, beforeUrl, 'BEFORE'),
      spawnServer(afterRoot, afterUrl, 'AFTER'),
    ]);
    process.stdout.write('Both production servers are ready; measuring…\n');
    browser = await chromium.launch({ headless: true });
    for (let index = 0; index < warmupsPerArm; index++) {
      raw.push(
        await sample(
          browser,
          'before',
          beforeUrl,
          session,
          fixture.workspaceId,
          index + 1,
          true,
        ),
      );
      process.stdout.write(
        `Warm-up ${index + 1}/${warmupsPerArm}: BEFORE complete\n`,
      );
      raw.push(
        await sample(
          browser,
          'after',
          afterUrl,
          session,
          fixture.workspaceId,
          index + 1,
          true,
        ),
      );
      process.stdout.write(
        `Warm-up ${index + 1}/${warmupsPerArm}: AFTER complete\n`,
      );
    }
    for (let index = 0; index < measuredPerArm; index++) {
      raw.push(
        await sample(
          browser,
          'before',
          beforeUrl,
          session,
          fixture.workspaceId,
          index + 1,
          false,
        ),
      );
      process.stdout.write(
        `Pair ${index + 1}/${measuredPerArm}: BEFORE complete\n`,
      );
      raw.push(
        await sample(
          browser,
          'after',
          afterUrl,
          session,
          fixture.workspaceId,
          index + 1,
          false,
        ),
      );
      process.stdout.write(
        `Pair ${index + 1}/${measuredPerArm}: AFTER complete\n`,
      );
    }
  } finally {
    await browser?.close();
    for (const server of servers) server.kill();
  }
  const measured = raw.filter((entry) => !entry.warmup);
  const before = measured.filter((entry) => entry.arm === 'before');
  const after = measured.filter((entry) => entry.arm === 'after');
  const diffs = before.map((entry, index) => after[index].tbtMs - entry.tbtMs);
  const summary = {
    protocol: {
      viewport: `${viewport.width}x${viewport.height}`,
      viewportName,
      dpr: 2,
      cpuThrottle: 4,
      latencyMs: 150,
      network: 'constrained 4-core/4-GB/3G',
      warmupsPerArm,
      measuredPerArm,
      order: 'B,A strictly interleaved',
      freshContextEachLoad: true,
      pairedBootstrapResamples: 10_000,
    },
    fixture: {
      stack: 'B',
      workspaceId: fixture.workspaceId,
      existingRegistrationLinkCount: fixture.existingLinkCount,
      fixtureRowsAdded: 0,
    },
    metrics: Object.fromEntries(
      ['tbtMs', 'lcpMs', 'cls'].map((key) => [
        key,
        {
          before: summarize(before.map((entry) => entry[key])),
          after: summarize(after.map((entry) => entry[key])),
        },
      ]),
    ),
    pairedTbtDifference: {
      medianMs: median(diffs),
      ci95: bootstrapMedianCI(diffs),
      gateMs: 50,
      pass: median(diffs) <= 50,
    },
    raw,
  };
  const metricsPath = path.join(reportRoot, `metrics-${viewportName}.json`);
  await writeFile(metricsPath, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ pairedTbtDifference: summary.pairedTbtDifference, tbt: summary.metrics.tbtMs, lcp: summary.metrics.lcpMs, cls: summary.metrics.cls, evidence: metricsPath }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
