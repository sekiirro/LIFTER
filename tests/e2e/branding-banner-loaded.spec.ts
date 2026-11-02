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
  expectHeroPreferenceLabelContrast,
  expectHeroPreferenceSelectContrast,
  expectHeroPreferencesSingleRow,
  expectHeroSamplingFallback,
  expectHeroResolvedThemeContract,
  expectHeroTextBackdropContrast,
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
const darkPatchCases = (['ar', 'en'] as const)
  .flatMap((locale) =>
    (['light', 'dark'] as const).flatMap((theme) =>
      viewports.map((viewport) => ({ locale, theme, viewport })),
    ),
  )
  .filter(({ theme }) => theme === 'light');
const themeContractCases = (
  ['light', 'dark', 'follow-device'] as const
).flatMap((theme) =>
  (['light', 'dark'] as const).flatMap((osTheme) =>
    (
      [
        'bright',
        'dim',
        'bright-patch',
        'dark-patch',
        'sampling-fallback',
      ] as const
    ).flatMap((artwork) =>
      (['ar', 'en'] as const).flatMap((locale) =>
        [
          { name: 'mobile-360', width: 360, height: 800 },
          { name: 'mobile-390', width: 390, height: 844 },
          { name: 'desktop-1440', width: 1440, height: 900 },
        ].map((viewport) => ({
          theme,
          osTheme,
          artwork,
          locale,
          viewport,
        })),
      ),
    ),
  ),
);
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

test.beforeEach(async ({}, testInfo) => {
  if (!local)
    throw new Error('Requires the selected disposable local database.');
  const {
    bannerPng,
    brightBannerPng,
    brightPatchBannerPng,
    brightWithDarkPatchBannerPng,
    createPublishedBannerFixture,
  } = await import('../integration/branding-banner-fixture');
  const bytes =
    testInfo.title.startsWith('bright/') || testInfo.title.includes('/bright/')
      ? brightBannerPng()
      : testInfo.title.startsWith('bright-patch/') ||
          testInfo.title.includes('/bright-patch/')
        ? brightPatchBannerPng()
        : testInfo.title.startsWith('dark-patch/') ||
            testInfo.title.includes('/dark-patch/')
          ? brightWithDarkPatchBannerPng()
          : bannerPng();
  const fixture = await createPublishedBannerFixture(bytes);
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

for (const {
  theme,
  osTheme,
  artwork,
  locale,
  viewport,
} of themeContractCases) {
  test(`theme-contract/${artwork}/${theme}/os-${osTheme}/${locale}/${viewport.name}: card follows resolved theme`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: osTheme, reducedMotion: 'reduce' });
    const cookies: { name: string; value: string; url: string }[] = [
      { name: LOCALE_COOKIE, value: locale, url: origin },
    ];
    if (theme !== 'follow-device')
      cookies.push({ name: THEME_COOKIE, value: theme, url: origin });
    await context.addCookies(cookies);

    if (artwork === 'sampling-fallback') {
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (
          this: HTMLCanvasElement,
          type: string,
          ...rest: unknown[]
        ) {
          const context = (
            original as unknown as (
              ...args: unknown[]
            ) => CanvasRenderingContext2D | null
          ).call(this, type, ...rest);
          if (type !== '2d' || !context) return context;
          context.getImageData = () => {
            throw new DOMException(
              'Simulated cross-origin artwork',
              'SecurityError',
            );
          };
          return context;
        } as unknown as HTMLCanvasElement['getContext'];
      });
    }

    await page.goto(`/register/${encodeURIComponent(token)}`);
    const stage = page.locator('[data-registration-hero]');
    await expect(stage).toHaveAttribute('data-has-banner', 'true');
    if (artwork === 'sampling-fallback')
      await expect(stage).toHaveAttribute('data-photo-sampling', 'fallback');
    else await expect(stage).toHaveAttribute('data-photo-stats-ready', 'true');

    const surface = await expectHeroResolvedThemeContract(page);
    const resolvedTheme = theme === 'follow-device' ? osTheme : theme;
    expect(surface.theme).toBe(
      theme === 'follow-device' ? 'system' : resolvedTheme,
    );
    await expectHeroAxeClean(page);
    const screenshot = await captureHeroScreenshot(
      page,
      `theme-contract-${artwork}-${theme}-os-${osTheme}-${locale}-${viewport.name}`,
    );
    measurements.push({
      artwork,
      theme,
      osTheme,
      resolvedTheme,
      locale,
      viewport: viewport.name,
      screenshot,
      surface,
    });
  });
}

for (const artwork of ['dim', 'bright'] as const) {
  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const viewport of viewports) {
        test(`${artwork}/${locale}/${theme}/${viewport.name}: decoded published banner stays reserved and above form`, async ({
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
                  (window as Window & { __f14Shifts?: number }).__f14Shifts! +=
                    (entry as LayoutShiftLike).value;
                }
              }
            }).observe({ type: 'layout-shift', buffered: true });
          });
          const proxyResponse = page.waitForResponse((response) => {
            const pathname = new URL(response.url()).pathname;
            return pathname.startsWith('/api/branding/');
          });
          await page.goto(`/register/${encodeURIComponent(token)}`);
          await expect(
            page.locator('[data-registration-hero]'),
          ).toHaveAttribute('data-has-banner', 'true');
          await expect(
            page.locator('[data-registration-hero]'),
          ).toHaveAttribute(
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
            () =>
              (window as Window & { __f14Shifts?: number }).__f14Shifts ?? 0,
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
          await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            theme,
          );
          await expectHeroMaterialContract(page);
          const buttonTextContrast = await expectHeroTextContrast(page);
          const buttonBoundary = await expectHeroButtonBoundary(page);
          const preferenceMetrics =
            viewport.width <= 390
              ? await expectHeroPreferencesSingleRow(page)
              : null;
          await expectHeroTouchTargets(page);
          await expectHeroFocusRing(page);
          if (locale === 'ar') await expectHeroPhoneGroupLtr(page);
          await expectHeroAxeClean(page);
          const dimensions =
            viewport.width >= 768 ? await expectNoPageScroll(page) : null;
          const screenshot = await captureHeroScreenshot(
            page,
            `banner-${artwork}-${locale}-${theme}-${viewport.name}`,
          );
          const stage = await page
            .locator('[data-registration-hero]')
            .evaluate((element) => ({
              photoTone: element.dataset.photoTone ?? '',
              photoLuminance:
                element.style.getPropertyValue('--hero-photo-luminance') || '',
            }));
          measurements.push({
            artwork,
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
            ...(preferenceMetrics ? { preferenceMetrics } : {}),
          });
        });
      }
    }
  }
}

async function expectInvalidInputContrast(page: Page) {
  const result = await page.evaluate(() => {
    const invalid = document.querySelector<HTMLInputElement>(
      'input[name="password"][aria-invalid="true"]',
    );
    const valid =
      document.querySelector<HTMLInputElement>('input[name="name"]');
    if (!invalid || !valid)
      throw new Error('Expected valid and invalid inputs');
    const color = getComputedStyle(invalid).color;
    const validColor = getComputedStyle(valid).color;
    const background = getComputedStyle(
      invalid.closest('[class*="fieldControl"]')!,
    ).backgroundColor;
    const channels = (value: string) =>
      value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number) ?? [];
    const luminance = (value: string) => {
      const rgb = channels(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
    };
    const fg = luminance(color);
    const bg = luminance(background);
    return {
      color,
      validColor,
      background,
      ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
    };
  });
  expect(result.color, 'invalid field must share the valid field color').toBe(
    result.validColor,
  );
  expect(
    result.ratio,
    `${result.color} on ${result.background}`,
  ).toBeGreaterThanOrEqual(4.5);
}

for (const locale of ['ar', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`bright/invalid/${locale}/${theme}/mobile-390: preference keeps invalid text readable`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({
        reducedMotion: 'reduce',
        contrast: 'more',
      });
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, url: origin },
        { name: THEME_COOKIE, value: theme, url: origin },
      ]);
      await page.goto(`/register/${encodeURIComponent(token)}`);
      const stage = page.locator('[data-registration-hero]');
      await expect(stage).toHaveAttribute('data-photo-tone', 'mid');
      await page.locator('input[name="name"]').fill('Contrast Test');
      await page.locator('input[name="email"]').fill('contrast@example.test');
      await page.locator('input[type="tel"]').fill('1001234567');
      await page.locator('input[name="password"]').fill('short');
      await page.locator('form button[type="submit"]').click();
      const invalid = page.locator('input[name="password"]');
      await expect(invalid).toHaveAttribute('aria-invalid', 'true');
      await expect(invalid).toBeEnabled();
      await expectInvalidInputContrast(page);
      await expectHeroAxeClean(page);
      await captureHeroScreenshot(
        page,
        `invalid-${locale}-${theme}-mobile-390`,
      );
    });
  }
}

test('dim/invalid/en/light/mobile-390: preference keeps invalid text readable', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({
    reducedMotion: 'reduce',
    contrast: 'more',
  });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: 'en', url: origin },
    { name: THEME_COOKIE, value: 'light', url: origin },
  ]);
  await page.goto(`/register/${encodeURIComponent(token)}`);
  const stage = page.locator('[data-registration-hero]');
  await expect(stage).toHaveAttribute('data-photo-tone', 'dim');
  await page.locator('input[name="name"]').fill('Contrast Test');
  await page.locator('input[name="email"]').fill('contrast@example.test');
  await page.locator('input[type="tel"]').fill('1001234567');
  await page.locator('input[name="password"]').fill('short');
  await page.locator('form button[type="submit"]').click();
  const invalid = page.locator('input[name="password"]');
  await expect(invalid).toHaveAttribute('aria-invalid', 'true');
  await expect(invalid).toBeEnabled();
  await expectInvalidInputContrast(page);
  await expectHeroAxeClean(page);
});

const heroViewports = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

for (const locale of ['ar', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of heroViewports) {
      test(`bright-patch/${locale}/${theme}/${viewport.name}: a bright local patch keeps the hero text readable`, async ({
        page,
        context,
      }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: origin },
          { name: THEME_COOKIE, value: theme, url: origin },
        ]);
        await page.goto(`/register/${encodeURIComponent(token)}`);
        const stage = page.locator('[data-registration-hero]');
        await expect(stage).toHaveAttribute('data-has-banner', 'true');
        await expect(stage).toHaveAttribute('data-photo-stats-ready', 'true');
        await expect(stage).not.toHaveAttribute(
          'data-photo-sampling',
          'fallback',
        );
        await expect(page.locator('[data-registration-banner]')).toBeVisible();
        const sampling = await stage.evaluate((element) => ({
          peak: Number(
            element.style.getPropertyValue('--hero-photo-luminance'),
          ),
          average: Number(element.dataset.photoAverageLuminance),
        }));
        // Keep artwork diagnostics for the conservative upper bound.
        expect(sampling.peak).toBeGreaterThan(sampling.average);
        await expectHeroMaterialContract(page);
        await expectHeroTextContrast(page);
        const backdrop = await expectHeroTextBackdropContrast(page);
        const preferenceLabel =
          viewport.width >= 768
            ? await expectHeroPreferenceLabelContrast(page)
            : null;
        const preferenceSelect =
          viewport.width >= 768
            ? await expectHeroPreferenceSelectContrast(page)
            : null;
        await expectHeroTouchTargets(page);
        await expectHeroAxeClean(page);
        const screenshot = await captureHeroScreenshot(
          page,
          `banner-bright-patch-${locale}-${theme}-${viewport.name}`,
        );
        measurements.push({
          artwork: 'bright-patch',
          locale,
          theme,
          viewport: viewport.name,
          screenshot,
          backdrop,
          preferenceLabel,
          preferenceSelect,
          ...sampling,
        });
      });

      if (
        darkPatchCases.some(
          (testCase) =>
            testCase.locale === locale &&
            testCase.theme === theme &&
            testCase.viewport.name === viewport.name,
        )
      ) {
        test(`dark-patch/${locale}/${theme}/${viewport.name}: bright artwork with dark pixels keeps the card on-theme`, async ({
          page,
          context,
        }) => {
          await page.setViewportSize(viewport);
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await context.addCookies([
            { name: LOCALE_COOKIE, value: locale, url: origin },
            { name: THEME_COOKIE, value: theme, url: origin },
          ]);
          await page.goto(`/register/${encodeURIComponent(token)}`);
          const stage = page.locator('[data-registration-hero]');
          await expect(stage).toHaveAttribute('data-has-banner', 'true');
          await expect(stage).toHaveAttribute('data-photo-stats-ready', 'true');
          await expect(stage).toHaveAttribute('data-photo-tone', 'bright');
          const sampling = await stage.evaluate((element) => ({
            peak: Number(
              element.style.getPropertyValue('--hero-photo-luminance'),
            ),
            average: Number(element.dataset.photoAverageLuminance),
            darkest: Number(element.dataset.photoDarkestLuminance),
          }));
          // The artwork averages bright but still holds dark pixels behind the
          // text; its tone remains diagnostic and does not select the card.
          expect(sampling.average).toBeGreaterThan(0.58);
          expect(sampling.darkest).toBeLessThan(0.05);
          await expectHeroMaterialContract(page);
          await expectHeroTextContrast(page);
          await expectHeroResolvedThemeContract(page);
          const backdrop = await expectHeroTextBackdropContrast(page);
          await expectHeroTouchTargets(page);
          await expectHeroAxeClean(page);
          const screenshot = await captureHeroScreenshot(
            page,
            `banner-dark-patch-${locale}-${theme}-${viewport.name}`,
          );
          measurements.push({
            artwork: 'dark-patch',
            locale,
            theme,
            viewport: viewport.name,
            screenshot,
            backdrop,
            ...sampling,
          });
        });
      }

      test(`sampling-fallback/${locale}/${theme}/${viewport.name}: a failed artwork sample falls back to an opaque card`, async ({
        page,
        context,
      }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: origin },
          { name: THEME_COOKIE, value: theme, url: origin },
        ]);
        // Simulate a tainted canvas: the artwork read fails after the image
        // has loaded, so the hero has to use its opaque fallback.
        await page.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (
            this: HTMLCanvasElement,
            type: string,
            ...rest: unknown[]
          ) {
            const context = (
              original as unknown as (
                ...args: unknown[]
              ) => CanvasRenderingContext2D | null
            ).call(this, type, ...rest);
            if (type !== '2d' || !context) return context;
            context.getImageData = () => {
              throw new DOMException(
                'Simulated cross-origin artwork',
                'SecurityError',
              );
            };
            return context;
          } as unknown as HTMLCanvasElement['getContext'];
        });
        await page.goto(`/register/${encodeURIComponent(token)}`);
        const stage = page.locator('[data-registration-hero]');
        await expect(stage).toHaveAttribute('data-has-banner', 'true');
        await expect(stage).toHaveAttribute('data-photo-sampling', 'fallback');
        await expect(page.locator('[data-registration-banner]')).toBeVisible();
        await expectHeroMaterialContract(page);
        const fallback = await expectHeroSamplingFallback(page);
        await expectHeroTouchTargets(page);
        await expectHeroAxeClean(page);
        const screenshot = await captureHeroScreenshot(
          page,
          `banner-sampling-fallback-${locale}-${theme}-${viewport.name}`,
        );
        measurements.push({
          artwork: 'sampling-fallback',
          locale,
          theme,
          viewport: viewport.name,
          screenshot,
          fallback,
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
