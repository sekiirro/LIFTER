import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3216';
const output = join(tmpdir(), `lifter-f14-hero-review-${process.pid}`);
const requiredVariants = (['ar', 'en'] as const).flatMap((locale) =>
  (['light', 'dark'] as const).flatMap((theme) => [
    {
      locale,
      theme,
      width: 390,
      height: 844,
      name: `${locale}-${theme}-mobile-390`,
    },
    {
      locale,
      theme,
      width: 1440,
      height: 900,
      name: `${locale}-${theme}-desktop-1440`,
    },
  ]),
);
const axePasses: string[] = [];
const measurements: Array<Record<string, unknown>> = [];
const screenshots: Array<{
  path: string;
  label: string;
  group: 'required' | 'extras' | 'comparison';
}> = [];

async function openPrototype(
  browser: Browser,
  options: {
    locale: 'ar' | 'en';
    theme: 'light' | 'dark';
    width: number;
    height: number;
    fixture?: string;
    effect?: string;
    material?: 'A' | 'B';
    reducedMotion?: boolean;
    forcedColors?: 'active' | 'none';
    cdpFeatures?: Array<{ name: string; value: string }>;
  },
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: 2,
    reducedMotion: options.reducedMotion ? 'reduce' : 'no-preference',
    colorScheme: options.theme,
    forcedColors: options.forcedColors,
  });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: options.locale, url: origin },
    { name: THEME_COOKIE, value: options.theme, url: origin },
  ]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    const metrics = { lcpMs: 0, cls: 0 };
    (window as Window & { __heroMetrics?: typeof metrics }).__heroMetrics =
      metrics;
    try {
      new PerformanceObserver((entries) => {
        const latest = entries.getEntries().at(-1);
        if (latest) metrics.lcpMs = latest.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput?: boolean;
            value?: number;
          };
          if (!shift.hadRecentInput) {
            metrics.cls += shift.value ?? 0;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Older engines can omit one observer; measurement remains best effort.
    }
  });
  if (options.cdpFeatures?.length) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: options.cdpFeatures,
    });
  }
  await page.goto(
    `/showcase/f14-hero-glass?fixture=${options.fixture ?? 'dark'}&material=${(options.material ?? 'A').toLowerCase()}&effect=${options.effect ?? (options.material === 'B' ? 'webgl' : 'blur')}`,
    { waitUntil: 'domcontentloaded' },
  );
  await expect(page.getByTestId('hero-prototype')).toBeVisible();
  if (options.fixture !== 'none') {
    await page.waitForTimeout(800);
    await expect(page.locator('[data-hero-image]')).toHaveAttribute(
      'data-loaded',
      'true',
      {
        timeout: 45_000,
      },
    );
    await page
      .locator('[data-hero-image]')
      .evaluate((image) => (image as HTMLImageElement).decode());
  }
  if (
    options.material === 'B' &&
    options.effect === 'webgl' &&
    options.width >= 768 &&
    !options.reducedMotion &&
    !options.forcedColors &&
    !options.cdpFeatures?.some(
      ({ name }) =>
        name === 'prefers-reduced-transparency' || name === 'prefers-contrast',
    )
  ) {
    await expect(page.getByTestId('hero-glass-card')).toHaveAttribute(
      'data-effect-active',
      'webgl',
      { timeout: 10_000 },
    );
  }
  await page.evaluate(() => document.fonts.ready);
  return { page, close: () => context.close() };
}

async function checkAxe(
  page: Page,
  label: string,
  disableRules: string[] = [],
) {
  const results = await new AxeBuilder({ page })
    .disableRules(disableRules)
    .analyze();
  axePasses.push(label);
  expect(
    results.violations,
    `${label}: ${JSON.stringify(results.violations)}`,
  ).toEqual([]);
}

async function measureMobileGradient(page: Page) {
  const artHeight = await page
    .locator('[data-hero-image]')
    .evaluate((image) => image.getBoundingClientRect().height);
  const screenshot = await page.screenshot({ fullPage: true, scale: 'device' });
  return page.evaluate(
    async ({ encoded, artHeight }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Gradient screenshot sampler unavailable');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      const linear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      };
      const sampleStrip = (side: 'left' | 'right') => {
        const xStart = side === 'left' ? 0 : canvas.width - 18;
        const deltas: number[] = [];
        const cssHeight = canvas.height / 2;
        const start = Math.floor((artHeight * 0.56 * 2) / 16) * 16;
        const end = Math.min(
          canvas.height - 16,
          Math.ceil((artHeight + 112) * 2),
        );
        let previous: number | undefined;
        for (let y = start; y <= end; y += 16) {
          let sum = 0;
          let count = 0;
          for (let py = y; py < Math.min(y + 16, canvas.height); py += 1) {
            for (let x = xStart; x < xStart + 18; x += 1) {
              const offset = (py * canvas.width + x) * 4;
              sum +=
                0.2126 * linear(pixels[offset]!) +
                0.7152 * linear(pixels[offset + 1]!) +
                0.0722 * linear(pixels[offset + 2]!);
              count += 1;
            }
          }
          const current = sum / Math.max(1, count);
          if (previous !== undefined) deltas.push(Math.abs(current - previous));
          previous = current;
        }
        return {
          maxDeltaL: Math.max(...deltas),
          rows: deltas.length,
          cssHeight,
        };
      };
      const left = sampleStrip('left');
      const right = sampleStrip('right');
      return {
        artHeight,
        left,
        right,
        maxDeltaL: Math.max(left.maxDeltaL, right.maxDeltaL),
      };
    },
    { encoded: screenshot.toString('base64'), artHeight },
  );
}

async function measureLensDisplacement(
  page: Page,
  lensOff: Buffer,
  lensOn: Buffer,
) {
  return page.evaluate(
    async ({ off, on }) => {
      const decode = async (source: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${source}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Lens crop pixel sampler unavailable');
        context.drawImage(image, 0, 0);
        return {
          width: canvas.width,
          height: canvas.height,
          pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
        };
      };
      const before = await decode(off);
      const after = await decode(on);
      if (before.width !== after.width || before.height !== after.height)
        throw new Error('Lens before/after crops have different dimensions');
      const x0 = Math.min(8, before.width - 1);
      const x1 = Math.min(before.width - 10, 48);
      let sum = 0;
      let changed = 0;
      let count = 0;
      for (let y = 0; y < before.height; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const index = (y * before.width + x) * 4;
          const delta =
            Math.abs(before.pixels[index]! - after.pixels[index]!) +
            Math.abs(before.pixels[index + 1]! - after.pixels[index + 1]!) +
            Math.abs(before.pixels[index + 2]! - after.pixels[index + 2]!);
          sum += delta / 3;
          if (delta >= 18) changed += 1;
          count += 1;
        }
      }
      const luminance = (pixels: Uint8ClampedArray, x: number, y: number) => {
        const index = (y * before.width + x) * 4;
        const linear = (channel: number) => {
          const value = channel / 255;
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        };
        return (
          0.2126 * linear(pixels[index]!) +
          0.7152 * linear(pixels[index + 1]!) +
          0.0722 * linear(pixels[index + 2]!)
        );
      };
      const horizonPath = (pixels: Uint8ClampedArray) => {
        const path: number[] = [];
        // Follow the bright horizon independently per column. Averaging across
        // the crop hides the edge-weighted bend because most columns stay still.
        for (let x = 18; x < Math.min(before.width - 8, 56); x += 1) {
          let bestRow = 0;
          let bestLuminance = -1;
          for (let y = 70; y < Math.min(before.height, 214); y += 1) {
            const value = luminance(pixels, x, y);
            if (value > bestLuminance) {
              bestLuminance = value;
              bestRow = y;
            }
          }
          path.push(bestRow);
        }
        return path;
      };
      const offPath = horizonPath(before.pixels);
      const onPath = horizonPath(after.pixels);
      const displacement = offPath.map((row, index) =>
        Math.abs(onPath[index]! - row),
      );
      const offFeature = {
        fromRow: Math.min(...offPath),
        toRow: Math.max(...offPath),
      };
      const onFeature = {
        fromRow: Math.min(...onPath),
        toRow: Math.max(...onPath),
      };
      return {
        size: `${before.width}x${before.height}`,
        outerBandMeanRgbDelta: sum / count,
        changedPixelFraction: changed / count,
        offFeature,
        onFeature,
        maxFeatureDisplacementPx: Math.max(...displacement),
        meanFeatureDisplacementPx:
          displacement.reduce((total, value) => total + value, 0) /
          displacement.length,
      };
    },
    { off: lensOff.toString('base64'), on: lensOn.toString('base64') },
  );
}

async function measureRimHighlight(page: Page, crop: Buffer) {
  return page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Rim crop pixel sampler unavailable');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const linear = (channel: number) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };
    const average = (y0: number, y1: number, x0: number, x1: number) => {
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const index = (y * canvas.width + x) * 4;
          sum +=
            0.2126 * linear(pixels[index]!) +
            0.7152 * linear(pixels[index + 1]!) +
            0.0722 * linear(pixels[index + 2]!);
          count += 1;
        }
      }
      return sum / count;
    };
    const topRim = average(0, 3, 36, Math.min(canvas.width - 36, 150));
    const topInner = average(5, 10, 36, Math.min(canvas.width - 36, 150));
    const bottomRim = average(
      canvas.height - 3,
      canvas.height,
      canvas.width - 150,
      canvas.width - 36,
    );
    const bottomInner = average(
      canvas.height - 10,
      canvas.height - 5,
      canvas.width - 150,
      canvas.width - 36,
    );
    return {
      topLeftLift: topRim - topInner,
      bottomRightLift: bottomRim - bottomInner,
      directionalHighlightDelta: topRim - bottomRim,
    };
  }, crop.toString('base64'));
}

async function capture(
  browser: Browser,
  options: Parameters<typeof openPrototype>[1] & {
    label: string;
    group: 'required' | 'extras' | 'comparison';
    screenshotName: string;
    fullPage?: boolean;
  },
) {
  const { page, close } = await openPrototype(browser, options);
  await checkAxe(
    page,
    options.label,
    options.forcedColors === 'active' ? ['color-contrast'] : [],
  );
  const vitals = await page.evaluate(
    () =>
      (window as Window & { __heroMetrics?: { lcpMs: number; cls: number } })
        .__heroMetrics ?? { lcpMs: 0, cls: 0 },
  );
  expect(vitals.cls, `${options.label} CLS`).toBeLessThanOrEqual(0.1);
  measurements.push({ label: options.label, vitals });
  const path = join(output, options.screenshotName);
  await page.screenshot({
    path,
    fullPage: options.fullPage ?? false,
    scale: 'device',
    animations: 'disabled',
    style: 'nextjs-portal{display:none!important}',
  });
  screenshots.push({ path, label: options.label, group: options.group });
  await close();
}

async function buildContactSheet(
  browser: Browser,
  group: 'required' | 'extras' | 'comparison',
) {
  const items = screenshots.filter((item) => item.group === group);
  const columns = group === 'required' ? 4 : group === 'comparison' ? 2 : 4;
  const tileWidth = group === 'comparison' ? 560 : 520;
  const tileHeight = group === 'comparison' ? 380 : 330;
  const labelHeight = 34;
  const rows = Math.ceil(items.length / columns);
  const width = columns * tileWidth;
  const height = rows * (tileHeight + labelHeight);
  const data = await Promise.all(
    items.map(async (item) => ({
      label: item.label,
      src: `data:image/png;base64,${(await readFile(item.path)).toString('base64')}`,
    })),
  );
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.setContent('<canvas id="sheet"></canvas>');
  const encoded = await page.evaluate(
    async ({
      data,
      columns,
      tileWidth,
      tileHeight,
      labelHeight,
      width,
      height,
    }) => {
      const canvas = document.querySelector<HTMLCanvasElement>('#sheet');
      if (!canvas) throw new Error('Contact sheet canvas unavailable');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Contact sheet context unavailable');
      context.fillStyle = '#181a1d';
      context.fillRect(0, 0, width, height);
      for (const [index, item] of data.entries()) {
        const image = new Image();
        image.src = item.src;
        await image.decode();
        const x = (index % columns) * tileWidth;
        const y = Math.floor(index / columns) * (tileHeight + labelHeight);
        context.fillStyle = '#f5f6f7';
        context.font = '600 17px sans-serif';
        context.fillText(item.label, x + 12, y + 23, tileWidth - 24);
        context.fillStyle = '#262a30';
        context.fillRect(x, y + labelHeight, tileWidth, tileHeight);
        const maxW = tileWidth - 18;
        const maxH = tileHeight - 18;
        const scale = Math.min(
          maxW / image.naturalWidth,
          maxH / image.naturalHeight,
        );
        const drawnW = image.naturalWidth * scale;
        const drawnH = image.naturalHeight * scale;
        context.drawImage(
          image,
          x + (tileWidth - drawnW) / 2,
          y + labelHeight + (tileHeight - drawnH) / 2,
          drawnW,
          drawnH,
        );
      }
      return canvas.toDataURL('image/png');
    },
    { data, columns, tileWidth, tileHeight, labelHeight, width, height },
  );
  const path = join(output, `contact-sheet-${group}.png`);
  await writeFile(path, Buffer.from(encoded.split(',')[1]!, 'base64'));
  await context.close();
  console.log(`CONTACT_SHEET ${path}`);
}

async function measureContrast(
  page: Page,
  locale: string,
  theme: string,
  fixture: string,
) {
  await page.keyboard.press('Tab');
  const result = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(
      '[data-testid="hero-glass-card"]',
    );
    const image = document.querySelector<HTMLImageElement>('[data-hero-image]');
    if (!card || !image)
      throw new Error('Contrast fixture missing its card or artwork');
    const parse = (color: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Color probe canvas unavailable');
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 4);
    };
    const linear = (channel: number) => {
      const c = channel / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (rgb: number[]) =>
      0.2126 * linear(rgb[0]!) +
      0.7152 * linear(rgb[1]!) +
      0.0722 * linear(rgb[2]!);
    const ratio = (foreground: number[], background: number[]) => {
      const values = [luminance(foreground), luminance(background)].sort(
        (a, b) => b - a,
      );
      return (values[0]! + 0.05) / (values[1]! + 0.05);
    };
    const shell = card.querySelector<HTMLElement>(
      '[data-testid="hero-glass-shell"]',
    );
    const plate = card.querySelector<HTMLElement>(
      '[data-testid="hero-content-plate"]',
    );
    if (!shell || !plate) throw new Error('Glass layer stack is incomplete');
    const surfaceStyle = getComputedStyle(shell);
    const tint = parse(surfaceStyle.backgroundColor);
    const legibility = parse(getComputedStyle(plate).backgroundColor);
    const material = card.dataset.material ?? 'A';
    const cardBounds = card.getBoundingClientRect();
    const imageBounds = image.getBoundingClientRect();
    const scale = Math.max(
      imageBounds.width / image.naturalWidth,
      imageBounds.height / image.naturalHeight,
    );
    const renderedWidth = image.naturalWidth * scale;
    const renderedHeight = image.naturalHeight * scale;
    const position = getComputedStyle(image).objectPosition.split(' ');
    const xPercent = Number.parseFloat(position[0] ?? '50') / 100;
    const yPercent = Number.parseFloat(position[1] ?? '50') / 100;
    const left =
      imageBounds.left + (imageBounds.width - renderedWidth) * xPercent;
    const top =
      imageBounds.top + (imageBounds.height - renderedHeight) * yPercent;
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Artwork sampling context unavailable');
    context.drawImage(image, left, top, renderedWidth, renderedHeight);
    const behind: number[][] = [];
    for (let y = 0; y < 20; y += 1) {
      for (let x = 0; x < 20; x += 1) {
        const px = Math.max(
          0,
          Math.min(
            canvas.width - 1,
            Math.floor(cardBounds.left + ((x + 0.5) / 20) * cardBounds.width),
          ),
        );
        const py = Math.max(
          0,
          Math.min(
            canvas.height - 1,
            Math.floor(cardBounds.top + ((y + 0.5) / 20) * cardBounds.height),
          ),
        );
        behind.push(
          Array.from(context.getImageData(px, py, 1, 1).data).slice(0, 3),
        );
      }
    }
    const composite = behind.map((pixel) => {
      const shell = [0, 1, 2].map(
        (channel) =>
          tint[channel]! * (tint[3]! / 255) +
          pixel[channel]! * (1 - tint[3]! / 255),
      );
      return material === 'B'
        ? [0, 1, 2].map(
            (channel) =>
              legibility[channel]! * (legibility[3]! / 255) +
              shell[channel]! * (1 - legibility[3]! / 255),
          )
        : shell;
    });
    const textTargets = Array.from(
      card.querySelectorAll<HTMLElement>('[data-brand-name], h1, label, p'),
    );
    const textRatios = textTargets.map((node) => ({
      label: node.textContent?.trim().slice(0, 36),
      ratio: Math.min(
        ...composite.map((background) =>
          ratio(parse(getComputedStyle(node).color), background),
        ),
      ),
    }));
    const fields = Array.from(
      card.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        'input:not([type=hidden]),select',
      ),
    );
    const controlRatios = fields.map((field) => {
      field.focus();
      const style = getComputedStyle(field);
      return {
        label: field.getAttribute('aria-label'),
        text: ratio(parse(style.color), parse(style.backgroundColor)),
        border: ratio(
          parse(style.borderTopColor),
          parse(style.backgroundColor),
        ),
        focus: ratio(parse(style.outlineColor), parse(style.backgroundColor)),
      };
    });
    const button = card.querySelector<HTMLButtonElement>('button[type=submit]');
    const buttonContrast = button
      ? ratio(
          parse(getComputedStyle(button).color),
          parse(getComputedStyle(button).backgroundColor),
        )
      : 0;
    return {
      tint: surfaceStyle.backgroundColor,
      alpha: tint[3]! / 255,
      legibilityAlpha: legibility[3]! / 255,
      material,
      worstBackground: composite.reduce(
        (worst, color) => (luminance(color) < luminance(worst) ? color : worst),
        composite[0]!,
      ),
      minimumText: Math.min(...textRatios.map((item) => item.ratio)),
      text: textRatios,
      minimumFieldBorder: Math.min(...controlRatios.map((item) => item.border)),
      minimumControlText: Math.min(...controlRatios.map((item) => item.text)),
      minimumFocus: Math.min(...controlRatios.map((item) => item.focus)),
      button: buttonContrast,
      fields: controlRatios,
    };
  });
  measurements.push({ locale, theme, fixture, contrast: result });
  console.log(
    `CONTRAST_CELL ${JSON.stringify({ locale, theme, fixture, contrast: result })}`,
  );
  expect(
    result.minimumText,
    `${locale}/${theme}/${fixture} text`,
  ).toBeGreaterThanOrEqual(4.5);
  expect(
    result.minimumFieldBorder,
    `${locale}/${theme}/${fixture} field border`,
  ).toBeGreaterThanOrEqual(3);
  expect(
    result.minimumControlText,
    `${locale}/${theme}/${fixture} field text`,
  ).toBeGreaterThanOrEqual(4.5);
  expect(
    result.minimumFocus,
    `${locale}/${theme}/${fixture} focus`,
  ).toBeGreaterThanOrEqual(3);
  expect(
    result.button,
    `${locale}/${theme}/${fixture} submit`,
  ).toBeGreaterThanOrEqual(4.5);
}

test('F14 hero prototypes render the review matrix, preserve contrast, and fit laptop heights', async ({
  browser,
}) => {
  await mkdir(output, { recursive: true });
  for (const variant of requiredVariants) {
    await capture(browser, {
      ...variant,
      fixture: 'dark',
      material: 'B',
      effect: 'webgl',
      label: `${variant.name}-image`,
      group: 'required',
      screenshotName: `${variant.name}-image.png`,
      fullPage: true,
    });
  }

  for (const variant of requiredVariants) {
    for (const material of ['A', 'B'] as const) {
      await capture(browser, {
        ...variant,
        material,
        fixture: 'dark',
        effect: material === 'B' ? 'webgl' : 'blur',
        label: `${material} | ${variant.locale.toUpperCase()} ${variant.theme} ${variant.width}px`,
        group: 'comparison',
        screenshotName: `compare-${material}-${variant.locale}-${variant.theme}-${variant.width}.png`,
        fullPage: true,
      });
    }
  }

  for (const material of ['A', 'B'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      const { page, close } = await openPrototype(browser, {
        locale: 'en',
        theme,
        width: 1440,
        height: 900,
        material,
        effect: material === 'B' ? 'webgl' : 'blur',
      });
      const bounds = await page.getByTestId('hero-glass-card').boundingBox();
      if (!bounds) throw new Error('Glass card bounds unavailable for crop');
      const path = join(output, `edge-${material}-${theme}-1440.png`);
      await page.screenshot({
        path,
        clip: {
          x: Math.max(0, bounds.x + bounds.width - 24),
          y: 515,
          width: 36,
          height: 112,
        },
        scale: 'device',
        animations: 'disabled',
        style: 'nextjs-portal{display:none!important}',
      });
      screenshots.push({
        path,
        label: `edge-${material}-${theme}`,
        group: 'extras',
      });
      await close();
    }
  }

  for (const theme of ['light', 'dark'] as const) {
    const { page, close } = await openPrototype(browser, {
      locale: 'en',
      theme,
      width: 1440,
      height: 900,
      material: 'B',
      effect: 'blur',
    });
    const bounds = await page.getByTestId('hero-glass-card').boundingBox();
    if (!bounds)
      throw new Error('Glass card bounds unavailable for lens-off crop');
    const path = join(output, `edge-B-lens-off-${theme}-1440.png`);
    await page.screenshot({
      path,
      clip: {
        x: Math.max(0, bounds.x + bounds.width - 24),
        y: 515,
        width: 36,
        height: 112,
      },
      scale: 'device',
      animations: 'disabled',
      style: 'nextjs-portal{display:none!important}',
    });
    screenshots.push({
      path,
      label: `edge-B-lens-off-${theme}`,
      group: 'extras',
    });
    await close();

    const narrow = await openPrototype(browser, {
      locale: 'en',
      theme,
      width: 360,
      height: 780,
      material: 'B',
      effect: 'blur',
    });
    const narrowGeometry = await narrow.page.evaluate(() => {
      const art = document
        .querySelector<HTMLImageElement>('[data-hero-image]')!
        .getBoundingClientRect();
      const card = document
        .querySelector<HTMLElement>('[data-testid="hero-glass-card"]')!
        .getBoundingClientRect();
      return {
        artHeight: art.height,
        cardTop: card.top,
        cardTopArtRatio: card.top / art.height,
        visibleBandHeight: art.bottom - card.top,
        bandAboveCardHeight: Math.max(
          0,
          card.top - (art.top + art.height * 0.65),
        ),
      };
    });
    expect(narrowGeometry.artHeight).toBeCloseTo(480, 0);
    expect(narrowGeometry.cardTopArtRatio).toBeGreaterThanOrEqual(0.7);
    expect(narrowGeometry.cardTopArtRatio).toBeLessThanOrEqual(0.8);
    expect(narrowGeometry.visibleBandHeight).toBeLessThanOrEqual(0.3 * 480);
    expect(narrowGeometry.bandAboveCardHeight).toBeLessThanOrEqual(0.1 * 480);
    measurements.push({
      label: `mobile-geometry-${theme}-360`,
      ...narrowGeometry,
    });
    console.log(
      `MOBILE_GEOMETRY ${theme} 360 ${JSON.stringify(narrowGeometry)}`,
    );
    await narrow.close();
  }

  for (const theme of ['light', 'dark'] as const) {
    const { page, close } = await openPrototype(browser, {
      locale: 'en',
      theme,
      width: 1440,
      height: 900,
      material: 'B',
      effect: 'webgl',
    });
    const bounds = await page.getByTestId('hero-glass-card').boundingBox();
    if (!bounds)
      throw new Error('Glass card bounds unavailable for lens comparison');
    const crop = {
      x: Math.max(0, bounds.x + bounds.width - 24),
      y: 515,
      width: 36,
      height: 112,
    };
    const onShot = await page.screenshot({ clip: crop, scale: 'device' });
    const offShot = await readFile(
      join(output, `edge-B-lens-off-${theme}-1440.png`),
    );
    const lens = await measureLensDisplacement(page, offShot, onShot);
    measurements.push({ label: `lens-${theme}`, lens });
    console.log(`LENS_VALIDATION ${theme} ${JSON.stringify(lens)}`);
    expect(lens.outerBandMeanRgbDelta).toBeGreaterThan(2);
    expect(lens.maxFeatureDisplacementPx).toBeGreaterThanOrEqual(12);

    const cardCropPath = join(output, `rim-B-${theme}-1440.png`);
    const fullCard = await page.screenshot({
      clip: bounds,
      path: cardCropPath,
      scale: 'device',
      animations: 'disabled',
      style: 'nextjs-portal{display:none!important}',
    });
    screenshots.push({
      path: cardCropPath,
      label: `rim-B-${theme}`,
      group: 'extras',
    });
    const rim = await measureRimHighlight(page, fullCard);
    measurements.push({ label: `rim-B-${theme}`, rim });
    console.log(`RIM_VALIDATION ${theme} ${JSON.stringify(rim)}`);
    expect(rim.topLeftLift).toBeGreaterThan(rim.bottomRightLift);
    expect(rim.directionalHighlightDelta).toBeGreaterThan(0.005);
    await close();
  }

  for (const variant of requiredVariants.filter(({ width }) => width === 390)) {
    await capture(browser, {
      ...variant,
      fixture: 'dark',
      effect: 'blur',
      label: `${variant.name}-image-full-page`,
      group: 'extras',
      screenshotName: `${variant.name}-image-full-page.png`,
      fullPage: true,
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    const { page, close } = await openPrototype(browser, {
      locale: 'en',
      theme,
      width: 390,
      height: 844,
      material: 'B',
      effect: 'blur',
    });
    const measurementsForBand = await page.evaluate(() => {
      const art = document.querySelector<HTMLImageElement>('[data-hero-image]');
      const card = document.querySelector<HTMLElement>(
        '[data-testid="hero-glass-card"]',
      );
      if (!art || !card) throw new Error('Mobile artwork or card missing');
      const imageRect = art.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const stage = art.closest<HTMLElement>('[data-testid="hero-prototype"]');
      if (!stage) throw new Error('Mobile hero stage missing');
      const readColor = (value: string) => {
        const sampler = document.createElement('canvas');
        sampler.width = 1;
        sampler.height = 1;
        const context = sampler.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Mobile fade color sampler unavailable');
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
        return [red, green, blue];
      };
      const colorProbe = document.createElement('span');
      colorProbe.style.position = 'absolute';
      colorProbe.style.visibility = 'hidden';
      stage.append(colorProbe);
      const colorAt = (value: string) => {
        colorProbe.style.backgroundColor = value;
        return readColor(getComputedStyle(colorProbe).backgroundColor);
      };
      const bottomAverage = getComputedStyle(stage)
        .getPropertyValue('--hero-bottom-average')
        .trim();
      const firstMidStop = colorAt(
        'color-mix(in oklab, var(--hero-bottom-average) 88%, var(--color-bg))',
      );
      const secondMidStop = colorAt('var(--hero-mobile-mid)');
      colorProbe.remove();
      return {
        imageHeight: imageRect.height,
        cardTop: cardRect.top,
        cardTopArtRatio: cardRect.top / imageRect.height,
        visibleBandHeight: Math.max(0, imageRect.bottom - cardRect.top),
        bandAboveCardHeight: Math.max(
          0,
          cardRect.top - (imageRect.top + imageRect.height * 0.65),
        ),
        objectPosition: getComputedStyle(art).objectPosition,
        overlap: imageRect.bottom - cardRect.top,
        bottomAverage,
        midStopRgb: [firstMidStop, secondMidStop],
      };
    });
    expect(measurementsForBand.imageHeight).toBeCloseTo(520, 0);
    expect(measurementsForBand.objectPosition).toContain('30%');
    expect(measurementsForBand.cardTopArtRatio).toBeGreaterThanOrEqual(0.7);
    expect(measurementsForBand.cardTopArtRatio).toBeLessThanOrEqual(0.8);
    expect(measurementsForBand.visibleBandHeight).toBeLessThanOrEqual(
      0.3 * 520,
    );
    expect(measurementsForBand.bandAboveCardHeight).toBeLessThanOrEqual(
      0.1 * 520,
    );
    const gradient = await measureMobileGradient(page);
    measurements.push({
      label: `mobile-gradient-${theme}`,
      ...measurementsForBand,
      gradient,
    });
    console.log(
      `MOBILE_GRADIENT ${theme} ${JSON.stringify({ ...measurementsForBand, gradient })}`,
    );
    expect(gradient.maxDeltaL, `${theme} mobile 8px ΔL`).toBeLessThanOrEqual(
      0.12,
    );
    const imageRect = await page.locator('[data-hero-image]').boundingBox();
    if (!imageRect)
      throw new Error('Mobile art bounds unavailable for close-up');
    const path = join(output, `mobile-gradient-B-${theme}-390.png`);
    await page.screenshot({
      path,
      clip: { x: 0, y: 260, width: 390, height: 340 },
      scale: 'device',
      animations: 'disabled',
      style: 'nextjs-portal{display:none!important}',
    });
    screenshots.push({
      path,
      label: `mobile-gradient-B-${theme}`,
      group: 'extras',
    });
    await close();
  }

  for (const width of [1280, 1366, 1440, 1536]) {
    const { page, close } = await openPrototype(browser, {
      locale: 'en',
      theme: 'dark',
      width,
      height:
        width === 1366
          ? 768
          : width === 1536
            ? 864
            : width === 1280
              ? 800
              : 900,
    });
    const layout = await page
      .locator('[data-testid="hero-glass-card"]')
      .evaluate((card) => {
        const rect = card.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          scrollHeight: (card as HTMLElement).scrollHeight,
          clientHeight: (card as HTMLElement).clientHeight,
          pageScrollHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
        };
      });
    measurements.push({ width, layout });
    expect(layout.right).toBeLessThanOrEqual(width - 24);
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.top).toBeGreaterThanOrEqual(0);
    expect(layout.bottom).toBeLessThanOrEqual(layout.viewportHeight);
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight);
    expect(layout.pageScrollHeight).toBeLessThanOrEqual(layout.viewportHeight);
    await close();
  }

  const noImage = [
    {
      locale: 'en' as const,
      theme: 'light' as const,
      width: 390,
      height: 844,
      name: 'none-en-light-mobile',
    },
    {
      locale: 'en' as const,
      theme: 'dark' as const,
      width: 1440,
      height: 900,
      name: 'none-en-dark-desktop',
    },
    {
      locale: 'ar' as const,
      theme: 'light' as const,
      width: 1440,
      height: 900,
      name: 'none-ar-light-desktop',
    },
    {
      locale: 'ar' as const,
      theme: 'dark' as const,
      width: 390,
      height: 844,
      name: 'none-ar-dark-mobile',
    },
  ];
  for (const variant of noImage) {
    await capture(browser, {
      ...variant,
      fixture: 'none',
      material: 'B',
      effect: 'blur',
      label: variant.name,
      group: 'extras',
      screenshotName: `${variant.name}.png`,
    });
  }

  for (const variant of [
    {
      locale: 'en' as const,
      theme: 'dark' as const,
      width: 768,
      height: 1024,
      name: 'tablet-en-dark-768',
    },
    {
      locale: 'ar' as const,
      theme: 'light' as const,
      width: 768,
      height: 1024,
      name: 'tablet-ar-light-768',
    },
  ]) {
    await capture(browser, {
      ...variant,
      material: variant.name === 'tablet-ar-light-768' ? 'B' : 'A',
      effect: variant.name === 'tablet-ar-light-768' ? 'webgl' : 'blur',
      label: variant.name,
      group: 'extras',
      screenshotName: `${variant.name}.png`,
    });
  }

  await capture(browser, {
    locale: 'en',
    theme: 'dark',
    width: 1440,
    height: 900,
    cdpFeatures: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    material: 'B',
    effect: 'webgl',
    label: 'reduced-transparency-en-dark-1440',
    group: 'extras',
    screenshotName: 'reduced-transparency-en-dark-1440.png',
  });
  await capture(browser, {
    locale: 'ar',
    theme: 'light',
    width: 1440,
    height: 900,
    cdpFeatures: [{ name: 'prefers-contrast', value: 'more' }],
    material: 'B',
    effect: 'webgl',
    label: 'contrast-more-ar-light-1440',
    group: 'extras',
    screenshotName: 'contrast-more-ar-light-1440.png',
  });
  await capture(browser, {
    locale: 'en',
    theme: 'dark',
    width: 1440,
    height: 900,
    reducedMotion: true,
    fixture: 'dark',
    material: 'B',
    effect: 'webgl',
    label: 'reduced-motion-en-dark-1440',
    group: 'extras',
    screenshotName: 'reduced-motion-en-dark-1440.png',
  });
  await capture(browser, {
    locale: 'en',
    theme: 'dark',
    width: 1440,
    height: 900,
    forcedColors: 'active',
    material: 'B',
    effect: 'webgl',
    label: 'forced-colors-en-dark-1440',
    group: 'extras',
    screenshotName: 'forced-colors-en-dark-1440.png',
  });

  for (const variant of [
    {
      locale: 'en' as const,
      theme: 'light' as const,
      width: 1440,
      height: 900,
      name: 'bright-en-light-1440',
    },
    {
      locale: 'en' as const,
      theme: 'dark' as const,
      width: 1440,
      height: 900,
      name: 'bright-en-dark-1440',
    },
  ]) {
    await capture(browser, {
      ...variant,
      fixture: 'bright',
      material: 'B',
      effect: 'webgl',
      label: variant.name,
      group: 'extras',
      screenshotName: `${variant.name}.png`,
    });
  }

  await capture(browser, {
    locale: 'en',
    theme: 'dark',
    width: 390,
    height: 844,
    fixture: 'desktop-only',
    label: 'desktop-only-art-mobile-focal-390',
    group: 'extras',
    screenshotName: 'desktop-only-art-mobile-focal-390.png',
  });
  await capture(browser, {
    locale: 'ar',
    theme: 'light',
    width: 1440,
    height: 900,
    fixture: 'mobile-only',
    label: 'mobile-only-art-desktop-panel-1440',
    group: 'extras',
    screenshotName: 'mobile-only-art-desktop-panel-1440.png',
  });

  for (const material of ['A', 'B'] as const) {
    for (const locale of ['ar', 'en'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        for (const fixture of ['dark', 'bright'] as const) {
          const { page, close } = await openPrototype(browser, {
            locale,
            theme,
            width: 1440,
            height: 900,
            fixture,
            material,
            effect: material === 'B' ? 'webgl' : 'blur',
          });
          await measureContrast(page, locale, theme, fixture);
          await close();
        }
      }
    }
  }

  const frameRuns = [
    {
      material: 'A' as const,
      effect: 'none' as const,
      pointer: false,
      name: 'A-idle-baseline',
    },
    {
      material: 'B' as const,
      effect: 'blur' as const,
      pointer: true,
      name: 'B-blur-pointer',
    },
    {
      material: 'B' as const,
      effect: 'webgl' as const,
      pointer: true,
      name: 'B-webgl-pointer',
    },
  ];
  for (const throttle of [1, 4] as const) {
    for (const run of frameRuns) {
      const { page, close } = await openPrototype(browser, {
        locale: 'en',
        theme: 'dark',
        width: 1440,
        height: 900,
        effect: run.effect,
        material: run.material,
      });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      const result = await page.evaluate(
        async ({ pointer }) => {
          const frames: number[] = [];
          let previous = performance.now();
          const card = document.querySelector(
            '[data-testid="hero-glass-card"]',
          );
          const canvas = card?.querySelector<HTMLCanvasElement>(
            '[data-testid="hero-webgl-lens"]',
          );
          if (!card) throw new Error('Glass card missing from frame benchmark');
          const beforeDraws = Number(canvas?.dataset.drawCount ?? 0);
          const beforeSubmit = Number(canvas?.dataset.drawSubmitTotalMs ?? 0);
          for (let index = 0; index < 72; index += 1) {
            if (pointer) {
              card.dispatchEvent(
                new PointerEvent('pointermove', {
                  clientX: 1080 + (index % 10) * 12,
                  clientY: 200 + (index % 12) * 16,
                  bubbles: true,
                }),
              );
            }
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            );
            const now = performance.now();
            frames.push(now - previous);
            previous = now;
          }
          frames.sort((a, b) => a - b);
          const drawCount =
            Number(canvas?.dataset.drawCount ?? 0) - beforeDraws;
          const drawSubmitMs =
            Number(canvas?.dataset.drawSubmitTotalMs ?? 0) - beforeSubmit;
          return {
            meanMs:
              frames.reduce((sum, value) => sum + value, 0) / frames.length,
            p95Ms: frames[Math.floor(frames.length * 0.95)]!,
            drawCount,
            averageDrawSubmitMs: drawCount ? drawSubmitMs / drawCount : 0,
          };
        },
        { pointer: run.pointer },
      );
      const support = await page.evaluate(() => ({
        webgl: typeof WebGLRenderingContext !== 'undefined',
        backdropFilter: CSS.supports('backdrop-filter', 'blur(1px)'),
        active: document.querySelector<HTMLElement>(
          '[data-testid="hero-glass-card"]',
        )?.dataset.effectActive,
      }));
      measurements.push({
        material: run.material,
        run: run.name,
        throttle: throttle === 1 ? 'none' : '4x CPU',
        viewport: '1440x900',
        frameStats: result,
        platformSupport: support,
      });
      await close();
    }
  }

  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const [width, height] of [
        [390, 844],
        [1440, 900],
      ] as const) {
        const context = await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: 2,
          colorScheme: theme,
        });
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: origin },
          { name: THEME_COOKIE, value: theme, url: origin },
        ]);
        const page = await context.newPage();
        await page.goto('/showcase/f14-hero-glass/guidance', {
          waitUntil: 'domcontentloaded',
        });
        await expect(page.getByTestId('hero-guidance')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const label = `guidance-${locale}-${theme}-${width}`;
        await checkAxe(page, label);
        const path = join(output, `${label}.png`);
        await page.screenshot({
          path,
          fullPage: true,
          scale: 'device',
          style: 'nextjs-portal{display:none!important}',
        });
        screenshots.push({ path, label, group: 'extras' });
        await context.close();
      }
    }
  }

  for (const locale of ['ar', 'en'] as const) {
    const { page, close } = await openPrototype(browser, {
      locale,
      theme: locale === 'ar' ? 'dark' : 'light',
      width: 1440,
      height: 900,
      material: 'B',
      effect: 'webgl',
    });
    const country = page.getByRole('combobox', {
      name: locale === 'ar' ? 'الدولة' : 'Country',
    });
    await expect(country).toHaveValue(locale === 'ar' ? 'مصر' : 'Egypt');
    await country.focus();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option').first()).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(country).toHaveAttribute(
      'aria-activedescendant',
      'hero-country-options-EG',
    );
    const popupBounds = await page.getByRole('listbox').boundingBox();
    const cardBounds = await page.getByTestId('hero-glass-card').boundingBox();
    if (!popupBounds || !cardBounds)
      throw new Error('Open country list or card bounds unavailable');
    expect(popupBounds.y + popupBounds.height).toBeLessThanOrEqual(900);
    expect(popupBounds.y).toBeGreaterThanOrEqual(cardBounds.y);
    await expect(page.getByTestId('hero-glass-card')).toHaveCSS(
      'overflow',
      'visible',
    );
    const label = `country-open-${locale}`;
    const path = join(output, `${label}.png`);
    await page.screenshot({
      path,
      fullPage: true,
      scale: 'device',
      animations: 'disabled',
      style: 'nextjs-portal{display:none!important}',
    });
    screenshots.push({ path, label, group: 'extras' });
    await checkAxe(page, `country-open-${locale}`);
    await close();
  }

  {
    const { page, close } = await openPrototype(browser, {
      locale: 'en',
      theme: 'light',
      width: 390,
      height: 844,
      material: 'B',
      effect: 'blur',
    });
    const country = page.getByRole('combobox', { name: 'Country' });
    await expect(country).toHaveValue('Egypt');
    await country.scrollIntoViewIfNeeded();
    await country.evaluate((input) => {
      const rect = input.getBoundingClientRect();
      window.scrollBy(0, rect.top - 690);
    });
    await country.focus();
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    await expect(list).toHaveAttribute('data-placement', 'above');
    const bounds = await list.boundingBox();
    const fieldBounds = await country.boundingBox();
    if (!bounds || !fieldBounds)
      throw new Error('Bottom country popup bounds unavailable');
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(fieldBounds.y);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
    const label = 'country-flip-bottom-en-390';
    const path = join(output, `${label}.png`);
    await page.screenshot({
      path,
      scale: 'device',
      animations: 'disabled',
      style: 'nextjs-portal{display:none!important}',
    });
    screenshots.push({ path, label, group: 'extras' });
    await checkAxe(page, 'country-flip-bottom-en-390');
    measurements.push({
      label,
      popup: bounds,
      field: fieldBounds,
      scrollY: await page.evaluate(() => window.scrollY),
    });
    await close();
  }

  await buildContactSheet(browser, 'required');
  await buildContactSheet(browser, 'extras');
  await buildContactSheet(browser, 'comparison');
  const metricsPath = join(output, 'measurements.json');
  await writeFile(
    metricsPath,
    JSON.stringify({ measurements, axePasses }, null, 2),
    'utf8',
  );
  console.log(`SCREENSHOT_DIRECTORY ${output}`);
  console.log(`METRICS ${metricsPath}`);
  for (const shot of screenshots) console.log(`SCREENSHOT ${shot.path}`);
  console.log(`AXE_VARIANTS ${axePasses.length}`);
  console.log(
    `CONTRAST_METRICS ${JSON.stringify(measurements.filter((item) => 'contrast' in item))}`,
  );
  console.log(
    `FRAME_METRICS ${JSON.stringify(measurements.filter((item) => 'frameStats' in item))}`,
  );
});

test('forced colors removes glass treatment and retains a system-colored card', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    forcedColors: 'active',
  });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: 'en', url: origin },
    { name: THEME_COOKIE, value: 'dark', url: origin },
  ]);
  const page = await context.newPage();
  await page.goto('/showcase/f14-hero-glass');
  await expect(page.getByTestId('hero-glass-card')).toBeVisible();
  const styles = await page.getByTestId('hero-glass-card').evaluate((card) => ({
    background: getComputedStyle(card).backgroundColor,
    color: getComputedStyle(card).color,
    shadow: getComputedStyle(card).boxShadow,
    backdrop: getComputedStyle(
      card.querySelector('[data-testid="hero-glass-shell"]')!,
    ).backdropFilter,
    surfaceDisplay: getComputedStyle(
      card.querySelector('[data-testid="hero-glass-shell"]')!,
    ).display,
    border: getComputedStyle(card).borderColor,
  }));
  expect(styles.surfaceDisplay).toBe('none');
  expect(styles.shadow).toBe('none');
  expect(styles.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(styles.color).not.toBe(styles.background);
  const forcedColorAxe = await new AxeBuilder({ page })
    .disableRules(['color-contrast'])
    .analyze();
  expect(forcedColorAxe.violations).toEqual([]);
  await context.close();
});

test('B edge lens visibly displaces the procedural horizon at the glass rim', async ({
  browser,
}) => {
  await mkdir(output, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    const off = await openPrototype(browser, {
      locale: 'en',
      theme,
      width: 1440,
      height: 900,
      material: 'B',
      effect: 'blur',
    });
    const offBounds = await off.page
      .getByTestId('hero-glass-card')
      .boundingBox();
    if (!offBounds) throw new Error('Lens-off card bounds unavailable');
    const clip = {
      x: Math.max(0, offBounds.x + offBounds.width - 24),
      y: 515,
      width: 36,
      height: 112,
    };
    const before = await off.page.screenshot({
      clip,
      path: join(output, `lens-proof-off-${theme}.png`),
      scale: 'device',
    });
    await off.close();

    const on = await openPrototype(browser, {
      locale: 'en',
      theme,
      width: 1440,
      height: 900,
      material: 'B',
      effect: 'webgl',
    });
    const after = await on.page.screenshot({
      clip,
      path: join(output, `lens-proof-on-${theme}.png`),
      scale: 'device',
    });
    const result = await measureLensDisplacement(on.page, before, after);
    console.log(`HORIZON_LENS_${theme} ${JSON.stringify(result)}`);
    expect(result.maxFeatureDisplacementPx).toBeGreaterThanOrEqual(12);
    await on.close();
  }
});

test('A and B keep token field borders; B lenses only the rim and respects motion input settings', async ({
  browser,
}) => {
  for (const material of ['A', 'B'] as const) {
    const { page, close } = await openPrototype(browser, {
      locale: 'en',
      theme: 'light',
      width: 1440,
      height: 900,
      material,
      effect: material === 'B' ? 'webgl' : 'blur',
    });
    const field = page.locator('input:not([type=hidden])').first();
    await page.keyboard.press('Tab');
    await expect(field).toBeFocused();
    const fieldStyles = await field.evaluate((input) => {
      const style = getComputedStyle(input);
      const scope = input.closest<HTMLElement>('[data-brand-scope]');
      if (!scope) throw new Error('Brand scope unavailable around form field');
      const scopeStyle = getComputedStyle(scope);
      const context = document.createElement('canvas').getContext('2d');
      if (!context) throw new Error('Color normalizer unavailable');
      const normalize = (color: string) => {
        context.fillStyle = color;
        return context.fillStyle;
      };
      return {
        border: normalize(style.borderTopColor),
        focus: normalize(style.outlineColor),
        borderToken: normalize(
          scopeStyle.getPropertyValue('--color-border-strong'),
        ),
        focusToken: normalize(scopeStyle.getPropertyValue('--brand-ring')),
        borderWidth: style.borderTopWidth,
        outlineWidth: style.outlineWidth,
        outlineOffset: style.outlineOffset,
        focusVisible: input.matches(':focus-visible'),
      };
    });
    expect(fieldStyles.border).toBe(fieldStyles.borderToken);
    expect(fieldStyles.focus).toBe(fieldStyles.focusToken);
    expect(fieldStyles.borderWidth).toBe('1px');
    expect(fieldStyles.outlineWidth).toBe('2px');
    expect(fieldStyles.outlineOffset).toBe('2px');
    expect(fieldStyles.focusVisible).toBe(true);
    if (material === 'B') {
      await expect(page.getByTestId('hero-glass-card')).toHaveAttribute(
        'data-effect-active',
        'webgl',
      );
      const lens = await page
        .getByTestId('hero-glass-card')
        .evaluate((card) => {
          const shell = card.querySelector<HTMLElement>(
            '[data-testid="hero-glass-shell"]',
          );
          const canvas = card.querySelector<HTMLCanvasElement>(
            '[data-testid="hero-webgl-lens"]',
          );
          const rim = card.querySelector<HTMLElement>(
            '[data-testid="hero-glass-rim"]',
          );
          return {
            backdrop: shell ? getComputedStyle(shell).backdropFilter : '',
            alpha: shell ? getComputedStyle(shell).backgroundColor : '',
            canvasOpacity: canvas ? getComputedStyle(canvas).opacity : '',
            drawCount: Number(canvas?.dataset.drawCount ?? 0),
            rim: rim ? getComputedStyle(rim).backgroundImage : '',
            mask: rim ? getComputedStyle(rim).maskComposite : '',
          };
        });
      expect(lens.backdrop).toContain('26px');
      const shellAlpha = Number(lens.alpha.match(/\/\s*([\d.]+)\)/)?.[1]);
      expect(shellAlpha).toBeGreaterThanOrEqual(0.12);
      expect(shellAlpha).toBeLessThanOrEqual(0.35);
      expect(lens.canvasOpacity).toBe('0.92');
      expect(lens.drawCount).toBeGreaterThan(0);
      expect(lens.rim).toContain('linear-gradient');
      expect(lens.mask).toContain('exclude');
    }
    await close();
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: 'en', url: origin },
    { name: THEME_COOKIE, value: 'dark', url: origin },
  ]);
  const page = await context.newPage();
  await page.goto('/showcase/f14-hero-glass?material=B');
  const card = page.getByTestId('hero-glass-card');
  await card.dispatchEvent('pointermove', { clientX: 100, clientY: 100 });
  const motionState = await card.evaluate((element) => ({
    pointerX: (element as HTMLElement).style.getPropertyValue('--pointer-x'),
    highlightOpacity: getComputedStyle(
      element.querySelector('[data-testid="hero-glass-interaction"]')!,
    ).opacity,
    coarse: matchMedia('(hover: hover) and (pointer: fine)').matches,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
  expect(motionState.coarse).toBe(false);
  expect(motionState.reduced).toBe(true);
  expect(motionState.pointerX).toBe('');
  expect(motionState.highlightOpacity).toBe('0');
  await expect(new AxeBuilder({ page }).analyze()).resolves.toMatchObject({
    violations: [],
  });
  await context.close();
});

test('prototype form validates through the existing phone rules without submitting to a service', async ({
  browser,
}) => {
  const { page, close } = await openPrototype(browser, {
    locale: 'en',
    theme: 'dark',
    width: 1440,
    height: 900,
    fixture: 'none',
    effect: 'blur',
  });
  await expect(page.getByTestId('hero-signup-preview')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.getByRole('textbox', { name: 'Phone number' }).fill('123');
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Phone number' }),
  ).toHaveAttribute('aria-invalid', 'true');
  expect(
    requests.some((url) => /supabase|\/rest\/v1|registration_link/i.test(url)),
  ).toBe(false);
  await checkAxe(page, 'offline-submit-result');
  await close();
});

test('r3 country combobox searches localized names and validates the selected country E.164 value', async ({
  browser,
}) => {
  const { page, close } = await openPrototype(browser, {
    locale: 'en',
    theme: 'light',
    width: 1440,
    height: 900,
    material: 'B',
    effect: 'webgl',
  });
  const country = page.getByRole('combobox', { name: 'Country' });
  await expect(country).toHaveValue('Egypt');
  await country.fill('United States');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(
    page.getByRole('option', { name: /United States/ }),
  ).toBeVisible();
  await country.press('ArrowDown');
  await country.press('Enter');
  await expect(country).toHaveValue('United States');
  await expect(page.getByTestId('country-calling-code')).toHaveText('+1');
  await page.getByRole('textbox', { name: 'Phone number' }).fill('2025550123');
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  await expect(page.getByTestId('phone-e164-preview')).toHaveText(
    '+12025550123',
  );
  await close();

  const arabic = await openPrototype(browser, {
    locale: 'ar',
    theme: 'dark',
    width: 390,
    height: 844,
    material: 'B',
    effect: 'webgl',
  });
  const arabicCountry = arabic.page.getByRole('combobox', { name: 'الدولة' });
  await expect(arabicCountry).toHaveValue('مصر');
  await arabicCountry.fill('المملكة المتحدة');
  await expect(arabic.page.getByRole('listbox')).toBeVisible();
  await arabicCountry.press('ArrowDown');
  await arabicCountry.press('Enter');
  await expect(arabicCountry).toHaveValue('المملكة المتحدة');
  await expect(arabic.page.getByTestId('country-calling-code')).toHaveText(
    '+44',
  );
  await arabic.close();
});
