// F17 T052 design-gate matrix (FR-024; SC-013): AR-RTL/EN-LTR x light/dark
// x mobile-390/desktop-1440 on the merged-UI evidence page, with an axe
// scan per cell and full-page screenshots for the gate report.
//
// Screenshots land in process.env.F17_GATE_DIR when set (lane evidence run)
// and in the default Playwright output dir otherwise.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

const PATH = '/showcase/f17-planner';
const locales = ['ar', 'en'] as const;
const themes = ['dark', 'light'] as const;
const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

function gateDir(): string {
  return process.env.F17_GATE_DIR ?? test.info().outputPath('screenshots');
}

for (const locale of locales) {
  for (const theme of themes) {
    for (const viewport of Object.keys(
      viewports,
    ) as (keyof typeof viewports)[]) {
      test(`f17 gate ${locale}/${theme}/${viewport}: axe clean + screenshot`, async ({
        page,
        context,
      }) => {
        await page.setViewportSize(viewports[viewport]);
        await context.addCookies([
          {
            name: LOCALE_COOKIE,
            value: locale,
            url: process.env.PLAYWRIGHT_BASE_URL!,
          },
          {
            name: THEME_COOKIE,
            value: theme,
            url: process.env.PLAYWRIGHT_BASE_URL!,
          },
        ]);
        await page.goto(PATH);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.getByTestId('f17-planner-showcase')).toBeVisible();
        await expect(
          page.getByTestId('workout-template-manager').first(),
        ).toBeVisible();
        await expect(page.getByTestId('workout-volume-panel')).toBeVisible();

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          results.violations.filter(
            (item) => item.impact === 'serious' || item.impact === 'critical',
          ),
        ).toEqual([]);

        const dir = gateDir();
        mkdirSync(dir, { recursive: true });
        await page.screenshot({
          path: join(dir, `f17-${locale}-${theme}-${viewport}.png`),
          fullPage: true,
        });
      });
    }
  }
}

test('f17 gate keyboard: wizard advances on Enter, focus stays visible', async ({
  page,
  context,
}) => {
  await page.setViewportSize(viewports.desktop);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: 'en', url: process.env.PLAYWRIGHT_BASE_URL! },
    {
      name: THEME_COOKIE,
      value: 'light',
      url: process.env.PLAYWRIGHT_BASE_URL!,
    },
  ]);
  await page.goto(PATH);
  const wizard = page.getByTestId('template-assign-wizard').first();
  await wizard.getByRole('button', { name: /next/i }).focus();
  await expect(wizard.getByRole('button', { name: /next/i })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    wizard.getByRole('radiogroup', { name: /step 2/i }),
  ).toBeVisible();
});
