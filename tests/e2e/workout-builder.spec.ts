import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

const screenshotDirectory = path.join(tmpdir(), 'lifter-s26-f17-builder');
const baseUrl = 'http://localhost:3417';

const PUSH_DAY_ID = '10000000-0000-4000-8000-000000000001';
const PULL_DAY_ID = '10000000-0000-4000-8000-000000000002';
const REST_DAY_ID = '10000000-0000-4000-8000-000000000003';
const BENCH_ITEM_ID = '20000000-0000-4000-8000-000000000001';
const ROW_ITEM_ID = '20000000-0000-4000-8000-000000000002';
const BENCH_SET_ID = '30000000-0000-4000-8000-000000000001';

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

  const moveDown = page.getByRole('button', {
    name: 'Move Bench press down',
  });
  await moveDown.focus();
  await expect(moveDown).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByTestId(`builder-day-${PUSH_DAY_ID}`).locator('[data-item-id]').nth(0)).toHaveAttribute(
    'data-item-id',
    ROW_ITEM_ID,
  );
  await expect(page.getByTestId(`builder-item-${BENCH_ITEM_ID}`)).toHaveAttribute(
    'data-item-id',
    BENCH_ITEM_ID,
  );
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
  const sourceNotes = await source
    .getByLabel('Exercise notes')
    .inputValue();

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
            () =>
              document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await page.evaluate(() =>
          document.fonts.ready.then(() => undefined),
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
});
