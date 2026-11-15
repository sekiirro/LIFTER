import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { createPendingClient } from './registration-approval-fixture';

const origin = process.env.PLAYWRIGHT_BASE_URL!;
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

test('subscription-expired page renders informational copy accessibly across AR/EN x light/dark x mobile/desktop', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  test.skip(!local, 'Requires disposable local Supabase session fixture.');

  const fixture = await createPendingClient();
  await installSession(context, fixture.client);

  const screenshots = join(tmpdir(), 'lifter-f19-t030');
  await mkdir(screenshots, { recursive: true });

  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const viewport of [
        { name: 'mobile390', width: 390, height: 844 },
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
        await page.goto('/subscription-expired');

        const messages = getMessages(locale);
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        await expect(page.locator('html')).toHaveAttribute('lang', locale);

        const heading = page.getByRole('heading', { level: 1 });
        await expect(heading).toBeVisible();
        await expect(heading).toHaveText(messages['plans.expiredTitle']);
        await expect(page.locator('main p')).toHaveText(
          messages['plans.expiredBody'],
        );

        await expect(
          page.locator(
            'button, a, input, select, textarea, form, [role="button"], [role="link"], [tabindex]',
          ),
        ).toHaveCount(0);

        const violations = (
          await new AxeBuilder({ page }).withTags(axeTags).analyze()
        ).violations;
        expect(
          violations.filter((v) =>
            ['serious', 'critical'].includes(v.impact ?? ''),
          ),
        ).toEqual([]);

        await page.screenshot({
          path: join(
            screenshots,
            `subscription-expired-${locale}-${theme}-${viewport.name}.png`,
          ),
          fullPage: true,
        });
      }
    }
  }
});
