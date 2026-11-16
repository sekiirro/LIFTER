// F18 PDF and Excel export (T023; F18-FR-006, F18-FR-014, F18-SC-005; S43-PO-2, S43-PO-8; S43-R10).
//
// Generates authorized PDF print HTML and ExcelJS workbooks for published nutrition
// revisions. Neutralizes spreadsheet formula injection, renders client-selected
// alternatives as primary with recalculated totals, preserves coach-original as a
// labelled per-item side note, restricts totals rows to client-selection totals only,
// ensures historical exports use the requested revision's last valid selection, and
// logs export audit events.

import { Workbook, type Cell, type Worksheet } from 'exceljs';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeDocumentValues,
  displayCalories,
  displayMacroGrams,
  snapshotMapKey,
  type ComputedValues,
  type MacroSet,
  type NutritionSnapshotEntry,
  type NutritionSnapshotMap,
} from './macros';
import { NUTRITION_PROMPT_LABELS, type NutritionPromptLocale } from './prompt';
import type {
  NutritionDocumentV1,
  NutritionMeal,
  NutritionQuantity,
} from './types';

export type NutritionExportActor = {
  userId: string;
  role: 'PO' | 'WO' | 'Trainer' | 'Sales' | 'client' | 'unaffiliated';
  workspaceRelation: 'own' | 'foreign';
  coachingWork: boolean;
  membershipRevoked: boolean;
};

export type NutritionExportProjection = {
  plan: {
    id: string;
    workspaceId: string;
    clientId: string | null;
    title: string | null;
    dates?: unknown;
  };
  revision: {
    id: string;
    revisionNumber: number;
    publishedAt?: string | null;
  };
  content: {
    document: NutritionDocumentV1;
    computedValues: ComputedValues;
    snapshotMap: NutritionSnapshotMap;
  };
  selection: Array<{
    itemId: string;
    alternativeId: string;
    selectedValues?: MacroSet;
  }>;
  selectedAlternativeIds: Record<string, string>;
  selectedValues: ComputedValues | null;
};

// Application-wall authorization check (contract §2).
export function canExportNutritionPlan(actor: NutritionExportActor): boolean {
  if (actor.membershipRevoked) return false;
  if (actor.role === 'PO') return true;
  if (actor.workspaceRelation !== 'own') return false;
  if (actor.role !== 'WO' && actor.role !== 'Trainer') return false;
  return actor.coachingWork;
}

// Neutralize formula injection: cells starting with =, +, -, @, tab, or CR
// (even after leading whitespace) are stored as text.
const FORMULA_LEAD = /^[\s\u0000-\u0020\u200B]*[=+\-@\t\r]/;

export function isFormulaInjection(value: string): boolean {
  return FORMULA_LEAD.test(value);
}

export function writeSafeCell(cell: Cell, value: unknown): void {
  const text = typeof value === 'string' ? value : String(value ?? '');
  cell.value = text;
  cell.numFmt = '@';
  cell.alignment = { vertical: 'top', wrapText: true };
  if (isFormulaInjection(text)) {
    (cell as unknown as { quotePrefix: boolean }).quotePrefix = true;
  }
}

function writeSafeRow(sheet: Worksheet, values: unknown[]): void {
  const row = sheet.addRow([]);
  values.forEach((value, index) => {
    writeSafeCell(row.getCell(index + 1), value);
  });
}

function snapshotEntry(
  snapshotMap: NutritionSnapshotMap,
  foodId: string,
  foodVersion: number,
  unit: NutritionQuantity['unit'],
): NutritionSnapshotEntry {
  const key = snapshotMapKey(foodId, foodVersion, unit);
  const entry = snapshotMap[key];
  if (!entry) {
    throw new Error(`missing snapshot entry for ${key}`);
  }
  return entry;
}

function foodDisplayName(
  entry: NutritionSnapshotEntry,
  locale: NutritionPromptLocale,
): string {
  const names = entry.kind === 'basis' ? entry.names : entry.snapshot.names;
  if (locale === 'ar') {
    return names.ar ?? names.en ?? '';
  }
  return names.en ?? names.ar ?? '';
}

function servingDisplayUnit(
  entry: NutritionSnapshotEntry,
  quantity: NutritionQuantity,
  locale: NutritionPromptLocale,
): string {
  if (entry.kind === 'basis') {
    const basisVal = quantity.unit.kind === 'basis' ? quantity.unit.value : 'g';
    if (locale === 'ar') {
      return basisVal === 'g' ? 'جرام' : 'مل';
    }
    return basisVal;
  }
  const labels = entry.snapshot.serving.labels;
  if (locale === 'ar') {
    return labels.ar ?? labels.en ?? entry.unitKey;
  }
  return labels.en ?? labels.ar ?? entry.unitKey;
}

async function recordAudit(
  client: SupabaseClient,
  workspaceId: string,
  planId: string,
  revisionId: string,
  outcome: string,
  reason?: string,
): Promise<void> {
  if (typeof client?.rpc !== 'function') {
    throw new Error('Nutrition export audit failed');
  }
  try {
    const { error } = await client.rpc('record_nutrition_export_audit', {
      p_workspace_id: workspaceId,
      p_plan_id: planId,
      p_revision_id: revisionId,
      p_outcome: outcome,
      p_reason: reason ?? null,
    });
    if (error) throw new Error('Nutrition export audit failed');
  } catch {
    throw new Error('Nutrition export audit failed');
  }
}

export type ReadNutritionExportResult =
  | { success: true; projection: NutritionExportProjection }
  | {
      success: false;
      reason: 'not_permitted' | 'not_found' | 'foreign_workspace';
    };

export async function readNutritionExport(params: {
  client: SupabaseClient;
  actor: NutritionExportActor;
  planId: string;
  revisionId: string;
}): Promise<ReadNutritionExportResult> {
  const { client, actor, planId, revisionId } = params;

  // 1. Application-wall authorization check
  if (!canExportNutritionPlan(actor)) {
    return { success: false, reason: 'not_permitted' };
  }

  // 2. Database RLS read: fetch published revision
  const { data: revision, error: revError } = await client
    .from('plan_revisions')
    .select(
      'id, workspace_id, plan_id, revision_number, plan_kind, content, published_at',
    )
    .eq('id', revisionId)
    .eq('plan_id', planId)
    .eq('plan_kind', 'nutrition')
    .maybeSingle();

  if (revError || !revision) {
    return { success: false, reason: 'not_found' };
  }

  const workspaceId = revision.workspace_id;

  // 3. Database RLS read: fetch revision content
  const { data: content, error: contentError } = await client
    .from('nutrition_plan_version_contents')
    .select(
      'schema_version, algorithm_version, document, snapshot_map, computed_values',
    )
    .eq('revision_id', revisionId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (
    contentError ||
    !content?.document ||
    !content.snapshot_map ||
    !content.computed_values
  ) {
    await recordAudit(
      client,
      workspaceId,
      planId,
      revisionId,
      'denied',
      'not_found',
    );
    return { success: false, reason: 'not_found' };
  }

  // 4. Database RLS read: fetch plan root metadata
  const { data: plan, error: planError } = await client
    .from('plan_roots')
    .select('id, workspace_id, client_id')
    .eq('id', planId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (planError || !plan) {
    await recordAudit(
      client,
      workspaceId,
      planId,
      revisionId,
      'denied',
      'not_found',
    );
    return { success: false, reason: 'not_found' };
  }

  // 5. Database RLS read: fetch revision-scoped client alternative selections (S43-PO-8; S43-R10)
  const { data: selectionRows, error: selectionError } = await client
    .from('client_nutrition_alternative_selections')
    .select('item_id, alternative_id')
    .eq('plan_version_id', revisionId)
    .eq('workspace_id', workspaceId);

  if (selectionError || !selectionRows) {
    await recordAudit(
      client,
      workspaceId,
      planId,
      revisionId,
      'denied',
      'not_found',
    );
    return { success: false, reason: 'not_found' };
  }

  const selectedAlternativeIds: Record<string, string> = {};
  for (const row of selectionRows ?? []) {
    selectedAlternativeIds[row.item_id] = row.alternative_id;
  }

  const document = content.document as NutritionDocumentV1;
  const snapshotMap = content.snapshot_map as NutritionSnapshotMap;
  const computedValues = content.computed_values as ComputedValues;

  const hasSelections = Object.keys(selectedAlternativeIds).length > 0;
  const selectedValues = hasSelections
    ? computeDocumentValues(document, snapshotMap, selectedAlternativeIds)
    : null;

  const selection = Object.entries(selectedAlternativeIds).map(
    ([itemId, alternativeId]) => ({
      itemId,
      alternativeId,
      selectedValues: selectedValues?.items[itemId],
    }),
  );

  // 6. Record success audit
  await recordAudit(client, workspaceId, planId, revisionId, 'success');

  const docTitle = document?.title
    ? (document.title.en ?? document.title.ar ?? null)
    : null;

  return {
    success: true,
    projection: {
      plan: {
        id: planId,
        workspaceId,
        clientId: plan.client_id,
        title: docTitle,
      },
      revision: {
        id: revisionId,
        revisionNumber: revision.revision_number,
        publishedAt: revision.published_at ?? null,
      },
      content: {
        document,
        computedValues,
        snapshotMap,
      },
      selection,
      selectedAlternativeIds,
      selectedValues,
    },
  };
}

export const EXCEL_COLUMNS = {
  en: [
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
  ],
  ar: [
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
  ],
} as const;

export async function buildNutritionWorkbook(
  projection: NutritionExportProjection,
  locale: NutritionPromptLocale,
): Promise<Workbook> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(
    locale === 'ar' ? 'خطة التغذية' : 'Nutrition Plan',
    {
      views: [{ rightToLeft: locale === 'ar' }],
    },
  );

  const columns = EXCEL_COLUMNS[locale];
  writeSafeRow(sheet, [...columns]);

  const doc = projection.content.document;
  const snapshotMap = projection.content.snapshotMap;
  const computedValues = projection.content.computedValues;
  const selectedValues = projection.selectedValues;
  const selectedIds = projection.selectedAlternativeIds;
  const L = NUTRITION_PROMPT_LABELS[locale];
  const sideNoteLabel = L.sideNote;

  const planTitle = doc.title
    ? ((locale === 'ar'
        ? (doc.title.ar ?? doc.title.en)
        : (doc.title.en ?? doc.title.ar)) ?? '')
    : '';

  // Document notes row if present
  if (doc.notes) {
    writeSafeRow(sheet, [
      planTitle,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      `${L.documentNotes}: ${doc.notes}`,
      '',
    ]);
  }

  // Iterate days
  const dayGroups: Array<{
    dayLabel: string;
    dayTypeLabel: string;
    dayKey: string;
    meals: NutritionMeal[];
  }> = [];

  if (doc.structure === 'single_day') {
    const dt = doc.dayTypes.find((d) => d.id === doc.implicitDayTypeId);
    const dayTypeLabel = dt
      ? locale === 'ar'
        ? (dt.name.ar ?? dt.name.en)
        : (dt.name.en ?? dt.name.ar)
      : '';
    dayGroups.push({
      dayLabel: '',
      dayTypeLabel,
      dayKey: '0',
      meals: doc.meals ?? [],
    });
  } else {
    for (const day of (doc.days ?? [])
      .slice()
      .sort((a, b) => a.dayIndex - b.dayIndex)) {
      const dt = doc.dayTypes.find((d) => d.id === day.dayTypeId);
      const dayTypeLabel = dt
        ? locale === 'ar'
          ? (dt.name.ar ?? dt.name.en)
          : (dt.name.en ?? dt.name.ar)
        : '';
      const dayLabel = L.day.replace('{n}', String(day.dayIndex));
      dayGroups.push({
        dayLabel,
        dayTypeLabel,
        dayKey: String(day.dayIndex),
        meals: day.meals ?? [],
      });
    }
  }

  for (const group of dayGroups) {
    for (const meal of group.meals) {
      const mealName =
        locale === 'ar'
          ? (meal.name.ar ?? meal.name.en)
          : (meal.name.en ?? meal.name.ar);

      for (const item of meal.items) {
        const selectedAltId = selectedIds[item.id];
        let displayFoodName = '';
        let displayQuantity = '';
        let kcalVal = '';
        let proteinVal = '';
        let carbsVal = '';
        let fatVal = '';
        let coachSideNote = '';

        const coachEntry = snapshotEntry(
          snapshotMap,
          item.foodId,
          item.foodVersion,
          item.quantity.unit,
        );
        const coachName = foodDisplayName(coachEntry, locale);
        const coachUnit = servingDisplayUnit(coachEntry, item.quantity, locale);
        const coachMacros = computedValues.items[item.id] ?? {
          kcal: '0',
          protein: '0',
          carbs: '0',
          fat: '0',
        };

        if (selectedAltId && selectedValues?.items[item.id]) {
          // Client alternative selected: selected item is primary
          const alt = item.alternatives.find((a) => a.id === selectedAltId);
          if (alt) {
            const altEntry = snapshotEntry(
              snapshotMap,
              alt.foodId,
              alt.foodVersion,
              alt.quantity.unit,
            );
            displayFoodName = foodDisplayName(altEntry, locale);
            displayQuantity = `${alt.quantity.value} ${servingDisplayUnit(altEntry, alt.quantity, locale)}`;
            const sVal = selectedValues.items[item.id]!;
            kcalVal = displayCalories(sVal.kcal);
            proteinVal = displayMacroGrams(sVal.protein);
            carbsVal = displayMacroGrams(sVal.carbs);
            fatVal = displayMacroGrams(sVal.fat);

            // Coach original appears as labelled per-item side note
            coachSideNote = `${sideNoteLabel}: ${coachName} ${item.quantity.value} ${coachUnit} | ${L.kcal} ${displayCalories(coachMacros.kcal)} | ${L.protein} ${displayMacroGrams(coachMacros.protein)} | ${L.carbs} ${displayMacroGrams(coachMacros.carbs)} | ${L.fat} ${displayMacroGrams(coachMacros.fat)}`;
          }
        } else {
          // No selection: coach original is primary, NO side note
          displayFoodName = coachName;
          displayQuantity = `${item.quantity.value} ${coachUnit}`;
          kcalVal = displayCalories(coachMacros.kcal);
          proteinVal = displayMacroGrams(coachMacros.protein);
          carbsVal = displayMacroGrams(coachMacros.carbs);
          fatVal = displayMacroGrams(coachMacros.fat);
          coachSideNote = '';
        }

        // Alternatives string
        const altsText = item.alternatives
          .map((alt) => {
            const aEntry = snapshotEntry(
              snapshotMap,
              alt.foodId,
              alt.foodVersion,
              alt.quantity.unit,
            );
            const aName = foodDisplayName(aEntry, locale);
            const aUnit = servingDisplayUnit(aEntry, alt.quantity, locale);
            return `${aName} ${alt.quantity.value} ${aUnit}`;
          })
          .join('\n');

        // Combined notes for the row (preserving distinct Meal Notes and Food Notes labels)
        const notesParts: string[] = [];
        if (meal.note) {
          notesParts.push(`${L.mealNotes}: ${meal.note}`);
        }
        if (item.note) {
          notesParts.push(`${L.foodNotes}: ${item.note}`);
        }
        const notesText = notesParts.join('\n');

        writeSafeRow(sheet, [
          planTitle,
          group.dayLabel,
          group.dayTypeLabel,
          mealName,
          displayFoodName,
          displayQuantity,
          kcalVal,
          proteinVal,
          carbsVal,
          fatVal,
          altsText,
          coachSideNote,
          notesText,
          meal.recipeUrl ?? '',
        ]);
      }

      // Meal totals row (client-selection totals only; NO coach original side note!)
      const mealMacros = selectedValues?.meals[meal.id] ??
        computedValues.meals[meal.id] ?? {
          kcal: '0',
          protein: '0',
          carbs: '0',
          fat: '0',
        };
      writeSafeRow(sheet, [
        planTitle,
        group.dayLabel,
        group.dayTypeLabel,
        mealName,
        L.totals,
        '',
        displayCalories(mealMacros.kcal),
        displayMacroGrams(mealMacros.protein),
        displayMacroGrams(mealMacros.carbs),
        displayMacroGrams(mealMacros.fat),
        '',
        '', // Empty side note in totals rows!
        '',
        '',
      ]);
    }

    // Day totals row (for seven_day structure)
    if (doc.structure === 'seven_day') {
      const dayMacros =
        selectedValues?.days[group.dayKey] ?? computedValues.days[group.dayKey];
      if (dayMacros) {
        writeSafeRow(sheet, [
          planTitle,
          group.dayLabel,
          group.dayTypeLabel,
          L.dayTotals,
          L.totals,
          '',
          displayCalories(dayMacros.kcal),
          displayMacroGrams(dayMacros.protein),
          displayMacroGrams(dayMacros.carbs),
          displayMacroGrams(dayMacros.fat),
          '',
          '', // Empty side note in totals rows!
          '',
          '',
        ]);
      }
    }
  }

  // Document totals row (client-selection totals only!)
  const docTotals = selectedValues?.totals ?? computedValues.totals;
  writeSafeRow(sheet, [
    planTitle,
    '',
    '',
    L.totals,
    L.totals,
    '',
    displayCalories(docTotals.kcal),
    displayMacroGrams(docTotals.protein),
    displayMacroGrams(docTotals.carbs),
    displayMacroGrams(docTotals.fat),
    '',
    '', // Empty side note in totals rows!
    '',
    '',
  ]);

  return workbook;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderNutritionPrintHtml(
  projection: NutritionExportProjection,
  locale: NutritionPromptLocale,
): string {
  const isAr = locale === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const L = NUTRITION_PROMPT_LABELS[locale];
  const sideNoteLabel = L.sideNote;

  const doc = projection.content.document;
  const snapshotMap = projection.content.snapshotMap;
  const computedValues = projection.content.computedValues;
  const selectedValues = projection.selectedValues;
  const selectedIds = projection.selectedAlternativeIds;

  const planTitle = doc.title
    ? ((isAr
        ? (doc.title.ar ?? doc.title.en)
        : (doc.title.en ?? doc.title.ar)) ?? '')
    : isAr
      ? 'خطة التغذية'
      : 'Nutrition Plan';

  // Day groups
  const dayGroups: Array<{
    dayLabel: string;
    dayTypeLabel: string;
    dayKey: string;
    meals: NutritionMeal[];
  }> = [];

  if (doc.structure === 'single_day') {
    const dt = doc.dayTypes.find((d) => d.id === doc.implicitDayTypeId);
    const dayTypeLabel = dt
      ? isAr
        ? (dt.name.ar ?? dt.name.en)
        : (dt.name.en ?? dt.name.ar)
      : '';
    dayGroups.push({
      dayLabel: '',
      dayTypeLabel,
      dayKey: '0',
      meals: doc.meals ?? [],
    });
  } else {
    for (const day of (doc.days ?? [])
      .slice()
      .sort((a, b) => a.dayIndex - b.dayIndex)) {
      const dt = doc.dayTypes.find((d) => d.id === day.dayTypeId);
      const dayTypeLabel = dt
        ? isAr
          ? (dt.name.ar ?? dt.name.en)
          : (dt.name.en ?? dt.name.ar)
        : '';
      const dayLabel = L.day.replace('{n}', String(day.dayIndex));
      dayGroups.push({
        dayLabel,
        dayTypeLabel,
        dayKey: String(day.dayIndex),
        meals: day.meals ?? [],
      });
    }
  }

  let mealsHtml = '';

  for (const group of dayGroups) {
    let dayHeading = '';
    if (group.dayLabel || group.dayTypeLabel) {
      dayHeading = `<header class="day-header"><h2>${escapeHtml(group.dayLabel)} ${group.dayTypeLabel ? `<span class="day-type">(${escapeHtml(group.dayTypeLabel)})</span>` : ''}</h2></header>`;
    }

    let groupMealsHtml = '';
    for (const meal of group.meals) {
      const mealName = isAr
        ? (meal.name.ar ?? meal.name.en)
        : (meal.name.en ?? meal.name.ar);

      let recipeLinkHtml = '';
      if (meal.recipeUrl) {
        recipeLinkHtml = `<div class="meal-recipe"><a href="${escapeHtml(meal.recipeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(L.recipe)}: ${escapeHtml(meal.recipeUrl)}</a></div>`;
      }

      let mealNoteHtml = '';
      if (meal.note) {
        mealNoteHtml = `<div class="meal-notes"><strong>${escapeHtml(L.mealNotes)}:</strong> ${escapeHtml(meal.note)}</div>`;
      }

      let itemRowsHtml = '';
      for (const item of meal.items) {
        const selectedAltId = selectedIds[item.id];
        let displayFoodName = '';
        let displayQuantity = '';
        let kcalVal = '';
        let proteinVal = '';
        let carbsVal = '';
        let fatVal = '';
        let coachSideNoteHtml = '';

        const coachEntry = snapshotEntry(
          snapshotMap,
          item.foodId,
          item.foodVersion,
          item.quantity.unit,
        );
        const coachName = foodDisplayName(coachEntry, locale);
        const coachUnit = servingDisplayUnit(coachEntry, item.quantity, locale);
        const coachMacros = computedValues.items[item.id] ?? {
          kcal: '0',
          protein: '0',
          carbs: '0',
          fat: '0',
        };

        if (selectedAltId && selectedValues?.items[item.id]) {
          const alt = item.alternatives.find((a) => a.id === selectedAltId);
          if (alt) {
            const altEntry = snapshotEntry(
              snapshotMap,
              alt.foodId,
              alt.foodVersion,
              alt.quantity.unit,
            );
            displayFoodName = foodDisplayName(altEntry, locale);
            displayQuantity = `${alt.quantity.value} ${servingDisplayUnit(altEntry, alt.quantity, locale)}`;
            const sVal = selectedValues.items[item.id]!;
            kcalVal = displayCalories(sVal.kcal);
            proteinVal = displayMacroGrams(sVal.protein);
            carbsVal = displayMacroGrams(sVal.carbs);
            fatVal = displayMacroGrams(sVal.fat);

            coachSideNoteHtml = `<div class="side-note"><em>${escapeHtml(sideNoteLabel)}:</em> ${escapeHtml(coachName)} ${escapeHtml(item.quantity.value)} ${escapeHtml(coachUnit)} | ${escapeHtml(L.kcal)} ${displayCalories(coachMacros.kcal)} | ${escapeHtml(L.protein)} ${displayMacroGrams(coachMacros.protein)} | ${escapeHtml(L.carbs)} ${displayMacroGrams(coachMacros.carbs)} | ${escapeHtml(L.fat)} ${displayMacroGrams(coachMacros.fat)}</div>`;
          }
        } else {
          displayFoodName = coachName;
          displayQuantity = `${item.quantity.value} ${coachUnit}`;
          kcalVal = displayCalories(coachMacros.kcal);
          proteinVal = displayMacroGrams(coachMacros.protein);
          carbsVal = displayMacroGrams(coachMacros.carbs);
          fatVal = displayMacroGrams(coachMacros.fat);
        }

        let foodNoteHtml = '';
        if (item.note) {
          foodNoteHtml = `<div class="food-notes"><strong>${escapeHtml(L.foodNotes)}:</strong> ${escapeHtml(item.note)}</div>`;
        }

        let altsHtml = '';
        if (item.alternatives.length > 0) {
          const altsList = item.alternatives
            .map((alt) => {
              const aEntry = snapshotEntry(
                snapshotMap,
                alt.foodId,
                alt.foodVersion,
                alt.quantity.unit,
              );
              const aName = foodDisplayName(aEntry, locale);
              const aUnit = servingDisplayUnit(aEntry, alt.quantity, locale);
              return `${escapeHtml(aName)} ${escapeHtml(alt.quantity.value)} ${escapeHtml(aUnit)}`;
            })
            .join(', ');
          altsHtml = `<div class="item-alternatives"><strong>${escapeHtml(L.alternative)}:</strong> ${altsList}</div>`;
        }

        itemRowsHtml += `
          <tr class="item-row">
            <td class="col-item">
              <strong>${escapeHtml(displayFoodName)}</strong>
              ${coachSideNoteHtml}
              ${foodNoteHtml}
              ${altsHtml}
            </td>
            <td class="col-qty">${escapeHtml(displayQuantity)}</td>
            <td class="col-macro">${escapeHtml(kcalVal)}</td>
            <td class="col-macro">${escapeHtml(proteinVal)}</td>
            <td class="col-macro">${escapeHtml(carbsVal)}</td>
            <td class="col-macro">${escapeHtml(fatVal)}</td>
          </tr>
        `;
      }

      // Meal totals
      const mealMacros = selectedValues?.meals[meal.id] ??
        computedValues.meals[meal.id] ?? {
          kcal: '0',
          protein: '0',
          carbs: '0',
          fat: '0',
        };

      const mealTotalsRow = `
        <tr class="meal-totals-row">
          <td colspan="2"><strong>${escapeHtml(L.mealTotals)} ${escapeHtml(L.totals)}</strong></td>
          <td class="col-macro"><strong>${displayCalories(mealMacros.kcal)}</strong></td>
          <td class="col-macro"><strong>${displayMacroGrams(mealMacros.protein)}</strong></td>
          <td class="col-macro"><strong>${displayMacroGrams(mealMacros.carbs)}</strong></td>
          <td class="col-macro"><strong>${displayMacroGrams(mealMacros.fat)}</strong></td>
        </tr>
      `;

      groupMealsHtml += `
        <section class="meal-section">
          <h3>${escapeHtml(mealName)}</h3>
          ${mealNoteHtml}
          ${recipeLinkHtml}
          <table class="nutrition-table">
            <thead>
              <tr>
                <th class="col-item">${escapeHtml(L.item)}</th>
                <th class="col-qty">${isAr ? 'الكمية' : 'Quantity'}</th>
                <th class="col-macro">${escapeHtml(L.kcal)}</th>
                <th class="col-macro">${escapeHtml(L.protein)}</th>
                <th class="col-macro">${escapeHtml(L.carbs)}</th>
                <th class="col-macro">${escapeHtml(L.fat)}</th>
              </tr>
            </thead>
            <tbody>
              ${itemRowsHtml}
              ${mealTotalsRow}
            </tbody>
          </table>
        </section>
      `;
    }

    // Day totals (seven_day)
    let dayTotalsHtml = '';
    if (doc.structure === 'seven_day') {
      const dayMacros =
        selectedValues?.days[group.dayKey] ?? computedValues.days[group.dayKey];
      if (dayMacros) {
        dayTotalsHtml = `
          <div class="day-totals">
            <strong>${escapeHtml(group.dayLabel)} ${escapeHtml(L.totals)}:</strong>
            ${escapeHtml(L.kcal)} ${displayCalories(dayMacros.kcal)} | ${escapeHtml(L.protein)} ${displayMacroGrams(dayMacros.protein)} | ${escapeHtml(L.carbs)} ${displayMacroGrams(dayMacros.carbs)} | ${escapeHtml(L.fat)} ${displayMacroGrams(dayMacros.fat)}
          </div>
        `;
      }
    }

    mealsHtml += `
      <div class="day-group">
        ${dayHeading}
        ${groupMealsHtml}
        ${dayTotalsHtml}
      </div>
    `;
  }

  // Document totals
  const docTotals = selectedValues?.totals ?? computedValues.totals;
  const docTotalsHtml = `
    <footer class="plan-totals">
      <h2>${escapeHtml(L.totals)}</h2>
      <div class="totals-summary">
        <span><strong>${escapeHtml(L.kcal)}:</strong> ${displayCalories(docTotals.kcal)}</span>
        <span><strong>${escapeHtml(L.protein)}:</strong> ${displayMacroGrams(docTotals.protein)}</span>
        <span><strong>${escapeHtml(L.carbs)}:</strong> ${displayMacroGrams(docTotals.carbs)}</span>
        <span><strong>${escapeHtml(L.fat)}:</strong> ${displayMacroGrams(docTotals.fat)}</span>
      </div>
    </footer>
  `;

  let documentNotesHtml = '';
  if (doc.notes) {
    documentNotesHtml = `<div class="document-notes"><strong>${escapeHtml(L.documentNotes)}:</strong> ${escapeHtml(doc.notes)}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(planTitle)}</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.4;
      color: #111827;
      background: #ffffff;
      padding: 0;
    }
    .print-document {
      width: 100%;
      max-width: 100%;
    }
    header.plan-header {
      border-bottom: 2px solid #111827;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 16pt;
      margin-bottom: 4px;
    }
    h2 {
      font-size: 13pt;
      margin-top: 10px;
      margin-bottom: 6px;
    }
    h3 {
      font-size: 11pt;
      margin-top: 8px;
      margin-bottom: 4px;
    }
    .document-notes, .meal-notes, .meal-recipe, .food-notes {
      font-size: 9pt;
      color: #374151;
      margin: 4px 0;
    }
    .meal-recipe a {
      color: #2563eb;
      text-decoration: underline;
    }
    .side-note {
      font-size: 8.5pt;
      color: #4b5563;
      margin-top: 2px;
    }
    .item-alternatives {
      font-size: 8.5pt;
      color: #6b7280;
      margin-top: 2px;
    }
    table.nutrition-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0 12px 0;
      font-size: 9pt;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 4px 6px;
      text-align: ${isAr ? 'right' : 'left'};
      vertical-align: top;
    }
    th {
      background-color: #f3f4f6;
      font-weight: 600;
    }
    .col-qty, .col-macro {
      text-align: ${isAr ? 'left' : 'right'};
      white-space: nowrap;
    }
    tr.meal-totals-row {
      background-color: #f9fafb;
      font-weight: bold;
    }
    .day-totals, .plan-totals {
      border-top: 2px solid #374151;
      padding-top: 8px;
      margin-top: 12px;
    }
    .totals-summary {
      display: flex;
      gap: 16px;
      font-size: 11pt;
      margin-top: 4px;
    }
    @media print {
      body {
        background: transparent;
      }
      [data-screen-only] {
        display: none !important;
      }
      .meal-section {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <article class="print-document">
    <header class="plan-header">
      <h1>${escapeHtml(planTitle)}</h1>
      <div class="plan-meta">
        <span>${isAr ? 'الإصدار' : 'Revision'} ${projection.revision.revisionNumber}</span>
      </div>
    </header>
    ${documentNotesHtml}
    ${mealsHtml}
    ${docTotalsHtml}
  </article>
</body>
</html>`;
}
