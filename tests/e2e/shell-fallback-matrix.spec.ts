import { expect, test, type ElementHandle, type Page } from '@playwright/test';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

/**
 * T049 / FR-028 / SC-009 fallback matrix.
 *
 * For every FR-028 fallback condition, assert browser keyboard operation and
 * that the focused navigation DOM node stays the identical node across the
 * fallback. The over-budget condition is covered by shell-q16.spec.ts; this
 * file covers the remaining four conditions (unsupported capability, display
 * preferences, constrained-device state, explicit solid fallback).
 */
const origin = process.env.PLAYWRIGHT_BASE_URL!;
const shotDir = process.env.SHELL_SCREENSHOT_DIR;

async function setCookies(
  page: Page,
  locale: 'ar' | 'en',
  theme: 'light' | 'dark',
) {
  await page.context().addCookies([
    { name: LOCALE_COOKIE, value: locale, url: origin },
    { name: THEME_COOKIE, value: theme, url: origin },
  ]);
}

async function focusFirstRailLink(
  page: Page,
): Promise<ElementHandle<SVGElement | HTMLElement>> {
  const rail = page.getByTestId('nav-rail');
  await expect(rail).toBeVisible();
  const links = rail.getByRole('link');
  await expect(links).toHaveCount(4);
  await page.keyboard.press('Tab');
  const first = links.first();
  await expect(first).toBeFocused();
  const original = await first.elementHandle();
  if (!original) throw new Error('Expected a rail link node');
  return original;
}

/**
 * With the first rail link already focused, assert the fallback kept that
 * exact node focused and that keyboard operation still works afterwards.
 */
async function assertStaticAndIdentity(
  page: Page,
  original: ElementHandle<SVGElement | HTMLElement>,
  testName: string,
  locale: 'ar' | 'en',
) {
  const rail = page.getByTestId('nav-rail');
  const links = rail.getByRole('link');

  await expect(rail).toHaveAttribute('data-glass-runtime', 'static');
  await expect(links.first()).toBeFocused();

  // The fallback must not adopt/replace the focused navigation node.
  expect(await original.evaluate((el) => el === document.activeElement)).toBe(
    true,
  );

  // Keyboard operation is preserved: Tab/Shift+Tab still traverse the rail.
  await page.keyboard.press('Tab');
  await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(links.first()).toBeFocused();
  expect(await original.evaluate((el) => el === document.activeElement)).toBe(
    true,
  );

  if (shotDir) {
    await page.screenshot({
      path: join(shotDir, `fallback-${testName}-${locale}.png`),
      fullPage: true,
    });
  }
}

test.describe('FR-028 fallback matrix (T049)', () => {
  test.use({ javaScriptEnabled: true });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Fallback matrix assertions use desktop Chromium.',
    );
    await page.setViewportSize({ width: 1024, height: 900 });
  });

  test('unsupported capability -> static keeps focused node', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const native = CSS.supports.bind(CSS);
      CSS.supports = (...args: Parameters<typeof CSS.supports>) => {
        const query = args[0];
        if (
          typeof query === 'string' &&
          query.toLowerCase().includes('backdrop-filter')
        )
          return false;
        return native(...args);
      };
    });
    await setCookies(page, 'en', 'light');
    await page.goto(new URL('/showcase/shell?role=trainer', origin).toString());
    const original = await focusFirstRailLink(page);
    await assertStaticAndIdentity(
      page,
      original,
      'unsupported-capability',
      'en',
    );
  });

  for (const media of [
    { name: 'reduced-motion', value: { reducedMotion: 'reduce' as const } },
    { name: 'forced-colors', value: { forcedColors: 'active' as const } },
    { name: 'increased-contrast', value: { contrast: 'more' as const } },
  ]) {
    test(`display preference (${media.name}) -> static keeps focused node`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          configurable: true,
          value: 8,
        });
        Object.defineProperty(navigator, 'deviceMemory', {
          configurable: true,
          value: 8,
        });
      });
      await setCookies(page, 'ar', 'dark');
      await page.goto(
        new URL('/showcase/shell?role=trainer', origin).toString(),
      );
      const original = await focusFirstRailLink(page);

      // A live display-preference change flips the running surface to static.
      await page.emulateMedia(media.value);
      await assertStaticAndIdentity(
        page,
        original,
        `prefs-${media.name}`,
        'ar',
      );
    });
  }

  test('constrained-device state -> static keeps focused node', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        configurable: true,
        value: 2,
      });
      Object.defineProperty(navigator, 'deviceMemory', {
        configurable: true,
        value: 2,
      });
    });
    await setCookies(page, 'en', 'dark');
    await page.goto(new URL('/showcase/shell?role=trainer', origin).toString());
    const original = await focusFirstRailLink(page);
    await assertStaticAndIdentity(page, original, 'constrained-device', 'en');
  });

  test('explicit solid fallback -> static keeps focused node', async ({
    page,
  }) => {
    await setCookies(page, 'en', 'light');
    await page.goto(
      new URL('/showcase/shell?role=trainer&glass=solid', origin).toString(),
    );
    const rail = page.getByTestId('nav-rail');
    await expect(rail).toHaveAttribute('data-glass-fallback', 'solid');
    await expect(rail).toHaveCSS('backdrop-filter', 'none');
    const original = await focusFirstRailLink(page);
    await assertStaticAndIdentity(page, original, 'explicit-solid', 'en');
  });
});
