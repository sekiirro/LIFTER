import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getMessages } from '../../lib/i18n';

const matrix = [
  { locale: 'ar', theme: 'light', width: 390, height: 844 },
  { locale: 'ar', theme: 'dark', width: 390, height: 844 },
  { locale: 'ar', theme: 'light', width: 1440, height: 900 },
  { locale: 'ar', theme: 'dark', width: 1440, height: 900 },
  { locale: 'en', theme: 'light', width: 390, height: 844 },
  { locale: 'en', theme: 'dark', width: 390, height: 844 },
  { locale: 'en', theme: 'light', width: 1440, height: 900 },
  { locale: 'en', theme: 'dark', width: 1440, height: 900 },
] as const;

for (const variant of matrix) {
  test(`${variant.locale} ${variant.theme} ${variant.width}px default starter and axe`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({
      width: variant.width,
      height: variant.height,
    });
    await context.addCookies([
      {
        name: 'lifter_locale',
        value: variant.locale,
        url: 'http://localhost:3000',
      },
      {
        name: 'lifter_theme',
        value: variant.theme,
        url: 'http://localhost:3000',
      },
    ]);
    await page.goto('/showcase/forms/staff');
    const messages = getMessages(variant.locale);
    await expect(
      page.getByLabel(messages['forms.staffEnglishName']),
    ).toHaveValue('Your First Step');
    await expect(
      page.locator('input[value="What is your current weight?"]'),
    ).toHaveCount(1);
    await expect(
      page.getByText(new RegExp(messages['forms.staffQuestionCount'])),
    ).toBeVisible();

    const violations = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      violations.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);

    const evidenceDirectory = join(tmpdir(), 'lftr-f15-s18-r5');
    mkdirSync(evidenceDirectory, { recursive: true });
    await page.screenshot({
      path: join(
        evidenceDirectory,
        `default-starter-${variant.locale}-${variant.theme}-${variant.width}.png`,
      ),
      fullPage: true,
    });
  });
}
