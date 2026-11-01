import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(
  process.env.GLASS_AFTER_ROOT ?? path.join(scriptDir, '../..'),
);
const reportRoot = path.resolve(
  process.env.GLASS_REPORT_ROOT ??
    'C:/Users/NEW LAP/.lifter/reports/s21-glass/r7',
);
const afterUrl = 'http://127.0.0.1:4355';
const routePath = '/registration-links';
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const servers = [];

if (
  !process.env.API_URL ||
  !process.env.ANON_KEY ||
  !process.env.SERVICE_ROLE_KEY ||
  !process.env.DB_URL
)
  throw new Error(
    'Run through supabase-safe.mjs for Stack B environment injection',
  );

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function spawnServer(serverRoot, origin, name) {
  const port = new URL(origin).port;
  const child = spawn(
    process.execPath,
    [
      path.join(serverRoot, 'node_modules/next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      port,
    ],
    {
      cwd: serverRoot,
      env: (() => {
        const environment = { ...process.env };
        delete environment.LIFTER_SHOWCASE;
        return {
          ...environment,
          PORT: port,
          APP_ORIGIN: origin,
          NEXT_TELEMETRY_DISABLED: '1',
        };
      })(),
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  servers.push(child);
  return (async () => {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null)
        throw new Error(`${name} server exited (${child.exitCode})`);
      try {
        if ((await fetch(new URL('/api/health', origin))).ok) return;
      } catch {}
      await sleep(250);
    }
    throw new Error(`${name} server did not become ready`);
  })();
}

async function findExistingFixture() {
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
    if (data.users.length < 100) break;
  }
  const fixtureUsers = users.filter((user) =>
    user.email?.endsWith('@example.test'),
  );
  const userIds = fixtureUsers.map((user) => user.id);
  const { data: profiles, error: profileError } = await admin
    .from('staff_profiles')
    .select('user_id')
    .eq('role', 'trainer')
    .limit(100);
  if (profileError)
    throw new Error(
      `Could not find existing trainers: ${profileError.message}`,
    );
  const trainerIds = (profiles ?? [])
    .map((row) => row.user_id)
    .filter((id) => userIds.includes(id));
  const { data: memberships, error: memberError } = await admin
    .from('workspace_memberships')
    .select('user_id,workspace_id')
    .in('user_id', trainerIds)
    .is('revoked_at', null);
  if (memberError)
    throw new Error(
      `Could not find existing trainer workspaces: ${memberError.message}`,
    );
  const db = postgres(process.env.DB_URL, { max: 1, connect_timeout: 10 });
  let rows;
  try {
    rows =
      await db`select workspace_id, count(*)::int as link_count from public.registration_links group by workspace_id`;
  } finally {
    await db.end();
  }
  const counts = new Map(rows.map((row) => [row.workspace_id, row.link_count]));
  const usersById = new Map(fixtureUsers.map((user) => [user.id, user]));
  for (const membership of memberships ?? []) {
    const user = usersById.get(membership.user_id);
    const count = counts.get(membership.workspace_id) ?? 0;
    if (user?.email && count >= 12)
      return {
        email: user.email,
        workspaceId: membership.workspace_id,
        existingLinkCount: count,
      };
  }
  throw new Error(
    'Could not find an existing trainer workspace with a 12-row fixture',
  );
}

async function issueExistingSession(email) {
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
  if (error || !data?.properties?.hashed_token)
    throw new Error(
      `Could not issue in-memory existing-user session: ${error?.message ?? 'missing token hash'}`,
    );
  const anon = createClient(process.env.API_URL, process.env.ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const verified = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  if (verified.error || !verified.data.session)
    throw new Error(
      `Could not verify existing-user session: ${verified.error?.message ?? 'missing session'}`,
    );
  return verified.data.session;
}

function browserCookie(cookie, origin) {
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

async function setupContext(browser, origin, session, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: options.isMobile ?? true,
    hasTouch: options.isMobile ?? true,
    reducedMotion: 'no-preference',
  });
  const cookies = [];
  const sessionClient = createServerClient(
    process.env.API_URL,
    process.env.ANON_KEY,
    {
      cookies: {
        getAll: () => [],
        setAll: (entries) => cookies.push(...entries),
      },
    },
  );
  const result = await sessionClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (result.error || !cookies.length)
    throw new Error('Could not create browser session cookies');
  await context.addCookies(
    cookies.map((cookie) => browserCookie(cookie, origin)),
  );
  await context.addCookies([
    { name: 'lifter_locale', value: options.locale ?? 'en', url: origin },
    { name: 'lifter_theme', value: options.theme ?? 'light', url: origin },
  ]);
  return context;
}

async function openRoute(
  context,
  origin,
  workspaceId,
  deviceTier = 'constrained',
) {
  const page = await context.newPage();
  if (deviceTier === 'high') {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        configurable: true,
        value: 8,
      });
      Object.defineProperty(navigator, 'deviceMemory', {
        configurable: true,
        value: 8,
      });
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { effectiveType: '4g', saveData: false },
      });
      const tasks = [];
      Object.defineProperty(window, '__glassProfileTasks', { value: tasks });
      if (PerformanceObserver.supportedEntryTypes.includes('longtask'))
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            tasks.push({
              startTime: entry.startTime,
              duration: entry.duration,
              name: entry.name,
            });
        }).observe({ type: 'longtask', buffered: true });
    });
  } else {
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
        value: {
          effectiveType: '3g',
          saveData: false,
          rtt: 150,
          downlink: 1.6,
        },
      });
    });
  }
  const url = new URL(
    `${routePath}?workspace=${encodeURIComponent(workspaceId)}`,
    origin,
  );
  const response = await page.goto(url.toString(), {
    waitUntil: deviceTier === 'high' ? 'domcontentloaded' : 'networkidle',
    timeout: 120_000,
  });
  if (!response?.ok())
    throw new Error(
      `Authenticated route returned ${response?.status() ?? 'no response'}`,
    );
  await page.getByRole('heading').first().waitFor({ state: 'visible' });
  return page;
}

async function makeSheet(browser, filename, panels, style) {
  const figures = await Promise.all(
    panels.map(
      async ({ label, file }) =>
        `<figure><figcaption>${label}</figcaption><img src="data:image/png;base64,${(await readFile(file)).toString('base64')}" /></figure>`,
    ),
  );
  const context = await browser.newContext({
    viewport: style.viewport,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.setContent(
    `<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;padding:20px;background:#eef1f4;color:#111;font:600 20px system-ui}main{display:grid;grid-template-columns:repeat(${style.columns},minmax(0,1fr));gap:16px}figure{margin:0;padding:10px;background:white;border:1px solid #c7cdd2;border-radius:8px}figcaption{padding:4px 6px 10px}img{display:block;width:100%;height:auto}</style></head><body><main>${figures.join('')}</main></body></html>`,
  );
  await page
    .locator('img')
    .evaluateAll(async (images) =>
      Promise.all(images.map((img) => img.decode())),
    );
  await page.screenshot({
    path: path.join(reportRoot, 'contact-sheets', filename),
    fullPage: true,
  });
  await context.close();
}

async function highTierProfile(browser, session, fixture) {
  const context = await setupContext(browser, afterUrl, session, {
    locale: 'en',
    theme: 'light',
    viewport: { width: 1440, height: 900 },
    isMobile: false,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      value: 8,
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      value: 8,
    });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '4g', saveData: false },
    });
    const tasks = [];
    Object.defineProperty(window, '__glassProfileTasks', { value: tasks });
    if (PerformanceObserver.supportedEntryTypes.includes('longtask'))
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          tasks.push({
            startTime: entry.startTime,
            duration: entry.duration,
            name: entry.name,
          });
      }).observe({ type: 'longtask', buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const startedAt = Date.now();
  const response = await page.goto(
    new URL(
      `${routePath}?workspace=${encodeURIComponent(fixture.workspaceId)}`,
      afterUrl,
    ).toString(),
    { waitUntil: 'domcontentloaded', timeout: 120_000 },
  );
  if (!response?.ok()) throw new Error('High-tier profile route did not load');
  await page
    .getByRole('heading')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => {});
  let runtimeWaitTimedOut = false;
  await page.waitForFunction(
    () => Boolean(document.querySelector('[data-testid="nav-rail"]')),
    undefined,
    { timeout: 30_000 },
  );
  await page
    .waitForFunction(
      () => {
        const dock = document.querySelector('[data-testid="nav-rail"]');
        return Boolean(
          dock?.hasAttribute('data-glass-init-end') ||
          dock?.getAttribute('data-glass-runtime') === 'static',
        );
      },
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => {
      runtimeWaitTimedOut = true;
    });
  await page.waitForTimeout(200);
  const profile = await page.evaluate((runtimeTimedOut) => {
    const longTasks = window.__glassProfileTasks;
    const dock = document.querySelector('[data-testid="nav-rail"]');
    const runtimeAttribute = dock?.getAttribute('data-glass-runtime') ?? null;
    const refractionPresent = Boolean(
      dock?.hasAttribute('data-glass-enhanced') ||
      dock?.matches('[data-rim]') ||
      dock?.querySelector('[data-rim]'),
    );
    const runtimeMode = refractionPresent
      ? 'enhanced'
      : (runtimeAttribute ?? 'unknown');
    const initStart = Number(dock?.getAttribute('data-glass-init-start'));
    const initEnd = Number(dock?.getAttribute('data-glass-init-end'));
    const dockTasks = longTasks.filter(
      (task) =>
        Number.isFinite(initStart) &&
        Number.isFinite(initEnd) &&
        task.startTime + task.duration >= initStart &&
        task.startTime <= initEnd,
    );
    return {
      documentReadyState: document.readyState,
      profileCollectorPresent: Array.isArray(longTasks),
      pageErrors: [],
      runtimeMode,
      runtimeAttribute,
      fallback: dock?.getAttribute('data-glass-fallback') ?? null,
      refractionPresent,
      runtimeWaitTimedOut: runtimeTimedOut,
      overBudgetFallback: dock?.hasAttribute('data-glass-over-budget') ?? false,
      schedulerReady: dock?.hasAttribute('data-glass-scheduler-ready') ?? false,
      dockInitStart: Number.isFinite(initStart) ? initStart : null,
      dockInitEnd: Number.isFinite(initEnd) ? initEnd : null,
      dockInitMs: Number(dock?.getAttribute('data-glass-init-ms')) || 0,
      dockInitLongTaskSumMs: dockTasks.reduce(
        (sum, task) => sum + task.duration,
        0,
      ),
      longestDockInitTaskMs: Math.max(
        0,
        ...dockTasks.map((task) => task.duration),
      ),
      dockInitLongTasks: dockTasks,
      longTasks,
      routeLongTaskSumMs: longTasks.reduce(
        (sum, task) => sum + task.duration,
        0,
      ),
      routeBlockingMs: longTasks.reduce(
        (sum, task) => sum + Math.max(0, task.duration - 50),
        0,
      ),
      longestRouteTaskMs: Math.max(
        0,
        ...longTasks.map((task) => task.duration),
      ),
    };
  }, runtimeWaitTimedOut);
  profile.pageErrors = [...pageErrors, ...profile.pageErrors];
  profile.runtimeReadyMs = Date.now() - startedAt;
  await context.close();
  return profile;
}

async function captureDockState(
  browser,
  session,
  fixture,
  {
    origin = afterUrl,
    locale,
    theme,
    state,
    outputPath,
    cropPath,
    reducedTransparency = false,
  },
) {
  const context = await setupContext(browser, origin, session, {
    locale,
    theme,
    viewport: { width: 1440, height: 900 },
    isMobile: false,
  });
  if (reducedTransparency)
    await context.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query) =>
        query.includes('prefers-reduced-transparency')
          ? {
              matches: true,
              media: query,
              onchange: null,
              addListener() {},
              removeListener() {},
              addEventListener() {},
              removeEventListener() {},
              dispatchEvent: () => true,
            }
          : original(query);
    });
  const page = await openRoute(context, origin, fixture.workspaceId, 'high');
  const dock = page.locator('[data-testid="nav-rail"]');
  await dock.waitFor({ state: 'visible' });
  try {
    await page.waitForFunction(
      (expected) => {
        const dock = document.querySelector('[data-testid="nav-rail"]');
        const runtimeAttribute = dock?.getAttribute('data-glass-runtime');
        const enhanced = Boolean(
          dock?.hasAttribute('data-glass-enhanced') ||
          dock?.matches('[data-rim]') ||
          dock?.querySelector('[data-rim]'),
        );
        return expected === 'enhanced'
          ? enhanced ||
              dock?.hasAttribute('data-glass-init-end') ||
              runtimeAttribute === 'static'
          : runtimeAttribute === expected;
      },
      reducedTransparency ? 'static' : 'enhanced',
      { timeout: 30_000 },
    );
  } catch (error) {
    const diagnostics = await dock.evaluate((element) => ({
      runtimeAttribute: element.getAttribute('data-glass-runtime'),
      initMs: element.getAttribute('data-glass-init-ms'),
      overBudget: element.hasAttribute('data-glass-over-budget'),
      fallback: element.getAttribute('data-glass-fallback'),
      enhancedMarker: element.hasAttribute('data-glass-enhanced'),
      rimMarker:
        element.matches('[data-rim]') ||
        Boolean(element.querySelector('[data-rim]')),
    }));
    await context.close();
    throw new Error(
      `Desktop dock runtime did not reach ${reducedTransparency ? 'static' : 'enhanced'}: ${JSON.stringify(diagnostics)}; ${error.message}`,
    );
  }
  if (state === 'focused') {
    await page.evaluate(() => {
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : document.body
      ).blur();
    });
    let focusedDockItem = false;
    for (let index = 0; index < 30; index++) {
      await page.keyboard.press('Tab');
      focusedDockItem = await page.evaluate(() => {
        const active = document.activeElement;
        return Boolean(
          active?.closest('[data-testid="nav-rail"]') &&
          active.matches(':focus-visible'),
        );
      });
      if (focusedDockItem) break;
    }
    if (!focusedDockItem)
      throw new Error('Keyboard Tab did not focus a visible desktop dock item');
    await page
      .locator('[role="tooltip"][data-visible="true"]')
      .waitFor({ state: 'visible', timeout: 5000 });
  }
  const rail = page.locator('[data-testid="nav-rail"]');
  const box = await rail.boundingBox();
  let cropRect = null;
  const computed = await rail.evaluate((element) => {
    const style = getComputedStyle(element);
    const runtimeAttribute = element.getAttribute('data-glass-runtime');
    const refractionPresent = Boolean(
      element.hasAttribute('data-glass-enhanced') ||
      element.matches('[data-rim]') ||
      element.querySelector('[data-rim]'),
    );
    return {
      fallback: element.getAttribute('data-glass-fallback'),
      runtimeMode: refractionPresent
        ? 'enhanced'
        : (runtimeAttribute ?? 'unknown'),
      runtimeAttribute,
      initMs: element.getAttribute('data-glass-init-ms'),
      overBudget: element.hasAttribute('data-glass-over-budget'),
      refractionPresent,
      backgroundColor: style.backgroundColor,
      backdropFilter: style.backdropFilter,
      boxShadow: style.boxShadow,
    };
  });
  if (cropPath && box) {
    cropRect = {
      x: Math.max(0, Math.floor(box.x - 36)),
      y: Math.max(0, Math.floor(box.y - 24)),
      width: Math.min(1440, Math.ceil(box.width + 72)),
      height: Math.min(900, Math.ceil(box.height + 48)),
    };
    cropRect.width = Math.min(cropRect.width, 1440 - cropRect.x);
    cropRect.height = Math.min(cropRect.height, 900 - cropRect.y);
    await page.screenshot({
      path: cropPath,
      clip: cropRect,
      animations: 'disabled',
    });
  }
  await page.screenshot({ path: outputPath, animations: 'disabled' });
  await context.close();
  return { box, computed, cropPath: cropPath ?? null, cropRect };
}

async function captureMobileCapsule(browser, session, fixture, theme) {
  const context = await setupContext(browser, afterUrl, session, {
    locale: 'en',
    theme,
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const page = await openRoute(context, afterUrl, fixture.workspaceId, 'high');
  const bar = page.locator('[data-testid="bottom-bar"]');
  await bar.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const surface = document.querySelector('[data-testid="bottom-bar"]');
    return Boolean(
      surface?.hasAttribute('data-glass-init-end') ||
      surface?.getAttribute('data-glass-runtime') === 'static',
    );
  });
  const fullPath = path.join(
    reportRoot,
    'raw',
    `mobile390-dpr2-en-${theme}-gradient.png`,
  );
  const cropPath = path.join(
    reportRoot,
    'raw',
    `mobile390-dpr2-en-${theme}-capsule.png`,
  );
  await page.screenshot({ path: fullPath, animations: 'disabled' });
  await bar.screenshot({ path: cropPath, animations: 'disabled' });
  const computed = await bar.evaluate((element) => ({
    runtime: element.getAttribute('data-glass-runtime'),
    initMs: element.getAttribute('data-glass-init-ms'),
    overBudget: element.hasAttribute('data-glass-over-budget'),
    backdropFilter: getComputedStyle(element).backdropFilter,
    box: element.getBoundingClientRect().toJSON(),
  }));
  await context.close();
  return { fullPath, cropPath, computed };
}

async function runAuthenticatedAxeMatrix(browser, session, fixture) {
  const matrix = {};
  for (const viewport of [
    { name: 'desktop1440x900', width: 1440, height: 900, isMobile: false },
    { name: 'mobile390x844', width: 390, height: 844, isMobile: true },
  ]) {
    for (const locale of ['en', 'ar']) {
      for (const theme of ['light', 'dark']) {
        const key = `${viewport.name}-${locale}-${theme}`;
        const context = await setupContext(browser, afterUrl, session, {
          locale,
          theme,
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: viewport.isMobile,
        });
        try {
          const page = await openRoute(
            context,
            afterUrl,
            fixture.workspaceId,
            'constrained',
          );
          const result = await new AxeBuilder({ page })
            .withTags(axeTags)
            .analyze();
          matrix[key] = {
            viewport: `${viewport.width}x${viewport.height}`,
            locale,
            theme,
            violationCount: result.violations.length,
            violations: result.violations.map((violation) => ({
              id: violation.id,
              impact: violation.impact,
              description: violation.description,
              help: violation.help,
              nodeCount: violation.nodes.length,
            })),
          };
        } finally {
          await context.close();
        }
      }
    }
  }
  return matrix;
}

async function main() {
  process.chdir(root);
  await mkdir(path.join(reportRoot, 'contact-sheets'), { recursive: true });
  await mkdir(path.join(reportRoot, 'raw'), { recursive: true });
  const fixture = await findExistingFixture();
  process.stdout.write(
    `Reusing existing workspace rows: ${fixture.existingLinkCount}; creating zero fixtures.\n`,
  );
  const session = await issueExistingSession(fixture.email);
  const userClient = createClient(process.env.API_URL, process.env.ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  await userClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  const { data: visibleLinks, error } = await userClient
    .from('registration_links_safe')
    .select('id')
    .eq('workspace_id', fixture.workspaceId)
    .limit(100);
  if (error || (visibleLinks?.length ?? 0) < 12)
    throw new Error(
      'The selected existing trainer cannot see the 12 seeded registration rows',
    );
  fixture.existingLinkCount = visibleLinks.length;
  await spawnServer(root, afterUrl, 'AFTER');
  const browser = await chromium.launch({ headless: true });
  const summary = {
    fixtureRowsAdded: 0,
    reusedRegistrationLinks: fixture.existingLinkCount,
    highTierProfile: null,
    desktop: {},
    mobile: {},
    reducedTransparencyFallback: null,
    axeMatrix: {},
    contactSheets: [],
  };
  try {
    process.stdout.write(
      'Running one controlled high-tier desktop dock profile…\n',
    );
    summary.highTierProfile = await highTierProfile(browser, session, fixture);
    process.stdout.write(
      `High-tier dock profile: ${JSON.stringify(summary.highTierProfile)}\n`,
    );
    if (process.env.GLASS_PROFILE_ONLY === '1') return;
    await writeFile(
      path.join(reportRoot, 'visual-evidence.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
    );

    const themePanels = { light: [], dark: [] };
    for (const theme of ['light', 'dark']) {
      for (const locale of ['en', 'ar']) {
        const key = `${locale}-${theme}`;
        const stem = `desktop1440-dpr2-${locale}-${theme}`;
        const restPath = path.join(reportRoot, 'raw', `${stem}-rest.png`);
        const focusedPath = path.join(
          reportRoot,
          'raw',
          `${stem}-focused-tooltip.png`,
        );
        const cropPath =
          locale === 'en'
            ? path.join(reportRoot, 'raw', `dock-crop-dpr2-${theme}.png`)
            : undefined;
        const rest = await captureDockState(browser, session, fixture, {
          locale,
          theme,
          state: 'rest',
          outputPath: restPath,
          cropPath,
        });
        const focused = await captureDockState(browser, session, fixture, {
          locale,
          theme,
          state: 'focused',
          outputPath: focusedPath,
        });
        summary.desktop[key] = { rest, focusedTooltip: focused };
        themePanels[theme].push(
          { label: `${locale.toUpperCase()} · dock at rest`, file: restPath },
          {
            label: `${locale.toUpperCase()} · keyboard focus tooltip`,
            file: focusedPath,
          },
        );
      }
    }
    for (const theme of ['light', 'dark']) {
      const filename = `desktop-dock-${theme}-1440-dpr2.png`;
      await makeSheet(browser, filename, themePanels[theme], {
        viewport: { width: 1800, height: 1600 },
        columns: 2,
      });
      summary.contactSheets.push(
        path.join(reportRoot, 'contact-sheets', filename),
      );
    }

    const fallbackPath = path.join(
      reportRoot,
      'raw',
      'desktop1440-dpr2-en-light-reduced-transparency.png',
    );
    summary.reducedTransparencyFallback = await captureDockState(
      browser,
      session,
      fixture,
      {
        locale: 'en',
        theme: 'light',
        state: 'rest',
        outputPath: fallbackPath,
        reducedTransparency: true,
      },
    );
    const cropPanels = [
      {
        label: 'Light · DPR 2 dock crop',
        file: path.join(reportRoot, 'raw', 'dock-crop-dpr2-light.png'),
      },
      {
        label: 'Dark · DPR 2 dock crop',
        file: path.join(reportRoot, 'raw', 'dock-crop-dpr2-dark.png'),
      },
      { label: 'Reduced-transparency fallback', file: fallbackPath },
    ];
    const materialSheet = 'desktop-dock-material-and-fallback.png';
    await makeSheet(browser, materialSheet, cropPanels, {
      viewport: { width: 1800, height: 1500 },
      columns: 2,
    });
    summary.contactSheets.push(
      path.join(reportRoot, 'contact-sheets', materialSheet),
    );

    for (const theme of ['light', 'dark']) {
      summary.mobile[theme] = await captureMobileCapsule(
        browser,
        session,
        fixture,
        theme,
      );
    }
    const mobileSheet = 'mobile-capsule-gradient-check.png';
    await makeSheet(
      browser,
      mobileSheet,
      ['light', 'dark'].flatMap((theme) => [
        { label: `${theme} · full page`, file: summary.mobile[theme].fullPath },
        {
          label: `${theme} · DPR 2 capsule`,
          file: summary.mobile[theme].cropPath,
        },
      ]),
      { viewport: { width: 1800, height: 1500 }, columns: 2 },
    );
    summary.contactSheets.push(
      path.join(reportRoot, 'contact-sheets', mobileSheet),
    );
    process.stdout.write('Running authenticated desktop/mobile axe matrix…\n');
    summary.axeMatrix = await runAuthenticatedAxeMatrix(
      browser,
      session,
      fixture,
    );
    await writeFile(
      path.join(reportRoot, 'visual-evidence.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
    );
    const violations = Object.values(summary.axeMatrix).flatMap(
      (entry) => entry.violations,
    );
    if (violations.length)
      throw new Error(
        `Authenticated axe matrix found ${violations.length} violations across ${Object.keys(summary.axeMatrix).length} states`,
      );
  } finally {
    await browser.close();
    for (const server of servers) server.kill();
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
