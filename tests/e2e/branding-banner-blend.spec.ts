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

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hashNoise(x: number, y: number): number {
  let value = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(y | 0, 0x5f356495);
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(0, 1, x - x0);
  const fy = smoothstep(0, 1, y - y0);
  const top = hashNoise(x0, y0) * (1 - fx) + hashNoise(x0 + 1, y0) * fx;
  const bottom =
    hashNoise(x0, y0 + 1) * (1 - fx) + hashNoise(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

function testImage(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const row = y * (width * 4 + 1);
    pixels[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const cloudField =
        valueNoise(u * 4.8, v * 8) * 0.52 +
        valueNoise(u * 11, v * 21) * 0.3 +
        valueNoise(u * 27, v * 42) * 0.18;
      const grain = (hashNoise(x, y) - 0.5) * 5;
      let red: number;
      let green: number;
      let blue: number;

      const skyBlend = smoothstep(0.02, 0.64, v);
      red = 39 + skyBlend * 151;
      green = 67 + skyBlend * 79;
      blue = 100 + skyBlend * 40;
      const cloudAmount =
        (1 - smoothstep(0.43, 0.66, v)) *
        smoothstep(0.55, 0.73, cloudField) *
        0.46;
      red += cloudAmount * (230 - red);
      green += cloudAmount * (219 - green);
      blue += cloudAmount * (207 - blue);

      const sunDistance = Math.hypot((u - 0.75) * 1.3, v - 0.36);
      const sunGlow = Math.max(0, 1 - sunDistance / 0.28) ** 2 * 0.52;
      red += sunGlow * (255 - red);
      green += sunGlow * (216 - green);
      blue += sunGlow * (164 - blue);

      const farRidge =
        0.55 +
        (valueNoise(u * 8, 0.2) - 0.5) * 0.06 +
        (valueNoise(u * 31, 0.4) - 0.5) * 0.026;
      const nearRidge =
        0.68 +
        (valueNoise(u * 6.5, 1.3) - 0.5) * 0.085 +
        (valueNoise(u * 25, 2.1) - 0.5) * 0.035;
      const farLand = smoothstep(farRidge - 0.008, farRidge + 0.008, v);
      red += farLand * (50 - red);
      green += farLand * (61 - green);
      blue += farLand * (68 - blue);

      const waterBlend = smoothstep(0.63, 0.76, v);
      const ripples =
        valueNoise(u * 36, v * 118) * 0.5 +
        valueNoise(u * 91, v * 257) * 0.32 +
        valueNoise(u * 217, v * 493) * 0.18;
      const reflection =
        waterBlend *
        Math.exp(-((u - 0.75) ** 2) / 0.008) *
        smoothstep(0.22, 0.75, ripples) *
        0.86;
      const waterR = 25 + 111 * ripples;
      const waterG = 50 + 105 * ripples;
      const waterB = 69 + 91 * ripples;
      red += waterBlend * (waterR - red);
      green += waterBlend * (waterG - green);
      blue += waterBlend * (waterB - blue);
      red += reflection * (242 - red);
      green += reflection * (196 - green);
      blue += reflection * (130 - blue);

      const foreground = smoothstep(nearRidge - 0.012, nearRidge + 0.014, v);
      const treeLine =
        0.78 +
        (valueNoise(u * 39, 8) - 0.5) * 0.08 +
        (valueNoise(u * 131, 12) - 0.5) * 0.04;
      const forest =
        foreground * smoothstep(treeLine - 0.025, treeLine + 0.025, v);
      const shadowForest = u < 0.43 || u > 0.9 ? 0.9 : 0.56;
      const dark = forest * shadowForest;
      red += dark * (24 - red);
      green += dark * (35 - green);
      blue += dark * (39 - blue);

      // A backlit person stands in the upper two-thirds of the frame.
      const headDistance = Math.hypot((u - 0.5) * 1.12, (v - 0.292) * 0.82);
      const head = 1 - smoothstep(0.018, 0.021, headDistance);
      const neck =
        smoothstep(0.304, 0.317, v) *
        (1 - smoothstep(0.35, 0.364, v)) *
        (1 - smoothstep(0.009, 0.013, Math.abs(u - 0.5)));
      const torsoWidth =
        0.031 -
        smoothstep(0.385, 0.48, v) * 0.009 -
        smoothstep(0.52, 0.59, v) * 0.007;
      const torso =
        smoothstep(0.35, 0.368, v) *
        (1 - smoothstep(0.59, 0.612, v)) *
        (1 -
          smoothstep(
            torsoWidth - 0.004,
            torsoWidth + 0.004,
            Math.abs(u - 0.5),
          ));
      const leftLegCenter = 0.49 - Math.max(0, v - 0.57) * 0.07;
      const rightLegCenter = 0.51 + Math.max(0, v - 0.57) * 0.07;
      const legs =
        smoothstep(0.565, 0.58, v) *
        (1 - smoothstep(0.665, 0.678, v)) *
        Math.max(
          1 - smoothstep(0.006, 0.009, Math.abs(u - leftLegCenter)),
          1 - smoothstep(0.006, 0.009, Math.abs(u - rightLegCenter)),
        );
      const arms =
        smoothstep(0.37, 0.39, v) *
        (1 - smoothstep(0.565, 0.58, v)) *
        Math.max(
          1 - smoothstep(0.006, 0.01, Math.abs(u - (0.47 - (v - 0.39) * 0.07))),
          1 - smoothstep(0.006, 0.01, Math.abs(u - (0.53 + (v - 0.39) * 0.07))),
        );
      const subject = Math.max(head, neck, torso, legs, arms);
      red += subject * (29 - red);
      green += subject * (37 - green);
      blue += subject * (44 - blue);

      // Keep both a dark shoreline and bright reflected water at the bottom edge.
      if (v > 0.985 && u > 0.63 && u < 0.88) {
        const brightRipple = 0.35 + 0.65 * valueNoise(u * 48, v * 157);
        red += brightRipple * (226 - red);
        green += brightRipple * (174 - green);
        blue += brightRipple * (108 - blue);
      }

      const offset = row + 1 + x * 4;
      pixels[offset] = Math.max(0, Math.min(255, Math.round(red + grain)));
      pixels[offset + 1] = Math.max(
        0,
        Math.min(255, Math.round(green + grain)),
      );
      pixels[offset + 2] = Math.max(0, Math.min(255, Math.round(blue + grain)));
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
const tallImage = testImage(1600, 1200);
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

async function screenshotRegistrationCardCrop(page: Page, filename: string) {
  const card = page.locator('[data-registration-card="premium-centered"]');
  const bounds = await card.boundingBox();
  expect(bounds).not.toBeNull();
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });
  try {
    await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2);
    const margin = 12;
    const x = Math.max(0, bounds!.x - margin);
    const y = Math.max(0, bounds!.y - margin);
    const right = Math.min(1440, bounds!.x + bounds!.width + margin);
    const bottom = Math.min(900, bounds!.y + bounds!.height + margin);
    const path = join(screenshotDirectory, filename);
    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path,
      clip: { x, y, width: right - x, height: bottom - y },
      scale: 'device',
    });
    screenshots.push(path);
  } finally {
    await client.send('Emulation.clearDeviceMetricsOverride');
    await client.detach();
  }
}

async function readSeamPixels(page: Page) {
  const frame = await page
    .locator('[data-registration-banner-frame]')
    .boundingBox();
  expect(frame).not.toBeNull();
  const png = await page.screenshot({ type: 'png' });
  const pixels = await page.evaluate(
    async ({ base64, left, right, bottom, surfaceY }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context unavailable');
      context.drawImage(image, 0, 0);
      const sample = (x: number, y: number) =>
        Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
      let bottomRowMaxDelta = 0;
      let bottomRowSamples = 0;
      let bottomRowWorst: Record<string, unknown> | null = null;
      for (let x = left; x < right; x += 1) {
        const banner = sample(x, bottom - 1);
        const surface = sample(x, surfaceY);
        for (let channel = 0; channel < 3; channel += 1) {
          const delta = Math.abs(banner[channel]! - surface[channel]!);
          if (delta > bottomRowMaxDelta) {
            bottomRowMaxDelta = delta;
            bottomRowWorst = { x, channel, banner, surface, delta };
          }
        }
        bottomRowSamples += 1;
      }
      return {
        bottomRowMaxDelta,
        bottomRowSamples,
        bottomRowWorst,
      };
    },
    {
      base64: png.toString('base64'),
      left: Math.floor(frame!.x),
      right: Math.ceil(frame!.x + frame!.width),
      bottom: Math.ceil(frame!.y + frame!.height),
      surfaceY: Math.ceil(frame!.y + frame!.height),
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
              frameBorder: frameStyle.borderWidth,
              frameOutlineStyle: frameStyle.outlineStyle,
              frameBoxShadow: frameStyle.boxShadow,
              frameBackground: frameStyle.backgroundColor,
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
              overlayGradientLayers: (
                getComputedStyle(frame, '::after').backgroundImage.match(
                  /linear-gradient\(/g,
                ) ?? []
              ).length,
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
          expect(data.frameBorder).toBe('0px');
          expect(data.frameOutlineStyle).toBe('none');
          expect(data.frameBoxShadow).toBe('none');
          expect(data.frameBackground).toBe('rgba(0, 0, 0, 0)');
          expect(data.overlayGradientLayers).toBe(1);
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
          expect(
            seam.bottomRowMaxDelta,
            `${locale}/${theme}/${viewport.name} ${color} full bottom row ${JSON.stringify(seam.bottomRowWorst)}`,
          ).toBeLessThanOrEqual(2);
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
            if (viewport.width === 1440)
              await screenshotRegistrationCardCrop(
                page,
                `card-crop-image-${locale}-${theme}-1440.png`,
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
          async ({ screenshotBase64, sourceBase64, frameBox }) => {
            async function pixels(base64: string) {
              const image = new Image();
              image.src = `data:image/png;base64,${base64}`;
              await image.decode();
              const canvas = document.createElement('canvas');
              canvas.width = image.naturalWidth;
              canvas.height = image.naturalHeight;
              const context = canvas.getContext('2d');
              if (!context) throw new Error('Canvas 2D context unavailable');
              context.drawImage(image, 0, 0);
              return { image, context };
            }
            const rendered = await pixels(screenshotBase64);
            const source = await pixels(sourceBase64);
            const scale = Math.max(
              frameBox.width / source.image.naturalWidth,
              frameBox.height / source.image.naturalHeight,
            );
            const cropTop =
              (source.image.naturalHeight - frameBox.height / scale) / 2;
            const sourceYTop = Math.floor(cropTop + 2 / scale);
            const sourceYBottom = Math.floor(
              cropTop + (frameBox.height - 3) / scale,
            );
            const screenX = Math.round(frameBox.x + frameBox.width / 2);
            const screenTopY = Math.ceil(frameBox.y + 2);
            const screenBottomY = Math.ceil(frameBox.y + frameBox.height - 3);
            const rgb = (
              context: CanvasRenderingContext2D,
              x: number,
              y: number,
            ) => Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
            return {
              renderedTop: rgb(rendered.context, screenX, screenTopY),
              sourceTop: rgb(source.context, 800, sourceYTop),
              renderedBottom: rgb(rendered.context, screenX, screenBottomY),
              sourceBottom: rgb(source.context, 800, sourceYBottom),
            };
          },
          {
            screenshotBase64: (await page.screenshot({ type: 'png' })).toString(
              'base64',
            ),
            sourceBase64: tallImage.toString('base64'),
            frameBox: frame!,
          },
        );
        for (let channel = 0; channel < 3; channel += 1) {
          expect(
            Math.abs(
              cropPixels.renderedTop[channel]! - cropPixels.sourceTop[channel]!,
            ),
          ).toBeLessThanOrEqual(6);
          expect(
            Math.abs(
              cropPixels.renderedBottom[channel]! -
                cropPixels.sourceBottom[channel]!,
            ),
          ).toBeLessThanOrEqual(6);
        }
        expect(cropPixels.sourceTop).not.toEqual(cropPixels.sourceBottom);
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
        if (viewport.width === 1440)
          await screenshotRegistrationCardCrop(
            page,
            `card-crop-fallback-${locale}-${theme}-1440.png`,
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

test('procedural banner fixtures have tonal texture and a centered subject', async ({
  page,
}) => {
  const details = await page.evaluate(
    async ({ wideBase64, tallBase64 }) => {
      async function inspect(base64: string) {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context unavailable');
        context.drawImage(image, 0, 0);
        const pixel = (x: number, y: number) =>
          Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
        const luminance = (rgb: number[]) =>
          rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
        const bottom = Array.from({ length: 161 }, (_, index) =>
          luminance(
            pixel(
              Math.round((index / 160) * (image.naturalWidth - 1)),
              image.naturalHeight - 2,
            ),
          ),
        );
        const sampledColors = new Set<string>();
        for (let y = 24; y < image.naturalHeight; y += 13) {
          for (let x = 19; x < image.naturalWidth; x += 17)
            sampledColors.add(pixel(x, y).join(','));
        }
        return {
          width: image.naturalWidth,
          height: image.naturalHeight,
          bottomMin: Math.min(...bottom),
          bottomMax: Math.max(...bottom),
          sampledColorCount: sampledColors.size,
          subjectLuminance: luminance(
            pixel(
              Math.round(image.naturalWidth * 0.5),
              Math.round(image.naturalHeight * 0.48),
            ),
          ),
          adjacentLuminance: luminance(
            pixel(
              Math.round(image.naturalWidth * 0.43),
              Math.round(image.naturalHeight * 0.48),
            ),
          ),
        };
      }
      return Promise.all([inspect(wideBase64), inspect(tallBase64)]);
    },
    {
      wideBase64: wideImage.toString('base64'),
      tallBase64: tallImage.toString('base64'),
    },
  );

  expect(details.map(({ width, height }) => [width, height])).toEqual([
    [1600, 800],
    [1600, 1200],
  ]);
  for (const fixture of details) {
    expect(fixture.sampledColorCount).toBeGreaterThan(200);
    expect(fixture.bottomMin).toBeLessThan(55);
    expect(fixture.bottomMax).toBeGreaterThan(140);
    expect(fixture.subjectLuminance).toBeLessThan(
      fixture.adjacentLuminance * 0.65,
    );
  }
});

test('frame and overlay style contract detects outline, background, and extra gradient layers', async ({
  page,
}) => {
  responseImage = wideImage;
  await installImageRoute(page);
  await setPreferences(page, 'en', 'light', 390, 844);
  await page.goto('/showcase/f14-banner?real=1');
  const frame = page.locator('[data-registration-banner-frame]');
  await expect(frame).toBeVisible();
  const cleanFrame = async () =>
    frame.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        border: style.borderWidth,
        outlineStyle: style.outlineStyle,
        boxShadow: style.boxShadow,
        background: style.backgroundColor,
        gradientLayers: (
          getComputedStyle(element, '::after').backgroundImage.match(
            /linear-gradient\(/g,
          ) ?? []
        ).length,
      };
    });
  const initial = await cleanFrame();
  expect(initial).toEqual({
    border: '0px',
    outlineStyle: 'none',
    boxShadow: 'none',
    background: 'rgba(0, 0, 0, 0)',
    gradientLayers: 1,
  });
  await frame.evaluate((element) => {
    (element as HTMLElement).style.outline = '1px solid rgb(128 128 128)';
  });
  expect((await cleanFrame()).outlineStyle).toBe('solid');
  await frame.evaluate((element) => {
    const target = element as HTMLElement;
    target.style.removeProperty('outline');
    target.style.backgroundColor = 'var(--color-card-raised)';
  });
  expect((await cleanFrame()).background).not.toBe('rgba(0, 0, 0, 0)');
  await frame.evaluate((element) => {
    const overlay = element as HTMLElement;
    overlay.style.setProperty('--mutation-gradient', 'none');
    const style = document.createElement('style');
    style.textContent =
      '[data-registration-banner-frame]::after { background-image: linear-gradient(to right, transparent, black), linear-gradient(to bottom, transparent, white) !important; }';
    document.head.append(style);
  });
  expect((await cleanFrame()).gradientLayers).toBe(2);
});
