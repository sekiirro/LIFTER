import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatMinorUnits } from '../../lib/packages/money';
import { clientContext } from '../integration/registration-approval-fixture';
import {
  activate,
  bought,
  pay,
  paymentRequest,
} from '../integration/registration-approval-payment-fixture';
import { admin, sql } from '../integration/harness';
import { testStaffDisplayName } from '../helpers/staff-display-name';
import { randomUUID } from 'node:crypto';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

const screenshotDir =
  process.env.LIFTER_SCREENSHOT_DIR ??
  join(tmpdir(), 'lifter-reports-screenshots');
const leakedMoneyPattern = new RegExp(
  ['400', '800']
    .map((minor) => formatMinorUnits(minor, 'USD', 'en'))
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
);
const baseURL = process.env.PLAYWRIGHT_BASE_URL!;
const db = sql();
let fixture: Awaited<ReturnType<typeof clientContext>>;
let purchase: Awaited<ReturnType<typeof bought>>;
let clientName = '';
let collectionCount = 0;
let testActors: Record<
  'po' | 'woA' | 'salesA' | 'trainerA' | 'woB' | 'client',
  { email: string; password: string }
>;

function currentCairoMonth() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

function shiftMonth(value: string, amount: number) {
  const [year, month] = value.split('-').map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1 + amount, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(screenshotDir, { recursive: true });
  fixture = await clientContext();
  const createActor = async (
    role: 'platform_owner' | 'workspace_owner' | 'sales' | 'trainer' | null,
    label: string,
    workspaceId?: string,
  ) => {
    const email = `reports-${label}-${randomUUID()}@example.test`;
    const password = `Reports-${randomUUID()}-aA1!`;
    const created = await admin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      throw new Error('Synthetic reports actor creation failed');
    if (role) {
      const profile = await admin().from('staff_profiles').insert({
        user_id: created.data.user.id,
        role,
        display_name: testStaffDisplayName(),
      });
      if (profile.error)
        throw new Error('Synthetic reports role creation failed');
      if (workspaceId) {
        const membership = await admin().from('workspace_memberships').insert({
          workspace_id: workspaceId,
          user_id: created.data.user.id,
          granted_by: fixture.po.userId,
        });
        if (membership.error)
          throw new Error('Synthetic reports membership creation failed');
      }
    }
    return { email, password };
  };
  testActors = {
    po: await createActor('platform_owner', 'po'),
    woA: await createActor('workspace_owner', 'wo-a', fixture.wsA.id),
    salesA: await createActor('sales', 'sales-a', fixture.wsA.id),
    trainerA: await createActor('trainer', 'trainer-a', fixture.wsA.id),
    woB: await createActor('workspace_owner', 'wo-b', fixture.wsB.id),
    client: await createActor(null, 'client'),
  };
  purchase = await bought(fixture);
  await db.begin((tx) => activate(tx, fixture, purchase));
  const paid = await pay(
    fixture.actors.po.client,
    'collect',
    paymentRequest(fixture, purchase),
  );
  if (paid.status !== 'ok')
    throw new Error('Synthetic report collection failed');
  const [client] =
    await db`select name from public.clients where id=${purchase.t.id}`;
  clientName = String(client?.name ?? '');
  if (!clientName) throw new Error('Synthetic report client name is missing');
  const report = await fixture.actors.po.client.rpc(
    'package_monthly_collections',
    {
      workspace_id: fixture.wsA.id,
      month_start: `${currentCairoMonth()}-01`,
    },
  );
  collectionCount = report.data?.collections?.length ?? 0;
});

test.afterAll(async () => {
  await db.end();
});

async function signIn(page: Page, actor: { email: string; password: string }) {
  await page.goto('/login');
  const signInForm = page.locator('form').first();
  await signInForm.locator('input[name="email"]').fill(actor.email);
  await signInForm.locator('input[name="password"]').fill(actor.password);
  await signInForm.getByRole('button').click();
  try {
    await expect(page).toHaveURL(/\/$/);
  } catch {
    const alerts = await page.getByRole('alert').allTextContents();
    throw new Error(
      `Synthetic reports actor sign-in failed: ${alerts.join(' ') || 'no sign-in alert'}`,
    );
  }
}

function actorFor(
  role: 'po' | 'woA' | 'salesA' | 'trainerA' | 'woB' | 'client',
) {
  return testActors[role];
}

test('anonymous reports route redirects to login with a safe next parameter', async ({
  page,
}) => {
  await page.goto('/reports');
  await expect(page).toHaveURL(/\/login\?next=%2Freports$/);
});

for (const role of ['salesA', 'trainerA', 'client', 'woB'] as const) {
  test(`${role} sees the denied state without report payloads`, async ({
    page,
  }) => {
    const actor = actorFor(role);
    await page
      .context()
      .addCookies([{ name: LOCALE_COOKIE, value: 'en', url: baseURL }]);
    const rscPayloads: string[] = [];
    page.on('response', async (response) => {
      if (
        response.url().includes('_rsc') ||
        response.request().headers().rsc === '1'
      ) {
        rscPayloads.push(await response.text().catch(() => ''));
      }
    });
    await signIn(page, actor);
    await page.goto(`/reports?workspace=${fixture.wsA.id}`);
    await expect(
      page.getByRole('alert').filter({ hasText: en['reports.denied'] }),
    ).toBeVisible();
    const dom = await page.locator('body').innerText();
    expect(dom).not.toContain(clientName);
    expect(dom).not.toMatch(leakedMoneyPattern);
    expect(rscPayloads.join('\n')).not.toContain(clientName);
    expect(rscPayloads.join('\n')).not.toMatch(leakedMoneyPattern);
  });
}

test('PO and own workspace owner see scoped monthly reporting values and can switch periods', async ({
  page,
}) => {
  await page
    .context()
    .addCookies([{ name: LOCALE_COOKIE, value: 'en', url: baseURL }]);
  await signIn(page, actorFor('po'));
  await page.goto(`/reports?workspace=${fixture.wsA.id}`);
  const reportBody = await page.locator('body').innerText();
  if (!reportBody.includes(en['reports.section.collections']))
    throw new Error(
      `Authorized report route did not load: url=${page.url()} denied=${reportBody.includes(en['reports.denied'])} empty=${reportBody.includes(en['packages.noWorkspace'])} loadError=${reportBody.includes(en['reports.collections.loadError'])}`,
    );
  await expect(
    page.getByRole('heading', { name: en['reports.section.collections'] }),
  ).toBeVisible();
  await expect(
    page.getByText(clientName, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('4.00 USD', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(en['reports.statusPendingRate']).first(),
  ).toBeVisible();
  await expect(page.getByText(en['reports.section.commissions'])).toBeVisible();
  await expect(
    page.getByText(en['reports.section.installments']),
  ).toBeVisible();
  await expect(
    page.getByText(en['reports.installmentClient']).first(),
  ).toBeVisible();

  const month = page.locator('input[type="month"]');
  const currentMonth = await month.inputValue();
  const previousMonth = shiftMonth(currentMonth, -1);
  await page.getByRole('button', { name: en['reports.previousMonth'] }).click();
  await expect(page).toHaveURL(new RegExp(`month=${previousMonth}`));
  await expect(month).toHaveValue(previousMonth);
  await page.getByRole('button', { name: en['reports.nextMonth'] }).click();
  await expect(page).toHaveURL(new RegExp(`month=${currentMonth}`));
  await expect(month).toHaveValue(currentMonth);

  const workspace = page.getByLabel(en['packages.workspace']);
  await expect(
    workspace.locator(`option[value="${fixture.wsB.id}"]`),
  ).toHaveCount(1);
  await workspace.selectOption(fixture.wsB.id);
  await expect(page).toHaveURL(new RegExp(`workspace=${fixture.wsB.id}`));
  await expect(page.getByText(en['reports.collections.empty'])).toBeVisible();

  await signIn(page, actorFor('woA'));
  await page.goto(`/reports?workspace=${fixture.wsA.id}`);
  await expect(
    page.getByText(clientName, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByLabel(en['packages.workspace']).locator('option'),
  ).toHaveCount(1);
  await page.getByLabel(en['packages.workspace']).selectOption(fixture.wsA.id);
  await expect(
    page.getByText(en['reports.installmentClient']).first(),
  ).toBeVisible();
});

const matrix = [
  { locale: 'ar', theme: 'light', width: 390, height: 844 },
  { locale: 'ar', theme: 'light', width: 1440, height: 900 },
  { locale: 'ar', theme: 'dark', width: 390, height: 844 },
  { locale: 'ar', theme: 'dark', width: 1440, height: 900 },
  { locale: 'en', theme: 'light', width: 390, height: 844 },
  { locale: 'en', theme: 'light', width: 1440, height: 900 },
  { locale: 'en', theme: 'dark', width: 390, height: 844 },
  { locale: 'en', theme: 'dark', width: 1440, height: 900 },
] as const;

test('Design Gate: all locale, theme, and viewport cells render without overflow or axe violations', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: 'en', url: baseURL },
  ]);
  await signIn(page, actorFor('po'));
  for (const cell of matrix) {
    await context.addCookies([
      { name: LOCALE_COOKIE, value: cell.locale, url: baseURL },
      { name: THEME_COOKIE, value: cell.theme, url: baseURL },
    ]);
    await page.setViewportSize({ width: cell.width, height: cell.height });
    await page.goto(`/reports?workspace=${fixture.wsA.id}`);
    const messages = cell.locale === 'ar' ? ar : en;
    await expect(page.locator('main')).toHaveAttribute(
      'dir',
      cell.locale === 'ar' ? 'rtl' : 'ltr',
    );
    await expect(
      page.getByRole('heading', { name: messages['reports.title'] }),
    ).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    const violations = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      violations.violations,
      JSON.stringify(violations.violations, null, 2),
    ).toEqual([]);
    await page.screenshot({
      path: join(
        screenshotDir,
        `reports-${cell.locale}-${cell.theme}-${cell.width}x${cell.height}.png`,
      ),
      fullPage: true,
    });
  }
  expect(collectionCount).toBeGreaterThan(0);
});
