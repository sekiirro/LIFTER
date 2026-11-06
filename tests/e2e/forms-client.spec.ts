import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
const baseOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
).origin;

for (const variant of matrix) {
  test(`${variant.locale} ${variant.theme} ${variant.width}px renders without axe violations`, async ({
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
        url: baseOrigin,
      },
      {
        name: 'lifter_theme',
        value: variant.theme,
        url: baseOrigin,
      },
    ]);
    await page.goto('/showcase/forms');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: variant.locale === 'ar' ? 'بيانات العميل' : 'Client intake',
      }),
    ).toBeVisible();
    const violations = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(violations.violations).toEqual([]);
    const file = join(
      tmpdir(),
      `lifter-f15-${variant.locale}-${variant.theme}-${variant.width}.png`,
    );
    await page.screenshot({ path: file, fullPage: true });
  });
}

test('client flow supports draft save and blocks incomplete submission accessibly', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'lifter_locale', value: 'en', url: baseOrigin },
    { name: 'lifter_theme', value: 'light', url: baseOrigin },
  ]);
  await page.goto('/showcase/forms');
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Draft saved.' }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'What would you like to work toward?' })
    .fill('Build strength');
  await expect(
    page.getByRole('heading', { name: 'Do you have an injury?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Submit answers' }).click();
  await expect(
    page.getByRole('alert').filter({
      hasText: 'Complete the required questions',
    }),
  ).toBeVisible();
});

test('removing a branch answer erases and hides the now-inapplicable answer', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'lifter_locale', value: 'en', url: baseOrigin },
    { name: 'lifter_theme', value: 'light', url: baseOrigin },
  ]);
  await page.goto('/showcase/forms');
  await page
    .getByRole('textbox', { name: 'What would you like to work toward?' })
    .fill('Build strength');
  await page.getByRole('radio', { name: 'Yes' }).click();
  const detail = page.getByRole('textbox', {
    name: 'Tell us about the injury',
  });
  await expect(detail).toBeVisible();
  await detail.fill('Old injury details');
  await page.getByRole('button', { name: 'Previous question' }).click();
  await page.getByRole('radio', { name: 'No' }).click();
  await expect(
    page.getByRole('heading', { name: 'Tell us about the injury' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: 'Tell us about the injury' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Submit answers' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Your answers were submitted.' }),
  ).toBeVisible();
});

test('keyboard users can advance into a conditional question', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'lifter_locale', value: 'en', url: baseOrigin },
    { name: 'lifter_theme', value: 'light', url: baseOrigin },
  ]);
  await page.goto('/showcase/forms');
  await page
    .getByRole('textbox', { name: 'What would you like to work toward?' })
    .fill('Build strength');
  const yes = page.getByRole('radio', { name: 'Yes' });
  await yes.focus();
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('textbox', { name: 'Tell us about the injury' }),
  ).toBeVisible();
});
