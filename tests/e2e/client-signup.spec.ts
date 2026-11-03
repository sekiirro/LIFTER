import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { expectHeroAxeClean } from './registration-hero-evidence';

const origin =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.APP_ORIGIN ??
  'http://localhost:3000';
const screenshotDirectory = join(tmpdir(), 'lifter-f15-signup');
const s31ScreenshotDirectory =
  process.env.HERO_R17_SCREENSHOT_DIR ??
  join(tmpdir(), 'lifter-s31-hero-r17', 'signup-states');
type SignupTestMessages = ReturnType<typeof getMessages> & {
  'clientSignup.dateOfBirth': string;
  'clientSignup.username': string;
  'clientSignup.telegramUsername': string;
  'clientSignup.optional': string;
  'forms.termsCardTitle': string;
};
const local = Boolean(
  process.env.DB_URL || process.env.SUPABASE_DB_URL || process.env.API_URL,
);
let token: string;

test.describe.serial('T038 invitation signup UI', () => {
  test.beforeAll(async () => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    const { registrationFixture, secret, issue, checked } =
      await import('../integration/registration-links-fixture');
    const fixture = await registrationFixture();
    const issued = secret();
    checked(
      await issue(fixture, fixture.po.client, { token_hash: issued.hash }),
    );
    token = issued.token;
    await mkdir(screenshotDirectory, { recursive: true });
  });

  test('renders and passes axe across RTL/LTR, themes, mobile and desktop', async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    for (const locale of ['ar', 'en'] as const) {
      const messages = getMessages(locale) as SignupTestMessages;
      for (const theme of ['light', 'dark'] as const) {
        for (const viewport of [
          { name: 'mobile', width: 390, height: 844 },
          { name: 'desktop', width: 1440, height: 900 },
        ] as const) {
          await page.setViewportSize({
            width: viewport.width,
            height: viewport.height,
          });
          await context.addCookies([
            { name: LOCALE_COOKIE, value: locale, url: origin },
            { name: THEME_COOKIE, value: theme, url: origin },
          ]);
          await page.goto(`/register/${token}`);
          await expect(page.locator('html')).toHaveAttribute(
            'dir',
            locale === 'ar' ? 'rtl' : 'ltr',
          );
          for (const field of [
            'name',
            'dateOfBirth',
            'username',
            'telegramUsername',
            'email',
            'phone',
            'password',
          ]) {
            const selector =
              field === 'phone'
                ? 'form input[type="tel"]'
                : `form [name="${field}"]`;
            await expect(page.locator(selector)).toBeVisible();
          }
          await expect(page.locator('form input[type="checkbox"]')).toHaveCount(
            0,
          );
          await expect(page.locator('form [name="sex"]')).toHaveCount(0);
          await expect(page.locator('form [name="health"]')).toHaveCount(0);
          await expect(
            page.getByText(messages['forms.termsCardTitle'], { exact: true }),
          ).toHaveCount(0);
          const serious = (
            await new AxeBuilder({ page }).analyze()
          ).violations.filter(
            (violation) =>
              violation.impact === 'serious' || violation.impact === 'critical',
          );
          expect(serious).toEqual([]);
          await page.screenshot({
            path: join(
              screenshotDirectory,
              `${locale}-${theme}-${viewport.name}.png`,
            ),
            fullPage: true,
          });
        }
      }
    }
  });

  test('renders the restored profile in AR/EN and light/dark without captures', async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    for (const locale of ['ar', 'en'] as const) {
      const messages = getMessages(locale) as SignupTestMessages;
      for (const theme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width: 390, height: 844 });
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: origin },
          { name: THEME_COOKIE, value: theme, url: origin },
        ]);
        await page.goto(`/register/${token}`);
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        for (const field of [
          'name',
          'dateOfBirth',
          'username',
          'telegramUsername',
          'email',
          'phone',
          'password',
        ]) {
          const selector =
            field === 'phone'
              ? 'form input[type="tel"]'
              : `form [name="${field}"]`;
          await expect(page.locator(selector)).toBeVisible();
        }
        const nameField = page.getByLabel(messages['clientSignup.name'], {
          exact: true,
        });
        await nameField.focus();
        await nameField.press('Tab');
        await expect(
          page.getByLabel(messages['clientSignup.dateOfBirth'], {
            exact: true,
          }),
        ).toBeFocused();
        await expectHeroAxeClean(page);
      }
    }
  });

  test('blocks invalid identity locally and leaves signup invitation-only', async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    const messages = getMessages('en') as SignupTestMessages;
    await context.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
      { name: THEME_COOKIE, value: 'light', url: origin },
    ]);
    await page.goto(`/register/${token}`);
    const nameField = page.getByLabel(messages['clientSignup.name'], {
      exact: true,
    });
    const dateOfBirthField = page.getByLabel(
      messages['clientSignup.dateOfBirth'],
      { exact: true },
    );
    await nameField.focus();
    await nameField.press('Tab');
    await expect(dateOfBirthField).toBeFocused();
    await nameField.fill('Heba');
    await dateOfBirthField.fill('2026-10-30');
    await page
      .getByLabel(messages['clientSignup.username'], { exact: true })
      .fill('system');
    await page
      .getByRole('button', { name: messages['clientSignup.submit'] })
      .click();
    await expect(
      page.getByLabel(messages['clientSignup.name'], { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByText(messages['clientSignup.fieldError']).first(),
    ).toBeVisible();
    expect(page.url()).toContain('/register/');
  });

  test('focuses the first invalid field after its ARIA error renders', async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    const messages = getMessages('en') as SignupTestMessages;
    await page.setViewportSize({ width: 390, height: 844 });
    await context.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
      { name: THEME_COOKIE, value: 'light', url: origin },
    ]);
    await page.goto(`/register/${token}`);
    const nameField = page.getByLabel(messages['clientSignup.name'], {
      exact: true,
    });
    await nameField.fill('Heba');
    await page
      .getByLabel(messages['clientSignup.dateOfBirth'], { exact: true })
      .fill('2026-10-30');
    const usernameField = page.getByLabel(messages['clientSignup.username'], {
      exact: true,
    });
    await usernameField.fill('system');

    await mkdir(s31ScreenshotDirectory, { recursive: true });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await nameField.focus();
    await page.screenshot({
      path: join(s31ScreenshotDirectory, 'signup-focus-ring-en-light-390.png'),
      fullPage: true,
    });
    await expectHeroAxeClean(page);

    let focusedAfterErrorState = false;
    await page.exposeFunction(
      'captureSignupFocusState',
      (hasRenderedErrorState: boolean) => {
        focusedAfterErrorState = hasRenderedErrorState;
      },
    );
    await nameField.evaluate((element) => {
      const win = window as unknown as Window & {
        captureSignupFocusState: (hasRenderedErrorState: boolean) => void;
      };
      element.addEventListener(
        'focus',
        () => {
          const describedBy = element.getAttribute('aria-describedby');
          win.captureSignupFocusState(
            element.getAttribute('aria-invalid') === 'true' &&
              Boolean(describedBy && document.getElementById(describedBy)),
          );
        },
        { once: true },
      );
    });
    await usernameField.focus();
    await usernameField.press('Enter');
    await expect(nameField).toBeFocused();
    await expect.poll(() => focusedAfterErrorState).toBe(true);
    await expect(nameField).toHaveAttribute(
      'aria-describedby',
      'signup-name-error',
    );
    await page.screenshot({
      path: join(s31ScreenshotDirectory, 'signup-invalid-en-light-390.png'),
      fullPage: true,
    });
    await expectHeroAxeClean(page);
  });

  test('rejects unexpected signup fields generically without a browser session', async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    const messages = getMessages('en') as SignupTestMessages;
    await context.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
      { name: THEME_COOKIE, value: 'light', url: origin },
    ]);
    await page.goto(`/register/${token}`);
    await page
      .getByLabel(messages['clientSignup.name'], { exact: true })
      .fill('Heba Sami Nabil');
    await page
      .getByLabel(messages['clientSignup.dateOfBirth'], { exact: true })
      .fill('2000-10-29');
    await page
      .getByLabel(messages['clientSignup.username'], { exact: true })
      .fill('heba');
    await page
      .getByLabel(messages['clientSignup.email'], { exact: true })
      .fill('heba@example.test');
    await page
      .getByLabel(messages['clientSignup.phone'], { exact: true })
      .fill('1012345678');
    await page
      .getByLabel(messages['clientSignup.password'], { exact: true })
      .fill('Complex!2345');
    await page.locator('form').evaluate((form) => {
      const unexpected = document.createElement('input');
      unexpected.name = 'unexpected';
      unexpected.value = 'untrusted';
      form.append(unexpected);
    });
    await page
      .getByRole('button', { name: messages['clientSignup.submit'] })
      .click();
    await expect(page.locator('form [role="alert"]')).toHaveText(
      messages['clientSignup.invalidInput'],
    );
    expect(
      (await context.cookies(origin)).some((cookie) =>
        cookie.name.startsWith('sb-'),
      ),
    ).toBe(false);
    await expect(page.locator('form input[type="checkbox"]')).toHaveCount(0);
  });

  test('submits a complete profile with Telegram left empty', async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    const messages = getMessages('en') as SignupTestMessages;
    await page.setViewportSize({ width: 390, height: 844 });
    await context.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
      { name: THEME_COOKIE, value: 'light', url: origin },
    ]);
    await page.goto(`/register/${token}`);
    await page
      .getByLabel(messages['clientSignup.name'], { exact: true })
      .fill('Heba Sami Nabil');
    await page
      .getByLabel(messages['clientSignup.dateOfBirth'], { exact: true })
      .fill('1990-04-12');
    await page
      .getByLabel(messages['clientSignup.username'], { exact: true })
      .fill(`heba-${randomUUID().slice(0, 8)}`);
    await page
      .getByLabel(messages['clientSignup.email'], { exact: true })
      .fill(`signup-${randomUUID()}@example.test`);
    await page
      .getByRole('textbox', { name: messages['clientSignup.phone'] })
      .fill(`010${String(randomInt(0, 100_000_000)).padStart(8, '0')}`);
    await page
      .getByLabel(messages['clientSignup.password'], { exact: true })
      .fill('Complex!2345');
    await page
      .getByRole('button', { name: messages['clientSignup.submit'] })
      .click();
    await expect(page.getByRole('status')).toHaveText(
      messages['clientSignup.complete'],
    );
    await expect(page.locator('form [name="telegramUsername"]')).toHaveValue(
      '',
    );
    await mkdir(s31ScreenshotDirectory, { recursive: true });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.screenshot({
      path: join(s31ScreenshotDirectory, 'signup-success-en-light-390.png'),
      fullPage: true,
    });
    await expectHeroAxeClean(page);
  });
});
