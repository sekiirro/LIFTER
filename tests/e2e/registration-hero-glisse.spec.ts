import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import {
  expectHeroAxeClean,
  expectHeroButtonBoundary,
  expectHeroMaterialContract,
  expectHeroTextBackdropContrast,
  expectHeroTextContrast,
  measureHeroButtonBoundary,
  measureHeroGlisseContrast,
} from './registration-hero-evidence';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const heroPath = '/showcase/f14-hero';

type RenderedColor = {
  channels: [number, number, number];
  alpha: number;
};

function renderedColor(value: string): RenderedColor {
  const colorFunction = value.match(
    /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/,
  );
  if (colorFunction) {
    return {
      channels: [
        Number(colorFunction[1]) * 255,
        Number(colorFunction[2]) * 255,
        Number(colorFunction[3]) * 255,
      ],
      alpha: colorFunction[4] === undefined ? 1 : Number(colorFunction[4]),
    };
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/);
  if (!rgb) throw new Error(`Unsupported rendered color: ${value}`);
  const parts = (rgb[1] ?? '')
    .split(/[,/ ]+/)
    .filter(Boolean)
    .map(Number);
  return {
    channels: [parts[0]!, parts[1]!, parts[2]!],
    alpha: parts[3] ?? 1,
  };
}

async function readHeroCard(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>(
      '[data-registration-hero]',
    );
    const card = document.querySelector<HTMLElement>(
      '[data-registration-card="premium-centered"]',
    );
    if (!stage || !card) throw new Error('Hero card targets unavailable');
    const style = getComputedStyle(card);
    const tokenProbe = document.createElement('span');
    tokenProbe.style.backgroundColor = 'var(--color-card)';
    document.body.append(tokenProbe);
    const tokenCard = getComputedStyle(tokenProbe).backgroundColor;
    tokenProbe.remove();
    return {
      theme: document.documentElement.dataset.theme ?? 'system',
      background: style.backgroundColor,
      backdropFilter:
        style.backdropFilter ||
        style.getPropertyValue('-webkit-backdrop-filter'),
      borderWidth: style.borderTopWidth,
      overflow: style.overflow,
      tokenCard,
      hasBanner: stage.dataset.hasBanner,
      photoReady: stage.dataset.photoStatsReady,
      sampling: stage.dataset.photoSampling,
    };
  });
}

async function expectTranslucentGlass(page: Page) {
  await expect(page.locator('[data-registration-hero]')).toHaveAttribute(
    'data-photo-stats-ready',
    'true',
  );
  const card = await readHeroCard(page);
  expect(card.hasBanner).toBe('true');
  expect(card.photoReady).toBe('true');
  expect(card.sampling).not.toBe('fallback');
  const fill = renderedColor(card.background);
  expect(fill.alpha).toBeGreaterThan(0);
  expect(fill.alpha).toBeLessThan(1);
  expect(card.backdropFilter).toContain('blur(8px)');
  expect(card.backdropFilter).not.toBe('none');
  return { card, fill };
}

/**
 * The approved solid fallback swaps the glass shell for the opaque token card
 * and a visible token border, so the enhanced material contract (borderless
 * rim) intentionally does not apply here.
 */
async function expectSolidFallbackShell(page: Page, borderWidth = '2px') {
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
  expect(shell.borderWidth).toBe(borderWidth);
  expect(shell.rimDisplay).toBe('block');
  expect(shell.rimRadius).toBe(shell.radius);
  expect(shell.rimBackground).toContain('linear-gradient');
}

async function setTheme(
  context: BrowserContext,
  theme: 'light' | 'dark' | null,
  locale: 'ar' | 'en' = 'en',
) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      get: () => 8,
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      get: () => 8,
    });
  });
  await context.clearCookies();
  const cookies: { name: string; value: string; url: string }[] = [
    { name: LOCALE_COOKIE, value: locale, url: origin },
  ];
  if (theme) cookies.push({ name: THEME_COOKIE, value: theme, url: origin });
  await context.addCookies(cookies);
}

test('hero keeps a translucent Glisse tint that follows the light and dark themes', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setTheme(context, 'light');
  await page.goto(heroPath);
  await expect(page.locator('[data-registration-hero]')).toHaveAttribute(
    'data-has-banner',
    'true',
  );

  const light = await expectTranslucentGlass(page);
  expect(light.card.theme).toBe('light');
  expect(light.fill.channels[0]).toBeGreaterThan(200);
  await expectHeroMaterialContract(page);
  await expectHeroTextBackdropContrast(page);
  await expectHeroAxeClean(page);

  await setTheme(context, 'dark');
  await page.reload();
  await expect(page.locator('[data-registration-hero]')).toHaveAttribute(
    'data-has-banner',
    'true',
  );
  const dark = await expectTranslucentGlass(page);
  expect(dark.card.theme).toBe('dark');
  expect(dark.fill.channels[0]).toBeLessThan(80);
  expect(dark.card.background).not.toBe(light.card.background);
  await expectHeroMaterialContract(page);
  await expectHeroTextBackdropContrast(page);
  await expectHeroAxeClean(page);
});

test('follow-device resolves the Glisse tint from the operating system', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setTheme(context, null);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(heroPath);
  const light = await expectTranslucentGlass(page);
  expect(light.card.theme).toBe('system');
  expect(light.fill.channels[0]).toBeGreaterThan(200);
  const lightError = await page
    .locator('[data-registration-hero]')
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        foreground: style.getPropertyValue('--hero-error-fg').trim(),
        lightToken: style.getPropertyValue('--color-error-fg').trim(),
      };
    });
  expect(lightError.foreground).toBe(lightError.lightToken);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  const dark = await expectTranslucentGlass(page);
  expect(dark.card.theme).toBe('system');
  expect(dark.fill.channels[0]).toBeLessThan(80);
  expect(dark.card.background).not.toBe(light.card.background);
  const darkError = await page
    .locator('[data-registration-hero]')
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        foreground: style.getPropertyValue('--hero-error-fg').trim(),
        darkToken: style.getPropertyValue('--hero-dark-error-fg').trim(),
      };
    });
  expect(darkError.foreground).toBe(darkError.darkToken);
});

test('reduced transparency replaces the Glisse tint with the opaque token card', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setTheme(context, 'light');
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  });
  await page.goto(heroPath);
  await expect(
    page.locator('[data-registration-card="premium-centered"]'),
  ).toHaveAttribute('data-glass-runtime', 'static');

  const card = await readHeroCard(page);
  expect(card.background).toBe(card.tokenCard);
  expect(renderedColor(card.background).alpha).toBe(1);
  expect(card.backdropFilter).toBe('none');
  expect(card.borderWidth).toBe('2px');
  await expectSolidFallbackShell(page);
  await expectHeroAxeClean(page);
});

test('increased contrast replaces the Glisse tint with the opaque token card', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setTheme(context, 'dark');
  await page.emulateMedia({ contrast: 'more' });
  await page.goto(heroPath);
  await expect(
    page.locator('[data-registration-card="premium-centered"]'),
  ).toHaveAttribute('data-glass-runtime', 'static');

  const card = await readHeroCard(page);
  expect(card.background).toBe(card.tokenCard);
  expect(renderedColor(card.background).alpha).toBe(1);
  expect(card.backdropFilter).toBe('none');
  expect(card.borderWidth).toBe('2px');
  await expectSolidFallbackShell(page);
  await expectHeroAxeClean(page);
});

test('reduced motion keeps the opaque token card without a backdrop filter', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme(context, 'light');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(heroPath);
  await expect(
    page.locator('[data-registration-card="premium-centered"]'),
  ).toHaveAttribute('data-glass-runtime', 'static');

  const card = await readHeroCard(page);
  expect(card.background).toBe(card.tokenCard);
  expect(renderedColor(card.background).alpha).toBe(1);
  expect(card.backdropFilter).toBe('none');
  await expectHeroMaterialContract(page);
  await expectHeroAxeClean(page);
});

test('print keeps the card on the resolved theme token', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme(context, 'dark');
  await page.goto(heroPath);
  await page.emulateMedia({ media: 'print' });

  const card = await readHeroCard(page);
  expect(card.background).toBe(card.tokenCard);
  expect(renderedColor(card.background).alpha).toBe(1);
  // The print stylesheet also resets the backdrop filter, but Chromium drops
  // the unprefixed declaration from CSS modules and ignores the -webkit- one.
  // Behind an opaque fill the remaining blur cannot change the printed pixels,
  // so the printed surface is asserted through the opaque token contract.
  await expect(page.locator('[data-registration-banner]')).toBeHidden();
  await expectSolidFallbackShell(page, '1px');
  await expectHeroTextContrast(page);
  await expectHeroAxeClean(page);
});

test('print clears the desktop no-artwork glass frame transform', async ({
  page,
}) => {
  const stylesheet = await readFile(
    join(process.cwd(), 'components/branding/registration-hero.module.css'),
    'utf8',
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(
    `<style>${stylesheet}</style><main class="stage noArtwork"><div class="glassFrame"><div class="glassCard"></div></div></main>`,
  );
  const frameTransform = () =>
    page
      .locator('.glassFrame')
      .evaluate((frame) => getComputedStyle(frame).transform);
  expect(await frameTransform()).not.toBe('none');
  await page.emulateMedia({ media: 'print' });
  expect(await frameTransform()).toBe('none');
});

const contrastEvidenceDirectory =
  process.env.HERO_GLISSE_CONTRAST_DIR ??
  join(tmpdir(), 'lifter-s29-hero-glisse', 'contrast');

const artworkFixtures = {
  current: null,
  bright: 'public/dev/f14-hero/worst-bright-variance.png',
  dark: 'public/dev/f14-hero/worst-dark.png',
} as const;

type ArtworkName = keyof typeof artworkFixtures;
type ContrastTheme = {
  name: 'Light' | 'Dark' | 'Follow OS light' | 'Follow OS dark';
  cookie: 'light' | 'dark' | null;
  os: 'light' | 'dark';
};

const contrastThemes: ContrastTheme[] = [
  { name: 'Light', cookie: 'light', os: 'light' },
  { name: 'Dark', cookie: 'dark', os: 'dark' },
  { name: 'Follow OS light', cookie: null, os: 'light' },
  { name: 'Follow OS dark', cookie: null, os: 'dark' },
];

async function routeArtwork(page: Page, artwork: ArtworkName) {
  const fixture = artworkFixtures[artwork];
  if (!fixture) return;
  const body = await readFile(join(process.cwd(), fixture));
  await page.route('**/dev/f14-hero/desktop.webp', async (route) => {
    await route.fulfill({ body, contentType: 'image/png' });
  });
}

for (const artwork of Object.keys(artworkFixtures) as ArtworkName[]) {
  for (const theme of contrastThemes) {
    for (const locale of ['ar', 'en'] as const) {
      for (const width of [390, 1440] as const) {
        test(`Glisse contrast: ${theme.name} / ${locale} / ${width} / ${artwork}`, async ({
          page,
          context,
        }) => {
          await page.setViewportSize({ width, height: 844 });
          await page.emulateMedia({ colorScheme: theme.os });
          await setTheme(context, theme.cookie, locale);
          await routeArtwork(page, artwork);
          await page.goto(heroPath);

          await expect(
            page.locator('[data-registration-hero]'),
          ).toHaveAttribute('data-has-banner', 'true');
          await expectTranslucentGlass(page);
          await expectHeroMaterialContract(page);
          await expectHeroTextBackdropContrast(page);

          const text = await measureHeroGlisseContrast(page);
          const boundary = await measureHeroButtonBoundary(page);
          let boundaryHelperFailure: string | null = null;
          try {
            await expectHeroButtonBoundary(page);
          } catch (error) {
            boundaryHelperFailure =
              error instanceof Error ? error.message : String(error);
          }

          const record = {
            theme: theme.name,
            locale,
            width,
            artwork,
            ...text,
            fillEdgeRatio: boundary?.fillEdgeRatio ?? 0,
            boundaryHelperFailure,
          };
          const fileName = [
            theme.name.replaceAll(' ', '-').toLowerCase(),
            locale,
            width,
            artwork,
          ].join('-');
          await mkdir(contrastEvidenceDirectory, { recursive: true });
          await writeFile(
            join(contrastEvidenceDirectory, `${fileName}.json`),
            `${JSON.stringify(record, null, 2)}\n`,
            'utf8',
          );

          expect(text.body, 'body text contrast').toBeGreaterThanOrEqual(4.5);
          expect(text.label, 'label text contrast').toBeGreaterThanOrEqual(4.5);
          expect(text.button, 'button text contrast').toBeGreaterThanOrEqual(
            4.5,
          );
          if (text.link !== null)
            expect(text.link, 'link text contrast').toBeGreaterThanOrEqual(4.5);
          expect(text.minText, 'minimum text contrast').toBeGreaterThanOrEqual(
            4.5,
          );
          expect(
            text.fieldBorder,
            'field border contrast',
          ).toBeGreaterThanOrEqual(3);
          expect(text.focusRing, 'focus ring contrast').toBeGreaterThanOrEqual(
            3,
          );
          expect(
            text.minNonText,
            'minimum non-text contrast',
          ).toBeGreaterThanOrEqual(3);
          expect(boundary).not.toBeNull();
          expect(boundary!.fillEdgeRatio).toBeGreaterThanOrEqual(3);
        });
      }
    }
  }
}
