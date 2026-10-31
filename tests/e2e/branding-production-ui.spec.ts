import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const local = Boolean(
  process.env.DB_URL || process.env.SUPABASE_DB_URL || process.env.API_URL,
);
const temporaryDir = join(tmpdir(), `lifter-f14-ui-${process.pid}`);
const viewports = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];
let fixtures: Awaited<
  ReturnType<
    (typeof import('../integration/branding-dashboard-fixture'))['createBrandingDashboardFixtures']
  >
>;

async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

async function authenticate(
  page: Page,
  account: typeof fixtures.editor,
  locale: 'ar' | 'en',
  theme: 'light' | 'dark',
) {
  await page.context().addCookies([
    { name: LOCALE_COOKIE, value: locale, url: origin },
    { name: THEME_COOKIE, value: theme, url: origin },
    {
      name: 'sb-127-auth-token',
      value: `base64-${Buffer.from(JSON.stringify(account.session)).toString('base64url')}`,
      url: origin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

test.beforeAll(async () => {
  test.skip(!local, 'Requires the selected disposable local database.');
  const { createBrandingDashboardFixtures } =
    await import('../integration/branding-dashboard-fixture');
  fixtures = await createBrandingDashboardFixtures();
});

test.afterAll(async () => {
  await fixtures?.close();
});

for (const locale of ['ar', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of viewports) {
      test(`${locale}/${theme}/${viewport.name}: production workspace editor`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await authenticate(page, fixtures.editor, locale, theme);
        await page.goto(
          `/branding?workspace=${fixtures.editor.workspaces[0]!.id}`,
        );
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(
          page.locator('[data-branding-private-preview]'),
        ).toBeVisible();
        await expect(page.locator('form')).toHaveCount(2);
        await expect(page.locator('input[name*="bannerAlt"]')).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: /history|restore/i }),
        ).toHaveCount(0);
        await expect(page.locator('[data-current-published]')).toBeVisible();
        const portalPreview = page.locator('[data-client-portal-preview]');
        await expect(portalPreview).toBeVisible();
        await expect(
          portalPreview.getByRole('heading', { level: 2 }),
        ).toHaveText(getMessages(locale)['branding.portalSurface']);
        await expect(
          portalPreview.locator('button, a, form, input'),
        ).toHaveCount(0);
        await expect(portalPreview).toContainText(
          getMessages(locale)['branding.portalPreviewNotice'],
        );
        const noMotion = await page
          .locator('[data-branding-private-preview]')
          .evaluate((root) => {
            const elements = [root, ...root.querySelectorAll('*')];
            return elements.every((element) => {
              const style = getComputedStyle(element);
              return (
                style.animationDuration
                  .split(',')
                  .every((duration) => parseFloat(duration) === 0) &&
                style.transitionDuration
                  .split(',')
                  .every((duration) => parseFloat(duration) === 0)
              );
            });
          });
        expect(noMotion).toBe(true);
        const controls = await page
          .locator('button, input, select')
          .evaluateAll((items) =>
            items
              .filter((item) => (item as HTMLElement).offsetParent !== null)
              .map((item) => {
                const box = item.getBoundingClientRect();
                return {
                  name:
                    (item as HTMLElement).getAttribute('aria-label') ??
                    (item as HTMLInputElement).name ??
                    (item as HTMLElement).innerText,
                  width: box.width,
                  height: box.height,
                };
              }),
          );
        expect(controls.length).toBeGreaterThan(0);
        await mkdir(temporaryDir, { recursive: true });
        await writeFile(
          join(
            temporaryDir,
            `touch-targets-${locale}-${theme}-${viewport.name}.json`,
          ),
          JSON.stringify(
            {
              referenceCssPx: '44 × 44 (reporting reference only)',
              locale,
              theme,
              viewport: viewport.width,
              controls,
            },
            null,
            2,
          ),
        );
        const brand = await page
          .locator('[data-branding-private-preview]')
          .evaluate((element) => ({
            fill: getComputedStyle(element)
              .getPropertyValue('--brand-fill')
              .trim(),
            success: getComputedStyle(element)
              .getPropertyValue('--color-success-fg')
              .trim(),
          }));
        expect(brand.fill).not.toBe('');
        expect(brand.success).not.toBe('');
        await page.keyboard.press('Tab');
        await expect(page.locator(':focus-visible')).toHaveCount(1);
        await axe(page);
        const name = `production-editor-${locale}-${theme}-${viewport.name}.png`;
        const temporary = join(temporaryDir, name);
        await mkdir(temporaryDir, { recursive: true });
        await page.screenshot({ path: temporary, fullPage: true });
      });

      test(`${locale}/${theme}/${viewport.name}: published staff brand scope`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await authenticate(page, fixtures.staff, locale, theme);
        const workspaceId = fixtures.staff.workspaces[0]!.id;
        await page.goto(`/registration-links?workspace=${workspaceId}`);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const scope = page.locator(
          `[data-staff-brand-workspace="${workspaceId}"]`,
        );
        await expect(scope).toBeVisible();
        const tokens = await scope.evaluate((element) => ({
          fill: getComputedStyle(element)
            .getPropertyValue('--brand-fill')
            .trim(),
          success: getComputedStyle(element)
            .getPropertyValue('--color-success-fg')
            .trim(),
          warning: getComputedStyle(element)
            .getPropertyValue('--color-warning-fg')
            .trim(),
          error: getComputedStyle(element)
            .getPropertyValue('--color-error-fg')
            .trim(),
        }));
        expect(tokens.fill).not.toBe('');
        expect(tokens.success).not.toBe('');
        expect(tokens.warning).not.toBe('');
        expect(tokens.error).not.toBe('');
        await axe(page);
        const name = `production-staff-${locale}-${theme}-${viewport.name}.png`;
        const temporary = join(temporaryDir, name);
        await mkdir(temporaryDir, { recursive: true });
        await page.screenshot({ path: temporary, fullPage: true });
      });
    }
  }
}

test('T034: a late first workspace read is discarded after a rapid switch', async ({
  page,
}) => {
  const first = fixtures.editor.workspaces[0]!;
  const second = fixtures.editor.workspaces[1]!;
  await page.setViewportSize({ width: 768, height: 1024 });
  await page
    .context()
    .addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.context().addCookies([
    {
      name: THEME_COOKIE,
      value: 'light',
      url: origin,
    },
  ]);
  await page.context().addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${Buffer.from(JSON.stringify(fixtures.editor.session)).toString('base64url')}`,
      url: origin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto(`/branding?workspace=${first.id}`);

  let releaseFirst!: () => void;
  let resolveHeld!: () => void;
  const release = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const held = new Promise<void>((resolve) => {
    resolveHeld = resolve;
  });
  await page.route('**/api/branding/draft?workspace=*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('workspace') !== second.id)
      return route.continue();
    const response = await route.fetch();
    resolveHeld();
    await release;
    await route.fulfill({ response });
  });
  const switcher = page.locator('#branding-workspace');
  await switcher.selectOption(second.id);
  await held;
  await switcher.selectOption(first.id);
  await expect(page).toHaveURL(new RegExp(`workspace=${first.id}`));
  releaseFirst();
  await expect(page.locator('input[name="nameEn"]')).toHaveValue('Draft 1');
  await expect(page.locator('#branding-workspace-error')).toHaveCount(0);
});

test('workspace retry stays hidden until failure and retries the failed target', async ({
  page,
}) => {
  const [current, target] = fixtures.editor.workspaces;
  await authenticate(page, fixtures.editor, 'en', 'light');
  await page.goto(`/branding?workspace=${current!.id}`);
  const retry = page.getByRole('button', { name: /retry/i });
  await expect(retry).toHaveCount(0);
  let attempts = 0;
  const requested: string[] = [];
  await page.route('**/api/branding/draft?workspace=*', async (route) => {
    requested.push(
      new URL(route.request().url()).searchParams.get('workspace')!,
    );
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 503, body: '{}' });
      return;
    }
    await route.continue();
  });
  await page.locator('#branding-workspace').selectOption(target!.id);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(page).toHaveURL(
    new RegExp(`/branding\\?workspace=${target!.id}`),
  );
  expect(requested).toEqual([target!.id, target!.id]);
});

test('branding editor accepts one locale name and explains when both are blank', async ({
  page,
}) => {
  const workspace = fixtures.editor.workspaces[0]!;
  await authenticate(page, fixtures.editor, 'en', 'light');
  await page.goto(`/branding?workspace=${workspace.id}`);
  const arabic = page.locator('input[name="nameAr"]');
  const english = page.locator('input[name="nameEn"]');
  await expect(arabic).toHaveJSProperty('required', false);
  await expect(english).toHaveJSProperty('required', false);

  await arabic.fill('');
  await english.fill('English only brand');
  await page.getByRole('button', { name: /save draft/i }).click();
  await expect(page).toHaveURL(/status=saved/);
  await expect(english).toHaveValue('English only brand');

  await arabic.fill('');
  await english.fill('');
  await page.getByRole('button', { name: /save draft/i }).click();
  await expect(page).toHaveURL(/status=invalid/);
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'DRAFT: Enter a name in Arabic or English.',
  );
});

test('T033: caller-JWT editor saves by revision and publishes current draft only', async ({
  page,
}) => {
  const workspace = fixtures.editor.workspaces[0]!;
  await page.setViewportSize({ width: 768, height: 1024 });
  await authenticate(page, fixtures.editor, 'en', 'light');
  await page.goto(`/branding?workspace=${workspace.id}`);
  await page.locator('input[name="nameEn"]').fill('Saved Draft');
  await page
    .getByRole('button', { name: getMessages('en')['branding.saveDraft'] })
    .click();
  await expect(page).toHaveURL(/status=saved/);
  await expect(page.locator('input[name="nameEn"]')).toHaveValue('Saved Draft');
  await expect(page.locator('[data-current-published]')).toContainText(
    'Draft 1',
  );
  await page
    .getByRole('button', { name: getMessages('en')['branding.publishCurrent'] })
    .click();
  await expect(page).toHaveURL(/status=published/);
  await expect(page.locator('[data-current-published]')).toContainText(
    'Saved Draft',
  );

  await page.goto(`/branding?workspace=${workspace.id}&status=stale`);
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: getMessages('en')['branding.staleRevision'] }),
  ).toBeVisible();
});
