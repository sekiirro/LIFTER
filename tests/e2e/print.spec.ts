import { testOrigin } from './test-origin.mjs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

test('Arabic print sample hides screen controls and exports its PDF', async ({
  page,
  context,
}, testInfo) => {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: 'ar', url: testOrigin },
    { name: THEME_COOKIE, value: 'dark', url: testOrigin },
  ]);
  const response = await page.goto('/print-sample');
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByTestId('print-switchers')).toBeVisible();
  await expect(page.getByTestId('print-table').locator('tbody tr')).toHaveCount(
    25,
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('print-switchers')).toBeHidden();
  await expect(page.getByTestId('language-select')).toBeHidden();
  await expect(page.getByTestId('theme-dark')).toBeHidden();
  await expect(page.locator('html')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(page.getByTestId('print-table').locator('thead')).toHaveCSS(
    'display',
    'table-header-group',
  );
  await expect(
    page.getByTestId('print-table').locator('tbody tr').first(),
  ).toHaveCSS('break-inside', 'avoid');
  const output = testInfo.outputPath('print-sample.pdf');
  await page.pdf({ format: 'A4', printBackground: true, path: output });
  expect((await stat(output)).size).toBeGreaterThan(0);
  const reviewCopy = path.resolve('test-results/print-sample.pdf');
  await mkdir(path.dirname(reviewCopy), { recursive: true });
  await copyFile(output, reviewCopy);
  expect((await stat(reviewCopy)).size).toBe((await stat(output)).size);
});
