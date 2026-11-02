import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

const screenshotDirectory = path.join(
  tmpdir(),
  process.env.LIFTER_SCREENSHOT_DIR ?? 'lifter-s28-f17-finish',
);
const baseUrl = 'http://localhost:3417';
const GLOBAL_TEMPLATE_ID = 'a1000000-0000-4000-8000-000000000001';
const WORKSPACE_TEMPLATE_ID = 'a1000000-0000-4000-8000-000000000002';
const RETIRED_TEMPLATE_ID = 'a1000000-0000-4000-8000-000000000003';

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

test('workspace staff see scoped templates and can operate the editor by keyboard', async ({
  page,
  context,
}) => {
  await setPreferences(context, 'en', 'light');
  await page.goto('/showcase/workout-templates?actor=staff');

  await expect(
    page.getByRole('heading', { name: 'Workout template management' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create workspace template' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create global template' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /Make it Global/ }),
  ).toHaveCount(0);

  const globalTemplate = page.getByTestId(`template-${GLOBAL_TEMPLATE_ID}`);
  await expect(globalTemplate.getByText('Read only')).toBeVisible();
  await expect(
    globalTemplate.getByRole('button', { name: /^Edit:/ }),
  ).toHaveCount(0);

  const workspaceTemplate = page.getByTestId(
    `template-${WORKSPACE_TEMPLATE_ID}`,
  );
  const edit = workspaceTemplate.getByRole('button', {
    name: 'Edit: Progressive push',
  });
  await edit.focus();
  await expect(edit).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Workspace template' }),
  ).toBeVisible();

  const name = page.getByLabel('Template name');
  await name.fill('Edited workspace template');
  await page.getByRole('button', { name: 'Save template' }).click();
  await expect(page.getByTestId('template-status')).toContainText(
    'The template was updated in the local preview.',
  );
});

test('loading copies a template into the draft and retired templates cannot load', async ({
  page,
  context,
}) => {
  await setPreferences(context, 'en', 'light');
  await page.goto('/showcase/workout-templates?actor=staff');

  const workspaceTemplate = page.getByTestId(
    `template-${WORKSPACE_TEMPLATE_ID}`,
  );
  await workspaceTemplate
    .getByRole('button', { name: 'Load into draft: Progressive push' })
    .click();
  const draft = page.getByTestId('draft-copy');
  await expect(draft).toBeVisible();
  await expect(draft).toContainText('Day: Push day');

  await workspaceTemplate
    .getByRole('button', { name: 'Edit: Progressive push' })
    .click();
  await page.getByLabel('Template name').fill('Later template edit');
  await page.getByRole('button', { name: 'Save template' }).click();
  await expect(draft).toContainText('Day: Push day');
  await expect(draft).not.toContainText('Later template edit');

  const retired = page.getByTestId(`template-${RETIRED_TEMPLATE_ID}`);
  await expect(retired).toContainText('Retired');
  await expect(
    retired.getByRole('button', { name: 'Load into draft: Legacy push' }),
  ).toBeDisabled();
});

test('platform owner receives global governance controls', async ({
  page,
  context,
}) => {
  await setPreferences(context, 'en', 'light');
  await page.goto('/showcase/workout-templates?actor=po');

  await expect(
    page.getByRole('button', { name: 'Create global template' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Make it Global: Progressive push' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retire: Squat foundation' }),
  ).toBeVisible();
});

test('template manager renders the bilingual responsive matrix without axe violations', async ({
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
        await page.goto('/showcase/workout-templates?actor=staff');
        const manager = page.getByTestId('workout-template-manager');
        await expect(manager).toHaveAttribute('lang', locale);
        await expect(manager).toHaveAttribute(
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
            `templates-${locale}-${theme}-${viewport.name}.png`,
          ),
          fullPage: true,
        });
      }
    }
  }
});
