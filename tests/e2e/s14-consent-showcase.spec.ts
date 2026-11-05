import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { getMessages } from '../../lib/i18n';

const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000').origin;

const evidenceDir = join(tmpdir(), 'lifter-f15-s18-ui');
const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

async function assertAxe(page: Page) {
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

test('Terms, contextual health guidance and Welcome render accessibly across the design matrix', async ({
  page,
  context,
}) => {
  test.setTimeout(75_000);
  await mkdir(evidenceDir, { recursive: true });
  for (const locale of ['ar', 'en'] as const) {
    const messages = getMessages(locale);
    for (const theme of ['light', 'dark'] as const) {
      for (const viewport of viewports) {
        await context.clearCookies();
        await context.addCookies([
          {
            name: 'lifter_locale',
            value: locale,
            url: origin,
          },
          {
            name: 'lifter_theme',
            value: theme,
            url: origin,
          },
        ]);
        await page.setViewportSize(viewport);
        await page.goto('/showcase/forms/s14');
        await page.addStyleTag({
          content: 'nextjs-portal { display: none !important; }',
        });
        await expect(
          page.getByRole('heading', { name: messages['forms.termsCardTitle'] }),
        ).toBeVisible();
        await expect(
          page.getByText(messages['forms.aboutHealthData']),
        ).toHaveCount(0);
        await assertAxe(page);
        await page.screenshot({
          path: join(
            evidenceDir,
            `s14-${locale}-${theme}-${viewport.name}.png`,
          ),
          fullPage: true,
        });

        await page.goto('/showcase/forms/s14?health=1');
        await page.addStyleTag({
          content: 'nextjs-portal { display: none !important; }',
        });
        await expect(
          page.getByRole('region', {
            name: messages['forms.healthQuestionExample'],
          }),
        ).toBeVisible();
        await expect(
          page.getByText(messages['forms.aboutHealthData']),
        ).toBeVisible();
        await assertAxe(page);
        await page.screenshot({
          path: join(
            evidenceDir,
            `health-context-${locale}-${theme}-${viewport.name}.png`,
          ),
          fullPage: true,
        });

        await page.goto('/showcase/forms/staff');
        await page.addStyleTag({
          content: 'nextjs-portal { display: none !important; }',
        });
        await expect(
          page.getByRole('heading', { name: messages['forms.staffBuilder'] }),
        ).toBeVisible();
        await expect(
          page.getByLabel(messages['forms.staffEnglishName']),
        ).toHaveValue(getMessages('en')['forms.defaultOnboardingForm']);
        await expect(
          page.getByLabel(messages['forms.staffArabicName']),
        ).toHaveValue(getMessages('ar')['forms.defaultOnboardingForm']);
        await expect(
          page.getByRole('button', {
            name: messages['forms.staffSetDefaultOnboarding'],
          }),
        ).toHaveAttribute('aria-pressed', 'true');
        await assertAxe(page);
        await page.screenshot({
          path: join(
            evidenceDir,
            `onboarding-builder-${locale}-${theme}-${viewport.name}.png`,
          ),
          fullPage: true,
        });

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
        await page.addStyleTag({
          content: 'nextjs-portal { display: none !important; }',
        });
        await expect(
          page.getByRole('heading', { name: messages['forms.welcomeTitle'] }),
        ).toBeVisible();
        await assertAxe(page);
        await page.screenshot({
          path: join(
            evidenceDir,
            `welcome-${locale}-${theme}-${viewport.name}.png`,
          ),
          fullPage: true,
        });
      }
    }
  }

  await context.clearCookies();
  await context.addCookies([
    { name: 'lifter_locale', value: 'en', url: origin },
    { name: 'lifter_theme', value: 'light', url: origin },
  ]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/showcase/forms/s14');
  await page.addStyleTag({
    content: 'nextjs-portal { display: none !important; }',
  });
  await page.keyboard.press('Tab');
  const termsCheckbox = page.getByRole('checkbox', {
    name: getMessages('en')['forms.requiredTerms'],
  });
  await expect(termsCheckbox).toBeFocused();
  await page.screenshot({
    path: join(evidenceDir, 's14-keyboard-terms-focus.png'),
    fullPage: true,
  });
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: getMessages('en')['forms.acceptTerms'] }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText(getMessages('en')['forms.draftAcceptanceUnavailable']),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  ).toBe(true);
  await page.screenshot({
    path: join(evidenceDir, 's14-reduced-motion-en.png'),
    fullPage: true,
  });

  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      await context.clearCookies();
      await context.addCookies([
        {
          name: 'lifter_locale',
          value: locale,
          url: origin,
        },
        { name: 'lifter_theme', value: theme, url: origin },
      ]);
      await page.goto('/showcase/forms/s14?health=1&brand=sample');
      await page.addStyleTag({
        content: 'nextjs-portal { display: none !important; }',
      });
      await expect(
        page.getByText(getMessages(locale)['forms.aboutHealthData']),
      ).toBeVisible();
      await assertAxe(page);
    }
  }
});
