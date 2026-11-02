import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

const screenshotDirectory = path.join(tmpdir(), 'lifter-s25-f17-t032');

test('workout print preview covers locale, theme, viewport, and A4 print media', async ({
  page,
  context,
}) => {
  await mkdir(screenshotDirectory, { recursive: true });

  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const viewport of [
        { name: 'mobile', width: 390, height: 844 },
        { name: 'desktop', width: 1440, height: 1000 },
      ]) {
        await context.clearCookies();
        await context.addCookies([
          {
            name: LOCALE_COOKIE,
            value: locale,
            url: 'http://localhost:3000',
          },
          {
            name: THEME_COOKIE,
            value: theme,
            url: 'http://localhost:3000',
          },
        ]);
        await page.setViewportSize(viewport);
        await page.goto(`/showcase/workout-print?locale=${locale}`);
        const document = page.getByTestId('workout-print-document');
        await expect(document).toHaveAttribute('lang', locale);
        await expect(document).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        expect(
          await page.evaluate(
            () =>
              window.document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await page.evaluate(() =>
          window.document.fonts.ready.then(() => undefined),
        );
        const accessibility = await new AxeBuilder({ page }).analyze();
        expect(accessibility.violations).toEqual([]);
        await page.screenshot({
          path: path.join(
            screenshotDirectory,
            `${locale}-${theme}-${viewport.name}.png`,
          ),
          fullPage: true,
        });
      }
    }
  }

  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/showcase/workout-print?locale=ar');
  const printButton = page.getByRole('button', { name: 'طباعة البرنامج' });
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  let printButtonReached = false;
  for (let tab = 0; tab < 12; tab += 1) {
    await page.keyboard.press('Tab');
    if (
      await printButton.evaluate((button) => button === document.activeElement)
    ) {
      printButtonReached = true;
      break;
    }
  }
  expect(printButtonReached).toBe(true);
  await expect(printButton).toBeFocused();
  expect(
    await printButton.evaluate(
      (button) => getComputedStyle(button).outlineStyle !== 'none',
    ),
  ).toBe(true);

  for (const locale of ['ar', 'en'] as const) {
    await context.clearCookies();
    await context.addCookies([
      {
        name: LOCALE_COOKIE,
        value: locale,
        url: 'http://localhost:3000',
      },
    ]);
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.goto(`/showcase/workout-print?locale=${locale}`);
    await page.evaluate(() =>
      window.document.fonts.ready.then(() => undefined),
    );
    await page.emulateMedia({ media: 'print' });
    const document = page.getByTestId('workout-print-document');
    await expect(document).toHaveAttribute('lang', locale);
    await expect(document).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr',
    );
    await expect(
      page.getByRole('button', { name: /print plan|طباعة البرنامج/ }),
    ).toBeHidden();
    await expect(page.getByTestId('workout-print-day').nth(1)).toHaveCSS(
      'break-before',
      /page|always/,
    );
    await page.screenshot({
      path: path.join(screenshotDirectory, `${locale}-print-a4.png`),
      fullPage: true,
    });
  }
});
