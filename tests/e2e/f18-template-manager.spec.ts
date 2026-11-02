import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const screenshotDirectory = join(tmpdir(), 'lifter-s26-f18-templates');
mkdirSync(screenshotDirectory, { recursive: true });

for (const variant of [
  { locale: 'ar', theme: 'dark', direction: 'rtl' },
  { locale: 'ar', theme: 'light', direction: 'rtl' },
  { locale: 'en', theme: 'dark', direction: 'ltr' },
  { locale: 'en', theme: 'light', direction: 'ltr' },
]) {
  test(`${variant.locale} ${variant.theme}: template manager matrix and axe`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'lifter_locale',
        value: variant.locale,
        url: 'http://localhost:3418',
      },
      {
        name: 'lifter_theme',
        value: variant.theme,
        url: 'http://localhost:3418',
      },
    ]);
    await page.goto('/showcase/f18-templates');
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const manager = page.getByTestId('nutrition-template-manager');
    await expect(manager).toHaveAttribute('dir', variant.direction);
    await expect(manager.getByText('Another workspace template')).toHaveCount(0);
    await expect(
      manager.getByRole('button', {
        name: variant.locale === 'ar' ? 'جعله عامًا' : 'Make it Global',
      }),
    ).toBeVisible();
    await expect(page.getByTestId('template-brand-scope')).toHaveAttribute(
      'data-brand-scope',
      '',
    );

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
      await page.screenshot({
        path: join(
          screenshotDirectory,
          `f18-templates-${variant.locale}-${variant.theme}-${width}.png`,
        ),
        fullPage: true,
      });
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations,
        results.violations.map((issue) => issue.id).join(', '),
      ).toHaveLength(0);
    }

    const loadVersion = manager.getByRole('button', {
      name: variant.locale === 'ar' ? 'تحميل الإصدار إلى مسودة ٢' : 'Load version into draft 2',
    });
    await loadVersion.focus();
    await page.keyboard.press('Enter');
    await expect(manager.locator('[aria-live="polite"]')).toContainText(
      variant.locale === 'ar'
        ? 'أصبحت نسخة من هذا الإصدار جاهزة في المسودة.'
        : 'A copy of this version is ready in the draft.',
    );

    await page.goto('/showcase/f18-templates?role=staff');
    await expect(
      page.getByTestId('nutrition-template-manager').getByRole('button', {
        name: variant.locale === 'ar' ? 'جعله عامًا' : 'Make it Global',
      }),
    ).toHaveCount(0);
  });
}
