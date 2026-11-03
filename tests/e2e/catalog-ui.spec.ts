import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

const screenshotDir = join(tmpdir(), 'lifter-s26-f16-ui-3');
const testBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
mkdirSync(screenshotDir, { recursive: true });

const visualMatrix = [
  {
    locale: 'ar',
    direction: 'rtl',
    theme: 'light',
    viewport: 'mobile',
    width: 390,
    height: 844,
  },
  {
    locale: 'ar',
    direction: 'rtl',
    theme: 'light',
    viewport: 'desktop',
    width: 1440,
    height: 900,
  },
  {
    locale: 'ar',
    direction: 'rtl',
    theme: 'dark',
    viewport: 'mobile',
    width: 390,
    height: 844,
  },
  {
    locale: 'ar',
    direction: 'rtl',
    theme: 'dark',
    viewport: 'desktop',
    width: 1440,
    height: 900,
  },
  {
    locale: 'en',
    direction: 'ltr',
    theme: 'light',
    viewport: 'mobile',
    width: 390,
    height: 844,
  },
  {
    locale: 'en',
    direction: 'ltr',
    theme: 'light',
    viewport: 'desktop',
    width: 1440,
    height: 900,
  },
  {
    locale: 'en',
    direction: 'ltr',
    theme: 'dark',
    viewport: 'mobile',
    width: 390,
    height: 844,
  },
  {
    locale: 'en',
    direction: 'ltr',
    theme: 'dark',
    viewport: 'desktop',
    width: 1440,
    height: 900,
  },
] as const;
const matrix = visualMatrix.flatMap((row) =>
  (['default', 'sample'] as const).map((brand) => ({ ...row, brand })),
);

async function setPreferences(page: Page, row: (typeof matrix)[number]) {
  await page.context().addCookies([
    {
      name: 'lifter_locale',
      value: row.locale,
      url: testBaseURL,
    },
    {
      name: 'lifter_theme',
      value: row.theme,
      url: testBaseURL,
    },
  ]);
  await page.setViewportSize({ width: row.width, height: row.height });
}

function messages(locale: 'ar' | 'en') {
  return locale === 'ar' ? ar : en;
}

async function assertAxeClean(page: Page) {
  await page.locator('body').hover({ position: { x: 2, y: 2 } });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);
}

async function capture(
  target: Locator,
  row: (typeof matrix)[number],
  flow: string,
) {
  const name = `${row.locale}-${row.theme}-${row.viewport}-${row.brand}-${flow}.png`;
  await target.screenshot({ path: join(screenshotDir, name) });
}

async function assertBrandScope(page: Page, row: (typeof matrix)[number]) {
  const scope = page.getByTestId('catalog-brand-scope');
  if (row.brand === 'default') {
    await expect(scope).toHaveCount(0);
    return;
  }
  await expect(scope).toBeVisible();
  const colors = await scope.evaluate((element) => {
    const local = getComputedStyle(element);
    const root = getComputedStyle(document.documentElement);
    return {
      brand: [
        local.getPropertyValue('--brand-fill'),
        root.getPropertyValue('--brand-fill'),
      ],
      semantic: [
        local.getPropertyValue('--color-success-fg'),
        root.getPropertyValue('--color-success-fg'),
        local.getPropertyValue('--color-warning-fg'),
        root.getPropertyValue('--color-warning-fg'),
        local.getPropertyValue('--color-error-fg'),
        root.getPropertyValue('--color-error-fg'),
      ],
    };
  });
  expect(colors.brand[0]).not.toBe(colors.brand[1]);
  expect(colors.semantic[0]).toBe(colors.semantic[1]);
  expect(colors.semantic[2]).toBe(colors.semantic[3]);
  expect(colors.semantic[4]).toBe(colors.semantic[5]);
}

for (const row of matrix) {
  test(`catalog list, keyboard search, add/edit, variation and duplicate review: ${row.locale} ${row.theme} ${row.viewport} ${row.brand}`, async ({
    page,
  }) => {
    await setPreferences(page, row);
    const m = messages(row.locale);

    const brandParam = row.brand === 'sample' ? '&brand=sample' : '';
    await page.goto(
      `/showcase/catalog?kind=food&view=list&role=trainer${brandParam}`,
    );
    await assertBrandScope(page, row);
    const editorHref = await page
      .getByTestId('catalog-view-editor')
      .getAttribute('href');
    if (row.brand === 'sample') expect(editorHref).toContain('brand=sample');
    else expect(editorHref).not.toContain('brand=sample');
    const list = page.getByTestId('catalog-shell');
    await expect(list).toHaveAttribute('dir', row.direction);
    await expect(list).toHaveAttribute('lang', row.locale);
    const searchbox = page.getByRole('searchbox', {
      name: m['catalog.searchLabel'],
    });
    await expect(searchbox).toBeVisible();
    await searchbox.focus();
    await expect(searchbox).toHaveCSS('outline-style', 'solid');
    await expect(searchbox).toHaveCSS('outline-width', '2px');
    const searchButton = page.getByRole('button', {
      name: m['catalog.searchSubmit'],
    });
    const searchButtonBox = await searchButton.boundingBox();
    expect(searchButtonBox?.height).toBeGreaterThanOrEqual(44);
    await searchbox.fill('zzzz-no-match');
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: m['catalog.noResultsTitle'] }),
    ).toBeVisible();
    await assertAxeClean(page);
    await page.goto(
      `/showcase/catalog?kind=food&view=list&role=trainer${brandParam}`,
    );
    await expect(list).toBeVisible();
    await capture(list, row, 'list-search');

    await page.goto(
      `/showcase/catalog?view=editor&role=po&scope=global${brandParam}`,
    );
    await assertBrandScope(page, row);
    const editor = page.getByTestId('exercise-editor');
    await expect(editor).toHaveAttribute('dir', row.direction);
    await expect(editor.getByTestId('exercise-governance')).toBeVisible();
    await expect(
      editor.getByRole('button', { name: m['catalog.editorRemove'] }),
    ).toBeVisible();
    await assertAxeClean(page);
    await capture(editor, row, 'exercise-edit-po');

    await page.goto(
      `/showcase/catalog?view=editor&role=trainer&scope=workspace&coachingWork=true${brandParam}`,
    );
    await assertBrandScope(page, row);
    const staffEditor = page.getByTestId('exercise-editor');
    await expect(staffEditor).toHaveAttribute('dir', row.direction);
    await expect(staffEditor.getByTestId('exercise-governance')).toHaveCount(0);
    const workspaceExerciseName = staffEditor.getByLabel(
      m['catalog.editorNameEn'],
    );
    await workspaceExerciseName.fill('Kendo squat');
    await expect(workspaceExerciseName).toHaveValue('Kendo squat');
    await expect(
      staffEditor.getByRole('button', {
        name: m['catalog.editorSaveWorkspace'],
      }),
    ).toBeVisible();
    await assertAxeClean(page);
    await capture(staffEditor, row, 'exercise-edit-trainer');

    const foodBrandParam = row.brand === 'sample' ? '?brand=sample' : '';
    await page.goto(`/showcase/catalog-foods${foodBrandParam}`);
    await assertBrandScope(page, row);
    const foodEditor = page.getByTestId('food-editor');
    await expect(foodEditor).toHaveAttribute('dir', row.direction);
    const foodName = foodEditor.getByLabel(m['catalog.foodNameEn']);
    await expect(foodName).toHaveValue('Cooked white rice');
    await foodName.fill('Cooked long-grain rice');
    await expect(foodName).toHaveValue('Cooked long-grain rice');
    await expect(foodEditor.getByLabel(m['catalog.foodProduct'])).toHaveValue(
      'white rice',
    );
    await foodEditor
      .getByRole('button', { name: m['catalog.foodAlternativeAdd'] })
      .focus();
    await page.keyboard.press('Enter');
    await expect(foodEditor.locator('select[id*="alternative-"]')).toHaveCount(
      2,
    );
    await assertAxeClean(page);
    await capture(foodEditor, row, 'food-add-edit');

    await page.goto(`/showcase/catalog-foods?state=exact${brandParam}`);
    await assertBrandScope(page, row);
    await expect(page.getByTestId('duplicate-review')).toHaveAttribute(
      'dir',
      row.direction,
    );
    await page
      .getByRole('button', { name: m['catalog.duplicateSelectExisting'] })
      .focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText(
      m['catalog.duplicateExistingSelected'],
    );
    await assertAxeClean(page);
    await capture(page.getByTestId('duplicate-review'), row, 'duplicate-exact');

    await page.goto(`/showcase/catalog-foods?state=near${brandParam}`);
    await assertBrandScope(page, row);
    const continueButton = page.getByRole('button', {
      name: m['catalog.duplicateContinue'],
    });
    await expect(continueButton).toBeDisabled();
    const confirmation = page.getByRole('checkbox', {
      name: m['catalog.duplicateConfirm'],
    });
    await confirmation.focus();
    await page.keyboard.press('Space');
    await expect(continueButton).toBeEnabled();
    await expect(continueButton).toHaveCSS('opacity', '1');
    await assertAxeClean(page);
    await capture(
      page.getByTestId('duplicate-review'),
      row,
      'duplicate-near-confirmation',
    );

    await page.goto(`/showcase/catalog-foods?state=video${brandParam}`);
    await assertBrandScope(page, row);
    const variation = page.getByTestId('video-variation-editor');
    await expect(variation).toHaveAttribute('dir', row.direction);
    await expect(
      variation.getByLabel(m['catalog.videoVariationWorkspace']),
    ).toHaveValue('fixture-kendo');
    await expect(
      variation.getByLabel(m['catalog.videoVariationUrl']),
    ).toHaveValue('https://youtu.be/abcdefghijk');
    await assertAxeClean(page);
    await capture(variation, row, 'variation');
  });
}
