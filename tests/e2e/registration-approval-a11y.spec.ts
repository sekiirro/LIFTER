import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext } from '@playwright/test';
import { copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { createPendingClient } from './registration-approval-fixture';

const origin = 'http://localhost:3000';
const local = Boolean(process.env.DB_URL || process.env.SUPABASE_DB_URL);
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

type SessionCookie = {
  name: string;
  value: string;
  options?: {
    maxAge?: number;
    expires?: number | string | Date;
    httpOnly?: boolean;
    sameSite?: boolean | 'lax' | 'strict' | 'none';
  };
};

function sessionCookie(cookie: SessionCookie, now: number) {
  const options = cookie.options;
  const parsedExpiry =
    options?.expires instanceof Date
      ? Math.floor(options.expires.getTime() / 1000)
      : typeof options?.expires === 'number'
        ? Math.floor(options.expires)
        : typeof options?.expires === 'string'
          ? Math.floor(Date.parse(options.expires) / 1000)
          : undefined;
  const expires =
    parsedExpiry !== undefined && Number.isFinite(parsedExpiry)
      ? parsedExpiry
      : typeof options?.maxAge === 'number'
        ? now + Math.floor(options.maxAge)
        : now + 3600;
  const sameSite =
    options?.sameSite === 'strict'
      ? ('Strict' as const)
      : options?.sameSite === 'none'
        ? ('None' as const)
        : options?.sameSite === 'lax'
          ? ('Lax' as const)
          : undefined;
  return {
    name: cookie.name,
    value: cookie.value,
    url: origin,
    expires,
    ...(options?.httpOnly !== undefined ? { httpOnly: options.httpOnly } : {}),
    ...(sameSite ? { sameSite } : {}),
  };
}

async function installSession(
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
  const { loadEnv } = await import('../integration/harness');
  const env = loadEnv();
  const { data } = await identity.auth.getSession();
  if (!data.session) throw new Error('fixture session missing');
  const { createServerClient } = await import('@supabase/ssr');
  const collected: SessionCookie[] = [];
  const client = createServerClient(env.apiUrl, env.anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (values) => {
        collected.push(...(values as SessionCookie[]));
      },
    },
  });
  const result = await client.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (result.error) throw new Error('could not install fixture session');
  const now = Math.floor(Date.now() / 1000);
  const cookies = collected.map((cookie) => sessionCookie(cookie, now));
  if (cookies.length === 0) throw new Error('fixture session cookies missing');
  await context.clearCookies({ name: /^sb-/ });
  await context.addCookies(cookies);
}

async function signInPendingClient(context: BrowserContext) {
  const fixture = await createPendingClient();
  await installSession(context, fixture.client);
  return fixture;
}

test('pending client status renders accessibly in the twelve-cell visual matrix', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  test.skip(!local, 'Requires the disposable Stack A session fixture.');
  await signInPendingClient(context);
  const screenshots = join(tmpdir(), 'lifter-f12-u9');
  await mkdir(screenshots, { recursive: true });

  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const viewport of [
        { name: 'mobile390', width: 390, height: 844 },
        { name: 'tablet768x1024', width: 768, height: 1024 },
        { name: 'desktop1440', width: 1440, height: 900 },
      ]) {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: origin },
          { name: THEME_COOKIE, value: theme, url: origin },
        ]);
        await page.goto('/account/status');
        const messages = getMessages(locale);
        await expect(
          page.getByRole('heading', {
            name: messages['registrationApproval.statusPending'],
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', {
            name: messages['registrationApproval.statusRefresh'],
          }),
        ).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        await expect(page.locator('form')).toHaveCount(0);
        await expect(page.getByRole('textbox')).toHaveCount(0);
        const violations = (
          await new AxeBuilder({ page }).withTags(axeTags).analyze()
        ).violations;
        expect(
          violations.filter((violation) =>
            ['serious', 'critical'].includes(violation.impact ?? ''),
          ),
        ).toEqual([]);
        const screenshot = join(
          screenshots,
          `registration-status-${locale}-${theme}-${viewport.name}.png`,
        );
        await page.screenshot({
          path: screenshot,
          fullPage: true,
        });
        const evidence = join(
          process.cwd(),
          'tests/integration/evidence/f12-u9',
          `registration-status-${locale}-${theme}-${viewport.name}.png`,
        );
        await mkdir(join(process.cwd(), 'tests/integration/evidence/f12-u9'), {
          recursive: true,
        });
        await copyFile(screenshot, evidence);
      }
    }
  }
});

test('pending client and non-approver staff cannot enter approval or payment dashboards', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  test.skip(!local, 'Requires the disposable Stack A session fixture.');
  const fixture = await createPendingClient();
  const targets = [
    {
      label: 'client',
      client: fixture.client,
      denied: ['/registration-approvals', '/payments'],
    },
    {
      label: 'trainer',
      client: fixture.context.actors.trainerA.client,
      denied: ['/registration-approvals', '/payments'],
    },
    {
      label: 'sales',
      client: fixture.context.actors.salesA.client,
      denied: ['/registration-approvals'],
    },
  ];
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  for (const target of targets) {
    await installSession(context, target.client);
    for (const path of target.denied) {
      const route =
        path === '/registration-approvals'
          ? `${path}?workspace=${encodeURIComponent(fixture.context.wsA.id)}`
          : path;
      await page.goto(route);
      await expect(page.getByText('404', { exact: true })).toBeVisible();
    }
    if (target.label === 'sales') {
      await page.goto('/payments');
      await expect(
        page.getByRole('heading', {
          name: getMessages('en')['registrationApproval.paymentTitle'],
        }),
      ).toBeVisible();
    }
  }
});
