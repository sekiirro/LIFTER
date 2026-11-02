import { notFound } from 'next/navigation';
import { FoodEditor } from '../../../../components/catalog/FoodEditor';
import { DuplicateReview } from '../../../../components/catalog/DuplicateReview';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { cookies } from 'next/headers';
import { getMessages } from '../../../../lib/i18n';
import type { FoodEditorDraft } from '../../../../lib/catalog/food-editor';
import styles from './catalog-foods.module.css';

const fixture: FoodEditorDraft = {
  nameAr: 'أرز أبيض مطبوخ',
  nameEn: 'Cooked white rice',
  basis: 'g',
  productIdentity: 'white rice',
  preparationIdentity: 'boiled',
  weighingState: 'cooked',
  kcal: '200',
  protein: '2.7',
  carbs: '28',
  fat: '0.3',
  fiber: '',
  servings: [{ labelAr: 'كوب', labelEn: 'cup', basisQuantity: '158' }],
  alternatives: [
    { foodId: 'food-oats', portionQuantity: '100', portionUnit: 'g' },
  ],
};

const candidates = [
  {
    id: 'fixture-food-1',
    names: { ar: 'أرز مطبوخ', en: 'Cooked rice' },
    basis: 'g' as const,
    kcal: 130,
  },
];

export default async function CatalogFoodsShowcase({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (!isShowcaseEnabled(process.env)) notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  const state = (await searchParams).state;
  return (
    <main className={styles.main} data-testid="catalog-foods-showcase">
      <h1>{m['catalog.foodPreviewHeading']}</h1>
      {state === 'exact' || state === 'near' ? (
        <DuplicateReview
          locale={locale}
          role="trainer"
          state={state}
          candidates={candidates}
        />
      ) : (
        <FoodEditor
          locale={locale}
          role="trainer"
          workspaces={[
            { id: 'fixture-kendo', label: 'Kendo — demo workspace' },
          ]}
          initialDraft={fixture}
          alternatives={[
            { id: 'food-oats', names: { ar: 'شوفان', en: 'Oats' } },
            { id: 'food-potato', names: { ar: 'بطاطس', en: 'Potato' } },
            { id: 'food-bulgur', names: { ar: 'برغل', en: 'Bulgur' } },
          ]}
        />
      )}
    </main>
  );
}
