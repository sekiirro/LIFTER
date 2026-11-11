import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { assertLocalStackTarget } from '../../scripts/local-stack.mjs';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const screenshotDir =
  process.env.LIFTER_SCREENSHOT_DIR ??
  join(process.cwd(), 'lifter-s47-t040-screens');

function isSelectedLocalStack(env: Record<string, string | undefined>) {
  const stack = env.LIFTER_SUPABASE_STACK;
  if (stack !== 'a' && stack !== 'c') return false;
  const apiUrl = env.API_URL || env.SUPABASE_URL;
  const dbUrl = env.DB_URL || env.SUPABASE_DB_URL;
  if (!apiUrl || !dbUrl) return false;
  try {
    assertLocalStackTarget({ stack, apiUrl, dbUrl });
    return true;
  } catch {
    return false;
  }
}

const local = isSelectedLocalStack(process.env);
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
      value: `base64-${Buffer.from(
        JSON.stringify(
          (await fixture.po.client.auth.getSession()).data.session,
        ),
      ).toString('base64url')}`,
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
  test.skip(!local, 'Requires the selected local Supabase stack.');
  const { twoWorkspaceFixture } = await import('../integration/harness');
  fixture = await twoWorkspaceFixture();
  const created = await fixture.po.client.rpc('catalog_create_exercise', {
    p_operation_key: randomUUID(),
    p_request: {
      name_en: 'S47 authoring fixture press',
      name_ar: 'تمرين تأليف',
      primary_muscle_code: 'chest',
      secondary_muscle_codes: ['triceps'],
      equipment_codes: ['barbell'],
      description: 'Authoring fixture description',
      notes: 'Authoring fixture note',
      video_url: 'https://youtu.be/abcdefghijk',
      default_reps: { min: 8, max: 12 },
      default_rest_time: 90,
      default_rir: 2,
    },
  });
  if (created.error) throw new Error(created.error.message);
  exerciseId = created.data.exercise_id as string;
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
      test(`${locale} ${theme} ${viewport.name}: library, add and edit screens`, async ({
        page,
      }) => {
        test.skip(!local, 'Requires the selected local Supabase stack.');
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await authenticate(page, locale, theme);
        const m = getMessages(locale);

        await page.goto('/exercise-library');
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: m['catalog.exerciseTitle'],
          }),
        ).toBeVisible();
        await assertAxe(page);
        await page.screenshot({
          path: join(
            screenshotDir,
            `${locale}-${theme}-${viewport.name}-library.png`,
          ),
          fullPage: true,
        });

        await page.goto('/exercise-library/new');
        const editor = page.getByTestId('exercise-editor');
        await expect(editor).toBeVisible();
        await expect(
          editor.getByLabel(m['catalog.editorNameEn']),
        ).toBeVisible();
        await expect(
          editor.getByLabel(m['catalog.editorEquipment']),
        ).toBeVisible();
        await expect(
          editor.getByLabel(m['catalog.editorDescription']),
        ).toBeVisible();
        await expect(editor.getByLabel(m['catalog.editorNotes'])).toBeVisible();
        await expect(editor.getByLabel(m['catalog.editorVideo'])).toBeVisible();
        await expect(editor.getByLabel(m['catalog.editorRest'])).toBeVisible();
        await assertAxe(page);
        await page.screenshot({
          path: join(
            screenshotDir,
            `${locale}-${theme}-${viewport.name}-new.png`,
          ),
          fullPage: true,
        });

        await page.goto(`/exercise-library/${exerciseId}/edit`);
        const editEditor = page.getByTestId('exercise-editor');
        await expect(editEditor).toBeVisible();
        await expect(
          editEditor.getByLabel(m['catalog.editorDescription']),
        ).toBeVisible();
        await expect(
          editEditor.getByLabel(m['catalog.editorVideo']),
        ).toBeVisible();
        await assertAxe(page);
        await page.screenshot({
          path: join(
            screenshotDir,
            `${locale}-${theme}-${viewport.name}-edit.png`,
          ),
          fullPage: true,
        });

        await page.goto(
          `/exercise-library/${exerciseId}?workspace=${fixture.wsA.id}`,
        );
        const override = page.getByTestId('exercise-override-editor');
        await expect(override).toBeVisible();
        await expect(
          override.getByLabel(m['catalog.editorDescription']),
        ).toBeVisible();
        await expect(
          override.getByText(m['catalog.overrideInherited']).first(),
        ).toBeVisible();
        await assertAxe(page);
        await page.screenshot({
          path: join(
            screenshotDir,
            `${locale}-${theme}-${viewport.name}-override.png`,
          ),
          fullPage: true,
        });
      });
    }
  }
}

test('creates an English-only Global exercise end to end', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await authenticate(page, 'en', 'light');
  const m = getMessages('en');
  const name = `S47 English only press ${randomUUID()}`;

  await page.goto('/exercise-library/new');
  const editor = page.getByTestId('exercise-editor');
  await editor.getByLabel(m['catalog.editorNameEn']).fill(name);
  expect(await editor.getByLabel(m['catalog.editorNameAr']).inputValue()).toBe(
    '',
  );
  await editor
    .getByLabel(m['catalog.editorPrimaryMuscle'])
    .selectOption('chest');
  await editor.getByLabel(m['catalog.editorEquipment']).selectOption('barbell');
  await editor.getByLabel(m['catalog.editorRepsFixedValue']).fill('8');
  await editor.getByRole('button', { name: m['catalog.editorSave'] }).click();

  await expect(page).toHaveURL(/\/exercise-library/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: m['catalog.exerciseTitle'],
    }),
  ).toBeVisible();

  const { sql } = await import('../integration/harness');
  const rows = (await sql()`
    select v.exercise_id::text as exercise_id,
      v.payload ->> 'name_en' as name_en,
      v.payload -> 'name_ar' as name_ar
    from public.exercise_versions v
    where v.payload ->> 'name_en' = ${name}
  `) as { exercise_id: string; name_en: string; name_ar: unknown }[];
  expect(rows).toHaveLength(1);
  expect(rows[0]?.name_en).toBe(name);
  expect(rows[0]?.name_ar ?? null).toBeNull();

  await page.goto(`/exercise-library/${rows[0]!.exercise_id}`);
  await expect(page.getByTestId('exercise-detail')).toContainText(name);
  await assertAxe(page);
  await page.screenshot({
    path: join(screenshotDir, 'en-light-1440-english-only-created.png'),
    fullPage: true,
  });
});

test('customizes a Global exercise locally and resets one field to Global', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await authenticate(page, 'en', 'light');
  const m = getMessages('en');
  const localDescription = `Local description ${randomUUID()}`;

  await page.goto(
    `/exercise-library/${exerciseId}?workspace=${fixture.wsA.id}`,
  );
  const override = page.getByTestId('exercise-override-editor');
  await expect(override).toBeVisible();
  const description = override.getByLabel(m['catalog.editorDescription']);
  const descriptionReset = override.getByRole('button', {
    name: `${m['catalog.overrideReset']} — ${m['catalog.editorDescription']}`,
  });
  await expect(descriptionReset).toHaveCount(0);

  await description.fill(localDescription);
  await override
    .getByRole('button', { name: m['catalog.editorSaveWorkspace'] })
    .click();
  await expect(descriptionReset).toBeVisible();
  await expect(
    override.getByText(m['catalog.overrideCustomized']).first(),
  ).toBeVisible();
  await assertAxe(page);
  await page.screenshot({
    path: join(screenshotDir, 'en-light-1440-override-customized.png'),
    fullPage: true,
  });

  const { sql } = await import('../integration/harness');
  const saved = await sql()`
    select v.payload ->> 'description' as description
    from public.exercise_override_versions v
    where v.workspace_id = ${fixture.wsA.id}
      and v.exercise_id = ${exerciseId}
      and v.version = (
        select current_version from public.exercise_overrides
        where workspace_id = ${fixture.wsA.id} and exercise_id = ${exerciseId}
      )
  `;
  expect(saved[0]?.description).toBe(localDescription);

  await descriptionReset.click();
  await expect(descriptionReset).toHaveCount(0);
  const reset = await sql()`
    select v.payload -> 'description' as description
    from public.exercise_override_versions v
    where v.workspace_id = ${fixture.wsA.id}
      and v.exercise_id = ${exerciseId}
      and v.version = (
        select current_version from public.exercise_overrides
        where workspace_id = ${fixture.wsA.id} and exercise_id = ${exerciseId}
      )
  `;
  expect(reset[0]?.description ?? null).toBeNull();
  await assertAxe(page);
  await page.screenshot({
    path: join(screenshotDir, 'en-light-1440-override-reset.png'),
    fullPage: true,
  });
});
