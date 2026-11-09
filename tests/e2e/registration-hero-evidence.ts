import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

/**
 * Shared production registration-hero evidence helpers.
 *
 * The assertions port the approved `97debaf` hero-prototype contract onto the
 * real `/register/:token` route: material contract, LTR phone group, contrast,
 * touch targets, focus ring and axe. Screenshots and geometry are written to
 * the run's OS temp directory, never into the repository.
 */
export const heroEvidenceDirectory =
  process.env.HERO_EVIDENCE_DIR ?? join(tmpdir(), 'lifter-s26-hero-r3');

export async function captureHeroScreenshot(page: Page, name: string) {
  await mkdir(heroEvidenceDirectory, { recursive: true });
  const path = join(heroEvidenceDirectory, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

export async function expectHeroAxeClean(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

export async function expectHeroPhoneGroupLtr(page: Page) {
  const group = page.locator('[data-testid="phone-number-group"]');
  await expect(group).toHaveAttribute('dir', 'ltr');
  expect(
    await group.evaluate((element) => getComputedStyle(element).direction),
  ).toBe('ltr');
  const prefixBox = await page
    .locator('[data-testid="country-calling-code"]')
    .boundingBox();
  const inputBox = await page.locator('input[type="tel"]').boundingBox();
  expect(prefixBox).not.toBeNull();
  expect(inputBox).not.toBeNull();
  expect(prefixBox!.x + prefixBox!.width).toBeLessThanOrEqual(inputBox!.x + 1);
  expect(inputBox!.x - (prefixBox!.x + prefixBox!.width)).toBeCloseTo(8, 0);
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

type Rgb = [number, number, number];

function parseRenderedColor(color: string): { rgb: Rgb; alpha: number } {
  const hex = color.match(/^#([\da-f]{6})$/i)?.[1];
  if (hex) {
    return {
      rgb: [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ],
      alpha: 1,
    };
  }
  const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
  if (channels.length < 3)
    throw new Error(`Unsupported rendered color: ${color}`);
  const scale = /^color\(srgb/i.test(color) ? 255 : 1;
  return {
    rgb: [channels[0]! * scale, channels[1]! * scale, channels[2]! * scale],
    alpha: channels[3] ?? 1,
  };
}

function cssLuminance(color: string) {
  const { rgb } = parseRenderedColor(color);
  return luminance(rgb[0], rgb[1], rgb[2]);
}

function paeth(left: number, above: number, upperLeft: number) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance)
    return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

/** Read one pixel from Playwright's standard 8-bit RGB/RGBA PNG screenshot. */
function screenshotPixel(png: Buffer, x: number, y: number) {
  let width = 0;
  let height = 0;
  let channels = 0;
  const imageData: Buffer[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const chunk = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      if (chunk[8] !== 8 || ![2, 6].includes(chunk[9]!))
        throw new Error('Unsupported screenshot PNG color format');
      channels = chunk[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      imageData.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }
  if (x < 0 || y < 0 || x >= width || y >= height || channels === 0)
    throw new Error('Screenshot pixel is outside the PNG dimensions');

  const rowBytes = width * channels;
  const compressed = inflateSync(Buffer.concat(imageData));
  const decoded = Buffer.alloc(height * rowBytes);
  for (let row = 0; row < height; row += 1) {
    const source = row * (rowBytes + 1);
    const filter = compressed[source]!;
    const target = row * rowBytes;
    const previous = target - rowBytes;
    for (let column = 0; column < rowBytes; column += 1) {
      const value = compressed[source + column + 1]!;
      const left =
        column >= channels ? decoded[target + column - channels]! : 0;
      const above = row > 0 ? decoded[previous + column]! : 0;
      const upperLeft =
        row > 0 && column >= channels
          ? decoded[previous + column - channels]!
          : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : filter === 4
                  ? paeth(left, above, upperLeft)
                  : NaN;
      if (!Number.isFinite(predictor))
        throw new Error('Unsupported screenshot PNG filter');
      decoded[target + column] = (value + predictor) & 0xff;
    }
  }
  const pixel = (y * width + x) * channels;
  return [decoded[pixel]!, decoded[pixel + 1]!, decoded[pixel + 2]!];
}

function pixelHex(pixel: number[]) {
  return pixel.map((channel) => channel.toString(16).padStart(2, '0')).join('');
}

/**
 * Read the rendered backdrop behind an element.
 *
 * The element is hidden for the capture only, so the screenshot shows the
 * pixels the text is painted over: the dimmed artwork, the card fill and
 * the surface decoration. The element color is restored right after.
 */
async function renderedBackdrop(
  page: Page,
  target: Locator,
  points: { x: number; y: number }[],
) {
  const color = await target.evaluate(
    (element) => getComputedStyle(element).color,
  );
  await target.evaluate((element) => {
    (element as HTMLElement).style.visibility = 'hidden';
  });
  const png = await page.screenshot();
  await target.evaluate((element) => {
    (element as HTMLElement).style.visibility = '';
  });
  const samples = points.map(
    (point) => screenshotPixel(png, point.x, point.y) as Rgb,
  );
  return { color, samples };
}

/**
 * The rendered backdrop behind the hero heading keeps white text at 4.5:1
 * or better, even when a bright local patch sits under the text.
 */
export async function expectHeroTextBackdropContrast(page: Page) {
  const heading = page.locator('.formPlate h1, h1').first();
  await expect(heading).toBeVisible();
  const box = await heading.boundingBox();
  if (!box) throw new Error('Hero heading is not measurable');
  const y = Math.round(box.y + box.height / 2);
  const points = Array.from({ length: 9 }, (_, index) => ({
    x: Math.round(box.x + (box.width * index) / 8),
    y,
  }));
  const measure = async () => {
    const { color, samples } = await renderedBackdrop(page, heading, points);
    const foreground = parseRenderedColor(color);
    const worst = samples.reduce((brightest, sample) =>
      luminance(sample[0], sample[1], sample[2]) >=
      luminance(brightest[0], brightest[1], brightest[2])
        ? sample
        : brightest,
    );
    const ratio = contrast(
      luminance(foreground.rgb[0], foreground.rgb[1], foreground.rgb[2]),
      luminance(worst[0], worst[1], worst[2]),
    );
    return { ratio, backdrop: worst, color, alpha: foreground.alpha };
  };
  // The dimming is committed after the artwork is sampled, so the assertion
  // waits for the painted surface instead of reading a pre-commit frame.
  await expect
    .poll(async () => (await measure()).ratio, {
      timeout: 15_000,
      intervals: [100, 250, 500],
      message: 'the hero text keeps 4.5:1 over the painted backdrop',
    })
    .toBeGreaterThanOrEqual(4.5);
  const result = await measure();
  expect(result.alpha).toBe(1);
  return result;
}

/**
 * The preference label sits on a translucent pill over the artwork, so the
 * label text itself has to carry the contrast.
 */
export async function expectHeroPreferenceLabelContrast(page: Page) {
  const label = page
    .locator('[data-testid="registration-hero-preferences"] label[for]')
    .first();
  await expect(label).toBeVisible();
  const box = await label.boundingBox();
  if (!box) throw new Error('Preference label is not measurable');
  const measure = async () => {
    const { color, samples } = await renderedBackdrop(page, label, [
      {
        x: Math.round(box.x + box.width / 2),
        y: Math.round(box.y + box.height / 2),
      },
    ]);
    const foreground = parseRenderedColor(color);
    const backdrop = samples[0]!;
    const composited = foreground.rgb.map(
      (channel, index) =>
        foreground.alpha * channel +
        (1 - foreground.alpha) * (backdrop[index] ?? 0),
    ) as Rgb;
    const ratio = contrast(
      luminance(composited[0], composited[1], composited[2]),
      luminance(backdrop[0], backdrop[1], backdrop[2]),
    );
    return { ratio, backdrop, color, alpha: foreground.alpha };
  };
  await expect
    .poll(async () => (await measure()).ratio, {
      timeout: 15_000,
      intervals: [100, 250, 500],
      message: 'the preference label keeps 4.5:1 over the painted pill',
    })
    .toBeGreaterThanOrEqual(4.5);
  const result = await measure();
  expect(result.alpha).toBe(1);
  expect(parseRenderedColor(result.color).rgb).toEqual([255, 255, 255]);
  return result;
}

/**
 * The language select sits on a translucent control over the artwork, so the
 * white option text has to carry the contrast against the rendered surface.
 *
 * The select paints its own translucent fill over the pill, so the surface is
 * measured by compositing the rendered control fill over the painted pixel
 * behind it.
 */
export async function expectHeroPreferenceSelectContrast(page: Page) {
  const select = page.locator('[data-testid="language-select"]').first();
  await expect(select).toBeVisible();
  const box = await select.boundingBox();
  if (!box) throw new Error('Language select is not measurable');
  const point = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
  const measure = async () => {
    const styles = await select.evaluate((element) => ({
      color: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }));
    const foreground = parseRenderedColor(styles.color);
    const fill = parseRenderedColor(styles.background);
    await select.evaluate((element) => {
      (element as HTMLElement).style.visibility = 'hidden';
    });
    const png = await page.screenshot();
    await select.evaluate((element) => {
      (element as HTMLElement).style.visibility = '';
    });
    const behind = screenshotPixel(png, point.x, point.y) as Rgb;
    const surface = fill.rgb.map(
      (channel, index) =>
        fill.alpha * channel + (1 - fill.alpha) * (behind[index] ?? 0),
    ) as Rgb;
    const composited = foreground.rgb.map(
      (channel, index) =>
        foreground.alpha * channel +
        (1 - foreground.alpha) * (surface[index] ?? 0),
    ) as Rgb;
    const ratio = contrast(
      luminance(composited[0], composited[1], composited[2]),
      luminance(surface[0], surface[1], surface[2]),
    );
    return { ratio, surface, behind, color: styles.color };
  };
  await expect
    .poll(async () => (await measure()).ratio, {
      timeout: 15_000,
      intervals: [100, 250, 500],
      message: 'the language select text keeps 4.5:1 over the painted pill',
    })
    .toBeGreaterThanOrEqual(4.5);
  const result = await measure();
  const foreground = parseRenderedColor(result.color);
  expect(foreground.alpha).toBe(1);
  expect(foreground.rgb).toEqual([255, 255, 255]);
  return result;
}

/**
 * A failed artwork sample leaves an opaque token card with readable text.
 */
export async function expectHeroSamplingFallback(page: Page) {
  const readSurface = () =>
    page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>(
        '[data-registration-hero]',
      );
      const card = document.querySelector<HTMLElement>(
        '[data-registration-card="premium-centered"]',
      );
      const label = document.querySelector<HTMLElement>(
        'form label > span:first-child',
      );
      if (!stage || !card || !label)
        throw new Error('Hero fallback targets unavailable');
      const probeCard = document.createElement('span');
      probeCard.style.background = 'var(--color-card)';
      document.body.append(probeCard);
      const resolvedCard = getComputedStyle(probeCard).backgroundColor;
      probeCard.remove();
      const probeText = document.createElement('span');
      probeText.style.color = 'var(--color-text)';
      document.body.append(probeText);
      const resolvedText = getComputedStyle(probeText).color;
      probeText.remove();
      const cardBackground = getComputedStyle(card).backgroundColor;
      const labelColor = getComputedStyle(label).color;
      return {
        sampling: stage.dataset.photoSampling ?? '',
        statsReady: stage.dataset.photoStatsReady ?? '',
        photoTone: stage.dataset.photoTone ?? '',
        photoLuminance: stage.style.getPropertyValue('--hero-photo-luminance'),
        cardBackground,
        resolvedCard,
        labelColor,
        resolvedText,
        opaque: cardBackground === resolvedCard && labelColor === resolvedText,
      };
    });

  // The fallback surface is committed by React, so the assertion waits for
  // the opaque card to be painted instead of reading a pre-commit frame.
  await expect
    .poll(async () => (await readSurface()).opaque, {
      timeout: 15_000,
      intervals: [100, 250, 500],
      message: 'the sampling fallback card is painted opaque',
    })
    .toBe(true);

  const surface = await readSurface();
  expect(surface.sampling).toBe('fallback');
  expect(surface.statsReady).toBe('false');
  expect(surface.photoTone).toBe('');
  expect(surface.photoLuminance).toBe('');
  const card = parseRenderedColor(surface.cardBackground);
  expect(card.alpha).toBe(1);
  expect(surface.cardBackground).toBe(surface.resolvedCard);
  expect(surface.labelColor).toBe(surface.resolvedText);
  const ratio = contrast(
    cssLuminance(surface.labelColor),
    cssLuminance(surface.cardBackground),
  );
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  return { ratio, ...surface };
}

/** Approved prototype material contract for the glass card shell. */
export async function expectHeroMaterialContract(page: Page) {
  const card = page.locator('[data-registration-card="premium-centered"]');
  await expect(card).toHaveAttribute('data-material', 'liquid-glass-strong');
  const shell = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    const rim = getComputedStyle(element, '::before');
    return {
      overflow: style.overflow,
      borderWidth: style.borderTopWidth,
      radius: style.borderTopLeftRadius,
      rimDisplay: rim.display,
      rimRadius: rim.borderTopLeftRadius,
      rimBackground: rim.backgroundImage,
    };
  });
  expect(shell.overflow).toBe('hidden');
  expect(shell.borderWidth).toBe('0px');
  expect(shell.rimDisplay).toBe('block');
  expect(shell.rimRadius).toBe(shell.radius);
  expect(shell.rimBackground).toContain('linear-gradient');
}

/** Contrast evidence for the registration form's resolved theme surface. */
export async function expectHeroTextContrast(page: Page) {
  const surface = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(
      '[data-registration-card="premium-centered"]',
    );
    const label = document.querySelector<HTMLElement>(
      'form label > span:first-child',
    );
    const heading = document.querySelector<HTMLElement>('.formPlate h1, h1');
    const button = document.querySelector<HTMLButtonElement>(
      'form button[type="submit"]',
    );
    if (!card || !label || !heading || !button)
      throw new Error('Hero contrast targets unavailable');
    const root = getComputedStyle(document.documentElement);
    const buttonStyle = getComputedStyle(button);
    const tokenProbe = document.createElement('span');
    tokenProbe.style.backgroundColor = root
      .getPropertyValue('--color-card')
      .trim();
    tokenProbe.style.color = root.getPropertyValue('--color-text').trim();
    document.body.append(tokenProbe);
    const tokens = getComputedStyle(tokenProbe);
    const tokenCard = tokens.backgroundColor;
    const tokenText = tokens.color;
    tokenProbe.remove();
    return {
      labelColor: getComputedStyle(label).color,
      headingColor: getComputedStyle(heading).color,
      cardBackground: getComputedStyle(card).backgroundColor,
      buttonColor: buttonStyle.color,
      buttonBackground: buttonStyle.backgroundColor,
      tokenCard,
      tokenText,
    };
  });

  expect(surface.cardBackground).toBe(surface.tokenCard);
  expect(surface.labelColor).toBe(surface.tokenText);
  expect(surface.headingColor).toBe(surface.tokenText);
  expect(
    contrast(
      cssLuminance(surface.labelColor),
      cssLuminance(surface.cardBackground),
    ),
  ).toBeGreaterThanOrEqual(4.5);

  const buttonContrast = contrast(
    cssLuminance(surface.buttonColor),
    cssLuminance(surface.buttonBackground),
  );
  expect(buttonContrast).toBeGreaterThanOrEqual(4.5);
  return buttonContrast;
}

/** The registration card must use the resolved theme tokens regardless of artwork. */
export async function expectHeroResolvedThemeContract(page: Page) {
  const surface = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(
      '[data-registration-card="premium-centered"]',
    );
    const label = document.querySelector<HTMLElement>(
      'form label > span:first-child',
    );
    const heading = document.querySelector<HTMLElement>('.formPlate h1, h1');
    if (!card || !label || !heading)
      throw new Error('Hero resolved-theme targets unavailable');
    const root = getComputedStyle(document.documentElement);
    const tokenProbe = document.createElement('span');
    tokenProbe.style.backgroundColor = root
      .getPropertyValue('--color-card')
      .trim();
    tokenProbe.style.color = root.getPropertyValue('--color-text').trim();
    document.body.append(tokenProbe);
    const tokens = getComputedStyle(tokenProbe);
    const resolved = {
      card: tokens.backgroundColor,
      text: tokens.color,
    };
    tokenProbe.remove();
    return {
      cardBackground: getComputedStyle(card).backgroundColor,
      labelColor: getComputedStyle(label).color,
      headingColor: getComputedStyle(heading).color,
      tokenCard: resolved.card,
      tokenText: resolved.text,
      theme: document.documentElement.dataset.theme ?? 'system',
    };
  });

  expect(surface.cardBackground).toBe(surface.tokenCard);
  expect(surface.labelColor).toBe(surface.tokenText);
  expect(surface.headingColor).toBe(surface.tokenText);
  expect(
    contrast(
      cssLuminance(surface.labelColor),
      cssLuminance(surface.cardBackground),
    ),
  ).toBeGreaterThanOrEqual(4.5);
  return surface;
}

/** The floating preference controls remain one compact row on narrow phones. */
export async function expectHeroPreferencesSingleRow(page: Page) {
  const metrics = await page.evaluate(() => {
    const pill = document.querySelector<HTMLElement>(
      '[data-testid="registration-hero-preferences"]',
    );
    const language = pill?.querySelector<HTMLElement>(
      '[data-testid="language-select"]',
    )?.parentElement;
    const theme = pill?.querySelector<HTMLElement>('fieldset');
    if (!pill || !language || !theme)
      throw new Error('Hero preference pill controls unavailable');
    const pillRect = pill.getBoundingClientRect();
    const languageRect = language.getBoundingClientRect();
    const themeRect = theme.getBoundingClientRect();
    return {
      pillHeight: pillRect.height,
      pillLeft: pillRect.left,
      pillRight: pillRect.right,
      languageTop: languageRect.top,
      languageBottom: languageRect.bottom,
      themeTop: themeRect.top,
      themeBottom: themeRect.bottom,
      rowHeight: Math.max(languageRect.height, themeRect.height),
      pillScrollWidth: pill.scrollWidth,
      pillClientWidth: pill.clientWidth,
      paddingLeft: Number.parseFloat(getComputedStyle(pill).paddingLeft),
      paddingRight: Number.parseFloat(getComputedStyle(pill).paddingRight),
      languageLeft: languageRect.left,
      languageRight: languageRect.right,
      themeLeft: themeRect.left,
      themeRight: themeRect.right,
      themeOptionHeights: Array.from(
        theme.querySelectorAll<HTMLLabelElement>('label'),
      ).map((option) => option.getBoundingClientRect().height),
      themeOptionBounds: Array.from(
        theme.querySelectorAll<HTMLLabelElement>('label'),
      ).map((option) => {
        const rect = option.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
      childBounds: Array.from(pill.querySelectorAll<HTMLElement>('*'))
        .map((child) => {
          const rect = child.getBoundingClientRect();
          return {
            name:
              child.getAttribute('data-testid') ?? child.tagName.toLowerCase(),
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          };
        })
        .filter((bounds) => bounds.width >= 2 && bounds.height >= 2),
    };
  });
  expect(Math.abs(metrics.languageTop - metrics.themeTop)).toBeLessThanOrEqual(
    1,
  );
  expect(
    Math.abs(metrics.languageBottom - metrics.themeBottom),
  ).toBeLessThanOrEqual(1);
  expect(metrics.pillHeight).toBeLessThanOrEqual(metrics.rowHeight);
  expect(metrics.pillScrollWidth).toBeLessThanOrEqual(metrics.pillClientWidth);
  expect(metrics.languageLeft).toBeGreaterThanOrEqual(metrics.pillLeft);
  expect(metrics.languageRight).toBeLessThanOrEqual(metrics.pillRight);
  expect(metrics.themeLeft).toBeGreaterThanOrEqual(metrics.pillLeft);
  expect(metrics.themeRight).toBeLessThanOrEqual(metrics.pillRight);
  for (const height of metrics.themeOptionHeights)
    expect(height).toBeGreaterThanOrEqual(44);
  for (const bounds of metrics.themeOptionBounds) {
    expect(bounds.left).toBeGreaterThanOrEqual(
      metrics.pillLeft + metrics.paddingLeft,
    );
    expect(bounds.right).toBeLessThanOrEqual(
      metrics.pillRight - metrics.paddingRight,
    );
  }
  for (const bounds of metrics.childBounds) {
    expect(
      bounds.left,
      `${bounds.name} must clear the pill's left rounded inset`,
    ).toBeGreaterThanOrEqual(metrics.pillLeft + metrics.paddingLeft);
    expect(
      bounds.right,
      `${bounds.name} must clear the pill's right rounded inset`,
    ).toBeLessThanOrEqual(metrics.pillRight - metrics.paddingRight);
  }
  return {
    rows: 1,
    pillHeight: metrics.pillHeight,
    controlRowHeight: metrics.rowHeight,
    paddingLeft: metrics.paddingLeft,
    paddingRight: metrics.paddingRight,
    childInsets: metrics.childBounds.map((bounds) => ({
      name: bounds.name,
      left: bounds.left - metrics.pillLeft,
      right: metrics.pillRight - bounds.right,
    })),
  };
}

/** No-banner phone spacing keeps a full existing space-4 token below the pill. */
export async function expectHeroPreferencesGap(page: Page) {
  const metrics = await page.evaluate(() => {
    const pill = document.querySelector<HTMLElement>(
      '[data-testid="registration-hero-preferences"]',
    );
    const card = document.querySelector<HTMLElement>(
      '[data-registration-card="premium-centered"]',
    );
    if (!pill || !card) throw new Error('Hero spacing targets unavailable');
    const token = Number.parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--space-4')
        .trim(),
    );
    return {
      gap:
        card.getBoundingClientRect().top - pill.getBoundingClientRect().bottom,
      token,
    };
  });
  expect(metrics.token).toBeGreaterThan(0);
  expect(metrics.gap).toBeGreaterThanOrEqual(metrics.token);
  return metrics;
}

/** The primary action keeps its token fill and a visible boundary over art. */
export async function expectHeroButtonBoundary(page: Page) {
  await page.locator('form button[type="submit"]').scrollIntoViewIfNeeded();
  const geometry = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>(
      '[data-registration-hero]',
    );
    const button = document.querySelector<HTMLButtonElement>(
      'form button[type="submit"]',
    );
    if (!stage || !button) throw new Error('Hero submit button unavailable');
    const style = getComputedStyle(button);
    const root = getComputedStyle(document.documentElement);
    return {
      hasBanner: stage.dataset.hasBanner === 'true',
      background: style.backgroundColor,
      borderColor: style.borderTopColor,
      borderStyle: style.borderTopStyle,
      borderWidth: style.borderTopWidth,
      brandFill: root.getPropertyValue('--brand-fill').trim(),
      x:
        button.getBoundingClientRect().x +
        button.getBoundingClientRect().width / 2,
      y: button.getBoundingClientRect().y,
    };
  });
  if (!geometry.hasBanner) return null;
  expect(geometry.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(geometry.borderStyle).toBe('solid');
  expect(Number.parseFloat(geometry.borderWidth)).toBeGreaterThanOrEqual(1);
  expect(geometry.brandFill).not.toBe('');
  const image = await page.screenshot();
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  const x = Math.min(dimensions.width - 1, Math.max(0, Math.round(geometry.x)));
  const borderY = Math.min(
    dimensions.height - 1,
    Math.max(0, Math.round(geometry.y)),
  );
  const backdropY = Math.max(0, borderY - 4);
  const borderColor = pixelHex(screenshotPixel(image, x, borderY));
  const ringColor = pixelHex(
    screenshotPixel(image, x, Math.max(0, borderY - 1)),
  );
  const faceColor = pixelHex(
    screenshotPixel(image, x, Math.min(dimensions.height - 1, borderY + 2)),
  );
  const backdropColor = pixelHex(screenshotPixel(image, x, backdropY));
  const fillEdgeRatio = contrast(
    cssLuminance(`#${faceColor}`),
    cssLuminance(`#${backdropColor}`),
  );
  const outerEdgeRatio = contrast(
    cssLuminance(`#${ringColor}`),
    cssLuminance(`#${backdropColor}`),
  );
  const faceEdgeRatio = contrast(
    cssLuminance(`#${borderColor}`),
    cssLuminance(`#${faceColor}`),
  );
  const ratio = Math.max(fillEdgeRatio, outerEdgeRatio, faceEdgeRatio);
  expect(fillEdgeRatio).toBeGreaterThanOrEqual(3);
  expect(ratio).toBeGreaterThanOrEqual(3);
  return {
    ratio,
    fillEdgeRatio,
    outerEdgeRatio,
    faceEdgeRatio,
    borderColor: `#${borderColor}`,
    ringColor: `#${ringColor}`,
    backdropColor: `#${backdropColor}`,
  };
}

/** Interactive controls keep the 44px touch minimum. */
export async function expectHeroTouchTargets(page: Page) {
  const targets = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        'form input:not([type="hidden"]), form select, form button[type="submit"]',
      ),
    )
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: element.getAttribute('name') ?? element.tagName.toLowerCase(),
          height: rect.height,
          width: rect.width,
        };
      })
      .filter((target) => target.width > 0 && target.height > 0),
  );
  expect(targets.length).toBeGreaterThan(4);
  for (const target of targets)
    expect(target.height, `${target.name} touch height`).toBeGreaterThanOrEqual(
      44,
    );
}

/** The focused control shows the approved brand-ring focus indicator. */
export async function expectHeroFocusRing(page: Page) {
  const input = page.locator('input[name="name"]');
  await input.focus();
  const ring = await input.evaluate((element) => {
    const control = element.parentElement;
    if (!control) return null;
    const after = getComputedStyle(control, '::after');
    return {
      content: after.content,
      borderWidth: after.borderTopWidth,
      borderStyle: after.borderTopStyle,
      inputOutline: getComputedStyle(element).outlineStyle,
    };
  });
  expect(ring).not.toBeNull();
  expect(ring!.content).not.toBe('none');
  expect(ring!.borderWidth).toBe('2px');
  expect(ring!.borderStyle).toBe('solid');
  expect(ring!.inputOutline).toBe('none');
  // Leave the surface in its resting state for the matrix capture.
  await input.evaluate((element) => element.blur());
}

/** Measure the filled-button boundary without changing the existing helper. */
export async function measureHeroButtonBoundary(page: Page) {
  await page.locator('form button[type="submit"]').scrollIntoViewIfNeeded();
  const geometry = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>(
      '[data-registration-hero]',
    );
    const button = document.querySelector<HTMLButtonElement>(
      'form button[type="submit"]',
    );
    if (!stage || !button) throw new Error('Hero submit button unavailable');
    const style = getComputedStyle(button);
    const root = getComputedStyle(document.documentElement);
    return {
      hasBanner: stage.dataset.hasBanner === 'true',
      background: style.backgroundColor,
      borderColor: style.borderTopColor,
      borderStyle: style.borderTopStyle,
      borderWidth: style.borderTopWidth,
      brandFill: root.getPropertyValue('--brand-fill').trim(),
      x:
        button.getBoundingClientRect().x +
        button.getBoundingClientRect().width / 2,
      y: button.getBoundingClientRect().y,
    };
  });
  if (!geometry.hasBanner) return null;
  const image = await page.screenshot();
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  const x = Math.min(dimensions.width - 1, Math.max(0, Math.round(geometry.x)));
  const borderY = Math.min(
    dimensions.height - 1,
    Math.max(0, Math.round(geometry.y)),
  );
  const backdropY = Math.max(0, borderY - 4);
  const borderColor = pixelHex(screenshotPixel(image, x, borderY));
  const ringColor = pixelHex(
    screenshotPixel(image, x, Math.max(0, borderY - 1)),
  );
  const faceColor = pixelHex(
    screenshotPixel(image, x, Math.min(dimensions.height - 1, borderY + 2)),
  );
  const backdropColor = pixelHex(screenshotPixel(image, x, backdropY));
  const fillEdgeRatio = contrast(
    cssLuminance(`#${faceColor}`),
    cssLuminance(`#${backdropColor}`),
  );
  const outerEdgeRatio = contrast(
    cssLuminance(`#${ringColor}`),
    cssLuminance(`#${backdropColor}`),
  );
  const faceEdgeRatio = contrast(
    cssLuminance(`#${borderColor}`),
    cssLuminance(`#${faceColor}`),
  );
  return {
    ratio: Math.max(fillEdgeRatio, outerEdgeRatio, faceEdgeRatio),
    fillEdgeRatio,
    outerEdgeRatio,
    faceEdgeRatio,
    borderColor: `#${borderColor}`,
    ringColor: `#${ringColor}`,
    backdropColor: `#${backdropColor}`,
  };
}

export type HeroGlisseContrastEvidence = {
  body: number;
  label: number;
  link: number | null;
  button: number;
  minText: number;
  fieldBorder: number;
  focusRing: number;
  minNonText: number;
};

function composite(foreground: Rgb, alpha: number, background: Rgb): Rgb {
  return foreground.map(
    (channel, index) =>
      alpha * channel + (1 - alpha) * (background[index] ?? 0),
  ) as Rgb;
}

function pointsForRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const xPoints = Array.from({ length: 7 }, (_, index) =>
    Math.round(rect.x + (rect.width * index) / 6),
  );
  const yPoints = Array.from({ length: 3 }, (_, index) =>
    Math.round(rect.y + (rect.height * index) / 2),
  );
  return yPoints.flatMap((y) => xPoints.map((x) => ({ x, y })));
}

function minimumTextContrast(color: string, samples: Rgb[]) {
  const foreground = parseRenderedColor(color);
  return Math.min(
    ...samples.map((backdrop) =>
      contrast(
        luminance(...composite(foreground.rgb, foreground.alpha, backdrop)),
        luminance(backdrop[0], backdrop[1], backdrop[2]),
      ),
    ),
  );
}

/**
 * Measure the rendered contrast of the production hero controls over the
 * translucent Glisse card. Text pixels are temporarily hidden so the samples
 * contain the actual card/artwork composite, including the 8px backdrop blur.
 */
export async function measureHeroGlisseContrast(
  page: Page,
): Promise<HeroGlisseContrastEvidence> {
  const heading = page.locator('.formPlate h1, h1').first();
  const label = page.locator('form label > span:first-child').first();
  const button = page.locator('form button[type="submit"]').first();
  const link = page.locator('.formPlate a, form a').first();

  await heading.scrollIntoViewIfNeeded();
  const headingBox = await heading.boundingBox();
  if (!headingBox) throw new Error('Hero heading is not measurable');
  const headingBackdrop = await renderedBackdrop(
    page,
    heading,
    pointsForRect(headingBox),
  );
  const body = minimumTextContrast(
    headingBackdrop.color,
    headingBackdrop.samples,
  );

  await label.scrollIntoViewIfNeeded();
  const labelBox = await label.boundingBox();
  if (!labelBox) throw new Error('Hero label is not measurable');
  const labelBackdrop = await renderedBackdrop(
    page,
    label,
    pointsForRect(labelBox),
  );
  const labelRatio = minimumTextContrast(
    labelBackdrop.color,
    labelBackdrop.samples,
  );

  let linkRatio: number | null = null;
  if (await link.count()) {
    await link.scrollIntoViewIfNeeded();
    const linkBox = await link.boundingBox();
    if (!linkBox) throw new Error('Hero link is not measurable');
    const linkBackdrop = await renderedBackdrop(
      page,
      link,
      pointsForRect(linkBox),
    );
    linkRatio = minimumTextContrast(linkBackdrop.color, linkBackdrop.samples);
  }

  await button.scrollIntoViewIfNeeded();
  const buttonEvidence = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    const color = style.color;
    const range = document.createRange();
    range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    const previousColor = element.style.color;
    const previousFill = element.style.webkitTextFillColor;
    element.style.color = 'transparent';
    element.style.webkitTextFillColor = 'transparent';
    return {
      color,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      previousColor,
      previousFill,
    };
  });
  const buttonPng = await page.screenshot();
  await button.evaluate(
    (element, restore) => {
      element.style.color = restore.color;
      element.style.webkitTextFillColor = restore.fill;
    },
    {
      color: buttonEvidence.previousColor,
      fill: buttonEvidence.previousFill,
    },
  );
  const buttonSamples = pointsForRect(buttonEvidence.rect).map((point) =>
    screenshotPixel(buttonPng, point.x, point.y),
  ) as Rgb[];
  const buttonRatio = minimumTextContrast(buttonEvidence.color, buttonSamples);

  const focusInput = page.locator('input[name="name"]');
  await focusInput.scrollIntoViewIfNeeded();
  await focusInput.focus();
  await page.waitForTimeout(100);
  const nonText = await page.evaluate(() => {
    const field = document.querySelector<HTMLElement>(
      'form label > span:nth-child(2)',
    );
    if (!field) throw new Error('Hero non-text targets unavailable');
    const fieldStyle = getComputedStyle(field);
    const ringStyle = getComputedStyle(field, '::after');
    const root = getComputedStyle(document.documentElement);
    const rect = field.getBoundingClientRect();
    const tokenProbe = document.createElement('span');
    tokenProbe.style.backgroundColor = root
      .getPropertyValue('--color-card')
      .trim();
    tokenProbe.style.color = root
      .getPropertyValue('--color-border-strong')
      .trim();
    document.body.append(tokenProbe);
    const tokens = getComputedStyle(tokenProbe);
    const tokenCard = tokens.backgroundColor;
    const tokenBorder = tokens.color;
    tokenProbe.remove();
    return {
      borderColor: tokenBorder,
      fieldBackground: root.getPropertyValue('--color-card-raised').trim(),
      ringColor: ringStyle.borderTopColor,
      ringWidth: ringStyle.borderTopWidth,
      tokenCard,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      fieldBackgroundColor: fieldStyle.backgroundColor,
    };
  });
  const focusPng = await page.screenshot();
  const focusX = Math.max(
    0,
    Math.round(nonText.rect.x + nonText.rect.width / 2),
  );
  const ringY = Math.max(0, Math.floor(nonText.rect.y) - 1);
  const innerY = Math.max(0, Math.ceil(nonText.rect.y) + 3);
  const outerY = Math.max(0, Math.floor(nonText.rect.y) - 5);
  const ringPixel = screenshotPixel(focusPng, focusX, ringY) as Rgb;
  const innerPixel = screenshotPixel(focusPng, focusX, innerY) as Rgb;
  const outerPixel = screenshotPixel(focusPng, focusX, outerY) as Rgb;
  const fieldBorder = contrast(
    cssLuminance(nonText.borderColor),
    cssLuminance(nonText.fieldBackground),
  );
  const focusRing = Math.min(
    contrast(
      luminance(ringPixel[0], ringPixel[1], ringPixel[2]),
      luminance(innerPixel[0], innerPixel[1], innerPixel[2]),
    ),
    contrast(
      luminance(ringPixel[0], ringPixel[1], ringPixel[2]),
      luminance(outerPixel[0], outerPixel[1], outerPixel[2]),
    ),
  );
  await page
    .locator('input[name="name"]')
    .evaluate((element) => element.blur());

  const minText = Math.min(body, labelRatio, buttonRatio);
  const minNonText = Math.min(fieldBorder, focusRing);
  return {
    body,
    label: labelRatio,
    link: linkRatio,
    button: buttonRatio,
    minText,
    fieldBorder,
    focusRing,
    minNonText,
  };
}
