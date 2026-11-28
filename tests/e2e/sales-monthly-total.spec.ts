import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServerClient } from '@supabase/ssr';
import { sql } from '../integration/harness';
import { clientContext } from '../integration/client-accounts-fixture';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

const origin = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const locales = ['en', 'ar'] as const;
const themes = ['light', 'dark'] as const;
const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

type Locale = (typeof locales)[number];
type Theme = (typeof themes)[number];
type Viewport = keyof typeof viewports;

function screenshotsDir(): string {
  const dir = join(tmpdir(), 'lifter-sales-monthly-total');
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function signIn(
  context: BrowserContext,
  identity: {
    auth: {
      getSession: () => Promise<{
        data: {
          session: { access_token: string; refresh_token: string } | null;
        };
      }>;
    };
  },
) {
  const { data } = await identity.auth.getSession();
  if (!data.session) throw new Error('synthetic UI session missing');
  const cookies: Array<{
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }> = [];
  const client = createServerClient(
    process.env.API_URL || process.env.SUPABASE_URL || '',
    process.env.ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll: () => [],
        setAll: (values) => {
          cookies.push(...values);
        },
      },
    },
  );
  const installed = await client.auth.setSession(data.session);
  if (installed.error) throw new Error('could not install synthetic session');
  const now = Math.floor(Date.now() / 1000);
  await context.clearCookies({ name: /^sb-/ });
  await context.addCookies(
    cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      url: origin,
      expires:
        typeof cookie.options?.maxAge === 'number'
          ? now + Math.floor(cookie.options.maxAge)
          : now + 3600,
      httpOnly: cookie.options?.httpOnly === true,
      sameSite:
        cookie.options?.sameSite === 'strict'
          ? ('Strict' as const)
          : cookie.options?.sameSite === 'none'
            ? ('None' as const)
            : ('Lax' as const),
    })),
  );
}

async function seedSalesProjectionFixture() {
  const f = await clientContext();
  const db = sql();
  const finalizedMonth = '2026-10-01';
  const unfinalizedMonth = '2026-08-01';
  const snapshotId = randomUUID();
  const totals = {
    [f.salesA.userId]: '75.00',
    [f.trainerA.userId]: '20.00',
  };

  try {
    await db`
      insert into public.p7_month_snapshots (
        id, workspace_id, effective_month, formula_version,
        source_watermark, totals, finalized_by
      ) values (
        ${snapshotId}, ${f.wsA.id}, ${finalizedMonth}, 'p7-net-points-v1',
        clock_timestamp(),
        ${db.json(totals)},
        ${f.po.userId}
      )
      on conflict (workspace_id, effective_month) do update
      set totals = ${db.json(totals)}`;

    await db`
      delete from public.p7_month_snapshots
      where workspace_id = ${f.wsA.id} and effective_month = ${unfinalizedMonth}`;

    return { f, finalizedMonth, unfinalizedMonth };
  } finally {
    await db.end();
  }
}

async function setPreferences(
  context: BrowserContext,
  locale: Locale,
  theme: Theme,
) {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: origin },
    { name: THEME_COOKIE, value: theme, url: origin },
  ]);
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    ),
  ).toEqual([]);
}

test.describe('P7 T025 Sales My Monthly Total UI', () => {
  test('Sales sees own finalized total, unfinalized shows Not Available Yet, and WO is denied', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const { f, finalizedMonth, unfinalizedMonth } =
      await seedSalesProjectionFixture();

    const enMessages = getMessages('en');

    // 1. Sales A logs in and visits finalized month
    await signIn(context, f.salesA.client);
    await setPreferences(context, 'en', 'light');

    const finalizedUrl = `/workforce/sales-projection?workspace=${encodeURIComponent(f.wsA.id)}&month=${finalizedMonth}`;
    await page.goto(finalizedUrl);

    // Verify title
    await expect(
      page.getByRole('heading', {
        name: enMessages['workforce.salesProjection.title'],
      }),
    ).toBeVisible();

    // Verify finalized total label and amount
    await expect(
      page.getByText(enMessages['workforce.salesProjection.total']),
    ).toBeVisible();
    const totalElement = page.getByTestId('sales-projection-total');
    await expect(totalElement).toBeVisible();
    await expect(totalElement).toContainText('75.00');

    // Confidentiality check: Trainer A's total is NOT on the page
    await expect(page.locator('body')).not.toContainText('20.00');

    // 2. Sales A visits unfinalized month
    const unfinalizedUrl = `/workforce/sales-projection?workspace=${encodeURIComponent(f.wsA.id)}&month=${unfinalizedMonth}`;
    await page.goto(unfinalizedUrl);

    await expect(
      page.getByText(enMessages['workforce.salesProjection.notAvailable']),
    ).toBeVisible();
    await expect(
      page.getByText(
        enMessages['workforce.salesProjection.notAvailableUntilNextMonth'],
      ),
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      enMessages['workforce.salesProjection.notAvailableHint'],
    );
    await expect(
      page.getByTestId('sales-projection-not-available'),
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText('75.00');

    // 3. Workspace Owner visits the page -> Denied without existence disclosure
    await signIn(context, f.woA.client);
    await page.goto(finalizedUrl);

    await expect(
      page.getByText(enMessages['workforce.salesProjection.denied']),
    ).toBeVisible();
    await expect(page.getByTestId('sales-projection-denied')).toBeVisible();
    await expect(page.getByTestId('sales-projection-total')).not.toBeVisible();
    await expect(page.locator('body')).not.toContainText('75.00');
  });

  test('Screenshot and Axe matrix across {AR, EN} x {light, dark} x {mobile, desktop}', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const { f, finalizedMonth } = await seedSalesProjectionFixture();
    const dir = screenshotsDir();

    // Sign in as Sales A
    await signIn(context, f.salesA.client);

    for (const locale of locales) {
      for (const theme of themes) {
        for (const [vpName, vp] of Object.entries(viewports) as [
          Viewport,
          (typeof viewports)[Viewport],
        ][]) {
          await page.setViewportSize(vp);
          await setPreferences(context, locale, theme);

          const url = `/workforce/sales-projection?workspace=${encodeURIComponent(f.wsA.id)}&month=${finalizedMonth}`;
          await page.goto(url);

          const messages = getMessages(locale);
          await expect(
            page.getByRole('heading', {
              name: messages['workforce.salesProjection.title'],
            }),
          ).toBeVisible();

          // Axe accessibility check
          await axeClean(page);

          // Take screenshot
          const shotPath = join(
            dir,
            `sales-projection-${locale}-${theme}-${vpName}.png`,
          );
          await page.screenshot({ path: shotPath, fullPage: true });
        }
      }
    }
  });
});
