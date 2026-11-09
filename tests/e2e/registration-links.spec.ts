import AxeBuilder from '@axe-core/playwright';
import { createServerClient } from '@supabase/ssr';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

const origin = 'http://localhost:3000';
const local = Boolean(process.env.DB_URL || process.env.SUPABASE_DB_URL);
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page) {
  return (await new AxeBuilder({ page }).withTags(axeTags).analyze())
    .violations;
}

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

/**
 * Playwright only understands `expires` (seconds since the epoch); Supabase's
 * `maxAge` was previously passed through unchanged and silently ignored, so a
 * session could degrade to a context-lifetime cookie. Convert explicitly and
 * always give browser cookies a concrete future expiry.
 */
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

async function signIn(
  context: BrowserContext,
  identity: { client: import('@supabase/supabase-js').SupabaseClient },
) {
  const { loadEnv } = await import('../integration/harness');
  const env = loadEnv();
  const {
    data: { session },
  } = await identity.client.auth.getSession();
  if (!session) throw new Error('fixture session missing');
  const collected: SessionCookie[] = [];
  const client = createServerClient(env.apiUrl, env.anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (values) => {
        collected.push(...(values as SessionCookie[]));
      },
    },
  });
  expect(
    (
      await client.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
    ).error,
  ).toBeNull();
  const now = Math.floor(Date.now() / 1000);
  const cookies = collected.map((cookie) => sessionCookie(cookie, now));
  expect(cookies.length).toBeGreaterThan(0);
  for (const cookie of cookies) expect(cookie.expires).toBeGreaterThan(now);
  await context.clearCookies({ name: /^sb-/ });
  await context.addCookies(cookies);
}

for (const locale of ['ar', 'en'] as const)
  test(`${locale}: public invalid runs without backend env, is generic, accessible and exact-route-only`, async ({
    page,
    context,
  }) => {
    const m = getMessages(locale);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, url: origin },
    ]);
    for (const token of ['bogus', 'malformed-token', 'a'.repeat(41)]) {
      const response = await page.goto(`/register/${token}`);
      expect(response!.status()).toBe(200);
      expect(response!.headers()['referrer-policy']).toBe('no-referrer');
      expect(response!.headers()['cache-control']).toContain('no-store');
      await expect(
        page.getByRole('heading', { name: m['registration.publicInvalid'] }),
      ).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute(
        'dir',
        locale === 'ar' ? 'rtl' : 'ltr',
      );
      expect(await violations(page)).toEqual([]);
      expect(page.url()).not.toContain('/login');
      expect(page.url()).not.toContain('next=');
    }
    for (const path of [
      '/register',
      '/register/a/b',
      `/register/${'a'.repeat(43)}/extra`,
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\/?$/);
      expect(page.url()).not.toContain(
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      );
      expect(page.url()).not.toContain('next=');
    }
    await page.goto('/register-prefix/a');
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await page.goto('/registration-links?workspace=fixture');
    await expect(page).toHaveURL(
      `/login?next=${encodeURIComponent('/registration-links?workspace=fixture')}`,
    );
  });

test('trailing slash on /register/<token> is canonicalized before any login redirect', async ({
  page,
  context,
}) => {
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  const token = 'a'.repeat(43);
  const raw = await page.request.get(`${origin}/register/${token}/`, {
    maxRedirects: 0,
  });
  expect(raw.status()).toBe(308);
  const location = new URL(raw.headers()['location']!, origin);
  expect(location.pathname).toBe(`/register/${token}`);
  expect(location.search).toBe('');
  expect(location.toString()).not.toContain('/login');
  const followed = await page.goto(`/register/${token}/`);
  expect(followed!.status()).toBe(200);
  expect(followed!.headers()['referrer-policy']).toBe('no-referrer');
  expect(page.url()).toBe(`${origin}/register/${token}`);
  await expect(
    page.getByRole('heading', {
      name: getMessages('en')['registration.publicInvalid'],
    }),
  ).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test.describe('local public registration states (required for review)', () => {
  test.skip(
    !local,
    'Requires disposable local API_URL/ANON_KEY/SERVICE_ROLE_KEY/DB_URL; reviewer must run authenticated mode.',
  );
  let f: Awaited<
    ReturnType<
      typeof import('../integration/registration-links-fixture').registrationFixture
    >
  >;
  let validToken: string;
  let states: Record<string, string>;
  test.beforeAll(async () => {
    const { registrationFixture, secret, issue, checked, backdated } =
      await import('../integration/registration-links-fixture');
    f = await registrationFixture();
    const valid = secret();
    checked(await issue(f, f.po.client, { token_hash: valid.hash }));
    validToken = valid.token;
    const expired = await backdated(
      f,
      new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    );
    const pastGrace = await backdated(
      f,
      new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      new Date(Date.now() - 70 * 60 * 1000).toISOString(),
    );
    const consumed = await backdated(
      f,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      null,
      new Date().toISOString(),
    );
    states = {
      unknown: secret().token,
      malformed: 'malformed-token',
      'expired-never-opened': expired.token,
      'past-grace': pastGrace.token,
      consumed: consumed.token,
    };
  });
  for (const locale of ['ar', 'en'] as const)
    test(`${locale}: unknown, malformed, expired, past-grace and consumed render the identical generic invalid page`, async ({
      page,
      context,
    }) => {
      const m = getMessages(locale);
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, url: origin },
      ]);
      let reference: string | undefined;
      for (const [cause, token] of Object.entries(states)) {
        const response = await page.goto(`/register/${token}`);
        expect(response!.status(), cause).toBe(200);
        expect(response!.headers()['referrer-policy'], cause).toBe(
          'no-referrer',
        );
        expect(response!.headers()['cache-control'], cause).toContain(
          'no-store',
        );
        await expect(
          page.getByRole('heading', {
            name: m['registration.publicInvalid'],
          }),
        ).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        const text = await page.locator('main').innerText();
        expect(text, cause).not.toContain(f.wsA.name);
        if (reference === undefined) reference = text;
        else expect(text, cause).toBe(reference);
        expect(await violations(page), cause).toEqual([]);
        expect(page.url()).not.toContain('/login');
        expect(page.url()).not.toContain('next=');
      }
    });
  test('valid fixture shows the workspace name and bilingual signup form', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
    ]);
    const m = getMessages('en');
    const link = `${origin}/register/${validToken}`;
    const response = await page.goto(link);
    expect(response!.status()).toBe(200);
    expect(response!.headers()['referrer-policy']).toBe('no-referrer');
    await expect(
      page.getByRole('heading', { name: m['registration.publicValid'] }),
    ).toBeVisible();
    await expect(page.getByText(f.wsA.name, { exact: true })).toBeVisible();
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(
      /1200|XTS|test-authored|Continue|invalid|expired|consumed/i,
    );
    await expect(page.locator('main form')).toHaveCount(1);
    await expect(
      page.locator('main [name="email"], main [name="password"]'),
    ).toHaveCount(2);
    await expect(
      page.getByLabel(m['clientSignup.name'], { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel(m['clientSignup.dateOfBirth'], { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel(m['clientSignup.username'], { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel(
        `${m['clientSignup.telegramUsername']} (${m['clientSignup.optional']})`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByLabel(m['clientSignup.email'], { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel(m['clientSignup.password'], { exact: true }),
    ).toBeVisible();
    expect(await violations(page)).toEqual([]);
    const raw = await page.request.get(`${link}/`, { maxRedirects: 0 });
    expect(raw.status()).toBe(308);
    const location = new URL(raw.headers()['location']!, origin);
    expect(location.pathname).toBe(`/register/${validToken}`);
    expect(location.search).toBe('');
    expect(location.toString()).not.toContain('/login');
    const followed = await page.goto(`${link}/`);
    expect(followed!.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: m['registration.publicValid'] }),
    ).toBeVisible();
    await expect(page.getByText(f.wsA.name, { exact: true })).toBeVisible();
  });
});

test.describe('required local authenticated registration acceptance', () => {
  test.skip(
    !local,
    'Local harness credentials required for authenticated acceptance',
  );
  let f: Awaited<
    ReturnType<
      typeof import('../integration/registration-links-fixture').registrationFixture
    >
  >;
  test.beforeEach(async () => {
    const { registrationFixture } =
      await import('../integration/registration-links-fixture');
    f = await registrationFixture();
  });
  for (const locale of ['ar', 'en'] as const)
    for (const role of ['po', 'woA', 'salesA', 'trainerA'] as const)
      test(`${locale} ${role}: exact terms, keyboard, schedule, copy-only, scope and themes`, async ({
        page,
        context,
      }) => {
        await signIn(context, f[role]);
        const m = getMessages(locale);
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: origin },
          { name: THEME_COOKIE, value: 'dark', url: origin },
        ]);
        await page.goto('/');
        await expect(
          page.getByRole('link', {
            name: m['registration.title'],
            exact: true,
          }),
        ).toBeVisible();
        const registrationResponse = await page.goto(
          `/registration-links?workspace=${f.wsA.id}`,
        );
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        await expect(
          page.getByRole('heading', {
            name: m['registration.title'],
            exact: true,
          }),
          `registration route status=${registrationResponse?.status()} url=${page.url()} body=${(
            await page
              .locator('body')
              .innerText()
              .catch(() => '')
          )
            .replace(/\s+/g, ' ')
            .slice(0, 300)}`,
        ).toBeVisible();
        await expect(
          page.getByText('1200 XTS', { exact: false }),
        ).toBeVisible();
        if (role !== 'po') {
          const options = page
            .getByLabel(m['registration.workspace'])
            .locator('option');
          expect(await options.count()).toBe(1);
        }
        if (role === 'salesA') {
          await mkdir('.wrangler/f10-verification/screens', {
            recursive: true,
          });
          await page.screenshot({
            path: `.wrangler/f10-verification/screens/${locale}-dark.png`,
            fullPage: true,
          });
        }
        await page
          .getByRole('button', { name: m['registration.issue'], exact: true })
          .click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByTestId('dialog-cancel')).toBeFocused();
        if (role === 'salesA') expect(await violations(page)).toEqual([]);
        if (role === 'trainerA')
          await expect(
            dialog.getByRole('button', { name: m['registration.add'] }),
          ).toHaveCount(0);
        else {
          await dialog
            .getByRole('button', { name: m['registration.add'] })
            .click();
          await dialog
            .getByLabel(`${m['registration.amount']} 1`, { exact: true })
            .fill('1199');
          await dialog
            .getByLabel(`${m['registration.offset']} 1`, { exact: true })
            .fill('2');
          await dialog.getByTestId('dialog-confirm').click();
          await expect(
            dialog.getByLabel(m['registration.url'], { exact: true }),
          ).toHaveCount(0);
          await dialog
            .getByLabel(`${m['registration.amount']} 1`, { exact: true })
            .fill('1200');
        }
        await dialog.getByTestId('dialog-confirm').click();
        const urlField = dialog.getByLabel(m['registration.url'], {
          exact: true,
        });
        await expect(urlField).toBeVisible();
        const link = await urlField.inputValue();
        expect(link.startsWith(`${origin}/register/`)).toBe(true);
        await dialog.getByTestId('dialog-confirm').click();
        await expect(dialog.getByText(m['registration.copied'])).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(
          page.getByRole('button', {
            name: m['registration.issue'],
            exact: true,
          }),
        ).toBeFocused();
        await expect(
          page.getByText(m['registration.valid'], { exact: true }),
        ).toBeVisible();
        expect(await violations(page)).toEqual([]);
        await context.addCookies([
          { name: THEME_COOKIE, value: 'light', url: origin },
        ]);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload();
        if (role === 'salesA')
          await page.screenshot({
            path: `.wrangler/f10-verification/screens/${locale}-light-mobile.png`,
            fullPage: true,
          });
        expect(await violations(page)).toEqual([]);
        if (role === 'salesA' || role === 'trainerA')
          expect(await page.content()).not.toMatch(
            /commission_rate_bp|token_hash/,
          );
        await page
          .getByRole('button', { name: m['registration.issue'], exact: true })
          .click();
        await expect(
          page.getByLabel(m['registration.url'], { exact: true }),
        ).toHaveCount(0);
        await page.keyboard.press('Escape');
        const publicContext = await context.browser()!.newContext();
        const publicPage = await publicContext.newPage();
        try {
          const response = await publicPage.goto(link);
          expect(response!.status()).toBe(200);
          expect(response!.headers()['referrer-policy']).toBe('no-referrer');
          await expect(
            publicPage.getByText(f.wsA.name, { exact: true }),
          ).toBeVisible();
          expect(await publicPage.locator('main').innerText()).not.toMatch(
            /1200|XTS|test-authored|Continue/,
          );
        } finally {
          await publicContext.close();
        }
        await page.reload();
        await expect(
          page.getByText(m['registration.opened'], { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText(m['registration.firstOpen'], { exact: false }),
        ).toBeVisible();
      });
  test('foreign workspace actors see only their scope and cannot issue in A', async ({
    browser,
  }) => {
    const { crossWorkspaceOffer, secret, sql } =
      await import('../integration/registration-links-fixture');
    await crossWorkspaceOffer(f);
    for (const name of ['woB', 'salesB', 'trainerB'] as const) {
      const context = await browser.newContext();
      try {
        await signIn(context, f.actors[name]);
        const page = await context.newPage();
        await context.addCookies([
          { name: LOCALE_COOKIE, value: 'en', url: origin },
        ]);
        const denied = await page.goto(
          `/registration-links?workspace=${f.wsA.id}`,
        );
        expect([200, 404]).toContain(denied?.status());
        await expect(page.getByText('404', { exact: true })).toBeVisible();
        expect(await page.content()).not.toContain(f.wsA.name);
        await page.goto('/registration-links');
        await expect(
          page.getByRole('heading', {
            name: 'Registration links',
            exact: true,
          }),
        ).toBeVisible();
        const options = page.getByLabel('Workspace').locator('option');
        await expect(options).toHaveCount(1);
        await expect(options.first()).toHaveText(f.wsB.name);
        expect(await page.content()).not.toContain(f.wsA.name);
        expect(await page.content()).not.toContain('token_hash');
        // PO/WO may read scoped commission rates; Sales/Trainer payloads may not.
        if (name !== 'woB')
          expect(await page.content()).not.toContain('commission_rate_bp');
        for (const installments of [
          null,
          [{ seq: 1, amount_minor: '1200', due_offset_days: 2 }],
        ])
          expect(
            (
              await f.actors[name].client.rpc('issue_registration_link', {
                workspace_id: f.wsA.id,
                package_version_id: f.p.versionId,
                token_hash: secret().hash,
                installments,
              })
            ).error?.code,
          ).toBe('42501');
      } finally {
        await context.close();
      }
    }
    const db = sql();
    try {
      const [count] =
        await db`select count(*)::int as n from public.registration_links where workspace_id=${f.wsA.id}`;
      expect(count!.n).toBe(0);
    } finally {
      await db.end();
    }
  });
  test('forged Trainer schedule is denied server-side and null schedule remains allowed', async () => {
    const token = () => randomBytes(32).toString('hex');
    for (const installments of [
      [],
      {},
      [{ seq: 1, amount_minor: '1200', due_offset_days: 2 }],
    ])
      expect(
        (
          await f.trainerA.client.rpc('issue_registration_link', {
            workspace_id: f.wsA.id,
            package_version_id: f.p.versionId,
            token_hash: token(),
            installments,
          })
        ).error?.code,
      ).toBe('42501');
    const ok = await f.trainerA.client.rpc('issue_registration_link', {
      workspace_id: f.wsA.id,
      package_version_id: f.p.versionId,
      token_hash: token(),
      installments: null,
    });
    expect(ok.error).toBeNull();
    expect(ok.data).toMatch(/^[0-9a-f-]{36}$/);
  });
  test('revoked and no-profile identities are denied with no workspace or 404', async ({
    browser,
  }) => {
    for (const [name, expected] of [
      ['revoked', 'No workspaces are available.'],
      ['noProfile', '404'],
    ] as const) {
      const context = await browser.newContext();
      try {
        await signIn(context, f.actors[name]);
        const page = await context.newPage();
        await context.addCookies([
          { name: LOCALE_COOKIE, value: 'en', url: origin },
        ]);
        const response = await page.goto('/registration-links');
        if (name === 'noProfile') {
          expect([200, 404]).toContain(response?.status());
          await expect(page.getByText('404', { exact: true })).toBeVisible();
        } else {
          await expect(page.getByText(expected, { exact: true })).toBeVisible();
        }
        await expect(
          page.getByRole('button', { name: 'Issue link', exact: true }),
        ).toHaveCount(0);
        expect(await page.content()).not.toContain(f.wsA.name);
        for (const installments of [
          null,
          [{ seq: 1, amount_minor: '1200', due_offset_days: 2 }],
        ])
          expect(
            (
              await f.actors[name].client.rpc('issue_registration_link', {
                workspace_id: f.wsA.id,
                package_version_id: f.p.versionId,
                token_hash: randomBytes(32).toString('hex'),
                installments,
              })
            ).error?.code,
          ).toBe('42501');
      } finally {
        await context.close();
      }
    }
  });
  test('R10-1 stale terms provides translated reload, clears stale selection', async ({
    page,
    context,
  }) => {
    await signIn(context, f.salesA);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
    ]);
    await page.goto(`/registration-links?workspace=${f.wsA.id}`);
    await page.getByRole('button', { name: 'Issue link', exact: true }).click();
    const { publish, checked } =
      await import('../integration/registration-links-fixture');
    checked(await publish(f, f.p.id, { price_minor: '1300' }));
    await page.getByTestId('dialog-confirm').click();
    await expect(
      page.getByText('These package terms changed. Refresh and try again.'),
    ).toBeVisible();
    await expect(
      page.getByLabel('Registration URL', { exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Reload', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('1300 XTS', { exact: false })).toBeVisible();
  });
  test('copy failure preserves manual selection; late clipboard completion cannot affect a reopened dialog', async ({
    page,
    context,
  }) => {
    await signIn(context, f.salesA);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
    ]);
    await page.goto(`/registration-links?workspace=${f.wsA.id}`);
    await page.getByRole('button', { name: 'Issue link', exact: true }).click();
    await page.getByTestId('dialog-confirm').click();
    await expect(
      page.getByLabel('Registration URL', { exact: true }),
    ).toBeVisible();
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('fixture')) },
      }),
    );
    await page.getByTestId('dialog-confirm').click();
    await expect(
      page.getByText('Unable to copy. Select and copy the link manually.'),
    ).toBeVisible();
    await expect(
      page.getByLabel('Registration URL', { exact: true }),
    ).toBeVisible();
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: () =>
            new Promise<void>((resolve) =>
              Object.defineProperty(window, 'releaseF10Copy', {
                configurable: true,
                value: resolve,
              }),
            ),
        },
      }),
    );
    await page.getByTestId('dialog-confirm').click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Issue link', exact: true }).click();
    await page.evaluate(() => {
      (window as unknown as { releaseF10Copy: () => void }).releaseF10Copy();
    });
    await expect(page.getByText('Link copied.')).toHaveCount(0);
    await expect(
      page.getByLabel('Registration URL', { exact: true }),
    ).toHaveCount(0);
  });
  test('late issuance is discarded after close and workspace switch; no-offer/no-workspace states', async ({
    page,
    context,
  }) => {
    await signIn(context, f.po);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
    ]);
    await page.goto(`/registration-links?workspace=${f.wsA.id}`);
    let release!: () => void, received!: () => void;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      intercepted = new Promise<void>((r) => {
        received = r;
      });
    await page.route('**/registration-links?workspace=*', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      received();
      await gate;
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Issue link', exact: true }).click();
    await page.getByTestId('dialog-confirm').click();
    await intercepted;
    await page.keyboard.press('Escape');
    await page.getByLabel('Workspace').selectOption(f.wsB.id);
    await expect(
      page.getByText('No packages are currently available.'),
    ).toBeVisible();
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByLabel('Registration URL', { exact: true }),
    ).toHaveCount(0);
    await page.getByLabel('Workspace').selectOption(f.wsA.id);
    await page.getByRole('button', { name: 'Issue link', exact: true }).click();
    await expect(
      page.getByLabel('Registration URL', { exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await signIn(context, f.actors.revoked);
    await page.goto('/registration-links');
    await expect(page.getByText('No workspaces are available.')).toBeVisible();
  });
});
