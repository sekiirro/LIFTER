import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { createServerClient } from '@supabase/ssr';
import { expect, test, type BrowserContext } from '@playwright/test';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { clientContext } from '../integration/client-accounts-fixture';
import { sql } from '../integration/harness';

const origin = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const locales = ['en', 'ar'] as const;
const themes = ['light', 'dark'] as const;
const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

function screenshotsDir() {
  const directory = join(tmpdir(), 's75-luna-merge3', 'sales-funnel-matrix');
  mkdirSync(directory, { recursive: true });
  return directory;
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

async function setPreferences(
  context: BrowserContext,
  locale: (typeof locales)[number],
  theme: (typeof themes)[number],
) {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, url: origin },
    { name: THEME_COOKIE, value: theme, url: origin },
  ]);
}

function currentCairoMonth() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

test('PO Sales funnel renders and passes axe across locale, theme, and viewport', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const fixture = await clientContext();
  const month = currentCairoMonth();
  const monthDate = `${month}-01`;
  const database = sql();
  try {
    await database`
      insert into public.p7_adjustment_entries (
        workspace_id, staff_user_id, points, effective_month, original_month,
        source_key, source_hash, reason_code
      ) values (
        ${fixture.wsA.id}, ${fixture.salesA.userId}, -1.25, ${monthDate}, ${monthDate},
        ${randomUUID()}, ${'a'.repeat(64)}, 'checkin_delay'
      )`;
  } finally {
    await database.end();
  }

  await signIn(context, fixture.po.client);
  const directory = screenshotsDir();

  for (const locale of locales) {
    for (const theme of themes) {
      for (const [viewportName, viewport] of Object.entries(viewports) as [
        keyof typeof viewports,
        (typeof viewports)[keyof typeof viewports],
      ][]) {
        await page.setViewportSize(viewport);
        await setPreferences(context, locale, theme);
        await page.goto(
          `/workforce/report?workspace=${encodeURIComponent(fixture.wsA.id)}&month=${month}`,
        );

        const messages = getMessages(locale);
        const funnel = page.getByRole('table', {
          name: messages['workforce.salesFunnel.aria.table'],
        });
        await expect(funnel).toBeVisible();
        await expect(
          page
            .getByRole('region', {
              name: messages['workforce.report.section.sales'],
            })
            .getByRole('table', {
              name: messages['workforce.salesFunnel.aria.table'],
            }),
        ).toBeVisible();
        await expect(
          funnel.getByRole('columnheader', {
            name: messages['workforce.salesFunnel.column.pointDeductions'],
          }),
        ).toBeVisible();
        await expect(
          funnel.getByRole('columnheader', {
            name: messages['workforce.salesFunnel.column.poAdjustments'],
          }),
        ).toBeVisible();
        await expect(funnel.getByText('-1.25')).toBeVisible();

        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .include('[role="region"][aria-label]')
          .analyze();
        expect(axe.violations).toEqual([]);

        await page.screenshot({
          path: join(
            directory,
            `sales-funnel-${locale}-${theme}-${viewportName}.png`,
          ),
          fullPage: true,
        });
        await funnel
          .getByRole('columnheader', {
            name: messages['workforce.salesFunnel.column.poAdjustments'],
          })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: join(
            directory,
            `sales-funnel-${locale}-${theme}-${viewportName}-tail.png`,
          ),
          fullPage: true,
        });
      }
    }
  }
});
