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
  if (options.cdpFeatures?.length) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: options.cdpFeatures,
    });
  }
  await page.goto(
    `/showcase/f14-hero-glass?fixture=${options.fixture ?? 'dark'}&material=${options.material ?? 'A'}&effect=${options.effect ?? (options.material === 'B' ? 'webgl' : 'svg')}`,
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
  if (options.material === 'B' && options.effect === 'webgl') {
    await expect(page.getByTestId('hero-glass-card')).toHaveAttribute(
      'data-effect-active',
      'webgl',
      { timeout: 10_000 },
    );
  }
  await page.evaluate(() => document.fonts.ready);
  return { page, close: () => context.close() };
}

async function checkAxe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  axePasses.push(label);
  expect(
    results.violations,
    `${label}: ${JSON.stringify(results.violations)}`,
  ).toEqual([]);
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
  await checkAxe(page, options.label);
  const path = join(output, options.screenshotName);
  await page.screenshot({
    path,
    fullPage: options.fullPage ?? false,
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
    const surfaceStyle = getComputedStyle(card, '::before');
    const tint = parse(surfaceStyle.backgroundColor);
    const legibility = parse(
      getComputedStyle(
        card.querySelector<HTMLElement>('[data-testid="hero-glass-content"]')!,
        '::before',
      ).backgroundColor,
    );
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
    });
  }

  for (const variant of requiredVariants.filter(
    ({ width }) => width === 1440,
  )) {
    for (const material of ['A', 'B'] as const) {
      await capture(browser, {
        ...variant,
        material,
        fixture: 'dark',
        effect: material === 'B' ? 'webgl' : 'svg',
        label: `${material} | ${variant.locale.toUpperCase()} ${variant.theme}`,
        group: 'comparison',
        screenshotName: `compare-${material}-${variant.locale}-${variant.theme}.png`,
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
        effect: material === 'B' ? 'webgl' : 'svg',
      });
      const bounds = await page.getByTestId('hero-glass-card').boundingBox();
      if (!bounds) throw new Error('Glass card bounds unavailable for crop');
      const path = join(output, `edge-${material}-${theme}-1440.png`);
      await page.screenshot({
        path,
        clip: {
          x: Math.max(0, bounds.x + bounds.width - 150),
          y: Math.max(0, bounds.y + bounds.height - 170),
          width: 146,
          height: 170,
        },
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

  for (const variant of requiredVariants.filter(({ width }) => width === 390)) {
    await capture(browser, {
      ...variant,
      fixture: 'dark',
      effect: 'svg',
      label: `${variant.name}-image-full-page`,
      group: 'extras',
      screenshotName: `${variant.name}-image-full-page.png`,
      fullPage: true,
    });
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
      effect: variant.name === 'tablet-ar-light-768' ? 'webgl' : 'svg',
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
            effect: material === 'B' ? 'webgl' : 'svg',
          });
          await measureContrast(page, locale, theme, fixture);
          await close();
        }
      }
    }
  }

  for (const throttle of [1, 4] as const) {
    const { page, close } = await openPrototype(browser, {
      locale: 'en',
      theme: 'dark',
      width: 1440,
      height: 900,
      effect: 'webgl',
      material: 'B',
    });
    const activeEffect = page.getByTestId('hero-glass-card');
    await expect(activeEffect).toHaveAttribute(
      'data-effect-active',
      /^(webgl|css-fallback)$/,
    );
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const frameStats = await page.evaluate(async () => {
      const frames: number[] = [];
      let previous = performance.now();
      const card = document.querySelector('[data-testid="hero-glass-card"]');
      if (!card) throw new Error('Glass card missing from frame benchmark');
      for (let index = 0; index < 72; index += 1) {
        card.dispatchEvent(
          new PointerEvent('pointermove', {
            clientX: 1080 + (index % 10) * 12,
            clientY: 200 + (index % 12) * 16,
            bubbles: true,
          }),
        );
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const now = performance.now();
        frames.push(now - previous);
        previous = now;
      }
      frames.sort((a, b) => a - b);
      return {
        meanMs: frames.reduce((sum, value) => sum + value, 0) / frames.length,
        p95Ms: frames[Math.floor(frames.length * 0.95)]!,
      };
    });
    const platformSupport = await page.evaluate(() => {
      const svgLens = document.querySelector<HTMLElement>(
        '[data-testid="svg-lens"]',
      );
      return {
        webgl: typeof WebGLRenderingContext !== 'undefined',
        svgUrlBackdrop: CSS.supports(
          'backdrop-filter',
          'url(#hero-glass-displacement) blur(20px) saturate(1.24)',
        ),
        svgComputed: svgLens ? getComputedStyle(svgLens).backdropFilter : null,
      };
    });
    measurements.push({
      material: 'B',
      effect: 'webgl',
      activeEffect: await activeEffect.getAttribute('data-effect-active'),
      throttle: throttle === 1 ? 'none' : '4x CPU',
      viewport: '1440x900',
      frameStats,
      platformSupport,
    });
    await close();
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
        await page.goto('/showcase/f14-hero-glass/guidance');
        await expect(page.getByTestId('hero-guidance')).toBeVisible();
        const label = `guidance-${locale}-${theme}-${width}`;
        await checkAxe(page, label);
        const path = join(output, `${label}.png`);
        await page.screenshot({
          path,
          fullPage: true,
          style: 'nextjs-portal{display:none!important}',
        });
        screenshots.push({ path, label, group: 'extras' });
        await context.close();
      }
    }
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
    backdrop: getComputedStyle(card, '::before').backdropFilter,
    surfaceDisplay: getComputedStyle(card, '::before').display,
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
      effect: material === 'B' ? 'svg' : 'svg',
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
        focusToken: normalize(
          scopeStyle.getPropertyValue('--color-focus-ring'),
        ),
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
      const lens = await page.getByTestId('svg-lens').evaluate((node) => ({
        mask: getComputedStyle(node).maskImage,
        filter: getComputedStyle(node).backdropFilter,
      }));
      const scale = await page
        .locator('#hero-glass-displacement-b feDisplacementMap')
        .getAttribute('scale');
      expect(lens.mask).toContain('radial-gradient');
      expect(lens.filter).toContain('hero-glass-displacement-b');
      expect(scale).toBe('22');
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
    highlightOpacity: getComputedStyle(element, '::after').opacity,
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

test('prototype form keeps the existing offline feedback and never submits to a service', async ({
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
  await page.getByRole('textbox', { name: 'Name' }).fill('Fixture');
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(
    'Fixture',
  );
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  await expect(page.getByRole('status')).toHaveText('Please try again later.');
  expect(
    requests.some((url) => /supabase|\/rest\/v1|registration_link/i.test(url)),
  ).toBe(false);
  await checkAxe(page, 'offline-submit-result');
  await close();
});
