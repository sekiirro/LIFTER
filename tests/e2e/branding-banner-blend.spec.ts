import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3214';
const screenshotDirectory = join(
  tmpdir(),
  `lifter-f14-banner-blend-${process.pid}`,
);
const viewports = [
  {
    name: '390',
    width: 390,
    height: 844,
    expectedWidth: 316,
    expectedHeight: 158,
  },
  {
    name: '768',
    width: 768,
    height: 1024,
    expectedWidth: 630,
    expectedHeight: 288,
  },
  {
    name: '1440',
    width: 1440,
    height: 900,
    expectedWidth: 630,
    expectedHeight: 288,
  },
];
const brandColors = ['#FFFF00', '#111111', '#2563EB', '#FF00FF'] as const;
const screenshots: string[] = [];
const measurements: Record<string, unknown>[] = [];

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.byteLength);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([size, body, checksum]);
}

function testImage(width: number, height: number, bands = false): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const stripeColor = bands
      ? y < height / 4
        ? [230, 40, 40]
        : y >= (height * 3) / 4
          ? [35, 75, 205]
          : [35, 170, 70]
      : [40, 80, 120];
    const row = y * (width * 4 + 1);
    pixels[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      pixels[offset] = stripeColor[0]!;
      pixels[offset + 1] = stripeColor[1]!;
      pixels[offset + 2] = stripeColor[2]!;
      pixels[offset + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const wideImage = testImage(1600, 800);
const tallImage = testImage(1600, 1200, true);
let responseImage = wideImage;

async function setPreferences(
  page: Page,
  locale: 'ar' | 'en',
  theme: 'light' | 'dark',
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  await page.context().addCookies([
    { name: LOCALE_COOKIE, value: locale, url: origin },
    { name: THEME_COOKIE, value: theme, url: origin },
  ]);
  await page.addInitScript(() => {
    (window as Window & { __bannerCls?: number }).__bannerCls = 0;
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        };
        if (!shift.hadRecentInput)
          (window as Window & { __bannerCls?: number }).__bannerCls! +=
            shift.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

async function installImageRoute(page: Page) {
  await page.route('**/api/branding/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: responseImage,
      headers: { 'cache-control': 'no-store' },
    });
  });
}

async function screenshot(page: Page, filename: string) {
  await page.addStyleTag({
    content: 'nextjs-portal { display: none !important; }',
  });
  await mkdir(screenshotDirectory, { recursive: true });
  const path = join(screenshotDirectory, filename);
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}

async function readSeamPixels(page: Page) {
  const frame = await page
    .locator('[data-registration-banner-frame]')
    .boundingBox();
  expect(frame).not.toBeNull();
  const png = await page.screenshot({ type: 'png' });
  const pixels = await page.evaluate(
    async ({ base64, x, bannerY, surfaceY }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context unavailable');
      context.drawImage(image, 0, 0);
      const sample = (y: number) =>
        Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
      return { banner: sample(bannerY), surface: sample(surfaceY) };
    },
    {
      base64: png.toString('base64'),
      x: Math.round(frame!.x + frame!.width / 2),
      bannerY: Math.ceil(frame!.y + frame!.height) - 1,
      surfaceY: Math.ceil(frame!.y + frame!.height) + 1,
    },
  );
  return pixels;
}

async function expectAxeClean(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

test.afterAll(() => {
  console.info(
    `Banner blend screenshots (${screenshots.length}): ${screenshotDirectory}`,
  );
  for (const path of screenshots) console.info(path);
  return mkdir(screenshotDirectory, { recursive: true }).then(() =>
    writeFile(
      join(screenshotDirectory, 'measurements.json'),
      `${JSON.stringify(measurements, null, 2)}\n`,
      'utf8',
    ),
  );
});

for (const locale of ['ar', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of viewports) {
      test(`${locale}/${theme}/${viewport.name}: real component geometry, seams, crop and axe`, async ({
        page,
      }) => {
        responseImage = wideImage;
        await installImageRoute(page);
        await setPreferences(
          page,
          locale,
          theme,
          viewport.width,
          viewport.height,
        );
        let semanticReference: [string, string, string] | null = null;

        for (const color of brandColors) {
          await page.goto(
            `/showcase/f14-banner?real=1&brand=${encodeURIComponent(color)}`,
          );
          const image = page.locator('[data-registration-banner]');
          await expect(image).toBeVisible();
          await image.evaluate((element: HTMLImageElement) => element.decode());
          const data = await image.evaluate((element: HTMLImageElement) => {
            const frame = element.parentElement!;
            const imageStyle = getComputedStyle(element);
            const frameStyle = getComputedStyle(frame);
            const rect = frame.getBoundingClientRect();
            return {
              naturalWidth: element.naturalWidth,
              naturalHeight: element.naturalHeight,
              naturalRatio: element.naturalWidth / element.naturalHeight,
              imageWidthHint: element.getAttribute('width'),
              imageHeightHint: element.getAttribute('height'),
              imageBoxWidth: element.getBoundingClientRect().width,
              imageBoxHeight: element.getBoundingClientRect().height,
              objectFit: imageStyle.objectFit,
              objectPosition: imageStyle.objectPosition,
              frameWidth: rect.width,
              frameHeight: rect.height,
              frameAspectRatio: frameStyle.aspectRatio,
              overflow: frameStyle.overflow,
              position: frameStyle.position,
              cardSurface: getComputedStyle(
                frame.closest('[data-registration-card="premium-centered"]')!,
              ).backgroundColor,
              semanticSuccess: getComputedStyle(document.documentElement)
                .getPropertyValue('--color-success-fg')
                .trim(),
              semanticWarning: getComputedStyle(document.documentElement)
                .getPropertyValue('--color-warning-fg')
                .trim(),
              semanticError: getComputedStyle(document.documentElement)
                .getPropertyValue('--color-error-fg')
                .trim(),
              overlayDisplay: getComputedStyle(frame, '::after').display,
              overlayAnimation: getComputedStyle(frame, '::after')
                .animationDuration,
              overlayTransition: getComputedStyle(frame, '::after')
                .transitionDuration,
              frameTop: rect.top,
              frameBottom: rect.bottom,
            };
          });
          expect(data.naturalWidth).toBe(1600);
          expect(data.naturalHeight).toBe(800);
          expect(data.naturalRatio).toBe(2);
          expect(data.imageWidthHint).toBe('1600');
          expect(data.imageHeightHint).toBe('800');
          expect(data.objectFit).toBe('cover');
          expect(data.objectPosition).toBe('50% 50%');
          expect(data.imageBoxWidth).toBeCloseTo(data.frameWidth, 1);
          expect(data.imageBoxHeight).toBeCloseTo(data.frameHeight, 1);
          expect(data.frameAspectRatio).toBe('2 / 1');
          expect(data.overflow).toBe('hidden');
          expect(data.position).toBe('relative');
          expect(data.frameWidth).toBeCloseTo(viewport.expectedWidth, 0);
          expect(data.frameHeight).toBeCloseTo(viewport.expectedHeight, 0);
          expect(data.overlayAnimation).toBe('0s');
          expect(data.overlayTransition).toBe('0s');
          expect(data.semanticSuccess).not.toBe('');
          expect(data.semanticWarning).not.toBe('');
          expect(data.semanticError).not.toBe('');
          const semanticValues = [
            data.semanticSuccess,
            data.semanticWarning,
            data.semanticError,
          ] as [string, string, string];
          if (semanticReference === null) semanticReference = semanticValues;
          else expect(semanticValues).toEqual(semanticReference);
          expect(
            await page
              .locator('form')
              .first()
              .evaluate((form) => form.getBoundingClientRect().top),
          ).toBeGreaterThanOrEqual(data.frameBottom);
          const cls = await page.evaluate(
            () =>
              (window as Window & { __bannerCls?: number }).__bannerCls ?? 0,
          );
          expect(cls).toBe(0);

          const seam = await readSeamPixels(page);
          for (let channel = 0; channel < 3; channel += 1) {
            expect(
              Math.abs(seam.banner[channel]! - seam.surface[channel]!),
              `${locale}/${theme}/${viewport.name} ${color} channel ${channel}`,
            ).toBeLessThanOrEqual(2);
          }
          await expectAxeClean(page);
          measurements.push({
            locale,
            theme,
            viewport: viewport.name,
            brandColor: color,
            frame: { width: data.frameWidth, height: data.frameHeight },
            naturalSize: {
              width: data.naturalWidth,
              height: data.naturalHeight,
            },
            objectFit: data.objectFit,
            objectPosition: data.objectPosition,
            cls,
            seam,
            channelDeltas: seam.banner.map((channel, index) =>
              Math.abs(channel - seam.surface[index]!),
            ),
          });

          if (color === '#2563EB') {
            await expect(page.locator('html')).toHaveAttribute('lang', locale);
            await expect(page.locator('html')).toHaveAttribute(
              'dir',
              locale === 'ar' ? 'rtl' : 'ltr',
            );
            await expect(page.locator('html')).toHaveAttribute(
              'data-theme',
              theme,
            );
            await screenshot(
              page,
              `loaded-${locale}-${theme}-${viewport.name}.png`,
            );
          }
        }
      });

      test(`${locale}/${theme}/${viewport.name}: non-2:1 image covers and centers without distortion`, async ({
        page,
      }) => {
        responseImage = tallImage;
        await installImageRoute(page);
        await setPreferences(
          page,
          locale,
          theme,
          viewport.width,
          viewport.height,
        );
        await page.goto('/showcase/f14-banner?real=1&source=tall');
        const image = page.locator('[data-registration-banner]');
        await expect(image).toBeVisible();
        await image.evaluate((element: HTMLImageElement) => element.decode());
        const crop = await image.evaluate((element: HTMLImageElement) => {
          const frame = element.parentElement!.getBoundingClientRect();
          const style = getComputedStyle(element);
          const scale = Math.max(
            frame.width / element.naturalWidth,
            frame.height / element.naturalHeight,
          );
          return {
            naturalWidth: element.naturalWidth,
            naturalHeight: element.naturalHeight,
            objectFit: style.objectFit,
            objectPosition: style.objectPosition,
            imageBoxRatio:
              element.getBoundingClientRect().width /
              element.getBoundingClientRect().height,
            naturalRatio: element.naturalWidth / element.naturalHeight,
            uniformScaleWidth: element.naturalWidth * scale,
            uniformScaleHeight: element.naturalHeight * scale,
            frameWidth: frame.width,
            frameHeight: frame.height,
          };
        });
        expect(crop.naturalWidth).toBe(1600);
        expect(crop.naturalHeight).toBe(1200);
        expect(crop.objectFit).toBe('cover');
        expect(crop.objectPosition).toBe('50% 50%');
        expect(crop.naturalRatio).toBeCloseTo(4 / 3, 5);
        expect(crop.imageBoxRatio).not.toBeCloseTo(crop.naturalRatio, 2);
        expect(crop.uniformScaleWidth).toBeGreaterThanOrEqual(crop.frameWidth);
        expect(crop.uniformScaleHeight).toBeGreaterThanOrEqual(
          crop.frameHeight,
        );
        const frame = await page
          .locator('[data-registration-banner-frame]')
          .boundingBox();
        expect(frame).not.toBeNull();
        await page.emulateMedia({ forcedColors: 'active' });
        const cropPixels = await page.evaluate(
          async ({ base64, x, topY, bottomY }) => {
            const image = new Image();
            image.src = `data:image/png;base64,${base64}`;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas 2D context unavailable');
            context.drawImage(image, 0, 0);
            const sample = (y: number) =>
              Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
            return { top: sample(topY), bottom: sample(bottomY) };
          },
          {
            base64: (await page.screenshot({ type: 'png' })).toString('base64'),
            x: Math.round(frame!.x + frame!.width / 2),
            topY: Math.ceil(frame!.y + 2),
            bottomY: Math.ceil(frame!.y + frame!.height - 3),
          },
        );
        expect(cropPixels.top).toEqual([230, 40, 40]);
        expect(cropPixels.bottom).toEqual([35, 75, 205]);
        await page.emulateMedia({ forcedColors: 'none' });
        await screenshot(
          page,
          `tall-source-${locale}-${theme}-${viewport.name}.png`,
        );
      });

      test(`${locale}/${theme}/${viewport.name}: fallback stays unchanged without a gradient`, async ({
        page,
      }) => {
        await setPreferences(
          page,
          locale,
          theme,
          viewport.width,
          viewport.height,
        );
        await page.goto('/showcase/f14-banner?real=1&image=missing');
        const fallback = page.locator('[data-registration-banner-fallback]');
        await expect(fallback).toBeVisible();
        await expect(
          page.locator('[data-registration-banner-frame]'),
        ).toHaveCount(0);
        const style = await fallback.evaluate((element) => {
          const computed = getComputedStyle(element);
          return {
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
            ratio: computed.aspectRatio,
            minBlockSize: computed.minBlockSize,
            maxBlockSize: computed.maxBlockSize,
            overlay: getComputedStyle(element, '::after').content,
          };
        });
        expect(style.width).toBeCloseTo(viewport.expectedWidth, 0);
        expect(style.height).toBeCloseTo(viewport.expectedHeight, 0);
        expect(style.ratio).toBe('2 / 1');
        expect(style.minBlockSize).toBe('128px');
        expect(style.maxBlockSize).toBe('288px');
        expect(style.overlay).toBe('none');
        await expectAxeClean(page);
        await screenshot(
          page,
          `fallback-${locale}-${theme}-${viewport.name}.png`,
        );
      });
    }
  }
}

test('blend overlay is hidden in forced-colors and print', async ({ page }) => {
  await installImageRoute(page);
  await setPreferences(page, 'en', 'light', 390, 844);
  await page.goto('/showcase/f14-banner?real=1');
  const frame = page.locator('[data-registration-banner-frame]');
  await expect(frame).toBeVisible();
  await page.emulateMedia({ forcedColors: 'active' });
  await expect
    .poll(() =>
      frame.evaluate((element) => getComputedStyle(element, '::after').display),
    )
    .toBe('none');
  await page.emulateMedia({ media: 'print' });
  await expect
    .poll(() =>
      frame.evaluate((element) => getComputedStyle(element, '::after').display),
    )
    .toBe('none');
});
