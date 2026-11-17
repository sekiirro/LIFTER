// F18 T025 browser gates (F18-FR-002/006/021/023; SC-011/012).
// Scoped to the nutrition editor / alternatives / template-manager UI only:
// the AR-RTL/EN-LTR x light/dark x mobile/desktop matrix with an axe scan and
// screenshot per cell, plus keyboard-move, alternatives and role/status checks.
// Run only this spec locally; do not run the whole e2e suite.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mockPlanDocument } from '../../app/(dev)/showcase/f18-plan-editor/mock';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

const EDITOR_PATH = '/showcase/f18-plan-editor';
const MANAGER_PATH = '/showcase/f18-template-manager';
const locales = ['ar', 'en'] as const;
const themes = ['dark', 'light'] as const;
const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

type Locale = (typeof locales)[number];
type Theme = (typeof themes)[number];
type Viewport = keyof typeof viewports;

const mockMeals = mockPlanDocument().meals ?? [];
const breakfast = mockMeals[0]!;
const oats = breakfast.items[0]!;

function gateDir(): string {
  return process.env.F18_GATE_DIR ?? test.info().outputPath('screenshots');
}

async function open(
  page: Page,
  context: BrowserContext,
  path: string,
  locale: Locale,
  theme: Theme,
  viewport: Viewport,
): Promise<void> {
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
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function axeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter(
      (item) => item.impact === 'serious' || item.impact === 'critical',
    ),
  ).toEqual([]);
}

async function shoot(
  page: Page,
  name: string,
  locale: Locale,
  theme: Theme,
  viewport: Viewport,
): Promise<void> {
  const dir = gateDir();
  mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: join(dir, `f18-t025-${name}-${locale}-${theme}-${viewport}.png`),
    fullPage: true,
  });
}

for (const locale of locales) {
  for (const theme of themes) {
    for (const viewport of Object.keys(viewports) as Viewport[]) {
      test(`editor ${locale}/${theme}/${viewport}: axe clean + screenshot`, async ({
        page,
        context,
      }) => {
        await open(page, context, EDITOR_PATH, locale, theme, viewport);
        await expect(
          page.getByTestId('f18-plan-editor-showcase'),
        ).toBeVisible();
        await expect(page.getByTestId('nutrition-plan-editor')).toBeVisible();
        await axeClean(page);
        await shoot(page, 'editor', locale, theme, viewport);
      });

      test(`template manager ${locale}/${theme}/${viewport}: axe clean + screenshot`, async ({
        page,
        context,
      }) => {
        await open(page, context, MANAGER_PATH, locale, theme, viewport);
        await expect(
          page.getByTestId('f18-template-manager-showcase'),
        ).toBeVisible();
        await expect(
          page.getByTestId('nutrition-template-manager'),
        ).toBeVisible();
        await axeClean(page);
        await shoot(page, 'manager', locale, theme, viewport);
      });
    }
  }
}

test('editor: keyboard meal move, live totals, independent notes, no day-type filter', async ({
  page,
  context,
}) => {
  await open(page, context, EDITOR_PATH, 'en', 'light', 'desktop');
  const editor = page.getByTestId('nutrition-plan-editor');
  await expect(editor).toHaveAttribute('dir', 'ltr');

  const meals = page.locator('[data-testid^="meal-meal-"]');
  await expect(meals).toHaveCount(2);
  await expect(meals.nth(0)).toHaveAttribute(
    'data-testid',
    'meal-meal-breakfast',
  );
  await expect(meals.nth(1)).toHaveAttribute('data-testid', 'meal-meal-lunch');
  // Both meals stay visible; the implicit training day does not filter them.
  await expect(meals.nth(0)).toContainText('Breakfast');
  await expect(meals.nth(1)).toContainText('Lunch');

  const moveDown = page.getByRole('button', {
    name: `${en['nutritionPlan.moveDown']} — Breakfast`,
  });
  await moveDown.focus();
  await expect(moveDown).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(meals.nth(0)).toHaveAttribute('data-testid', 'meal-meal-lunch');
  await expect(meals.nth(1)).toHaveAttribute(
    'data-testid',
    'meal-meal-breakfast',
  );

  const live = page.getByTestId('nutrition-totals-live');
  await expect(live).toHaveAttribute('aria-live', 'polite');
  await expect(live).toContainText(en['nutritionPlan.totalsAnnouncement']);

  const mealNote = page.getByTestId('meal-note-meal-breakfast');
  const foodNote = page.getByTestId(`food-note-${oats.id}`);
  await expect(mealNote).toHaveValue(breakfast.note!);
  await expect(foodNote).toHaveValue(oats.note!);
  await mealNote.fill('edited meal note');
  await expect(foodNote).toHaveValue(oats.note!);
  await foodNote.fill('edited food note');
  await expect(mealNote).toHaveValue('edited meal note');
  await mealNote.fill('');
  await expect(foodNote).toHaveValue('edited food note');
});

test('alternatives: unified original-first list and keyboard move', async ({
  page,
  context,
}) => {
  await open(page, context, EDITOR_PATH, 'en', 'light', 'desktop');
  const section = page.getByTestId('alternatives-item-chicken');
  await expect(section).toBeVisible();
  await expect(
    section.getByRole('list', {
      name: en['nutritionAlternatives.unifiedListLabel'],
    }),
  ).toBeVisible();
  await expect(section.locator('dl')).toHaveCount(3);

  const rows = section.locator('ol li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute('data-original', 'true');
  await expect(rows.nth(0)).toContainText(en['nutritionAlternatives.original']);
  await expect(rows.nth(1)).toContainText('Cooked white rice');
  await expect(rows.nth(2)).toContainText('Oats with milk');

  const moveDown = rows.nth(1).getByRole('button', {
    name: `${en['nutritionAlternatives.moveDown']} — ${en['nutritionAlternatives.alternative']} 1`,
  });
  await moveDown.focus();
  await expect(moveDown).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(rows.nth(1)).toContainText('Oats with milk');
  await expect(rows.nth(2)).toContainText('Cooked white rice');
});

test('template manager: role gating, load entry points and status states', async ({
  page,
  context,
}) => {
  await open(
    page,
    context,
    `${MANAGER_PATH}?role=PO&status=ready`,
    'en',
    'light',
    'desktop',
  );
  const manager = page.getByTestId('nutrition-template-manager');
  await expect(manager).toBeVisible();
  await expect(
    page.getByTestId('nutrition-template-scope-global'),
  ).toBeVisible();
  await expect(
    page.getByTestId('nutrition-template-scope-workspace'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: en['nutritionTemplates.loadVersion'] }),
  ).toHaveCount(3);
  await expect(page.getByText('Kendo Cut Plan').first()).toBeVisible();

  await page.goto(`${MANAGER_PATH}?role=Trainer&status=ready`);
  await expect(page.getByTestId('nutrition-template-scope-global')).toHaveCount(
    0,
  );
  await expect(
    page.getByTestId('nutrition-template-scope-workspace'),
  ).toBeVisible();

  await page.goto(`${MANAGER_PATH}?role=Trainer&status=loading`);
  await expect(page.getByText(en['nutritionTemplates.loading'])).toBeVisible();
  await expect(page.getByText('Kendo Cut Plan')).toHaveCount(0);

  await page.goto(`${MANAGER_PATH}?role=Trainer&status=error`);
  await expect(
    page.getByText(en['nutritionTemplates.errorTitle']),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: en['nutritionTemplates.retry'] }),
  ).toBeVisible();
});

test('Arabic RTL editor and alternatives use approved copy and bidi digits', async ({
  page,
  context,
}) => {
  await open(page, context, EDITOR_PATH, 'ar', 'dark', 'mobile');
  const editor = page.getByTestId('nutrition-plan-editor');
  await expect(editor).toHaveAttribute('dir', 'rtl');
  await expect(
    page.getByText(ar['nutritionPlan.mealNotes']).first(),
  ).toBeVisible();
  await expect(
    page.getByText(ar['nutritionPlan.foodNotes']).first(),
  ).toBeVisible();
  await expect(page.getByTestId('nutrition-totals-live')).toHaveText(
    /[\u0660-\u0669]/,
  );
  const section = page.getByTestId(`alternatives-${oats.id}`);
  await expect(section).toHaveAttribute('dir', 'rtl');
  await expect(
    section.getByText(ar['nutritionAlternatives.title']),
  ).toBeVisible();
});
