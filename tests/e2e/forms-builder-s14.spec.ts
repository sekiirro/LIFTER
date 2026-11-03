import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getMessages } from '../../lib/i18n';

const matrix = [
  { locale: 'ar', theme: 'light', width: 390, height: 844 },
  { locale: 'ar', theme: 'light', width: 768, height: 1024 },
  { locale: 'ar', theme: 'light', width: 1440, height: 900 },
  { locale: 'ar', theme: 'dark', width: 390, height: 844 },
  { locale: 'ar', theme: 'dark', width: 768, height: 1024 },
  { locale: 'ar', theme: 'dark', width: 1440, height: 900 },
  { locale: 'en', theme: 'light', width: 390, height: 844 },
  { locale: 'en', theme: 'light', width: 768, height: 1024 },
  { locale: 'en', theme: 'light', width: 1440, height: 900 },
  { locale: 'en', theme: 'dark', width: 390, height: 844 },
  { locale: 'en', theme: 'dark', width: 768, height: 1024 },
  { locale: 'en', theme: 'dark', width: 1440, height: 900 },
] as const;

function getBaseUrl() {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== 'string') {
    throw new Error('Forms E2E requires the configured Playwright baseURL');
  }
  return baseURL;
}

async function preparePreview(
  page: import('@playwright/test').Page,
  locale: 'ar' | 'en',
) {
  const messages = getMessages(locale);
  await page.goto('/showcase/forms/staff');
  await page
    .getByRole('button', { name: messages['forms.staffCreateForm'] })
    .click();
  await page
    .getByLabel(messages['forms.staffEnglishName'])
    .fill('F15 Builder preview');
  await page
    .getByLabel(messages['forms.staffArabicName'])
    .fill('معاينة المنشئ');
  await page
    .getByRole('button', { name: messages['forms.staffAddSection'] })
    .click();
  await page
    .getByLabel(messages['forms.staffEnglishSection'])
    .fill('Nutrition');
  await page.getByLabel(messages['forms.staffArabicSection']).fill('التغذية');

  await page
    .getByRole('button', { name: messages['forms.staffAddSexSelector'] })
    .click();
  await page
    .getByLabel(messages['forms.staffEnglishQuestion'])
    .first()
    .fill('Sex');
  await page
    .getByLabel(messages['forms.staffArabicQuestion'])
    .first()
    .fill('الجنس');
  await page
    .getByLabel(messages['forms.staffEnglishOption'])
    .nth(0)
    .fill('Male');
  await page.getByLabel(messages['forms.staffArabicOption']).nth(0).fill('ذكر');
  await page
    .getByLabel(messages['forms.staffEnglishOption'])
    .nth(1)
    .fill('Female');
  await page
    .getByLabel(messages['forms.staffArabicOption'])
    .nth(1)
    .fill('أنثى');

  await page
    .getByRole('button', { name: messages['forms.staffAddHealthNotice'] })
    .click();
  await page
    .getByLabel(messages['forms.staffEnglishQuestion'])
    .first()
    .fill('Health notice');
  await page
    .getByLabel(messages['forms.staffArabicQuestion'])
    .first()
    .fill('تنبيه صحي');
  await page
    .getByLabel(messages['forms.staffDisplayTextEnglish'])
    .fill('Health information is private.');
  await page
    .getByLabel(messages['forms.staffDisplayTextArabic'])
    .fill('البيانات الصحية خاصة.');

  await page
    .getByRole('button', { name: messages['forms.staffAddMealCount'] })
    .click();
  await page
    .getByLabel(messages['forms.staffEnglishQuestion'])
    .first()
    .fill('Meals per day');
  await page
    .getByLabel(messages['forms.staffArabicQuestion'])
    .first()
    .fill('الوجبات يوميًا');

  await page
    .getByRole('button', { name: messages['forms.staffAddDerivedChoice'] })
    .click();
  await page
    .getByLabel(messages['forms.staffEnglishQuestion'])
    .first()
    .fill('Training timing');
  await page
    .getByLabel(messages['forms.staffArabicQuestion'])
    .first()
    .fill('موعد التمرين');

  await page
    .getByRole('button', { name: messages['forms.staffAddImageChoice'] })
    .click();
  await page
    .getByLabel(messages['forms.staffEnglishQuestion'])
    .first()
    .fill('Body-fat reference');
  await page
    .getByLabel(messages['forms.staffArabicQuestion'])
    .first()
    .fill('مرجع نسبة الدهون');
  await page
    .getByRole('button', { name: messages['forms.staffAddOption'] })
    .last()
    .click();
  await page.getByLabel(messages['forms.staffChoiceValue']).last().fill('18');
  await page
    .getByLabel(messages['forms.staffEnglishOption'])
    .last()
    .fill('18%');
  await page.getByLabel(messages['forms.staffArabicOption']).last().fill('١٨٪');
  await page
    .getByLabel(messages['forms.staffAssetReference'])
    .fill('/images/body-fat/female-18.webp');

  await page
    .getByRole('button', { name: messages['forms.staffPreviewForm'] })
    .click();
  await expect(
    page.getByRole('heading', {
      name: locale === 'ar' ? 'معاينة المنشئ' : 'F15 Builder preview',
    }),
  ).toBeVisible();
  return messages;
}

for (const variant of matrix) {
  test(`${variant.locale} ${variant.theme} ${variant.width}px Builder preview and axe`, async ({
    page,
    context,
  }) => {
    const baseURL = getBaseUrl();
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
    await preparePreview(page, variant.locale);
    const violations = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      violations.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);

    const evidenceDirectory = join(
      process.cwd(),
      'tests/integration/evidence/f15-builder',
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    await page.screenshot({
      path: join(
        evidenceDirectory,
        `builder-${variant.locale}-${variant.theme}-${variant.width}.png`,
      ),
      fullPage: true,
    });
  });
}

test('Builder can reorder and remove fields and preview a conditional branch by keyboard', async ({
  page,
  context,
}) => {
  const baseURL = getBaseUrl();
  const messages = getMessages('en');
  await context.addCookies([
    { name: 'lifter_locale', value: 'en', url: baseURL },
    { name: 'lifter_theme', value: 'light', url: baseURL },
  ]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/showcase/forms/staff');
  await page
    .getByRole('button', { name: messages['forms.staffCreateForm'] })
    .click();
  await page
    .getByRole('button', { name: messages['forms.staffAddSection'] })
    .click();
  await page.getByLabel(messages['forms.staffEnglishSection']).fill('Training');
  await page.getByLabel(messages['forms.staffArabicSection']).fill('التدريب');
  await page
    .getByRole('button', { name: messages['forms.staffAddQuestion'] })
    .click();
  await page
    .getByLabel(messages['forms.staffEnglishQuestion'])
    .fill('Parent question');
  await page
    .getByLabel(messages['forms.staffArabicQuestion'])
    .fill('السؤال الأساسي');
  await page
    .getByRole('button', { name: messages['forms.staffAddQuestion'] })
    .click();
  await page
    .getByLabel(messages['forms.staffEnglishQuestion'])
    .first()
    .fill('Conditional child');
  await page
    .getByLabel(messages['forms.staffArabicQuestion'])
    .first()
    .fill('سؤال فرعي');
  await page.getByLabel(messages['forms.staffConditional']).check();
  await expect(
    page.getByLabel(messages['forms.staffConditionQuestion']),
  ).toBeVisible();
  await page
    .getByRole('button', { name: messages['forms.staffMoveQuestionUp'] })
    .first()
    .click();
  const questionItems = page
    .getByRole('list', { name: messages['forms.staffQuestionCount'] })
    .getByRole('button');
  await expect(questionItems.nth(0)).toContainText('Conditional child');
  await expect(questionItems.nth(1)).toContainText('Parent question');
  await page
    .getByRole('button', { name: messages['forms.staffPreviewForm'] })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: messages['forms.staffPublish'] }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: messages['forms.staffReturnToEdit'] })
    .click();
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: messages['forms.staffRemoveQuestion'] })
    .first()
    .click();
  await expect(
    page.getByLabel(messages['forms.staffEnglishQuestion']),
  ).toHaveCount(1);
});

test('Builder publishes a previewed draft as a published form', async ({
  page,
  context,
}) => {
  const baseURL = getBaseUrl();
  const messages = getMessages('en');
  await context.addCookies([
    { name: 'lifter_locale', value: 'en', url: baseURL },
    { name: 'lifter_theme', value: 'light', url: baseURL },
  ]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/showcase/forms/staff');
  await page
    .getByRole('button', { name: messages['forms.staffCreateForm'] })
    .click();
  await page
    .getByLabel(messages['forms.staffEnglishName'])
    .fill('Immutable published form');
  await page
    .getByLabel(messages['forms.staffArabicName'])
    .fill('الاستبيان المنشور');
  await page
    .getByRole('button', { name: messages['forms.staffAddSection'] })
    .click();
  await page.getByLabel(messages['forms.staffEnglishSection']).fill('General');
  await page.getByLabel(messages['forms.staffArabicSection']).fill('عام');
  await page
    .getByRole('button', { name: messages['forms.staffAddQuestion'] })
    .click();
  await page
    .getByLabel(messages['forms.staffEnglishQuestion'])
    .fill('Question');
  await page.getByLabel(messages['forms.staffArabicQuestion']).fill('سؤال');
  await page
    .getByRole('button', { name: messages['forms.staffPreviewForm'] })
    .click();
  await page
    .getByRole('button', { name: messages['forms.staffPublish'] })
    .click();
  await expect(page.getByText(messages['forms.staffPublished'])).toBeVisible();
  await expect(
    page.getByRole('button', { name: new RegExp('Immutable published form') }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: messages['forms.staffReturnToEdit'] })
    .click();
  await expect(
    page.getByRole('button', { name: messages['forms.staffCopy'] }),
  ).toBeVisible();
});
