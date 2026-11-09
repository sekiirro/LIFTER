import { getTestCookieOrigin } from './test-origin.mjs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

for (const locale of ['ar', 'en'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    test(`${locale} / ${theme} has no serious or critical accessibility violations`, async ({
      page,
      context,
    }) => {
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, url: getTestCookieOrigin() },
        { name: THEME_COOKIE, value: theme, url: getTestCookieOrigin() },
      ]);
      await page.goto('/showcase');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const scan = () =>
        new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
      const results = await scan();
      expect(
        results.violations.filter(
          (item) => item.impact === 'serious' || item.impact === 'critical',
        ),
      ).toEqual([]);
      // Scan the native modal in the top layer as well as the resting showcase.
      await page.getByTestId('dialog-trigger').click();
      await expect(page.getByTestId('dialog-cancel')).toBeFocused();
      const modal = await scan();
      expect(
        modal.violations.filter(
          (item) => item.impact === 'serious' || item.impact === 'critical',
        ),
      ).toEqual([]);
    });
  }
}
