import AxeBuilder from '@axe-core/playwright';
import { createServerClient } from '@supabase/ssr';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

const origin = new URL(process.env.PLAYWRIGHT_BASE_URL!).origin;
const local = Boolean(process.env.DB_URL || process.env.SUPABASE_DB_URL);

async function expectAxeClean(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations).toEqual([]);
}

test.describe('local-stack workspace creation acceptance', () => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  let fixture: Awaited<
    ReturnType<typeof import('../integration/packages-fixture').packagesFixture>
  >;

  test.beforeEach(async () => {
    const { packagesFixture } = await import('../integration/packages-fixture');
    fixture = await packagesFixture();
  });

  async function signIn(context: BrowserContext, identity: typeof fixture.po) {
    const {
      data: { session },
      error,
    } = await identity.client.auth.getSession();
    expect(error).toBeNull();
    expect(session).not.toBeNull();
    const { loadEnv } = await import('../integration/harness');
    const env = loadEnv();
    const collected: { name: string; value: string }[] = [];
    const client = createServerClient(env.apiUrl, env.anonKey, {
      cookies: {
        getAll: () => [],
        setAll: (values) => {
          collected.push(...values);
        },
      },
    });
    const signed = await client.auth.setSession({
      access_token: session!.access_token,
      refresh_token: session!.refresh_token,
    });
    expect(signed.error).toBeNull();
    await context.addCookies(
      collected.map(({ name, value }) => ({ name, value, url: origin })),
    );
  }

  test('non-PO actors cannot open the workspace management route', async ({
    browser,
  }) => {
    for (const [name, identity] of Object.entries(fixture.actors))
      if (name !== 'po' && identity.userId) {
        const context = await browser.newContext();
        try {
          await signIn(context, identity as typeof fixture.po);
          const page = await context.newPage();
          const response = await page.goto('/workspaces');
          expect([200, 404]).toContain(response?.status());
          await expect(page.getByText('404', { exact: true })).toBeVisible();
          await expect(
            page.getByRole('button', { name: /More|المزيد/, exact: true }),
          ).toHaveCount(0);
          await expect(
            page.getByRole('button', { name: /New workspace|مساحة عمل جديدة/ }),
          ).toHaveCount(0);
        } finally {
          await context.close();
        }
      }
  });

  for (const locale of ['ar', 'en'] as const)
    test(`${locale}: PO sees approved copy, RTL direction, keyboard dialog and accessible states`, async ({
      page,
      context,
    }) => {
      await signIn(context, fixture.po);
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, url: origin },
      ]);
      const copy =
        locale === 'en'
          ? {
              title: 'Workspaces',
              new: 'New workspace',
              createTitle: 'Create a new workspace',
              createDescription:
                'The new workspace starts empty. No members, clients, packages or branding are added automatically.',
              nameLabel: 'Workspace name',
              nameInvalid: 'Enter a workspace name of up to 120 characters.',
              slugLabel: 'Workspace slug',
              slugHint:
                'Use lowercase letters, numbers and hyphens only. Up to 50 characters, not starting or ending with a hyphen.',
            }
          : {
              title:
                '\u0645\u0633\u0627\u062d\u0627\u062a \u0627\u0644\u0639\u0645\u0644',
              new: '\u0645\u0633\u0627\u062d\u0629 \u0639\u0645\u0644 \u062c\u062f\u064a\u062f\u0629',
              createTitle:
                '\u0627\u0639\u0645\u0644 \u0645\u0633\u0627\u062d\u0629 \u0639\u0645\u0644 \u062c\u062f\u064a\u062f\u0629',
              createDescription:
                '\u0645\u0633\u0627\u062d\u0629 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u062c\u062f\u064a\u062f\u0629 \u0647\u062a\u0628\u062f\u0623 \u0641\u0627\u0636\u064a\u0629. \u0645\u0641\u064a\u0634 \u0623\u0639\u0636\u0627\u0621 \u0648\u0644\u0627 \u0639\u0645\u0644\u0627\u0621 \u0648\u0644\u0627 \u0628\u0627\u0642\u0627\u062a \u0648\u0644\u0627 \u0639\u0644\u0627\u0645\u0629 \u062a\u062a\u0636\u0627\u0641 \u0644\u0648\u062d\u062f\u0647\u0627.',
              nameLabel:
                '\u0627\u0633\u0645 \u0645\u0633\u0627\u062d\u0629 \u0627\u0644\u0639\u0645\u0644',
              nameInvalid:
                '\u0627\u0643\u062a\u0628 \u0627\u0633\u0645 \u0645\u0633\u0627\u062d\u0629 \u0627\u0644\u0639\u0645\u0644\u060c 120 \u062d\u0631\u0641 \u0643\u062d\u062f \u0623\u0642\u0635\u0649.',
              slugLabel:
                '\u0627\u0633\u0645 \u0645\u0633\u0627\u062d\u0629 \u0627\u0644\u0639\u0645\u0644 \u0641\u064a \u0627\u0644\u0631\u0627\u0628\u0637',
              slugHint:
                '\u0627\u0633\u062a\u062e\u062f\u0645 \u062d\u0631\u0648\u0641 \u0625\u0646\u062c\u0644\u064a\u0632\u064a \u0635\u063a\u064a\u0631\u0629 \u0648\u0623\u0631\u0642\u0627\u0645 \u0648\u0634\u0631\u0637\u0629 (-) \u0628\u0633. \u0628\u062d\u062f \u0623\u0642\u0635\u0649 50 \u062d\u0631\u0641\u060c \u0648\u0645\u064a\u0646\u0641\u0639\u0634 \u062a\u0628\u062f\u0623 \u0623\u0648 \u062a\u0646\u0647\u064a \u0628\u0634\u0631\u0637\u0629.',
            };
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/workspaces');
      await expect(page.locator('html')).toHaveAttribute(
        'dir',
        locale === 'ar' ? 'rtl' : 'ltr',
      );
      const more = page.getByRole('button', {
        name: getMessages(locale)['nav.more'],
        exact: true,
      });
      await expect(more).toBeVisible();
      await more.click();
      const workspacesLink = page.getByRole('link', {
        name: copy.title,
        exact: true,
      });
      await expect(workspacesLink).toHaveAttribute('href', '/workspaces');
      await expectAxeClean(page);
      await workspacesLink.focus();
      await page.keyboard.press('Escape');
      await expect(more).toBeFocused();
      await expect(workspacesLink).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: copy.title, exact: true }),
      ).toBeVisible();
      const open = page.getByRole('button', {
        name: copy.new,
        exact: true,
      });
      await open.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(copy.createTitle);
      await expect(dialog).toContainText(copy.createDescription);
      await expect(dialog.getByTestId('dialog-cancel')).toBeFocused();
      const nameInput = dialog.getByLabel(copy.nameLabel, { exact: true });
      await expect(nameInput).toBeVisible();
      await expect(
        dialog.getByLabel(copy.slugLabel, { exact: true }),
      ).toBeVisible();
      await expect(dialog).toContainText(copy.slugHint);
      const slugInput = dialog.getByLabel(copy.slugLabel, { exact: true });
      await nameInput.fill(
        locale === 'ar'
          ? '\u0645\u0633\u0627\u062d\u0629 \u0639\u0645\u0644 \u062c\u062f\u064a\u062f\u0629'
          : 'Green Valley 2026',
      );
      await expect(slugInput).toHaveValue(
        locale === 'ar' ? '' : 'green-valley-2026',
      );
      await nameInput.fill(' My @ Test -- 05 ');
      await expect(slugInput).toHaveValue('my-test-05');
      await nameInput.fill(`${'a'.repeat(49)} ${'b'.repeat(20)}`);
      await expect(slugInput).toHaveValue('a'.repeat(49));
      await nameInput.fill(`${'n'.repeat(50)} trailing`);
      await expect(slugInput).toHaveValue('n'.repeat(50));
      await slugInput.fill('manual-workspace-slug');
      await nameInput.fill('Changed workspace name');
      await expect(slugInput).toHaveValue('manual-workspace-slug');
      await dialog.getByTestId('dialog-cancel').focus();
      await page.keyboard.press('Tab');
      await expect(dialog.getByTestId('dialog-confirm')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(nameInput).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(dialog.getByTestId('dialog-confirm')).toBeFocused();
      await nameInput.fill('   ');
      await slugInput.fill('valid-workspace');
      await dialog
        .getByRole('button', {
          name:
            locale === 'en'
              ? 'Create workspace'
              : '\u0627\u0639\u0645\u0644 \u0645\u0633\u0627\u062d\u0629 \u0627\u0644\u0639\u0645\u0644',
          exact: true,
        })
        .click();
      await expect(dialog).toContainText(copy.nameInvalid);
      await expect(nameInput).toHaveAttribute('aria-invalid', 'true');
      await expectAxeClean(page);
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(open).toBeFocused();
    });

  test('PO submission creates an empty workspace and reports success', async ({
    page,
    context,
  }) => {
    await signIn(context, fixture.po);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
    ]);
    const token = crypto.randomUUID();
    const name = `S11-2 ${token}`;
    const updatedName = `S11-2 changed ${token}`;
    const slug = `manual-${token}`;
    await page.goto('/workspaces');
    const open = page.getByRole('button', {
      name: 'New workspace',
      exact: true,
    });
    await open.click();
    const dialog = page.getByRole('dialog');
    const nameInput = dialog.getByLabel('Workspace name', { exact: true });
    const slugInput = dialog.getByLabel('Workspace slug', { exact: true });
    await nameInput.fill(name);
    await expect(slugInput).toHaveValue(`s11-2-${token}`);
    await slugInput.fill(slug);
    await nameInput.fill(updatedName);
    await expect(slugInput).toHaveValue(slug);
    await dialog
      .getByRole('button', { name: 'Create workspace', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('status')).toContainText('Workspace created.');
    const created = await fixture.po.client
      .from('workspaces')
      .select('id,name,slug,created_by')
      .eq('slug', slug)
      .single();
    expect(created.error).toBeNull();
    expect(created.data).toMatchObject({
      name: updatedName,
      slug,
      created_by: fixture.po.userId,
    });
    const related = await fixture.po.client
      .from('workspace_memberships')
      .select('user_id')
      .eq('workspace_id', created.data!.id);
    expect(related.error).toBeNull();
    expect(related.data).toEqual([]);
  });

  test('an interrupted create shows approved generic errors and keeps the form', async ({
    page,
    context,
  }) => {
    await signIn(context, fixture.po);
    await page.route('**/workspaces', async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise((resolve) => setTimeout(resolve, 750));
        await route.abort('failed');
      } else await route.continue();
    });
    for (const locale of ['ar', 'en'] as const) {
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, url: origin },
      ]);
      const m = getMessages(locale);
      await page.goto('/workspaces');
      await page
        .getByRole('button', { name: m['workspaces.new'], exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      const token = crypto.randomUUID();
      const name = `S11-2 interrupted ${token}`;
      const slug = `s11-2-${token.slice(0, 8)}`;
      await dialog
        .getByLabel(m['workspaces.nameLabel'], { exact: true })
        .fill(name);
      await dialog
        .getByLabel(m['workspaces.slugLabel'], { exact: true })
        .fill(slug);
      const confirm = dialog.getByRole('button', {
        name: m['workspaces.create'],
        exact: true,
      });
      await confirm.click();
      await expect(confirm).toHaveAttribute('aria-busy', 'true');
      await expect(
        dialog.getByLabel(m['workspaces.nameLabel'], { exact: true }),
      ).toBeDisabled();
      await expect(
        dialog.getByLabel(m['workspaces.slugLabel'], { exact: true }),
      ).toBeDisabled();
      await expect(dialog.getByRole('alert')).toHaveText(m['workspaces.error']);
      await expect(
        dialog.getByLabel(m['workspaces.nameLabel'], { exact: true }),
      ).toHaveValue(name);
      await expect(
        dialog.getByLabel(m['workspaces.slugLabel'], { exact: true }),
      ).toHaveValue(slug);
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    }
    await page.unroute('**/workspaces');
  });

  for (const locale of ['ar', 'en'] as const)
    test(`${locale}: 320px and 200% text zoom keep the create form in bounds`, async ({
      page,
      context,
    }) => {
      await signIn(context, fixture.po);
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, url: origin },
      ]);
      await page.setViewportSize({ width: 320, height: 844 });
      await page.goto('/workspaces');
      const m = getMessages(locale);
      await page
        .getByRole('button', { name: m['workspaces.new'], exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog
        .getByLabel(m['workspaces.nameLabel'], { exact: true })
        .fill('N'.repeat(120));
      await dialog
        .getByLabel(m['workspaces.slugLabel'], { exact: true })
        .fill('n');
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByLabel(m['workspaces.nameLabel'], { exact: true }),
      ).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(
        dimensions.clientWidth,
      );
      await expectAxeClean(page);
    });

  test('renders and audits the approved locale, theme and viewport matrix', async ({
    page,
    context,
  }) => {
    await signIn(context, fixture.po);
    const outputDirectory =
      process.env.LIFTER_SCREENSHOT_DIR ?? join(tmpdir(), 's65-luna-s112b');
    mkdirSync(outputDirectory, { recursive: true });
    const backgrounds = new Map<string, string>();
    for (const locale of ['ar', 'en'] as const)
      for (const theme of ['light', 'dark'] as const)
        for (const viewport of [
          { label: 'mobile', width: 390, height: 844 },
          { label: 'desktop', width: 1440, height: 900 },
        ]) {
          await context.addCookies([
            { name: LOCALE_COOKIE, value: locale, url: origin },
            { name: THEME_COOKIE, value: theme, url: origin },
          ]);
          await page.setViewportSize({
            width: viewport.width,
            height: viewport.height,
          });
          await page.goto('/workspaces');
          await expect(page.locator('html')).toHaveAttribute(
            'dir',
            locale === 'ar' ? 'rtl' : 'ltr',
          );
          await expect(
            page.getByRole('heading', {
              name:
                locale === 'ar'
                  ? '\u0645\u0633\u0627\u062d\u0627\u062a \u0627\u0644\u0639\u0645\u0644'
                  : 'Workspaces',
              exact: true,
            }),
          ).toBeVisible();
          const file = join(
            outputDirectory,
            `workspaces-${locale}-${theme}-${viewport.label}.png`,
          );
          await page.screenshot({ path: file, fullPage: true });
          await expectAxeClean(page);
          const background = await page
            .locator('body')
            .evaluate((element) => getComputedStyle(element).backgroundColor);
          backgrounds.set(`${locale}-${theme}-${viewport.label}`, background);
          await expectAxeClean(page);
          console.log(`Design matrix screenshot: ${file}`);
          await page
            .getByRole('button', {
              name:
                locale === 'ar'
                  ? '\u0645\u0633\u0627\u062d\u0629 \u0639\u0645\u0644 \u062c\u062f\u064a\u062f\u0629'
                  : 'New workspace',
              exact: true,
            })
            .click();
          await expect(page.getByRole('dialog')).toBeVisible();
          const dialogFile = file.replace('.png', '-dialog.png');
          await page.screenshot({ path: dialogFile, fullPage: true });
          await expectAxeClean(page);
          console.log(`Design matrix screenshot: ${dialogFile}`);
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog')).not.toBeVisible();
        }
    for (const locale of ['ar', 'en'] as const)
      for (const viewport of ['mobile', 'desktop'] as const)
        expect(backgrounds.get(`${locale}-dark-${viewport}`)).not.toBe(
          backgrounds.get(`${locale}-light-${viewport}`),
        );
  });
});
