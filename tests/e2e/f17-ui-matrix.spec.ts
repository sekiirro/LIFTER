// F17 T045 (FR-024; SC-013): AR-RTL/EN-LTR x light/dark x mobile/desktop
// Playwright + axe matrix over the merged-UI evidence page, covering every
// required state and the keyboard path. All asserted names come from the
// PO-approved `lib/i18n/messages` bundle; no copy is authored here.
//
// The RTL `dir` and radiogroup accessible-name assertions are the mutation
// targets: removing either from the implementation must fail this suite.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

const PATH = '/showcase/f17-planner';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL!;
const locales = ['ar', 'en'] as const;
const themes = ['dark', 'light'] as const;
const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;
type Viewport = keyof typeof viewports;

function shotDir(): string {
  return process.env.F17_GATE_DIR ?? test.info().outputPath('screenshots');
}

async function openCell(
  page: Page,
  context: import('@playwright/test').BrowserContext,
  locale: Locale,
  theme: 'dark' | 'light',
  viewport: Viewport,
) {
  await page.setViewportSize(viewports[viewport]);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: BASE_URL },
    { name: THEME_COOKIE, value: theme, url: BASE_URL },
  ]);
  const response = await page.goto(PATH);
  expect(response?.status()).toBe(200);
  return getMessages(locale);
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter(
      (item) => item.impact === 'serious' || item.impact === 'critical',
    ),
  ).toEqual([]);
}

for (const locale of locales) {
  for (const theme of themes) {
    for (const viewport of Object.keys(viewports) as Viewport[]) {
      test(`T045 ${locale}/${theme}/${viewport}: direction, approved names, states, axe`, async ({
        page,
        context,
      }) => {
        const m = await openCell(page, context, locale, theme, viewport);
        const dir = locale === 'ar' ? 'rtl' : 'ltr';

        // Document-level bilingual / theme contract, including RTL attribute.
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute('dir', dir);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.getByTestId('f17-planner-showcase')).toBeVisible();

        // Each merged panel carries the smart-mirroring direction and language.
        for (const testId of [
          'workout-template-manager',
          'workout-volume-panel',
          'template-assign-wizard',
          'workout-alternatives-editor',
          'entry-prescription-fields',
        ]) {
          const panel = page.getByTestId(testId).first();
          await expect(panel).toBeVisible();
          await expect(panel).toHaveAttribute('dir', dir);
          await expect(panel).toHaveAttribute('lang', locale);
        }

        // Accessible names are the PO-approved headings (not authored copy).
        await expect(
          page.getByRole('region', { name: m['templates.listTitle'] }).first(),
        ).toBeVisible();
        await expect(
          page.getByRole('region', { name: m['workout.volume.title'] }),
        ).toBeVisible();

        // Radiogroup accessible names — mutation target (remove aria-label).
        await expect(
          page.getByRole('radiogroup', {
            name: m['templates.assignStep1Title'],
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('radiogroup', {
            name: m['templates.assignStep2Title'],
          }),
        ).toBeVisible();

        // Role-gated control: PO sees Create global; Trainer does not.
        const poManager = page.locator('[data-section="manager-po"]');
        const trainerManager = page.locator('[data-section="manager-trainer"]');
        await expect(
          poManager.getByRole('button', { name: m['templates.createGlobal'] }),
        ).toBeVisible();
        await expect(
          trainerManager.getByRole('button', {
            name: m['templates.createGlobal'],
          }),
        ).toHaveCount(0);

        // Required states: empty, success, skipped, no-copies, unavailable.
        await expect(
          page
            .locator('[data-section="manager-empty"]')
            .getByText(m['templates.empty']),
        ).toBeVisible();
        const receipt = page.locator('[data-section="wizard-step-3"]');
        await expect(
          receipt.getByTestId('assign-receipt-ws-kendo'),
        ).toContainText(m['templates.outcomeAssigned']);
        await expect(
          receipt.getByTestId('assign-receipt-ws-alpha'),
        ).toContainText(m['templates.outcomeSkippedAssigned']);
        await expect(
          receipt.getByTestId('assign-receipt-ws-beta'),
        ).toContainText(m['templates.outcomeNoCopies']);
        await expect(
          page.getByTestId('alternative-unavailable-1'),
        ).toContainText(m['builder.alternativeUnavailable']);

        // Mixed-direction content: Latin numbers stay LTR even in AR.
        expect(
          await page
            .getByTestId('workout-volume-panel')
            .locator('bdi[dir="ltr"]')
            .count(),
        ).toBeGreaterThan(0);

        await axeClean(page);

        const shotPath = shotDir();
        mkdirSync(shotPath, { recursive: true });
        await page.screenshot({
          path: join(shotPath, `f17-matrix-${locale}-${theme}-${viewport}.png`),
          fullPage: true,
        });
      });
    }
  }
}

for (const locale of locales) {
  test(`T045 ${locale} interaction states: disabled, pending, focus`, async ({
    page,
    context,
  }) => {
    const m = await openCell(page, context, locale, 'light', 'desktop');
    const wizard = page.locator(
      '[data-section="wizard-step-1"] [data-testid="template-assign-wizard"]',
    );
    const next = wizard.getByRole('button', {
      name: m['templates.assignNext'],
    });

    // Selecting a non-default mode with no template chosen disables Next.
    await wizard
      .getByRole('radio', { name: m['templates.assignModeSpecific'] })
      .check();
    await expect(next).toBeDisabled();

    // Choosing a template re-enables the control (interaction state).
    await wizard.getByRole('checkbox', { name: /Global Strength/ }).check();
    await expect(next).toBeEnabled();
    await next.focus();
    await expect(next).toBeFocused();

    // Advancing to step 2 then selecting a specific target mode reveals the
    // workspace checkboxes; the step-3 review has no receipt yet (pending).
    await next.click();
    await wizard
      .getByRole('radio', { name: m['templates.assignTargetSpecific'] })
      .check();
    await wizard
      .getByRole('checkbox', { name: /Kendo|Alpha|Beta/ })
      .first()
      .check();
    await next.click();
    // A step-3 review whose receipt has not resolved shows the Review heading
    // and no per-workspace receipt rows yet (the pending state).
    await expect(
      wizard.getByRole('heading', { name: m['templates.assignReviewTitle'] }),
    ).toBeVisible();
    await expect(
      wizard.locator('[data-testid^="assign-receipt-"]'),
    ).toHaveCount(0);

    const shotPath = shotDir();
    mkdirSync(shotPath, { recursive: true });
    await wizard.screenshot({
      path: join(shotPath, `f17-states-${locale}-pending.png`),
    });
  });
}

test('T045 keyboard: wizard advances on Enter and focus stays visible (AR RTL)', async ({
  page,
  context,
}) => {
  const m = await openCell(page, context, 'ar', 'light', 'desktop');
  const wizard = page.locator(
    '[data-section="wizard-step-1"] [data-testid="template-assign-wizard"]',
  );
  const next = wizard.getByRole('button', { name: m['templates.assignNext'] });
  await next.focus();
  await expect(next).toBeFocused();
  await expect(next).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(
    wizard.getByRole('radiogroup', { name: m['templates.assignStep2Title'] }),
  ).toBeVisible();
});
