import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeDocumentValues,
  type NutritionSnapshotMap,
} from '../../lib/plans/nutrition/macros';
import {
  NUTRITION_DOCUMENT_SCHEMA_VERSION,
  validateNutritionDocument,
} from '../../lib/plans/nutrition/schema';
import {
  buildNutritionPrompt,
  canCopyNutritionPrompt,
  copyNutritionPrompt,
  NUTRITION_PROMPT_AR,
  NUTRITION_PROMPT_EN,
  NUTRITION_PROMPT_LABELS,
  PLAN_CONTENT_TOKEN,
  planContentText,
  type NutritionPromptActor,
  type NutritionPromptProjection,
} from '../../lib/plans/nutrition/prompt';

/**
 * T024 — Copy AI Prompt (F18-FR-015, F18-SC-005; S43-PO-5, S43-PO-2,
 * S49-PO-5/S49-R12).
 *
 * The prompt body is the PO-approved EN/AR template in
 * `specs/018-nutrition-planner/contracts/copy-ai-prompt.md` (P3/P4) copied
 * byte-exact; only the single `{{PLAN_CONTENT}}` token is substituted. The
 * payload carries every meal/day, food, quantity/unit, macro value, note,
 * recipe link and coach alternative; nothing is invented, adjusted or
 * replaced. With a client selection the selected content is primary with a
 * labelled per-item coach-original side note and totals rows carry the
 * client-selection totals only. Only staff with export permission copy it.
 *
 * Mutation: adding an instruction such as "improve quantities" to the body
 * breaks the byte-equality assertions below.
 */

const FOOD_A = 'fa1';
const FOOD_B = 'fb1';

const UNIT_CONTEXT = {
  [`${FOOD_A}@3`]: { basis: 'g' as const, servingUnitKeys: ['g'] },
  [`${FOOD_A}@4`]: { basis: 'g' as const, servingUnitKeys: ['g'] },
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
  },
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
  },
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
  },
};

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
        note: '=cmd meal note',
        recipeUrl: 'https://www.youtube.com/watch?v=abc',
        items: [
          {
            id: 'i-1',
            foodId: FOOD_A,
            foodVersion: 3,
            quantity: { value: '37', unit: { kind: 'basis', value: 'g' } },
            note: '@cmd food note',
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

const NO_SELECTION: NutritionPromptProjection = {
  document: DOC,
  computedValues: COACH_VALUES,
  selectedValues: null,
  selectedAlternativeIds: {},
  snapshotMap: SNAPSHOT_MAP,
};

const WITH_SELECTION: NutritionPromptProjection = {
  document: DOC,
  computedValues: COACH_VALUES,
  selectedValues: SELECTED_VALUES,
  selectedAlternativeIds: { 'i-1': 'a-1' },
  snapshotMap: SNAPSHOT_MAP,
};

const ACTOR: NutritionPromptActor = {
  role: 'Trainer',
  workspaceRelation: 'own',
  coachingWork: true,
  membershipRevoked: false,
};

/** Extract the approved fenced body of P3/P4 from the in-repo contract. */
function approvedBody(locale: 'en' | 'ar'): string {
  const contract = readFileSync(
    join(
      process.cwd(),
      'specs',
      '018-nutrition-planner',
      'contracts',
      'copy-ai-prompt.md',
    ),
    'utf8',
  );
  const heading =
    locale === 'en'
      ? '## P3 — Nutrition plan · English'
      : '## P4 — Nutrition plan · Arabic';
  const start = contract.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const segment = contract.slice(start);
  const first = segment.indexOf('```');
  const second = segment.indexOf('```', first + 3);
  return segment.slice(first + 3 + 1, second - 1);
}

function substitute(body: string, payload: string): string {
  const at = body.indexOf(PLAN_CONTENT_TOKEN);
  return (
    body.slice(0, at) + payload + body.slice(at + PLAN_CONTENT_TOKEN.length)
  );
}

// Expected payload: the coach plan verbatim, one line per field.
const PAYLOAD_EN = [
  'day-type Rest',
  'meal m-1 Breakfast',
  'meal-notes: =cmd meal note',
  'recipe: https://www.youtube.com/watch?v=abc',
  'item i-1 Chicken 37 g | kcal 93 | protein 4.6 | carbs 19 | fat 4.6',
  'food-notes: @cmd food note',
  'alternative a-1 Chicken 150 g | kcal 600 | protein 45 | carbs 15 | fat 7.5',
  'item i-2 Fish 1 g | kcal 200 | protein 18 | carbs 0 | fat 5.0',
  'meal m-1 totals 293 | 23 | 19 | 9.6',
  'totals 293 | 23 | 19 | 9.6',
].join('\n');

const PAYLOAD_AR = [
  'نوع اليوم Rest',
  'وجبة m-1 Breakfast',
  'ملاحظات الوجبة: =cmd meal note',
  'طريقة العمل: https://www.youtube.com/watch?v=abc',
  'صنف i-1 Chicken 37 g | السعرات 93 | البروتين 4.6 | الكربوهيدرات 19 | الدهون 4.6',
  'ملاحظات الأكل: @cmd food note',
  'بديل a-1 Chicken 150 g | السعرات 600 | البروتين 45 | الكربوهيدرات 15 | الدهون 7.5',
  'صنف i-2 Fish 1 g | السعرات 200 | البروتين 18 | الكربوهيدرات 0 | الدهون 5.0',
  'إجمالي الوجبة m-1 293 | 23 | 19 | 9.6',
  'الإجمالي 293 | 23 | 19 | 9.6',
].join('\n');

const PAYLOAD_SELECTED_EN = [
  'day-type Rest',
  'meal m-1 Breakfast',
  'meal-notes: =cmd meal note',
  'recipe: https://www.youtube.com/watch?v=abc',
  'item i-1 selected a-1 Chicken 150 g | kcal 600 | protein 45 | carbs 15 | fat 7.5',
  "Coach's original: Chicken 37 g | kcal 93 | protein 4.6 | carbs 19 | fat 4.6",
  'food-notes: @cmd food note',
  'alternative a-1 Chicken 150 g | kcal 600 | protein 45 | carbs 15 | fat 7.5',
  'item i-2 Fish 1 g | kcal 200 | protein 18 | carbs 0 | fat 5.0',
  'meal m-1 totals 800 | 63 | 15 | 13',
  'totals 800 | 63 | 15 | 13',
].join('\n');

describe('F18 Copy AI Prompt (T024; FR-015, SC-005)', () => {
  it('keeps the approved EN/AR bodies byte-identical to the locale contract', () => {
    expect(NUTRITION_PROMPT_EN).toBe(approvedBody('en'));
    expect(NUTRITION_PROMPT_AR).toBe(approvedBody('ar'));
    for (const body of [NUTRITION_PROMPT_EN, NUTRITION_PROMPT_AR]) {
      expect(body.split(PLAN_CONTENT_TOKEN).length).toBe(2);
      expect(body.indexOf(PLAN_CONTENT_TOKEN)).toBe(
        body.lastIndexOf(PLAN_CONTENT_TOKEN),
      );
    }
    // the approved prohibitions are present verbatim in both locales
    expect(NUTRITION_PROMPT_EN).toContain(
      'Do not change, round or recalculate any number.',
    );
    expect(NUTRITION_PROMPT_EN).toContain(
      'Do not suggest new meals, foods or alternatives.',
    );
    expect(NUTRITION_PROMPT_AR).toContain(
      'لا تقترح وجبات أو أطعمة أو بدائل جديدة.',
    );
  });

  it('substitutes only the plan-content token', () => {
    expect(buildNutritionPrompt(NO_SELECTION, 'en')).toBe(
      substitute(approvedBody('en'), planContentText(NO_SELECTION, 'en')),
    );
    expect(buildNutritionPrompt(NO_SELECTION, 'ar')).toBe(
      substitute(approvedBody('ar'), planContentText(NO_SELECTION, 'ar')),
    );
    // dollar sequences in authored text stay literal
    const literal = planContentText(NO_SELECTION, 'en');
    const prompt = buildNutritionPrompt(NO_SELECTION, 'en');
    expect(prompt).toBe(substitute(approvedBody('en'), literal));
    expect(prompt).toContain('meal-notes: =cmd meal note');
  });

  it('copies every meal, food, quantity, unit, macro, note, alternative and link exactly', () => {
    expect(planContentText(NO_SELECTION, 'en')).toBe(PAYLOAD_EN);
    const lines = planContentText(NO_SELECTION, 'en').split('\n');
    // no invented or dropped meals/items/alternatives
    expect(
      lines.filter((l) => l.startsWith('meal ') && !l.includes(' totals ')),
    ).toEqual(['meal m-1 Breakfast']);
    expect(lines.filter((l) => l.startsWith('item '))).toEqual([
      'item i-1 Chicken 37 g | kcal 93 | protein 4.6 | carbs 19 | fat 4.6',
      'item i-2 Fish 1 g | kcal 200 | protein 18 | carbs 0 | fat 5.0',
    ]);
    expect(lines.filter((l) => l.startsWith('alternative '))).toEqual([
      'alternative a-1 Chicken 150 g | kcal 600 | protein 45 | carbs 15 | fat 7.5',
    ]);
    // quantities and units are the coach's exact strings
    expect(planContentText(NO_SELECTION, 'en')).toContain('Chicken 37 g');
    expect(planContentText(NO_SELECTION, 'en')).toContain('Fish 1 g');
    // notes and the recipe link are present
    expect(planContentText(NO_SELECTION, 'en')).toContain(
      'meal-notes: =cmd meal note',
    );
    expect(planContentText(NO_SELECTION, 'en')).toContain(
      'food-notes: @cmd food note',
    );
    expect(planContentText(NO_SELECTION, 'en')).toContain(
      'recipe: https://www.youtube.com/watch?v=abc',
    );
  });

  it('renders the AR payload with the approved AR structural labels', () => {
    expect(planContentText(NO_SELECTION, 'ar')).toBe(PAYLOAD_AR);
    expect(NUTRITION_PROMPT_LABELS.ar.sideNote).toBe('الأصلي من الكابتن');
    expect(NUTRITION_PROMPT_LABELS.en.sideNote).toBe("Coach's original");
    const ar = buildNutritionPrompt(NO_SELECTION, 'ar');
    expect(ar).toBe(substitute(approvedBody('ar'), PAYLOAD_AR));
    // the body is P4 Arabic, not the English template
    expect(ar).toContain('الخطة:\n');
    expect(ar).not.toContain('Plan:\n');
  });

  it('shows the client selection as primary with a labelled coach-original side note', () => {
    expect(planContentText(WITH_SELECTION, 'en')).toBe(PAYLOAD_SELECTED_EN);
    const payload = planContentText(WITH_SELECTION, 'en');
    // the coach original is a per-item side note, never a totals row
    const totalsLines = payload
      .split('\n')
      .filter((l) => l.includes('totals '));
    expect(totalsLines).toEqual([
      'meal m-1 totals 800 | 63 | 15 | 13',
      'totals 800 | 63 | 15 | 13',
    ]);
    for (const line of totalsLines) {
      expect(line).not.toContain(NUTRITION_PROMPT_LABELS.en.sideNote);
    }
    // AR uses the approved side-note label
    expect(planContentText(WITH_SELECTION, 'ar')).toContain(
      `${NUTRITION_PROMPT_LABELS.ar.sideNote}: Chicken 37 g`,
    );
  });

  it('allows only staff with export permission and denies before content', () => {
    const allowed: NutritionPromptActor[] = [
      ACTOR,
      { ...ACTOR, role: 'PO' },
      { ...ACTOR, role: 'WO' },
    ];
    for (const actor of allowed) {
      expect(canCopyNutritionPrompt(actor)).toBe(true);
      const result = copyNutritionPrompt({
        actor,
        locale: 'en',
        projection: NO_SELECTION,
      });
      expect(result.allowed).toBe(true);
    }
    const denied: NutritionPromptActor[] = [
      { ...ACTOR, role: 'Sales' },
      { ...ACTOR, role: 'client' },
      { ...ACTOR, role: 'unaffiliated' },
      { ...ACTOR, workspaceRelation: 'foreign' },
      { ...ACTOR, role: 'PO', workspaceRelation: 'foreign' },
      { ...ACTOR, coachingWork: false },
      { ...ACTOR, membershipRevoked: true },
    ];
    for (const actor of denied) {
      expect(canCopyNutritionPrompt(actor)).toBe(false);
      const result = copyNutritionPrompt({
        actor,
        locale: 'ar',
        projection: WITH_SELECTION,
      });
      expect(result).toEqual({ allowed: false, code: 'denied' });
      expect('prompt' in result).toBe(false);
    }
  });
});
