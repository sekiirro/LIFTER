import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { NutritionPlanEditor } from '../../../../components/plans/NutritionPlanEditor';
import { LanguageSwitcher } from '../../../../components/preferences/LanguageSwitcher';
import { ThemeSwitcher } from '../../../../components/preferences/ThemeSwitcher';
import {
  LOCALE_COOKIE,
  parseLocale,
  parseTheme,
  THEME_COOKIE,
} from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { getMessages } from '../../../../lib/i18n';
import type { NutritionDocument } from '../../../../lib/plans/nutrition/schema';
import styles from './page.module.css';

const foodId = '00000000-0000-4000-8000-000000000003';
const document: NutritionDocument = {
  structure: {
    kind: 'seven_day',
    days: Array.from({ length: 7 }, (_, dayIndex) => ({
      dayIndex,
      dayTypeId:
        dayIndex % 2
          ? '00000000-0000-4000-8000-000000000002'
          : '00000000-0000-4000-8000-000000000001',
    })),
  },
  dayTypes: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Training',
      trainingDay: true,
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Rest',
      trainingDay: false,
    },
  ],
  meals: [
    {
      id: '00000000-0000-4000-8000-000000000010',
      conditional: 'always',
      items: [
        {
          id: '00000000-0000-4000-8000-000000000011',
          foodVersionId: foodId,
          quantity: { value: '160', unit: 'g' },
          alternatives: [],
        },
      ],
    },
    {
      id: '00000000-0000-4000-8000-000000000020',
      conditional: 'training_days_only',
      items: [
        {
          id: '00000000-0000-4000-8000-000000000021',
          foodVersionId: foodId,
          quantity: { value: '80', unit: 'g' },
          alternatives: [],
        },
      ],
    },
  ],
};
const foods = [
  {
    name: { ar: 'أرز بسمتي مطبوخ', en: 'Cooked basmati rice' },
    snapshot: {
      foodVersionId: foodId,
      basis: 'g' as const,
      per100: {
        calories: '130.00',
        protein: '2.70',
        carbs: '28.00',
        fat: '0.30',
      },
      servingEquivalences: { g: '1', cup: '158' },
    },
  },
];

export default async function NutritionPlanEditorShowcasePage() {
  if (!isShowcaseEnabled(process.env)) notFound();
  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const m = getMessages(locale);
  return (
    <main className={styles.page} data-testid="f18-plan-editor-showcase">
      <header>
        <h1>{m['nutritionPlan.previewTitle']}</h1>
        <p>{m['nutritionPlan.previewIntro']}</p>
      </header>
      <section
        className={styles.controls}
        aria-label={m['showcase.preferences']}
      >
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
      <NutritionPlanEditor locale={locale} document={document} foods={foods} />
      <p>{m['nutritionPlan.previewNotice']}</p>
    </main>
  );
}
