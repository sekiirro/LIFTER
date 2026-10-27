import { expect, test } from '@playwright/test';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { modes } from '../../lib/design/tokens';

const url = 'http://localhost:3000';
function rgb(hex: string) {
  return `rgb(${[1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(', ')})`;
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`device ${colorScheme}`, () => {
    test.use({ colorScheme });
    test('uses device colors without a theme cookie and serves the enabled showcase', async ({
      page,
      context,
    }) => {
      expect(await context.cookies()).toEqual([]);
      const response = await page.goto('/showcase');
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).not.toHaveAttribute('data-theme');
      await expect(page.locator('body')).toHaveCSS(
        'background-color',
        rgb(modes[colorScheme].bg),
      );
    });
  });
}

test.describe('manual preferences', () => {
  test.use({ colorScheme: 'light' });
  test('persists dark and restores the live device preference', async ({
    page,
    context,
  }) => {
    await page.goto('/showcase');
    await page.getByTestId('theme-dark').check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      rgb(modes.dark.bg),
    );
    await expect
      .poll(
        async () =>
          (await context.cookies()).find(
            (cookie) => cookie.name === THEME_COOKIE,
          )?.value,
      )
      .toBe('dark');
    await page.reload();
    await expect(page.getByTestId('theme-dark')).toBeChecked();
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      rgb(modes.dark.bg),
    );
    await page.getByTestId('theme-system').check();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect
      .poll(async () =>
        (await context.cookies()).some(
          (cookie) => cookie.name === THEME_COOKIE,
        ),
      )
      .toBe(false);
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      rgb(modes.light.bg),
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      rgb(modes.dark.bg),
    );
  });
  test('defaults to Arabic and persists English after switching', async ({
    page,
    context,
  }) => {
    await page.goto('/showcase');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByTestId('language-select').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect
      .poll(
        async () =>
          (await context.cookies()).find(
            (cookie) => cookie.name === LOCALE_COOKIE,
          )?.value,
      )
      .toBe('en');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });
});

test.describe('server first paint without JavaScript', () => {
  test.use({ javaScriptEnabled: false, colorScheme: 'light' });
  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['dark', 'light'] as const) {
      test(`${locale} / ${theme} cookies are already reflected in response HTML`, async ({
        page,
        context,
      }) => {
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url },
          { name: THEME_COOKIE, value: theme, url },
        ]);
        const response = await page.goto('/showcase');
        expect(response?.status()).toBe(200);
        const html = (await response!.text()).match(/<html\b[^>]*>/)?.[0];
        expect(html).toContain(`lang="${locale}"`);
        expect(html).toContain(`dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`);
        expect(html).toContain(`data-theme="${theme}"`);
        await expect(page.locator('body')).toHaveCSS(
          'background-color',
          rgb(modes[theme].bg),
        );
      });
    }
  }
});
