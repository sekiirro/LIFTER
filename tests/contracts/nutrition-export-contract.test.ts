import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  computeAlternativeValues,
  computeDocumentValues,
  displayCalories,
  displayMacroGrams,
  snapshotMapKey,
  type MacroSet,
  type NutritionSnapshotEntry,
  type NutritionSnapshotMap,
} from '../../lib/plans/nutrition/macros';
import type { NutritionQuantityUnit } from '../../lib/plans/nutrition/types';
import {
  NUTRITION_DOCUMENT_SCHEMA_VERSION,
  validateNutritionDocument,
  type NutritionAlternative,
  type NutritionItem,
  type NutritionMeal,
} from '../../lib/plans/nutrition/schema';
import {
  buildNutritionPrompt,
  NUTRITION_PROMPT_LABELS,
  planContentText,
} from '../../lib/plans/nutrition/prompt';

/**
 * T005 — Export and prompt fidelity contract (F18-FR-006, F18-FR-014,
 * F18-FR-015, F18-FR-023; S43-PO-2, S43-PO-5).
 *
 * Contract: `specs/018-nutrition-planner/contracts/nutrition-api.md` §6 and
 * `contracts/copy-ai-prompt.md`. The reference model mirrors the shared
 * export reader: one authorized projection feeds the renderers; selected
 * content is primary with recalculated totals; the coach original is a
 * labelled per-item side note (S43-PO-2 approved labels); totals rows
 * contain client-selection totals only; coach text cells are written as
 * text (formula prefixes never evaluated); the prompt body is the
 * byte-exact approved EN/AR template with only {{PLAN_CONTENT}} substituted.
 */

const FOOD_A = 'fa1';
const FOOD_B = 'fb1';

const UNIT_CONTEXT = {
  [`${FOOD_A}@3`]: { basis: 'g' as const, servingUnitKeys: ['g'] },
  [`${FOOD_A}@4`]: { basis: 'g' as const, servingUnitKeys: ['g'] },
  // F16 keeps `g`/`ml` as catalog serving keys: FOOD_B declares a catalog
  // serving whose key is `g`, referenced tagged as kind "serving".
  [`${FOOD_B}@2`]: { basis: 'g' as const, servingUnitKeys: ['g'] },
};

const SNAPSHOT_MAP: NutritionSnapshotMap = {
  [`food:${FOOD_A}@3#basis:g`]: {
    kind: 'basis',
    foodId: FOOD_A,
    version: 3,
    names: { ar: 'دجاج', en: 'Chicken' },
    basis: 'g',
    productIdentity: 'raw',
    preparationIdentity: 'raw',
    weighingState: 'raw',
    per100: {
      kcal: '250.0',
      protein: '12.34',
      carbs: '50.00',
      fat: '12.34',
      fiber: null,
    },
  } satisfies NutritionSnapshotEntry,
  [`food:${FOOD_A}@4#basis:g`]: {
    kind: 'basis',
    foodId: FOOD_A,
    version: 4,
    names: { ar: 'دجاج', en: 'Chicken' },
    basis: 'g',
    productIdentity: 'raw',
    preparationIdentity: 'raw',
    weighingState: 'raw',
    per100: {
      kcal: '400.0',
      protein: '30.00',
      carbs: '10.00',
      fat: '5.00',
      fiber: null,
    },
  } satisfies NutritionSnapshotEntry,
  [`food:${FOOD_B}@2#serving:g`]: {
    kind: 'serving',
    unitKey: 'g',
    snapshot: {
      foodId: FOOD_B,
      version: 2,
      names: { ar: 'سمك', en: 'Fish' },
      basis: 'g',
      productIdentity: 'raw',
      preparationIdentity: 'raw',
      weighingState: 'raw',
      kcal: '200.0',
      protein: '18.00',
      carbs: '0.00',
      fat: '5.00',
      fiber: null,
      serving: {
        servingId: 'g',
        labels: { ar: 'جرام', en: 'gram' },
        basisQuantity: '100.000',
      },
    },
  } satisfies NutritionSnapshotEntry,
};

/** Coach-authored text crafted to test formula-prefix neutralization. */
const MEAL_NOTE = '=cmd meal note';
const FOOD_NOTE = '@cmd food note';

const DOC = validateNutritionDocument(
  {
    schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
    structure: 'single_day',
    implicitDayTypeId: 'dt-rest',
    dayTypes: [
      {
        id: 'dt-rest',
        name: { ar: 'راحة', en: 'Rest' },
        trainingDay: false,
        targets: null,
      },
    ],
    meals: [
      {
        id: 'm-1',
        name: { ar: 'فطور', en: 'Breakfast' },
        note: MEAL_NOTE,
        recipeUrl: 'https://www.youtube.com/watch?v=abc',
        items: [
          {
            id: '33333333-3333-4333-8333-333333333331',
            foodId: FOOD_A,
            foodVersion: 3,
            quantity: { value: '37', unit: { kind: 'basis', value: 'g' } },
            note: FOOD_NOTE,
            alternatives: [
              {
                id: '44444444-4444-4444-8444-444444444441',
                foodId: FOOD_A,
                foodVersion: 4,
                quantity: { value: '150', unit: { kind: 'basis', value: 'g' } },
              },
            ],
          },
          {
            id: '33333333-3333-4333-8333-333333333332',
            foodId: FOOD_B,
            foodVersion: 2,
            quantity: { value: '1', unit: { kind: 'serving', unitKey: 'g' } },
            note: null,
            alternatives: [],
          },
        ],
      },
    ],
    title: { ar: 'خطة تغذية', en: 'Nutrition plan' },
    notes: null,
  },
  UNIT_CONTEXT,
);

const COACH_VALUES = computeDocumentValues(DOC, SNAPSHOT_MAP);
const SELECTED_VALUES = computeDocumentValues(DOC, SNAPSHOT_MAP, {
  '33333333-3333-4333-8333-333333333331':
    '44444444-4444-4444-8444-444444444441',
});

type ExportProjection = {
  document: typeof DOC;
  computedValues: typeof COACH_VALUES;
  selectedValues: typeof SELECTED_VALUES | null;
  selectedAlternativeIds: Record<string, string>;
  /** The immutable revision's snapshot map: renderers resolve from it only. */
  snapshotMap: NutritionSnapshotMap;
};

const NO_SELECTION: ExportProjection = {
  document: DOC,
  computedValues: COACH_VALUES,
  selectedValues: null,
  selectedAlternativeIds: {},
  snapshotMap: SNAPSHOT_MAP,
};

const WITH_SELECTION: ExportProjection = {
  document: DOC,
  computedValues: COACH_VALUES,
  selectedValues: SELECTED_VALUES,
  selectedAlternativeIds: {
    '33333333-3333-4333-8333-333333333331':
      '44444444-4444-4444-8444-444444444441',
  },
  snapshotMap: SNAPSHOT_MAP,
};

// Seven-day fidelity fixture: two different meals on two different days,
// document-level notes, and dollar sequences in authored notes.
const SEVEN_DAY_DOC = validateNutritionDocument(
  {
    schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
    structure: 'seven_day',
    dayTypes: [
      {
        id: 'dt-train',
        name: { ar: 'تمرين', en: 'Training' },
        trainingDay: true,
        targets: null,
      },
      {
        id: 'dt-rest',
        name: { ar: 'راحة', en: 'Rest' },
        trainingDay: false,
        targets: null,
      },
    ],
    days: [
      {
        dayIndex: 0,
        dayTypeId: 'dt-train',
        meals: [
          {
            id: 'm-0',
            name: { ar: 'فطور', en: 'Breakfast' },
            note: null,
            recipeUrl: null,
            items: [
              {
                id: '33333333-3333-4333-8333-333333333351',
                foodId: FOOD_A,
                foodVersion: 3,
                quantity: { value: '37', unit: { kind: 'basis', value: 'g' } },
                note: 'Food notes: keep $& and $$ literal',
                alternatives: [],
              },
            ],
          },
        ],
      },
      ...Array.from({ length: 5 }, (_, i) => ({
        dayIndex: i + 1,
        dayTypeId: 'dt-rest',
        meals: [],
      })),
      {
        dayIndex: 6,
        dayTypeId: 'dt-rest',
        meals: [
          {
            id: 'm-6',
            name: { ar: 'عشاء', en: 'Dinner' },
            note: null,
            recipeUrl: null,
            items: [
              {
                id: '33333333-3333-4333-8333-333333333352',
                foodId: FOOD_A,
                foodVersion: 3,
                quantity: {
                  value: '62.5',
                  unit: { kind: 'basis', value: 'g' },
                },
                note: null,
                alternatives: [],
              },
            ],
          },
        ],
      },
    ],
    title: { ar: 'خطة الأسبوع', en: 'Week plan' },
    notes: 'Plan notes: keep $& and $$ exactly as written',
  },
  UNIT_CONTEXT,
);

const SEVEN_DAY_COACH = computeDocumentValues(SEVEN_DAY_DOC, SNAPSHOT_MAP);

const SEVEN_DAY_PROJECTION: ExportProjection = {
  document: SEVEN_DAY_DOC,
  computedValues: SEVEN_DAY_COACH,
  selectedValues: null,
  selectedAlternativeIds: {},
  snapshotMap: SNAPSHOT_MAP,
};

// Second snapshot map: a distinct food whose catalog serving key requires
// RFC 3986 encoding, proving renderers resolve from the projection only.
const FOOD_D = 'fd4';
const UNIT_CONTEXT_2 = {
  [`${FOOD_D}@1`]: { basis: 'g' as const, servingUnitKeys: ['cup/large'] },
};
const SNAPSHOT_MAP_2: NutritionSnapshotMap = {
  [`food:${FOOD_D}@1#basis:g`]: {
    kind: 'basis',
    foodId: FOOD_D,
    version: 1,
    names: { en: 'Yogurt' },
    basis: 'g',
    productIdentity: 'raw',
    preparationIdentity: 'raw',
    weighingState: 'raw',
    per100: {
      kcal: '60.0',
      protein: '3.50',
      carbs: '5.00',
      fat: '1.50',
      fiber: null,
    },
  } satisfies NutritionSnapshotEntry,
  [snapshotMapKey(FOOD_D, 1, { kind: 'serving', unitKey: 'cup/large' })]: {
    kind: 'serving',
    unitKey: 'cup/large',
    snapshot: {
      foodId: FOOD_D,
      version: 1,
      names: { en: 'Yogurt' },
      basis: 'g',
      productIdentity: 'raw',
      preparationIdentity: 'raw',
      weighingState: 'raw',
      kcal: '60.0',
      protein: '3.50',
      carbs: '5.00',
      fat: '1.50',
      fiber: null,
      serving: {
        servingId: 'cup/large',
        labels: { en: 'cup (large)' },
        basisQuantity: '250.000',
      },
    },
  } satisfies NutritionSnapshotEntry,
};

const DOC_2 = validateNutritionDocument(
  {
    schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
    structure: 'single_day',
    implicitDayTypeId: 'dt-rest',
    dayTypes: [
      {
        id: 'dt-rest',
        name: { ar: 'راحة', en: 'Rest' },
        trainingDay: false,
        targets: null,
      },
    ],
    meals: [
      {
        id: 'm-x',
        name: { ar: '=خطير', en: '=Suspicious Meal' },
        note: null,
        recipeUrl: null,
        items: [
          {
            id: '33333333-3333-4333-8333-333333333353',
            foodId: FOOD_D,
            foodVersion: 1,
            quantity: {
              value: '1',
              unit: { kind: 'serving', unitKey: 'cup/large' },
            },
            note: null,
            alternatives: [],
          },
        ],
      },
    ],
    title: { ar: 'خطة', en: 'Plan' },
    notes: null,
  },
  UNIT_CONTEXT_2,
);

const DOC_2_COACH = computeDocumentValues(DOC_2, SNAPSHOT_MAP_2);

const DOC_2_PROJECTION: ExportProjection = {
  document: DOC_2,
  computedValues: DOC_2_COACH,
  selectedValues: null,
  selectedAlternativeIds: {},
  snapshotMap: SNAPSHOT_MAP_2,
};

// Independent, byte-exact copy of the approved P6 Arabic labels (source:
// runs/s49-arch/f18-label-table-approved.md, SHA-256
// 972df3d75cb24bc3f9af2c8647b9d07c8db38a77964e8d05501e6d69d4648888).
// Kept separate from NUTRITION_PROMPT_LABELS so contract compliance is
// checked against an independent value, not the value under test.
const APPROVED_AR_LABELS: Record<string, string> = {
  day: 'اليوم',
  dayType: 'نوع اليوم',
  meal: 'وجبة',
  item: 'صنف',
  alternative: 'بديل',
  selected: 'اختيار العميل',
  totals: 'الإجمالي',
  mealTotals: 'إجمالي الوجبة',
  dayTotals: 'إجمالي اليوم',
  foodNotes: 'ملاحظات الأكل',
  mealNotes: 'ملاحظات الوجبة',
  documentNotes: 'ملاحظات الخطة',
  recipe: 'طريقة العمل',
  kcal: 'السعرات',
  protein: 'البروتين',
  carbs: 'الكربوهيدرات',
  fat: 'الدهون',
  sideNote: 'الأصلي من الكابتن',
};

function approvedStructuralLabels(): Record<string, string> {
  // Production stores the day label with its `{n}` format token. Compare the
  // approved literal label separately from that rendering token.
  return {
    ...NUTRITION_PROMPT_LABELS.ar,
    day: NUTRITION_PROMPT_LABELS.ar.day.replace(' {n}', ''),
  };
}

// Back-compat alias for P5 side-note label (used by Excel cells and tests).
const SIDE_NOTE_LABEL: Record<'en' | 'ar', string> = {
  en: NUTRITION_PROMPT_LABELS.en.sideNote,
  ar: NUTRITION_PROMPT_LABELS.ar.sideNote,
};

type ExportCell = {
  field: string; // data field code, never display copy
  value: string;
  /** coach-authored cells are written as text; prefixes never execute */
  isCoachText: boolean;
  /** totals section rows carry client-selection totals only */
  section: 'items' | 'notes' | 'totals';
};

const FORMULA_PREFIXES = ['=', '+', '-', '@'] as const;

function asTextCell(value: string): string {
  // Excel: a leading formula character must never evaluate; the cell is
  // written as text (contract §6). The model records the guarded rendering.
  return FORMULA_PREFIXES.some((p) => value.startsWith(p))
    ? `'${value}`
    : value;
}

function macroDisplay(exact: string, field: string): string {
  return field === 'kcal' ? displayCalories(exact) : displayMacroGrams(exact);
}

function macroTotals(values: {
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
}): string {
  return `${macroDisplay(values.kcal, 'kcal')} | ${macroDisplay(values.protein, 'protein')} | ${macroDisplay(values.carbs, 'carbs')} | ${macroDisplay(values.fat, 'fat')}`;
}

function snapshotEntry(
  projection: ExportProjection,
  foodId: string,
  foodVersion: number,
  unit: { kind: string; value?: string; unitKey?: string },
): NutritionSnapshotEntry {
  // canonical key builder: RFC 3986 encoding for serving keys (contract §4)
  const key = snapshotMapKey(
    foodId,
    foodVersion,
    unit as NutritionQuantityUnit,
  );
  const entry = projection.snapshotMap[key];
  if (!entry) throw new Error(`missing snapshot entry for ${key}`);
  return entry;
}

function entryName(entry: NutritionSnapshotEntry): string {
  // F16 allows either locale: prefer `en`, fall back to `ar`.
  const names = entry.kind === 'basis' ? entry.names : entry.snapshot.names;
  return names.en ?? names.ar ?? '';
}

/** Canonical portion line: food name, exact quantity/unit, displayed macros. */
function portionLine(
  projection: ExportProjection,
  foodId: string,
  foodVersion: number,
  quantity: {
    value: string;
    unit: { kind: string; value?: string; unitKey?: string };
  },
  values: MacroSet,
  locale: 'en' | 'ar' = 'en',
): string {
  const entry = snapshotEntry(projection, foodId, foodVersion, quantity.unit);
  const unit =
    quantity.unit.kind === 'basis'
      ? quantity.unit.value
      : quantity.unit.unitKey;
  return `${entryName(entry)} ${quantity.value} ${unit} | ${NUTRITION_PROMPT_LABELS[locale].kcal} ${macroDisplay(values.kcal, 'kcal')} | ${NUTRITION_PROMPT_LABELS[locale].protein} ${macroDisplay(values.protein, 'protein')} | ${NUTRITION_PROMPT_LABELS[locale].carbs} ${macroDisplay(values.carbs, 'carbs')} | ${NUTRITION_PROMPT_LABELS[locale].fat} ${macroDisplay(values.fat, 'fat')}`;
}

/** Coach-authored item line rendered with the item's canonical values. */
function itemDescriptor(
  projection: ExportProjection,
  item: NutritionItem,
  values: MacroSet,
  locale: 'en' | 'ar' = 'en',
): string {
  return portionLine(
    projection,
    item.foodId,
    item.foodVersion,
    item.quantity,
    values,
    locale,
  );
}

/** Coach-configured alternative line rendered with its canonical values. */
function alternativeDescriptor(
  projection: ExportProjection,
  item: NutritionItem,
  alt: NutritionAlternative,
  values: MacroSet,
  locale: 'en' | 'ar' = 'en',
): string {
  return portionLine(
    projection,
    alt.foodId,
    alt.foodVersion,
    alt.quantity,
    values,
    locale,
  );
}

/** Meals of the document in day order, whatever the structure. */
function documentMeals(document: typeof DOC): Array<{
  dayIndex: number | null;
  dayTypeId: string | null;
  meals: NutritionMeal[];
}> {
  if (document.structure === 'single_day') {
    return [
      {
        dayIndex: null,
        dayTypeId: document.implicitDayTypeId ?? null,
        meals: document.meals ?? [],
      },
    ];
  }
  return (document.days ?? [])
    .slice()
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((d) => ({
      dayIndex: d.dayIndex,
      dayTypeId: d.dayTypeId,
      meals: d.meals ?? [],
    }));
}

/** Display name of a document day type (coach-authored, either locale). */
function dayTypeName(document: typeof DOC, dayTypeId: string | null): string {
  if (dayTypeId === null) return '';
  const dayType = document.dayTypes.find((dt) => dt.id === dayTypeId);
  return dayType?.name.en ?? '';
}

/** Alternative values derived from the projection's snapshot map. */
function alternativeValuesFor(
  projection: ExportProjection,
  itemId: string,
  alternativeId: string,
): MacroSet {
  const altValues = computeAlternativeValues(
    projection.document,
    projection.snapshotMap,
  );
  const value = altValues[itemId]?.[alternativeId];
  if (!value) {
    throw new Error(
      `missing alternative values for ${itemId}/${alternativeId}`,
    );
  }
  return value;
}

/**
 * Reference renderer: one projection in, structured cells out. The client
 * selection is primary with recalculated totals; the coach original is a
 * labelled per-item side note; totals rows contain client-selection totals
 * only (S43-PO-2).
 */
function renderExcel(projection: ExportProjection): ExportCell[] {
  const cells: ExportCell[] = [];
  const document = projection.document;
  if (document.notes !== null) {
    cells.push({
      field: 'document:notes',
      value: asTextCell(document.notes),
      isCoachText: true,
      section: 'notes',
    });
  }
  for (const group of documentMeals(document)) {
    const groupDayType = dayTypeName(document, group.dayTypeId);
    if (group.dayIndex === null && groupDayType) {
      cells.push({
        field: 'day:implicit:type',
        value: asTextCell(groupDayType),
        isCoachText: true,
        section: 'items',
      });
    }
    for (const meal of group.meals) {
      cells.push({
        field: `meal:${meal.id}:name`,
        value: asTextCell(meal.name.en),
        isCoachText: true,
        section: 'items',
      });
      for (const item of meal.items) {
        const selectedId = projection.selectedAlternativeIds[item.id];
        if (selectedId && projection.selectedValues) {
          const value = projection.selectedValues.items[item.id]!;
          cells.push({
            field: `item:${item.id}:selected:${selectedId}`,
            value: `${alternativeDescriptor(
              projection,
              item,
              item.alternatives.find(
                (a: NutritionAlternative) => a.id === selectedId,
              )!,
              value,
            )} | kcal ${macroDisplay(value.kcal, 'kcal')} | protein ${macroDisplay(value.protein, 'protein')} | carbs ${macroDisplay(value.carbs, 'carbs')} | fat ${macroDisplay(value.fat, 'fat')}`,
            isCoachText: false,
            section: 'items',
          });
          // labelled coach-original side note beside the affected item
          cells.push({
            field: `item:${item.id}:coach-original`,
            value: `${SIDE_NOTE_LABEL.en}: ${itemDescriptor(projection, item, projection.computedValues.items[item.id]!)}`,
            isCoachText: true,
            section: 'items',
          });
        } else {
          cells.push({
            field: `item:${item.id}`,
            value: itemDescriptor(
              projection,
              item,
              projection.computedValues.items[item.id]!,
            ),
            isCoachText: true,
            section: 'items',
          });
        }
        // the item's unified authorized alternatives list is carried in every export
        for (const alt of item.alternatives) {
          cells.push({
            field: `item:${item.id}:alternative:${alt.id}`,
            value: alternativeDescriptor(
              projection,
              item,
              alt,
              alternativeValuesFor(projection, item.id, alt.id),
            ),
            isCoachText: true,
            section: 'items',
          });
        }
        if (item.note !== null) {
          cells.push({
            field: `item:${item.id}:food-notes`,
            value: asTextCell(item.note),
            isCoachText: true,
            section: 'notes',
          });
        }
      }
      if (meal.note !== null) {
        cells.push({
          field: `meal:${meal.id}:meal-notes`,
          value: asTextCell(meal.note),
          isCoachText: true,
          section: 'notes',
        });
      }
      if (meal.recipeUrl !== null) {
        cells.push({
          field: `meal:${meal.id}:recipe-url`,
          value: meal.recipeUrl,
          isCoachText: false,
          section: 'notes',
        });
      }
      const mealValues =
        projection.selectedValues?.meals[meal.id] ??
        projection.computedValues.meals[meal.id]!;
      cells.push({
        field: `meal:${meal.id}:total`,
        value: macroTotals(mealValues),
        isCoachText: false,
        section: 'totals',
      });
    }
    if (group.dayIndex !== null) {
      // seven_day: the day's type and its own totals row (day types never filter)
      cells.push({
        field: `day:${group.dayIndex}:type`,
        value: dayTypeName(document, group.dayTypeId),
        isCoachText: true,
        section: 'items',
      });
      const dayValues =
        projection.selectedValues?.days[String(group.dayIndex)] ??
        projection.computedValues.days[String(group.dayIndex)];
      if (dayValues) {
        cells.push({
          field: `day:${group.dayIndex}:total`,
          value: macroTotals(dayValues),
          isCoachText: false,
          section: 'totals',
        });
      }
    }
  }
  const totals =
    projection.selectedValues?.totals ?? projection.computedValues.totals;
  cells.push({
    field: 'document:total',
    value: macroTotals(totals),
    isCoachText: false,
    section: 'totals',
  });
  return cells;
}

function approvedPromptBody(locale: 'en' | 'ar'): string {
  const source = readFileSync(
    new URL(
      '../../specs/018-nutrition-planner/contracts/copy-ai-prompt.md',
      import.meta.url,
    ),
    'utf8',
  );
  const heading =
    locale === 'en'
      ? '## P3 — Nutrition plan · English'
      : '## P4 — Nutrition plan · Arabic';
  const start = source.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const segment = source.slice(start);
  const first = segment.indexOf('```');
  const second = segment.indexOf('```', first + 3);
  return segment.slice(first + 3 + 1, second - 1);
}

function promptBodyInventionRules(locale: 'en' | 'ar'): string[] {
  return approvedPromptBody(locale)
    .split('\n')
    .filter((line) => /^\s*\d+\./.test(line));
}

describe('export and prompt fidelity contract (T005)', () => {
  it('projects every meal, food, quantity, unit, macro value and alternative', () => {
    const cells = renderExcel(NO_SELECTION);
    const text = cells.map((c) => c.value).join('\n');
    expect(cells.find((c) => c.field === 'day:implicit:type')?.value).toBe(
      'Rest',
    );
    expect(text).toContain('Chicken 37 g');
    // descriptors carry the canonical PORTION values, not per-100 values
    expect(text).toContain('kcal 93 | protein 4.6 | carbs 19 | fat 4.6');
    // the item's authorized alternative list is carried (F18-FR-014)
    const altCell = cells.find(
      (c) =>
        c.field ===
        'item:33333333-3333-4333-8333-333333333331:alternative:44444444-4444-4444-8444-444444444441',
    )!;
    expect(altCell.value).toContain('Chicken 150 g');
    expect(altCell.value).toContain(
      'kcal 600 | protein 45 | carbs 15 | fat 7.5',
    );
    const mealTotal = cells.find((c) => c.field === 'meal:m-1:total')!;
    // coach totals: kcal 92.5+200 = 292.5 → 293; protein 4.5658+18 = 22.5658
    // → 23; carbs 18.5 → ≥10 g integer → 19; fat 4.5658+5 = 9.5658 → 9.6
    expect(mealTotal.value).toBe('293 | 23 | 19 | 9.6');
  });

  it('carries Meal Notes and Food Notes as separate fields (F18-FR-023)', () => {
    const cells = renderExcel(NO_SELECTION);
    const mealNotes = cells.filter((c) => c.field.endsWith(':meal-notes'));
    const foodNotes = cells.filter((c) => c.field.endsWith(':food-notes'));
    expect(mealNotes).toHaveLength(1);
    expect(foodNotes).toHaveLength(1);
    expect(mealNotes[0]!.value).toBe("'=cmd meal note");
    expect(foodNotes[0]!.value).toBe("'@cmd food note");
    // the two note fields are never merged into one entry
    const allNoteFields = cells
      .filter((c) => c.section === 'notes')
      .map((c) => c.field);
    expect(allNoteFields).toEqual([
      'item:33333333-3333-4333-8333-333333333331:food-notes',
      'meal:m-1:meal-notes',
      'meal:m-1:recipe-url',
    ]);
  });

  it('writes coach-authored formula-prefix cells as text, never evaluated', () => {
    const cells = renderExcel(NO_SELECTION);
    const coachTextCells = cells.filter((c) => c.isCoachText);
    expect(coachTextCells.length).toBeGreaterThan(0);
    for (const cell of coachTextCells) {
      // a leading =,+, - or @ is guarded as text with the byte preserved
      expect(!FORMULA_PREFIXES.some((p) => cell.value.startsWith(p))).toBe(
        true,
      );
    }
    expect(asTextCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(asTextCell(FOOD_NOTE)).toBe("'@cmd food note");
  });

  it('renders the selected alternative as primary with recalculated totals', () => {
    const cells = renderExcel(WITH_SELECTION);
    const selected = cells.find(
      (c) =>
        c.field ===
        'item:33333333-3333-4333-8333-333333333331:selected:44444444-4444-4444-8444-444444444441',
    )!;
    expect(selected.value).toContain('Chicken 150 g');
    // alternative: 30.00 per 100 g at 150 g → 45 → displayed 45
    expect(selected.value).toContain('protein 45');
    // totals rows carry the client-selection totals only:
    // kcal 600+200 = 800; protein 45+18 = 63; carbs 15; fat 7.5+5 = 12.5 → 13
    const docTotal = cells.find((c) => c.field === 'document:total')!;
    expect(docTotal.value).toBe('800 | 63 | 15 | 13');
    expect(docTotal.value).not.toContain('4.6');
    // the coach original is a labelled per-item side note, not a totals row
    const coachNote = cells.find(
      (c) =>
        c.field === 'item:33333333-3333-4333-8333-333333333331:coach-original',
    )!;
    expect(coachNote.section).toBe('items');
    expect(
      coachNote.value.startsWith(`${SIDE_NOTE_LABEL.en}: Chicken 37 g`),
    ).toBe(true);
    for (const cell of cells.filter((c) => c.section === 'totals')) {
      expect(cell.value).not.toContain(SIDE_NOTE_LABEL.en);
    }
  });

  it('shows the coach original only for items without a selection', () => {
    const cells = renderExcel(NO_SELECTION);
    expect(
      cells.some(
        (c) => c.field === 'item:33333333-3333-4333-8333-333333333331',
      ),
    ).toBe(true);
    expect(
      cells.some(
        (c) =>
          c.field ===
          'item:33333333-3333-4333-8333-333333333331:selected:44444444-4444-4444-8444-444444444441',
      ),
    ).toBe(false);
    expect(
      cells.some(
        (c) =>
          c.field ===
          'item:33333333-3333-4333-8333-333333333331:coach-original',
      ),
    ).toBe(false);
  });

  it('uses the S43-PO-2 approved side-note labels (P5)', () => {
    expect(SIDE_NOTE_LABEL.ar).toBe('الأصلي من الكابتن');
    expect(SIDE_NOTE_LABEL.en).toBe("Coach's original");
  });

  it('copies a prompt byte-identical to the approved EN body after one substitution', () => {
    const prompt = buildNutritionPrompt(NO_SELECTION, 'en');
    const body = approvedPromptBody('en');
    // the substituted payload is the only permitted difference; the expected
    // value is built by concatenation (never by repeating the replacement)
    const tokenIndex = body.indexOf('{{PLAN_CONTENT}}');
    const expected =
      body.slice(0, tokenIndex) +
      planContentText(NO_SELECTION, 'en') +
      body.slice(tokenIndex + '{{PLAN_CONTENT}}'.length);
    expect(prompt).toBe(expected);
    expect(prompt).toContain('Plan:\n');
    expect(prompt).toContain('day-type Rest');
    // the invention instruction is present and unaltered
    const rules = promptBodyInventionRules('en');
    expect(
      rules.some((r) =>
        r.includes('Do not suggest new meals, foods or alternatives'),
      ),
    ).toBe(true);
    expect(
      rules.some((r) =>
        r.includes('Do not change, round or recalculate any number'),
      ),
    ).toBe(true);
    // faithful plan content: coach item with portion values, notes, link,
    // alternative, totals
    expect(prompt).toContain(
      'item 33333333-3333-4333-8333-333333333331 Chicken 37 g | kcal 93 | protein 4.6 | carbs 19 | fat 4.6',
    );
    expect(prompt).toContain(
      'alternative 44444444-4444-4444-8444-444444444441 Chicken 150 g | kcal 600',
    );
    expect(prompt).toContain('meal m-1 totals 293 | 23 | 19 | 9.6');
    expect(prompt).toContain('meal-notes: =cmd meal note');
    expect(prompt).toContain('recipe: https://www.youtube.com/watch?v=abc');
    expect(prompt).toContain('totals 293 | 23 | 19 | 9.6');
  });

  it('copies a prompt byte-identical to the approved AR body after one substitution', () => {
    const prompt = buildNutritionPrompt(NO_SELECTION, 'ar');
    const body = approvedPromptBody('ar');
    const tokenIndex = body.indexOf('{{PLAN_CONTENT}}');
    const expected =
      body.slice(0, tokenIndex) +
      planContentText(NO_SELECTION, 'ar') +
      body.slice(tokenIndex + '{{PLAN_CONTENT}}'.length);
    expect(prompt).toBe(expected);
    expect(prompt).toContain('الخطة:\n');
    expect(prompt).toContain('لا تقترح وجبات أو أطعمة أو بدائل جديدة');
  });

  it('prompt with a selection carries the labelled coach-original note and client totals', () => {
    const en = buildNutritionPrompt(WITH_SELECTION, 'en');
    expect(en).toContain(
      'item 33333333-3333-4333-8333-333333333331 selected 44444444-4444-4444-8444-444444444441 Chicken 150 g',
    );
    expect(en).toContain(`${SIDE_NOTE_LABEL.en}: Chicken 37 g`);
    expect(en).toContain('totals 800 | 63 | 15 | 13');
    expect(en).toContain('meal m-1 totals 800 | 63 | 15 | 13');
    // the side note never appears in a totals row (§6; S43-PO-2)
    const totalsLine = en.split('\n').find((l) => l.startsWith('totals '))!;
    expect(totalsLine).not.toContain(SIDE_NOTE_LABEL.en);
    // AR locale uses the approved AR label
    const ar = buildNutritionPrompt(WITH_SELECTION, 'ar');
    expect(ar).toContain(`${SIDE_NOTE_LABEL.ar}: Chicken 37 g`);
  });

  it('renders a seven-day document with day grouping, per-day totals and document notes', () => {
    const cells = renderExcel(SEVEN_DAY_PROJECTION);
    // both meals' items resolve (the second meal is not document.meals[0])
    expect(
      cells.find(
        (c) => c.field === 'item:33333333-3333-4333-8333-333333333351',
      )!.value,
    ).toContain('Chicken 37 g | kcal 93 | protein 4.6 | carbs 19 | fat 4.6');
    expect(
      cells.find(
        (c) => c.field === 'item:33333333-3333-4333-8333-333333333352',
      )!.value,
    ).toContain('Chicken 62.5 g | kcal 156 | protein 7.7 | carbs 31 | fat 7.7');
    // per-day totals and document totals
    expect(cells.find((c) => c.field === 'day:0:total')!.value).toBe(
      '93 | 4.6 | 19 | 4.6',
    );
    expect(cells.find((c) => c.field === 'day:6:total')!.value).toBe(
      '156 | 7.7 | 31 | 7.7',
    );
    expect(cells.find((c) => c.field === 'document:total')!.value).toBe(
      '249 | 12 | 50 | 12',
    );
    // document-level notes are carried
    expect(cells.find((c) => c.field === 'document:notes')!.value).toBe(
      'Plan notes: keep $& and $$ exactly as written',
    );
  });

  it('keeps dollar sequences and document notes literal in the copied prompt', () => {
    const prompt = buildNutritionPrompt(SEVEN_DAY_PROJECTION, 'en');
    // dollar sequences in authored notes stay literal (no $& / $$ expansion)
    expect(prompt).toContain(
      'document-notes: Plan notes: keep $& and $$ exactly as written',
    );
    expect(prompt).toContain('food-notes: Food notes: keep $& and $$ literal');
    // day organization and per-day totals are in the prompt
    expect(prompt).toContain('day 0');
    expect(prompt).toContain('meal m-0 totals 93 | 4.6 | 19 | 4.6');
    expect(prompt).toContain('meal m-6 totals 156 | 7.7 | 31 | 7.7');
    expect(prompt).toContain('day 6 totals 156 | 7.7 | 31 | 7.7');
    expect(prompt).toContain('totals 249 | 12 | 50 | 12');
    // byte-equality against the approved body by concatenation
    const body = approvedPromptBody('en');
    const tokenIndex = body.indexOf('{{PLAN_CONTENT}}');
    const expected =
      body.slice(0, tokenIndex) +
      planContentText(SEVEN_DAY_PROJECTION, 'en') +
      body.slice(tokenIndex + '{{PLAN_CONTENT}}'.length);
    expect(prompt).toBe(expected);
  });

  it('resolves an RFC 3986 encoded serving key and guards formula-prefixed meal names (DOC_2)', () => {
    const cells = renderExcel(DOC_2_PROJECTION);
    // the serving key cup/large is looked up through its encoded canonical key
    const itemCell = cells.find(
      (c) => c.field === 'item:33333333-3333-4333-8333-333333333353',
    )!;
    expect(itemCell.value).toContain('Yogurt 1 cup/large');
    // portion values: 3.50 × 250 / 100 = 8.75 protein; kcal 60 × 250/100 = 150
    expect(itemCell.value).toContain(
      'kcal 150 | protein 8.8 | carbs 13 | fat 3.8',
    );
    // the formula-prefixed coach meal name is written as text
    const mealName = cells.find((c) => c.field === 'meal:m-x:name')!;
    expect(mealName.value).toBe("'=Suspicious Meal");
    expect(mealName.isCoachText).toBe(true);
    // the prompt renders the same projection faithfully
    const prompt = buildNutritionPrompt(DOC_2_PROJECTION, 'en');
    expect(prompt).toContain('meal m-x =Suspicious Meal');
    expect(prompt).toContain(
      'item 33333333-3333-4333-8333-333333333353 Yogurt 1 cup/large',
    );
  });
});

/** P6 — AR structural payload labels (S49-PO-5).
 * The AR {{PLAN_CONTENT}} payload MUST use the approved Egyptian-colloquial
 * structural labels. Each label below is asserted in every form it is emitted;
 * the body text (numbers, units, names, notes, URLs) stays verbatim.
 * Mutation evidence: changing one production label fails the approved-value
 * comparison while all EN assertions remain byte-identical. */
describe('AR structural payload labels (P6, S49-PO-5)', () => {
  it('production AR labels match the approved P6 values byte-exact', () => {
    expect(approvedStructuralLabels()).toEqual(APPROVED_AR_LABELS);
  });

  it('emits all 18 AR structural labels in NO_SELECTION', () => {
    const payload = planContentText(NO_SELECTION, 'ar');
    const lines = payload.split('\n');
    const L = NUTRITION_PROMPT_LABELS.ar;
    // NO_SELECTION is single_day: no 'day {n}' line; implicit day-type present
    expect(lines.some((l) => l.startsWith(`${L.day} `))).toBe(false);
    expect(lines.some((l) => l.startsWith(`${L.dayType} `))).toBe(true);
    expect(lines.filter((l) => l.startsWith(`${L.meal} `)).length).toBe(1);
    expect(lines.filter((l) => l.startsWith(`${L.item} `)).length).toBe(2);
    expect(lines.filter((l) => l.startsWith(`${L.alternative} `)).length).toBe(
      1,
    );
    // selected token not emitted in NO_SELECTION
    expect(lines.some((l) => l.includes(` ${L.selected} `))).toBe(false);
    expect(lines.filter((l) => l.startsWith(`${L.totals} `)).length).toBe(1);
    expect(lines.filter((l) => l.startsWith(`${L.mealTotals} `)).length).toBe(
      1,
    );
    expect(lines.filter((l) => l.startsWith(`${L.dayTotals} `)).length).toBe(0); // single_day, no day totals
    expect(lines.filter((l) => l.startsWith(`${L.foodNotes}: `)).length).toBe(
      1,
    );
    expect(lines.filter((l) => l.startsWith(`${L.mealNotes}: `)).length).toBe(
      1,
    );
    expect(
      lines.filter((l) => l.startsWith(`${L.documentNotes}: `)).length,
    ).toBe(0); // NO_SELECTION has no document notes
    expect(lines.filter((l) => l.startsWith(`${L.recipe}: `)).length).toBe(1);
    expect(lines.some((l) => l.includes(` ${L.kcal} `))).toBe(true);
    expect(lines.some((l) => l.includes(` ${L.protein} `))).toBe(true);
    expect(lines.some((l) => l.includes(` ${L.carbs} `))).toBe(true);
    expect(lines.some((l) => l.includes(` ${L.fat} `))).toBe(true);
    // side note only emitted for selected items; NO_SELECTION has none
    expect(lines.some((l) => l.startsWith(`${L.sideNote}: `))).toBe(false);
    // verbatim body text: quantities, macros, URLs, notes
    expect(payload).toContain('Chicken 37 g');
    expect(payload).toContain('Chicken 150 g');
    expect(payload).toContain('293 | 23 | 19 | 9.6');
    expect(payload).toContain('https://www.youtube.com/watch?v=abc');
    expect(payload).toContain('=cmd meal note');
    expect(payload).toContain('@cmd food note');
    // labels never appear in the approved EN form
    const tokens = [
      'day ',
      'meal ',
      'item ',
      'alternative ',
      'totals ',
      'kcal ',
      'protein ',
      'carbs ',
      'fat ',
      'day-type ',
    ];
    for (const t of tokens) {
      expect(payload.split('\n').some((l) => l.startsWith(t))).toBe(false);
    }
  });

  it('emits day/day-type labels for seven_day and document-notes', () => {
    const payload = planContentText(SEVEN_DAY_PROJECTION, 'ar');
    const L = NUTRITION_PROMPT_LABELS.ar;
    expect(payload.split('\n').some((l) => l.startsWith(`${L.day} `))).toBe(
      true,
    );
    expect(payload.split('\n').some((l) => l.startsWith(`${L.dayType} `))).toBe(
      false,
    );
    expect(
      payload.split('\n').some((l) => l.startsWith(`${L.day} 0 Training`)),
    ).toBe(true);
    expect(
      payload.split('\n').some((l) => l.startsWith(`${L.day} 6 Rest`)),
    ).toBe(true);
    expect(
      payload
        .split('\n')
        .some((l) => l.startsWith(`${L.dayTotals} 0 93 | 4.6 | 19 | 4.6`)),
    ).toBe(true);
    expect(
      payload
        .split('\n')
        .some((l) => l.startsWith(`${L.dayTotals} 6 156 | 7.7 | 31 | 7.7`)),
    ).toBe(true);
    expect(
      payload
        .split('\n')
        .some((l) =>
          l.startsWith(
            `${L.documentNotes}: Plan notes: keep $& and $$ exactly as written`,
          ),
        ),
    ).toBe(true);
    expect(
      payload
        .split('\n')
        .some((l) => l.startsWith(`${L.mealTotals} m-0 93 | 4.6 | 19 | 4.6`)),
    ).toBe(true);
    expect(
      payload
        .split('\n')
        .some((l) => l.startsWith(`${L.mealTotals} m-6 156 | 7.7 | 31 | 7.7`)),
    ).toBe(true);
  });

  it('emits the selected label with client selection', () => {
    const payload = planContentText(WITH_SELECTION, 'ar');
    const L = NUTRITION_PROMPT_LABELS.ar;
    expect(
      payload
        .split('\n')
        .some((l) =>
          l.includes(`${L.selected} 44444444-4444-4444-8444-444444444441`),
        ),
    ).toBe(true);
    expect(payload).toContain(
      `${L.item} 33333333-3333-4333-8333-333333333331 ${L.selected} 44444444-4444-4444-8444-444444444441 Chicken 150 g`,
    );
    expect(payload).toContain(`${L.totals} 800 | 63 | 15 | 13`);
    expect(payload).toContain(`${L.mealTotals} m-1 800 | 63 | 15 | 13`);
    expect(payload).toContain(`${L.sideNote}: Chicken 37 g`);
  });

  it('renders the approved AR prompt body byte-identical with the AR payload', () => {
    const expectedPayload = `نوع اليوم Rest
وجبة m-1 Breakfast
ملاحظات الوجبة: =cmd meal note
طريقة العمل: https://www.youtube.com/watch?v=abc
صنف 33333333-3333-4333-8333-333333333331 Chicken 37 g | السعرات 93 | البروتين 4.6 | الكربوهيدرات 19 | الدهون 4.6
ملاحظات الأكل: @cmd food note
بديل 44444444-4444-4444-8444-444444444441 Chicken 150 g | السعرات 600 | البروتين 45 | الكربوهيدرات 15 | الدهون 7.5
صنف 33333333-3333-4333-8333-333333333332 Fish 1 g | السعرات 200 | البروتين 18 | الكربوهيدرات 0 | الدهون 5.0
إجمالي الوجبة m-1 293 | 23 | 19 | 9.6
الإجمالي 293 | 23 | 19 | 9.6`;
    const prompt = buildNutritionPrompt(NO_SELECTION, 'ar');
    const body = approvedPromptBody('ar');
    const tokenIndex = body.indexOf('{{PLAN_CONTENT}}');
    const expected =
      body.slice(0, tokenIndex) +
      expectedPayload +
      body.slice(tokenIndex + '{{PLAN_CONTENT}}'.length);
    expect(prompt).toBe(expected);
    // each approved structural label actually emitted in NO_SELECTION is present
    const L = NUTRITION_PROMPT_LABELS.ar;
    for (const val of [
      L.dayType,
      L.meal,
      L.item,
      L.alternative,
      L.totals,
      L.mealTotals,
      L.foodNotes,
      L.mealNotes,
      L.recipe,
      L.kcal,
      L.protein,
      L.carbs,
      L.fat,
    ]) {
      expect(prompt).toContain(val);
    }
    expect(prompt).toContain(`${L.mealTotals} m-1 293 | 23 | 19 | 9.6`);
    // Arabic body unchanged (approved P4)
    expect(prompt).toContain('الخطة:\n');
    expect(prompt).toContain('لا تقترح وجبات أو أطعمة أو بدائل جديدة');
  });

  it('mutation: flipping one production AR label breaks the approved-value comparison', () => {
    // NO_SELECTION is single_day (no 'day {n}' line) -> use seven_day payload.
    const payload = planContentText(SEVEN_DAY_PROJECTION, 'ar');
    const L = NUTRITION_PROMPT_LABELS.ar as unknown as { day: string };
    expect(payload).toContain(`${L.day} 0 Training`);
    expect(approvedStructuralLabels()).toEqual(APPROVED_AR_LABELS);
    const original = L.day;
    L.day = original + 'X';
    expect(approvedStructuralLabels()).not.toEqual(APPROVED_AR_LABELS);
    L.day = original;
    expect(approvedStructuralLabels()).toEqual(APPROVED_AR_LABELS);
    // EN path untouched (production labels use NUTRITION_PROMPT_LABELS.en)
    const en = planContentText(NO_SELECTION, 'en');
    expect(en).toContain('day-type Rest');
  });
});
