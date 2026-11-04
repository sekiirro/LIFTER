import { expect, test } from '@playwright/test';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

test('unsubmitted Terms keep intake incomplete and remain available after reload', async ({
  page,
  context,
}) => {
  const messages = getMessages('en');
  await context.addCookies([
    { name: LOCALE_COOKIE, value: 'en', domain: 'localhost', path: '/' },
    { name: THEME_COOKIE, value: 'dark', domain: 'localhost', path: '/' },
  ]);
  await page.goto('/showcase/forms/s14');
  const requiredTerms = page.getByRole('checkbox', {
    name: messages['forms.requiredTerms'],
  });
  await expect(requiredTerms).not.toBeChecked();
  await expect(
    page.getByRole('heading', { name: messages['forms.termsCardTitle'] }),
  ).toBeVisible();

  await page.reload();
  await expect(requiredTerms).not.toBeChecked();
  await expect(
    page.getByRole('heading', { name: messages['forms.termsCardTitle'] }),
  ).toBeVisible();
  await expect(requiredTerms).not.toBeChecked();
});
