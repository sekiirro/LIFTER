// F17 T052 design-gate matrix (FR-024; SC-013): AR-RTL/EN-LTR x light/dark
// x mobile-390/desktop-1440 on the merged-UI evidence page, with an axe
// scan per cell, per-state screenshots and machine-readable a11y evidence.
//
// Screenshots and axe JSON land in process.env.F17_GATE_DIR when set
// (lane evidence run) and in the default Playwright output dir otherwise.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

const PATH = '/showcase/f17-planner';
const locales = ['ar', 'en'] as const;
const themes = ['dark', 'light'] as const;
const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;
type Viewport = keyof typeof viewports;

const stateSections = {
  'manager-empty': '[data-section="manager-empty"]',
  'wizard-review': '[data-section="wizard-step-3"]',
  alternatives: '[data-section="alternatives"]',
  print: '[data-section="print"]',
  volume: '[data-section="volume"]',
} as const;

function gateDir(): string {
  return process.env.F17_GATE_DIR ?? test.info().outputPath('screenshots');
}

async function open(
  page: Page,
  context: import('@playwright/test').BrowserContext,
  locale: Locale,
  theme: 'dark' | 'light',
  viewport: Viewport,
) {
  await page.setViewportSize(viewports[viewport]);
  await context.addCookies([
    {
      name: LOCALE_COOKIE,
      value: locale,
      url: process.env.PLAYWRIGHT_BASE_URL!,
    },
    { name: THEME_COOKIE, value: theme, url: process.env.PLAYWRIGHT_BASE_URL! },
  ]);
  await page.goto(PATH);
  return getMessages(locale);
}

for (const locale of locales) {
  for (const theme of themes) {
    for (const viewport of Object.keys(viewports) as Viewport[]) {
      test(`f17 gate ${locale}/${theme}/${viewport}: axe clean + screenshots`, async ({
        page,
        context,
      }) => {
        const m = await open(page, context, locale, theme, viewport);
        const dir = locale === 'ar' ? 'rtl' : 'ltr';
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute('dir', dir);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.getByTestId('f17-planner-showcase')).toBeVisible();
        await expect(
          page.getByTestId('workout-template-manager').first(),
        ).toBeVisible();
        await expect(page.getByTestId('workout-volume-panel')).toBeVisible();

        // Role-gated control + accessible name must be present in every cell.
        await expect(
          page
            .locator('[data-section="manager-po"]')
            .getByRole('button', { name: m['templates.createGlobal'] }),
        ).toBeVisible();
        await expect(
          page.getByRole('radiogroup', {
            name: m['templates.assignStep1Title'],
          }),
        ).toBeVisible();

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          results.violations.filter(
            (item) => item.impact === 'serious' || item.impact === 'critical',
          ),
        ).toEqual([]);

        const dirPath = gateDir();
        mkdirSync(dirPath, { recursive: true });
        const stem = `f17-${locale}-${theme}-${viewport}`;
        writeFileSync(
          join(dirPath, `${stem}-axe.json`),
          JSON.stringify(
            {
              locale,
              theme,
              viewport,
              violationCount: results.violations.length,
              violations: results.violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                help: v.help,
                nodes: v.nodes.length,
              })),
              passCount: results.passes.length,
              incompleteCount: results.incomplete.length,
              incomplete: results.incomplete.map((v) => ({
                id: v.id,
                help: v.help,
                nodes: v.nodes.length,
                targets: v.nodes.map((n) => ({
                  target: n.target,
                  message: n.failureSummary ?? '',
                })),
              })),
            },
            null,
            2,
          ),
          'utf8',
        );
        await page.screenshot({
          path: join(dirPath, `${stem}.png`),
          fullPage: true,
        });
        for (const [name, selector] of Object.entries(stateSections)) {
          await page
            .locator(selector)
            .first()
            .screenshot({ path: join(dirPath, `${stem}-${name}.png`) });
        }
      });
    }
  }
}

test('f17 gate keyboard: wizard advances on Enter, focus stays visible', async ({
  page,
  context,
}) => {
  await open(page, context, 'en', 'light', 'desktop');
  const wizard = page.getByTestId('template-assign-wizard').first();
  await wizard.getByRole('button', { name: /next/i }).focus();
  await expect(wizard.getByRole('button', { name: /next/i })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    wizard.getByRole('radiogroup', { name: /step 2/i }),
  ).toBeVisible();
});
