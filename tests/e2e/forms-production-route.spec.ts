import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { admin, checked, sql } from '../integration/harness';
import { testStaffDisplayName } from '../helpers/staff-display-name';

const screenshotDir = join(tmpdir(), 'lifter-s26-f15-forms-route-r3');
const runTag = `f15-route-${randomUUID()}`;
const db = sql();
let workspaceId = '';
let userId = '';
let email = '';
let password = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(screenshotDir, { recursive: true });
  email = `${runTag}@example.test`;
  password = `F15-${randomUUID()}-aA1!`;
  const created = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error('Could not create synthetic Forms staff fixture');
  userId = created.data.user.id;
  checked(
    await admin().from('staff_profiles').insert({
      user_id: userId,
      role: 'workspace_owner',
      display_name: testStaffDisplayName(),
    }),
  );
  const workspace = checked(
    await admin()
      .from('workspaces')
      .insert({
        name: `${runTag} workspace`,
        slug: runTag,
        created_by: userId,
      })
      .select('id')
      .single(),
  );
  if (!workspace) throw new Error('Synthetic Forms workspace missing');
  workspaceId = workspace.id as string;
  checked(
    await admin().from('workspace_memberships').insert({
      workspace_id: workspaceId,
      user_id: userId,
      granted_by: userId,
    }),
  );
  const versions = await db`
    insert into app_private.branding_published_versions(workspace_id,sequence,fields,published_by,published_at)
    values(${workspaceId},1,${db.json({ name: `${runTag} brand`, color: '#365A78' })},${userId},now())
    returning id`;
  await db`
    insert into app_private.branding_current_publications(workspace_id,version_id)
    values(${workspaceId},${versions[0]!.id})`;
});

test.afterAll(async () => {
  if (workspaceId) {
    await db`delete from app_private.branding_current_publications where workspace_id=${workspaceId}`;
    await db`delete from app_private.branding_published_versions where workspace_id=${workspaceId}`;
  }
  // Keep the run-tagged workspace/owner because its immutable audit rows and
  // the workspace's created_by reference must remain attributable.
  await db.end();
});

async function signIn(page: Page) {
  const origin = test.info().project.use.baseURL;
  if (typeof origin !== 'string') {
    throw new Error(
      'Forms route E2E requires the configured Playwright baseURL',
    );
  }
  await page.context().addCookies([
    { name: 'lifter_locale', value: 'en', url: origin },
    { name: 'lifter_theme', value: 'light', url: origin },
  ]);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole('link', { name: 'Staff forms' })).toBeVisible();
  await page.context().addCookies([
    { name: 'lifter_locale', value: 'en', url: origin },
    { name: 'lifter_theme', value: 'light', url: origin },
  ]);
}

test('production Forms is authenticated, workspace-scoped, bilingual, and accessible', async ({
  page,
}) => {
  await signIn(page);
  const origin = test.info().project.use.baseURL;
  if (typeof origin !== 'string') {
    throw new Error(
      'Forms route E2E requires the configured Playwright baseURL',
    );
  }
  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [390, 1440] as const) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        await page.context().addCookies([
          { name: 'lifter_locale', value: locale, url: origin },
          { name: 'lifter_theme', value: theme, url: origin },
        ]);
        await page.goto(`/forms?workspace=${workspaceId}`);
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: locale === 'en' ? 'Staff forms' : 'استمارات الموظفين',
          }),
        ).toBeVisible();
        await expect(page.getByText(/mock preview/i)).toHaveCount(0);
        await expect(page.getByTestId('saved-form-list')).toHaveCSS(
          'list-style-type',
          'none',
        );
        const title = page.getByLabel(
          locale === 'en' ? 'English form name' : 'اسم الاستمارة بالإنجليزية',
        );
        await expect(title).toBeVisible();
        await expect(
          page.getByLabel(
            locale === 'en' ? 'Arabic form name' : 'اسم الاستمارة بالعربية',
          ),
        ).toHaveValue('خطوتك الأولى');
        await expect(
          page.locator(
            '[data-testid="question-outline-item"] button[aria-expanded="true"]',
          ),
        ).toHaveCount(1);
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        const outlines = page.getByTestId('question-outline');
        for (
          let outlineIndex = 0;
          outlineIndex < (await outlines.count());
          outlineIndex += 1
        ) {
          const outline = outlines.nth(outlineIndex);
          const dimensions = await outline.evaluate((element) => ({
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
          }));
          expect(dimensions.scrollHeight).toBeLessThanOrEqual(
            dimensions.clientHeight + 1,
          );
          const titles = outline.getByTestId('question-summary-title');
          for (
            let titleIndex = 0;
            titleIndex < (await titles.count());
            titleIndex += 1
          ) {
            const title = titles.nth(titleIndex);
            await title.scrollIntoViewIfNeeded();
            await expect(title).toBeInViewport();
          }
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        const violations = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(violations.violations).toEqual([]);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: join(screenshotDir, `${locale}-${theme}-${width}.png`),
          fullPage: true,
        });
      }
    }
  }

  await page.context().addCookies([
    { name: 'lifter_locale', value: 'en', url: origin },
    { name: 'lifter_theme', value: 'light', url: origin },
  ]);
  await page.goto(`/forms?workspace=${workspaceId}`);
  const createButton = page.getByRole('button', { name: 'Create a form' });
  await createButton.focus();
  await page.keyboard.press('Tab');
  const savedFormButton = page
    .getByRole('list', { name: 'Saved forms' })
    .getByRole('button')
    .first();
  await expect(savedFormButton).toBeFocused();
  expect(
    await savedFormButton.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).toBe('solid');
  await page.getByLabel('English form name').fill(`Your First Step ${runTag}`);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  const defaultButton = page.getByRole('button', {
    name: 'Set as onboarding form (DRAFT)',
  });
  await expect(defaultButton).toHaveAttribute('aria-pressed', 'true');
  await defaultButton.click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  await expect(defaultButton).toHaveAttribute('aria-pressed', 'true');
});

test('anonymous and Sales users receive no production Forms content', async ({
  page,
}) => {
  await page.goto('/forms');
  await expect(page).toHaveURL(/\/login(?:\?|$)/u);

  const salesEmail = `${runTag}-sales@example.test`;
  const salesPassword = `F15-${randomUUID()}-aA1!`;
  const created = await admin().auth.admin.createUser({
    email: salesEmail,
    password: salesPassword,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error('Could not create synthetic Sales fixture');
  checked(
    await admin().from('staff_profiles').insert({
      user_id: created.data.user.id,
      role: 'sales',
      display_name: testStaffDisplayName(),
    }),
  );
  const origin = test.info().project.use.baseURL;
  if (typeof origin !== 'string')
    throw new Error('Playwright baseURL is required');
  await page.context().addCookies([
    { name: 'lifter_locale', value: 'en', url: origin },
    { name: 'lifter_theme', value: 'light', url: origin },
  ]);
  await page.goto('/login');
  await page.getByLabel('Email').fill(salesEmail);
  await page.getByLabel('Password').fill(salesPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/u);
  await page.goto('/forms');
  await expect(page.getByRole('heading', { name: /Staff forms/u })).toHaveCount(
    0,
  );
  await expect(page.getByRole('main')).toHaveCount(0);
});

test('production Builder stays compact and supports keyboard question editing', async ({
  page,
}) => {
  await signIn(page);
  const origin = test.info().project.use.baseURL;
  if (typeof origin !== 'string')
    throw new Error('Playwright baseURL is required');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.context().addCookies([
    { name: 'lifter_locale', value: 'en', url: origin },
    { name: 'lifter_theme', value: 'light', url: origin },
  ]);
  await page.goto(`/forms?workspace=${workspaceId}`);
  await expect(page.getByLabel('Arabic form name')).toHaveValue('خطوتك الأولى');

  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  console.log(`F15 Builder 1440px document height: ${height}px`);
  // Measured 3965px on Stack D at 1440x1000; 15% headroom rounds to 4560px.
  expect(height).toBeLessThan(4560);

  await page.evaluate(() => window.scrollTo(0, 1200));
  const saveBounds = await page
    .getByRole('button', { name: 'Save draft' })
    .boundingBox();
  expect(saveBounds?.y).toBeGreaterThan(0);
  expect(
    (saveBounds?.y ?? 1000) + (saveBounds?.height ?? 0),
  ).toBeLessThanOrEqual(1000);

  const outline = page.getByRole('list', { name: 'Questions' });
  const items = outline.getByTestId('question-outline-item');
  expect(await items.count()).toBeGreaterThan(1);
  const first = items.first().getByRole('button');
  const second = items.nth(1).getByRole('button');
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await first.focus();
  await page.keyboard.press('Escape');
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await second.focus();
  await page.keyboard.press('Enter');
  await expect(second).toHaveAttribute('aria-expanded', 'true');
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('question-editor')).toHaveCount(1);

  const originalSecond = await items
    .nth(1)
    .getByTestId('question-summary-title')
    .textContent();
  const moveDown = page.getByRole('button', { name: 'Move question down' });
  await moveDown.focus();
  await page.keyboard.press('Enter');
  await expect(items.nth(2).getByTestId('question-summary-title')).toHaveText(
    originalSecond ?? '',
  );
});
