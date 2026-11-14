import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getMessages } from '../../lib/i18n';
import starterContent from '../../lib/forms/s14-starter-content.json';

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

function getBaseUrl() {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== 'string') {
    throw new Error('Forms E2E requires the configured Playwright baseURL');
  }
  return baseURL;
}

for (const variant of matrix) {
  test(`${variant.locale} ${variant.theme} ${variant.width}px default starter and axe`, async ({
    page,
    context,
  }) => {
    const baseURL = getBaseUrl();
    const currentWeightQuestion = starterContent.questions.find(
      (question) => question.id === 'B04',
    );
    if (!currentWeightQuestion) {
      throw new Error('Approved starter form is missing question B04');
    }
    await page.setViewportSize({
      width: variant.width,
      height: variant.height,
    });
    await context.addCookies([
      {
        name: 'lifter_locale',
        value: variant.locale,
        url: baseURL,
      },
      {
        name: 'lifter_theme',
        value: variant.theme,
        url: baseURL,
      },
    ]);
    await page.goto('/showcase/forms/staff');
    const messages = getMessages(variant.locale);
    await expect(
      page.getByLabel(messages['forms.staffEnglishName']),
    ).toHaveValue('Your First Step');
    await expect(
      page.getByText(currentWeightQuestion.label[variant.locale], {
        exact: true,
      }),
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
