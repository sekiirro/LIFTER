import { expect, test, type BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServerClient } from '@supabase/ssr';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from '../integration/harness';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE } from '../../lib/design/preferences';
import { createPendingClient } from './registration-approval-fixture';

const origin = 'http://localhost:3000';

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

test('platform owner approves, observes the pre-activation collection guard, and corrects the recorded payment', async ({
  browser,
  page,
  context: browserContext,
}) => {
  test.setTimeout(120_000);
  test.skip(
    !process.env.DB_URL && !process.env.SUPABASE_DB_URL,
    'Requires the disposable Stack A fixture.',
  );
  const fixture = await createPendingClient([
    { seq: 1, amount_minor: '400', due_offset_days: 0 },
    { seq: 2, amount_minor: '800', due_offset_days: 30 },
  ]);
  const screenshots = join(tmpdir(), 'lifter-f12-u9');
  await mkdir(screenshots, { recursive: true });
  const messages = getMessages('en');
  await signIn(browserContext, fixture.context.actors.po.client);
  await browserContext.addCookies([
    { name: LOCALE_COOKIE, value: 'en', url: origin },
  ]);

  const reviewUrl = `/registration-approvals/${fixture.target.id}?workspace=${encodeURIComponent(fixture.context.wsA.id)}`;
  await page.goto(reviewUrl);
  await expect(
    page.getByRole('heading', {
      name: messages['registrationApproval.review'],
    }),
  ).toBeVisible();
  const reviewViolations = (
    await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
  ).violations;
  expect(
    reviewViolations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: join(screenshots, 'registration-review-en-light-desktop1440.png'),
    fullPage: true,
  });
  await page
    .getByLabel(messages['registrationApproval.paymentDate'])
    .fill('2026-10-30');
  await page
    .getByRole('checkbox', {
      name: messages['registrationApproval.confirmPayment'],
    })
    .check();
  await page
    .getByRole('button', { name: messages['registrationApproval.submit'] })
    .click();
  await expect(
    page.getByText(messages['registrationApproval.success']),
  ).toBeVisible();

  const approvedClientContext = await browser.newContext();
  try {
    await signIn(approvedClientContext, fixture.client);
    await approvedClientContext.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
    ]);
    const approvedClientPage = await approvedClientContext.newPage();
    await approvedClientPage.goto('/account/status');
    await expect(
      approvedClientPage.getByRole('heading', {
        name: messages['registrationApproval.statusApproved'],
      }),
    ).toBeVisible();
    await expect(
      approvedClientPage.getByRole('link', {
        name: messages['registrationApproval.statusContinue'],
      }),
    ).toHaveAttribute('href', '/');
    const approvedViolations = (
      await new AxeBuilder({ page: approvedClientPage })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations;
    expect(
      approvedViolations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  } finally {
    await approvedClientContext.close();
  }

  const db = sql();
  let subscriptionId: string;
  try {
    const [row] =
      await db`select id from public.subscriptions where workspace_id=${fixture.context.wsA.id} and client_id=${fixture.target.id}`;
    if (!row) throw new Error('approved subscription fixture missing');
    subscriptionId = row.id as string;
  } finally {
    await db.end();
  }
  await page.goto(
    `/payments/${subscriptionId}?workspace=${encodeURIComponent(fixture.context.wsA.id)}&client=${encodeURIComponent(fixture.target.id)}`,
  );
  await expect(
    page.getByRole('heading', {
      name: messages['registrationApproval.history'],
    }),
  ).toBeVisible();
  await expect(page.getByTestId('correction-action').first()).toBeVisible();
  const paymentViolations = (
    await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
  ).violations;
  expect(
    paymentViolations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: join(
      screenshots,
      'registration-payment-correction-en-light-desktop1440.png',
    ),
    fullPage: true,
  });
  await page
    .getByLabel(messages['registrationApproval.paymentDate'])
    .fill('2026-10-30');
  await page
    .getByRole('checkbox', {
      name: messages['registrationApproval.confirmPayment'],
    })
    .check();
  await page
    .getByRole('button', { name: messages['registrationApproval.submit'] })
    .click();
  await expect(
    page.getByText(messages['registrationApproval.stale']),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('correction-action').first()).toBeVisible();
  await page.getByTestId('correction-action').first().click();
  await page.getByTestId('dialog-confirm').click();
  await expect(
    page.getByText(messages['registrationApproval.success']),
  ).toBeVisible();

  const browserHandle = browserContext.browser();
  if (!browserHandle) throw new Error('browser fixture unavailable');
  const workspaceOwnerContext = await browserHandle.newContext();
  try {
    await signIn(workspaceOwnerContext, fixture.context.actors.woA.client);
    const ownerPage = await workspaceOwnerContext.newPage();
    await ownerPage.goto(
      `/payments/${subscriptionId}?workspace=${encodeURIComponent(fixture.context.wsA.id)}&client=${encodeURIComponent(fixture.target.id)}`,
    );
    await expect(ownerPage.getByTestId('correction-action')).toHaveCount(0);
  } finally {
    await workspaceOwnerContext.close();
  }
});

test('client status updates after PO rejection and reconsideration without signing in again', async ({
  browser,
  context: staffContext,
}) => {
  test.setTimeout(120_000);
  test.skip(
    !process.env.DB_URL && !process.env.SUPABASE_DB_URL,
    'Requires the disposable Stack A fixture.',
  );
  const fixture = await createPendingClient();
  const messages = getMessages('en');
  const clientContext = await browser.newContext();
  try {
    await signIn(clientContext, fixture.client);
    await clientContext.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
    ]);
    const clientPage = await clientContext.newPage();
    await clientPage.goto('/account/status');
    await expect(
      clientPage.getByRole('heading', {
        name: messages['registrationApproval.statusPending'],
      }),
    ).toBeVisible();

    await signIn(staffContext, fixture.context.actors.po.client);
    await staffContext.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
    ]);
    const staffPage = await staffContext.newPage();
    const reviewUrl = `/registration-approvals/${fixture.target.id}?workspace=${encodeURIComponent(fixture.context.wsA.id)}`;
    await staffPage.goto(reviewUrl);
    await staffPage
      .getByRole('button', { name: messages['registrationApproval.reject'] })
      .click();
    await expect(
      staffPage.getByText(messages['registrationApproval.rejectSuccess']),
    ).toBeVisible();

    await clientPage
      .getByRole('button', {
        name: messages['registrationApproval.statusRefresh'],
      })
      .click();
    await expect(
      clientPage.getByRole('heading', {
        name: messages['registrationApproval.statusRejected'],
      }),
    ).toBeVisible();
    await expect(clientPage.locator('form')).toHaveCount(0);

    await staffPage.goto(reviewUrl);
    await expect(staffPage.getByTestId('approval-review')).toHaveAttribute(
      'data-hydrated',
      'true',
    );
    const reconsiderDate = staffPage.locator('input[type="date"]');
    const todayInCairo = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Africa/Cairo',
    }).format(new Date());
    await reconsiderDate.fill(todayInCairo);
    await expect(reconsiderDate).toHaveValue(todayInCairo);
    await staffPage
      .getByRole('checkbox', {
        name: messages['registrationApproval.confirmPayment'],
      })
      .check();
    await staffPage
      .getByRole('button', {
        name: messages['registrationApproval.reconsider'],
      })
      .click();
    await expect(
      staffPage.getByText(messages['registrationApproval.success']),
    ).toBeVisible();

    await clientPage
      .getByRole('button', {
        name: messages['registrationApproval.statusRefresh'],
      })
      .click();
    await expect(
      clientPage.getByRole('heading', {
        name: messages['registrationApproval.statusApproved'],
      }),
    ).toBeVisible();
    await expect(
      clientPage.getByRole('link', {
        name: messages['registrationApproval.statusContinue'],
      }),
    ).toHaveAttribute('href', '/');
  } finally {
    await clientContext.close();
  }
});
