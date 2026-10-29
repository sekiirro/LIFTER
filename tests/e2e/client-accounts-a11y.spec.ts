import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

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
        await expect(page.getByLabel(/telegram/i)).toHaveCount(0);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(
          results.violations.filter((violation) =>
            ['serious', 'critical'].includes(violation.impact ?? ''),
          ),
        ).toEqual([]);
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
    const name = page.getByLabel(locale === 'ar' ? 'الاسم' : 'Name', {
      exact: true,
    });
    const email = page.getByLabel(
      locale === 'ar' ? 'البريد الإلكتروني' : 'Email',
      { exact: true },
    );
    const country = page.getByLabel(locale === 'ar' ? 'الدولة' : 'Country', {
      exact: true,
    });
    const phone = page.getByLabel(
      locale === 'ar' ? 'رقم الهاتف' : 'Phone number',
      { exact: true },
    );
    const password = page.getByLabel(
      locale === 'ar' ? 'كلمة المرور' : 'Password',
      { exact: true },
    );
    await name.focus();
    await expect(name).toBeFocused();
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
      locale === 'ar' ? 'جارٍ الإرسال' : 'Submitting',
    );
    release();
    const invalidFields = [
      [name, 'signup-name-error'],
      [email, 'signup-email-error'],
      [phone, 'signup-phone-error'],
      [password, 'signup-password-error'],
    ] as const;
    for (const [field, errorId] of invalidFields) {
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(field).toHaveAttribute('aria-describedby', errorId);
    }
    await expect(name).toBeFocused();
    await expect(page.locator('form p[role="alert"]')).toBeVisible();
    await page.unrouteAll();
  });
}
