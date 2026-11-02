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

const db = sql();
const screenshotDir = join(tmpdir(), 'lifter-s26-f15-t022');
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
          path: join(screenshotDir, `${locale}-${theme}-${width}.png`),
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
  const goal = page.getByRole('textbox', { name: 'Your goal' });
  await goal.focus();
  await goal.fill('Build strength');
  await page.getByRole('button', { name: 'Next question' }).focus();
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
    await expect(
      page.getByRole('textbox', { name: 'Your goal' }),
    ).toBeVisible();
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
