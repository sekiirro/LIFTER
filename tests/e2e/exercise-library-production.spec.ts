import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3437';
const screenshotDir = join(tmpdir(), 'lifter-s28-f16-lib3');
const local = Boolean(
  process.env.DB_URL || process.env.SUPABASE_DB_URL || process.env.API_URL,
);
let fixture: Awaited<
  ReturnType<(typeof import('../integration/harness'))['twoWorkspaceFixture']>
>;
let exerciseId: string;

async function authenticate(
  page: Page,
  locale: 'ar' | 'en',
  theme: 'light' | 'dark',
) {
  await page.context().addCookies([
    { name: LOCALE_COOKIE, value: locale, url: origin },
    { name: THEME_COOKIE, value: theme, url: origin },
    {
      name: 'sb-127-auth-token',
      value: `base64-${Buffer.from(JSON.stringify((await fixture.po.client.auth.getSession()).data.session)).toString('base64url')}`,
      url: origin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function assertAxe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
      'wcag22a',
      'wcag22aa',
    ])
    .analyze();
  expect(result.violations).toEqual([]);
}

test.beforeAll(async () => {
  test.skip(!local, 'Requires the selected disposable local database.');
  const { twoWorkspaceFixture } = await import('../integration/harness');
  fixture = await twoWorkspaceFixture();
  const created = await fixture.po.client.rpc('catalog_create_exercise', {
    p_operation_key: randomUUID(),
    p_request: {
      name_ar: 'تمرين اختبار تفاصيل المكتبة',
      name_en: 'S28 persisted integration exercise',
      primary_muscle_code: 'chest',
      secondary_muscle_codes: ['triceps'],
      equipment_codes: ['barbell'],
      defaults: {
        warmup_sets: 1,
        working_sets: 3,
        reps: { min: 8, max: 12 },
        rest_seconds: 90,
        rir: 2,
        alternative_exercise_ids: [],
      },
    },
  });
  if (created.error) throw new Error(created.error.message);
  exerciseId = created.data.exercise_id;
  const variation = await fixture.po.client.rpc('catalog_write_variation', {
    p_workspace_id: fixture.wsA.id,
    p_exercise_id: exerciseId,
    p_expected_version: null,
    p_operation_key: randomUUID(),
    p_request: { video_url: 'https://youtu.be/abcdefghijk', note: '' },
  });
  if (variation.error) throw new Error(variation.error.message);
  await mkdir(screenshotDir, { recursive: true });
});

test.afterAll(async () => {
  if (local) {
    const { sql } = await import('../integration/harness');
    await sql().end();
  }
});

for (const locale of ['ar', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of [
      { name: '390', width: 390, height: 844 },
      { name: '1440', width: 1440, height: 900 },
    ]) {
      test(`${locale} ${theme} ${viewport.name}: production library and manual Add`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await authenticate(page, locale, theme);
        await page.goto('/exercise-library');
        const m = getMessages(locale);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: m['catalog.exerciseTitle'],
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('link', { name: m['catalog.addExercise'] }),
        ).toBeVisible();
        const search = page.getByRole('searchbox', {
          name: m['catalog.searchLabel'],
        });
        await search.focus();
        await expect(search).toHaveCSS('outline-style', 'solid');
        await page.screenshot({
          path: join(
            screenshotDir,
            `${locale}-${theme}-${viewport.name}-library.png`,
          ),
          fullPage: true,
        });
        await assertAxe(page);

        await page.goto('/exercise-library/new');
        const editor = page.getByTestId('exercise-editor');
        await expect(editor).toBeVisible();
        await expect(editor).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        const firstField = editor.getByLabel(m['catalog.editorNameAr']);
        await firstField.focus();
        await expect(firstField).toBeFocused();
        await assertAxe(page);
        await page.screenshot({
          path: join(
            screenshotDir,
            `${locale}-${theme}-${viewport.name}-add.png`,
          ),
          fullPage: true,
        });

        await page.goto(
          `/exercise-library/${exerciseId}?workspace=${fixture.wsA.id}`,
        );
        await expect(page.getByTestId('exercise-detail')).toBeVisible();
        await expect(
          page.getByText(m['catalog.detailOpenVideo']),
        ).toBeVisible();
        const workspaceSelector = page.getByLabel(m['catalog.editorWorkspace']);
        await workspaceSelector.focus();
        await page.keyboard.press('Tab');
        const workspaceSubmit = page.getByRole('button', {
          name: m['catalog.searchSubmit'],
        });
        await expect(workspaceSubmit).toBeFocused();
        await expect(workspaceSubmit).toHaveCSS('outline-style', 'solid');
        await assertAxe(page);
        await page.screenshot({
          path: join(
            screenshotDir,
            `${locale}-${theme}-${viewport.name}-detail.png`,
          ),
          fullPage: true,
        });

        await page.goto(`/exercise-library/${exerciseId}/edit`);
        const editEditor = page.getByTestId('exercise-editor');
        await expect(editEditor).toBeVisible();
        const nameAr = editEditor.getByLabel(m['catalog.editorNameAr']);
        await nameAr.focus();
        await page.keyboard.press('Tab');
        await expect(
          editEditor.getByLabel(m['catalog.editorNameEn']),
        ).toBeFocused();
        await assertAxe(page);
        await page.screenshot({
          path: join(
            screenshotDir,
            `${locale}-${theme}-${viewport.name}-edit.png`,
          ),
          fullPage: true,
        });
      });
    }
  }
}
