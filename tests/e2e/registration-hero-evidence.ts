import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  'lifter-s23-hero-matrix-r2',
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
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3)
    throw new Error(`Unsupported rendered color: ${color}`);
  return luminance(channels[0]!, channels[1]!, channels[2]!);
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
    return;
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
