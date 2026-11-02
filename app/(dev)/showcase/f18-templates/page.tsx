import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { NutritionTemplateShowcase } from './NutritionTemplateShowcase';
import { LanguageSwitcher } from '../../../../components/preferences/LanguageSwitcher';
import { ThemeSwitcher } from '../../../../components/preferences/ThemeSwitcher';
import {
  LOCALE_COOKIE,
  parseLocale,
  parseTheme,
  THEME_COOKIE,
} from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import type { NutritionTemplate } from '../../../../components/plans/NutritionTemplateManagerModel';
import { getMessages } from '../../../../lib/i18n';
import styles from './page.module.css';

const dayTypeId = '00000000-0000-4000-8000-000000000001';
const foodId = '00000000-0000-4000-8000-000000000002';
const foodItemId = '00000000-0000-4000-8000-000000000003';
const mealId = '00000000-0000-4000-8000-000000000004';
const planDocument = {
  structure: { kind: 'single_day' as const, implicitDayTypeId: dayTypeId },
  dayTypes: [{ id: dayTypeId, name: 'Training', trainingDay: true }],
  meals: [
    {
      id: mealId,
      conditional: 'always' as const,
      items: [
        {
          id: foodItemId,
          foodVersionId: foodId,
          quantity: { value: '120', unit: 'g' },
          alternatives: [],
        },
      ],
    },
  ],
};

const templates: readonly NutritionTemplate[] = [
  {
    id: 'global-strength',
    name: { ar: 'قالب القوة العام', en: 'Global strength plan' },
    scope: 'global',
    retired: false,
    eligibleForGlobal: false,
    origin: 'Platform',
    versions: [
      { version: 1, document: planDocument },
      { version: 2, document: planDocument },
    ],
  },
  {
    id: 'workspace-balanced',
    name: { ar: 'الخطة المتوازنة', en: 'Balanced workspace plan' },
    scope: 'workspace',
    workspaceId: 'workspace-a',
    retired: false,
    eligibleForGlobal: true,
    origin: 'Workspace A',
    versions: [{ version: 1, document: planDocument }],
  },
  {
    id: 'workspace-retired',
    name: { ar: 'قالب الأسبوع السابق', en: 'Previous week template' },
    scope: 'workspace',
    workspaceId: 'workspace-a',
    retired: true,
    eligibleForGlobal: false,
    versions: [{ version: 1, document: planDocument }],
  },
  {
    id: 'other-workspace',
    name: { ar: 'قالب مساحة أخرى', en: 'Another workspace template' },
    scope: 'workspace',
    workspaceId: 'workspace-b',
    retired: false,
    eligibleForGlobal: false,
    versions: [{ version: 1, document: planDocument }],
  },
];

export default async function NutritionTemplatesShowcasePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  if (!isShowcaseEnabled(process.env)) notFound();
  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const params = await searchParams;
  const role = params.role === 'staff' ? 'staff' : 'po';
  const m = getMessages(locale);

  return (
    <main className={styles.page} data-testid="f18-template-showcase">
      <header>
        <h1>{m['nutritionTemplates.previewTitle']}</h1>
        <p>{m['nutritionTemplates.previewIntro']}</p>
      </header>
      <section className={styles.controls} aria-label={m['showcase.preferences']}>
        <LanguageSwitcher
          value={locale}
          label={m['language.label']}
          labels={{ ar: m['language.ar'], en: m['language.en'] }}
        />
        <ThemeSwitcher
          key={theme}
          value={theme}
          label={m['theme.label']}
          labels={{
            system: m['theme.system'],
            dark: m['theme.dark'],
            light: m['theme.light'],
          }}
        />
      </section>
      <NutritionTemplateShowcase locale={locale} role={role} templates={templates} />
      <p>{m['nutritionTemplates.previewNotice']}</p>
    </main>
  );
}
