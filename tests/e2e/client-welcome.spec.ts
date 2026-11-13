import { expect, test, type Page } from '@playwright/test';
import { getMessages } from '../../lib/i18n';
import {
  clientContext,
  registered,
} from '../integration/registration-approval-operations-fixture';

const origin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
).origin;
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

let clientCredentials: { email: string; password: string };

test.beforeAll(async () => {
  const fixture = await clientContext();
  clientCredentials = await registered(fixture);
});

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(clientCredentials.email);
  await page.getByLabel('Password').fill(clientCredentials.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/u);
}

test('Welcome preview remains directly renderable after reload', async ({
  page,
  context,
}) => {
  const messages = getMessages('en');
  await context.addCookies([
    { name: LOCALE_COOKIE, value: 'en', url: origin },
    { name: THEME_COOKIE, value: 'light', url: origin },
  ]);
  await page.goto('/showcase/forms/s14?welcome=1');

  await expect(
    page.getByRole('heading', { name: messages['forms.welcomeTitle'] }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: messages['forms.welcomeTitle'] }),
  ).toBeVisible();
});

test('client Welcome route renders its Terms card through a client wrapper', async ({
  page,
  context,
}) => {
  const messages = getMessages('en');
  await context.addCookies([
    { name: LOCALE_COOKIE, value: 'en', url: origin },
    { name: THEME_COOKIE, value: 'light', url: origin },
  ]);
  await signIn(page);
  await page.goto('/welcome');
  await expect(
    page.getByRole('heading', { name: messages['forms.termsCardTitle'] }),
  ).toBeVisible();
});

test('keyboard Terms preview keeps DRAFT acceptance disabled and marketing optional', async ({
  page,
  context,
}) => {
  const messages = getMessages('en');
  await context.addCookies([
    { name: LOCALE_COOKIE, value: 'en', url: origin },
    { name: THEME_COOKIE, value: 'light', url: origin },
  ]);
  await page.goto('/showcase/forms/s14');
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
    page.getByText(messages['forms.draftAcceptanceUnavailable']),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: messages['forms.welcomeTitle'] }),
  ).toHaveCount(0);
});
