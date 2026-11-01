import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
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
export const heroEvidenceDirectory = join(
  tmpdir(),
  'lifter-s24-hero-matrix-r4',
);

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

function cssLuminance(color: string) {
  const hex = color.match(/^#([\da-f]{6})$/i)?.[1];
  if (hex) {
    return luminance(
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    );
  }
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3)
    throw new Error(`Unsupported rendered color: ${color}`);
  return luminance(channels[0]!, channels[1]!, channels[2]!);
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

/**
 * Contrast evidence for the hero surface.
 *
 * Glass mode: the white form text sits on the dimmed photo. The hero samples
 * the luminance behind the card (`--hero-photo-luminance`) and applies the
 * approved adaptive dimming, so the effective backdrop luminance is the
 * sampled value scaled by the remaining transparency.
 *
 * Token mode (no artwork, or a bright photo in the light theme): the form
 * text uses the theme tokens, so the token pair is measured directly.
 */
export async function expectHeroTextContrast(page: Page) {
  const surface = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>(
      '[data-registration-hero]',
    );
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
    if (!stage || !card || !label || !heading || !button)
      throw new Error('Hero contrast targets unavailable');
    const root = getComputedStyle(document.documentElement);
    const buttonStyle = getComputedStyle(button);
    const tokenText = root.getPropertyValue('--color-text').trim();
    const probe = document.createElement('span');
    probe.style.color = tokenText;
    document.body.append(probe);
    const resolvedTokenText = getComputedStyle(probe).color;
    probe.remove();
    return {
      hasBanner: stage.dataset.hasBanner === 'true',
      theme: document.documentElement.dataset.theme ?? '',
      photoTone: stage.dataset.photoTone ?? '',
      photoLuminance: Number(
        stage.style.getPropertyValue('--hero-photo-luminance'),
      ),
      adaptiveDimming: Number(
        stage.style.getPropertyValue('--hero-adaptive-dimming'),
      ),
      labelColor: getComputedStyle(label).color,
      headingColor: getComputedStyle(heading).color,
      cardBackground: getComputedStyle(card).backgroundColor,
      buttonColor: buttonStyle.color,
      buttonBackground: buttonStyle.backgroundColor,
      buttonBorderColor: buttonStyle.borderTopColor,
      buttonBorderStyle: buttonStyle.borderTopStyle,
      buttonBorderWidth: buttonStyle.borderTopWidth,
      tokenTextColor: resolvedTokenText,
    };
  });

  const buttonContrast = contrast(
    cssLuminance(surface.buttonColor),
    cssLuminance(surface.buttonBackground),
  );
  expect(buttonContrast).toBeGreaterThanOrEqual(4.5);

  const tokenMode =
    !surface.hasBanner ||
    (surface.theme === 'light' && surface.photoTone === 'bright');
  if (tokenMode) {
    expect(surface.labelColor).toBe(surface.tokenTextColor);
    expect(surface.headingColor).toBe(surface.tokenTextColor);
    expect(
      contrast(
        cssLuminance(surface.labelColor),
        cssLuminance(surface.cardBackground),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    return buttonContrast;
  }

  expect(surface.labelColor).toBe('rgb(255, 255, 255)');
  expect(surface.headingColor).toBe('rgb(255, 255, 255)');
  expect(Number.isFinite(surface.photoLuminance)).toBe(true);
  expect(surface.adaptiveDimming).toBeGreaterThanOrEqual(0);
  expect(surface.adaptiveDimming).toBeLessThanOrEqual(0.72);
  const effectiveLuminance =
    surface.photoLuminance * (1 - surface.adaptiveDimming);
  expect(
    contrast(cssLuminance(surface.labelColor), effectiveLuminance),
  ).toBeGreaterThanOrEqual(4.5);
  return buttonContrast;
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
    cssLuminance(`#${borderColor}`),
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
