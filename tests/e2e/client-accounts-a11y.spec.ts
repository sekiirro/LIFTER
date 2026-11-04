import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { validateSignupIdentity } from '../../app/register/[token]/schema';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const origin = 'http://localhost:3000';
const local = Boolean(
  process.env.DB_URL || process.env.SUPABASE_DB_URL || process.env.API_URL,
);
let validToken: string;
let fixture: Awaited<
  ReturnType<
    typeof import('../integration/registration-links-fixture').registrationFixture
  >
>;

test.beforeAll(async () => {
  if (!local) return;
  const { registrationFixture, secret, issue, checked } =
    await import('../integration/registration-links-fixture');
  fixture = await registrationFixture();
  const value = secret();
  checked(await issue(fixture, fixture.po.client, { token_hash: value.hash }));
  validToken = value.token;
});

for (const locale of ['ar', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of [
      { name: 'mobile', width: 390, height: 844 },
      { name: 'desktop', width: 1440, height: 900 },
    ]) {
      test(`${locale} ${theme} ${viewport.name} signup has no serious or critical axe violations`, async ({
        page,
        context,
      }) => {
        test.skip(!local, 'Requires the disposable local Supabase stack.');
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: origin },
          { name: THEME_COOKIE, value: theme, url: origin },
        ]);
        await page.goto(`/register/${validToken}`);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(
          page.getByLabel(locale === 'ar' ? 'الدولة' : 'Country'),
        ).toHaveValue('EG');
        const telegram = page.getByLabel(
          getMessages(locale)['clientSignup.telegramUsername'],
          { exact: false },
        );
        await expect(telegram).toBeVisible();
        await expect(telegram).not.toHaveAttribute('required', '');
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(results.violations).toEqual([]);
      });

      test(`${locale} ${theme} ${viewport.name} duplicate error renders neutrally and is axe clean`, async ({
        page,
        context,
      }, testInfo) => {
        test.skip(!local, 'Requires the disposable local Supabase stack.');
        const m = getMessages(locale);
        const { secret, issue, checked } =
          await import('../integration/registration-links-fixture');
        const issued = secret();
        checked(
          await issue(fixture, fixture.woA.client, {
            token_hash: issued.hash,
          }),
        );
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: origin },
          { name: THEME_COOKIE, value: theme, url: origin },
        ]);
        await page.setExtraHTTPHeaders({
          'CF-Connecting-IP': `203.0.113.${Math.floor(40 + Math.random() * 200)}`,
        });
        await page.goto(`/register/${issued.token}`);
        await page
          .getByLabel(m['clientSignup.name'], { exact: true })
          .fill('Duplicate Example Person');
        await page
          .getByLabel(m['clientSignup.dateOfBirth'], { exact: true })
          .fill('1990-04-12');
        await page
          .getByLabel(m['clientSignup.username'], { exact: true })
          .fill(`member-${issued.token.slice(0, 8)}`);
        await page
          .getByLabel(m['clientSignup.email'], { exact: true })
          .fill(fixture.po.email);
        await page
          .getByRole('textbox', { name: m['clientSignup.phone'] })
          .fill('01012345678');
        await page
          .getByLabel(m['clientSignup.password'], { exact: true })
          .fill('Complex!2345');
        const identityFields = await page
          .locator('form')
          .evaluate((element) => {
            const data = new FormData(element as HTMLFormElement);
            return {
              name: data.get('name'),
              dateOfBirth: data.get('dateOfBirth'),
              username: data.get('username'),
              telegramUsername: data.get('telegramUsername'),
            };
          });
        expect(validateSignupIdentity(identityFields).invalidFields).toEqual(
          [],
        );
        const responsePromise = page.waitForResponse(
          (response) => response.request().method() === 'POST',
        );
        await page
          .getByRole('button', { name: m['clientSignup.submit'] })
          .click();
        expect((await responsePromise).status()).toBe(200);
        const status = page.getByRole('status');
        await expect(status).toHaveText(m['clientSignup.duplicate']);
        await expect(status).toBeVisible();
        await expect(status).toBeFocused();
        for (const field of ['email', 'phone', 'username'] as const) {
          const control = page.getByLabel(m[`clientSignup.${field}`], {
            exact: true,
          });
          if (await control.count()) {
            await expect(control).not.toHaveAttribute('aria-invalid', 'true');
          }
        }
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(results.violations).toEqual([]);
        const screenshotPath = join(
          tmpdir(),
          `lifter-s16-q2-${locale}-${theme}-${viewport.name}-${testInfo.workerIndex}.png`,
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        testInfo.attachments.push({
          name: 'duplicate-error-screenshot',
          path: screenshotPath,
          contentType: 'image/png',
        });
      });
    }
  }
}

for (const locale of ['ar', 'en'] as const) {
  test(`${locale} signup keyboard flow associates errors and focuses the first invalid field`, async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, url: origin },
      { name: THEME_COOKIE, value: 'light', url: origin },
    ]);
    await page.goto(`/register/${validToken}`);
    await page.waitForLoadState('networkidle');
    const messages = getMessages(locale);
    const name = page.getByLabel(messages['clientSignup.name'], {
      exact: true,
    });
    const dateOfBirth = page.getByLabel(messages['clientSignup.dateOfBirth'], {
      exact: true,
    });
    const username = page.getByLabel(messages['clientSignup.username'], {
      exact: true,
    });
    const telegram = page.getByLabel(
      messages['clientSignup.telegramUsername'],
      { exact: false },
    );
    const email = page.getByLabel(messages['clientSignup.email'], {
      exact: true,
    });
    const country = page.getByLabel(messages['clientSignup.country'], {
      exact: true,
    });
    const phone = page.getByLabel(messages['clientSignup.phone'], {
      exact: true,
    });
    const password = page.getByLabel(messages['clientSignup.password'], {
      exact: true,
    });
    await name.focus();
    await expect(name).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dateOfBirth).toBeFocused();
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Tab');
      if (await username.evaluate((field) => field === document.activeElement))
        break;
    }
    await expect(username).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(telegram).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(email).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(country).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(phone).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(password).toBeFocused();
    await page.keyboard.press('Tab');
    const submit = page.locator('form button[type="submit"]');
    await expect(submit).toBeFocused();

    await name.fill('Keyboard Example Person');
    await dateOfBirth.fill('1990-04-12');
    await username.fill(`keyboard-${randomUUID().slice(0, 8)}`);
    await email.fill('invalid');
    await phone.fill('01012');
    let release!: () => void;
    let received!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const intercepted = new Promise<void>((resolve) => (received = resolve));
    await page.route(`**/register/${validToken}`, async (route) => {
      if (route.request().method() === 'POST') {
        received();
        await held;
      }
      await route.continue();
    });
    await submit.click();
    await intercepted;
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('status')).toContainText(
      messages['clientSignup.pending'],
    );
    release();
    const invalidFields = [
      [email, 'signup-email-error'],
      [phone, 'signup-phone-error'],
      [password, 'signup-password-error'],
    ] as const;
    for (const [field, errorId] of invalidFields) {
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(field).toHaveAttribute('aria-describedby', errorId);
    }
    await expect(email).toBeFocused();
    await expect(page.locator('form p[role="alert"]')).toBeVisible();
    await page.unrouteAll();
  });
}
