import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { assertLocalStackTarget } from '../../scripts/local-stack.mjs';
import { isDisposableStackC } from './disposable-stack';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3437';
const screenshotDir =
  process.env.LIFTER_SCREENSHOT_DIR ?? join(tmpdir(), 'lifter-s32-f16-lib15');
const apiUrl = process.env.API_URL || process.env.SUPABASE_URL;
const dbUrl = process.env.DB_URL || process.env.SUPABASE_DB_URL;
const assignedStackA = (() => {
  if (process.env.LIFTER_SUPABASE_STACK !== 'a' || !apiUrl || !dbUrl)
    return false;
  try {
    return (
      assertLocalStackTarget({ stack: 'a', apiUrl, dbUrl }).projectId ===
      'lifter'
    );
  } catch {
    return false;
  }
})();
const local = isDisposableStackC(process.env) || assignedStackA;
let fixture: Awaited<
  ReturnType<(typeof import('../integration/harness'))['twoWorkspaceFixture']>
>;
let exerciseId: string;

async function authenticate(
  page: Page,
  locale: 'ar' | 'en',
  theme: 'light' | 'dark',
  actor = fixture.po,
) {
  await page.context().addCookies([
    { name: LOCALE_COOKIE, value: locale, url: origin },
    { name: THEME_COOKIE, value: theme, url: origin },
    {
      name: 'sb-127-auth-token',
      value: `base64-${Buffer.from(JSON.stringify((await actor.client.auth.getSession()).data.session)).toString('base64url')}`,
      url: origin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function createWorkspaceExercise() {
  const result = await fixture.po.client.rpc(
    'catalog_write_workspace_exercise',
    {
      p_workspace_id: fixture.wsA.id,
      p_exercise_id: null,
      p_expected_version: null,
      p_operation_key: randomUUID(),
      p_request: {
        name_ar: 'تمرين إزالة من مساحة العمل',
        name_en: `S31 workspace removal ${randomUUID()}`,
        primary_muscle_code: 'chest',
        secondary_muscle_codes: ['triceps'],
        equipment_codes: ['barbell'],
        default_reps: 3,
        description: 'Private saved description',
        notes: 'Private saved notes',
      },
    },
  );
  if (result.error) throw new Error(result.error.message);
  return result.data.exercise_id as string;
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
      default_reps: { min: 8, max: 12 },
      default_rest_time: 90,
      default_rir: 2,
      description: 'Global saved description',
      notes: 'Global saved notes',
    },
  });
  if (created.error) throw new Error(created.error.message);
  exerciseId = created.data.exercise_id;
  const variation = await fixture.po.client.rpc(
    'catalog_write_exercise_override',
    {
      p_workspace_id: fixture.wsA.id,
      p_exercise_id: exerciseId,
      p_expected_version: 0,
      p_operation_key: randomUUID(),
      p_request: {
        video_url: 'https://youtu.be/abcdefghijk',
        description: 'Shared saved description',
        notes: 'Shared saved notes',
      },
    },
  );
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
        const sharedDetail = page.getByTestId('exercise-detail');
        await expect(
          sharedDetail.getByText(m['catalog.editorDescription'], {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          sharedDetail.getByText('Shared saved description', { exact: true }),
        ).toBeVisible();
        await expect(
          sharedDetail.getByText('Shared saved notes', { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText(m['catalog.detailOpenVideo']),
        ).toBeVisible();
        const workspaceSelector = page.getByLabel(
          m['catalog.editorWorkspace'],
          {
            exact: true,
          },
        );
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

        await page.goto(`/exercise-library/${exerciseId}?workspace=`);
        const globalDetail = page.getByTestId('exercise-detail');
        await expect(
          globalDetail.getByText('Global saved description', { exact: true }),
        ).toBeVisible();
        await expect(
          globalDetail.getByText('Global saved notes', { exact: true }),
        ).toBeVisible();
        await assertAxe(page);
        await page.screenshot({
          path: join(
            screenshotDir,
            `${locale}-${theme}-${viewport.name}-detail-global.png`,
          ),
          fullPage: true,
        });

        const workspaceExerciseId = await createWorkspaceExercise();
        await page.goto(
          `/exercise-library/${workspaceExerciseId}?scope=workspace&workspace=${fixture.wsA.id}`,
        );
        await expect(page.getByTestId('exercise-detail')).toBeVisible();
        const privateDetail = page.getByTestId('exercise-detail');
        await expect(
          privateDetail.getByText('Private saved description', { exact: true }),
        ).toBeVisible();
        await expect(
          privateDetail.getByText('Private saved notes', { exact: true }),
        ).toBeVisible();
        const workspaceDetailSelector = page.getByLabel(
          m['catalog.editorWorkspace'],
        );
        await expect(
          workspaceDetailSelector.locator('option[value=""]'),
        ).toHaveCount(0);
        await workspaceDetailSelector.focus();
        await expect(workspaceDetailSelector).toHaveCSS(
          'outline-style',
          'solid',
        );
        await assertAxe(page);
        await page.screenshot({
          path: join(
            screenshotDir,
            `${locale}-${theme}-${viewport.name}-detail-workspace.png`,
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

        await page.goto('/catalog-variations');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: m['catalog.videoVariationTitle'],
          }),
        ).toBeVisible();
        const exerciseSelect = page.getByLabel(
          m['catalog.videoVariationExercise'],
        );
        const options = await exerciseSelect
          .locator('option')
          .evaluateAll((elements) =>
            elements
              .map((element) => {
                const option = element as HTMLOptionElement;
                return {
                  value: option.value,
                  label: option.textContent?.trim(),
                };
              })
              .filter(({ value }) => value),
          );
        expect(options.length).toBeGreaterThan(0);
        expect(options.every(({ value, label }) => value !== label)).toBe(true);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await assertAxe(page);
        await page.screenshot({
          path: join(
            screenshotDir,
            `${locale}-${theme}-${viewport.name}-variation.png`,
          ),
          fullPage: true,
        });
      });

      test(`${locale} ${theme} ${viewport.name}: workspace Remove confirmation and removed state`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await authenticate(page, locale, theme);
        const id = await createWorkspaceExercise();
        const href = `/exercise-library/${id}?scope=workspace&workspace=${fixture.wsA.id}`;
        const m = getMessages(locale);
        await page.goto(href);
        await expect(page.getByTestId('exercise-detail')).toBeVisible();
        const remove = page.getByRole('button', {
          name: m['catalog.editorRemove'],
        });
        await expect(remove).toBeVisible();
        await remove.focus();
        await expect(remove).toHaveCSS('outline-style', 'solid');
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole('button', { name: m['dialog.cancel'] }),
        ).toBeFocused();
        await expect(
          dialog.getByRole('heading', { name: m['catalog.editorRemove'] }),
        ).toBeVisible();
        await assertAxe(page);
        await page.screenshot({
          path: join(
            screenshotDir,
            `${locale}-${theme}-${viewport.name}-remove-dialog.png`,
          ),
          fullPage: true,
        });

        await page.keyboard.press('Enter');
        await expect(
          page.getByText(m['catalog.editorLifecycleActive']),
        ).toBeVisible();
        await expect(remove).toBeVisible();
        await expect(remove).toBeFocused();
        await expect(dialog).not.toBeVisible();
        await remove.focus();
        await page.keyboard.press('Enter');
        await page
          .getByRole('dialog')
          .getByRole('button', { name: m['dialog.confirm'] })
          .focus();
        await page.keyboard.press('Enter');
        await expect(
          page
            .getByTestId('exercise-detail')
            .getByText(m['catalog.editorLifecycleRemoved'])
            .first(),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: m['catalog.editorRemove'] }),
        ).toHaveCount(0);
        await assertAxe(page);
        await page.screenshot({
          path: join(
            screenshotDir,
            `${locale}-${theme}-${viewport.name}-removed.png`,
          ),
          fullPage: true,
        });
      });

      test(`${locale} ${theme} ${viewport.name}: workspace Remove error stays in confirmation dialog`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await authenticate(page, locale, theme);
        const id = await createWorkspaceExercise();
        const href = `/exercise-library/${id}?scope=workspace&workspace=${fixture.wsA.id}`;
        const m = getMessages(locale);
        await page.goto(href);
        const remove = page.getByRole('button', {
          name: m['catalog.editorRemove'],
        });
        await expect(remove).toBeVisible();
        await remove.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();

        const concurrentRemoval = await fixture.po.client.rpc(
          'catalog_remove_workspace_exercise',
          {
            p_workspace_id: fixture.wsA.id,
            p_exercise_id: id,
            p_expected_revision: 0,
            p_operation_key: randomUUID(),
          },
        );
        if (concurrentRemoval.error)
          throw new Error('Synthetic concurrent removal setup failed.');

        const confirm = dialog.getByRole('button', {
          name: m['dialog.confirm'],
        });
        await confirm.click();
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('alert')).toHaveText(
          m['states.error.description'],
        );
        await expect(confirm).toBeEnabled();
        await assertAxe(page);
        await page.screenshot({
          path: join(
            screenshotDir,
            `${locale}-${theme}-${viewport.name}-remove-error.png`,
          ),
          fullPage: true,
        });
      });
    }
  }
}
