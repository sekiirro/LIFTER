import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import type { PortalFixture } from '../integration/client-portal-fixture';

// F22 Frontend Design Gate captures (docs/09-frontend-design-gate.md):
// {AR-RTL, EN-LTR} x {light, dark} x {390px, 1440px} for the client portal
// (/plans, /plans/[planId], restricted state) and the staff directory
// (/clients). Synthetic data only. Runs in CI against the local stack.
const origin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
).origin;
const screenshotDir =
  process.env.F22_SCREENSHOT_DIR ?? join(tmpdir(), 'lifter', 'f22-portal');
const local = Boolean(
  process.env.DB_URL || process.env.SUPABASE_DB_URL || process.env.API_URL,
);

const variants = (['en', 'ar'] as const).flatMap((locale) =>
  (['light', 'dark'] as const).flatMap((theme) =>
    ([390, 1440] as const).map((width) => ({
      locale,
      theme,
      width,
      height: width === 1440 ? 900 : 844,
    })),
  ),
);

type Credentials = { email: string; password: string };
let p: PortalFixture;
let activeClient: Credentials;
let awaitingClient: Credentials;
let trainer: Credentials;
let directoryOwner: Credentials;
let directoryPO: Credentials;
let workoutPlan: string;

async function authUser(label: string): Promise<Credentials & { id: string }> {
  const { admin } = await import('../integration/harness');
  const email = `f22+${label}-${randomUUID()}@example.test`;
  const password = `F22-${randomUUID()}-aA1!`;
  const created = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error('F22 e2e auth user failed');
  return { id: created.data.user.id, email, password };
}

async function signIn(page: Page, credentials: Credentials) {
  await page.context().clearCookies();
  // The app defaults to Arabic without a locale cookie; sign in on the English
  // form (as client-welcome.spec.ts does). capture() then sets each locale.
  await page
    .context()
    .addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.goto('/login');
  const m = getMessages('en');
  const signInForm = page.locator('form').filter({
    has: page.getByLabel(m['auth.password']),
  });
  await signInForm.getByLabel(m['auth.email']).fill(credentials.email);
  await signInForm.getByLabel(m['auth.password']).fill(credentials.password);
  await page.getByRole('button', { name: m['auth.signIn'] }).click();
  // Leave the login page; the home route may forward a client elsewhere.
  await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/u);
}

async function capture(
  page: Page,
  path: string,
  name: string,
  ready: (messages: ReturnType<typeof getMessages>) => Promise<void>,
) {
  for (const variant of variants) {
    await page.context().addCookies([
      { name: LOCALE_COOKIE, value: variant.locale, url: origin },
      { name: THEME_COOKIE, value: variant.theme, url: origin },
    ]);
    await page.setViewportSize({
      width: variant.width,
      height: variant.height,
    });
    await page.goto(path);
    await page.addStyleTag({
      content: 'nextjs-portal { display: none !important; }',
    });
    await ready(getMessages(variant.locale));
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const violations = name.startsWith('directory')
      ? axe.violations
      : axe.violations.filter((violation) =>
          ['critical', 'serious'].includes(violation.impact ?? ''),
        );
    expect(violations).toEqual([]);
    await page.screenshot({
      path: join(
        screenshotDir,
        `${name}-${variant.locale}-${variant.theme}-${variant.width}.png`,
      ),
      fullPage: true,
    });
  }
}

test.describe.serial('F22 client portal and directory design evidence', () => {
  test.beforeAll(async () => {
    test.skip(!local, 'Requires the selected local Supabase stack.');
    const { portalFixture } =
      await import('../integration/client-portal-fixture');
    p = await portalFixture();
    const activeUser = await authUser('active');
    const awaitingUser = await authUser('awaiting');
    const active = await p.makeClient({
      activate: true,
      label: 'Portal active',
      authUserId: activeUser.id,
    });
    await p.makeClient({
      activate: false,
      label: 'Portal awaiting',
      authUserId: awaitingUser.id,
    });
    workoutPlan = await p.createDraft(active.clientId, 'workout', 'F22 e2e');
    await p.publish(workoutPlan, 1, 0);
    await p.revise(workoutPlan, 1, 'F22 e2e r2');
    await p.publish(workoutPlan, 2, 1);
    const nutrition = await p.createDraft(
      active.clientId,
      'nutrition',
      'F22 e2e n',
    );
    await p.publish(nutrition, 1, 0);
    // The F19 delivery hook (T022) wrote one notice per first-plan delivery above
    // (workout and nutrition, both delivered after the override activation). Mark the
    // nutrition one read so the captures show one unread and one read notice.
    const marked = await p.db`update app_private.client_inbox_notices
      set read_at=clock_timestamp()
      where workspace_id=${p.fixture.wsA.id} and client_id=${active.clientId}
        and notice_kind='nutrition_delivered'
      returning id`;
    if (marked.length !== 1) throw new Error('F22 e2e hook notice missing');
    activeClient = activeUser;
    awaitingClient = awaitingUser;

    const staff = await authUser('trainer');
    const { admin } = await import('../integration/harness');
    const { testStaffDisplayName } =
      await import('../helpers/staff-display-name');
    const profile = await admin().from('staff_profiles').insert({
      user_id: staff.id,
      role: 'trainer',
      display_name: testStaffDisplayName(),
    });
    if (profile.error) throw new Error('F22 e2e staff profile failed');
    const membership = await p.fixture.po.client
      .from('workspace_memberships')
      .insert({
        workspace_id: p.fixture.wsA.id,
        user_id: staff.id,
        granted_by: p.fixture.po.userId,
      });
    if (membership.error) throw new Error('F22 e2e membership failed');
    trainer = staff;

    const owner = await authUser('directory-owner');
    const ownerProfile = await admin().from('staff_profiles').insert({
      user_id: owner.id,
      role: 'workspace_owner',
      display_name: testStaffDisplayName(),
    });
    if (ownerProfile.error) throw new Error('F22 e2e owner profile failed');
    const ownerMembership = await p.fixture.po.client
      .from('workspace_memberships')
      .insert({
        workspace_id: p.fixture.wsA.id,
        user_id: owner.id,
        granted_by: p.fixture.po.userId,
      });
    if (ownerMembership.error)
      throw new Error('F22 e2e owner membership failed');
    directoryOwner = owner;

    const po = await authUser('directory-po');
    const poProfile = await admin().from('staff_profiles').insert({
      user_id: po.id,
      role: 'platform_owner',
      display_name: testStaffDisplayName(),
    });
    if (poProfile.error) throw new Error('F22 e2e PO profile failed');
    directoryPO = po;

    // T036 e2e evidence: seed a weekly check-in submission in the last 7 days for the active client
    // so the new-check-ins indicator renders on the staff directory rows.
    const checkinPolicyId = randomUUID();
    const checkinFormId = randomUUID();
    const checkinAssignId = randomUUID();
    const [existingTerms] = await p.db`
      select version from app_private.terms_policy_versions where status = 'published' order by created_at desc limit 1
    `;
    const terms = existingTerms!.version as string;
    await p.db`
      insert into public.forms(id, workspace_id, name)
      values(${checkinFormId}, ${p.fixture.wsA.id}, 'F23 weekly check-in')
    `;
    await p.db`
      insert into public.form_versions(workspace_id, form_id, version_number, terms_policy_version, definition, status)
      values(${p.fixture.wsA.id}, ${checkinFormId}, 1, ${terms}, '{"questions":[]}'::jsonb, 'published')
    `;
    await p.db`
      insert into app_private.form_assignment_policies(
        id, workspace_id, form_id, version_number, audience_kind, specific_client_ids,
        trigger_kind, timing, stop_conditions, configured_by
      ) values (
        ${checkinPolicyId}, ${p.fixture.wsA.id}, ${checkinFormId}, 1, 'all_active_clients', '{}',
        'weekly_checkin', '{"client_deadline_days":3}'::jsonb, '{}'::jsonb, ${staff.id}
      )
    `;
    await p.db`
      insert into app_private.form_assignment_occurrences(
        workspace_id, policy_id, occurrence_key, snapshot_at,
        audience_client_ids, version_number, trigger_kind, created_by
      ) values (
        ${p.fixture.wsA.id}, ${checkinPolicyId}, ${'weekly_checkin:' + checkinAssignId}, now(),
        array[${active.clientId}::uuid], 1, 'weekly_checkin', ${staff.id}
      )
    `;
    await p.db`
      insert into public.form_assignments(
        id, workspace_id, client_id, form_id, version_number, terms_policy_version,
        policy_kind, version_snapshot, policy_id, client_deadline_at, configured_by, occurrence_key
      ) values (
        ${checkinAssignId}, ${p.fixture.wsA.id}, ${active.clientId}, ${checkinFormId}, 1, ${terms},
        'terms', '{"questions":[]}'::jsonb, ${checkinPolicyId}, now() + interval '3 days', ${staff.id}, ${'weekly_checkin:' + checkinAssignId}
      )
    `;
    await p.db`
      insert into public.form_answer_revisions(
        workspace_id, assignment_id, revision, answer_values
      ) values (
        ${p.fixture.wsA.id}, ${checkinAssignId}, 1, '{}'::jsonb
      )
    `;
    await p.db`
      insert into app_private.form_submissions(
        workspace_id, assignment_id, revision, submitted_at
      ) values (
        ${p.fixture.wsA.id}, ${checkinAssignId}, 1, clock_timestamp()
      )
    `;

    await mkdir(screenshotDir, { recursive: true });
  });

  test.afterAll(async () => {
    await p?.close();
  });

  test('client dashboard and selected revision', async ({ page }) => {
    test.skip(!local, 'Requires the selected local Supabase stack.');
    await signIn(page, activeClient);
    await capture(page, '/plans', 'plans', async (m) => {
      await expect(
        page.getByRole('heading', { name: m['client.portal.title'] }),
      ).toBeVisible();
      await expect(
        page.getByTestId('client-portal-plans').locator('li'),
      ).toHaveCount(2);
      await expect(
        page.getByTestId('client-notices').locator('li'),
      ).toHaveCount(2);
      await expect(
        page.getByRole('button', { name: m['client.portal.inbox.markRead'] }),
      ).toHaveCount(1);
      await expect(
        page.getByText(m['client.portal.notice.workoutDelivered']),
      ).toBeVisible();
      await expect(
        page.getByTestId('client-portal-subscription-status'),
      ).toHaveText(m['client.portal.subscriptionStatus.active']);
    });
    await capture(
      page,
      `/plans/${workoutPlan}?revision=1`,
      'plan-revision',
      async (m) => {
        await expect(
          page.getByRole('heading', { name: m['client.portal.workout'] }),
        ).toBeVisible();
        await expect(page.getByLabel(m['client.portal.revision'])).toHaveValue(
          '1',
        );
      },
    );
  });

  test('client restricted state before activation', async ({ page }) => {
    test.skip(!local, 'Requires the selected local Supabase stack.');
    await signIn(page, awaitingClient);
    await capture(page, '/plans', 'plans-restricted', async (m) => {
      await expect(page.getByTestId('client-portal-restricted')).toBeVisible();
      await expect(
        page.getByTestId('client-portal-subscription-status'),
      ).toHaveText(m['client.portal.subscriptionStatus.awaitingActivation']);
      await expect(page.getByTestId('client-portal-plans')).toHaveCount(0);
      await expect(page.getByTestId('client-notices')).toHaveCount(0);
    });
  });

  test('staff client directory', async ({ page }) => {
    test.skip(!local, 'Requires the selected local Supabase stack.');
    await signIn(page, trainer);
    await capture(
      page,
      `/clients?workspace=${p.fixture.wsA.id}&q=${encodeURIComponent(p.run)}`,
      'directory',
      async (m) => {
        await expect(
          page.getByRole('heading', { name: m['staff.clientDirectory.title'] }),
        ).toBeVisible();
        await expect(
          page.getByTestId('client-directory-results').locator('li'),
        ).toHaveCount(2);
        await expect(
          page.getByTestId('directory-subscription-status'),
        ).toHaveText([
          `${m['client.portal.subscriptionStatus']}: ${m['staff.clientDirectory.subscriptionStatus.active']}`,
          `${m['client.portal.subscriptionStatus']}: ${m['staff.clientDirectory.subscriptionStatus.awaitingActivation']}`,
        ]);
        await expect(
          page.getByLabel(m['client.portal.subscriptionStatus']),
        ).toBeVisible();
        await expect(
          page.getByLabel(m['staff.clientDirectory.search']),
        ).toHaveAttribute(
          'placeholder',
          m['staff.clientDirectory.searchPlaceholderStaff'],
        );
        await expect(
          page.getByLabel(m['staff.clientDirectory.assignment']),
        ).toHaveCount(0);
        await expect(page.getByTestId('directory-client-code')).toHaveCount(0);
        await expect(page.getByTestId('indicator-new-check-ins')).toHaveCount(1);
      },
    );
    await signIn(page, directoryOwner);
    await capture(
      page,
      `/clients?workspace=${p.fixture.wsA.id}&q=${encodeURIComponent(p.run)}`,
      'directory-owner',
      async (m) => {
        await expect(
          page.getByRole('heading', { name: m['staff.clientDirectory.title'] }),
        ).toBeVisible();
        await expect(
          page.getByLabel(m['staff.clientDirectory.search']),
        ).toHaveAttribute(
          'placeholder',
          m['staff.clientDirectory.searchPlaceholder'],
        );
        const assignment = page.getByLabel(
          m['staff.clientDirectory.assignment'],
        );
        await expect(assignment).toHaveValue('');
        await expect(assignment.locator('option')).toHaveText([
          m['staff.clientDirectory.assignment.all'],
          m['staff.clientDirectory.assignment.assigned'],
          m['staff.clientDirectory.assignment.unassigned'],
        ]);
        await expect(page.getByTestId('directory-client-code')).toHaveCount(2);
        await expect(page.getByTestId('indicator-new-check-ins')).toHaveCount(1);
      },
    );
    await signIn(page, directoryPO);
    await capture(
      page,
      `/clients?workspace=${p.fixture.wsA.id}&q=${encodeURIComponent(p.run)}`,
      'directory-po',
      async (m) => {
        await expect(
          page.getByRole('heading', { name: m['staff.clientDirectory.title'] }),
        ).toBeVisible();
        await expect(
          page.getByLabel(m['staff.clientDirectory.search']),
        ).toHaveAttribute(
          'placeholder',
          m['staff.clientDirectory.searchPlaceholder'],
        );
        const assignment = page.getByLabel(
          m['staff.clientDirectory.assignment'],
        );
        await expect(assignment).toHaveValue('');
        await expect(assignment.locator('option')).toHaveText([
          m['staff.clientDirectory.assignment.all'],
          m['staff.clientDirectory.assignment.assigned'],
          m['staff.clientDirectory.assignment.unassigned'],
        ]);
        await expect(page.getByTestId('directory-client-code')).toHaveCount(2);
        await expect(page.getByTestId('indicator-new-check-ins')).toHaveCount(1);
      },
    );
  });

  test('staff client directory empty state and keyboard navigation', async ({
    page,
  }) => {
    test.skip(!local, 'Requires the selected local Supabase stack.');
    await signIn(page, trainer);
    const m = getMessages('en');
    await page.goto(
      `/clients?workspace=${p.fixture.wsA.id}&q=never-matching-${encodeURIComponent(p.run)}`,
    );
    await expect(
      page.getByRole('heading', { name: m['states.noResults.title'] }),
    ).toBeVisible();
    await expect(
      page.getByText(m['states.noResults.description']),
    ).toBeVisible();

    // Keyboard navigation: focus search field and tab through controls
    const searchInput = page.getByLabel(m['staff.clientDirectory.search']);
    await searchInput.focus();
    await expect(searchInput).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      page.getByLabel(m['registrationApproval.clientStatus']),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      page.getByLabel(m['client.portal.subscriptionStatus']),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: m['catalog.searchSubmit'] }),
    ).toBeFocused();
  });
});
