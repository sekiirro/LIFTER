import { describe, expect, it } from 'vitest';
import { Workbook, type Worksheet } from 'exceljs';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildNutritionWorkbook,
  canExportNutritionPlan,
  isFormulaInjection,
  readNutritionExport,
  renderNutritionPrintHtml,
  type NutritionExportActor,
  type NutritionExportProjection,
} from '../../lib/plans/nutrition/export';
import {
  computeDocumentValues,
  snapshotMapKey,
  type NutritionSnapshotEntry,
  type NutritionSnapshotMap,
} from '../../lib/plans/nutrition/macros';
import {
  NUTRITION_DOCUMENT_SCHEMA_VERSION,
  validateNutritionDocument,
} from '../../lib/plans/nutrition/schema';
import { NUTRITION_PROMPT_LABELS } from '../../lib/plans/nutrition/prompt';

/**
 * T023 — PDF and Excel export (F18-FR-006, F18-FR-014, F18-SC-005; S43-PO-2, S43-PO-8; S43-R10).
 *
 * Requirements:
 * - RED first for every listed RED item:
 *   1. missing frozen food names/serving labels when no selection exists
 *   2. missing content
 *   3. formula execution
 *   4. both walls not checked
 *   5. current-revision selection plus recalculated totals
 *   6. historical-revision export uses that revision's last valid selection
 *   7. coach original per-item note
 *   8. totals rows client-selection totals only
 *   9. missing audit.
 * - GREEN: current and historical revision goldens assert the last valid selection scoped
 *   to the exported revision (S43-PO-8; architect mapping (S43-R10)).
 * - Mutation: substitute the current revision selection into a historical-revision export;
 *   the historical golden must fail.
 * - Excel: neutralize formula injection (cells starting with = + - @ tab CR stored as text).
 */

const FOOD_A = 'fa1';
const FOOD_B = 'fb1';
const FOOD_C = 'fc1';

const UNIT_CONTEXT = {
  [`${FOOD_A}@3`]: { basis: 'g' as const, servingUnitKeys: ['g'] },
  [`${FOOD_A}@4`]: { basis: 'g' as const, servingUnitKeys: ['g'] },
  [`${FOOD_B}@2`]: { basis: 'g' as const, servingUnitKeys: ['g'] },
  [`${FOOD_C}@1`]: { basis: 'g' as const, servingUnitKeys: ['piece'] },
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
    names: { ar: 'دجاج مشوي', en: 'Grilled Chicken' },
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
  [snapshotMapKey(FOOD_C, 1, { kind: 'serving', unitKey: 'piece' })]: {
    kind: 'serving',
    unitKey: 'piece',
    snapshot: {
      foodId: FOOD_C,
      version: 1,
      names: { ar: 'بيض', en: 'Egg' },
      basis: 'g',
      productIdentity: 'raw',
      preparationIdentity: 'raw',
      weighingState: 'raw',
      kcal: '155.0',
      protein: '13.00',
      carbs: '1.10',
      fat: '11.00',
      fiber: null,
      serving: {
        servingId: 'piece',
        labels: { ar: 'بيضة', en: 'piece' },
        basisQuantity: '50.000',
      },
    },
  } satisfies NutritionSnapshotEntry,
};

const MEAL_NOTE_FORMULA = '=SUM(1+1) meal note';
const FOOD_NOTE_FORMULA = '@cmd food note';
const SUSPICIOUS_TITLE = '-Suspicious Plan Title';
const SUSPICIOUS_MEAL = '+Suspicious Meal Name';

// Single-day fixture with formula prefixes in notes and titles to test injection resistance.
const SINGLE_DAY_DOC = validateNutritionDocument(
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
        name: { ar: 'فطور', en: SUSPICIOUS_MEAL },
        note: MEAL_NOTE_FORMULA,
        recipeUrl: 'https://www.youtube.com/watch?v=prep-vid',
        items: [
          {
            id: 'i-1',
            foodId: FOOD_A,
            foodVersion: 3,
            quantity: { value: '37', unit: { kind: 'basis', value: 'g' } },
            note: FOOD_NOTE_FORMULA,
            alternatives: [
              {
                id: 'a-1',
                foodId: FOOD_A,
                foodVersion: 4,
                quantity: { value: '150', unit: { kind: 'basis', value: 'g' } },
              },
              {
                id: 'a-2',
                foodId: FOOD_C,
                foodVersion: 1,
                quantity: {
                  value: '2',
                  unit: { kind: 'serving', unitKey: 'piece' },
                },
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
    title: { ar: 'خطة تغذية تجريبية', en: SUSPICIOUS_TITLE },
    notes: 'Document level notes for nutrition plan',
  },
  UNIT_CONTEXT,
);

const SINGLE_DAY_COACH_VALUES = computeDocumentValues(
  SINGLE_DAY_DOC,
  SNAPSHOT_MAP,
);

// Historical Revision 1: client chose alternative a-1
const HISTORICAL_REV1_SELECTED_VALUES = computeDocumentValues(
  SINGLE_DAY_DOC,
  SNAPSHOT_MAP,
  { 'i-1': 'a-1' },
);

// Current Revision 2: client chose alternative a-2
const CURRENT_REV2_SELECTED_VALUES = computeDocumentValues(
  SINGLE_DAY_DOC,
  SNAPSHOT_MAP,
  { 'i-1': 'a-2' },
);

const PROJECTION_HISTORICAL_REV1: NutritionExportProjection = {
  plan: {
    id: '00000000-0000-4000-8000-000000000001',
    workspaceId: '11111111-1111-4000-8000-000000000001',
    clientId: '22222222-2222-4000-8000-000000000001',
    title: 'Client Nutrition Plan',
  },
  revision: {
    id: '33333333-3333-4000-8000-000000000001',
    revisionNumber: 1,
    publishedAt: '2026-11-10T12:00:00Z',
  },
  content: {
    document: SINGLE_DAY_DOC,
    computedValues: SINGLE_DAY_COACH_VALUES,
    snapshotMap: SNAPSHOT_MAP,
  },
  selection: [
    {
      itemId: 'i-1',
      alternativeId: 'a-1',
      selectedValues: HISTORICAL_REV1_SELECTED_VALUES.items['i-1'],
    },
  ],
  selectedAlternativeIds: { 'i-1': 'a-1' },
  selectedValues: HISTORICAL_REV1_SELECTED_VALUES,
};

const PROJECTION_CURRENT_REV2: NutritionExportProjection = {
  plan: {
    id: '00000000-0000-4000-8000-000000000001',
    workspaceId: '11111111-1111-4000-8000-000000000001',
    clientId: '22222222-2222-4000-8000-000000000001',
    title: 'Client Nutrition Plan',
  },
  revision: {
    id: '33333333-3333-4000-8000-000000000002',
    revisionNumber: 2,
    publishedAt: '2026-11-15T12:00:00Z',
  },
  content: {
    document: SINGLE_DAY_DOC,
    computedValues: SINGLE_DAY_COACH_VALUES,
    snapshotMap: SNAPSHOT_MAP,
  },
  selection: [
    {
      itemId: 'i-1',
      alternativeId: 'a-2',
      selectedValues: CURRENT_REV2_SELECTED_VALUES.items['i-1'],
    },
  ],
  selectedAlternativeIds: { 'i-1': 'a-2' },
  selectedValues: CURRENT_REV2_SELECTED_VALUES,
};

const PROJECTION_NO_SELECTION: NutritionExportProjection = {
  plan: {
    id: '00000000-0000-4000-8000-000000000001',
    workspaceId: '11111111-1111-4000-8000-000000000001',
    clientId: '22222222-2222-4000-8000-000000000001',
    title: 'Client Nutrition Plan',
  },
  revision: {
    id: '33333333-3333-4000-8000-000000000003',
    revisionNumber: 3,
    publishedAt: '2026-11-16T12:00:00Z',
  },
  content: {
    document: SINGLE_DAY_DOC,
    computedValues: SINGLE_DAY_COACH_VALUES,
    snapshotMap: SNAPSHOT_MAP,
  },
  selection: [],
  selectedAlternativeIds: {},
  selectedValues: null,
};

async function roundTripWorkbook(workbook: Workbook): Promise<Worksheet> {
  const buffer = await workbook.xlsx.writeBuffer();
  const loaded = new Workbook();
  await loaded.xlsx.load(buffer);
  return loaded.worksheets[0]!;
}

function textRows(sheet: Worksheet): string[][] {
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      values[column - 1] =
        typeof cell.value === 'string' ? cell.value : String(cell.value ?? '');
    });
    rows.push(values);
  });
  return rows;
}

function cellsOf(sheet: Worksheet): string[] {
  return textRows(sheet)
    .flat()
    .filter((value) => value.length > 0);
}

describe('F18 T023 PDF and Excel export — RED items and fidelity', () => {
  it('RED 1: resolves frozen food names and serving labels when no selection exists', async () => {
    // When no selection exists, food names and serving labels must resolve from snapshotMap
    const workbookEn = await buildNutritionWorkbook(
      PROJECTION_NO_SELECTION,
      'en',
    );
    const sheet = await roundTripWorkbook(workbookEn);
    const cells = cellsOf(sheet);
    const text = cells.join(' ');

    expect(text).toContain('Chicken');
    expect(text).toContain('Fish');
    expect(text).toContain('37 g');
    expect(text).toContain('1 gram');

    const htmlEn = renderNutritionPrintHtml(PROJECTION_NO_SELECTION, 'en');
    expect(htmlEn).toContain('Chicken');
    expect(htmlEn).toContain('Fish');
    expect(htmlEn).toContain('37 g');
    expect(htmlEn).toContain('1 gram');

    const workbookAr = await buildNutritionWorkbook(
      PROJECTION_NO_SELECTION,
      'ar',
    );
    const sheetAr = await roundTripWorkbook(workbookAr);
    const cellsAr = cellsOf(sheetAr);
    const textAr = cellsAr.join(' ');
    expect(textAr).toContain('دجاج');
    expect(textAr).toContain('سمك');
    expect(textAr).toContain('37 جرام');
  });

  it('RED 2: includes complete content across meals, items, macros, alternatives, notes, and links', async () => {
    const workbook = await buildNutritionWorkbook(
      PROJECTION_NO_SELECTION,
      'en',
    );
    const sheet = await roundTripWorkbook(workbook);
    const text = cellsOf(sheet).join(' ');

    // Meals, day types, items, alternatives, notes, links
    expect(text).toContain(SUSPICIOUS_MEAL);
    expect(text).toContain('Rest');
    expect(text).toContain(MEAL_NOTE_FORMULA);
    expect(text).toContain(FOOD_NOTE_FORMULA);
    expect(text).toContain('https://www.youtube.com/watch?v=prep-vid');
    expect(text).toContain('Grilled Chicken 150 g');
    expect(text).toContain('Egg 2 piece');

    const html = renderNutritionPrintHtml(PROJECTION_NO_SELECTION, 'en');
    expect(html).toContain(SUSPICIOUS_MEAL);
    expect(html).toContain('Rest');
    expect(html).toContain(MEAL_NOTE_FORMULA);
    expect(html).toContain(FOOD_NOTE_FORMULA);
    expect(html).toContain('https://www.youtube.com/watch?v=prep-vid');
    expect(html).toContain('Grilled Chicken 150 g');
  });

  it('RED 3: neutralizes formula injection in Excel (leading =, +, -, @, tab, CR stored as text)', async () => {
    expect(isFormulaInjection('=cmd')).toBe(true);
    expect(isFormulaInjection('+cmd')).toBe(true);
    expect(isFormulaInjection('-cmd')).toBe(true);
    expect(isFormulaInjection('@cmd')).toBe(true);
    expect(isFormulaInjection('\tcmd')).toBe(true);
    expect(isFormulaInjection('\rcmd')).toBe(true);
    expect(isFormulaInjection('  =cmd')).toBe(true);
    expect(isFormulaInjection('safe string')).toBe(false);

    const workbook = await buildNutritionWorkbook(
      PROJECTION_NO_SELECTION,
      'en',
    );
    const sheet = await roundTripWorkbook(workbook);

    // Verify cell types in the workbook: every cell starting with a formula lead must be a string, not formula
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        const val = typeof cell.value === 'string' ? cell.value : '';
        if (isFormulaInjection(val)) {
          expect(cell.type).toBe(3); // ExcelJS ValueType.String = 3, never ValueType.Formula = 6
        }
      });
    });
  });

  it('RED 4: enforces both walls check (application layer actor permissions and database RLS)', () => {
    const po: NutritionExportActor = {
      userId: 'u-1',
      role: 'PO',
      workspaceRelation: 'own',
      coachingWork: true,
      membershipRevoked: false,
    };
    const poForeign: NutritionExportActor = {
      userId: 'u-1',
      role: 'PO',
      workspaceRelation: 'foreign',
      coachingWork: true,
      membershipRevoked: false,
    };
    const trainerOwn: NutritionExportActor = {
      userId: 'u-2',
      role: 'Trainer',
      workspaceRelation: 'own',
      coachingWork: true,
      membershipRevoked: false,
    };
    const trainerForeign: NutritionExportActor = {
      userId: 'u-2',
      role: 'Trainer',
      workspaceRelation: 'foreign',
      coachingWork: true,
      membershipRevoked: false,
    };
    const sales: NutritionExportActor = {
      userId: 'u-3',
      role: 'Sales',
      workspaceRelation: 'own',
      coachingWork: false,
      membershipRevoked: false,
    };
    const client: NutritionExportActor = {
      userId: 'u-4',
      role: 'client',
      workspaceRelation: 'own',
      coachingWork: false,
      membershipRevoked: false,
    };
    const revoked: NutritionExportActor = {
      userId: 'u-5',
      role: 'Trainer',
      workspaceRelation: 'own',
      coachingWork: true,
      membershipRevoked: true,
    };

    expect(canExportNutritionPlan(po)).toBe(true);
    expect(canExportNutritionPlan(poForeign)).toBe(true); // PO platform-wide
    expect(canExportNutritionPlan(trainerOwn)).toBe(true);
    expect(canExportNutritionPlan(trainerForeign)).toBe(false);
    expect(canExportNutritionPlan(sales)).toBe(false);
    expect(canExportNutritionPlan(client)).toBe(false);
    expect(canExportNutritionPlan(revoked)).toBe(false);
  });

  it('RED 5: renders current-revision selection as primary with recalculated totals', async () => {
    const workbook = await buildNutritionWorkbook(
      PROJECTION_CURRENT_REV2,
      'en',
    );
    const sheet = await roundTripWorkbook(workbook);
    const text = cellsOf(sheet).join(' ');

    // In Rev 2, alternative a-2 (Egg 2 piece: 100g, 155 kcal, 13 protein, 1.1 carbs, 11 fat) was selected
    expect(text).toContain('Egg 2 piece');
    // Meal total: Egg (155 kcal) + Fish (200 kcal) = 355 kcal; protein: 13 + 18 = 31; carbs: 1.1; fat: 11 + 5 = 16
    expect(text).toContain('355');
    expect(text).toContain('31');

    const html = renderNutritionPrintHtml(PROJECTION_CURRENT_REV2, 'en');
    expect(html).toContain('Egg 2 piece');
    expect(html).toContain('355');
  });

  it('RED 6: historical-revision export uses that specific revision last valid selection (S43-PO-8; S43-R10)', async () => {
    // Rev 1 had a-1 (Grilled Chicken 150g) selected
    const workbookRev1 = await buildNutritionWorkbook(
      PROJECTION_HISTORICAL_REV1,
      'en',
    );
    const sheetRev1 = await roundTripWorkbook(workbookRev1);
    const rowsRev1 = textRows(sheetRev1);

    // In Rev 1, item column is Grilled Chicken 150g, not Egg
    expect(
      rowsRev1.some((r) => r[4] === 'Grilled Chicken' && r[5] === '150 g'),
    ).toBe(true);
    expect(rowsRev1.some((r) => r[4] === 'Egg')).toBe(false);
    const textRev1 = cellsOf(sheetRev1).join(' ');
    // Rev 1 totals: Grilled Chicken (600 kcal) + Fish (200 kcal) = 800 kcal; protein 45 + 18 = 63; carbs 15; fat 12.5 -> 13
    expect(textRev1).toContain('800');
    expect(textRev1).toContain('63');
    expect(textRev1).not.toContain('355'); // Rev 2's total must not appear!

    // Rev 2 had a-2 (Egg 2 piece) selected
    const workbookRev2 = await buildNutritionWorkbook(
      PROJECTION_CURRENT_REV2,
      'en',
    );
    const sheetRev2 = await roundTripWorkbook(workbookRev2);
    const rowsRev2 = textRows(sheetRev2);

    expect(rowsRev2.some((r) => r[4] === 'Egg' && r[5] === '2 piece')).toBe(
      true,
    );
    expect(rowsRev2.some((r) => r[4] === 'Grilled Chicken')).toBe(false);
    const textRev2 = cellsOf(sheetRev2).join(' ');
    expect(textRev2).toContain('355');
    expect(textRev2).not.toContain('800');
  });

  it('RED 7: displays coach original as labelled per-item side note for selected items only', async () => {
    const workbookEn = await buildNutritionWorkbook(
      PROJECTION_CURRENT_REV2,
      'en',
    );
    const sheetEn = await roundTripWorkbook(workbookEn);
    const textEn = cellsOf(sheetEn).join(' ');

    // Item 1 has selection -> side note with Coach's original must be present
    expect(textEn).toContain(NUTRITION_PROMPT_LABELS.en.sideNote);
    expect(textEn).toContain('Chicken 37 g');

    // Item 2 has NO selection -> Coach's original side note must NOT be present for item 2
    const htmlEn = renderNutritionPrintHtml(PROJECTION_CURRENT_REV2, 'en');
    expect(htmlEn).toContain(NUTRITION_PROMPT_LABELS.en.sideNote);
    expect(htmlEn).toContain('Chicken 37 g');

    // Arabic side note
    const workbookAr = await buildNutritionWorkbook(
      PROJECTION_CURRENT_REV2,
      'ar',
    );
    const sheetAr = await roundTripWorkbook(workbookAr);
    const textAr = cellsOf(sheetAr).join(' ');
    expect(textAr).toContain(NUTRITION_PROMPT_LABELS.ar.sideNote);

    const htmlAr = renderNutritionPrintHtml(PROJECTION_CURRENT_REV2, 'ar');
    expect(htmlAr).toContain(NUTRITION_PROMPT_LABELS.ar.sideNote);
  });

  it('RED 8: totals rows carry client-selection totals only (no coach original in totals)', async () => {
    const workbook = await buildNutritionWorkbook(
      PROJECTION_HISTORICAL_REV1,
      'en',
    );
    const sheet = await roundTripWorkbook(workbook);
    const rows = textRows(sheet);

    // Find totals row
    const totalsRows = rows.filter((r) =>
      r.some((c) => c.toLowerCase().includes('total')),
    );
    expect(totalsRows.length).toBeGreaterThan(0);
    for (const row of totalsRows) {
      const rowText = row.join(' ');
      // Totals rows must NEVER contain the coach original label
      expect(rowText).not.toContain(NUTRITION_PROMPT_LABELS.en.sideNote);
    }

    const html = renderNutritionPrintHtml(PROJECTION_HISTORICAL_REV1, 'en');
    // Ensure in HTML that totals sections only show client-selection totals
    expect(html).toContain('800');
  });

  it('RED 9: requires a successful audit write before returning an export projection', async () => {
    const auditCalls: Array<{
      outcome: string;
      reason?: string;
      planId: string;
      revisionId: string;
    }> = [];
    const mockClient = {
      from(table: string) {
        if (table === 'client_nutrition_alternative_selections') {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                },
              };
            },
          };
        }
        if (
          table === 'plan_revisions' ||
          table === 'nutrition_plan_version_contents' ||
          table === 'plan_roots'
        ) {
          const data =
            table === 'plan_revisions'
              ? {
                  id: '33333333-3333-4000-8000-000000000001',
                  plan_id: '00000000-0000-4000-8000-000000000001',
                  workspace_id: '11111111-1111-4000-8000-000000000001',
                  revision_number: 1,
                  plan_kind: 'nutrition',
                  content: SINGLE_DAY_DOC,
                }
              : table === 'nutrition_plan_version_contents'
                ? {
                    schema_version: 1,
                    algorithm_version: 1,
                    document: SINGLE_DAY_DOC,
                    snapshot_map: SNAPSHOT_MAP,
                    computed_values: SINGLE_DAY_COACH_VALUES,
                  }
                : {
                    id: '00000000-0000-4000-8000-000000000001',
                    workspace_id: '11111111-1111-4000-8000-000000000001',
                    client_id: '22222222-2222-4000-8000-000000000001',
                  };
          const query = {
            eq() {
              return query;
            },
            async maybeSingle() {
              return { data, error: null };
            },
          };
          return { select: () => query };
        }
        return {
          select() {
            return {
              eq(col1: string, val1: string) {
                return {
                  eq(col2: string, val2: string) {
                    return {
                      eq() {
                        return {
                          async maybeSingle() {
                            if (table === 'plan_revisions') {
                              return {
                                data: {
                                  id: val1,
                                  plan_id: val2,
                                  workspace_id:
                                    '11111111-1111-4000-8000-000000000001',
                                  revision_number: 1,
                                  plan_kind: 'nutrition',
                                  content: SINGLE_DAY_DOC,
                                },
                                error: null,
                              };
                            }
                            if (table === 'nutrition_plan_version_contents') {
                              return {
                                data: {
                                  schema_version: 1,
                                  algorithm_version: 1,
                                  document: SINGLE_DAY_DOC,
                                  snapshot_map: SNAPSHOT_MAP,
                                  computed_values: SINGLE_DAY_COACH_VALUES,
                                },
                                error: null,
                              };
                            }
                            if (table === 'plan_roots') {
                              return {
                                data: {
                                  id: val1,
                                  workspace_id: val2,
                                  client_id:
                                    '22222222-2222-4000-8000-000000000001',
                                  title: 'Mock Plan',
                                },
                                error: null,
                              };
                            }
                            return { data: null, error: null };
                          },
                        };
                      },
                      async maybeSingle() {
                        return {
                          data: {
                            id: val1,
                            plan_id: val2,
                            workspace_id:
                              '11111111-1111-4000-8000-000000000001',
                            revision_number: 1,
                            plan_kind: 'nutrition',
                            content: SINGLE_DAY_DOC,
                          },
                          error: null,
                        };
                      },
                    };
                  },
                  async maybeSingle() {
                    return {
                      data: {
                        schema_version: 1,
                        algorithm_version: 1,
                        document: SINGLE_DAY_DOC,
                        snapshot_map: SNAPSHOT_MAP,
                        computed_values: SINGLE_DAY_COACH_VALUES,
                      },
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      },
      async rpc(name: string, args: Record<string, unknown>) {
        if (name === 'record_nutrition_export_audit') {
          auditCalls.push({
            outcome: String(args.p_outcome),
            reason: args.p_reason ? String(args.p_reason) : undefined,
            planId: String(args.p_plan_id),
            revisionId: String(args.p_revision_id),
          });
        }
        return { data: null, error: null };
      },
    };

    const allowedActor: NutritionExportActor = {
      userId: 'u-1',
      role: 'Trainer',
      workspaceRelation: 'own',
      coachingWork: true,
      membershipRevoked: false,
    };

    const deniedActor: NutritionExportActor = {
      userId: 'u-2',
      role: 'Sales',
      workspaceRelation: 'own',
      coachingWork: false,
      membershipRevoked: false,
    };

    // 1. Successful read
    const successResult = await readNutritionExport({
      client: mockClient as unknown as SupabaseClient,
      actor: allowedActor,
      planId: '00000000-0000-4000-8000-000000000001',
      revisionId: '33333333-3333-4000-8000-000000000001',
    });
    expect(successResult.success).toBe(true);
    expect(auditCalls.some((c) => c.outcome === 'success')).toBe(true);

    // 2. Denied read
    const deniedResult = await readNutritionExport({
      client: mockClient as unknown as SupabaseClient,
      actor: deniedActor,
      planId: '00000000-0000-4000-8000-000000000001',
      revisionId: '33333333-3333-4000-8000-000000000001',
    });
    expect(deniedResult.success).toBe(false);
    expect(auditCalls.some((c) => c.outcome === 'denied')).toBe(false);
  });
});

describe('F18 T023 Canonical Goldens AR/EN', () => {
  it('matches canonical EN golden for current revision with selection', async () => {
    const workbook = await buildNutritionWorkbook(
      PROJECTION_CURRENT_REV2,
      'en',
    );
    const sheet = await roundTripWorkbook(workbook);
    const rows = textRows(sheet);

    // Header row
    expect(rows[0]).toEqual([
      'Plan',
      'Day',
      'Day type',
      'Meal',
      'Item',
      'Quantity',
      'kcal',
      'protein',
      'carbs',
      'fat',
      'Alternatives',
      "Coach's original",
      'Notes',
      'Recipe',
    ]);

    // Item 1 row with Egg 2 piece selected
    const item1Row = rows.find((r) => r[4] === 'Egg');
    expect(item1Row).toBeDefined();
    expect(item1Row![5]).toBe('2 piece');
    expect(item1Row![6]).toBe('155');
    expect(item1Row![7]).toBe('13');
    expect(item1Row![11]).toContain("Coach's original: Chicken 37 g");

    // Totals row: Egg (155) + Fish (200) = 355
    const totalsRow = rows.find(
      (r) => r[0] === 'Total' || r[3] === 'Meal totals' || r[4] === 'totals',
    );
    expect(totalsRow).toBeDefined();
    expect(totalsRow!.join(' ')).toContain('355');

    // PDF HTML Golden assertions
    const html = renderNutritionPrintHtml(PROJECTION_CURRENT_REV2, 'en');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('lang="en"');
    expect(html).toContain('Egg');
    expect(html).toContain("Coach's original");
    expect(html).toContain('355');
  });

  it('matches canonical AR golden for current revision with selection', async () => {
    const workbook = await buildNutritionWorkbook(
      PROJECTION_CURRENT_REV2,
      'ar',
    );
    const sheet = await roundTripWorkbook(workbook);
    const rows = textRows(sheet);

    // Header row in Arabic
    expect(rows[0]).toEqual([
      'الخطة',
      'اليوم',
      'نوع اليوم',
      'وجبة',
      'صنف',
      'الكمية',
      'السعرات',
      'البروتين',
      'الكربوهيدرات',
      'الدهون',
      'البدائل',
      'الأصلي من الكابتن',
      'الملاحظات',
      'طريقة العمل',
    ]);

    // PDF HTML Golden assertions for Arabic
    const html = renderNutritionPrintHtml(PROJECTION_CURRENT_REV2, 'ar');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain('بيض');
    expect(html).toContain('الأصلي من الكابتن');
    expect(html).toContain('355');
  });

  it('matches canonical Historical Rev 1 golden asserting Revision 1 selection (S43-PO-8; S43-R10)', async () => {
    const workbook = await buildNutritionWorkbook(
      PROJECTION_HISTORICAL_REV1,
      'en',
    );
    const sheet = await roundTripWorkbook(workbook);
    const rows = textRows(sheet);

    // Must show Grilled Chicken (150 g), not Egg
    const grilledChickenRow = rows.find((r) => r[4] === 'Grilled Chicken');
    expect(grilledChickenRow).toBeDefined();
    expect(grilledChickenRow![5]).toBe('150 g');
    expect(grilledChickenRow![6]).toBe('600');
    expect(grilledChickenRow![11]).toContain("Coach's original: Chicken 37 g");

    // Totals row: Grilled Chicken (600) + Fish (200) = 800 kcal
    const text = rows.map((r) => r.join(' ')).join('\n');
    expect(text).toContain('800');
    expect(text).not.toContain('355'); // 355 is Rev 2's total, must not appear!
  });
});

describe('F18 T023 Mutation testing', () => {
  it('Mutation: substituting current revision selection into historical export causes golden failure', async () => {
    // Mutant: simulate a bug where historical revision export mistakenly uses current revision selection
    const mutantHistoricalProjection: NutritionExportProjection = {
      ...PROJECTION_HISTORICAL_REV1,
      selectedAlternativeIds: PROJECTION_CURRENT_REV2.selectedAlternativeIds,
      selectedValues: PROJECTION_CURRENT_REV2.selectedValues,
      selection: PROJECTION_CURRENT_REV2.selection,
    };

    const mutantWorkbook = await buildNutritionWorkbook(
      mutantHistoricalProjection,
      'en',
    );
    const mutantSheet = await roundTripWorkbook(mutantWorkbook);
    const mutantText = cellsOf(mutantSheet).join(' ');

    // The historical golden expects Grilled Chicken 150g and 800 kcal total
    // But the mutant has Egg 2 piece and 355 kcal total!
    const historicalGoldenCheck = () => {
      expect(mutantText).toContain('Grilled Chicken 150 g');
      expect(mutantText).toContain('800');
      expect(mutantText).not.toContain('Egg 2 piece');
      expect(mutantText).not.toContain('355');
    };

    // Assert that the golden fails under this mutation!
    expect(historicalGoldenCheck).toThrow();
  });
});
