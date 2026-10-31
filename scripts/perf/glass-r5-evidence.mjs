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
const beforeRoot = path.resolve(
  process.env.GLASS_BEFORE_ROOT ?? 'C:/Users/NEW LAP/Desktop/LFTR-glass-before',
);
const reportRoot = path.resolve(
  process.env.GLASS_REPORT_ROOT ??
    'C:/Users/NEW LAP/.lifter/reports/s21-glass/r5',
);
const beforeUrl = 'http://127.0.0.1:4356';
const afterUrl = 'http://127.0.0.1:4355';
const routePath = '/registration-links';
const tags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
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
      env: {
        ...process.env,
        PORT: port,
        APP_ORIGIN: origin,
        NEXT_TELEMETRY_DISABLED: '1',
        LIFTER_SHOWCASE: '1',
      },
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

async function captureMobileCapsule(
  browser,
  session,
  fixture,
  locale,
  theme,
  outputPath,
) {
  const context = await setupContext(browser, afterUrl, session, {
    locale,
    theme,
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const page = await openRoute(
    context,
    afterUrl,
    fixture.workspaceId,
    'constrained',
  );
  const capsule = page.locator('[data-testid="bottom-bar"]');
  await capsule.waitFor({ state: 'visible' });
  await page.waitForTimeout(1000);
  await capsule.screenshot({ path: outputPath, animations: 'disabled' });
  const mode = await capsule.getAttribute('data-glass-runtime');
  const size = await capsule.boundingBox();
  let violations = null;
  if (locale === 'en' && theme === 'light')
    violations = (
      await new AxeBuilder({ page }).withTags(tags).analyze()
    ).violations.map(({ id, impact }) => ({ id, impact }));
  await context.close();
  return { mode, size, violations };
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
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const page = await context.newPage();
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
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 200_000,
    uploadThroughput: 75_000,
    connectionType: 'cellular3g',
  });
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
  await page.waitForTimeout(1200);
  await page.keyboard.press('Tab');
  await page.waitForFunction(
    () => Boolean(document.querySelector('[data-glass-surface][data-rim]')),
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(200);
  const profile = await page.evaluate(() => {
    const longTasks = window.__glassProfileTasks;
    return {
      runtimeMode:
        document
          .querySelector('[data-glass-surface][data-rim]')
          ?.getAttribute('data-glass-runtime') ?? 'enhanced-rim-present',
      longTasks,
      blockingMs: longTasks.reduce(
        (sum, task) => sum + Math.max(0, task.duration - 50),
        0,
      ),
      longestTaskMs: Math.max(0, ...longTasks.map((task) => task.duration)),
    };
  });
  profile.runtimeReadyMs = Date.now() - startedAt;
  await context.close();
  return profile;
}

async function railEvidence(browser, session, fixture, origin, name, clip) {
  const context = await setupContext(browser, origin, session, {
    locale: 'ar',
    theme: 'light',
    viewport: { width: 1440, height: 900 },
    isMobile: false,
  });
  const page = await openRoute(
    context,
    origin,
    fixture.workspaceId,
    'constrained',
  );
  await page.waitForTimeout(500);
  const rail = page.locator('[data-testid="nav-rail"]');
  const railCount = await rail.count();
  const box = railCount ? await rail.boundingBox() : null;
  const computed = box
    ? await rail.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          className: element.className,
          fallback: element.getAttribute('data-glass-fallback'),
          runtimeMode: element.getAttribute('data-glass-runtime'),
          inlineStyle: element.getAttribute('style'),
          backgroundColor: style.backgroundColor,
          backdropFilter: style.backdropFilter,
          webkitBackdropFilter: style.getPropertyValue(
            '-webkit-backdrop-filter',
          ),
          boxShadow: style.boxShadow,
        };
      })
    : null;
  if (name === 'after') {
    clip.x = Math.max(0, Math.floor(box.x - 32));
    clip.y = Math.max(0, Math.floor(box.y - 20));
    clip.width = Math.min(1440 - clip.x, Math.ceil(box.width + 64));
    clip.height = Math.min(900 - clip.y, Math.ceil(box.height + 40));
  }
  await page.screenshot({
    path: path.join(reportRoot, 'raw', `desktop-ar-light-${name}.png`),
    clip: clip.width ? clip : undefined,
  });
  let violations = null;
  if (name === 'after')
    violations = (
      await new AxeBuilder({ page }).withTags(tags).analyze()
    ).violations.map(({ id, impact }) => ({ id, impact }));
  await context.close();
  return {
    railRendered: railCount > 0,
    box,
    computed,
    violations,
    clip: { ...clip },
  };
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
  await Promise.all([
    spawnServer(beforeRoot, beforeUrl, 'BEFORE'),
    spawnServer(root, afterUrl, 'AFTER'),
  ]);
  const browser = await chromium.launch({ headless: true });
  const summary = {
    fixtureRowsAdded: 0,
    reusedRegistrationLinks: fixture.existingLinkCount,
    highTierProfile: null,
    rail: {},
    axe: {},
    mobileCapsule: {},
  };
  const rawFiles = [];
  try {
    if (process.env.GLASS_SKIP_HIGH_TIER === '1') {
      const prior = JSON.parse(
        await readFile(path.join(reportRoot, 'visual-evidence.json'), 'utf8'),
      );
      summary.highTierProfile = prior.highTierProfile;
    } else {
      process.stdout.write(
        'Running the single controlled high-tier init profile…\n',
      );
      summary.highTierProfile = await highTierProfile(
        browser,
        session,
        fixture,
      );
      await writeFile(
        path.join(reportRoot, 'visual-evidence.json'),
        `${JSON.stringify(summary, null, 2)}\n`,
      );
    }
    process.stdout.write('Capturing DPR-2 mobile capsule states…\n');
    for (const [locale, theme] of [
      ['en', 'light'],
      ['en', 'dark'],
      ['ar', 'light'],
      ['ar', 'dark'],
    ]) {
      const stem = `mobile390-dpr2-${locale}-${theme}`;
      const file = path.join(reportRoot, 'raw', `${stem}.png`);
      summary.mobileCapsule[`${locale}-${theme}`] = await captureMobileCapsule(
        browser,
        session,
        fixture,
        locale,
        theme,
        file,
      );
      rawFiles.push({ label: `${locale.toUpperCase()} · ${theme}`, file });
    }
    await makeSheet(browser, 'mobile-capsule-dpr2.png', rawFiles, {
      viewport: { width: 1500, height: 1100 },
      columns: 2,
    });
    process.stdout.write('Capturing matched desktop Arabic rail area…\n');
    const clip = { x: 0, y: 0, width: 0, height: 0 };
    summary.rail.after = await railEvidence(
      browser,
      session,
      fixture,
      afterUrl,
      'after',
      clip,
    );
    summary.rail.before = await railEvidence(
      browser,
      session,
      fixture,
      beforeUrl,
      'before',
      clip,
    );
    await makeSheet(
      browser,
      'desktop-rail-matched-dpr2.png',
      [
        {
          label: 'BEFORE · same viewport and crop; rail absent',
          file: path.join(reportRoot, 'raw', 'desktop-ar-light-before.png'),
        },
        {
          label: 'AFTER · rail present; opaque solid fallback',
          file: path.join(reportRoot, 'raw', 'desktop-ar-light-after.png'),
        },
      ],
      { viewport: { width: 1000, height: 850 }, columns: 2 },
    );
    summary.axe = {
      mobile390x844EnLight: summary.mobileCapsule['en-light'].violations,
      desktop1440x900EnLight: summary.rail.after.violations,
    };
    await writeFile(
      path.join(reportRoot, 'visual-evidence.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
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
