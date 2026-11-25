import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServerClient } from '@supabase/ssr';
import type { JSONValue } from 'postgres';
import { sql } from '../integration/harness';
import { clientContext } from '../integration/client-accounts-fixture';
import { graph } from '../integration/registration-approval-fixture';
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
  const dir = join(tmpdir(), 'lifter-workforce-checkins');
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

const definition = {
  questions: [
    {
      id: 'workoutAdherence',
      sectionId: 'checkin',
      type: 'number',
      required: false,
      validation: { min: 0, max: 10, step: 1 },
    },
    {
      id: 'dietAdherence',
      sectionId: 'checkin',
      type: 'number',
      required: false,
      validation: { min: 0, max: 10, step: 1 },
    },
  ],
};

async function seedCheckinFixture() {
  const f = await clientContext();
  const db = sql();
  try {
    const res = await db.begin(async (tx) => {
      const ids = await graph(tx, f);
      const [clock] = await tx`
        select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today
      `;
      const today = clock!.today as string;
      await tx`insert into public.subscription_activations(
        workspace_id,subscription_id,activated_at,delivery_event_id,activation_source
      ) values(
        ${f.wsA.id},${ids.subscription},
        ((${today}::date - 7)::timestamp + interval '9 hours') at time zone 'Africa/Cairo',
        ${randomUUID()},'po_override'
      )`;

      const [termsRow] = await tx`
        select version from app_private.terms_policy_versions
        where status = 'published' and policy_kind = 'terms'
        order by created_at desc limit 1
      `;
      const terms = (termsRow?.version as string) ?? 'terms.v1';
      const formId = randomUUID();
      await tx`insert into public.forms(id,workspace_id,name)
        values(${formId},${f.wsA.id},'P7 e2e synthetic check-in')`;
      await tx`insert into public.form_versions(
        workspace_id,form_id,version_number,terms_policy_version,definition,status
      ) values(${f.wsA.id},${formId},1,${terms},${tx.json(definition as JSONValue)},'published')`;

      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      await tx`select public.configure_weekly_checkin_form(${f.wsA.id},${formId},1)`;
      await tx`reset role`;

      await tx`select app_private.f23_weekly_checkin_run(${today}::date)`;
      const [assignment] = await tx`
        select id from public.form_assignments
        where workspace_id=${f.wsA.id} and client_id=${ids.client}
          and form_id=${formId} and occurrence_key=${'weekly_checkin:' + today}
      `;
      if (!assignment) {
        throw new Error('Synthetic form assignment was not generated');
      }
      const assignmentId = assignment.id as string;
      await tx`insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
        values
          (${f.wsA.id},${assignmentId},1,${tx.json({ workoutAdherence: 8, dietAdherence: 5 })})`;
      await tx`insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
        values(${f.wsA.id},${assignmentId},1,clock_timestamp() - interval '26 hours')`;

      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      await tx`select public.assign_client_responsible_trainer(${f.wsA.id},${ids.client},${f.trainerA.userId})`;
      await tx`reset role`;

      return { f, assignmentId, client: ids.client };
    });
    return res;
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

test.describe('P7 T006 Trainer Weekly Check-ins UI', () => {
  test('Trainer follow-up happy path and Sales denial', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const { f, assignmentId } = await seedCheckinFixture();

    // 1. Trainer A logs in and visits check-ins page
    await signIn(context, f.trainerA.client);
    await setPreferences(context, 'en', 'light');

    const checkinsUrl = `/workforce/check-ins?workspace=${encodeURIComponent(f.wsA.id)}`;
    await page.goto(checkinsUrl);

    const enMessages = getMessages('en');
    await expect(
      page.getByRole('heading', {
        name: enMessages['workforce.checkin.title'],
      }),
    ).toBeVisible();

    // Verify client row and status
    const row = page.getByTestId(`checkin-row-${assignmentId}`);
    await expect(row).toBeVisible();
    await expect(
      row.getByText(enMessages['workforce.checkin.formStatus.submitted']),
    ).toBeVisible();
    await expect(
      row.getByText(enMessages['workforce.checkin.followStatus.late'], {
        exact: true,
      }),
    ).toBeVisible();

    // Verify late warning is displayed since submission was 26 hours ago
    await expect(page.getByTestId('late-warning')).toBeVisible();

    // Click "Mark followed up"
    const markBtn = row.getByRole('button', {
      name: enMessages['workforce.checkin.followUp.action'],
    });
    await expect(markBtn).toBeVisible();
    await markBtn.click();

    // Confirm dialog opens
    await expect(
      page.getByRole('heading', {
        name: enMessages['workforce.checkin.followUp.confirmTitle'],
      }),
    ).toBeVisible();

    // Confirm action
    const confirmBtn = page.getByRole('button', {
      name: enMessages['dialog.confirm'],
    });
    await confirmBtn.click();

    // Success toast appears
    await expect(
      page.getByText(enMessages['workforce.checkin.followUp.success']),
    ).toBeVisible();

    // Row updates to "Followed up" badge
    await expect(
      row.getByText(enMessages['workforce.checkin.followStatus.followedUp'], {
        exact: true,
      }),
    ).toBeVisible();

    // 2. Sales A logs in and visits check-ins page -> Access denied without disclosure
    await signIn(context, f.salesA.client);
    await page.goto(checkinsUrl);

    // Sales sees denied message
    await expect(
      page.getByText(enMessages['workforce.checkin.denied']),
    ).toBeVisible();

    // Data table is NOT disclosed
    await expect(page.locator('table')).not.toBeVisible();
    await expect(
      page.getByRole('button', {
        name: enMessages['workforce.checkin.followUp.action'],
      }),
    ).not.toBeVisible();
  });

  test('Screenshot and Axe matrix across {AR, EN} x {light, dark} x {mobile, desktop}', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const { f } = await seedCheckinFixture();
    const dir = screenshotsDir();

    // Sign in as Trainer A
    await signIn(context, f.trainerA.client);

    for (const locale of locales) {
      for (const theme of themes) {
        for (const [vpName, vp] of Object.entries(viewports) as [
          Viewport,
          (typeof viewports)[Viewport],
        ][]) {
          await page.setViewportSize(vp);
          await setPreferences(context, locale, theme);

          const checkinsUrl = `/workforce/check-ins?workspace=${encodeURIComponent(f.wsA.id)}`;
          await page.goto(checkinsUrl);

          const messages = getMessages(locale);
          await expect(
            page.getByRole('heading', {
              name: messages['workforce.checkin.title'],
            }),
          ).toBeVisible();

          // Axe accessibility check
          await axeClean(page);

          // Take screenshot
          const shotPath = join(
            dir,
            `workforce-checkins-${locale}-${theme}-${vpName}.png`,
          );
          await page.screenshot({ path: shotPath, fullPage: true });
        }
      }
    }
  });
});
