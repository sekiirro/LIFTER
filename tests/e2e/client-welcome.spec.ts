import { expect, test } from '@playwright/test';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

test('accepted Terms restore the Welcome state after reload', async ({
  page,
  context,
}) => {
  const messages = getMessages('en');
  await context.addCookies([
    { name: LOCALE_COOKIE, value: 'en', domain: 'localhost', path: '/' },
    { name: THEME_COOKIE, value: 'light', domain: 'localhost', path: '/' },
  ]);
  await page.goto('/showcase/forms/s14');
  await page.evaluate(() =>
    window.sessionStorage.setItem(
      'f15-welcome-terms-mock-v1',
      JSON.stringify({
        policyVersion: 'terms-draft-v1',
        marketingAccepted: false,
      }),
    ),
  );
  await page.goto('/showcase/forms/s14?welcome=1');

  await expect(
    page.getByRole('heading', { name: messages['forms.welcomeTitle'] }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: messages['forms.welcomeTitle'] }),
  ).toBeVisible();
});

test('keyboard Terms acceptance opens Welcome while marketing stays optional', async ({
  page,
  context,
}) => {
  const messages = getMessages('en');
  await context.addCookies([
    { name: LOCALE_COOKIE, value: 'en', domain: 'localhost', path: '/' },
    { name: THEME_COOKIE, value: 'light', domain: 'localhost', path: '/' },
  ]);
  await page.goto('/showcase/forms/s14?welcome=1');
  await page.addStyleTag({
    content: 'nextjs-portal { display: none !important; }',
  });
  await expect(
    page.getByRole('heading', { name: messages['forms.termsCardTitle'] }),
  ).toBeVisible();
  const terms = page.getByRole('checkbox', {
    name: messages['forms.requiredTerms'],
  });
  const marketing = page.getByRole('checkbox', {
    name: messages['forms.optionalMarketing'],
  });
  await page.keyboard.press('Tab');
  await expect(terms).toBeFocused();
  await page.keyboard.press('Space');
  await expect(terms).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(marketing).toBeFocused();
  await expect(marketing).not.toBeChecked();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: messages['forms.acceptTerms'] }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: messages['forms.welcomeTitle'] }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: messages['forms.welcomeTitle'] }),
  ).toBeVisible();
});
