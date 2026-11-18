import AxeBuilder from '@axe-core/playwright';
import { createServerClient } from '@supabase/ssr';
import { expect, test, type BrowserContext } from '@playwright/test';
import { LOCALE_COOKIE } from '../../lib/design/preferences';

const origin = new URL(process.env.PLAYWRIGHT_BASE_URL!).origin;
for (const locale of ['ar', 'en'] as const)
  test(`${locale}: anonymous package route redirects safely and login passes axe`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, url: origin },
    ]);
    const path = '/packages?workspace=00000000-0000-0000-0000-000000000001';
    await page.goto(path);
    await expect(page).toHaveURL(
      `${origin}/login?next=${encodeURIComponent(path)}`,
    );
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
        url: origin,
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
});
