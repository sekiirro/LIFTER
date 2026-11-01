import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import {
  captureHeroScreenshot,
  expectHeroAxeClean,
  expectHeroButtonBoundary,
  expectHeroFocusRing,
  expectHeroMaterialContract,
  expectHeroPhoneGroupLtr,
  expectHeroPreferencesSingleRow,
  expectHeroTextContrast,
  expectHeroTouchTargets,
  heroEvidenceDirectory,
} from './registration-hero-evidence';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const local = Boolean(
  process.env.DB_URL || process.env.SUPABASE_DB_URL || process.env.API_URL,
);
const viewports = [
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];
let token = '';
let cleanup: (() => Promise<void>) | null = null;
const measurements: Record<string, unknown>[] = [];
type LayoutShiftLike = PerformanceEntry & {
  value: number;
  hadRecentInput: boolean;
};

function desktopRightInset(width: number) {
  return Math.min(Math.max(width * 0.04, 24), 64);
}

async function expectNoPageScroll(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    bodyScrollWidth: document.body.scrollWidth,
    bodyScrollHeight: document.body.scrollHeight,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight);
  expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth,
  );
  expect(dimensions.bodyScrollHeight).toBeLessThanOrEqual(
    dimensions.clientHeight,
  );
  return dimensions;
}

test.beforeEach(async () => {
  test.skip(!local, 'Requires the selected disposable local database.');
  const { createPublishedBannerFixture } =
    await import('../integration/branding-banner-fixture');
  const fixture = await createPublishedBannerFixture();
  token = fixture.token;
  cleanup = fixture.cleanup;
});

test.afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

test.afterAll(async () => {
  if (measurements.length === 0) return;
  await mkdir(heroEvidenceDirectory, { recursive: true });
  await writeFile(
    join(heroEvidenceDirectory, 'loaded-banner-geometry.json'),
    `${JSON.stringify(measurements, null, 2)}\n`,
  );
});

for (const locale of ['ar', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of viewports) {
      test(`${locale}/${theme}/${viewport.name}: decoded published banner stays reserved and above form`, async ({
        page,
        context,
      }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: origin },
          { name: THEME_COOKIE, value: theme, url: origin },
        ]);
        await page.addInitScript(() => {
          (window as Window & { __f14Shifts?: number }).__f14Shifts = 0;
          new PerformanceObserver((entries) => {
            for (const entry of entries.getEntries()) {
              if (!(entry as LayoutShiftLike).hadRecentInput) {
                (window as Window & { __f14Shifts?: number }).__f14Shifts! += (
                  entry as LayoutShiftLike
                ).value;
              }
            }
          }).observe({ type: 'layout-shift', buffered: true });
        });
        const proxyResponse = page.waitForResponse((response) => {
          const pathname = new URL(response.url()).pathname;
          return pathname.startsWith('/api/branding/');
        });
        await page.goto(`/register/${encodeURIComponent(token)}`);
        await expect(page.locator('[data-registration-hero]')).toHaveAttribute(
          'data-has-banner',
          'true',
        );
        await expect(page.locator('[data-registration-hero]')).toHaveAttribute(
          'data-hero-layout',
          viewport.width >= 768 ? 'split' : 'stacked',
        );
        const image = page.locator('[data-registration-banner]');
        await expect(image).toBeVisible();
        const imageResponse = await proxyResponse;
        expect(
          imageResponse.status(),
          'token-validated image proxy status',
        ).toBe(200);
        expect(imageResponse.headers()['content-type']).toMatch(
          /^image\/(png|webp)/,
        );
        const imageData = await image.evaluate(
          async (element: HTMLImageElement) => {
            await element.decode();
            const rect = element.getBoundingClientRect();
            const source = new URL(element.currentSrc);
            return {
              sourceUsesProxy: source.pathname.startsWith('/api/branding/'),
              sourceHasNoStorageUrl:
                !/storage\/v1\/object|token=|signature=/i.test(
                  element.currentSrc,
                ),
              naturalWidth: element.naturalWidth,
              naturalHeight: element.naturalHeight,
              width: rect.width,
              height: rect.height,
              bottom: rect.bottom,
              top: rect.top,
            };
          },
        );
        expect(imageData.naturalWidth).toBe(316);
        expect(imageData.naturalHeight).toBe(158);
        expect(imageData.sourceUsesProxy).toBe(true);
        expect(imageData.sourceHasNoStorageUrl).toBe(true);
        const formTop = await page
          .locator('form')
          .first()
          .evaluate((element) => element.getBoundingClientRect().top);
        const cardBox = await page
          .locator('[data-registration-card="premium-centered"]')
          .boundingBox();
        expect(cardBox).not.toBeNull();
        const cls = await page.evaluate(
          () => (window as Window & { __f14Shifts?: number }).__f14Shifts ?? 0,
        );
        if (viewport.width >= 768) {
          expect(imageData.height).toBeCloseTo(viewport.height, 0);
          expect(formTop).toBeLessThan(imageData.bottom);
          expect(cardBox!.x + cardBox!.width / 2).toBeGreaterThan(
            viewport.width * 0.65,
          );
          // Approved prototype desktop inset: clamp(1.5rem, 4vw, 4rem).
          expect(
            Math.abs(
              viewport.width -
                (cardBox!.x + cardBox!.width) -
                desktopRightInset(viewport.width),
            ),
          ).toBeLessThanOrEqual(2);
        } else {
          // Approved prototype rule: the mobile art band is
          // min(78svh, 133.333vw), so it is viewport-width led on phones.
          expect(imageData.height).toBeCloseTo(
            Math.min(viewport.height * 0.78, viewport.width * 1.33333),
            0,
          );
          expect(imageData.height).toBeLessThanOrEqual(viewport.height);
          // The card overlaps the bottom of the art band, as approved.
          expect(cardBox!.y).toBeLessThan(imageData.height);
        }
        // Tight enough to catch an unreserved banner while allowing the
        // observed 0.000298 font-swap shift under the full AR/tablet run.
        expect(cls).toBeLessThan(0.001);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expectHeroMaterialContract(page);
        const buttonTextContrast = await expectHeroTextContrast(page);
        const buttonBoundary = await expectHeroButtonBoundary(page);
        if (viewport.width <= 390) await expectHeroPreferencesSingleRow(page);
        await expectHeroTouchTargets(page);
        await expectHeroFocusRing(page);
        if (locale === 'ar') await expectHeroPhoneGroupLtr(page);
        await expectHeroAxeClean(page);
        const dimensions =
          viewport.width >= 768 ? await expectNoPageScroll(page) : null;
        const screenshot = await captureHeroScreenshot(
          page,
          `banner-${locale}-${theme}-${viewport.name}`,
        );
        const stage = await page
          .locator('[data-registration-hero]')
          .evaluate((element) => ({
            photoTone: element.dataset.photoTone ?? '',
            photoLuminance:
              element.style.getPropertyValue('--hero-photo-luminance') || '',
            adaptiveDimming:
              element.style.getPropertyValue('--hero-adaptive-dimming') || '',
          }));
        measurements.push({
          locale,
          theme,
          viewport: viewport.name,
          ...imageData,
          formTop,
          cardTop: cardBox!.y,
          cardRightInset: viewport.width - (cardBox!.x + cardBox!.width),
          cls,
          screenshot,
          buttonTextContrast,
          buttonBoundary,
          ...stage,
          ...(dimensions ? { dimensions } : {}),
        });
      });
    }
  }
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
]) {
  test(`banner desktop ${viewport.width}x${viewport.height} has no page scroll`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    for (const locale of ['ar', 'en'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: origin },
          { name: THEME_COOKIE, value: theme, url: origin },
        ]);
        await page.goto(`/register/${encodeURIComponent(token)}`);
        await expect(page.locator('[data-registration-banner]')).toBeVisible();
        await expectNoPageScroll(page);
      }
    }
  });
}
