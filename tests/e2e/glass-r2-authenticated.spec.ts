import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { gzipSync, inflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import type { RegistrationFixture } from '../integration/registration-links-fixture';

const afterOrigin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4345';
const beforeOrigin = 'http://127.0.0.1:4344';
const beforeRoot = 'C:/Users/NEW LAP/Desktop/LFTR-glass-before';
const reportRoot = 'C:/Users/NEW LAP/.lifter/reports/s21-glass/r2';
const routePath = '/registration-links';
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

type CookieLike = {
  name: string;
  value: string;
  options?: {
    maxAge?: number;
    expires?: number | string | Date;
    httpOnly?: boolean;
    sameSite?: boolean | 'lax' | 'strict' | 'none';
  };
};

let fixture: RegistrationFixture;
let trainer: SupabaseClient;
let baselineServer: ChildProcess | undefined;

function cookieForBrowser(cookie: CookieLike, origin: string) {
  const options = cookie.options;
  const expiry =
    options?.expires instanceof Date
      ? Math.floor(options.expires.getTime() / 1000)
      : typeof options?.expires === 'number'
        ? Math.floor(options.expires)
        : typeof options?.expires === 'string'
          ? Math.floor(Date.parse(options.expires) / 1000)
          : undefined;
  const expires =
    expiry !== undefined && Number.isFinite(expiry)
      ? expiry
      : typeof options?.maxAge === 'number'
        ? Math.floor(Date.now() / 1000) + options.maxAge
        : Math.floor(Date.now() / 1000) + 3600;
  const sameSite =
    options?.sameSite === 'strict'
      ? ('Strict' as const)
      : options?.sameSite === 'none'
        ? ('None' as const)
        : options?.sameSite === 'lax'
          ? ('Lax' as const)
          : undefined;
  return {
    name: cookie.name,
    value: cookie.value,
    url: origin,
    expires,
    ...(options?.httpOnly !== undefined ? { httpOnly: options.httpOnly } : {}),
    ...(sameSite ? { sameSite } : {}),
  };
}

async function installSession(context: BrowserContext, origin: string) {
  const { loadEnv } = await import('../integration/harness');
  const env = loadEnv();
  const { data, error } = await trainer.auth.getSession();
  if (error || !data.session)
    throw new Error('Stack B fixture session missing');
  const { createServerClient } = await import('@supabase/ssr');
  const cookies: CookieLike[] = [];
  const client = createServerClient(env.apiUrl, env.anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (values) => {
        cookies.push(...(values as CookieLike[]));
      },
    },
  });
  const result = await client.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (result.error || cookies.length === 0)
    throw new Error('Could not install Stack B browser session');
  await context.addCookies(
    cookies.map((cookie) => cookieForBrowser(cookie, origin)),
  );
}

async function startBaseline() {
  const next = path.join(beforeRoot, 'node_modules/next/dist/bin/next');
  baselineServer = spawn(
    process.execPath,
    [next, 'start', '--hostname', '127.0.0.1', '--port', '4344'],
    {
      cwd: beforeRoot,
      env: {
        ...process.env,
        PORT: '4344',
        APP_ORIGIN: beforeOrigin,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (baselineServer.exitCode !== null)
      throw new Error('origin/main screenshot server exited before ready');
    try {
      const response = await fetch(`${beforeOrigin}/api/health`);
      if (response.ok) return;
    } catch {
      // The baseline server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('origin/main screenshot server did not become ready');
}

async function loadShellPage(
  context: BrowserContext,
  origin: string,
  locale: 'ar' | 'en',
  theme: 'light' | 'dark',
) {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: origin },
    { name: THEME_COOKIE, value: theme, url: origin },
  ]);
  const page = await context.newPage();
  const jsBodies: Promise<void>[] = [];
  const jsAssets = new Map<string, number>();
  page.on('response', (response) => {
    if (
      !response.url().includes('/_next/') ||
      !/\.js(?:\?|$)/.test(response.url())
    )
      return;
    jsBodies.push(
      (async () => {
        try {
          jsAssets.set(
            response.url(),
            gzipSync(await response.body()).byteLength,
          );
        } catch {
          // A canceled or streamed response is omitted from the route total.
        }
      })(),
    );
  });
  const startedAt = Date.now();
  const route = `${routePath}?workspace=${encodeURIComponent(fixture.wsA.id)}`;
  const response = await page.goto(new URL(route, origin).toString(), {
    waitUntil: 'networkidle',
  });
  const expectedHeading = getMessages(locale)['registration.title'];
  const heading = page.getByRole('heading', { name: expectedHeading });
  if (!(await heading.count())) {
    const actual = await page.locator('h1').allTextContents();
    const language = await page.locator('html').getAttribute('lang');
    throw new Error(
      `Authenticated screenshot route failed: status=${response?.status() ?? 'none'} lang=${language ?? 'none'} headings=${actual.join('|').slice(0, 120)}`,
    );
  }
  await expect(heading).toBeVisible();
  if (origin === afterOrigin) {
    await expect(page.getByRole('navigation')).toHaveCount(1);
    await expect(
      page.locator(
        '[data-glass-surface] a[data-nav-key="clients"][aria-current="page"]:visible',
      ),
    ).toHaveCount(1);
    await page.waitForFunction(() =>
      Boolean(document.querySelector('[data-glass-surface][data-rim]')),
    );
  } else {
    await expect(page.getByRole('navigation')).toHaveCount(0);
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const scroll = await page.evaluate((hasFloatingNav) => {
    const max = Math.max(
      0,
      document.documentElement.scrollHeight - innerHeight,
    );
    const viewportTarget =
      innerWidth < 1024 ? innerHeight - 56 : innerHeight / 2;
    const target =
      document.querySelector<HTMLElement>('main tbody tr:nth-child(4)') ??
      document.querySelector<HTMLElement>('main table') ??
      document.querySelector<HTMLElement>('main');
    if (target) {
      const rect = target.getBoundingClientRect();
      scrollTo(
        0,
        Math.max(
          0,
          Math.min(max, scrollY + rect.top + rect.height / 2 - viewportTarget),
        ),
      );
    } else scrollTo(0, Math.round(max * 0.55));
    const surface = hasFloatingNav
      ? [
          ...document.querySelectorAll<HTMLElement>('[data-glass-surface]'),
        ].find((element) => element.getClientRects().length > 0)
      : null;
    const surfaceBox = surface?.getBoundingClientRect();
    const contentOverlapsGlass = Boolean(
      surfaceBox &&
      [
        ...document.querySelectorAll<HTMLElement>(
          'main tbody tr, main section, main .panel',
        ),
      ].some((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left < surfaceBox.right &&
          rect.right > surfaceBox.left &&
          rect.top < surfaceBox.bottom &&
          rect.bottom > surfaceBox.top
        );
      }),
    );
    return {
      max,
      height: document.documentElement.scrollHeight,
      top: scrollY,
      contentOverlapsGlass,
    };
  }, origin === afterOrigin);
  await page.waitForTimeout(120);
  await Promise.all(jsBodies);
  return {
    page,
    jsGzipBytes: [...jsAssets.values()].reduce(
      (total, bytes) => total + bytes,
      0,
    ),
    loadedMs: Date.now() - startedAt,
    scroll,
  };
}

type ContrastReading = {
  text: number;
  edge: number;
  activeIndicator: number;
};

function decodePng(png: Buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const imageData: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const kind = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
    } else if (kind === 'IDAT') imageData.push(data);
    offset += 12 + length;
    if (kind === 'IEND') break;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2))
    throw new Error(
      `Unexpected screenshot PNG format: ${bitDepth}/${colorType}`,
    );
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const packed = inflateSync(Buffer.concat(imageData));
  const pixels = Buffer.alloc(height * stride);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const da = Math.abs(p - a);
    const db = Math.abs(p - b);
    const dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const source = y * (stride + 1);
    const target = y * stride;
    const filter = packed[source]!;
    for (let x = 0; x < stride; x++) {
      const raw = packed[source + 1 + x]!;
      const left = x >= channels ? pixels[target + x - channels]! : 0;
      const above = y > 0 ? pixels[target + x - stride]! : 0;
      const upperLeft =
        y > 0 && x >= channels ? pixels[target + x - stride - channels]! : 0;
      const value =
        filter === 0
          ? raw
          : filter === 1
            ? raw + left
            : filter === 2
              ? raw + above
              : filter === 3
                ? raw + Math.floor((left + above) / 2)
                : filter === 4
                  ? raw + paeth(left, above, upperLeft)
                  : Number.NaN;
      if (!Number.isFinite(value))
        throw new Error(`Unsupported PNG filter ${filter}`);
      pixels[target + x] = value & 255;
    }
  }
  return {
    width,
    height,
    pixel(x: number, y: number) {
      const at =
        (Math.max(0, Math.min(height - 1, y)) * width +
          Math.max(0, Math.min(width - 1, x))) *
        channels;
      return [pixels[at]!, pixels[at + 1]!, pixels[at + 2]!];
    },
  };
}

function parseColor(value: string) {
  const numbers = value.match(/[\d.]+/g)?.map(Number) ?? [];
  return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0];
}

function contrast(foreground: number[], background: number[]) {
  const luminance = (color: number[]) => {
    const channels = color.map((value) => {
      const channel = value / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return (
      0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
    );
  };
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

async function measureNavContrast(
  page: import('@playwright/test').Page,
): Promise<ContrastReading> {
  const geometry = await page.evaluate(() => {
    const nav = [
      ...document.querySelectorAll<HTMLElement>('[data-glass-surface]'),
    ].find((element) => element.getClientRects().length > 0);
    if (!nav) throw new Error('Glass navigation surface is missing');
    const box = nav.getBoundingClientRect();
    const active = nav.querySelector<HTMLElement>('a[aria-current="page"]');
    const labels = [
      ...nav.querySelectorAll<HTMLElement>('[data-testid="bottom-label"]'),
    ].map((label) => {
      const rect = label.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        color: getComputedStyle(label).color,
      };
    });
    return {
      box: {
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      },
      labels,
      pixelScale: devicePixelRatio,
      borderColor: getComputedStyle(nav).borderTopColor,
      activeBorder: active
        ? getComputedStyle(active).borderTopColor
        : getComputedStyle(nav).color,
      activeBox: active
        ? (() => {
            const rect = active.getBoundingClientRect();
            return {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            };
          })()
        : null,
    };
  });
  const hideText = await page.addStyleTag({
    content:
      '[data-glass-surface] [data-testid="bottom-label"],[data-glass-surface] svg{visibility:hidden!important}',
  });
  const material = decodePng(Buffer.from(await page.screenshot()));
  await hideText.evaluate((element) => (element as HTMLElement).remove());
  const hideNav = await page.addStyleTag({
    content: '[data-glass-surface]{visibility:hidden!important}',
  });
  const backdrop = decodePng(Buffer.from(await page.screenshot()));
  await hideNav.evaluate((element) => (element as HTMLElement).remove());
  const readings = geometry.labels.flatMap((label) => {
    const foreground = parseColor(label.color);
    const values: number[] = [];
    const left = Math.floor((label.left + 2) * geometry.pixelScale);
    const right = Math.floor(
      (label.left + label.width - 2) * geometry.pixelScale,
    );
    const top = Math.floor((label.top + 2) * geometry.pixelScale);
    const bottom = Math.floor(
      (label.top + label.height - 2) * geometry.pixelScale,
    );
    for (let y = top; y <= bottom; y += 3)
      for (let x = left; x <= right; x += 3)
        values.push(contrast(foreground, material.pixel(x, y)));
    return values;
  });
  const activeBackground = geometry.activeBox
    ? material.pixel(
        Math.floor(
          (geometry.activeBox.left + geometry.activeBox.width / 2) *
            geometry.pixelScale,
        ),
        Math.floor(
          (geometry.activeBox.top + geometry.activeBox.height / 2) *
            geometry.pixelScale,
        ),
      )
    : material.pixel(
        Math.floor(
          (geometry.box.left + geometry.box.width / 2) * geometry.pixelScale,
        ),
        Math.floor(
          (geometry.box.top + geometry.box.height / 2) * geometry.pixelScale,
        ),
      );
  const edgeBackground = backdrop.pixel(
    Math.floor(
      (geometry.box.left + geometry.box.width / 2) * geometry.pixelScale,
    ),
    Math.floor((geometry.box.top + 1) * geometry.pixelScale),
  );
  return {
    text: readings.length ? Math.min(...readings) : Number.POSITIVE_INFINITY,
    edge: contrast(parseColor(geometry.borderColor), edgeBackground),
    activeIndicator: contrast(
      parseColor(geometry.activeBorder),
      activeBackground,
    ),
  };
}

async function glassRuntimeFacts(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    injectedStylePresent: Boolean(document.getElementById('glisse-styles')),
    injectedStyleCharacters:
      document.getElementById('glisse-styles')?.textContent?.length ?? 0,
    rimSurfaceCount: document.querySelectorAll('[data-glass-surface][data-rim]')
      .length,
    svgFilterCount: document.querySelectorAll('body > svg defs filter').length,
    inlineStyledRimCount: document.querySelectorAll(
      '[data-glass-surface][style*="--lg-rim"]',
    ).length,
  }));
}

async function getRouteMetrics(
  browser: import('@playwright/test').Browser,
  origin: string,
  locale: 'ar' | 'en',
  theme: 'light' | 'dark',
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await installSession(context, origin);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: origin },
    { name: THEME_COOKIE, value: theme, url: origin },
  ]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    const metrics = { lcp: 0, tbt: 0, cls: 0, eventDurations: [] as number[] };
    Object.defineProperty(window, '__r2Metrics', {
      value: metrics,
      configurable: true,
    });
    if (
      PerformanceObserver.supportedEntryTypes.includes(
        'largest-contentful-paint',
      )
    ) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    }
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          metrics.tbt += Math.max(0, entry.duration - 50);
      }).observe({ type: 'longtask', buffered: true });
    }
    if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceEntry[] &
          { value?: number; hadRecentInput?: boolean }[]) {
          if (!entry.hadRecentInput) metrics.cls += entry.value ?? 0;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    }
    if (PerformanceObserver.supportedEntryTypes.includes('event')) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const timing = entry as PerformanceEntry & { interactionId?: number };
          if (timing.interactionId) metrics.eventDurations.push(entry.duration);
        }
      }).observe({
        type: 'event',
        buffered: true,
        durationThreshold: 16,
      } as PerformanceObserverInit);
    }
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
  const start = Date.now();
  const route = `${routePath}?workspace=${encodeURIComponent(fixture.wsA.id)}`;
  await page.goto(new URL(route, origin).toString(), {
    waitUntil: 'domcontentloaded',
  });
  if (origin === afterOrigin)
    await page.waitForFunction(() =>
      Boolean(document.querySelector('[data-glass-surface][data-rim]')),
    );
  await page.waitForTimeout(1500);
  const runtimeReadyMs = Date.now() - start;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.keyboard.press('Tab');
  const focusVisible = await page.evaluate(() => {
    const focused = document.activeElement as HTMLElement | null;
    return Boolean(
      focused &&
      (getComputedStyle(focused).outlineStyle !== 'none' ||
        focused.matches(':focus-visible')),
    );
  });
  const click = page.locator('[data-nav-key="home"]:visible').first();
  if (await click.count()) {
    await page.evaluate(() => {
      [...document.querySelectorAll<HTMLElement>('[data-nav-key="home"]')]
        .find((element) => element.getClientRects().length > 0)
        ?.addEventListener('click', (event) => event.preventDefault(), {
          once: true,
        });
    });
    await click.click();
    await page.waitForTimeout(120);
  }
  const framePromise = page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const times: number[] = [];
        const startTime = performance.now();
        const tick = (time: number) => {
          times.push(time);
          if (time - startTime >= 900)
            resolve(
              times.length < 2
                ? 0
                : ((times.length - 1) * 1000) /
                    (times[times.length - 1]! - times[0]!),
            );
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  for (let index = 0; index < 10; index++) {
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(35);
  }
  const scrollFps = await framePromise;
  const observed = await page.evaluate(
    () =>
      (
        window as unknown as Window & {
          __r2Metrics: {
            lcp: number;
            tbt: number;
            cls: number;
            eventDurations: number[];
          };
        }
      ).__r2Metrics,
  );
  const runtime = origin === afterOrigin ? await glassRuntimeFacts(page) : null;
  await context.close();
  return {
    lcpMs: observed.lcp,
    tbtMs: observed.tbt,
    cls: observed.cls,
    inpEventTimingMs: observed.eventDurations.length
      ? Math.max(...observed.eventDurations)
      : null,
    scrollFps,
    focusVisible,
    runtimeReadyMs,
    runtime,
  };
}

test.describe('S21 Round 2 Stack B visual and performance evidence', () => {
  test.beforeAll(async () => {
    test.setTimeout(180_000);
    test.skip(
      !process.env.API_URL && !process.env.SUPABASE_URL,
      'Requires the Stack B wrapper environment.',
    );
    const { registrationFixture, issue } =
      await import('../integration/registration-links-fixture');
    fixture = await registrationFixture();
    trainer = fixture.actors.trainerA.client;
    for (let index = 0; index < 12; index++) {
      const result = await issue(fixture, fixture.actors.po.client);
      if (result.error)
        throw new Error('Could not create additive Stack B link fixture');
    }
    await mkdir(path.join(reportRoot, 'before'), { recursive: true });
    await mkdir(path.join(reportRoot, 'after'), { recursive: true });
    await mkdir(path.join(reportRoot, 'contact-sheets'), { recursive: true });
    await startBaseline();
  });

  test.afterAll(async () => {
    baselineServer?.kill();
  });

  test('captures paired authenticated pages and five-run mobile-throttled measurements', async ({
    browser,
  }) => {
    test.setTimeout(900_000);
    const summary: Record<string, unknown> = {
      page: routePath,
      viewportScroll: {},
      assets: {},
      runtime: {},
      axe: [],
      performance: { before: [], after: [] },
    };
    const viewports = [
      { name: 'mobile390x844', width: 390, height: 844, mobile: true },
      { name: 'desktop1440x900', width: 1440, height: 900, mobile: false },
    ] as const;

    for (const viewport of viewports) {
      const beforeContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        isMobile: viewport.mobile,
        hasTouch: viewport.mobile,
      });
      const afterContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        isMobile: viewport.mobile,
        hasTouch: viewport.mobile,
      });
      await installSession(beforeContext, beforeOrigin);
      await installSession(afterContext, afterOrigin);

      for (const theme of ['light', 'dark'] as const) {
        for (const locale of ['en', 'ar'] as const) {
          const before = await loadShellPage(
            beforeContext,
            beforeOrigin,
            locale,
            theme,
          );
          const after = await loadShellPage(
            afterContext,
            afterOrigin,
            locale,
            theme,
          );
          expect(before.scroll.max).toBeGreaterThan(0);
          expect(after.scroll.max).toBeGreaterThan(0);
          expect(after.scroll.contentOverlapsGlass).toBe(true);
          const overflow = await after.page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          );
          expect(overflow).toBeLessThanOrEqual(1);
          const endState = await after.page.evaluate(() => {
            scrollTo(0, document.documentElement.scrollHeight);
            const surface = document.querySelector<HTMLElement>(
              '[data-testid="bottom-bar"]',
            );
            const surfaceBox = surface?.getBoundingClientRect();
            const lastAction = [
              ...document.querySelectorAll<HTMLElement>(
                'main a,main button,main input,main select',
              ),
            ]
              .filter((element) => element.getClientRects().length > 0)
              .at(-1);
            const actionBox = lastAction?.getBoundingClientRect();
            return Boolean(
              surfaceBox && actionBox && actionBox.bottom <= surfaceBox.top,
            );
          });
          if (viewport.name === 'mobile390x844') expect(endState).toBe(true);
          const stem = `${viewport.name}-${theme}-${locale}`;
          await before.page.screenshot({
            path: path.join(reportRoot, 'before', `${stem}.png`),
          });
          await after.page.screenshot({
            path: path.join(reportRoot, 'after', `${stem}.png`),
          });
          const axe = await new AxeBuilder({ page: after.page })
            .withTags(axeTags)
            .analyze();
          expect(axe.violations).toEqual([]);
          (summary.axe as unknown[]).push({
            stem,
            violations: axe.violations.map(({ id, impact }) => ({
              id,
              impact,
            })),
          });
          (summary.viewportScroll as Record<string, unknown>)[stem] = {
            before: before.scroll,
            after: after.scroll,
          };
          (summary.assets as Record<string, unknown>)[stem] = {
            beforeGzipBytes: before.jsGzipBytes,
            afterGzipBytes: after.jsGzipBytes,
          };
          if (
            viewport.name === 'mobile390x844' &&
            theme === 'light' &&
            locale === 'en'
          ) {
            (summary.runtime as Record<string, unknown>).after =
              await glassRuntimeFacts(after.page);
          }
          if (viewport.name === 'mobile390x844') {
            (summary as Record<string, unknown>).contrast ??= {};
            const contrast = await measureNavContrast(after.page);
            (
              (summary as Record<string, unknown>).contrast as Record<
                string,
                unknown
              >
            )[stem] = contrast;
            expect(
              contrast.text,
              `${stem} text contrast`,
            ).toBeGreaterThanOrEqual(4.5);
            expect(
              contrast.edge,
              `${stem} edge contrast`,
            ).toBeGreaterThanOrEqual(3);
            expect(
              contrast.activeIndicator,
              `${stem} active indicator contrast`,
            ).toBeGreaterThanOrEqual(3);
          }
          await before.page.close();
          await after.page.close();
        }
      }
      await beforeContext.close();
      await afterContext.close();
    }

    const tabletContext = await browser.newContext({
      viewport: { width: 768, height: 1024 },
      deviceScaleFactor: 1,
    });
    await installSession(tabletContext, afterOrigin);
    for (const theme of ['light', 'dark'] as const) {
      for (const locale of ['en', 'ar'] as const) {
        const tablet = await loadShellPage(
          tabletContext,
          afterOrigin,
          locale,
          theme,
        );
        const tabletAxe = await new AxeBuilder({ page: tablet.page })
          .withTags(axeTags)
          .analyze();
        expect(tabletAxe.violations).toEqual([]);
        const overflow = await tablet.page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
        const firstNavLink = tablet.page
          .locator('[data-testid="bottom-bar"] a')
          .first();
        await firstNavLink.focus();
        await tablet.page.keyboard.press('Tab');
        const focusVisible = await tablet.page.evaluate(() =>
          Boolean(
            (document.activeElement as HTMLElement | null)?.matches(
              ':focus-visible',
            ),
          ),
        );
        expect(focusVisible).toBe(true);
        (summary.axe as unknown[]).push({
          stem: `tablet768x1024-${theme}-${locale}`,
          violations: tabletAxe.violations.map(({ id, impact }) => ({
            id,
            impact,
          })),
        });
        await tablet.page.close();
      }
    }
    await tabletContext.close();

    const preferenceContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await installSession(preferenceContext, afterOrigin);
    const prefPage = await preferenceContext.newPage();
    await prefPage.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query: string) =>
        query.includes('prefers-reduced-transparency')
          ? ({
              matches: true,
              media: query,
              onchange: null,
              addListener() {},
              removeListener() {},
              addEventListener() {},
              removeEventListener() {},
              dispatchEvent: () => true,
            } as MediaQueryList)
          : original(query);
    });
    await prefPage.goto(
      new URL(
        `${routePath}?workspace=${encodeURIComponent(fixture.wsA.id)}`,
        afterOrigin,
      ).toString(),
      { waitUntil: 'networkidle' },
    );
    await prefPage.evaluate(() =>
      scrollTo(
        0,
        Math.max(
          0,
          (document.documentElement.scrollHeight - innerHeight) * 0.5,
        ),
      ),
    );
    const reducedTransparencyOverride = await prefPage.addStyleTag({
      content:
        '[data-glass-surface]{background:var(--color-card)!important;border:2px solid var(--color-border-strong)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none!important}',
    });
    await expect(
      prefPage.locator('[data-glass-surface][data-rim]'),
    ).toHaveCount(0);
    await reducedTransparencyOverride.evaluate((element) =>
      (element as Element).remove(),
    );
    await prefPage.screenshot({
      path: path.join(
        reportRoot,
        'after',
        'mobile390x844-light-en-reduced-transparency.png',
      ),
    });
    await prefPage.emulateMedia({ forcedColors: 'active' });
    await expect(
      prefPage.locator('[data-glass-surface][data-rim]'),
    ).toHaveCount(0);
    await prefPage.screenshot({
      path: path.join(
        reportRoot,
        'after',
        'mobile390x844-light-en-forced-colors.png',
      ),
    });
    await preferenceContext.close();

    for (let index = 0; index < 5; index++) {
      (summary.performance as { before: unknown[] }).before.push(
        await getRouteMetrics(browser, beforeOrigin, 'en', 'light'),
      );
      (summary.performance as { after: unknown[] }).after.push(
        await getRouteMetrics(browser, afterOrigin, 'en', 'light'),
      );
    }
    await writeFile(
      path.join(reportRoot, 'metrics.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(reportRoot, 'fixture-footprint.json'),
      `${JSON.stringify({ source: 'tests/integration/registration-links-fixture.ts', additiveRegistrationLinks: 12, created: ['fixture auth users and role profiles', 'two workspace records and their memberships', 'one package/version/offer'], deleted: 0, reset: false }, null, 2)}\n`,
      'utf8',
    );
  });
});
