import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

const screenshotDirectory = path.join(
  tmpdir(),
  process.env.LIFTER_SCREENSHOT_DIR ?? 'lifter-s26-f17-builder',
);
const baseUrl = 'http://localhost:3417';

const PUSH_DAY_ID = '10000000-0000-4000-8000-000000000001';
const PULL_DAY_ID = '10000000-0000-4000-8000-000000000002';
const REST_DAY_ID = '10000000-0000-4000-8000-000000000003';
const BENCH_ITEM_ID = '20000000-0000-4000-8000-000000000001';
const ROW_ITEM_ID = '20000000-0000-4000-8000-000000000002';
const BENCH_WARMUP_SET_ID = '30000000-0000-4000-8000-000000000001';
const BENCH_SET_ID = '30000000-0000-4000-8000-000000000001';
const BENCH_WORKING_SET_ID = '30000000-0000-4000-8000-000000000002';

async function setPreferences(
  context: BrowserContext,
  locale: 'ar' | 'en',
  theme: 'light' | 'dark',
) {
  await context.clearCookies();
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: baseUrl },
    { name: THEME_COOKIE, value: theme, url: baseUrl },
  ]);
}

test('workout builder supports keyboard movement with stable ids', async ({
  page,
  context,
}) => {
  await setPreferences(context, 'en', 'light');
  await page.goto('/showcase/workout-builder?locale=en');

  await expect(
    page.getByRole('heading', { name: 'Workout plan builder' }),
  ).toBeVisible();

  const bench = page.getByTestId(`builder-item-${BENCH_ITEM_ID}`);
  const row = page.getByTestId(`builder-item-${ROW_ITEM_ID}`);
  await expect(bench).toBeVisible();
  await expect(row).toBeVisible();
  await expect(page.getByTestId(`builder-day-${PULL_DAY_ID}`)).toBeVisible();
  await expect(page.getByTestId(`builder-day-${REST_DAY_ID}`)).toBeVisible();

  const moveDown = page.getByRole('button', {
    name: 'Move Bench press down',
  });
  await moveDown.focus();
  await expect(moveDown).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(
    page
      .getByTestId(`builder-day-${PUSH_DAY_ID}`)
      .locator('[data-item-id]')
      .nth(0),
  ).toHaveAttribute('data-item-id', ROW_ITEM_ID);
  await expect(
    page.getByTestId(`builder-item-${BENCH_ITEM_ID}`),
  ).toHaveAttribute('data-item-id', BENCH_ITEM_ID);
  await expect(page.getByTestId(`builder-set-${BENCH_SET_ID}`)).toBeVisible();
});

test('workout builder duplicate remaps ids and preserves authored values', async ({
  page,
  context,
}) => {
  await setPreferences(context, 'en', 'light');
  await page.goto('/showcase/workout-builder?locale=en');

  const source = page.getByTestId(`builder-item-${BENCH_ITEM_ID}`);
  const sourceSetId = await source
    .locator('[data-set-id]')
    .first()
    .getAttribute('data-set-id');
  const sourceNotes = await source.getByLabel('Exercise notes').inputValue();

  await source.getByRole('button', { name: 'Duplicate Bench press' }).click();

  const duplicates = page.locator('[data-item-exercise="bench-press"]');
  await expect(duplicates).toHaveCount(2);

  const duplicate = duplicates.nth(1);
  const duplicateId = await duplicate.getAttribute('data-item-id');
  const duplicateSetId = await duplicate
    .locator('[data-set-id]')
    .first()
    .getAttribute('data-set-id');

  expect(duplicateId).not.toBe(BENCH_ITEM_ID);
  expect(duplicateSetId).not.toBe(sourceSetId);
  await expect(duplicate.getByLabel('Exercise notes')).toHaveValue(sourceNotes);
});

test('workout builder drags an exercise across days without changing ids', async ({
  page,
  context,
}) => {
  await setPreferences(context, 'en', 'light');
  await page.setViewportSize({ width: 1280, height: 5000 });
  await page.goto('/showcase/workout-builder?locale=en');

  const bench = page.getByTestId(`builder-item-${BENCH_ITEM_ID}`);
  const setId = await bench
    .locator('[data-set-id]')
    .first()
    .getAttribute('data-set-id');
  const pullDay = page.getByTestId(`builder-day-${PULL_DAY_ID}`);
  await bench.getByLabel('Drag exercise: Bench press').dragTo(pullDay, {
    targetPosition: { x: 30, y: 30 },
  });

  const movedBench = pullDay.locator(`[data-item-id="${BENCH_ITEM_ID}"]`);
  await expect(movedBench).toBeVisible();
  await expect(movedBench).toHaveAttribute('data-item-id', BENCH_ITEM_ID);
  await expect(movedBench.locator('[data-set-id]').first()).toHaveAttribute(
    'data-set-id',
    setId ?? '',
  );
});

test('workout builder renders Arabic-Indic digits and stores canonical input values', async ({
  page,
  context,
}) => {
  await setPreferences(context, 'ar', 'light');
  await page.goto('/showcase/workout-builder?locale=ar');

  const pushDay = page.getByTestId(`builder-day-${PUSH_DAY_ID}`);
  await expect(pushDay.locator('header').locator('span').first()).toHaveText(
    '١',
  );

  const bench = page.getByTestId(`builder-item-${BENCH_ITEM_ID}`);
  await expect(bench.locator('div').first().locator('span').nth(1)).toHaveText(
    '١',
  );

  const warmup = page.getByTestId(`builder-set-${BENCH_WARMUP_SET_ID}`);
  await expect(warmup.locator('legend')).toHaveText('المجموعة ١');
  await expect(warmup.getByLabel('التكرارات', { exact: true })).toHaveValue(
    '١٠',
  );
  await expect(warmup.getByLabel('مدة الراحة (بالثواني)')).toHaveValue('٤٥');

  const working = page.getByTestId(`builder-set-${BENCH_WORKING_SET_ID}`);
  await expect(working.getByLabel('الحد الأدنى')).toHaveValue('٨');
  await expect(working.getByLabel('الحد الأقصى')).toHaveValue('١٠');
  await expect(working.getByLabel('قيمة الحمل')).toHaveValue('٢٢.٥');
  await expect(working.getByLabel('مدة الراحة (بالثواني)')).toHaveValue('١٢٠');
  await expect(working.getByLabel('التكرارات المتبقية')).toHaveValue('٢');

  await working.getByLabel('قيمة الحمل').fill('٣٤٫٥');
  await expect(working.getByLabel('قيمة الحمل')).toHaveValue('٣٤.٥');
  await working.getByLabel('مدة الراحة (بالثواني)').fill('٩٠');
  await expect(working.getByLabel('مدة الراحة (بالثواني)')).toHaveValue('٩٠');

  await page.getByTestId('language-select').selectOption('en');
  await expect(page.getByTestId('workout-builder')).toHaveAttribute(
    'lang',
    'en',
  );
  const workingInEnglish = page.getByTestId(
    `builder-set-${BENCH_WORKING_SET_ID}`,
  );
  await expect(workingInEnglish.getByLabel('Load value')).toHaveValue('34.5');
  await expect(workingInEnglish.getByLabel('Rest (seconds)')).toHaveValue('90');
});

test('workout builder renders bilingual responsive states without axe violations', async ({
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
        await setPreferences(context, locale, theme);
        await page.setViewportSize(viewport);
        await page.goto(`/showcase/workout-builder?locale=${locale}`);
        await expect(page.getByTestId('workout-builder')).toHaveAttribute(
          'lang',
          locale,
        );
        await expect(page.getByTestId('workout-builder')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const accessibility = await new AxeBuilder({ page }).analyze();
        expect(accessibility.violations).toEqual([]);
        await page.screenshot({
          path: path.join(
            screenshotDirectory,
            `builder-${locale}-${theme}-${viewport.name}.png`,
          ),
          fullPage: true,
        });
      }
    }
  }
});
