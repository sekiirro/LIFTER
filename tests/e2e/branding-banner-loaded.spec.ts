import { testOrigin } from './test-origin.mjs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? testOrigin;
const local = Boolean(
  process.env.DB_URL || process.env.SUPABASE_DB_URL || process.env.API_URL,
);
const temporaryDir = join(tmpdir(), `lifter-f14-ui-${process.pid}`);
const viewports = [
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

async function expectAxeClean(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
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
  const evidence = join(process.cwd(), 'tests/integration/evidence/f14-ui');
  await mkdir(evidence, { recursive: true });
  await writeFile(
    join(evidence, 'loaded-banner-geometry.json'),
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
        const cls = await page.evaluate(
          () => (window as Window & { __f14Shifts?: number }).__f14Shifts ?? 0,
        );
        expect(imageData.height).toBeGreaterThanOrEqual(128);
        expect(imageData.height).toBeLessThanOrEqual(288);
        expect(formTop).toBeGreaterThanOrEqual(imageData.bottom);
        // Tight enough to catch an unreserved banner while allowing the
        // observed 0.000298 font-swap shift under the full AR/tablet run.
        expect(cls).toBeLessThan(0.001);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expectAxeClean(page);
        const screenshot = `banner-loaded-${locale}-${theme}-${viewport.name}.png`;
        const temporary = join(temporaryDir, screenshot);
        await mkdir(temporaryDir, { recursive: true });
        await page.screenshot({ path: temporary, fullPage: true });
        measurements.push({
          locale,
          theme,
          viewport: viewport.name,
          ...imageData,
          formTop,
          cls,
        });
      });
    }
  }
}
