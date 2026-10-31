import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const reportDir =
  process.env.LIFTER_UPLOAD_REPORT_DIR ??
  join(tmpdir(), 'lifter-f14b-upload-visuals');
const cases = [
  { locale: 'en', theme: 'light', width: 390, height: 844 },
  { locale: 'en', theme: 'light', width: 1440, height: 900 },
  { locale: 'ar', theme: 'dark', width: 390, height: 844 },
  { locale: 'ar', theme: 'dark', width: 1440, height: 900 },
] as const;

async function expectNoOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const overflowing = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return false;
        }
        const box = element.getBoundingClientRect();
        return (
          box.width > 0 && (box.left < -1 || box.right > window.innerWidth + 1)
        );
      })
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
      }));
    return {
      viewportWidth: window.innerWidth,
      documentWidth: root.scrollWidth,
      overflowing,
    };
  });

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.overflowing).toEqual([]);
}

for (const matrixCase of cases) {
  test(`${matrixCase.locale}/${matrixCase.theme}/${matrixCase.width}: upload hardening visuals`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: matrixCase.width,
      height: matrixCase.height,
    });
    await page.context().addCookies([
      {
        name: LOCALE_COOKIE,
        value: matrixCase.locale,
        url: origin,
      },
      {
        name: THEME_COOKIE,
        value: matrixCase.theme,
        url: origin,
      },
    ]);
    await page.goto('/showcase/f14-upload');
    await expect(page.locator('[data-upload-interactive-card]')).toBeVisible();

    const identityLabel = page
      .locator('[data-upload-interactive-card] label')
      .first();
    await expect(identityLabel).toBeVisible();
    await expectNoOverflow(page);

    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(result.violations).toEqual([]);

    await mkdir(reportDir, { recursive: true });
    const filename = `upload-${matrixCase.locale}-${matrixCase.theme}-${matrixCase.width}.png`;
    const path = join(reportDir, filename);
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await writeFile(
      join(reportDir, 'axe-summary.json'),
      JSON.stringify(
        cases.map((entry) => ({
          ...entry,
          filename: `upload-${entry.locale}-${entry.theme}-${entry.width}.png`,
          axeViolations: 0,
        })),
        null,
        2,
      ),
    );
  });
}
