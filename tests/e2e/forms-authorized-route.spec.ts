import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  clientContext,
  registered,
  request as approvalRequest,
  sqlCall,
} from '../integration/registration-approval-operations-fixture';
import { sql } from '../integration/harness';
import { deriveBrand } from '../../lib/design/color';
import { brandToCssVars } from '../../lib/design/tokens-css';
import { getMessages } from '../../lib/i18n';

const db = sql();
const screenshotDir = join(tmpdir(), 'lifter-s29-f15-h5');
let assignmentId = '';
let email = '';
let password = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(screenshotDir, { recursive: true });
  const context = await clientContext();
  const client = await registered(context);
  email = client.email;
  password = client.password;
  const approval = await db.begin((tx) =>
    sqlCall(tx, context.po.userId, 'approve', approvalRequest(context, client)),
  );
  expect(approval.status).toBe('ok');

  const formId = randomUUID();
  assignmentId = randomUUID();
  const policy = `t022-e2e-${randomUUID()}`;
  const definition = {
    questions: [
      {
        id: 'B01',
        sectionId: 'basic',
        type: 'profileText',
        required: false,
        profileField: 'fullName',
        title: { en: 'Full name', ar: 'الاسم الثلاثي' },
      },
      {
        id: 'B02',
        sectionId: 'basic',
        type: 'computedAge',
        required: false,
        dateOfBirthField: 'dateOfBirth',
        title: { en: 'Age', ar: 'العمر' },
      },
      {
        id: 'goal',
        sectionId: 'basic',
        type: 'shortText',
        required: true,
        title: { en: 'Your goal', ar: 'هدفك' },
        description: {
          en: 'Share your training goal.',
          ar: 'شارك هدفك التدريبي.',
        },
        charLimit: 150,
      },
      {
        id: 'training',
        sectionId: 'training',
        type: 'shortText',
        required: true,
        title: { en: 'Training experience', ar: 'خبرتك التدريبية' },
        charLimit: 150,
      },
      {
        id: 'nutrition',
        sectionId: 'nutrition',
        type: 'shortText',
        required: true,
        title: { en: 'Nutrition preferences', ar: 'تفضيلاتك الغذائية' },
        charLimit: 150,
      },
    ],
  };
  await db`
    insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${policy},'terms','published')
  `;
  await db`insert into public.forms(id,workspace_id,name)
    values(${formId},${context.wsA.id},'T022 browser fixture')`;
  await db`
    insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(${context.wsA.id},${formId},1,${policy},${db.json(definition)},'published')
  `;
  await db`
    insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
    values(${assignmentId},${context.wsA.id},${client.id},${formId},1,${policy},${db.json(definition)})
  `;
});

test.afterAll(async () => {
  await db.end();
});

async function signIn(page: Page) {
  await page.context().addCookies([
    {
      name: 'lifter_locale',
      value: 'en',
      url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    },
    {
      name: 'lifter_theme',
      value: 'light',
      url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    },
  ]);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/u);
}

async function advanceToGoal(page: Page) {
  await page.getByRole('button').nth(1).click();
  await page.getByRole('button').nth(1).click();
}

test('real authorized assignment renders the complete AR/EN theme and viewport matrix', async ({
  page,
}) => {
  await signIn(page);
  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [390, 1440] as const) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        await page.context().addCookies([
          {
            name: 'lifter_locale',
            value: locale,
            url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
          },
          {
            name: 'lifter_theme',
            value: theme,
            url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
          },
        ]);
        await page.goto(`/forms/${assignmentId}`);
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: locale === 'en' ? 'Client intake' : 'بيانات العميل',
          }),
        ).toBeVisible();
        await expect(page.locator('output')).toHaveText('U3 synthetic test');
        await expect(
          page.getByRole('heading', {
            level: 2,
            name: locale === 'ar' ? 'الاسم الثلاثي' : 'Full name',
          }),
        ).toBeVisible();
        await page.screenshot({
          path: join(screenshotDir, `${locale}-${theme}-${width}-b01.png`),
          fullPage: true,
        });
        await page.getByRole('button').nth(1).click();
        await expect(page.locator('output')).toHaveText('36');
        await expect(
          page.getByRole('heading', {
            level: 2,
            name: locale === 'ar' ? 'العمر' : 'Age',
          }),
        ).toBeVisible();
        await page.screenshot({
          path: join(screenshotDir, `${locale}-${theme}-${width}-b02.png`),
          fullPage: true,
        });
        await page.getByRole('button').nth(1).click();
        await expect(
          page.getByRole('textbox', {
            name: locale === 'en' ? 'Your goal' : 'هدفك',
          }),
        ).toBeVisible();
        const violations = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(violations.violations).toEqual([]);
        await page.screenshot({
          path: join(screenshotDir, `${locale}-${theme}-${width}-goal.png`),
          fullPage: true,
        });
      }
    }
  }
});

test('real route supports keyboard progression and presents the same safe not-found for unknown IDs', async ({
  page,
}) => {
  await signIn(page);
  await page.context().addCookies([
    {
      name: 'lifter_locale',
      value: 'en',
      url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    },
    {
      name: 'lifter_theme',
      value: 'light',
      url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    },
  ]);
  await page.goto(`/forms/${assignmentId}`);
  await advanceToGoal(page);
  const goal = page.getByRole('textbox', { name: 'Your goal' });
  await goal.focus();
  await goal.fill('Build strength');
  const blurSave = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes(`/api/forms/assignments/${assignmentId}/draft`),
  );
  const next = page.getByRole('button', { name: 'Next question' });
  await next.focus();
  const saveResponse = await blurSave;
  const saveBody = await saveResponse.json();
  expect(saveBody.status).toBe('saved');
  expect(saveResponse.status()).toBe(200);
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('region', { name: 'Training experience' }),
  ).toBeVisible();

  await page.goto('/forms/13eba9f4-1551-48ae-bfd2-8c21076533b8');
  await expect(page).toHaveURL(
    /\/forms\/13eba9f4-1551-48ae-bfd2-8c21076533b8$/u,
  );
  await expect(
    page.getByRole('heading', { name: /404|not found/i }),
  ).toBeVisible();
});

test('sample workspace brand scope leaves semantic status tokens intact in light and dark', async ({
  page,
}) => {
  await signIn(page);
  const brandVars = brandToCssVars(deriveBrand('#0F766E'));
  for (const theme of ['light', 'dark'] as const) {
    await page.context().addCookies([
      {
        name: 'lifter_locale',
        value: 'en',
        url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
      },
      {
        name: 'lifter_theme',
        value: theme,
        url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
      },
    ]);
    await page.goto(`/forms/${assignmentId}`);
    await expect(page.locator('output')).toBeVisible();
    const before = await page
      .locator('main')
      .last()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return ['success', 'warning', 'error'].map((tone) =>
          ['fg', 'bg', 'border'].map((part) =>
            style.getPropertyValue(`--color-${tone}-${part}`).trim(),
          ),
        );
      });
    await page
      .locator('main')
      .last()
      .evaluate((element, vars) => {
        element.setAttribute('data-brand-scope', '');
        for (const [name, value] of Object.entries(vars))
          element.style.setProperty(name, value);
      }, brandVars);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
    const primaryFill = await page
      .getByRole('button', { name: 'Next question' })
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    const brandState = await page
      .locator('main')
      .last()
      .evaluate((element) => ({
        scope: element.hasAttribute('data-brand-scope'),
        inlineFill: element.style.getPropertyValue('--brand-fill-light'),
        mappedFill: getComputedStyle(element).getPropertyValue('--brand-fill'),
      }));
    expect(brandState).toEqual({
      scope: true,
      inlineFill: '#0F766E',
      mappedFill: '#0F766E',
    });
    const buttonBrand = await page
      .getByRole('button', { name: 'Next question' })
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--brand-fill').trim(),
      );
    expect(buttonBrand).toBe('#0F766E');
    expect(primaryFill).toBe('rgb(15, 118, 110)');
    const after = await page
      .locator('main')
      .last()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return ['success', 'warning', 'error'].map((tone) =>
          ['fg', 'bg', 'border'].map((part) =>
            style.getPropertyValue(`--color-${tone}-${part}`).trim(),
          ),
        );
      });
    expect(after).toEqual(before);
    const violations = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(violations.violations).toEqual([]);
  }
});

test('real route autosave exposes each state, retries failures, and records save-to-ack latency', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  let mode: 'normal' | 'slow' | 'error' | 'retry' | 'conflict' = 'normal';
  let failedIntentKey = '';
  let retryIntentKey = '';
  let conflictSaveCount = 0;
  let slowSaveCount = 0;
  const saveStatus = page.locator('p[role="status"][aria-live="polite"]');
  await page.route('**/api/forms/assignments/*/draft', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const intentKey = String(route.request().postDataJSON()?.intent_key ?? '');
    if (mode === 'error') failedIntentKey = intentKey;
    else if (failedIntentKey && mode === 'retry') retryIntentKey = intentKey;
    if (mode === 'slow') {
      slowSaveCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    if (mode === 'error')
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error' }),
      });
    if (mode === 'retry') {
      const payload = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'saved',
          revision: payload.expected_revision,
          intent_key: intentKey,
        }),
      });
    }
    if (mode === 'conflict') {
      conflictSaveCount += 1;
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'conflict' }),
      });
    }
    return route.continue();
  });

  for (const locale of ['ar', 'en'] as const) {
    const theme = locale === 'ar' ? 'dark' : 'light';
    const messages = getMessages(locale);
    const statusText = {
      unsaved: messages['forms.unsaved'],
      saving: messages['forms.saving'],
      saved: messages['forms.draftSaved'],
      failed: messages['forms.saveFailed'],
      conflict: messages['forms.conflictTitle'],
    };
    await page.context().addCookies([
      {
        name: 'lifter_locale',
        value: locale,
        url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
      },
      {
        name: 'lifter_theme',
        value: theme,
        url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
      },
    ]);
    for (const width of [390, 1440] as const) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(`/forms/${assignmentId}`);
      await advanceToGoal(page);
      const field = page.getByRole('textbox').first();
      await expect(field).toBeVisible();
      const capture = async (state: string) => {
        const violations = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(violations.violations).toEqual([]);
        await page.screenshot({
          path: join(screenshotDir, `${locale}-${theme}-${width}-${state}.png`),
          fullPage: true,
        });
      };

      mode = 'normal';
      await field.fill(`unsaved ${locale} ${width}`);
      await expect(saveStatus).toHaveText(statusText.unsaved);
      await capture('unsaved');

      mode = 'slow';
      const slowBefore = slowSaveCount;
      await field.fill(`saving ${locale} ${width}`);
      await expect(saveStatus).toHaveText(statusText.saving);
      await field.fill(`coalesced ${locale} ${width}`);
      await capture('saving');
      await expect(saveStatus).toHaveText(statusText.saved, {
        timeout: 10_000,
      });
      expect(slowSaveCount - slowBefore).toBe(2);
      await capture('saved');

      mode = 'error';
      await field.fill(`failed ${locale} ${width}`);
      await expect(saveStatus).toHaveText(statusText.failed);
      await capture('failed');
      mode = 'retry';
      await page
        .getByRole('button', { name: messages['forms.retrySave'] })
        .click();
      await expect(saveStatus).toHaveText(statusText.saved, {
        timeout: 10_000,
      });
      expect(retryIntentKey).toBe(failedIntentKey);
      failedIntentKey = '';
      retryIntentKey = '';

      mode = 'normal';
      const acknowledgedValue = `committed ${locale} ${width}`;
      const acknowledgedResponse = page.waitForResponse((response) => {
        if (
          !response.url().endsWith('/draft') ||
          response.request().method() !== 'POST'
        )
          return false;
        return (
          response.request().postData()?.includes(acknowledgedValue) ?? false
        );
      });
      await field.fill(acknowledgedValue);
      await page
        .getByRole('button', { name: messages['forms.saveNow'] })
        .click();
      const saveResponse = await acknowledgedResponse;
      const saveBody = await saveResponse.json();
      expect(saveBody.status).toBe('saved');
      const savedAnswerId = Object.entries(
        saveResponse.request().postDataJSON().answer_values as Record<
          string,
          unknown
        >,
      ).find(([, value]) => value === acknowledgedValue)?.[0];
      expect(savedAnswerId).toBeDefined();
      await expect(saveStatus).toHaveText(statusText.saved, {
        timeout: 10_000,
      });
      const savesBeforeConflict = conflictSaveCount;
      mode = 'conflict';
      await field.fill(`conflict ${locale} ${width}`);
      await expect(saveStatus).toHaveText(statusText.conflict);
      await expect(
        page.getByRole('button', { name: messages['forms.reloadDraft'] }),
      ).toBeVisible();
      await capture('conflict');
      await page.waitForTimeout(1_600);
      expect(conflictSaveCount - savesBeforeConflict).toBe(1);
      mode = 'normal';
      const reloadResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith('/draft') &&
          response.request().method() === 'GET',
      );
      await page
        .getByRole('button', { name: messages['forms.reloadDraft'] })
        .click();
      const reloaded = await reloadResponse;
      expect((await reloaded.json()).answers[savedAnswerId!]).toBe(
        acknowledgedValue,
      );
    }
  }

  await page.context().addCookies([
    {
      name: 'lifter_locale',
      value: 'en',
      url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    },
    {
      name: 'lifter_theme',
      value: 'light',
      url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    },
  ]);
  await page.goto(`/forms/${assignmentId}`);
  await advanceToGoal(page);
  const field = page.getByRole('textbox', { name: 'Your goal' });
  const samples: number[] = [];
  for (let sample = 0; sample < 8; sample += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/forms/assignments/') &&
        response.url().endsWith('/draft') &&
        response.request().method() === 'POST',
    );
    await field.fill(`latency sample ${sample}`);
    const response = await responsePromise;
    const timing = response.request().timing();
    await expect(saveStatus).toHaveText('Draft saved.', {
      timeout: 10_000,
    });
    // Playwright reports responseEnd relative to the request start; startTime
    // is epoch-based, so subtracting it produces a misleading negative value.
    samples.push(timing.responseEnd);
  }
  samples.sort((a, b) => a - b);
  const percentile = (p: number) =>
    Math.round(samples[Math.ceil(p * samples.length) - 1]!);
  console.log(
    `F15 autosave local save-to-ack: p50=${percentile(0.5)}ms p95=${percentile(0.95)}ms samples=${samples.length}`,
  );
});
