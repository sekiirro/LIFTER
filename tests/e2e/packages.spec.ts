import { getTestCookieOrigin, buildLoginRedirectUrl } from './test-origin.mjs';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { createServerClient } from '@supabase/ssr';
import { expect, test, type BrowserContext } from '@playwright/test';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
for (const locale of ['ar', 'en'] as const)
  test(`${locale}: anonymous package route redirects safely and login passes axe`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, url: getTestCookieOrigin() },
    ]);
    const path = '/packages?workspace=00000000-0000-0000-0000-000000000001';
    await page.goto(path);
    await expect(page).toHaveURL(buildLoginRedirectUrl(path));
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr',
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
// Public CI remains DB-independent. Reviewer MUST export the local harness env and run this group.
const local = Boolean(process.env.DB_URL || process.env.SUPABASE_DB_URL);
test.describe('local-stack authenticated package acceptance (required for review)', () => {
  test.skip(
    !local,
    'Requires disposable local API_URL/ANON_KEY/SERVICE_ROLE_KEY/DB_URL; reviewer must run authenticated mode.',
  );
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
      collected.map(({ name, value }) => ({
        name,
        value,
        url: getTestCookieOrigin(),
      })),
    );
  }
  test('every authenticated non-PO receives 404 without terms/rates', async ({
    browser,
  }) => {
    for (const [name, identity] of Object.entries(fixture.actors))
      if (name !== 'po' && identity.userId) {
        const context = await browser.newContext();
        try {
          await signIn(context, identity as typeof fixture.po);
          const page = await context.newPage();
          const response = await page.goto('/packages');
          // App Router may stream notFound after a 200 header; assert the rendered 404 and absence of management.
          expect([200, 404]).toContain(response?.status());
          await expect(page.getByText('404', { exact: true })).toBeVisible();
          await expect(page.locator('input[name="priceMinor"]')).toHaveCount(0);
          await expect(
            page.locator('input[name="commissionRateBp"]'),
          ).toHaveCount(0);
        } finally {
          await context.close();
        }
      }
  });
  for (const locale of ['ar', 'en'] as const)
    test(`${locale}: PO create, presets/custom, cancel/confirm, errors, themes and workspace switch`, async ({
      page,
      context,
    }) => {
      await signIn(context, fixture.po);
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, url: getTestCookieOrigin() },
      ]);
      const m = getMessages(locale);
      const fixtureOffers = await fixture.po.client
        .from('package_offers')
        .select('id')
        .eq('workspace_id', fixture.wsA.id);
      expect(fixtureOffers.error).toBeNull();
      expect(
        fixtureOffers.data,
        'packages empty-state fixture must begin without offers',
      ).toEqual([]);
      const packageResponse = await page.goto(
        `/packages?workspace=${fixture.wsA.id}`,
      );
      await expect(page.locator('html')).toHaveAttribute(
        'dir',
        locale === 'ar' ? 'rtl' : 'ltr',
      );
      await expect(
        page.getByRole('heading', { name: m['packages.title'], exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(m['packages.empty'], { exact: true }),
        `package empty state missing for ${locale}; status=${packageResponse?.status()} workspace=${fixture.wsA.id} main=${(
          await page
            .locator('main')
            .innerText()
            .catch(() => '')
        )
          .replace(/\s+/g, ' ')
          .slice(0, 300)}`,
      ).toBeVisible();
      const code = `test-pkg-${randomUUID()}`;
      await page.locator('input[name="code"]').fill(code);
      await page
        .getByRole('button', { name: m['packages.create'], exact: true })
        .click();
      await expect(
        page
          .locator('select[name="packageId"] option')
          .filter({ hasText: code }),
      ).toHaveCount(1);
      for (const name of [
        'nameAr',
        'nameEn',
        'priceMinor',
        'currency',
        'commissionRateBp',
      ])
        await expect(page.locator(`input[name="${name}"]`)).toHaveValue('');
      async function fillTerms() {
        await page
          .locator('select[name="packageId"]')
          .selectOption({ label: code });
        await page.locator('input[name="nameAr"]').fill('test-authored-ar');
        await page.locator('input[name="nameEn"]').fill('test-authored-en');
        await page.locator('input[name="priceMinor"]').fill('9007199254740993');
        await page.locator('input[name="currency"]').fill('XTS');
        await page.locator('input[name="commissionRateBp"]').fill('0');
      }
      await fillTerms();
      await page
        .getByRole('button', { name: `3 ${m['packages.months']}`, exact: true })
        .click();
      await page
        .getByRole('button', { name: m['packages.publish'], exact: true })
        .click();
      const row = page
        .getByRole('row')
        .filter({ has: page.getByRole('rowheader').filter({ hasText: code }) });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(`${m['packages.days']}: 90`);
      await row
        .getByRole('button', { name: m['packages.enable'], exact: true })
        .click();
      await expect(page.getByTestId('dialog-cancel')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect(
        row.getByRole('button', { name: m['packages.enable'], exact: true }),
      ).toBeFocused();
      await row
        .getByRole('button', { name: m['packages.enable'], exact: true })
        .click();
      await expect(page.getByRole('dialog')).toContainText(
        `${m['packages.days']}: 90`,
      );
      await page.route('**/packages*', async (route) => {
        if (route.request().method() === 'POST') await route.abort('failed');
        else await route.continue();
      });
      await page.getByTestId('dialog-confirm').click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        m['packages.unavailable'],
      );
      await expect(
        row.getByRole('button', { name: m['packages.enable'], exact: true }),
      ).toBeVisible();
      await page.unroute('**/packages*');
      await row
        .getByRole('button', { name: m['packages.enable'], exact: true })
        .click();
      await page.getByTestId('dialog-confirm').click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect(row).toContainText(m['packages.available']);
      await fillTerms();
      await page
        .getByRole('button', { name: m['packages.custom'], exact: true })
        .click();
      await page.locator('input[name="durationDays"]').fill('61');
      await page
        .getByRole('button', { name: m['packages.publish'], exact: true })
        .click();
      await expect(row).toHaveCount(2);
      for (const theme of ['light', 'dark']) {
        await context.addCookies([
          { name: THEME_COOKIE, value: theme, url: getTestCookieOrigin() },
        ]);
        await page.reload();
        await page.setViewportSize({ width: 390, height: 844 });
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
              .analyze()
          ).violations,
        ).toEqual([]);
      }
      // A transport failure must be a generic error with no saved state; retry uses the real action.
      await page.locator('input[name="code"]').fill(`test-pkg-${randomUUID()}`);
      await page.route('**/packages*', async (route) => {
        if (route.request().method() === 'POST') await route.abort('failed');
        else await route.continue();
      });
      await page
        .getByRole('button', { name: m['packages.create'], exact: true })
        .click();
      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        m['packages.unavailable'],
      );
      await page.unroute('**/packages*');
      await page
        .getByRole('button', { name: m['packages.create'], exact: true })
        .click();
      await expect(
        page.getByRole('status').filter({ hasText: m['packages.saved'] }),
      ).toBeVisible();
      await page.locator('input[name="nameEn"]').fill('test-stale');
      let release!: () => void;
      let intercepted!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        intercepted = resolve;
      });
      await page.route('**/packages*', async (route) => {
        if (route.request().method() === 'POST') {
          intercepted();
          await held;
        }
        await route.continue();
      });
      await page.locator('input[name="code"]').fill(`test-pkg-${randomUUID()}`);
      await page
        .getByRole('button', { name: m['packages.create'], exact: true })
        .click();
      await started;
      await page
        .getByLabel(m['packages.workspace'], { exact: true })
        .selectOption(fixture.wsB.id);
      await expect(page).toHaveURL(new RegExp(fixture.wsB.id));
      await expect(page.locator('input[name="nameEn"]')).toHaveValue('');
      await expect(
        page.getByText(m['packages.empty'], { exact: true }),
      ).toBeVisible();
      release();
      await page.unrouteAll({ behavior: 'wait' });
      await expect(page.locator('input[name="nameEn"]')).toHaveValue('');
      await expect(
        page.getByRole('main').getByText(m['packages.saved'], { exact: true }),
      ).toHaveCount(0);
    });
});
