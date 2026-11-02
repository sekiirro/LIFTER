import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const screenshotDirectory = join(tmpdir(), 'lifter-s26-f18-editor');
mkdirSync(screenshotDirectory, { recursive: true });

for (const variant of [
  { locale: 'ar', theme: 'dark', direction: 'rtl' },
  { locale: 'ar', theme: 'light', direction: 'rtl' },
  { locale: 'en', theme: 'dark', direction: 'ltr' },
  { locale: 'en', theme: 'light', direction: 'ltr' },
]) {
  test(`${variant.locale} ${variant.theme}: editor layout, keyboard reorder, axe`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'lifter_locale',
        value: variant.locale,
        url: 'http://127.0.0.1:3418',
      },
      {
        name: 'lifter_theme',
        value: variant.theme,
        url: 'http://127.0.0.1:3418',
      },
    ]);
    await page.goto('/showcase/f18-plan-editor');
    await page.waitForTimeout(250);
    const editor = page.getByTestId('nutrition-plan-editor');
    await expect(editor).toHaveAttribute('dir', variant.direction);
    const meals = editor.locator('ol > li h4');
    const before = await editor
      .locator('ol > li')
      .first()
      .locator('input')
      .inputValue();
    const moveDownName =
      variant.locale === 'ar' ? 'نقل الوجبة لأسفل' : 'Move meal down';
    const moveDown = page.getByRole('button', { name: moveDownName }).first();
    await moveDown.focus();
    await page.keyboard.press('Space');
    await expect(
      editor.locator('ol > li').first().locator('input'),
    ).not.toHaveValue(before);
    await expect(editor.locator('[aria-live="polite"]')).toContainText(
      variant.locale === 'ar' ? 'إجمالي اليوم المحدد' : 'Selected day totals',
    );

    let axeChecked = false;
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
      await page.screenshot({
        path: join(
          screenshotDirectory,
          `f18-editor-${variant.locale}-${variant.theme}-${width}.png`,
        ),
        fullPage: false,
      });
      if (!axeChecked) {
        const results = await new AxeBuilder({ page }).analyze();
        expect(
          results.violations,
          results.violations.map((issue) => issue.id).join(', '),
        ).toHaveLength(0);
        axeChecked = true;
      }
    }
  });
}
