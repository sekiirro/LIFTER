import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

// Spec 023 Frontend Design Gate evidence: the staff and client progress pages
// across {AR-RTL, EN-LTR} x {light, dark} x {390, 1440}, plus the staff
// correction dialog and one persisted correction. Synthetic data only.

const origin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
).origin;
const screenshotDir =
  process.env.F23_SCREENSHOT_DIR ??
  join(tmpdir(), 'lifter', 'f23-progress-coaching');

type SessionSource = {
  auth: {
    getSession: () => Promise<{
      data: {
        session: { access_token: string; refresh_token: string } | null;
      };
    }>;
  };
};

type Fixture = {
  workspaceId: string;
  clientId: string;
  /** An unanswered weekly check-in assignment for the client (T012). */
  assignmentId: string;
  checkinFormId: string;
  plainFormId: string;
  trainer: SessionSource;
  client: SessionSource;
  close: () => Promise<void>;
};

let fixture: Fixture;

const en = getMessages('en');
const ar = getMessages('ar');
// The FR-037 questions carry the approved S55-PO-10 neutral self-report copy.
const checkinDefinition = {
  title: { en: 'Weekly check-in', ar: 'المتابعة الأسبوعية' },
  questions: [
    {
      id: 'workoutAdherence',
      sectionId: 'checkin',
      type: 'number',
      required: false,
      validation: { min: 0, max: 10, step: 1 },
      title: {
        en: en['checkin.adherence.workout.question'],
        ar: ar['checkin.adherence.workout.question'],
      },
    },
    {
      id: 'dietAdherence',
      sectionId: 'checkin',
      type: 'number',
      required: false,
      validation: { min: 0, max: 10, step: 1 },
      title: {
        en: en['checkin.adherence.diet.question'],
        ar: ar['checkin.adherence.diet.question'],
      },
    },
    {
      id: 'bodyWeight',
      sectionId: 'checkin',
      type: 'number',
      required: false,
      unit: { en: 'kg', ar: 'كجم' },
      validation: { min: 20, max: 400 },
      title: { en: 'Body weight', ar: 'الوزن' },
    },
  ],
};

async function createFixture(): Promise<Fixture> {
  const { clientContext, graph, sql } =
    await import('../integration/registration-approval-fixture');
  const { authReference } =
    await import('../integration/client-accounts-fixture');
  const { anonClient } = await import('../integration/harness');
  const context = await clientContext();
  const password = 'Synthetic9!' + randomUUID().replaceAll('-', '');
  const user = await authReference(password);
  const db = sql();
  const seeded = await db.begin((tx) =>
    graph(tx, context, { authUserId: user.id }),
  );
  const ws = context.wsA.id;
  const assignmentId = randomUUID();
  const checkinFormId = randomUUID();
  const plainFormId = randomUUID();
  await db.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims','{}',true)`;
    // Active entitlement since 10 Cairo days ago (typed initial source).
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
      values(${ws},${seeded.subscription},
        (((clock_timestamp() at time zone 'Africa/Cairo')::date - 10)::timestamp + interval '9 hours') at time zone 'Africa/Cairo',
        ${randomUUID()},'po_override')`;
    // The workspace's weekly check-in form supplies question text and units. A
    // fresh published terms version keeps the forms current (F15 e2e pattern).
    const termsVersion = `f23-e2e-${randomUUID()}`;
    await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
      values(${termsVersion},'terms','published')`;
    const formId = checkinFormId;
    await tx`insert into public.forms(id,workspace_id,name) values
      (${formId},${ws},'F23 weekly check-in'),(${plainFormId},${ws},'F23 plain form')`;
    await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
      values(${ws},${formId},1,${termsVersion},${tx.json(checkinDefinition)},'published'),
        (${ws},${plainFormId},1,${termsVersion},${tx.json({ questions: [] })},'published')`;
    await tx`insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
      values(${assignmentId},${ws},${seeded.client},${formId},1,${termsVersion},${tx.json(checkinDefinition)})`;
    await tx`insert into app_private.form_assignment_policies(workspace_id,form_id,version_number,audience_kind,
        specific_client_ids,trigger_kind,timing,stop_conditions,configured_by)
      values(${ws},${formId},1,'all_active_clients','{}','weekly_checkin',
        '{"client_deadline_days":3}'::jsonb,'{"frozen":true,"inactive":true}'::jsonb,${context.trainerA.userId})`;
    for (const [daysAgo, value] of [
      [8, 94],
      [1, 92.5],
    ] as const)
      await tx`insert into public.progress_measurements(workspace_id,client_id,measurement_type,value,unit_en,unit_ar,
          recorded_on,source_kind,entered_by,updated_by)
        values(${ws},${seeded.client},'bodyWeight',${value},'kg','كجم',
          (clock_timestamp() at time zone 'Africa/Cairo')::date - ${daysAgo}::int,'manual',${user.id},${user.id})`;
  });
  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({
    email: user.email!,
    password,
  });
  if (signedIn.error) throw new Error('F23 client sign-in fixture failed');
  return {
    workspaceId: ws,
    clientId: seeded.client,
    assignmentId,
    checkinFormId,
    plainFormId,
    trainer: context.trainerA.client,
    client,
    close: () => db.end(),
  };
}

type SessionCookie = {
  name: string;
  value: string;
  options?: {
    expires?: number | string | Date;
    maxAge?: number;
    httpOnly?: boolean;
    sameSite?: boolean | 'lax' | 'strict' | 'none';
  };
};

async function installSession(context: BrowserContext, source: SessionSource) {
  const { loadEnv } = await import('../integration/harness');
  const env = loadEnv();
  const { data } = await source.auth.getSession();
  if (!data.session) throw new Error('fixture session missing');
  const { createServerClient } = await import('@supabase/ssr');
  const collected: SessionCookie[] = [];
  const server = createServerClient(env.apiUrl, env.anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (values) => {
        collected.push(...(values as SessionCookie[]));
      },
    },
  });
  const result = await server.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (result.error || collected.length === 0)
    throw new Error('could not install fixture session');
  await context.clearCookies({ name: /^sb-/ });
  const now = Math.floor(Date.now() / 1000);
  await context.addCookies(
    collected.map((cookie) => {
      const sameSite = cookie.options?.sameSite;
      return {
        name: cookie.name,
        value: cookie.value,
        url: origin,
        ...(cookie.options?.httpOnly !== undefined
          ? { httpOnly: cookie.options.httpOnly }
          : {}),
        ...(sameSite === 'strict'
          ? { sameSite: 'Strict' as const }
          : sameSite === 'none'
            ? { sameSite: 'None' as const }
            : sameSite === 'lax'
              ? { sameSite: 'Lax' as const }
              : {}),
        expires:
          typeof cookie.options?.maxAge === 'number'
            ? now + Math.floor(cookie.options.maxAge)
            : now + 3600,
      };
    }),
  );
}

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

async function applyVariant(
  page: Page,
  context: BrowserContext,
  variant: (typeof variants)[number],
) {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: variant.locale, url: origin },
    { name: THEME_COOKIE, value: variant.theme, url: origin },
  ]);
  await page.setViewportSize({ width: variant.width, height: variant.height });
}

async function expectAxeClean(page: Page) {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    axe.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test.describe.serial('spec 023 progress pages (Frontend Design Gate)', () => {
  test.beforeAll(async () => {
    fixture = await createFixture();
    await mkdir(screenshotDir, { recursive: true });
  });

  test.afterAll(async () => {
    await fixture?.close();
  });

  test('staff progress page and correction dialog across the matrix', async ({
    page,
    context,
  }) => {
    await installSession(context, fixture.trainer);
    for (const variant of variants) {
      await applyVariant(page, context, variant);
      const messages = getMessages(variant.locale);
      await page.goto(`/clients/${fixture.clientId}/progress`);
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: messages['progress.title'],
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', {
          name: messages['progress.measurements.title'],
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: messages['timeline.title'] }),
      ).toBeVisible();
      await expect(
        page
          .locator('main')
          .getByText(messages['timeline.event.registration'], { exact: true }),
      ).toBeVisible();
      const edits = page.getByTestId('progress-measurement-edit');
      await expect(edits).toHaveCount(2);
      // No correction-history surface (FR-013) and no photo upload (FR-017).
      await expect(page.locator('main input[type="file"]')).toHaveCount(0);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
      const name = `staff-${variant.locale}-${variant.theme}-${variant.width}`;
      await page.screenshot({
        path: join(screenshotDir, `${name}.png`),
        fullPage: true,
      });

      await edits.first().click();
      const dialog = page.getByRole('dialog', {
        name: messages['progress.measurement.edit'],
      });
      await expect(dialog).toBeVisible();
      const label =
        variant.locale === 'en' ? 'Body weight (kg)' : 'الوزن (كجم)';
      await expect(dialog.getByLabel(label)).toHaveValue('92.5');
      await expectAxeClean(page);
      await page.screenshot({
        path: join(screenshotDir, `${name}-edit-dialog.png`),
        fullPage: true,
      });
      await dialog
        .getByRole('button', { name: messages['dialog.cancel'] })
        .click();
      await expect(dialog).toBeHidden();
    }
  });

  test('a staff correction persists in place', async ({ page, context }) => {
    await installSession(context, fixture.trainer);
    await applyVariant(page, context, variants[1]!);
    const messages = getMessages('en');
    await page.goto(`/clients/${fixture.clientId}/progress`);
    await page.getByTestId('progress-measurement-edit').first().click();
    const dialog = page.getByRole('dialog', {
      name: messages['progress.measurement.edit'],
    });
    await dialog.getByLabel('Body weight (kg)').fill('91.8');
    await dialog
      .getByRole('button', { name: messages['dialog.confirm'] })
      .click();
    await expect(page.getByText(messages['toast.success'])).toBeVisible();
    await page.reload();
    await expect(page.getByText('91.8', { exact: true })).toBeVisible();
    await expect(page.getByText('92.5', { exact: true })).toHaveCount(0);
  });

  test('client progress page across the matrix', async ({ page, context }) => {
    await installSession(context, fixture.client);
    for (const variant of variants) {
      await applyVariant(page, context, variant);
      const messages = getMessages(variant.locale);
      await page.goto('/progress');
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: messages['progress.title'],
        }),
      ).toBeVisible();
      await expect(
        page.getByText(messages['checkin.completed.notGate']),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', {
          name: messages['progress.measurements.title'],
        }),
      ).toBeVisible();
      // PO 2026-11-14: the client adds per check-in type and edits own manual rows.
      await expect(page.getByTestId('progress-measurement-add')).toHaveCount(1);
      await expect(
        page.getByTestId('progress-measurement-edit').first(),
      ).toBeVisible();
      await expect(page.locator('main input[type="file"]')).toHaveCount(0);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
      await page.screenshot({
        path: join(
          screenshotDir,
          `client-${variant.locale}-${variant.theme}-${variant.width}.png`,
        ),
        fullPage: true,
      });
      await page.getByTestId('progress-measurement-add').click();
      const dialog = page.getByRole('dialog', {
        name: messages['progress.measurement.add'],
      });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByLabel(messages['progress.measurement.date']),
      ).toBeVisible();
      await expectAxeClean(page);
      await page.screenshot({
        path: join(
          screenshotDir,
          `client-${variant.locale}-${variant.theme}-${variant.width}-add-dialog.png`,
        ),
        fullPage: true,
      });
      await dialog
        .getByRole('button', { name: messages['dialog.cancel'] })
        .click();
      await expect(dialog).toBeHidden();
    }
  });

  test('a client adds, is told about a same-day duplicate, and edits own entries', async ({
    page,
    context,
  }) => {
    await installSession(context, fixture.client);
    await applyVariant(page, context, variants[1]!);
    const messages = getMessages('en');
    await page.goto('/progress');
    const add = async (value: string) => {
      await page.getByTestId('progress-measurement-add').click();
      const dialog = page.getByRole('dialog', {
        name: messages['progress.measurement.add'],
      });
      await dialog.getByLabel('Value (kg)').fill(value);
      await dialog
        .getByRole('button', { name: messages['progress.measurement.save'] })
        .click();
      return dialog;
    };
    await add('90.6');
    await expect(
      page.getByText(messages['progress.measurement.saved']),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText('90.6', { exact: true })).toBeVisible();
    // A second entry for the same day is rejected with the edit hint.
    const duplicate = await add('90.2');
    await expect(
      duplicate.getByText(messages['progress.measurement.duplicateSameDay']),
    ).toBeVisible();
    await page.screenshot({
      path: join(screenshotDir, 'client-en-light-1440-duplicate.png'),
      fullPage: true,
    });
    await duplicate
      .getByRole('button', { name: messages['dialog.cancel'] })
      .click();
    // Newest row first: edit today's entry in place.
    await page.getByTestId('progress-measurement-edit').first().click();
    const edit = page.getByRole('dialog', {
      name: messages['progress.measurement.edit'],
    });
    await edit.getByLabel('Body weight (kg)').fill('90.1');
    await edit
      .getByRole('button', { name: messages['progress.measurement.save'] })
      .click();
    await expect(
      page.getByText(messages['progress.measurement.saved']),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText('90.1', { exact: true })).toBeVisible();
    await expect(page.getByText('90.6', { exact: true })).toHaveCount(0);
  });

  test('staff weekly check-in configuration across the matrix', async ({
    page,
    context,
  }) => {
    await installSession(context, fixture.trainer);
    for (const variant of variants) {
      await applyVariant(page, context, variant);
      const messages = getMessages(variant.locale);
      await page.goto('/check-ins');
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: messages['checkin.config.title'],
        }),
      ).toBeVisible();
      const select = page.getByLabel(messages['checkin.config.select']);
      await expect(select).toHaveValue(fixture.checkinFormId);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
      const name = `checkin-config-${variant.locale}-${variant.theme}-${variant.width}`;
      await page.screenshot({
        path: join(screenshotDir, `${name}.png`),
        fullPage: true,
      });
      // A form without the FR-037 questions is refused with the PO message.
      await select.selectOption(fixture.plainFormId);
      await page
        .getByRole('button', { name: messages['checkin.config.save'] })
        .click();
      await expect(page.getByRole('alert')).toHaveText(
        messages['checkin.config.invalid'],
      );
      await page.screenshot({
        path: join(screenshotDir, `${name}-invalid.png`),
        fullPage: true,
      });
    }
    const messages = getMessages('en');
    await applyVariant(page, context, variants[1]!);
    await page.goto('/check-ins');
    await page
      .getByLabel(messages['checkin.config.select'])
      .selectOption(fixture.checkinFormId);
    await page
      .getByRole('button', { name: messages['checkin.config.save'] })
      .click();
    await expect(
      page.getByText(messages['checkin.config.saved']),
    ).toBeVisible();
  });

  test('T012: the weekly check-in is neutral self-report and never gates access', async ({
    page,
    context,
  }) => {
    await installSession(context, fixture.client);
    const scoring =
      /leaderboard|ranking|\brank\b|\bscore\b|points|لوحة|ترتيب|نقاط|المتصدرين/iu;
    for (const variant of variants.filter((item) => item.theme === 'light')) {
      await applyVariant(page, context, variant);
      const messages = getMessages(variant.locale);
      await page.goto(`/forms/${fixture.assignmentId}`);
      await expect(
        page.getByText(messages['checkin.adherence.workout.question']),
      ).toBeVisible();
      // FR-038: no scoring mechanics, ranks or leaderboard rationale.
      expect(await page.locator('main').innerText()).not.toMatch(scoring);
      await expectAxeClean(page);
      await page.screenshot({
        path: join(
          screenshotDir,
          `checkin-form-${variant.locale}-${variant.width}.png`,
        ),
        fullPage: true,
      });
    }
    // FR-005: with the check-in unanswered, home and progress still load.
    await applyVariant(page, context, variants[1]!);
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
    await expect(page).not.toHaveURL(new RegExp(fixture.assignmentId));
    await page.goto('/progress');
    await expect(
      page.getByText(getMessages('en')['checkin.completed.notGate']),
    ).toBeVisible();
  });
});
