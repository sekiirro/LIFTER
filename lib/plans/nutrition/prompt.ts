// F18 Copy AI Prompt (T024; F18-FR-015, F18-SC-005; S43-PO-5, S43-PO-2,
// S49-PO-5/S49-R12).
//
// The prompt bodies are the PO-approved EN/AR templates in
// `specs/018-nutrition-planner/contracts/copy-ai-prompt.md` (P3/P4, source
// `runs/s43-po/copy-ai-prompt-approved.md`) copied byte-exact; the copied
// prompt substitutes only the single {{PLAN_CONTENT}} token. The payload is a
// faithful text rendering of the authorized export projection: every meal,
// food, quantity/unit, macro value, note, recipe link and coach alternative as
// written, the client selection as primary with a labelled per-item
// coach-original side note, and totals rows carrying client-selection totals
// only (S43-PO-2). Only staff with export permission may copy it (F18-FR-015).

import {
  computeAlternativeValues,
  displayCalories,
  displayMacroGrams,
  snapshotMapKey,
  type ComputedValues,
  type MacroSet,
  type NutritionSnapshotEntry,
  type NutritionSnapshotMap,
} from './macros';
import type {
  NutritionAlternative,
  NutritionDocumentV1,
  NutritionItem,
  NutritionMeal,
  NutritionQuantity,
} from './types';

export const PLAN_CONTENT_TOKEN = '{{PLAN_CONTENT}}';

/** Approved P3 body (byte-exact; copy from the locale contract, never retype). */
export const NUTRITION_PROMPT_EN: string =
  "You are formatting a nutrition plan. Turn the plan below into a clean, easy-to-follow document for the client.\n\nRules:\n1. Keep every day, meal, food, quantity, unit, calorie value, macro value, note, alternative and recipe or preparation link exactly as written. Do not add, remove, replace or reorder anything.\n2. Do not change, round or recalculate any number. Use the totals exactly as provided.\n3. Do not suggest new meals, foods or alternatives.\n4. Where the client chose an approved alternative, show the client's choice as the main item and show the coach's original item next to it as a note labeled \"Coach's original\". Do not show the coach's original in any totals row.\n5. Make each recipe or preparation link clickable. If an item has no link, show it as plain text.\n6. Keep the coach's notes word for word.\n7. Write the headings and labels in English.\n8. If something is unclear, leave it as written instead of guessing.\n\nPlan:\n{{PLAN_CONTENT}}";

/** Approved P4 body (byte-exact; copy from the locale contract, never retype). */
export const NUTRITION_PROMPT_AR: string =
  'أنت تقوم بتنسيق خطة تغذية. حوّل الخطة التالية إلى مستند واضح وسهل المتابعة للمتدرب.\n\nالقواعد:\n1. احتفظ بكل يوم ووجبة وصنف طعام وكمية ووحدة وقيمة سعرات وقيمة مغذيات وملاحظة وبديل ورابط وصفة أو تحضير كما هو مكتوب تمامًا. لا تُضِف أي شيء ولا تحذفه ولا تستبدله ولا تغيّر ترتيبه.\n2. لا تغيّر أي رقم ولا تقرّبه ولا تُعِد حسابه. استخدم المجاميع كما هي مكتوبة تمامًا.\n3. لا تقترح وجبات أو أطعمة أو بدائل جديدة.\n4. إذا اختار المتدرب بديلًا معتمدًا، فاعرض اختياره كعنصر رئيسي، واعرض العنصر الأصلي الذي حدده الكابتن بجانبه كملاحظة بعنوان "الأصلي من الكابتن". لا تعرض العنصر الأصلي للمدرب في أي صف من صفوف المجاميع.\n5. اجعل كل رابط وصفة أو تحضير قابلًا للنقر. إذا لم يكن للعنصر رابط، فاعرضه كنص عادي.\n6. انقل ملاحظات الكابتن حرفيًا.\n7. اكتب العناوين والتسميات باللغة العربية.\n8. إذا كان هناك شيء غير واضح، فاتركه كما هو مكتوب ولا تخمّن.\n\nالخطة:\n{{PLAN_CONTENT}}';

export type NutritionPromptLocale = 'en' | 'ar';

/**
 * Approved payload labels: P5 side-note labels (`Coach's original` /
 * `الأصلي من الكابتن`) and the S49-PO-5 P6 structural labels. EN values keep
 * the pre-existing payload tokens so the EN payload stays byte-identical; the
 * P6 "meal … totals"/"day … totals" rows are emitted as
 * `meal {id} totals {totals}` in EN (see planContentText).
 */
export const NUTRITION_PROMPT_LABELS = {
  en: {
    day: 'day {n}',
    dayType: 'day-type',
    meal: 'meal',
    item: 'item',
    alternative: 'alternative',
    selected: 'selected',
    totals: 'totals',
    mealTotals: 'meal',
    dayTotals: 'day',
    foodNotes: 'food-notes',
    mealNotes: 'meal-notes',
    documentNotes: 'document-notes',
    recipe: 'recipe',
    kcal: 'kcal',
    protein: 'protein',
    carbs: 'carbs',
    fat: 'fat',
    sideNote: "Coach's original",
  },
  ar: {
    day: 'اليوم {n}',
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
  },
} as const;

/**
 * Authorized export projection (contract nutrition-api.md section 6): one
 * reader result feeds every export surface. Renderers resolve names, units and
 * values from this projection only and never re-read tables.
 */
export type NutritionPromptProjection = {
  document: NutritionDocumentV1;
  computedValues: ComputedValues;
  /** Client-selection values for the exported revision; null without one. */
  selectedValues: ComputedValues | null;
  selectedAlternativeIds: Record<string, string>;
  snapshotMap: NutritionSnapshotMap;
};

/** Export-authorized actor (staff export permissions; F18-FR-015). */
export type NutritionPromptActor = {
  role: 'PO' | 'WO' | 'Trainer' | 'Sales' | 'client' | 'unaffiliated';
  /** 'own' = acting inside the plan workspace; 'foreign' otherwise. */
  workspaceRelation: 'own' | 'foreign';
  /** Current `coaching_work` authorization in the plan's workspace. */
  coachingWork: boolean;
  /** Workspace membership revoked (or PO authority revoked). */
  membershipRevoked: boolean;
};

const EXPORT_ROLES: ReadonlySet<NutritionPromptActor['role']> = new Set([
  'PO',
  'WO',
  'Trainer',
]);

/**
 * Staff roles already authorized to export may copy the prompt; cross-workspace
 * reads are denied for every role (F18-FR-017) and denials are generic.
 */
export function canCopyNutritionPrompt(actor: NutritionPromptActor): boolean {
  if (actor.membershipRevoked) return false;
  if (actor.workspaceRelation !== 'own') return false;
  if (!EXPORT_ROLES.has(actor.role)) return false;
  return actor.coachingWork;
}

function macroDisplay(exact: string, field: keyof MacroSet): string {
  return field === 'kcal' ? displayCalories(exact) : displayMacroGrams(exact);
}

function macroTotals(values: MacroSet): string {
  return (
    `${macroDisplay(values.kcal, 'kcal')} | ${macroDisplay(values.protein, 'protein')} | ` +
    `${macroDisplay(values.carbs, 'carbs')} | ${macroDisplay(values.fat, 'fat')}`
  );
}

function snapshotEntry(
  projection: NutritionPromptProjection,
  foodId: string,
  foodVersion: number,
  unit: NutritionQuantity['unit'],
): NutritionSnapshotEntry {
  const key = snapshotMapKey(foodId, foodVersion, unit);
  const entry = projection.snapshotMap[key];
  if (!entry) throw new Error(`missing snapshot entry for ${key}`);
  return entry;
}

/** F16 allows either locale: prefer `en`, fall back to `ar`. */
function entryName(entry: NutritionSnapshotEntry): string {
  const names = entry.kind === 'basis' ? entry.names : entry.snapshot.names;
  return names.en ?? names.ar ?? '';
}

/** One portion line: frozen food name, exact quantity/unit, displayed macros. */
function portionLine(
  projection: NutritionPromptProjection,
  foodId: string,
  foodVersion: number,
  quantity: NutritionQuantity,
  values: MacroSet,
  locale: NutritionPromptLocale,
): string {
  const L = NUTRITION_PROMPT_LABELS[locale];
  const entry = snapshotEntry(projection, foodId, foodVersion, quantity.unit);
  const unit =
    quantity.unit.kind === 'basis'
      ? quantity.unit.value
      : quantity.unit.unitKey;
  return (
    `${entryName(entry)} ${quantity.value} ${unit} | ${L.kcal} ${macroDisplay(values.kcal, 'kcal')} | ` +
    `${L.protein} ${macroDisplay(values.protein, 'protein')} | ${L.carbs} ${macroDisplay(values.carbs, 'carbs')} | ${L.fat} ${macroDisplay(values.fat, 'fat')}`
  );
}

function itemLine(
  projection: NutritionPromptProjection,
  item: NutritionItem,
  values: MacroSet,
  locale: NutritionPromptLocale,
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

function alternativeLine(
  projection: NutritionPromptProjection,
  alternative: NutritionAlternative,
  values: MacroSet,
  locale: NutritionPromptLocale,
): string {
  return portionLine(
    projection,
    alternative.foodId,
    alternative.foodVersion,
    alternative.quantity,
    values,
    locale,
  );
}

/** Every meal in day order, whatever the structure (day type never filters). */
function documentMealGroups(document: NutritionDocumentV1): Array<{
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
    .map((day) => ({
      dayIndex: day.dayIndex,
      dayTypeId: day.dayTypeId,
      meals: day.meals ?? [],
    }));
}

function dayTypeName(
  document: NutritionDocumentV1,
  dayTypeId: string | null,
): string {
  if (dayTypeId === null) return '';
  const dayType = document.dayTypes.find((dt) => dt.id === dayTypeId);
  return dayType?.name.en ?? '';
}

/**
 * Render the `{{PLAN_CONTENT}}` payload for one locale: full authorized plan
 * text, client selection primary, coach original as a labelled per-item side
 * note, and client-selection totals only in totals rows.
 */
export function planContentText(
  projection: NutritionPromptProjection,
  locale: NutritionPromptLocale = 'en',
): string {
  const L = NUTRITION_PROMPT_LABELS[locale];
  const document = projection.document;
  const alternativeValues = computeAlternativeValues(
    document,
    projection.snapshotMap,
  );
  const lines: string[] = [];
  if (document.notes !== null)
    lines.push(`${L.documentNotes}: ${document.notes}`);
  for (const group of documentMealGroups(document)) {
    const groupDayType = dayTypeName(document, group.dayTypeId);
    if (group.dayIndex === null && groupDayType) {
      lines.push(`${L.dayType} ${groupDayType}`);
    }
    if (group.dayIndex !== null) {
      lines.push(`${L.day} ${group.dayIndex} ${groupDayType}`.trimEnd());
    }
    for (const meal of group.meals) {
      lines.push(`${L.meal} ${meal.id} ${meal.name.en}`);
      if (meal.note !== null) lines.push(`${L.mealNotes}: ${meal.note}`);
      if (meal.recipeUrl !== null) {
        lines.push(`${L.recipe}: ${meal.recipeUrl}`);
      }
      for (const item of meal.items) {
        const selectedId = projection.selectedAlternativeIds[item.id];
        if (selectedId && projection.selectedValues) {
          const alternative = item.alternatives.find(
            (a) => a.id === selectedId,
          );
          if (!alternative) {
            throw new Error(
              `alternative ${selectedId} is not in item ${item.id}'s approved list`,
            );
          }
          const selectedValues = projection.selectedValues.items[item.id]!;
          lines.push(
            `${L.item} ${item.id} ${L.selected} ${selectedId} ` +
              alternativeLine(projection, alternative, selectedValues, locale),
          );
          lines.push(
            `${L.sideNote}: ${itemLine(projection, item, projection.computedValues.items[item.id]!, locale)}`,
          );
        } else {
          lines.push(
            `${L.item} ${item.id} ${itemLine(projection, item, projection.computedValues.items[item.id]!, locale)}`,
          );
        }
        if (item.note !== null) lines.push(`${L.foodNotes}: ${item.note}`);
        for (const alternative of item.alternatives) {
          const values = alternativeValues[item.id]?.[alternative.id];
          if (!values) {
            throw new Error(
              `missing alternative values for ${item.id}/${alternative.id}`,
            );
          }
          lines.push(
            `${L.alternative} ${alternative.id} ${alternativeLine(projection, alternative, values, locale)}`,
          );
        }
      }
      const mealValues =
        projection.selectedValues?.meals[meal.id] ??
        projection.computedValues.meals[meal.id]!;
      lines.push(
        locale === 'en'
          ? `${L.mealTotals} ${meal.id} totals ${macroTotals(mealValues)}`
          : `${L.mealTotals} ${meal.id} ${macroTotals(mealValues)}`,
      );
    }
    if (group.dayIndex !== null) {
      const dayValues =
        projection.selectedValues?.days[String(group.dayIndex)] ??
        projection.computedValues.days[String(group.dayIndex)];
      if (dayValues) {
        lines.push(
          locale === 'en'
            ? `${L.dayTotals} ${group.dayIndex} totals ${macroTotals(dayValues)}`
            : `${L.dayTotals} ${group.dayIndex} ${macroTotals(dayValues)}`,
        );
      }
    }
  }
  const totals =
    projection.selectedValues?.totals ?? projection.computedValues.totals;
  lines.push(`${L.totals} ${macroTotals(totals)}`);
  return lines.join('\n');
}

/** Approved locale body with only the single `{{PLAN_CONTENT}}` token substituted. */
export function buildNutritionPrompt(
  projection: NutritionPromptProjection,
  locale: NutritionPromptLocale,
): string {
  const template = locale === 'en' ? NUTRITION_PROMPT_EN : NUTRITION_PROMPT_AR;
  // split/join keeps dollar sequences in the payload literal
  return template
    .split(PLAN_CONTENT_TOKEN)
    .join(planContentText(projection, locale));
}

export type CopyNutritionPromptResult =
  { allowed: true; prompt: string } | { allowed: false; code: 'denied' };

/**
 * Authorized copy: an actor without staff export permission gets the generic
 * denial and no content (F18-FR-017; audit is added with the export RPC).
 */
export function copyNutritionPrompt(input: {
  actor: NutritionPromptActor;
  locale: NutritionPromptLocale;
  projection: NutritionPromptProjection;
}): CopyNutritionPromptResult {
  if (!canCopyNutritionPrompt(input.actor)) {
    return { allowed: false, code: 'denied' };
  }
  return {
    allowed: true,
    prompt: buildNutritionPrompt(input.projection, input.locale),
  };
}
