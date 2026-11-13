import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
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
import { calculateAgeInCairo } from '../../lib/forms/validation';
import starterContent from '../../lib/forms/s14-starter-content.json';

const db = sql();
const screenshotDir = join(tmpdir(), 'lifter-s34-f15-r3');
const supportScreenshotDir = join(tmpdir(), 'lifter-s34-f15-r3-support');
const screenshotPaths: string[] = [];
let assignmentId = '';
let email = '';
let password = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(screenshotDir, { recursive: true });
  mkdirSync(supportScreenshotDir, { recursive: true });
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
  // S31-R2 fixture sources: Arabic from mandatory-intake-copy-ar.md; EN = recorded draft pending PO review, copied from spec.md's EN translation table.
  const definition = {
    questions: [
      {
        id: 'B01',
        sectionId: 'basic',
        type: 'profileText',
        required: false,
        profileField: 'fullName',
        title: { en: 'Full name (three parts)', ar: 'الاسم الثلاثي' },
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
        id: 'B06',
        sectionId: 'basic',
        type: 'singleChoice',
        required: true,
        privacy: 'personal',
        purpose: 'n12-series',
        choices: ['male', 'female'],
        optionLabels: [
          { en: 'Male', ar: 'ذكر' },
          { en: 'Female', ar: 'أنثى' },
        ],
        title: { en: 'Gender', ar: 'النوع' },
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
      {
        id: 'N11',
        sectionId: 'nutrition',
        type: 'slider',
        required: false,
        title: {
          en: 'How hungry do you feel, from 0 to 10?',
          ar: 'بتقييم إحساسك بالجوع كام من 10؟',
        },
        validation: { min: 0, max: 10, step: 1 },
        labels: {
          minimum: 'مش بجوع تقريبًا',
          middle: 'جوع متوسط',
          maximum: 'جوع شديد جدًا',
        },
        feedbackBands: [
          { min: 0, max: 2, text: 'إحساس قليل جدًا بالجوع' },
          { min: 3, max: 4, text: 'جوع خفيف' },
          { min: 5, max: 6, text: 'جوع متوسط' },
          { min: 7, max: 8, text: 'جوع مرتفع' },
          { min: 9, max: 10, text: 'جوع شديد جدًا' },
        ],
      },
      {
        id: 'N07.meal_count',
        sectionId: 'nutrition',
        type: 'mealCount',
        required: false,
        title: {
          en: 'How many meals would you like to eat each day?',
          ar: 'حابب تاكل كام وجبة في اليوم؟',
        },
        choices: ['2', '3', '4', '5'],
        optionLabels: [
          { en: 'Two meals', ar: 'وجبتين' },
          { en: '3 meals', ar: '3 وجبات' },
          { en: '4 meals', ar: '4 وجبات' },
          { en: '5 meals', ar: '5 وجبات' },
        ],
      },
      {
        id: 'N07.training_timing',
        sectionId: 'nutrition',
        type: 'derivedChoice',
        required: false,
        title: {
          en: '',
          ar: 'تحب تمرينك يكون بعد الوجبة الكام؟',
        },
        derivedOptions: {
          sourceQuestionId: 'N07.meal_count',
          fixedChoices: ['before-first', 'no-fixed-time'],
        },
        choices: [
          'meal-1',
          'meal-2',
          'meal-3',
          'meal-4',
          'meal-5',
          'before-first',
          'no-fixed-time',
        ],
        optionLabels: [
          { en: 'Meal', ar: 'وجبة' },
          { en: 'Meal', ar: 'وجبة' },
          { en: 'Before the first meal', ar: 'قبل أول وجبة' },
          { en: "I don't have a fixed time", ar: 'معنديش ميعاد ثابت' },
          { en: 'Meal', ar: 'وجبة' },
          { en: 'Before the first meal', ar: 'قبل أول وجبة' },
          { en: "I don't have a fixed time", ar: 'معنديش ميعاد ثابت' },
        ],
      },
      {
        id: 'health-context',
        sectionId: 'nutrition',
        type: 'displayOnly',
        required: false,
        title: { en: 'About your health data', ar: 'عن بياناتك الصحية' },
        displayText: { en: 'About your health data', ar: 'عن بياناتك الصحية' },
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

async function advanceToGoal(
  page: Page,
  targetAssignmentId: string,
  locale: 'ar' | 'en',
  useKeyboard = false,
) {
  await page.goto(`/forms/${targetAssignmentId}`);
  await page.getByRole('button').nth(1).click();
  await page.getByRole('button').nth(1).click();
  await expect(page.getByRole('radio')).toHaveCount(2);
  const firstChoice = page.getByRole('radio').first();
  if (useKeyboard) {
    await firstChoice.focus();
    await page.keyboard.press('Space');
  } else {
    await firstChoice.click({ noWaitAfter: true });
  }
  if (locale === 'en')
    await expect(
      page.getByRole('textbox', { name: 'Your goal' }),
    ).toBeVisible();
  else await expect(page.getByRole('textbox').first()).toBeVisible();
}

async function createFreshAssignment(
  versionSnapshot?: Record<string, unknown>,
): Promise<string> {
  const [source] = await db`
    select workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot
    from public.form_assignments where id=${assignmentId}
  `;
  if (!source) throw new Error('Browser assignment fixture missing');
  const freshFormId = randomUUID();
  const freshId = randomUUID();
  await db`
    insert into public.forms(id,workspace_id,name)
    values(${freshFormId},${source.workspace_id},${'T022 correction fixture ' + freshFormId})
  `;
  await db`
    insert into public.form_versions
      (workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values
      (${source.workspace_id},${freshFormId},${source.version_number},${source.terms_policy_version},${db.json(versionSnapshot ?? source.version_snapshot)},'published')
  `;
  await db`
    insert into public.form_assignments
      (id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
    values
      (${freshId},${source.workspace_id},${source.client_id},${freshFormId},${source.version_number},${source.terms_policy_version},${db.json(versionSnapshot ?? source.version_snapshot)})
  `;
  return freshId;
}

async function createCorrectionAssignment(): Promise<string> {
  const [source] = await db`
    select version_snapshot from public.form_assignments where id=${assignmentId}
  `;
  if (!source || typeof source.version_snapshot !== 'object')
    throw new Error('Browser assignment snapshot is missing');
  const questions = (
    source.version_snapshot as { questions?: Array<{ id?: unknown }> }
  ).questions?.filter(({ id }) =>
    ['B01', 'B02', 'B06', 'goal', 'training', 'nutrition'].includes(String(id)),
  );
  if (questions?.length !== 6)
    throw new Error('Required correction fixture questions are missing');
  return createFreshAssignment({ questions });
}

async function createApprovedControlsAssignment(): Promise<string> {
  const [source] = await db`
    select version_snapshot from public.form_assignments where id=${assignmentId}
  `;
  if (!source || typeof source.version_snapshot !== 'object')
    throw new Error('Browser assignment snapshot is missing');
  const base = source.version_snapshot as { questions?: unknown[] };
  const questions = (base.questions ?? []).filter((question) =>
    ['B01', 'B02', 'B06'].includes(String((question as { id?: unknown }).id)),
  );
  const controlIds = new Set([
    'T03',
    'T08',
    'T08.system',
    'N07.meal_count',
    'N07.training_timing',
    'N08',
    'N08.foods',
    'N11',
    'N12',
  ]);
  const controls = starterContent.questions
    .filter((question) => controlIds.has(question.id))
    .map((question) => {
      const { label, ...rest } = question;
      return { ...rest, title: label };
    });
  const snapshot = { questions: [...questions, ...controls] };
  return createFreshAssignment(snapshot);
}

async function createRecordedControlsAssignment(): Promise<string> {
  const [source] = await db`
    select version_snapshot from public.form_assignments where id=${assignmentId}
  `;
  if (!source || typeof source.version_snapshot !== 'object')
    throw new Error('Browser assignment snapshot is missing');
  const base = source.version_snapshot as { questions?: unknown[] };
  const ids = new Set([
    'N11',
    'N07.meal_count',
    'N07.training_timing',
    'health-context',
  ]);
  const questions = (base.questions ?? []).filter((question) =>
    ids.has(String((question as { id?: unknown }).id)),
  );
  return createFreshAssignment({ questions });
}

async function expectAxeClean(page: Page) {
  const violations = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.violations).toEqual([]);
}

test('real authorized assignment renders the complete AR/EN theme and viewport matrix', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await signIn(page);
  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [390, 1440] as const) {
        const iterationAssignmentId = await createFreshAssignment();
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
        await page.goto(`/forms/${iterationAssignmentId}`);
        const [assignmentClient] = await db`
          select c.name from public.form_assignments a
          join public.clients c on c.workspace_id=a.workspace_id and c.id=a.client_id
          where a.id=${iterationAssignmentId}
        `;
        expect(assignmentClient?.name).toBeTruthy();
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: locale === 'en' ? 'Client intake' : 'بيانات العميل',
          }),
        ).toBeVisible();
        await expect(page.locator('output')).toHaveText(assignmentClient!.name);
        await expect(
          page.getByRole('heading', {
            level: 2,
            name: locale === 'ar' ? 'الاسم الثلاثي' : 'Full name (three parts)',
          }),
        ).toBeVisible();
        await expectAxeClean(page);
        await page.screenshot({
          path: join(
            supportScreenshotDir,
            `${locale}-${theme}-${width}-b01.png`,
          ),
          fullPage: true,
        });
        await page.getByRole('button').nth(1).click();
        await expect(page.locator('output')).toHaveText(
          String(calculateAgeInCairo('1990-04-12', new Date())),
        );
        await expect(
          page.getByRole('heading', {
            level: 2,
            name: locale === 'ar' ? 'العمر' : 'Age',
          }),
        ).toBeVisible();
        await expectAxeClean(page);
        await page.screenshot({
          path: join(
            supportScreenshotDir,
            `${locale}-${theme}-${width}-b02.png`,
          ),
          fullPage: true,
        });
        await page.getByRole('button').nth(1).click();
        await expect(page.getByRole('radio')).toHaveCount(2);
        await page.getByRole('radio').first().click({ noWaitAfter: true });
        await expect(
          page.getByRole('textbox', {
            name: locale === 'en' ? 'Your goal' : 'هدفك',
          }),
        ).toBeVisible();
        await expectAxeClean(page);
        await page.screenshot({
          path: join(
            supportScreenshotDir,
            `${locale}-${theme}-${width}-goal.png`,
          ),
          fullPage: true,
        });
      }
    }
  }
});

test('renders recorded new client controls across AR/EN, theme, and viewport matrix', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await signIn(page);
  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [390, 1024, 1440] as const) {
        const iterationAssignmentId = await createRecordedControlsAssignment();
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
        const routeResponse = await page.goto(
          `/forms/${iterationAssignmentId}`,
        );
        try {
          await expect(
            page.getByRole('heading', {
              level: 1,
              name: locale === 'en' ? 'Client intake' : 'بيانات العميل',
            }),
          ).toBeVisible({ timeout: 30_000 });
        } catch (error) {
          throw new Error(
            `Authorized route was not ready (${routeResponse?.status()}): ${(await page.locator('body').innerText()).slice(0, 500)}`,
            { cause: error },
          );
        }
        const nextName = getMessages(locale)['forms.next'];
        const capture = async (name: string, title: string) => {
          await expect(
            page.getByRole('heading', { level: 2, name: title }),
          ).toBeVisible();
          await page.screenshot({
            path: join(
              supportScreenshotDir,
              `${locale}-${theme}-${width}-${name}.png`,
            ),
            fullPage: true,
          });
        };

        await capture(
          'slider',
          locale === 'en'
            ? 'How hungry do you feel, from 0 to 10?'
            : 'بتقييم إحساسك بالجوع كام من 10؟',
        );
        await page.getByRole('button', { name: nextName }).click();
        await capture(
          'mealCount',
          locale === 'en'
            ? 'How many meals would you like to eat each day?'
            : 'حابب تاكل كام وجبة في اليوم؟',
        );
        await page.getByRole('radio').first().check();
        await page.getByRole('button', { name: nextName }).click();
        if (locale === 'ar')
          await capture('derivedChoice', 'تحب تمرينك يكون بعد الوجبة الكام؟');
        await page
          .getByRole('button', {
            name: locale === 'en' ? 'Next question' : 'السؤال التالي',
          })
          .click();
        await capture(
          'displayOnly',
          locale === 'en' ? 'About your health data' : 'عن بياناتك الصحية',
        );
        await page
          .getByRole('button', {
            name: getMessages(locale)['forms.submit'],
          })
          .click();
        await expect(
          page
            .getByRole('status')
            .filter({ hasText: getMessages(locale)['forms.submitSuccess'] }),
        ).toBeVisible({ timeout: 10_000 });
        await expect(
          page.getByRole('button', {
            name: getMessages(locale)['forms.saveNow'],
          }),
        ).toHaveCount(0);
        await expectAxeClean(page);
      }
    }
  }
});

test('approved F15 controls render in both locales, themes, and widths', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await signIn(page);
  const nextFor = (locale: 'ar' | 'en') =>
    page.getByRole('button', {
      name: locale === 'en' ? 'Next question' : 'السؤال التالي',
    });
  for (const locale of ['ar', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [390, 1024, 1440] as const) {
        const freshId = await createApprovedControlsAssignment();
        const series = locale === 'ar' ? 'male' : 'female';
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
        await page.goto(`/forms/${freshId}`);
        const next = nextFor(locale);
        const capture = async (name: string, heading?: string) => {
          if (heading) {
            const target =
              name === 'T08-system'
                ? page.getByRole('textbox', { name: heading })
                : page.getByRole('heading', { level: 2, name: heading });
            await expect(target).toBeVisible();
          }
          if (
            ![
              'T03',
              'T08-system',
              'N07-meal-count',
              'N07-timing',
              'N11',
            ].includes(name)
          )
            return;
          await expectAxeClean(page);
          const path = join(
            screenshotDir,
            `${locale}-${theme}-${width}-${name}.png`,
          );
          await page.screenshot({ path, fullPage: true });
          screenshotPaths.push(path);
        };
        await capture(
          'B01',
          locale === 'en' ? 'Full name (three parts)' : 'الاسم الثلاثي',
        );
        await next.click();
        await capture('B02', locale === 'en' ? 'Age' : 'العمر');
        await next.click();
        await capture('B06', locale === 'en' ? 'Gender' : 'النوع');
        await page
          .getByRole('radio', {
            name:
              series === 'male'
                ? locale === 'en'
                  ? 'Male'
                  : 'ذكر'
                : locale === 'en'
                  ? 'Female'
                  : 'أنثى',
            exact: true,
          })
          .check();
        await next.click();
        await capture(
          'T03',
          locale === 'en'
            ? 'How many days a week would you like to train?'
            : 'حابب تتمرن كام يوم في الأسبوع؟',
        );
        const dayOptions = await page
          .getByRole('radio')
          .evaluateAll((nodes) =>
            nodes.map((node) => (node.parentElement?.textContent ?? '').trim()),
          );
        expect(dayOptions).toEqual(
          locale === 'en'
            ? ['2 days', '3 days', '4 days', '5 days', '6 days']
            : ['2', '3', '4', '5', '6'],
        );
        if (locale === 'ar') {
          const isolatedDigits = await page
            .locator('bdi[dir="ltr"]')
            .allTextContents();
          expect(isolatedDigits).toEqual(expect.arrayContaining(['2', '6']));
        }
        await next.click();
        await capture(
          'T08',
          locale === 'en' ? 'Training split' : 'عايز نظام تمرين معين؟',
        );
        await page
          .getByRole('radio', { name: getMessages(locale)['forms.yes'] })
          .check();
        const t08SystemLabel = starterContent.questions.find(
          (question) => question.id === 'T08.system',
        )!.label![locale];
        if (locale === 'en')
          expect(t08SystemLabel).toBe(
            'What training split would you like to follow?',
          );
        await next.click();
        await capture('T08-system', t08SystemLabel);
        await next.click();
        const mealCount = starterContent.questions.find(
          (question) => question.id === 'N07.meal_count',
        )!;
        await capture('N07-meal-count', mealCount.label![locale]);
        const mealOptions = await page
          .getByRole('radio')
          .evaluateAll((nodes) =>
            nodes.map((node) => (node.parentElement?.textContent ?? '').trim()),
          );
        if (locale === 'en')
          expect(mealOptions).toEqual([
            '2 meals',
            '3 meals',
            '4 meals',
            '5 meals',
          ]);
        await page.getByRole('radio').first().check();
        await next.click();
        await capture(
          'N07-timing',
          locale === 'en'
            ? 'After which meal would you like to train?'
            : 'تحب تمرينك يكون بعد الوجبة الكام؟',
        );
        const timingOptions = await page
          .getByRole('radio')
          .evaluateAll((nodes) =>
            nodes.map((node) => (node.parentElement?.textContent ?? '').trim()),
          );
        if (locale === 'en')
          expect(timingOptions).toEqual([
            'After meal 1',
            'After meal 2',
            'Before the first meal',
            "I don't have a fixed time",
          ]);
        else
          expect(timingOptions).toEqual([
            'الوجبة رقم 1',
            'الوجبة رقم 2',
            'قبل أول وجبة',
            'معنديش ميعاد ثابت',
          ]);
        await next.click();
        await capture(
          'N08',
          locale === 'en'
            ? 'What’s your food budget?'
            : 'ميزانيتك للأكل عاملة إزاي؟',
        );
        expect(
          await page
            .getByText('Choose foods that fit your budget.', { exact: true })
            .count(),
        ).toBe(0);
        const budgetChoices = page.getByRole('radio');
        await budgetChoices.first().check();
        await expect(page.getByRole('checkbox')).toHaveCount(4);
        await capture('N08-food-chips');
        await page.getByRole('checkbox').first().check();
        await next.click();
        await capture(
          'N11',
          locale === 'en'
            ? 'How hungry do you feel, from 0 to 10?'
            : 'بتقيّم إحساسك بالجوع كام من 10؟',
        );
        const n11Labels = starterContent.questions.find(
          (question) => question.id === 'N11',
        )!.labels!;
        const renderedN11Labels = [
          n11Labels.minimum,
          n11Labels.middle,
          n11Labels.maximum,
        ].map((label) => (typeof label === 'string' ? label : label[locale]));
        for (const label of renderedN11Labels)
          await expect(page.getByText(label, { exact: true })).toBeVisible();
        if (locale === 'en')
          expect(renderedN11Labels).toEqual([
            'I barely feel hungry',
            'Moderate hunger',
            'Very strong hunger',
          ]);
        const slider = page.getByRole('slider');
        expect(await slider.getAttribute('min')).toBe('0');
        expect(await slider.getAttribute('max')).toBe('10');
        const n11Feedback = starterContent.questions.find(
          (question) => question.id === 'N11',
        )!.feedbackBands![0]!.text;
        await expect(
          page.getByText(locale === 'en' ? 'Very little hunger' : n11Feedback, {
            exact: true,
          }),
        ).toBeVisible();
        await next.click();
        const images = page.locator('fieldset img');
        const imageCount = await images.count();
        const expectedCards = starterContent.questions
          .find((question) => question.id === 'N12')!
          .choices!.filter((choice) => choice.startsWith(`${series}-`));
        expect(imageCount).toBe(expectedCards.length);
        const imageAlts = await images.evaluateAll((nodes) =>
          nodes.map((node) => (node as HTMLImageElement).alt),
        );
        expect(imageAlts).toEqual(
          expectedCards.map((choice) => `${choice.split('-')[1]}%`),
        );
        const maleAssetPaths = starterContent.questions
          .find((question) => question.id === 'N12')!
          .assetReferences!.filter((asset) => asset.includes(`/${series}-`));
        const assetResponses = await Promise.all(
          maleAssetPaths.map((asset) => page.request.get(asset)),
        );
        expect(assetResponses.map((response) => response.status())).toEqual(
          Array.from({ length: expectedCards.length }, () => 200),
        );
        const renderedWidth = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(renderedWidth.scrollWidth).toBeLessThanOrEqual(
          renderedWidth.clientWidth,
        );
        await capture(
          'N12',
          locale === 'en'
            ? 'Choose the body-fat reference that most closely resembles your body shape.'
            : 'اختار أقرب نسبة دهون لشكل جسمك',
        );
        await expectAxeClean(page);
      }
    }
  }
  expect(screenshotPaths).toHaveLength(60);
  writeFileSync(
    join(screenshotDir, 'INDEX.md'),
    [
      '# S34 F15 T03/N07 and approved-copy rendered evidence',
      '',
      'T03, T08.system, N07 meal-count/timing, and N11 screens rendered for AR-RTL and EN-LTR in light and dark themes at 390px, 1024px, and 1440px. Axe passed on all 60 captured states.',
      '',
      ...screenshotPaths.map((path) => `- ${path}`),
      '',
    ].join('\n'),
    'utf8',
  );
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
  const keyboardAssignmentId = await createFreshAssignment();
  await advanceToGoal(page, keyboardAssignmentId, 'en', true);
  const goal = page.getByRole('textbox', { name: 'Your goal' });
  await goal.focus();
  await goal.fill('Build strength');
  const blurSave = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response
        .url()
        .includes(`/api/forms/assignments/${keyboardAssignmentId}/draft`),
  );
  const next = page.getByRole('button', { name: 'Next question' });
  await next.focus();
  const saveResponse = await blurSave;
  const saveBody = await saveResponse.json();
  expect(saveBody.status).toBe('saved');
  expect(saveResponse.status()).toBe(200);
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('region', { name: 'Nutrition preferences' }),
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
      const stateAssignmentId = await createFreshAssignment();
      await advanceToGoal(page, stateAssignmentId, locale);
      const field = page.getByRole('textbox').first();
      await expect(field).toBeVisible();
      const capture = async (state: string) => {
        const violations = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(violations.violations).toEqual([]);
        await page.screenshot({
          path: join(
            supportScreenshotDir,
            `${locale}-${theme}-${width}-${state}.png`,
          ),
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
  const latencyAssignmentId = await createFreshAssignment();
  await advanceToGoal(page, latencyAssignmentId, 'en');
  const field = page.getByRole('textbox').first();
  await expect(field).toBeVisible();
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

test('submitted answer edits wait for explicit correction and use the latest revision', async ({
  page,
}) => {
  // Earlier autosave coverage persists a draft. A fresh assignment keeps this
  // correction flow independent of that test's saved question progress.
  const correctionAssignmentId = await createCorrectionAssignment();
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
  await advanceToGoal(page, correctionAssignmentId, 'en');
  const correctionBodies: Array<Record<string, unknown>> = [];
  const draftRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    if (request.url().endsWith('/corrections'))
      correctionBodies.push(request.postDataJSON() as Record<string, unknown>);
    if (request.url().endsWith('/draft')) draftRequests.push(request.url());
  });

  await page.getByRole('textbox', { name: 'Your goal' }).fill('Build strength');
  await expect(page.getByRole('status')).toHaveText('Draft saved.', {
    timeout: 10_000,
  });
  const trainingQuestion = page.getByRole('region', {
    name: 'Training experience',
  });
  await expect(trainingQuestion).toBeVisible();
  await trainingQuestion.getByRole('textbox').fill('Two years');
  await expect(page.getByRole('status')).toHaveText('Draft saved.', {
    timeout: 10_000,
  });
  const nutritionQuestion = page.getByRole('region', {
    name: 'Nutrition preferences',
  });
  await expect(nutritionQuestion).toBeVisible();
  await nutritionQuestion.getByRole('textbox').fill('Balanced meals');
  const submitButton = page.getByRole('button', { name: 'Submit answers' });
  await expect(page.getByRole('status')).toHaveText('Draft saved.', {
    timeout: 10_000,
  });
  await expect(submitButton).toBeVisible();
  const submitResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/submit') &&
      response.request().method() === 'POST',
  );
  await submitButton.click();
  const submission = await submitResponse;
  expect(submission.status()).toBe(200);
  const submittedBody = await submission.json();
  let expectedRevision = submittedBody.revision as number;
  expect(expectedRevision).toBeGreaterThan(0);
  await expect(
    page.getByText('Your answers were submitted.', { exact: true }),
  ).toBeVisible();
  const draftsAtSubmission = draftRequests.length;

  for (const [correctionIndex, value] of [
    'Adjusted meals',
    'Adjusted meals again',
  ].entries()) {
    await page
      .getByRole('button', { name: 'Correct submitted answers' })
      .click();
    await page
      .getByRole('textbox', { name: 'Nutrition preferences' })
      .fill(value);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(1_600);
    expect(correctionBodies).toHaveLength(correctionIndex);
    expect(draftRequests).toHaveLength(draftsAtSubmission);
    const correctionResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/corrections') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Save correction' }).click();
    const response = await correctionResponse;
    expect(response.status()).toBe(200);
    expect(correctionBodies.at(-1)?.expected_revision).toBe(expectedRevision);
    const correction = await response.json();
    expect(correction.revision).toBe(expectedRevision + 1);
    expectedRevision = correction.revision as number;
    await expect(
      page.getByText('Your answers were submitted.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(getMessages('en')['forms.unsaved'], { exact: true }),
    ).toHaveCount(0);
  }
});
