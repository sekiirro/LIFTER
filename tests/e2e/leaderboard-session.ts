import type { BrowserContext } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

export const leaderboardOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
).origin;

/**
 * Installs a synthetic fixture identity's Supabase session as SSR cookies,
 * following the client-notes / registration-approval e2e pattern.
 */
export async function installLeaderboardSession(
  context: BrowserContext,
  identity: SupabaseClient,
) {
  const { loadEnv } = await import('../integration/harness');
  const env = loadEnv();
  const { data } = await identity.auth.getSession();
  if (!data.session) throw new Error('synthetic F24 session missing');
  const { createServerClient } = await import('@supabase/ssr');
  const collected: Array<{
    name: string;
    value: string;
    options?: { maxAge?: number; httpOnly?: boolean; sameSite?: unknown };
  }> = [];
  const client = createServerClient(env.apiUrl, env.anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (values) => {
        collected.push(...values);
      },
    },
  });
  const installed = await client.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (installed.error || collected.length === 0)
    throw new Error('could not install synthetic F24 session');
  const now = Math.floor(Date.now() / 1000);
  await context.clearCookies({ name: /^sb-/ });
  await context.addCookies(
    collected.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      url: leaderboardOrigin,
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
