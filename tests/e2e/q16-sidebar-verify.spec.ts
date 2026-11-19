import { expect, test, type Page } from '@playwright/test';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

/**
 * T048 browser verification for the Q16 sidebar (FR-021/FR-028,
 * SC-009/SC-010). Uses the unauthenticated showcase shell page (LIFTER_SHOWCASE=1)
 * so no database or Supabase stack is required.
 *
 * Clauses: vertical/logical placement, icons-only default, hover and
 * keyboard-focus tooltips, and the glass static fallback that preserves the
 * focused navigation node.
 */
const origin = process.env.PLAYWRIGHT_BASE_URL!;

async function openShell(
  page: Page,
  locale: 'ar' | 'en',
  theme: 'light' | 'dark',
  width: number,
) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: theme });
  await page.context().addCookies([
    { name: LOCALE_COOKIE, value: locale, url: origin },
    { name: THEME_COOKIE, value: theme, url: origin },
  ]);
  await page.goto(new URL('/showcase/shell?role=trainer', origin).toString());
  const rail = page.getByTestId('nav-rail');
  await expect(rail).toBeVisible();
  return rail;
}

for (const locale of ['ar', 'en'] as const) {
  const m = getMessages(locale);
  for (const width of [1024, 1440] as const) {
    test.describe(`T048 Q16 ${locale} ${width}`, () => {
      test.use({ javaScriptEnabled: true });

      test('vertical inline-start placement, icons-only default, hover and keyboard-focus tooltips', async ({
        page,
      }, testInfo) => {
        test.skip(
          testInfo.project.name !== 'chromium',
          'Desktop Q16 assertions use chromium.',
        );
        const rail = await openShell(page, locale, 'light', width);
        await expect(page.getByTestId('bottom-bar')).toBeHidden();
        await expect(rail).toHaveAccessibleName(m['nav.label']);

        const links = rail.getByRole('link');
        await expect(links).toHaveCount(4);
        for (const key of [
          'home',
          'clients',
          'workout',
          'nutrition',
        ] as const) {
          const link = rail.locator(`[data-nav-key="${key}"]`);
          await expect(link).toHaveAccessibleName(m[`nav.${key}`]);
          expect(await link.locator('svg').count()).toBe(1);
          expect((await link.textContent())?.trim()).toBe('');
          await expect(page.getByTestId(`tooltip-${key}`)).toHaveAttribute(
            'data-visible',
            'false',
          );
        }

        const box = await rail.boundingBox();
        if (!box) throw new Error('Expected a visible vertical sidebar');
        expect(box.height).toBeLessThan(900 / 2);
        if (locale === 'en') expect(box.x + box.width).toBeLessThan(width / 3);
        else expect(box.x).toBeGreaterThan((2 * width) / 3);

        const trigger = rail.locator('[data-nav-key="home"]');
        const tooltip = page.getByTestId('tooltip-home');
        await expect(tooltip).toBeHidden();
        await trigger.hover();
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toHaveText(m['nav.home']);

        await page.mouse.move(0, 0);
        await expect(tooltip).toBeHidden();
        await page.keyboard.press('Tab');
        await expect(trigger).toBeFocused();
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toHaveText(m['nav.home']);
      });
    });
  }
}

test.describe('T048 glass fallback preserves the focused navigation node', () => {
  test.use({ javaScriptEnabled: true });

  test('over-budget init and explicit solid both fall back without replacing focus', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Desktop glass assertions use chromium.',
    );
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.context().addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
      { name: THEME_COOKIE, value: 'light', url: origin },
    ]);
    await page.addInitScript(() => {
      const nativeNow = Performance.prototype.now;
      Performance.prototype.now = function () {
        const elapsed = nativeNow.call(this);
        return (
          elapsed +
          (document.querySelector('[data-glass-init-start]') ? 200 : 0)
        );
      };
    });
    await page.goto(new URL('/showcase/shell?role=trainer', origin).toString());
    const rail = page.getByTestId('nav-rail');
    const link = rail.getByRole('link').first();
    const original = await link.elementHandle();
    if (!original) throw new Error('Expected a rail link node');
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await expect(rail).toHaveAttribute('data-glass-runtime', 'static', {
      timeout: 15_000,
    });
    expect(await original.evaluate((el) => el === document.activeElement)).toBe(
      true,
    );
    await page.keyboard.press('Tab');
    await expect(rail.getByRole('link').nth(1)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await original.evaluate((el) => el === document.activeElement)).toBe(
      true,
    );

    // Explicit solid fallback: static with no backdrop filter, focus intact.
    await page.goto(
      new URL('/showcase/shell?role=trainer&glass=solid', origin).toString(),
    );
    await expect(rail).toHaveAttribute('data-glass-fallback', 'solid');
    await expect(rail).toHaveCSS('backdrop-filter', 'none');
    const first = rail.getByRole('link').first();
    const originalSolid = await first.elementHandle();
    if (!originalSolid) throw new Error('Expected a rail link node');
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    expect(
      await originalSolid.evaluate((el) => el === document.activeElement),
    ).toBe(true);
  });
});
