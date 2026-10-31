import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const output = join(
  tmpdir(),
  `lifter-f14-liquid-glass-redesign-${process.pid}-${Date.now()}`,
);
type Locale = 'ar' | 'en';
type Theme = 'light' | 'dark';
type Group =
  | 'required'
  | 'surface'
  | 'states'
  | 'combobox'
  | 'fallbacks'
  | 'accessibility'
  | 'references'
  | 'gap-mocks'
  | 'composition'
  | 'artwork'
  | 'pass4-no-image'
  | 'adaptive-dimming'
  | 'phone-glyphs';
const captures: Array<{ path: string; label: string; group: Group }> = [];
const contrastEvidence: Array<Record<string, unknown>> = [];
const focusEvidence: Array<Record<string, unknown>> = [];
const geometryEvidence: Array<Record<string, unknown>> = [];
const fieldBoundaryEvidence: Array<Record<string, unknown>> = [];

async function open(
  browser: Browser,
  options: {
    width: number;
    height: number;
    locale?: Locale;
    theme?: Theme;
    fixture?: 'dark' | 'bright' | 'none' | 'desktop-only' | 'mobile-only';
    reducedMotion?: boolean;
    forcedColors?: 'active' | 'none';
    mediaFeatures?: Array<{ name: string; value: string }>;
  },
): Promise<{ page: Page; close: () => Promise<void> }> {
  const locale = options.locale ?? 'en';
  const theme = options.theme ?? 'dark';
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: 2,
    reducedMotion: options.reducedMotion ? 'reduce' : 'no-preference',
    colorScheme: theme,
    forcedColors: options.forcedColors,
  });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: origin },
    { name: THEME_COOKIE, value: theme, url: origin },
  ]);
  const page = await context.newPage();
  if (options.mediaFeatures?.length) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: options.mediaFeatures,
    });
  }
  await page.goto(
    `/showcase/f14-hero-glass?fixture=${options.fixture ?? 'dark'}`,
    {
      waitUntil: 'domcontentloaded',
    },
  );
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await expect(page.getByTestId('hero-prototype')).toBeVisible();
  if (options.fixture !== 'none' && !options.forcedColors) {
    const artwork = page.locator('[data-hero-image]');
    await expect
      .poll(
        () =>
          artwork.evaluate((image) => {
            const element = image as HTMLImageElement;
            return element.complete && element.naturalWidth > 0;
          }),
        { timeout: 45_000 },
      )
      .toBe(true);
    await artwork.evaluate((image) => (image as HTMLImageElement).decode());
    await expect(page.getByTestId('hero-prototype')).toHaveAttribute(
      'data-photo-stats-ready',
      'true',
    );
  }
  await page.evaluate(() => document.fonts.ready);
  return { page, close: () => context.close() };
}

async function axe(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations,
    `${label}: ${JSON.stringify(result.violations)}`,
  ).toEqual([]);
}

async function assertOpaqueSurface(page: Page, label: string) {
  const surface = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(
      '[data-testid="hero-glass-card"]',
    );
    const field =
      document.querySelector<HTMLElement>('input[name="name"]')?.parentElement;
    if (!card || !field) throw new Error('Glass surfaces unavailable');
    const resolveToken = (token: string) => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = token;
      document.body.append(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    };
    const cardStyle = getComputedStyle(card);
    const fieldStyle = getComputedStyle(field);
    return {
      cardBackground: cardStyle.backgroundColor,
      cardToken: resolveToken(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--color-card',
        ),
      ),
      cardBorder: cardStyle.borderTopWidth,
      cardBackdrop: cardStyle.backdropFilter,
      fieldBackground: fieldStyle.backgroundColor,
      fieldToken: resolveToken(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--color-card-raised',
        ),
      ),
      fieldBorder: fieldStyle.borderTopWidth,
      fieldBackdrop: fieldStyle.backdropFilter,
    };
  });
  expect(surface.cardBackground, `${label} card token fill`).toBe(
    surface.cardToken,
  );
  expect(surface.cardBorder, `${label} card border`).toBe('2px');
  expect(surface.cardBackdrop, `${label} card backdrop`).toBe('none');
  expect(surface.fieldBackground, `${label} field token fill`).toBe(
    surface.fieldToken,
  );
  expect(surface.fieldBorder, `${label} field border`).toBe('2px');
  expect(surface.fieldBackdrop, `${label} field backdrop`).toBe('none');
}

async function capture(
  page: Page,
  label: string,
  group: Group,
  options: { locator?: string; fullPage?: boolean } = {},
) {
  await mkdir(output, { recursive: true });
  const path = join(output, `${label.replaceAll(/[^a-zA-Z0-9-]/g, '-')}.png`);
  if (options.locator) {
    await page.locator(options.locator).screenshot({
      path,
      scale: 'device',
      animations: 'disabled',
    });
  } else {
    await page.screenshot({
      path,
      fullPage: options.fullPage ?? true,
      scale: 'device',
      animations: 'disabled',
    });
  }
  captures.push({ path, label, group });
  return path;
}

async function contactSheet(group: Group, filename: string, columns = 4) {
  const items = captures.filter((item) => item.group === group);
  if (!items.length) return undefined;
  const tileWidth = 420;
  const tileHeight = 300;
  const labelHeight = 34;
  const rowHeight = tileHeight + labelHeight;
  const rows = Math.ceil(items.length / columns);
  const overlays = await Promise.all(
    items.map(async (item, index) => {
      const left = (index % columns) * tileWidth;
      const top = Math.floor(index / columns) * rowHeight;
      const image = await sharp(item.path)
        .resize(tileWidth - 16, tileHeight - 16, {
          fit: 'contain',
          background: '#111b1b',
        })
        .png()
        .toBuffer();
      const safeLabel = item.label
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;');
      const label = Buffer.from(
        `<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#152321"/><text x="10" y="23" fill="#f5f5f2" font-size="14" font-family="sans-serif">${safeLabel}</text></svg>`,
      );
      return [
        { input: label, left, top },
        { input: image, left: left + 8, top: top + labelHeight + 8 },
      ];
    }),
  );
  const path = join(output, filename);
  await sharp({
    create: {
      width: tileWidth * columns,
      height: rowHeight * rows,
      channels: 3,
      background: '#111b1b',
    },
  })
    .composite(overlays.flat())
    .png()
    .toFile(path);
  return path;
}

function linear(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(red: number, green: number, blue: number) {
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function contrast(foreground: number, background: number) {
  const [lighter, darker] =
    foreground >= background
      ? [foreground, background]
      : [background, foreground];
  return (lighter + 0.05) / (darker + 0.05);
}

function cssLuminance(color: string) {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3)
    throw new Error(`Unsupported rendered color: ${color}`);
  return luminance(channels[0]!, channels[1]!, channels[2]!);
}

async function measureTextContrast(page: Page, label: string) {
  const targets = await page.evaluate(() => {
    const selectors = [
      ['brand', '[data-brand-name]'],
      ['heading', '.formPlate h1'],
      ['field-label', 'form > label > span:first-child'],
      ['country-label', 'label[for="hero-country-input"]'],
      [
        'phone-label',
        'label:has(input[name="phone-national"]) > span:first-child',
      ],
      ['field-value', 'form input'],
      ['calling-code', '[data-testid="country-calling-code"]'],
      ['note', '.previewNote'],
      ['error-copy', '#hero-phone-error'],
    ] as const;
    const result: Array<{
      key: string;
      color: string;
      background?: string;
      rect: DOMRectJSON;
    }> = [];
    for (const [key, selector] of selectors) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        let rect = element.getBoundingClientRect();
        if (key === 'field-value') {
          const input = element as HTMLInputElement;
          if (!input.value) continue;
          const style = getComputedStyle(input);
          const inputRect = input.getBoundingClientRect();
          const mirror = document.createElement('span');
          Object.assign(mirror.style, {
            position: 'fixed',
            left: `${inputRect.left}px`,
            top: `${inputRect.top}px`,
            display: 'block',
            boxSizing: 'border-box',
            inlineSize: `${inputRect.width}px`,
            blockSize: `${inputRect.height}px`,
            paddingLeft: style.paddingLeft,
            paddingRight: style.paddingRight,
            font: style.font,
            letterSpacing: style.letterSpacing,
            lineHeight: style.lineHeight,
            direction: style.direction,
            textAlign: style.textAlign,
            whiteSpace: 'pre',
            visibility: 'hidden',
          });
          mirror.textContent = input.value;
          document.body.append(mirror);
          const range = document.createRange();
          range.selectNodeContents(mirror);
          rect = range.getBoundingClientRect();
          mirror.remove();
        }
        if (rect.width && rect.height) {
          const style = getComputedStyle(element);
          result.push({
            key,
            color:
              style.getPropertyValue('-webkit-text-fill-color') || style.color,
            ...(key === 'error-copy'
              ? { background: style.backgroundColor }
              : {}),
            rect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
          });
        }
      }
    }
    const field = document.querySelector<HTMLElement>(
      'form input[name="name"]',
    )?.parentElement;
    if (field) {
      const rect = field.getBoundingClientRect();
      result.push({
        key: 'field-edge',
        color: '',
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      });
    }
    const errorField = document.querySelector<HTMLElement>(
      'input[name="phone-national"]',
    )?.parentElement;
    if (errorField?.getAttribute('data-error') === 'true') {
      const rect = errorField.getBoundingClientRect();
      result.push({
        key: 'error-edge',
        color: '',
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      });
    }
    for (const element of document.querySelectorAll<HTMLElement>(
      '[data-brand-scope] *',
    )) {
      element.dataset.contrastProbeOriginal = JSON.stringify({
        color: element.style.getPropertyValue('color'),
        colorPriority: element.style.getPropertyPriority('color'),
        fill: element.style.getPropertyValue('-webkit-text-fill-color'),
        fillPriority: element.style.getPropertyPriority(
          '-webkit-text-fill-color',
        ),
        shadow: element.style.getPropertyValue('text-shadow'),
        shadowPriority: element.style.getPropertyPriority('text-shadow'),
        caret: element.style.getPropertyValue('caret-color'),
        caretPriority: element.style.getPropertyPriority('caret-color'),
      });
      element.style.setProperty('color', 'transparent', 'important');
      element.style.setProperty(
        '-webkit-text-fill-color',
        'transparent',
        'important',
      );
      element.style.setProperty('text-shadow', 'none', 'important');
      element.style.setProperty('caret-color', 'transparent', 'important');
    }
    return result;
  });
  const screenshot = await page.screenshot({ fullPage: true, scale: 'device' });
  const result = await page.evaluate(
    async ({ encoded, targets }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Contrast sampler unavailable');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      const values: Record<string, number> = {};
      for (const target of targets) {
        const { x, y, width, height } = target.rect;
        if (target.key === 'error-copy') {
          const channels = (color: string) =>
            color
              .match(/[\d.]+/g)
              ?.slice(0, 3)
              .map(Number);
          const foreground = channels(target.color);
          const background = channels(target.background ?? '');
          if (
            !foreground ||
            foreground.length !== 3 ||
            !background ||
            background.length !== 3
          ) {
            throw new Error(
              'Error-copy contrast requires its solid token pair',
            );
          }
          const light = (rgb: number[]) => {
            const channel = (value: number) => {
              const normalized = value / 255;
              return normalized <= 0.04045
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
            };
            return (
              0.2126 * channel(rgb[0]!) +
              0.7152 * channel(rgb[1]!) +
              0.0722 * channel(rgb[2]!)
            );
          };
          const a = light(foreground);
          const b = light(background);
          values[target.key] =
            (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          continue;
        }
        if (target.key === 'field-edge' || target.key === 'error-edge') {
          const sample = (sampleX: number, sampleY: number) => {
            const px = Math.max(
              0,
              Math.min(canvas.width - 1, Math.round(sampleX * 2)),
            );
            const py = Math.max(
              0,
              Math.min(canvas.height - 1, Math.round(sampleY * 2)),
            );
            const offset = (py * canvas.width + px) * 4;
            return [pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!];
          };
          const ratio = (first: number[], second: number[]) => {
            const light = (rgb: number[]) => {
              const channel = (value: number) => {
                const normalized = value / 255;
                return normalized <= 0.04045
                  ? normalized / 12.92
                  : ((normalized + 0.055) / 1.055) ** 2.4;
              };
              return (
                0.2126 * channel(rgb[0]!) +
                0.7152 * channel(rgb[1]!) +
                0.0722 * channel(rgb[2]!)
              );
            };
            const a = light(first);
            const b = light(second);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          };
          if (target.key === 'error-edge') {
            const edgeX = x + 1;
            const edgeY = y + height / 2;
            const edge = sample(edgeX, edgeY);
            values[target.key] = Math.min(
              ratio(edge, sample(x - 2, edgeY)),
              ratio(edge, sample(x + 3, edgeY)),
            );
            continue;
          }
          values[target.key] = Math.max(
            ...[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75].map((offset) => {
              const edgeY = y + offset;
              const edge = sample(x + width / 2, edgeY);
              return Math.min(
                ratio(edge, sample(x + width / 2, edgeY - 2)),
                ratio(edge, sample(x + width / 2, edgeY + 2)),
              );
            }),
          );
          continue;
        }
        const insetX =
          target.key === 'field-value'
            ? 8
            : target.key === 'calling-code'
              ? 2
              : 0;
        const insetY = target.key === 'field-value' ? 6 : 2;
        const x0 = Math.max(0, Math.floor((x + insetX) * 2));
        const x1 = Math.min(canvas.width, Math.ceil((x + width - insetX) * 2));
        const y0 = Math.max(0, Math.floor((y + insetY) * 2));
        const y1 = Math.min(
          canvas.height,
          Math.ceil((y + height - insetY) * 2),
        );
        const foregroundChannels = target.color
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number);
        if (!foregroundChannels || foregroundChannels.length !== 3)
          throw new Error(`Unsupported text color: ${target.color}`);
        const linear = (channel: number) => {
          const value = channel / 255;
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        };
        const foreground =
          0.2126 * linear(foregroundChannels[0]!) +
          0.7152 * linear(foregroundChannels[1]!) +
          0.0722 * linear(foregroundChannels[2]!);
        let minimumContrast = Infinity;
        for (let py = y0; py < y1; py += 2) {
          for (let px = x0; px < x1; px += 2) {
            const offset = (py * canvas.width + px) * 4;
            const background =
              0.2126 * linear(pixels[offset]!) +
              0.7152 * linear(pixels[offset + 1]!) +
              0.0722 * linear(pixels[offset + 2]!);
            minimumContrast = Math.min(
              minimumContrast,
              (Math.max(foreground, background) + 0.05) /
                (Math.min(foreground, background) + 0.05),
            );
          }
        }
        values[`${target.key}-${Object.keys(values).length}`] = minimumContrast;
      }
      return values;
    },
    { encoded: screenshot.toString('base64'), targets },
  );
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>(
      '[data-contrast-probe-original]',
    )) {
      const original = JSON.parse(
        element.dataset.contrastProbeOriginal ?? '{}',
      ) as Record<string, string>;
      const restore = (property: string, key: string, priorityKey: string) => {
        if (original[key])
          element.style.setProperty(
            property,
            original[key]!,
            original[priorityKey],
          );
        else element.style.removeProperty(property);
      };
      restore('color', 'color', 'colorPriority');
      restore('-webkit-text-fill-color', 'fill', 'fillPriority');
      restore('text-shadow', 'shadow', 'shadowPriority');
      restore('caret-color', 'caret', 'caretPriority');
      delete element.dataset.contrastProbeOriginal;
    }
  });
  contrastEvidence.push({ label, ...result });
  for (const [name, ratio] of Object.entries(result)) {
    const minimum = name.endsWith('edge') ? 3 : 4.5;
    expect(ratio, `${label} ${name} contrast`).toBeGreaterThanOrEqual(minimum);
  }
  return result;
}

async function assertVisibleLabels(
  page: Page,
  label: string,
  requireSurfaceContrast = false,
) {
  const measured = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(
      '[data-testid="hero-glass-card"]',
    );
    const cardColor = card ? getComputedStyle(card).backgroundColor : '';
    const inputs = [
      ['name', 'input[name="name"]'],
      ['email', 'input[name="email"]'],
      ['country', '#hero-country-input'],
      ['phone', 'input[name="phone-national"]'],
      ['password', 'input[name="password"]'],
    ] as const;
    return inputs.map(([key, selector]) => {
      const input = document.querySelector<HTMLInputElement>(selector);
      const label =
        key === 'country'
          ? document.querySelector<HTMLElement>(
              'label[for="hero-country-input"]',
            )
          : input
              ?.closest('label')
              ?.querySelector<HTMLElement>(':scope > span:first-child');
      if (!input || !label)
        return {
          key,
          text: '',
          color: '',
          background: cardColor,
          visible: false,
        };
      const style = getComputedStyle(label);
      const bounds = label.getBoundingClientRect();
      return {
        key,
        text: label.textContent?.trim() ?? '',
        color: style.color,
        background: cardColor,
        visible:
          style.visibility !== 'hidden' &&
          Number(style.opacity) > 0 &&
          bounds.width > 0 &&
          bounds.height > 0,
      };
    });
  });
  expect(measured, `${label} labels`).toHaveLength(5);
  for (const item of measured) {
    expect(item.text, `${label} ${item.key} label text`).not.toBe('');
    expect(item.visible, `${label} ${item.key} label visibility`).toBe(true);
    expect(item.color, `${label} ${item.key} label color`).not.toBe(
      'rgba(0, 0, 0, 0)',
    );
    if (requireSurfaceContrast) {
      const ratio = contrast(
        cssLuminance(item.color),
        cssLuminance(item.background),
      );
      expect(
        ratio,
        `${label} ${item.key} label contrast`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
}

async function measureFieldBoundaries(page: Page, label: string) {
  const targets = await page.evaluate(() => {
    const controls = [
      ['name', 'input[name="name"]'],
      ['email', 'input[name="email"]'],
      ['country', '#hero-country-input'],
      ['phone', 'input[name="phone-national"]'],
      ['password', 'input[name="password"]'],
    ] as const;
    return controls.map(([key, selector]) => {
      const input = document.querySelector<HTMLInputElement>(selector);
      const wrapper = input?.parentElement;
      if (!wrapper) return { key, width: 0, style: 'none', rect: null };
      const style = getComputedStyle(wrapper);
      const rect = wrapper.getBoundingClientRect();
      return {
        key,
        width: Number.parseFloat(style.borderTopWidth),
        style: style.borderTopStyle,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    });
  });
  expect(targets).toHaveLength(5);
  await mkdir(output, { recursive: true });
  const screenshotPath = join(output, `${label}.png`);
  const screenshot = await page.screenshot({
    path: screenshotPath,
    fullPage: true,
    scale: 'device',
  });
  captures.push({ path: screenshotPath, label, group: 'states' });
  const { data, info } = await sharp(screenshot)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sample = (x: number, y: number) => {
    const px = Math.max(0, Math.min(info.width - 1, Math.round(x * 2)));
    const py = Math.max(0, Math.min(info.height - 1, Math.round(y * 2)));
    const offset = (py * info.width + px) * info.channels;
    return [data[offset]!, data[offset + 1]!, data[offset + 2]!];
  };
  const measured = targets.map((target) => {
    expect(
      target.rect,
      `${label} ${target.key} boundary geometry`,
    ).not.toBeNull();
    expect(
      target.width,
      `${label} ${target.key} border width`,
    ).toBeGreaterThanOrEqual(1);
    expect(target.style, `${label} ${target.key} border style`).toBe('solid');
    const rect = target.rect!;
    const x = rect.x + rect.width / 2;
    const border = sample(x, rect.y + 0.5);
    const outside = sample(x, rect.y - 1);
    const inside = sample(x, rect.y + 1.5);
    const minimum = contrast(
      luminance(...(border as [number, number, number])),
      luminance(...(outside as [number, number, number])),
    );
    expect(
      minimum,
      `${label} ${target.key} visible boundary ${JSON.stringify({ border, outside, inside })}`,
    ).toBeGreaterThanOrEqual(3);
    return { field: target.key, border, outside, inside, contrast: minimum };
  });
  fieldBoundaryEvidence.push({ label, fields: measured });
  return measured;
}

async function measureFocusRingContrast(page: Page, label: string) {
  const input = page.locator('form input[name="name"]');
  const wrapper = input.locator('xpath=..');
  await input.focus();
  const bounds = await wrapper.boundingBox();
  if (!bounds) throw new Error('Focused field geometry unavailable');
  const ringStyle = await wrapper.evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return {
      width: style.borderTopWidth,
      style: style.borderTopStyle,
      color: style.borderTopColor,
      radius: style.borderTopLeftRadius,
      fieldRadius: getComputedStyle(element).borderTopLeftRadius,
    };
  });
  expect(ringStyle.width).toBe('2px');
  expect(ringStyle.style).toBe('solid');
  expect(Number.parseFloat(ringStyle.radius)).toBeGreaterThan(0);
  expect(Number.parseFloat(ringStyle.radius)).toBeCloseTo(
    Number.parseFloat(ringStyle.fieldRadius) + 2,
    1,
  );
  await mkdir(output, { recursive: true });
  const screenshotPath = join(output, `${label}.png`);
  const screenshot = await page.screenshot({
    path: screenshotPath,
    fullPage: true,
    scale: 'device',
  });
  captures.push({ path: screenshotPath, label, group: 'states' });
  const { data, info } = await sharp(screenshot)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sample = (x: number, y: number) => {
    const pixelX = Math.max(0, Math.min(info.width - 1, Math.round(x * 2)));
    const pixelY = Math.max(0, Math.min(info.height - 1, Math.round(y * 2)));
    const offset = (pixelY * info.width + pixelX) * info.channels;
    return [data[offset]!, data[offset + 1]!, data[offset + 2]!];
  };
  const sampleY = bounds.y + bounds.height / 2;
  // The pseudo-element extends 2px beyond the control. Sample its center line
  // and the adjacent 2px token halo, rather than the control's interior.
  const ring = sample(bounds.x - 1, sampleY);
  const keyline = sample(bounds.x - 3, sampleY);
  const ratio = contrast(
    luminance(ring[0]!, ring[1]!, ring[2]!),
    luminance(keyline[0]!, keyline[1]!, keyline[2]!),
  );
  focusEvidence.push({ label, ring, keyline, ringStyle, contrast: ratio });
  expect(
    ratio,
    `${label} focus ring contrast ${JSON.stringify({ bounds, ring, keyline, ringStyle })}`,
  ).toBeGreaterThanOrEqual(3);
  return ratio;
}

type DOMRectJSON = { x: number; y: number; width: number; height: number };

async function measureMobileFade(page: Page, label: string) {
  const measurements = await page.evaluate(async () => {
    const stage = document.querySelector<HTMLElement>(
      '[data-testid="hero-prototype"]',
    );
    const image = document.querySelector<HTMLImageElement>('[data-hero-image]');
    const card = document.querySelector<HTMLElement>(
      '[data-testid="hero-glass-card"]',
    );
    const fade = document.querySelector<HTMLElement>('[class*="mobileFade"]');
    if (!stage || !image || !card || !fade)
      throw new Error('Fade geometry unavailable');
    const art = image.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const fadeStyle = getComputedStyle(fade);
    const stageStyle = getComputedStyle(stage);
    return {
      artHeight: art.height,
      cardTop: cardRect.top + window.scrollY,
      cardTopPctArt: (cardRect.top + window.scrollY) / art.height,
      fadeHeight: Number.parseFloat(fadeStyle.blockSize),
      fadeRatio: Number.parseFloat(fadeStyle.blockSize) / art.height,
      fadeTop: Number.parseFloat(fadeStyle.insetBlockStart),
      substrate: stageStyle.getPropertyValue('--hero-toned-substrate').trim(),
      average: stageStyle.getPropertyValue('--hero-bottom-average').trim(),
      stageBackground: stageStyle.backgroundColor,
    };
  });
  const full = await page.screenshot({ fullPage: true, scale: 'device' });
  const stripMetrics = await page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Fade sampler unavailable');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const linearChannel = (channel: number) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };
    const rows: Array<{ y: number; light: number }> = [];
    const cssWidth = canvas.width / 2;
    const xPoints = [4, Math.max(5, Math.round(cssWidth - 5))].map(
      (x) => x * 2,
    );
    const yStart = Math.floor((measurementsTop() * 2) / 16) * 16;
    const yEnd = Math.min(
      canvas.height - 16,
      Math.ceil((measurementsEnd() * 2) / 16) * 16,
    );
    function measurementsTop() {
      const art = document
        .querySelector('[data-hero-image]')!
        .getBoundingClientRect();
      return art.height * 0.62;
    }
    function measurementsEnd() {
      const art = document
        .querySelector('[data-hero-image]')!
        .getBoundingClientRect();
      return art.height + 36;
    }
    const rowLights: number[] = [];
    for (let y = yStart; y <= yEnd; y += 16) {
      const values = xPoints.map((x) => {
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;
        for (let py = y; py < Math.min(y + 16, canvas.height); py += 1) {
          const offset = (py * canvas.width + x) * 4;
          red += pixels[offset]!;
          green += pixels[offset + 1]!;
          blue += pixels[offset + 2]!;
          count += 1;
        }
        const light =
          0.2126 * linearChannel(red / count) +
          0.7152 * linearChannel(green / count) +
          0.0722 * linearChannel(blue / count);
        return light;
      });
      rowLights.push((values[0]! + values[1]!) / 2);
      rows.push({ y: y / 2, light: rowLights.at(-1)! });
    }
    const deltas = rowLights
      .slice(1)
      .map((value, index) => Math.abs(value - rowLights[index]!));
    return {
      maxAdjacent8pxDeltaL: Math.max(0, ...deltas),
      samples: rows.length,
    };
  }, full.toString('base64'));
  const result = { ...measurements, ...stripMetrics };
  geometryEvidence.push({ label, ...result });
  expect(result.fadeRatio).toBeCloseTo(0.35, 2);
  expect(result.cardTopPctArt).toBeGreaterThanOrEqual(0.7);
  expect(result.cardTopPctArt).toBeLessThanOrEqual(0.85);
  expect(result.maxAdjacent8pxDeltaL).toBeLessThanOrEqual(0.2);
  return result;
}

test('Liquid Glass redesign matrix, localized form states, contrast, geometry, and PO evidence', async ({
  browser,
  request,
}) => {
  await mkdir(output, { recursive: true });

  for (const orientation of ['desktop', 'mobile'] as const) {
    const response = await request.get(
      `${origin}/showcase/f14-hero-glass/artwork/${orientation}`,
    );
    expect(response.status(), `${orientation} generated artwork route`).toBe(
      200,
    );
    expect(response.headers()['content-type']).toContain('image/webp');
    expect((await response.body()).byteLength).toBeGreaterThan(100_000);
  }

  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const size of [
        { width: 390, height: 844, label: 'mobile-390' },
        { width: 1440, height: 900, label: 'desktop-1440' },
      ]) {
        const { page, close } = await open(browser, {
          ...size,
          locale,
          theme,
        });
        const card = page.getByTestId('hero-glass-card');
        await assertVisibleLabels(page, `${locale}-${theme}-${size.label}`);
        const loadedArtwork = await page
          .locator('[data-hero-image]')
          .evaluate((image) => (image as HTMLImageElement).currentSrc);
        expect(
          loadedArtwork,
          `${locale}-${theme}-${size.label} artwork`,
        ).toContain(
          `/showcase/f14-hero-glass/artwork/${size.width === 390 ? 'mobile' : 'desktop'}`,
        );
        const radii = await page.evaluate(() => {
          const control = (selector: string) =>
            document.querySelector<HTMLElement>(selector)?.parentElement ??
            null;
          const entries: Record<string, string> = {};
          const targets: Array<[string, HTMLElement | null]> = [
            ['name', control('input[name="name"]')],
            ['email', control('input[name="email"]')],
            ['country', control('#hero-country-input')],
            ['phone', control('input[name="phone-national"]')],
            ['password', control('input[name="password"]')],
            ['submit', document.querySelector<HTMLElement>('form > button')],
            [
              'card',
              document.querySelector<HTMLElement>(
                '[data-testid="hero-glass-card"]',
              ),
            ],
          ];
          for (const [key, element] of targets) {
            if (!element) throw new Error(`Radius target unavailable: ${key}`);
            entries[key] = getComputedStyle(element).borderTopLeftRadius;
          }
          return entries;
        });
        for (const [key, radius] of Object.entries(radii)) {
          expect(
            Number.parseFloat(radius),
            `${locale}-${theme}-${size.label} ${key} radius`,
          ).toBeGreaterThan(0);
        }
        const nestedBackdrop = await page
          .locator('input[name="name"]')
          .locator('xpath=..')
          .evaluate((element) => getComputedStyle(element).backdropFilter);
        expect(nestedBackdrop).toBe('none');
        await expect(card).toHaveAttribute(
          'data-material',
          'liquid-glass-strong',
        );
        await expect(card).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        if (size.width >= 768) {
          const scroll = await page.evaluate(
            () => document.documentElement.scrollHeight - window.innerHeight,
          );
          expect(scroll).toBeLessThanOrEqual(1);
          const bounds = await card.boundingBox();
          expect(bounds).not.toBeNull();
          expect(
            Math.abs(bounds!.x + bounds!.width - size.width + 58),
          ).toBeLessThanOrEqual(2);
        }
        await axe(page, `${locale}-${theme}-${size.label}`);
        if (size.width === 390) {
          const geometry = await measureMobileFade(
            page,
            `${locale}-${theme}-390`,
          );
          expect(geometry.cardTop).toBeLessThan(geometry.artHeight);
        }
        await capture(page, `${locale}-${theme}-${size.label}`, 'required');
        if (size.width === 1440) {
          await capture(page, `edge-corner-${theme}`, 'surface', {
            locator: '[data-testid="hero-glass-card"]',
          });
          const cardStyle = await card.evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              border: style.border,
              background: style.backgroundColor,
              shadow: style.boxShadow,
              backdrop: style.backdropFilter,
              radius: style.borderRadius,
              edge: getComputedStyle(element, '::before').backgroundImage,
              mask: getComputedStyle(element, '::before').maskComposite,
            };
          });
          expect(cardStyle.border).toMatch(/0px/);
          expect(cardStyle.backdrop).toContain('8px');
          expect(cardStyle.edge).toContain('linear-gradient');
          expect(cardStyle.mask).toContain('exclude');
        }
        await close();
      }
    }
  }

  for (const theme of ['light', 'dark'] as const) {
    for (const fixture of ['dark', 'bright'] as const) {
      for (const locale of ['ar', 'en'] as const) {
        for (const size of [
          { width: 390, height: 844, label: 'mobile' },
          { width: 1440, height: 900, label: 'desktop' },
        ]) {
          const { page, close } = await open(browser, {
            ...size,
            locale,
            theme,
            fixture,
          });
          const ratios = await measureTextContrast(
            page,
            `${fixture}-${theme}-${locale}-${size.label}`,
          );
          const cta = await page
            .locator('form button[type="submit"]')
            .evaluate((button) => {
              const style = getComputedStyle(button);
              return {
                color: style.color,
                background: style.backgroundColor,
              };
            });
          const ctaContrast = contrast(
            cssLuminance(cta.color),
            cssLuminance(cta.background),
          );
          contrastEvidence.push({
            label: `cta-${fixture}-${theme}-${locale}-${size.label}`,
            ctaContrast,
            cta,
          });
          expect(ctaContrast).toBeGreaterThanOrEqual(4.5);
          expect(Object.values(ratios).length).toBeGreaterThan(4);
          if (locale === 'en' && size.width === 1440) {
            await measureFocusRingContrast(
              page,
              `focus-${fixture}-${theme}-desktop`,
            );
          }
          if (fixture === 'bright' && size.width === 1440) {
            await capture(page, `bright-art-${theme}-${locale}`, 'surface');
          }
          await close();
        }
      }
    }
  }

  for (const size of [
    { width: 1280, height: 800 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
  ]) {
    const { page, close } = await open(browser, { ...size, theme: 'dark' });
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerHeight,
      document: document.documentElement.scrollHeight,
      card: (() => {
        const bounds = document
          .querySelector('[data-testid="hero-glass-card"]')!
          .getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      })(),
    }));
    geometryEvidence.push({
      label: `desktop-fit-${size.width}x${size.height}`,
      ...dimensions,
    });
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
    if (size.width === 1440)
      expect(dimensions.card.width).toBeGreaterThanOrEqual(480);
    if (size.width === 1280 || size.width === 1366)
      await capture(
        page,
        `desktop-fit-${size.width}x${size.height}`,
        'composition',
      );
    await close();
  }

  for (const size of [
    { width: 1440, height: 900, label: 'desktop' },
    { width: 390, height: 844, label: 'mobile' },
  ]) {
    const { page, close } = await open(browser, {
      width: size.width,
      height: size.height,
      theme: 'dark',
      locale: 'en',
      fixture: 'dark',
    });
    await page.addStyleTag({
      content: `
        [data-testid="registration-panel"] { display: none !important; }
        [class*="mobileFade"] { display: none !important; }
      `,
    });
    await capture(page, `hero-art-only-${size.label}`, 'artwork');
    await close();
  }

  for (const theme of ['light', 'dark'] as const) {
    const { page, close } = await open(browser, {
      width: 390,
      height: 844,
      theme,
    });
    const geometry390 = await measureMobileFade(page, `fade-390-${theme}`);
    await capture(page, `mobile-fade-390-${theme}`, 'surface', {
      locator: '[data-testid="hero-mobile-fade"]',
    });
    await close();

    const narrow = await open(browser, {
      width: 360,
      height: 780,
      theme,
    });
    const geometry360 = await measureMobileFade(
      narrow.page,
      `fade-360-${theme}`,
    );
    expect(geometry390.fadeRatio).toBeCloseTo(geometry360.fadeRatio, 2);
    await narrow.close();
  }

  for (const theme of ['light', 'dark'] as const) {
    const { page, close } = await open(browser, {
      width: 1440,
      height: 900,
      theme,
    });
    await capture(page, `input-rest-${theme}`, 'states', {
      locator: 'form input[name="name"] >> xpath=..',
    });
    const firstInput = page.locator('form input[name="name"]');
    await firstInput.focus();
    await capture(page, `input-focus-${theme}`, 'states', {
      locator: '[data-testid="hero-content-plate"]',
    });
    const focused = await firstInput.evaluate((input) => {
      const wrapper = input.parentElement!;
      const ring = getComputedStyle(wrapper, '::after');
      return {
        ring: ring.borderTopColor,
        width: ring.borderTopWidth,
        style: ring.borderTopStyle,
      };
    });
    expect(focused.width).toBe('2px');
    expect(focused.style).toBe('solid');
    expect(focused.ring).toBe('rgb(5, 150, 105)');
    await close();

    for (const locale of ['ar', 'en'] as const) {
      const errorRun = await open(browser, {
        width: 1440,
        height: 900,
        locale,
        theme,
      });
      const phone = errorRun.page.locator('input[name="phone-national"]');
      await phone.fill('123');
      await errorRun.page.locator('form button[type="submit"]').click();
      await expect(phone).toHaveAttribute('aria-invalid', 'true');
      await expect(phone).toHaveAttribute(
        'aria-describedby',
        'hero-phone-error',
      );
      await expect(errorRun.page.locator('#hero-phone-error')).toBeVisible();
      await expect(errorRun.page.locator('#hero-phone-error')).not.toHaveText(
        '',
      );
      const edge = await phone.evaluate((input) => {
        const wrapper = input.parentElement!;
        const style = getComputedStyle(wrapper);
        return {
          width: style.borderTopWidth,
          style: style.borderTopStyle,
          outline: style.outlineStyle,
          rim: getComputedStyle(wrapper, '::before').display,
          radius: style.borderTopLeftRadius,
        };
      });
      expect(edge.width).toBe('2px');
      expect(edge.style).toBe('solid');
      expect(edge.outline).toBe('none');
      expect(edge.rim).toBe('none');
      expect(edge.radius).not.toBe('0px');
      const restingRadius = await errorRun.page
        .locator('input[name="name"]')
        .evaluate(
          (input) => getComputedStyle(input.parentElement!).borderTopLeftRadius,
        );
      expect(edge.radius, `${locale}-${theme} error edge radius`).toBe(
        restingRadius,
      );
      await axe(errorRun.page, `error-state-${locale}-${theme}`);
      await measureTextContrast(
        errorRun.page,
        `error-dark-art-${locale}-${theme}-desktop`,
      );
      await capture(errorRun.page, `input-error-${locale}-${theme}`, 'states', {
        locator: 'form label:has(input[name="phone-national"])',
      });
      const errorColor = await errorRun.page
        .locator('#hero-phone-error')
        .evaluate((element) => getComputedStyle(element).color);
      expect(errorColor).not.toBe('rgba(0, 0, 0, 0)');
      await errorRun.close();
    }
  }

  for (const theme of ['light', 'dark'] as const) {
    const { page, close } = await open(browser, {
      width: 390,
      height: 844,
      theme,
      fixture: 'dark',
    });
    await page.locator('input[name="phone-national"]').fill('123');
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('input[name="phone-national"]')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await axe(page, `dark-error-state-${theme}-mobile`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await measureTextContrast(page, `error-dark-art-${theme}-mobile`);
    await close();
  }

  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of [
      { name: 'mobile', width: 390, height: 844 },
      { name: 'desktop', width: 1440, height: 900 },
    ]) {
      const { page, close } = await open(browser, {
        ...viewport,
        theme,
        fixture: 'bright',
      });
      await page.locator('input[name="phone-national"]').fill('123');
      await page.locator('form button[type="submit"]').click();
      await expect(
        page.locator('input[name="phone-national"]'),
      ).toHaveAttribute('aria-invalid', 'true');
      await axe(page, `bright-error-state-${theme}-${viewport.name}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await measureTextContrast(
        page,
        `error-bright-art-${theme}-${viewport.name}`,
      );
      await close();
    }
  }

  for (const locale of ['ar', 'en'] as const) {
    const { page, close } = await open(browser, {
      width: 390,
      height: 844,
      locale,
      theme: 'dark',
    });
    const country = page.getByRole('combobox');
    const selectedName = await country.inputValue();
    expect(selectedName).not.toBe('+20');
    const prefix = page.getByTestId('country-calling-code');
    const phoneInput = page.locator('input[name="phone-national"]');
    const spacing = await Promise.all([
      prefix.evaluate((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return {
          start: Number.parseFloat(style.paddingInlineStart),
          end: Number.parseFloat(style.paddingInlineEnd),
          x: bounds.x,
        };
      }),
      phoneInput.evaluate((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return {
          start: Number.parseFloat(style.paddingInlineStart),
          end: Number.parseFloat(style.paddingInlineEnd),
          x: bounds.x,
        };
      }),
      phoneInput.evaluate((element) => {
        const style = getComputedStyle(element.parentElement!);
        return {
          start: Number.parseFloat(style.paddingInlineStart),
          end: Number.parseFloat(style.paddingInlineEnd),
          gap: Number.parseFloat(style.columnGap),
        };
      }),
    ]);
    expect(spacing[0].start).toBe(0);
    expect(spacing[0].end).toBe(0);
    expect(spacing[1].start).toBe(0);
    expect(spacing[1].end).toBe(0);
    expect(spacing[2].start).toBeGreaterThan(0);
    expect(spacing[2].end).toBeGreaterThan(0);
    expect(spacing[0].x).toBeLessThan(spacing[1].x);
    await phoneInput.fill('1234567');
    const phoneGap = await page.evaluate(() => {
      const prefixElement = document.querySelector<HTMLElement>(
        '[data-testid="country-calling-code"]',
      );
      const inputElement = document.querySelector<HTMLInputElement>(
        'input[name="phone-national"]',
      );
      const wrapper = inputElement?.parentElement;
      if (!prefixElement || !inputElement || !wrapper)
        throw new Error('Phone group geometry unavailable');
      const prefixRect = prefixElement.getBoundingClientRect();
      const inputRect = inputElement.getBoundingClientRect();
      const direction = getComputedStyle(wrapper).direction;
      const gap =
        direction === 'rtl'
          ? prefixRect.left - inputRect.right
          : inputRect.left - prefixRect.right;
      const probe = document.createElement('span');
      probe.style.gap = 'var(--space-2)';
      document.body.append(probe);
      const expected = Number.parseFloat(getComputedStyle(probe).gap);
      probe.remove();
      return { gap, expected, direction, value: inputElement.value };
    });
    expect(phoneGap.value).toBe('1234567');
    expect(phoneGap.direction).toBe('ltr');
    expect(Math.abs(phoneGap.gap - phoneGap.expected)).toBeLessThanOrEqual(1);
    await country.focus();
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    await expect(list.locator('[role="option"]').first()).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      await list.evaluate((element) =>
        Boolean(element.closest('[data-testid="hero-glass-card"]')),
      ),
    ).toBe(false);
    const bounds = await list.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    const listRadius = await list.evaluate(
      (element) => getComputedStyle(element).borderTopLeftRadius,
    );
    expect(
      Number.parseFloat(listRadius),
      `combobox-${locale} list radius`,
    ).toBeGreaterThan(0);
    await axe(page, `combobox-open-${locale}`);
    await capture(page, `country-open-${locale}`, 'combobox', {
      locator: 'body',
    });
    await country.press('ArrowDown');
    await country.press('Enter');
    await expect(country).not.toHaveValue(selectedName);
    await expect(
      page.locator('[data-testid="country-calling-code"]'),
    ).toContainText('+');
    await close();
  }

  const flip = await open(browser, {
    width: 390,
    height: 844,
    locale: 'en',
    theme: 'light',
  });
  await flip.page.getByRole('combobox').evaluate((element) => {
    const picker = element.parentElement!;
    const rect = picker.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + rect.bottom - window.innerHeight + 40);
  });
  await flip.page.getByRole('combobox').focus();
  await expect(flip.page.getByRole('listbox')).toHaveAttribute(
    'data-placement',
    'above',
  );
  const flipBounds = await flip.page.getByRole('listbox').boundingBox();
  expect(flipBounds).not.toBeNull();
  expect(flipBounds!.y + flipBounds!.height).toBeLessThanOrEqual(844);
  await capture(flip.page, 'country-flips-up-at-viewport-bottom', 'combobox', {
    locator: 'body',
  });
  await axe(flip.page, 'combobox-flip');
  await flip.close();

  for (const theme of ['light', 'dark'] as const) {
    for (const size of [
      { name: 'mobile', width: 390, height: 844 },
      { name: 'desktop', width: 1440, height: 900 },
    ]) {
      const { page, close } = await open(browser, {
        width: size.width,
        height: size.height,
        theme,
        fixture: 'none',
      });
      const label = `no-image-${size.name}-${theme}`;
      await assertVisibleLabels(page, label, true);
      await capture(page, label, 'fallbacks');
      await measureFieldBoundaries(page, label);
      await axe(page, label);
      await close();
    }
  }

  const noImageOptions = await open(browser, {
    width: 1440,
    height: 900,
    theme: 'light',
    fixture: 'none',
  });
  await capture(
    noImageOptions.page,
    'no-image-option-1-keep-right',
    'gap-mocks',
  );
  await noImageOptions.page.addStyleTag({
    content: `
      [data-fixture="none"] [class*="glassFrame"] {
        inset-inline-start: 50%;
        right: auto;
        transform: translate(-50%, -50%);
      }
    `,
  });
  await capture(
    noImageOptions.page,
    'no-image-option-2-center-card',
    'gap-mocks',
  );
  await noImageOptions.page.addStyleTag({
    content: `
      [data-fixture="none"] [class*="glassFrame"] {
        inset-inline-start: auto;
        right: clamp(1.5rem, 4vw, 4rem);
        transform: translateY(-50%);
      }
      [data-fixture="none"]::before {
        position: absolute;
        z-index: 1;
        inset: 12% auto 12% 5%;
        inline-size: min(30vw, 26rem);
        border-radius: var(--radius-card);
        background: var(--hero-toned-substrate);
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1);
        content: '';
      }
    `,
  });
  await capture(
    noImageOptions.page,
    'no-image-option-3-tonal-panel-left',
    'gap-mocks',
  );
  await noImageOptions.close();

  const reduced = await open(browser, {
    width: 1440,
    height: 900,
    theme: 'dark',
    mediaFeatures: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  });
  await assertOpaqueSurface(reduced.page, 'reduced-transparency');
  await capture(reduced.page, 'reduced-transparency', 'accessibility');
  await axe(reduced.page, 'reduced-transparency');
  await reduced.close();

  const higherContrast = await open(browser, {
    width: 1440,
    height: 900,
    theme: 'light',
    mediaFeatures: [{ name: 'prefers-contrast', value: 'more' }],
  });
  await assertOpaqueSurface(higherContrast.page, 'increased-contrast');
  await capture(higherContrast.page, 'increased-contrast', 'accessibility');
  await axe(higherContrast.page, 'increased-contrast');
  await higherContrast.close();

  const forced = await open(browser, {
    width: 1440,
    height: 900,
    theme: 'dark',
    forcedColors: 'active',
  });
  const forcedCard = await forced.page
    .getByTestId('hero-glass-card')
    .evaluate((card) => {
      const style = getComputedStyle(card);
      return {
        color: style.color,
        background: style.backgroundColor,
        border: style.borderColor,
        backdrop: style.backdropFilter,
        pseudo: getComputedStyle(card, '::before').display,
      };
    });
  expect(forcedCard.backdrop).toBe('none');
  expect(forcedCard.pseudo).toBe('none');
  await capture(forced.page, 'forced-colors', 'accessibility');
  await axe(forced.page, 'forced-colors');
  await forced.close();

  const reduceMotion = await open(browser, {
    width: 390,
    height: 844,
    theme: 'dark',
    reducedMotion: true,
  });
  await capture(reduceMotion.page, 'reduced-motion-mobile', 'accessibility');
  await axe(reduceMotion.page, 'reduced-motion-mobile');
  await reduceMotion.close();

  for (const theme of ['light', 'dark'] as const) {
    const { page, close } = await open(browser, {
      width: 1440,
      height: 900,
      theme,
      fixture: 'dark',
    });
    const cardPath = await capture(
      page,
      `reference-card-${theme}`,
      'references',
      {
        locator: '[data-testid="hero-glass-card"]',
      },
    );
    const bloom = await readFile(
      'C:\\Users\\NEW LAP\\.lifter\\briefs\\s18-hero-refs\\bloom-reference.png',
    );
    const lumina = await readFile(
      'C:\\Users\\NEW LAP\\.lifter\\briefs\\s18-hero-refs\\lumina-reference.png',
    );
    const bloomCrop = await sharp(bloom)
      .extract({ left: 14, top: 14, width: 390, height: 536 })
      .png()
      .toBuffer();
    const luminaInput = await sharp(lumina)
      .extract({ left: 240, top: 200, width: 520, height: 82 })
      .png()
      .toBuffer();
    const luminaFooter = await sharp(lumina)
      .extract({ left: 4, top: 552, width: 974, height: 190 })
      .png()
      .toBuffer();
    const tileWidth = 420;
    const tileHeight = 500;
    const labels = [
      'Our glass card',
      'Bloom panel reference',
      'Lumina email field',
      'Lumina footer panel',
    ];
    const buffers = [
      await sharp(cardPath).png().toBuffer(),
      bloomCrop,
      luminaInput,
      luminaFooter,
    ];
    const composites = await Promise.all(
      buffers.map(async (input, index) => {
        const resized = await sharp(input)
          .resize(tileWidth - 12, tileHeight - 42, {
            fit: 'contain',
            background: '#10201d',
          })
          .png()
          .toBuffer();
        const label = Buffer.from(
          `<svg width="${tileWidth}" height="32"><rect width="100%" height="100%" fill="#152321"/><text x="8" y="22" fill="white" font-size="14" font-family="sans-serif">${labels[index]}</text></svg>`,
        );
        return [
          { input: label, left: index * tileWidth, top: 0 },
          { input: resized, left: index * tileWidth + 6, top: 36 },
        ];
      }),
    );
    const comparisonPath = join(output, `reference-comparison-${theme}.png`);
    await sharp({
      create: {
        width: tileWidth * 4,
        height: tileHeight,
        channels: 3,
        background: '#10201d',
      },
    })
      .composite(composites.flat())
      .png()
      .toFile(comparisonPath);
    captures.push({
      path: comparisonPath,
      label: `Reference comparison ${theme}`,
      group: 'references',
    });
    await close();
  }

  const contactPaths: string[] = [];
  for (const [group, name, columns] of [
    ['required', 'contact-required.png', 4],
    ['surface', 'contact-material-and-fade.png', 3],
    ['states', 'contact-input-states.png', 3],
    ['combobox', 'contact-country-selector.png', 3],
    ['fallbacks', 'contact-no-image.png', 2],
    ['accessibility', 'contact-accessibility.png', 3],
    ['references', 'contact-reference-comparison.png', 2],
    ['gap-mocks', 'contact-no-image-layout-options.png', 3],
    ['composition', 'contact-desktop-fit.png', 2],
    ['artwork', 'contact-hero-art-only.png', 2],
  ] as const) {
    const path = await contactSheet(group, name, columns);
    if (path) contactPaths.push(path);
  }

  const reportPath = join(output, 'evidence.json');
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        contrastEvidence,
        focusEvidence,
        geometryEvidence,
        fieldBoundaryEvidence,
        captures,
        contactPaths,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`SCREENSHOT_DIRECTORY ${output}`);
  console.log(`EVIDENCE ${reportPath}`);
  for (const item of captures) console.log(`SCREENSHOT ${item.path}`);
  for (const path of contactPaths) console.log(`CONTACT_SHEET ${path}`);
  console.log(`CONTRAST_EVIDENCE ${JSON.stringify(contrastEvidence)}`);
  console.log(`FOCUS_EVIDENCE ${JSON.stringify(focusEvidence)}`);
  console.log(`GEOMETRY_EVIDENCE ${JSON.stringify(geometryEvidence)}`);
});

test('P3 phone glyphs form one LTR group with one token gap in RTL and LTR', async ({
  browser,
}) => {
  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const viewport of [
        { name: 'mobile', width: 390, height: 844 },
        { name: 'desktop', width: 1440, height: 900 },
      ]) {
        const { page, close } = await open(browser, {
          ...viewport,
          locale,
          theme,
          fixture: 'dark',
        });
        const phone = page.locator('input[name="phone-national"]');
        if (viewport.name === 'desktop') {
          await capture(page, `phone-rest-${locale}-${theme}`, 'phone-glyphs', {
            locator: 'label:has(input[name="phone-national"])',
          });
        }
        const measureRangeGap = async () =>
          phone.evaluate((input) => {
            const phoneInput = input as HTMLInputElement;
            const prefix = document.querySelector<HTMLElement>(
              '[data-testid="country-calling-code"]',
            );
            const group = phoneInput.parentElement;
            if (!prefix || !group) throw new Error('Phone group unavailable');
            const inputStyle = getComputedStyle(phoneInput);
            const inputRect = phoneInput.getBoundingClientRect();
            const prefixRect = prefix.getBoundingClientRect();
            const mirror = document.createElement('span');
            Object.assign(mirror.style, {
              position: 'fixed',
              left: `${inputRect.left}px`,
              top: `${inputRect.top}px`,
              display: 'block',
              boxSizing: 'border-box',
              inlineSize: `${inputRect.width}px`,
              blockSize: `${inputRect.height}px`,
              paddingLeft: inputStyle.paddingLeft,
              paddingRight: inputStyle.paddingRight,
              font: inputStyle.font,
              letterSpacing: inputStyle.letterSpacing,
              lineHeight: inputStyle.lineHeight,
              direction: inputStyle.direction,
              textAlign: inputStyle.textAlign,
              whiteSpace: 'pre',
              visibility: 'hidden',
            });
            mirror.textContent = phoneInput.value;
            document.body.append(mirror);
            const range = document.createRange();
            range.selectNodeContents(mirror);
            const glyph = range.getBoundingClientRect();
            const tokenProbe = document.createElement('span');
            tokenProbe.style.gap = 'var(--space-2)';
            document.body.append(tokenProbe);
            const tokenGap = Number.parseFloat(
              getComputedStyle(tokenProbe).gap,
            );
            tokenProbe.remove();
            mirror.remove();
            return {
              value: phoneInput.value,
              inputDirection: inputStyle.direction,
              groupDirection: getComputedStyle(group).direction,
              inputDir: phoneInput.getAttribute('dir'),
              glyphLeft: glyph.left,
              glyphRight: glyph.right,
              prefixLeft: prefixRect.left,
              prefixRight: prefixRect.right,
              gap: glyph.left - prefixRect.right,
              tokenGap,
            };
          });

        await phone.fill('1234567');
        if (viewport.name === 'desktop') {
          await capture(
            page,
            `phone-typed-${locale}-${theme}`,
            'phone-glyphs',
            { locator: 'label:has(input[name="phone-national"])' },
          );
        }
        const typed = await measureRangeGap();
        expect(typed.value).toBe('1234567');
        expect(typed.inputDirection).toBe('ltr');
        expect(typed.groupDirection).toBe('ltr');
        expect(typed.inputDir).toBe('ltr');
        expect(
          Math.abs(typed.gap - typed.tokenGap),
          `${locale}-${theme}-${viewport.name} typed glyph gap ${JSON.stringify(typed)}`,
        ).toBeLessThanOrEqual(2);

        await phone.fill('123');
        await page.locator('form button[type="submit"]').click();
        await expect(phone).toHaveAttribute('aria-invalid', 'true');
        if (viewport.name === 'desktop') {
          await capture(
            page,
            `phone-error-${locale}-${theme}`,
            'phone-glyphs',
            { locator: 'label:has(input[name="phone-national"])' },
          );
        }
        const error = await measureRangeGap();
        expect(error.value).toBe('123');
        expect(error.inputDirection).toBe('ltr');
        expect(error.groupDirection).toBe('ltr');
        expect(
          Math.abs(error.gap - error.tokenGap),
          `${locale}-${theme}-${viewport.name} error glyph gap ${JSON.stringify(error)}`,
        ).toBeLessThanOrEqual(2);
        await close();
      }
    }
  }
});

test('P1 no-image centering and P2 art-luminance adaptive glass dimming', async ({
  browser,
}) => {
  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const viewport of [
        { name: 'mobile-390', width: 390, height: 844 },
        { name: 'desktop-1280', width: 1280, height: 800 },
        { name: 'desktop-1440', width: 1440, height: 900 },
        { name: 'tablet-768', width: 768, height: 900 },
      ]) {
        const { page, close } = await open(browser, {
          width: viewport.width,
          height: viewport.height,
          locale,
          theme,
          fixture: 'none',
        });
        const geometry = await page.evaluate(() => {
          const frame = document.querySelector<HTMLElement>(
            '[data-testid="hero-glass-card"]',
          )?.parentElement;
          if (!frame) throw new Error('No-image frame unavailable');
          const rect = frame.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            scrollHeight: document.documentElement.scrollHeight,
            position: getComputedStyle(frame).position,
          };
        });
        expect(geometry.scrollHeight).toBeLessThanOrEqual(
          geometry.viewportHeight + 1,
        );
        if (viewport.width >= 768) {
          expect(
            Math.abs(
              geometry.x + geometry.width / 2 - geometry.viewportWidth / 2,
            ),
            `${locale}-${theme}-${viewport.name} no-image horizontal center`,
          ).toBeLessThanOrEqual(1);
          expect(
            Math.abs(
              geometry.y + geometry.height / 2 - geometry.viewportHeight / 2,
            ),
            `${locale}-${theme}-${viewport.name} no-image vertical center`,
          ).toBeLessThanOrEqual(1);
          expect(geometry.position).toBe('absolute');
        } else {
          expect(geometry.position).toBe('relative');
          expect(geometry.y).toBeGreaterThan(0);
        }
        await assertVisibleLabels(
          page,
          `pass4-no-image-${locale}-${theme}`,
          true,
        );
        await axe(page, `pass4-no-image-${locale}-${theme}-${viewport.name}`);
        await capture(
          page,
          `pass4-no-image-${locale}-${theme}-${viewport.name}`,
          'pass4-no-image',
        );
        await close();
      }
    }
  }

  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const viewport of [
        { name: 'mobile-390', width: 390, height: 844 },
        { name: 'desktop-1440', width: 1440, height: 900 },
      ]) {
        for (const fixture of ['bright', 'dark'] as const) {
          const { page, close } = await open(browser, {
            width: viewport.width,
            height: viewport.height,
            locale,
            theme,
            fixture,
          });
          const adaptive = await page.evaluate(() => {
            const stage = document.querySelector<HTMLElement>(
              '[data-testid="hero-prototype"]',
            );
            const plate = document.querySelector<HTMLElement>(
              '[data-testid="hero-content-plate"]',
            );
            const field =
              document.querySelector<HTMLElement>(
                'input[name="name"]',
              )?.parentElement;
            const card = document.querySelector<HTMLElement>(
              '[data-testid="hero-glass-card"]',
            );
            if (!stage || !plate || !field || !card)
              throw new Error('Adaptive glass surface unavailable');
            return {
              photoLuminance: Number.parseFloat(
                stage.style.getPropertyValue('--hero-photo-luminance'),
              ),
              dimming: Number.parseFloat(
                stage.style.getPropertyValue('--hero-adaptive-dimming'),
              ),
              plateScrim: Number.parseFloat(
                getComputedStyle(plate, '::before').opacity,
              ),
              fieldBackground: getComputedStyle(field).backgroundColor,
              cardBackdrop: getComputedStyle(card).backdropFilter,
              fieldBackdrop: getComputedStyle(field).backdropFilter,
              tone: stage.dataset.photoTone,
            };
          });
          expect(adaptive.photoLuminance).toBeGreaterThan(0);
          if (fixture === 'bright') {
            if (adaptive.photoLuminance > 0.34) {
              expect(adaptive.dimming).toBeGreaterThan(0.2);
            } else {
              expect(adaptive.dimming).toBeLessThanOrEqual(0.04);
            }
            expect(adaptive.dimming).toBeLessThanOrEqual(0.72);
            expect(adaptive.plateScrim).toBeCloseTo(adaptive.dimming, 2);
            const fieldAlpha = adaptive.fieldBackground.startsWith('rgba(')
              ? Number.parseFloat(adaptive.fieldBackground.split(',').at(-1)!)
              : 1;
            expect(fieldAlpha).toBeLessThan(0.05);
            expect(adaptive.fieldBackdrop).toBe('none');
            const contrastResult = await measureTextContrast(
              page,
              `pass4-bright-${theme}-${locale}-${viewport.name}`,
            );
            for (const [key, value] of Object.entries(contrastResult)) {
              expect(
                value,
                `${locale}-${theme}-${viewport.name} bright ${key} contrast`,
              ).toBeGreaterThanOrEqual(key === 'field-edge' ? 3 : 4.5);
            }
            await capture(
              page,
              `pass4-bright-${locale}-${theme}-${viewport.name}`,
              'adaptive-dimming',
            );
            const phone = page.locator('input[name="phone-national"]');
            await phone.fill('123');
            await page.locator('form button[type="submit"]').click();
            await expect(phone).toHaveAttribute('aria-invalid', 'true');
            await expect(page.locator('#hero-phone-error')).toBeVisible();
            await page.evaluate(() => window.scrollTo(0, 0));
            const errorColors = await page
              .locator('#hero-phone-error')
              .evaluate((element) => {
                const style = getComputedStyle(element);
                return {
                  color: style.color,
                  background: style.backgroundColor,
                };
              });
            const errorCopyContrast = contrast(
              cssLuminance(errorColors.color),
              cssLuminance(errorColors.background),
            );
            expect(errorCopyContrast).toBeGreaterThanOrEqual(4.5);
            await capture(
              page,
              `pass4-bright-error-${locale}-${theme}-${viewport.name}`,
              'phone-glyphs',
              { locator: 'label:has(input[name="phone-national"])' },
            );
          } else {
            expect(adaptive.dimming).toBeLessThanOrEqual(0.03);
            await capture(
              page,
              `pass4-dark-${locale}-${theme}-${viewport.name}`,
              'adaptive-dimming',
            );
          }
          expect(adaptive.cardBackdrop).toContain('8px');
          console.log(
            `ADAPTIVE_DIMMING ${JSON.stringify({ locale, theme, viewport: viewport.name, fixture, photoLuminance: adaptive.photoLuminance, dimming: adaptive.dimming })}`,
          );
          await close();
        }
      }
    }
  }

  for (const [group, filename, columns] of [
    ['pass4-no-image', 'contact-pass4-no-image.png', 4],
    ['adaptive-dimming', 'contact-pass4-adaptive-dimming.png', 4],
    ['phone-glyphs', 'contact-pass4-phone-glyphs.png', 3],
  ] as const) {
    const path = await contactSheet(group, filename, columns);
    if (path) console.log(`PASS4_CONTACT_SHEET ${path}`);
  }
  for (const item of captures.filter((entry) =>
    ['pass4-no-image', 'adaptive-dimming', 'phone-glyphs'].includes(
      entry.group,
    ),
  )) {
    console.log(`PASS4_SCREENSHOT ${item.path}`);
  }
});
