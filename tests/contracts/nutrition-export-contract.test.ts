import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  computeDocumentValues,
  displayCalories,
  displayMacroGrams,
  type NutritionSnapshotEntry,
  type NutritionSnapshotMap,
} from '../../lib/plans/nutrition/macros';
import {
  NUTRITION_DOCUMENT_SCHEMA_VERSION,
  validateNutritionDocument,
} from '../../lib/plans/nutrition/schema';

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
            id: 'i-1',
            foodId: FOOD_A,
            foodVersion: 3,
            quantity: { value: '37', unit: { kind: 'basis', value: 'g' } },
            note: FOOD_NOTE,
            alternatives: [
              {
                id: 'a-1',
                foodId: FOOD_A,
                foodVersion: 4,
                quantity: { value: '150', unit: { kind: 'basis', value: 'g' } },
              },
            ],
          },
          {
            id: 'i-2',
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
  'i-1': 'a-1',
});

type ExportProjection = {
  document: typeof DOC;
  computedValues: typeof COACH_VALUES;
  selectedValues: typeof SELECTED_VALUES | null;
  selectedAlternativeIds: Record<string, string>;
};

const NO_SELECTION: ExportProjection = {
  document: DOC,
  computedValues: COACH_VALUES,
  selectedValues: null,
  selectedAlternativeIds: {},
};

const WITH_SELECTION: ExportProjection = {
  document: DOC,
  computedValues: COACH_VALUES,
  selectedValues: SELECTED_VALUES,
  selectedAlternativeIds: { 'i-1': 'a-1' },
};

// S43-PO-2 approved per-item side-note labels (contract P5).
const SIDE_NOTE_LABEL: Record<'en' | 'ar', string> = {
  en: "Coach's original",
  ar: 'الأصلي من الكابتن',
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
  foodId: string,
  foodVersion: number,
  unit: { kind: string; value?: string; unitKey?: string },
): NutritionSnapshotEntry {
  const key =
    unit.kind === 'basis'
      ? `food:${foodId}@${foodVersion}#basis:${unit.value ?? ''}`
      : `food:${foodId}@${foodVersion}#serving:${unit.unitKey ?? ''}`;
  const entry = SNAPSHOT_MAP[key];
  if (!entry) throw new Error(`missing snapshot entry for ${key}`);
  return entry;
}

function entryName(entry: NutritionSnapshotEntry): string {
  return entry.kind === 'basis' ? entry.names.en : entry.snapshot.names.en;
}

function entryPer100(entry: NutritionSnapshotEntry): {
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
} {
  return entry.kind === 'basis'
    ? {
        kcal: entry.per100.kcal,
        protein: entry.per100.protein,
        carbs: entry.per100.carbs,
        fat: entry.per100.fat,
      }
    : {
        kcal: entry.snapshot.kcal,
        protein: entry.snapshot.protein,
        carbs: entry.snapshot.carbs,
        fat: entry.snapshot.fat,
      };
}

function itemDescriptor(document: typeof DOC, itemId: string): string {
  const meal = document.meals![0]!;
  const item = meal.items.find((i) => i.id === itemId)!;
  const entry = snapshotEntry(
    item.foodId,
    item.foodVersion,
    item.quantity.unit as { kind: string; value?: string; unitKey?: string },
  );
  const unit =
    item.quantity.unit.kind === 'basis'
      ? item.quantity.unit.value
      : item.quantity.unit.unitKey;
  const values = entryPer100(entry);
  return `${entryName(entry)} ${item.quantity.value} ${unit} | kcal ${values.kcal} | protein ${values.protein} | carbs ${values.carbs} | fat ${values.fat}`;
}

function alternativeDescriptor(
  document: typeof DOC,
  itemId: string,
  alternativeId: string,
): string {
  const meal = document.meals![0]!;
  const item = meal.items.find((i) => i.id === itemId)!;
  const alt = item.alternatives.find((a) => a.id === alternativeId)!;
  const entry = snapshotEntry(
    alt.foodId,
    alt.foodVersion,
    alt.quantity.unit as { kind: string; value?: string; unitKey?: string },
  );
  const unit =
    alt.quantity.unit.kind === 'basis'
      ? alt.quantity.unit.value
      : alt.quantity.unit.unitKey;
  const values = entryPer100(entry);
  return `${entryName(entry)} ${alt.quantity.value} ${unit} | kcal ${values.kcal} | protein ${values.protein} | carbs ${values.carbs} | fat ${values.fat}`;
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
  for (const meal of document.meals ?? []) {
    cells.push({
      field: `meal:${meal.id}:name`,
      value: meal.name.en,
      isCoachText: true,
      section: 'items',
    });
    for (const item of meal.items) {
      const selectedId = projection.selectedAlternativeIds[item.id];
      if (selectedId && projection.selectedValues) {
        const value = projection.selectedValues.items[item.id]!;
        cells.push({
          field: `item:${item.id}:selected:${selectedId}`,
          value: `${alternativeDescriptor(document, item.id, selectedId)} | kcal ${macroDisplay(value.kcal, 'kcal')} | protein ${macroDisplay(value.protein, 'protein')} | carbs ${macroDisplay(value.carbs, 'carbs')} | fat ${macroDisplay(value.fat, 'fat')}`,
          isCoachText: false,
          section: 'items',
        });
        // labelled coach-original side note beside the affected item
        cells.push({
          field: `item:${item.id}:coach-original`,
          value: `${SIDE_NOTE_LABEL.en}: ${itemDescriptor(document, item.id)}`,
          isCoachText: true,
          section: 'items',
        });
      } else {
        cells.push({
          field: `item:${item.id}`,
          value: itemDescriptor(document, item.id),
          isCoachText: true,
          section: 'items',
        });
      }
      // the item's unified authorized alternatives list is carried in every export
      for (const alt of item.alternatives) {
        cells.push({
          field: `item:${item.id}:alternative:${alt.id}`,
          value: alternativeDescriptor(document, item.id, alt.id),
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

function planContentText(
  projection: ExportProjection,
  locale: 'en' | 'ar',
): string {
  // the {{PLAN_CONTENT}} payload: every meal, food, quantity/unit, macro
  // value, alternative, note and recipe/preparation link, faithfully
  const lines: string[] = [];
  const document = projection.document;
  for (const meal of document.meals ?? []) {
    lines.push(`meal ${meal.id} ${meal.name.en}`);
    if (meal.note !== null) lines.push(`meal-notes: ${meal.note}`);
    if (meal.recipeUrl !== null) lines.push(`recipe: ${meal.recipeUrl}`);
    for (const item of meal.items) {
      const selectedId = projection.selectedAlternativeIds[item.id];
      if (selectedId && projection.selectedValues) {
        const value = projection.selectedValues.items[item.id]!;
        lines.push(
          `item ${item.id} selected ${selectedId} ${alternativeDescriptor(document, item.id, selectedId)} | kcal ${macroDisplay(value.kcal, 'kcal')} | protein ${macroDisplay(value.protein, 'protein')} | carbs ${macroDisplay(value.carbs, 'carbs')} | fat ${macroDisplay(value.fat, 'fat')}`,
        );
        lines.push(
          `${SIDE_NOTE_LABEL[locale]}: ${itemDescriptor(document, item.id)}`,
        );
      } else {
        lines.push(`item ${item.id} ${itemDescriptor(document, item.id)}`);
      }
      if (item.note !== null) lines.push(`food-notes: ${item.note}`);
      for (const alt of item.alternatives) {
        lines.push(
          `alternative ${alt.id} ${alternativeDescriptor(document, item.id, alt.id)}`,
        );
      }
    }
  }
  const totals =
    projection.selectedValues?.totals ?? projection.computedValues.totals;
  lines.push(`totals ${macroTotals(totals)}`);
  return lines.join('\n');
}

function renderPrompt(
  projection: ExportProjection,
  locale: 'en' | 'ar',
): string {
  // S43-PO-5: the approved body is byte-exact; substitute {{PLAN_CONTENT}} only
  return approvedPromptBody(locale).replace(
    '{{PLAN_CONTENT}}',
    planContentText(projection, locale),
  );
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
    expect(text).toContain('Chicken 37 g');
    expect(text).toContain('kcal 250.0');
    expect(text).toContain('protein 12.34');
    // the item's authorized alternative list is carried (F18-FR-014)
    const altCell = cells.find((c) => c.field === 'item:i-1:alternative:a-1')!;
    expect(altCell.value).toContain('Chicken 150 g');
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
      'item:i-1:food-notes',
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
    const selected = cells.find((c) => c.field === 'item:i-1:selected:a-1')!;
    expect(selected.value).toContain('Chicken 150 g');
    // alternative: 30.00 per 100 g at 150 g → 45 → displayed 45
    expect(selected.value).toContain('protein 45');
    // totals rows carry the client-selection totals only:
    // kcal 600+200 = 800; protein 45+18 = 63; carbs 15; fat 7.5+5 = 12.5 → 13
    const docTotal = cells.find((c) => c.field === 'document:total')!;
    expect(docTotal.value).toBe('800 | 63 | 15 | 13');
    expect(docTotal.value).not.toContain('4.6');
    // the coach original is a labelled per-item side note, not a totals row
    const coachNote = cells.find((c) => c.field === 'item:i-1:coach-original')!;
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
    expect(cells.some((c) => c.field === 'item:i-1')).toBe(true);
    expect(cells.some((c) => c.field === 'item:i-1:selected:a-1')).toBe(false);
    expect(cells.some((c) => c.field === 'item:i-1:coach-original')).toBe(
      false,
    );
  });

  it('uses the S43-PO-2 approved side-note labels (P5)', () => {
    expect(SIDE_NOTE_LABEL.ar).toBe('الأصلي من الكابتن');
    expect(SIDE_NOTE_LABEL.en).toBe("Coach's original");
  });

  it('copies a prompt byte-identical to the approved EN body after one substitution', () => {
    const prompt = renderPrompt(NO_SELECTION, 'en');
    const body = approvedPromptBody('en');
    // the substituted payload is the only permitted difference
    const expected = body.replace(
      '{{PLAN_CONTENT}}',
      planContentText(NO_SELECTION, 'en'),
    );
    expect(prompt).toBe(expected);
    expect(prompt).toContain('Plan:\n');
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
    // faithful plan content: coach item, notes, link, alternative, totals
    expect(prompt).toContain('item i-1 Chicken 37 g | kcal 250.0');
    expect(prompt).toContain('alternative a-1 Chicken 150 g');
    expect(prompt).toContain('meal-notes: =cmd meal note');
    expect(prompt).toContain('recipe: https://www.youtube.com/watch?v=abc');
    expect(prompt).toContain('totals 293 | 23 | 19 | 9.6');
  });

  it('copies a prompt byte-identical to the approved AR body after one substitution', () => {
    const prompt = renderPrompt(NO_SELECTION, 'ar');
    const expected = approvedPromptBody('ar').replace(
      '{{PLAN_CONTENT}}',
      planContentText(NO_SELECTION, 'ar'),
    );
    expect(prompt).toBe(expected);
    expect(prompt).toContain('الخطة:\n');
    expect(prompt).toContain('لا تقترح وجبات أو أطعمة أو بدائل جديدة');
  });

  it('prompt with a selection carries the labelled coach-original note and client totals', () => {
    const en = renderPrompt(WITH_SELECTION, 'en');
    expect(en).toContain('item i-1 selected a-1 Chicken 150 g');
    expect(en).toContain(`${SIDE_NOTE_LABEL.en}: Chicken 37 g`);
    expect(en).toContain('totals 800 | 63 | 15 | 13');
    // the side note never appears in a totals row (§6; S43-PO-2)
    const totalsLine = en.split('\n').find((l) => l.startsWith('totals '))!;
    expect(totalsLine).not.toContain(SIDE_NOTE_LABEL.en);
    // AR locale uses the approved AR label
    const ar = renderPrompt(WITH_SELECTION, 'ar');
    expect(ar).toContain(`${SIDE_NOTE_LABEL.ar}: Chicken 37 g`);
  });
});
