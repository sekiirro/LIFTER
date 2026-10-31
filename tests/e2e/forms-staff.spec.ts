import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getMessages } from '../../lib/i18n';

const matrix = [
  { locale: 'ar', theme: 'light', width: 390, height: 844 },
  { locale: 'ar', theme: 'light', width: 1440, height: 1000 },
  { locale: 'ar', theme: 'dark', width: 390, height: 844 },
  { locale: 'ar', theme: 'dark', width: 1440, height: 1000 },
  { locale: 'en', theme: 'light', width: 390, height: 844 },
  { locale: 'en', theme: 'light', width: 1440, height: 1000 },
  { locale: 'en', theme: 'dark', width: 390, height: 844 },
  { locale: 'en', theme: 'dark', width: 1440, height: 1000 },
] as const;

for (const variant of matrix) {
  test(`${variant.locale} ${variant.theme} ${variant.width}px staff preview is accessible`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: variant.width,
      height: variant.height,
    });
    await page.context().addCookies([
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
    await expect(
      page.getByRole('heading', {
        level: 1,
      }),
    ).toBeVisible();
    const violations = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(violations.violations).toEqual([]);
    await page.screenshot({
      path: join(
        tmpdir(),
        `lifter-f15-t021-staff-${variant.locale}-${variant.theme}-${variant.width}.png`,
      ),
      fullPage: true,
    });
  });

  test(`${variant.locale} ${variant.theme} ${variant.width}px intake and alerts are accessible`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: variant.width,
      height: variant.height,
    });
    await page.context().addCookies([
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
    await page.getByRole('group').getByRole('button').nth(1).click();
    await expect(
      page.getByRole('heading', {
        level: 2,
      }),
    ).toBeVisible();
    const intakeViolations = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(intakeViolations.violations).toEqual([]);
    await page.screenshot({
      path: join(
        tmpdir(),
        `lifter-f15-t021-intake-${variant.locale}-${variant.theme}-${variant.width}.png`,
      ),
      fullPage: true,
    });

    await page.getByRole('group').getByRole('button').nth(2).click();
    await expect(
      page.getByRole('heading', {
        level: 2,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        level: 2,
      }),
    ).toBeVisible();
    const alertViolations = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(alertViolations.violations).toEqual([]);
    await page.screenshot({
      path: join(
        tmpdir(),
        `lifter-f15-t021-alerts-${variant.locale}-${variant.theme}-${variant.width}.png`,
      ),
      fullPage: true,
    });
  });

  test(`${variant.locale} ${variant.theme} ${variant.width}px selected default retirement error and axe`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: variant.width,
      height: variant.height,
    });
    await page.context().addCookies([
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
    await page
      .getByRole('button', { name: messages['forms.staffPreviewForm'] })
      .click();
    await page
      .getByRole('button', { name: messages['forms.staffPublish'] })
      .click();
    await page
      .getByRole('button', { name: messages['forms.staffReturnToEdit'] })
      .click();
    await expect(
      page.getByRole('button', { name: messages['forms.staffRetire'] }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: messages['forms.staffRetire'] })
      .click();
    const alert = page
      .getByRole('alert')
      .filter({ hasText: messages['forms.staffResult.default_selected'] });
    await expect(alert).toHaveText(
      messages['forms.staffResult.default_selected'],
    );
    const violations = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(violations.violations).toEqual([]);
    await page.screenshot({
      path: join(
        tmpdir(),
        `lifter-f15-default-retire-${variant.locale}-${variant.theme}-${variant.width}.png`,
      ),
      fullPage: true,
    });
  });

  test(`${variant.locale} ${variant.theme} ${variant.width}px default configuration error and correction`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: variant.width,
      height: variant.height,
    });
    await page.context().addCookies([
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
    await page.goto('/showcase/forms/staff?defaultConfigurationError=1');
    const messages = getMessages(variant.locale);
    const alert = page.locator('p[role="alert"]');
    await expect(alert).toHaveText(
      messages['forms.staffDefaultConfigurationError'],
    );
    const violations = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(violations.violations).toEqual([]);
    await page.screenshot({
      path: join(
        tmpdir(),
        `lifter-f15-default-configuration-${variant.locale}-${variant.theme}-${variant.width}.png`,
      ),
      fullPage: true,
    });
    await page
      .getByRole('button', {
        name: messages['forms.staffSetDefaultOnboarding'],
      })
      .first()
      .click();
    await expect(alert).toHaveCount(0);
  });
}

test('staff can create, save, and publish a blank bilingual form draft', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'lifter_locale', value: 'en', url: 'http://localhost:3000' },
    { name: 'lifter_theme', value: 'light', url: 'http://localhost:3000' },
  ]);
  await page.goto('/showcase/forms/staff');
  await page.getByRole('button', { name: 'Create a form' }).click();
  await page.getByLabel('English form name').fill('Demo draft');
  await page.getByLabel('Arabic form name').fill('نموذج تجريبي');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByLabel('English section name').fill('General');
  await page.getByLabel('Arabic section name').fill('عام');
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByLabel('English question').fill('Question example');
  await page.getByLabel('Arabic question').fill('سؤال تجريبي');
  await page.getByRole('textbox', { name: 'Question example' }).fill('😀');
  await expect(
    page.getByText('Characters: 1 of 150; 149 remaining'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  await page.getByRole('button', { name: 'Preview form' }).click();
  await page.getByRole('button', { name: 'Publish form' }).click();
  await expect(page.getByRole('status')).toContainText('Form published');
});

test('staff views remain reachable through the keyboard path', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'lifter_locale', value: 'en', url: 'http://localhost:3000' },
  ]);
  await page.goto('/showcase/forms/staff');
  const viewButtons = page.getByRole('group').getByRole('button');
  await viewButtons.nth(0).focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('#forms-intake-title')).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('#forms-alerts-title')).toBeVisible();
});

test('intake and alert views keep client-late separate from Trainer-late policy', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await context.addCookies([
    { name: 'lifter_locale', value: 'en', url: 'http://localhost:3000' },
    { name: 'lifter_theme', value: 'dark', url: 'http://localhost:3000' },
  ]);
  await page.goto('/showcase/forms/staff');
  await page.getByRole('group').getByRole('button').nth(1).click();
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  const intakeViolations = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(intakeViolations.violations).toEqual([]);
  await page.screenshot({
    path: join(tmpdir(), 'lifter-f15-t021-staff-en-dark-1440-intake.png'),
    fullPage: true,
  });
  await page.getByRole('group').getByRole('button').nth(2).click();
  await expect(
    page.getByRole('heading', { name: 'Client submission alerts' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Trainer delivery alerts' }),
  ).toBeVisible();
  await expect(page.getByText('+24 hours')).toBeVisible();
  await expect(page.getByText('+48 hours')).toBeVisible();
  const alertViolations = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(alertViolations.violations).toEqual([]);
  await page.screenshot({
    path: join(tmpdir(), 'lifter-f15-t021-staff-en-dark-1440-alerts.png'),
    fullPage: true,
  });
});

test('Sales cannot publish workspace forms in the mock preview', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'lifter_locale', value: 'en', url: 'http://localhost:3000' },
    { name: 'lifter_theme', value: 'light', url: 'http://localhost:3000' },
  ]);
  await page.goto('/showcase/forms/staff');
  await page.getByLabel('Preview role').selectOption('sales');
  await expect(
    page.getByRole('button', { name: 'Create a form' }),
  ).toBeDisabled();
  await expect(page.getByRole('status')).toContainText(
    'Sales cannot manage workspace forms',
  );
});
