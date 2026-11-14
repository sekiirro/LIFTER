import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { LOCALE_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

const origin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
).origin;

for (const locale of ['ar', 'en'] as const) {
  test(`${locale}: login and recovery are accessible`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, url: origin },
    ]);
    const m = getMessages(locale);
    for (const path of [
      '/login',
      '/auth/recovery',
      '/auth/recovery?token_hash=fake&type=recovery',
    ]) {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute(
        'dir',
        locale === 'ar' ? 'rtl' : 'ltr',
      );
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    await expect(
      page.getByRole('button', { name: m['auth.continue'], exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: m['auth.continue'], exact: true })
      .click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      m['auth.invalid_link'],
    );
  });
}

test('anonymous pages redirect with a same-site return path', async ({
  page,
}) => {
  for (const path of ['/', '/some/unknown/path']) {
    await page.goto(path);
    await expect(page).toHaveURL(
      `${origin}/login?next=${encodeURIComponent(path)}`,
    );
  }
  await page.goto('/login?next=//evil.example');
  await expect(page.locator('input[name="next"]')).toHaveValue('/');
});

test('recovery without a token is invalid and health stays public', async ({
  page,
  request,
}) => {
  await page.goto('/auth/recovery');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    getMessages('ar')['auth.invalid_link'],
  );
  expect((await request.get('/api/health')).status()).toBe(200);
});

test('closing the recovery dialog clears the displayed link', async ({
  page,
}) => {
  const m = getMessages('ar');
  await page.goto('/showcase');
  await page.getByRole('button', { name: m['auth.recoveryTitle'] }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: m['dialog.confirm'], exact: true })
    .click();
  await expect(dialog.getByLabel(m['auth.recoveryLink'])).toHaveValue(
    'https://example.test/auth/recovery?token_hash=demo&type=recovery',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: m['auth.recoveryTitle'] }),
  ).toBeFocused();
  await page.getByRole('button', { name: m['auth.recoveryTitle'] }).click();
  await expect(dialog.getByLabel(m['auth.recoveryLink'])).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: m['dialog.confirm'], exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: m['auth.close'], exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: m['auth.recoveryTitle'] }),
  ).toBeFocused();
});
