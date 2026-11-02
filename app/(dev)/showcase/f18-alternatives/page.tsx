import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  NutritionPlanAlternativesEditor,
  type NutritionAlternativeDraft,
  type NutritionAlternativeFood,
  type NutritionAlternativesItem,
} from '../../../../components/plans/NutritionPlanAlternativesEditor';
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
import styles from './page.module.css';

const foods: readonly [
  NutritionAlternativeFood,
  NutritionAlternativeFood,
  NutritionAlternativeFood,
  NutritionAlternativeFood,
] = [
  {
    name: { ar: 'صدر دجاج مشوي', en: 'Grilled chicken breast' },
    snapshot: {
      foodVersionId: '00000000-0000-4000-8000-000000000001',
      basis: 'g',
      per100: {
        calories: '165.00',
        protein: '31.00',
        carbs: '0.00',
        fat: '3.60',
      },
      servingEquivalences: { g: '1', piece: '120' },
    },
  },
  {
    name: { ar: 'أرز بسمتي مطبوخ', en: 'Cooked basmati rice' },
    snapshot: {
      foodVersionId: '00000000-0000-4000-8000-000000000002',
      basis: 'g',
      per100: {
        calories: '130.00',
        protein: '2.70',
        carbs: '28.00',
        fat: '0.30',
      },
      servingEquivalences: { g: '1', cup: '158' },
    },
  },
  {
    name: { ar: 'زبادي يوناني', en: 'Greek yogurt' },
    snapshot: {
      foodVersionId: '00000000-0000-4000-8000-000000000003',
      basis: 'g',
      per100: {
        calories: '59.00',
        protein: '10.00',
        carbs: '3.60',
        fat: '0.40',
      },
      servingEquivalences: { g: '1', cup: '245' },
    },
  },
  {
    name: { ar: 'شوفان', en: 'Oats' },
    snapshot: {
      foodVersionId: '00000000-0000-4000-8000-000000000004',
      basis: 'g',
      per100: {
        calories: '389.00',
        protein: '16.90',
        carbs: '66.30',
        fat: '6.90',
      },
      servingEquivalences: { g: '1', cup: '90' },
    },
  },
];

const item: NutritionAlternativesItem = {
  id: '00000000-0000-4000-8000-000000000010',
  name: foods[0].name,
  snapshot: foods[0].snapshot,
  quantity: { value: '200', unit: 'g' },
};

const alternatives: NutritionAlternativeDraft[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    foodVersionId: '00000000-0000-4000-8000-000000000011',
    quantity: { value: '150', unit: 'g' },
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    foodVersionId: '00000000-0000-4000-8000-000000000012',
    quantity: { value: '200', unit: 'g' },
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    foodVersionId: foods[3].snapshot.foodVersionId,
    quantity: { value: '40', unit: 'g' },
  },
];

const foodVersionResolution = [
  {
    sourceFoodVersionId: '00000000-0000-4000-8000-000000000011',
    currentFoodVersionId: '00000000-0000-4000-8000-000000000013',
  },
  {
    sourceFoodVersionId: '00000000-0000-4000-8000-000000000013',
    currentFoodVersionId: foods[1].snapshot.foodVersionId,
  },
  {
    sourceFoodVersionId: '00000000-0000-4000-8000-000000000012',
    currentFoodVersionId: null,
  },
] as const;

export default async function NutritionAlternativesShowcasePage() {
  if (!isShowcaseEnabled(process.env)) notFound();

  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const m = getMessages(locale);

  return (
    <main className={styles.page} data-testid="f18-alternatives-showcase">
      <header className={styles.header}>
        <h1>{m['nutritionAlternatives.previewTitle']}</h1>
        <p>{m['nutritionAlternatives.previewIntro']}</p>
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

      <NutritionPlanAlternativesEditor
        locale={locale}
        item={item}
        foods={foods}
        alternatives={alternatives}
        foodVersionResolution={foodVersionResolution}
      />

      <p className={styles.notice}>
        {m['nutritionAlternatives.previewNotice']}
      </p>
    </main>
  );
}
