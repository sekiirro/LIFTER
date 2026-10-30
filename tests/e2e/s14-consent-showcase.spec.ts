import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const evidenceDir = join(tmpdir(), 'lifter-f15-ui');
const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

test('S14 consent surfaces render accessibly across locale, theme and viewport', async ({
  page,
  context,
}) => {
  await mkdir(evidenceDir, { recursive: true });
  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const viewport of viewports) {
        await context.clearCookies();
        await context.addCookies([
          {
            name: 'lifter_locale',
            value: locale,
            domain: 'localhost',
            path: '/',
          },
          {
            name: 'lifter_theme',
            value: theme,
            domain: 'localhost',
            path: '/',
          },
        ]);
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.goto('/showcase/forms/s14');
        await page.addStyleTag({
          content: 'nextjs-portal { display: none !important; }',
        });
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(
          page.getByRole('region', { name: /we will ask|هنطلب/i }),
        ).toBeVisible();
        await expect(
          page.getByRole('heading', { level: 2 }).last(),
        ).toBeVisible();

        const accessibility = await new AxeBuilder({ page }).analyze();
        expect(
          accessibility.violations.filter((violation) =>
            ['serious', 'critical'].includes(violation.impact ?? ''),
          ),
        ).toEqual([]);
        await page.screenshot({
          path: join(
            evidenceDir,
            `s14-${locale}-${theme}-${viewport.name}.png`,
          ),
          fullPage: true,
        });
      }
    }
  }

  await context.clearCookies();
  await context.addCookies([
    { name: 'lifter_locale', value: 'en', domain: 'localhost', path: '/' },
    { name: 'lifter_theme', value: 'light', domain: 'localhost', path: '/' },
  ]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/showcase/forms/s14');
  await page.addStyleTag({
    content: 'nextjs-portal { display: none !important; }',
  });
  await page.keyboard.press('Tab');
  const termsCheckbox = page.getByRole('checkbox', {
    name: 'I accept the terms and conditions',
  });
  await expect(termsCheckbox).toBeFocused();
  await page.screenshot({
    path: join(evidenceDir, 's14-keyboard-terms-focus.png'),
    fullPage: true,
  });
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Draft acceptance reached the mock adapter.'),
  ).toBeVisible();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  ).toBe(true);
});
