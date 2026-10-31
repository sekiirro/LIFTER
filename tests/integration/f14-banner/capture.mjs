import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const root = resolve(import.meta.dirname, '../../..');
const output = join(root, 'tests/integration/evidence/f14-banner');
const imagePath = join(root, 'public/dev/f14-banner-neutral.png');
const baseUrl = process.env.F14_BANNER_BASE_URL ?? 'http://127.0.0.1:3107';
const viewports = [
  { key: 'mobile-390x844', width: 390, height: 844 },
  { key: 'tablet-768x1024', width: 768, height: 1024 },
  { key: 'desktop-1440x900', width: 1440, height: 900 },
];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(name, data) {
  const type = Buffer.from(name, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, crc]);
}

function createNeutralPng(width = 1600, height = 600) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    rows[rowStart] = 0;
    const shade = Math.round(105 + (y / (height - 1)) * 47);
    for (let x = 0; x < width; x++) {
      const offset = rowStart + 1 + x * 4;
      rows[offset] = shade;
      rows[offset + 1] = shade + 2;
      rows[offset + 2] = shade + 5;
      rows[offset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await mkdir(output, { recursive: true });
  await mkdir(join(root, 'public/dev'), { recursive: true });
  await writeFile(imagePath, createNeutralPng());

  if (process.argv.includes('--check-disabled')) {
    const response = await fetch(`${baseUrl}/showcase/f14-banner`);
    assert(
      response.status === 404,
      `Showcase gate expected 404; received ${response.status}`,
    );
    process.stdout.write('showcase-disabled: HTTP 404\n');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];
  const errors = [];
  const reflowChecks = [];

  async function capture({
    variant,
    locale,
    theme,
    viewport,
    brand = false,
    missing = false,
  }) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: theme,
      locale: locale === 'ar' ? 'ar-EG' : 'en-US',
      reducedMotion: 'reduce',
    });
    await context.addCookies([
      { url: baseUrl, name: 'lifter_locale', value: locale },
      { url: baseUrl, name: 'lifter_theme', value: theme },
    ]);
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__f14LayoutShift = 0;
      const observer = new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries())
          if (!entry.hadRecentInput) window.__f14LayoutShift += entry.value;
      });
      observer.observe({ type: 'layout-shift', buffered: true });
    });
    const response = await page.goto(
      `${baseUrl}/showcase/f14-banner?variant=${variant}${brand ? '&brand=1' : ''}${missing ? '&image=missing' : ''}`,
      { waitUntil: 'networkidle' },
    );
    assert(
      response?.status() === 200,
      `Expected HTTP 200, received ${response?.status()}`,
    );
    await page.evaluate(() => document.fonts.ready);
    assert(
      (await page.locator('html').getAttribute('lang')) === locale,
      'Locale did not render',
    );
    assert(
      (await page.locator('html').getAttribute('dir')) ===
        (locale === 'ar' ? 'rtl' : 'ltr'),
      'Document direction did not match locale',
    );

    const banner = missing
      ? page.getByTestId('banner-fallback')
      : page.getByTestId('hero-banner');
    await banner.waitFor();
    const metrics = await page.evaluate(() => {
      const bannerElement = document.querySelector(
        '[data-testid="hero-banner"], [data-testid="banner-fallback"]',
      );
      const formElement = document.querySelector(
        '[data-testid="registration-preview"] form',
      );
      const bannerRect = bannerElement.getBoundingClientRect();
      const formRect = formElement.getBoundingClientRect();
      const statusTokens = ['success', 'warning', 'error'].map((name) => [
        name,
        getComputedStyle(document.documentElement)
          .getPropertyValue(`--color-${name}-fg`)
          .trim(),
        getComputedStyle(
          document.querySelector('[data-brand-scope]') ??
            document.documentElement,
        )
          .getPropertyValue(`--color-${name}-fg`)
          .trim(),
      ]);
      return {
        bannerHeight: Math.round(bannerRect.height * 100) / 100,
        bannerWidth: Math.round(bannerRect.width * 100) / 100,
        formTop: Math.round(formRect.top * 100) / 100,
        bannerBottom: Math.round(bannerRect.bottom * 100) / 100,
        imageLoaded:
          bannerElement instanceof HTMLImageElement
            ? bannerElement.naturalWidth > 0
            : null,
        alt:
          bannerElement.getAttribute('alt') ??
          bannerElement.getAttribute('aria-label'),
        objectFit: getComputedStyle(bannerElement).objectFit,
        objectPosition: getComputedStyle(bannerElement).objectPosition,
        cls: Math.round((window.__f14LayoutShift ?? 0) * 10000) / 10000,
        horizontalOverflow:
          document.documentElement.scrollWidth > window.innerWidth,
        statusTokens,
      };
    });
    assert(
      metrics.formTop >= metrics.bannerBottom,
      'Registration form overlaps the banner',
    );
    assert(!metrics.horizontalOverflow, 'Preview has horizontal overflow');
    if (!missing) {
      assert(
        metrics.objectFit === 'cover',
        'Banner crop preview is not object-fit cover',
      );
      assert(
        metrics.objectPosition.includes('50%'),
        'Banner focal point is not centered',
      );
    }
    if (!missing) {
      assert(metrics.imageLoaded, 'Neutral placeholder image did not load');
      assert(
        Boolean(await banner.getAttribute('alt')),
        'Localized alt text is missing',
      );
      assert(
        Boolean(await banner.getAttribute('data-alt-ar')),
        'Arabic alt fallback is missing',
      );
      assert(
        Boolean(await banner.getAttribute('data-alt-en')),
        'English alt fallback is missing',
      );
    } else {
      assert(
        (await banner.innerText()) === '',
        'Missing-image fallback must not display text',
      );
    }
    if (brand) {
      assert(
        metrics.statusTokens.every(
          ([, rootValue, scopedValue]) => rootValue === scopedValue,
        ),
        'Workspace brand override changed a semantic status token',
      );
    }

    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const severe = axe.violations.filter((issue) =>
      ['critical', 'serious'].includes(issue.impact ?? ''),
    );
    if (severe.length)
      errors.push({
        variant,
        locale,
        theme,
        viewport: viewport.key,
        issues: severe,
      });

    const filename = `${brand ? 'workspace-brand-override' : `variant-${variant}`}--${locale}--${theme}--${viewport.key}${missing ? '--missing-image' : ''}.png`;
    const path = join(output, filename);
    await page.addStyleTag({
      content: 'nextjs-portal { display: none !important; }',
    });
    await page.screenshot({ path, animations: 'disabled' });
    const { size } = await (await import('node:fs/promises')).stat(path);
    results.push({
      filename,
      bytes: size,
      variant,
      locale,
      theme,
      viewport: `${viewport.width}x${viewport.height}`,
      brand,
      missing,
      axeSeriousCritical: severe.length,
      axeModerate: axe.violations.filter((issue) => issue.impact === 'moderate')
        .length,
      ...metrics,
    });
    if (
      !brand &&
      !missing &&
      variant === 'a' &&
      locale === 'en' &&
      theme === 'light' &&
      viewport.key === 'mobile-390x844'
    ) {
      await page.getByLabel('Name', { exact: true }).fill('Sample Member');
      await page
        .getByLabel('Email', { exact: true })
        .fill('sample@example.test');
      await page
        .getByLabel('Password', { exact: true })
        .fill('Sample-pass-123');
      await page
        .getByRole('button', { name: 'Create registration request' })
        .click();
      assert(
        (await page.getByRole('status').innerText()).includes(
          'No registration data was sent',
        ),
        'Local sample form did not announce its preview-only success state',
      );
    }
    await context.close();
  }

  try {
    for (const variant of ['a', 'b', 'c'])
      for (const locale of ['ar', 'en'])
        for (const theme of ['light', 'dark'])
          for (const viewport of viewports)
            await capture({ variant, locale, theme, viewport });
    await capture({
      variant: 'b',
      locale: 'en',
      theme: 'light',
      viewport: viewports[2],
      brand: true,
    });
    await capture({
      variant: 'c',
      locale: 'ar',
      theme: 'light',
      viewport: viewports[0],
      missing: true,
    });
    for (const width of [320, 720]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        colorScheme: 'light',
        locale: 'ar-EG',
        reducedMotion: 'reduce',
      });
      await context.addCookies([
        { url: baseUrl, name: 'lifter_locale', value: 'ar' },
        { url: baseUrl, name: 'lifter_theme', value: 'light' },
      ]);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/showcase/f14-banner?variant=c`, {
        waitUntil: 'networkidle',
      });
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const severe = axe.violations.filter((issue) =>
        ['critical', 'serious'].includes(issue.impact ?? ''),
      );
      reflowChecks.push({
        width,
        horizontalOverflow,
        axeSeriousCritical: severe.length,
      });
      assert(
        !horizontalOverflow,
        `Horizontal overflow at ${width}px CSS width`,
      );
      assert(
        severe.length === 0,
        `Axe serious/critical at ${width}px CSS width`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }

  await writeFile(
    join(output, 'render-metrics.json'),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        screenshots: results.length,
        severeAxeCases: errors.length,
        reflowChecks,
        maxCls: Math.max(...results.map((result) => result.cls)),
        measurements: results
          .filter(
            (result) =>
              !result.brand &&
              !result.missing &&
              result.locale === 'en' &&
              result.theme === 'light',
          )
          .map(({ variant, viewport, bannerHeight, bannerWidth, cls }) => ({
            variant,
            viewport,
            bannerWidth,
            bannerHeight,
            cls,
          })),
        files: results.map(({ filename, bytes }) => ({ filename, bytes })),
        errors,
      },
      null,
      2,
    )}\n`,
  );
  assert(errors.length === 0, 'Axe reported serious or critical violations');
}

await main();
