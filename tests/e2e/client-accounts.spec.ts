import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE } from '../../lib/design/preferences';
import { randomUUID } from 'node:crypto';

const origin = 'http://localhost:3000';
const local = Boolean(
  process.env.DB_URL || process.env.SUPABASE_DB_URL || process.env.API_URL,
);
let validToken: string;
let pendingToken: string;
let signedInToken: string;
let unavailableToken: string;
let duplicateToken: string;
let correctedToken: string;
let providerToken: string;
let expiredToken: string;
let knownStaffEmail: string;
let fixture: Awaited<
  ReturnType<
    typeof import('../integration/registration-links-fixture').registrationFixture
  >
>;

test.beforeAll(async () => {
  if (!local) return;
  const { registrationFixture, secret, issue, checked } =
    await import('../integration/registration-links-fixture');
  fixture = await registrationFixture();
  knownStaffEmail = fixture.po.email;
  const seed = async () => {
    const value = secret();
    checked(
      await issue(fixture, fixture.po.client, { token_hash: value.hash }),
    );
    return value.token;
  };
  validToken = await seed();
  pendingToken = await seed();
  signedInToken = await seed();
  unavailableToken = await seed();
  duplicateToken = await seed();
  correctedToken = await seed();
  providerToken = await seed();
  const expired =
    await import('../integration/registration-links-fixture').then(
      ({ backdated }) =>
        backdated(
          fixture,
          new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        ),
    );
  expiredToken = expired.token;
});

async function fillSignup(
  page: import('@playwright/test').Page,
  values: { name: string; email: string; phone?: string },
) {
  await page.getByLabel('Name', { exact: true }).fill(values.name);
  await page.getByLabel('Email', { exact: true }).fill(values.email);
  await page
    .getByRole('textbox', { name: 'Phone number' })
    .fill(
      values.phone ??
        `0101234${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
    );
  await page.getByLabel('Password', { exact: true }).fill('Complex!2345');
}

test('valid signup link renders a minimal form with private route headers', async ({
  page,
  context,
}) => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  const response = await page.goto(`/register/${validToken}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(
    page.getByRole('heading', {
      name: getMessages('en')['registration.publicValid'],
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Country')).toHaveValue('EG');
  await expect(page.getByLabel('Phone number')).toBeVisible();
  await expect(page.getByLabel('Name')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.locator('input[name="token"]')).toHaveCount(0);
  expect(await page.locator('main').innerText()).not.toContain(validToken);
});

test('pending submission disables the form and ignores a second submit', async ({
  page,
  context,
}) => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.14' });
  await page.goto(`/register/${pendingToken}`);
  await fillSignup(page, {
    name: 'Example Person',
    email: `client-${randomUUID()}@example.test`,
  });
  let release!: () => void;
  let received!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    intercepted = new Promise<void>((resolve) => {
      received = resolve;
    });
  let postCount = 0;
  await page.route(`**/register/${pendingToken}`, async (route) => {
    if (route.request().method() === 'POST') {
      postCount += 1;
      received();
      await gate;
    }
    await route.continue();
  });
  const submit = page.locator('form button[type="submit"]');
  await submit.click();
  await intercepted;
  await expect(submit).toBeDisabled();
  await page
    .locator('form')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  release();
  await expect(page.getByRole('status')).toHaveText(
    'Thank you. Your registration request is complete.',
  );
  expect(postCount).toBe(1);
  await page.unrouteAll();
});

test('invalid, nested and denied registration paths keep privacy headers and hide the route token', async ({
  page,
}) => {
  const token = 'x'.repeat(43);
  const invalid = await page.goto(`/register/${token}`);
  expect(invalid?.status()).toBe(200);
  expect(invalid?.headers()['referrer-policy']).toBe('no-referrer');
  expect(invalid?.headers()['cache-control']).toContain('no-store');
  expect(page.url()).not.toContain('next=');
  const denied = await page.request.get(`${origin}/register/${token}/nested`, {
    maxRedirects: 0,
  });
  expect(denied.status()).toBe(307);
  expect(denied.headers()['referrer-policy']).toBe('no-referrer');
  expect(denied.headers()['cache-control']).toContain('no-store');
  expect((denied.headers()['location'] ?? '').includes(token)).toBe(false);
  expect(denied.headers()['location']).not.toContain('next=');
});

test('expired links render the same generic invalid state with private headers', async ({
  page,
  context,
}) => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  const response = await page.goto(`/register/${expiredToken}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(
    page.getByRole('heading', {
      name: getMessages('en')['registration.publicInvalid'],
    }),
  ).toBeVisible();
});

test('invalid fields can be corrected without consuming the signup link', async ({
  page,
  context,
}) => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.15' });
  await page.goto(`/register/${correctedToken}`);
  await fillSignup(page, {
    name: 'Example Person',
    email: 'invalid',
    phone: '01012',
  });
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  await expect(page.locator('form p[role="alert"]')).toHaveText(
    'Check the highlighted fields and try again.',
  );
  await fillSignup(page, {
    name: 'Example Person',
    email: `client-${randomUUID()}@example.test`,
  });
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  await expect(page.getByRole('status')).toHaveText(
    'Thank you. Your registration request is complete.',
  );
});

test('missing trusted IP returns a private unavailable payload without consuming the link', async ({
  page,
  context,
}) => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.goto(`/register/${unavailableToken}`);
  await fillSignup(page, {
    name: 'Example Person',
    email: `client-${randomUUID()}@example.test`,
  });
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  expect(response.headers()['cache-control']).toContain('no-store');
  await expect(page.getByRole('status')).toHaveText('Please try again later.');

  const retryPage = await context.newPage();
  await retryPage.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.10' });
  await retryPage.goto(`/register/${unavailableToken}`);
  await fillSignup(retryPage, {
    name: 'Example Person',
    email: `client-${randomUUID()}@example.test`,
  });
  await retryPage
    .getByRole('button', { name: 'Create registration request' })
    .click();
  await expect(retryPage.getByRole('status')).toHaveText(
    'Thank you. Your registration request is complete.',
  );
});

test('provider failure returns generic unavailable, then a retry can complete', async ({
  page,
  context,
}) => {
  test.skip(
    !local || process.env.LOCAL_SUPABASE_PROVIDER_FAULT_TEST !== 'true',
    'Run only against the disposable local stack with the provider fault opt-in.',
  );
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.16' });
  await page.goto(`/register/${providerToken}`);
  await fillSignup(page, {
    name: 'Example Person',
    email: `provider-${randomUUID()}@example.test`,
  });
  execFileSync('docker', ['stop', 'supabase_kong_lifter'], { stdio: 'ignore' });
  try {
    const unavailableResponse = page.waitForResponse(
      (response) => response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Create registration request' })
      .click();
    const response = await unavailableResponse;
    expect(response.status()).toBe(200);
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
    expect(response.headers()['cache-control']).toContain('no-store');
    await expect(page.getByRole('status')).toHaveText(
      'Please try again later.',
    );
  } finally {
    execFileSync('docker', ['start', 'supabase_kong_lifter'], {
      stdio: 'ignore',
    });
  }
  await expect
    .poll(
      async () => {
        try {
          const response = await page.request.get(
            `${process.env.API_URL || process.env.SUPABASE_URL}/auth/v1/health`,
          );
          return response.status() < 500;
        } catch {
          return false;
        }
      },
      { timeout: 15000 },
    )
    .toBe(true);
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  await expect(page.getByRole('status')).toHaveText(
    'Thank you. Your registration request is complete.',
  );
});

test('committed signup retry returns invalid and never creates a second identity', async ({
  page,
  context,
}) => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  const email = `client-${randomUUID()}@example.test`;
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.11' });
  const getResponse = await page.goto(`/register/${validToken}`);
  expect(getResponse?.headers()['referrer-policy']).toBe('no-referrer');
  expect(getResponse?.headers()['cache-control']).toContain('no-store');
  await fillSignup(page, { name: 'Example Person', email });
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  const actionResponse = await responsePromise;
  expect(actionResponse.status()).toBe(200);
  expect(actionResponse.headers()['referrer-policy']).toBe('no-referrer');
  expect(actionResponse.headers()['cache-control']).toContain('no-store');
  await expect(page.getByRole('status')).toHaveText(
    'Thank you. Your registration request is complete.',
  );
  expect(
    (await context.cookies(origin)).some((cookie) =>
      cookie.name.startsWith('sb-'),
    ),
  ).toBe(false);

  const retryResponsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  const retryResponse = await retryResponsePromise;
  expect(retryResponse.status()).toBe(200);
  expect(retryResponse.headers()['referrer-policy']).toBe('no-referrer');
  expect(retryResponse.headers()['cache-control']).toContain('no-store');
  const retryView = await page.locator('main').evaluate((element) => {
    const main = element as HTMLElement;
    const text = main.innerText;
    return {
      invalid: text.includes(
        'This registration link is invalid or no longer available.',
      ),
      complete: text.includes(
        'Thank you. Your registration request is complete.',
      ),
      unavailable: text.includes('Please try again later.'),
      duplicate: text.includes(
        'This email is already registered. Contact support.',
      ),
      invalidInput: text.includes(
        'Check the highlighted fields and try again.',
      ),
      signedIn: text.includes('Please sign out before submitting'),
      form: !!main.querySelector('form'),
    };
  });
  expect(retryView).toEqual({
    invalid: true,
    complete: false,
    unavailable: false,
    duplicate: false,
    invalidInput: false,
    signedIn: false,
    form: true,
  });
  const db = (await import('../integration/registration-links-fixture')).sql();
  try {
    const [row] =
      await db`select count(*)::int as n from auth.users where lower(email)=lower(${email})`;
    expect(row!.n).toBe(1);
  } finally {
    await db.end();
  }
});

test('identity collision keeps the contract duplicate wording without field details', async ({
  page,
  context,
}) => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.12' });
  await page.goto(`/register/${duplicateToken}`);
  await fillSignup(page, {
    name: 'Example Person',
    email: knownStaffEmail,
  });
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  await expect(page.getByRole('status')).toHaveText(
    'This email is already registered. Contact support.',
  );
  const duplicateMessage = await page.getByRole('status').textContent();
  expect(duplicateMessage?.includes(knownStaffEmail) ?? false).toBe(false);
});

test('signed-in visitors get a manual sign-out prompt and no signup form', async ({
  page,
  context,
}) => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  const { createServerClient } = await import('@supabase/ssr');
  const session = (await fixture.po.client.auth.getSession()).data.session;
  expect(!!session).toBe(true);
  if (!session) return;
  type SessionCookie = {
    name: string;
    value: string;
    options?: {
      maxAge?: number;
      expires?: number | string | Date;
      httpOnly?: boolean;
      sameSite?: 'lax' | 'strict' | 'none';
    };
  };
  const collected: SessionCookie[] = [];
  const client = createServerClient(
    process.env.API_URL!,
    process.env.ANON_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: (values) => {
          collected.push(...(values as SessionCookie[]));
        },
      },
    },
  );
  const set = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  expect(set.error === null).toBe(true);
  const now = Math.floor(Date.now() / 1000);
  await context.addCookies(
    collected.map((cookie) => {
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
        ...(options?.httpOnly !== undefined
          ? { httpOnly: options.httpOnly }
          : {}),
        ...(sameSite ? { sameSite } : {}),
      };
    }),
  );
  expect(collected.length).toBeGreaterThan(0);
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.goto(`/register/${signedInToken}`);
  await expect(page.getByRole('status')).toHaveText(
    'Please sign out before submitting this registration request. Return to this page after signing out.',
  );
  await expect(page.locator('main form')).toHaveCount(0);
});

test('lost committed response leaves one identity and the link no longer opens as valid', async ({
  page,
  context,
}) => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  const { secret, issue, checked } =
    await import('../integration/registration-links-fixture');
  const state = secret();
  checked(await issue(fixture, fixture.po.client, { token_hash: state.hash }));
  const email = `client-${randomUUID()}@example.test`;
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.13' });
  await page.goto(`/register/${state.token}`);
  await fillSignup(page, { name: 'Example Person', email });
  let committedResponseStatus = 0;
  await page.route(`**/register/${state.token}`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const committedResponse = await route.fetch();
    committedResponseStatus = committedResponse.status();
    await route.abort('failed');
  });
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.unrouteAll();
  expect(committedResponseStatus).toBe(200);
  const db = (await import('../integration/registration-links-fixture')).sql();
  try {
    const [row] =
      await db`select count(*)::int as n from auth.users where lower(email)=lower(${email})`;
    expect(row!.n).toBe(1);
  } finally {
    await db.end();
  }
  const response = await page.goto(`/register/${state.token}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(
    page.getByRole('heading', {
      name: getMessages('en')['registration.publicInvalid'],
    }),
  ).toBeVisible();
  const retryDb = (
    await import('../integration/registration-links-fixture')
  ).sql();
  try {
    const [row] =
      await retryDb`select count(*)::int as n from auth.users where lower(email)=lower(${email})`;
    expect(row!.n).toBe(1);
  } finally {
    await retryDb.end();
  }
});
