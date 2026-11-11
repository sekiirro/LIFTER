import type {
  NutritionDocumentV1,
  NutritionMeal,
  NutritionQuantityUnit,
} from './types';

/**
 * F18 canonical macro and total algorithm (F18-FR-003).
 *
 * Contract: `specs/018-nutrition-planner/contracts/nutrition-document.md`
 * sections 3-4; data-model.md section 2. Exact decimal arithmetic on BigInt
 * coefficient/scale pairs with no intermediate rounding; aggregates derive
 * from exact item values, never from rounded item values; display applies
 * half-up exactly once from the exact value (S43-PO-1 MCQ-4; architect
 * ruling S43-R9 Sol-1). Quantities, totals and transport values are decimal
 * strings, never JS numbers.
 */

/** Exact finite decimal: value = coef / 10^scale, coef >= 0. */
export type ExactDecimal = { coef: bigint; scale: number };

const FINITE_DECIMAL_RE = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/;

export class NutritionMacroError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NutritionMacroError';
  }
}

/** Parse a finite decimal string (no exponent, no locale separators). */
export function parseExactDecimal(value: string): ExactDecimal {
  if (typeof value !== 'string' || !FINITE_DECIMAL_RE.test(value)) {
    throw new NutritionMacroError(
      `not a finite decimal string: ${JSON.stringify(value)}`,
    );
  }
  const dot = value.indexOf('.');
  if (dot === -1) {
    return { coef: BigInt(value), scale: 0 };
  }
  const intPart = value.slice(0, dot);
  const fracPart = value.slice(dot + 1);
  const coef = BigInt((intPart || '0') + fracPart);
  return { coef, scale: fracPart.length };
}

/** Serialize an exact decimal at its own scale, never rounding. */
export function serializeExactDecimal(value: ExactDecimal): string {
  const { coef, scale } = value;
  if (scale === 0) return coef.toString();
  const digits = coef.toString().padStart(scale + 1, '0');
  const intPart = digits.slice(0, digits.length - scale);
  const fracPart = digits.slice(digits.length - scale);
  return `${intPart}.${fracPart}`;
}

/** Exact addition (scale = max of the two scales). */
export function addExact(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  const scale = Math.max(a.scale, b.scale);
  return { coef: align(a, scale) + align(b, scale), scale };
}

/** Exact multiplication (scale = sum of the scales). */
export function mulExact(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  return { coef: a.coef * b.coef, scale: a.scale + b.scale };
}

/** Exact division by 100 (adds 2 to the scale; no rounding is possible). */
export function divExact100(a: ExactDecimal): ExactDecimal {
  return { coef: a.coef, scale: a.scale + 2 };
}

function align(a: ExactDecimal, scale: number): bigint {
  return a.coef * 10n ** BigInt(scale - a.scale);
}

/** Round half-up exactly once from the exact value to `dp` decimal places. */
export function roundHalfUpExact(
  value: ExactDecimal,
  dp: number,
): ExactDecimal {
  if (value.scale <= dp) {
    return { coef: value.coef, scale: dp };
  }
  const divisor = 10n ** BigInt(value.scale - dp);
  const rest = value.coef % divisor;
  let q = (value.coef - rest) / divisor;
  // half-up: ties (rest === divisor/2) and more round up
  if (rest * 2n >= divisor) {
    q += 1n;
  }
  return { coef: q, scale: dp };
}

/** Display calories as an integer, half-up once from the exact value. */
export function displayCalories(exact: string): string {
  return serializeExactDecimal(roundHalfUpExact(parseExactDecimal(exact), 0));
}

/**
 * Display protein/carbohydrate/fat grams (F18-FR-003; S48-R13): the display
 * threshold is evaluated on the EXACT persisted value — below 10 g exact one
 * decimal (even when the rounding lands on 10.0), at or above 10 g exact an
 * integer; zero renders `0`. Half-up exactly once, from the exact decimal.
 */
export function displayMacroGrams(exact: string): string {
  const value = parseExactDecimal(exact);
  const ten = 10n ** BigInt(value.scale + 1); // exact 10 in value's scale space
  if (value.coef >= ten) {
    return serializeExactDecimal(roundHalfUpExact(value, 0));
  }
  const rounded = roundHalfUpExact(value, 1);
  if (rounded.coef === 0n) return '0';
  return serializeExactDecimal(rounded);
}

const MACRO_FIELDS = ['kcal', 'protein', 'carbs', 'fat'] as const;

export type MacroField = (typeof MACRO_FIELDS)[number];

export type MacroSet = Record<MacroField, string>;

/** Computed-values shape (contract section 3): exact decimal strings. */
export type ComputedValues = {
  schemaVersion: 1;
  algorithmVersion: 1;
  items: Record<string, MacroSet>;
  meals: Record<string, MacroSet>;
  days: Record<string, MacroSet>;
  totals: MacroSet;
};

/** F18 snapshot map entry (contract section 4), per100 as decimal strings. */
export type BasisSnapshotEntry = {
  kind: 'basis';
  foodId: string;
  version: number;
  names: { ar: string; en: string };
  basis: 'g' | 'ml';
  productIdentity: string;
  preparationIdentity: string;
  weighingState: 'raw' | 'cooked' | 'not_applicable';
  per100: {
    kcal: string;
    protein: string;
    carbs: string;
    fat: string;
    fiber: string | null;
  };
};

export type ServingSnapshotEntry = {
  kind: 'serving';
  unitKey: string;
  snapshot: {
    foodId: string;
    version: number;
    names: { ar: string; en: string };
    basis: 'g' | 'ml';
    productIdentity: string;
    preparationIdentity: string;
    weighingState: 'raw' | 'cooked' | 'not_applicable';
    kcal: string;
    protein: string;
    carbs: string;
    fat: string;
    fiber: string | null;
    serving: {
      servingId: string;
      labels: { ar: string; en: string };
      basisQuantity: string;
    };
  };
};

export type NutritionSnapshotEntry = BasisSnapshotEntry | ServingSnapshotEntry;

export type NutritionSnapshotMap = Record<string, NutritionSnapshotEntry>;

/** RFC 3986 percent-encoding of a catalog `unit_key` inside a snapshot key. */
export function percentEncodeUnitKey(unitKey: string): string {
  // encodeURIComponent follows RFC 3986 except for !'()* which it leaves
  // unescaped; escape those as well so :/#/% can never change the key shape.
  return encodeURIComponent(unitKey).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Snapshot map key for one exact (food version, unit kind, unit identity). */
export function snapshotMapKey(
  foodId: string,
  foodVersion: number,
  unit: NutritionQuantityUnit,
): string {
  if (unit.kind === 'basis') {
    return `food:${foodId}@${foodVersion}#basis:${unit.value}`;
  }
  return `food:${foodId}@${foodVersion}#serving:${percentEncodeUnitKey(unit.unitKey)}`;
}

function per100Of(entry: NutritionSnapshotEntry): MacroSet {
  if (entry.kind === 'basis') {
    return {
      kcal: entry.per100.kcal,
      protein: entry.per100.protein,
      carbs: entry.per100.carbs,
      fat: entry.per100.fat,
    };
  }
  return {
    kcal: entry.snapshot.kcal,
    protein: entry.snapshot.protein,
    carbs: entry.snapshot.carbs,
    fat: entry.snapshot.fat,
  };
}

function basisQuantityOf(
  entry: NutritionSnapshotEntry,
  quantityValue: string,
  unit: NutritionQuantityUnit,
): ExactDecimal {
  const quantity = parseExactDecimal(quantityValue);
  if (unit.kind === 'basis') {
    return quantity;
  }
  if (entry.kind !== 'serving') {
    throw new NutritionMacroError(
      `snapshot entry for a serving reference must be a serving entry`,
    );
  }
  return mulExact(
    quantity,
    parseExactDecimal(entry.snapshot.serving.basisQuantity),
  );
}

function computeItemMacroSet(
  entry: NutritionSnapshotEntry,
  quantityValue: string,
  unit: NutritionQuantityUnit,
): MacroSet {
  const basisQuantity = basisQuantityOf(entry, quantityValue, unit);
  const per100 = per100Of(entry);
  const out = {} as MacroSet;
  for (const field of MACRO_FIELDS) {
    const itemValue = divExact100(
      mulExact(parseExactDecimal(per100[field]), basisQuantity),
    );
    out[field] = serializeExactDecimal(itemValue);
  }
  return out;
}

function zeroMacroSet(): MacroSet {
  // No declared input scale for an empty aggregate: exact zero is "0".
  return { kcal: '0', protein: '0', carbs: '0', fat: '0' };
}

function sumMacroSets(sets: MacroSet[]): MacroSet {
  if (sets.length === 0) return zeroMacroSet();
  const acc = {} as Record<MacroField, ExactDecimal>;
  for (const field of MACRO_FIELDS) {
    acc[field] = parseExactDecimal(sets[0]![field]);
    for (const set of sets.slice(1)) {
      acc[field] = addExact(acc[field]!, parseExactDecimal(set[field]));
    }
  }
  const out = {} as MacroSet;
  for (const field of MACRO_FIELDS)
    out[field] = serializeExactDecimal(acc[field]!);
  return out;
}

type SelectionByItem = Record<string, string | null | undefined>;

function documentMealGroups(
  document: NutritionDocumentV1,
): Array<{ dayIndex: string; meals: NutritionMeal[] }> {
  if (document.structure === 'single_day') {
    return [{ dayIndex: '0', meals: document.meals ?? [] }];
  }
  return (document.days ?? [])
    .slice()
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((day) => ({ dayIndex: String(day.dayIndex), meals: day.meals ?? [] }));
}

function computeItemValue(
  document: NutritionDocumentV1,
  snapshotMap: NutritionSnapshotMap,
  foodId: string,
  foodVersion: number,
  quantityValue: string,
  unit: NutritionQuantityUnit,
): MacroSet {
  const key = snapshotMapKey(foodId, foodVersion, unit);
  const entry = snapshotMap[key];
  if (!entry) {
    throw new NutritionMacroError(`missing snapshot entry for ${key}`);
  }
  return computeItemMacroSet(entry, quantityValue, unit);
}

/**
 * Canonical computation for one document. Every meal is counted only in the
 * day that contains it (the implicit day for `single_day`, its own `days[]`
 * entry for `seven_day`); day type never filters visibility or totals.
 * `selection` optionally maps an item id to the coach-approved alternative id
 * whose exact values replace the item's coach-authored values (derived on
 * read, never persisted — data-model section 2 "Selected-alternative
 * derivation").
 */
export function computeDocumentValues(
  document: NutritionDocumentV1,
  snapshotMap: NutritionSnapshotMap,
  selection?: SelectionByItem,
): ComputedValues {
  const items: Record<string, MacroSet> = {};
  const meals: Record<string, MacroSet> = {};
  const days: Record<string, MacroSet> = {};
  const dayAccumulator: Array<{ dayIndex: string; mealSets: MacroSet[] }> = [];

  for (const group of documentMealGroups(document)) {
    const daySets: MacroSet[] = [];
    for (const mealEntry of group.meals) {
      const itemSets: MacroSet[] = [];
      for (const itemEntry of mealEntry.items) {
        const selectedAlternativeId = selection?.[itemEntry.id];
        let macroSet: MacroSet;
        if (selectedAlternativeId) {
          const alternative = itemEntry.alternatives.find(
            (a) => a.id === selectedAlternativeId,
          );
          if (!alternative) {
            throw new NutritionMacroError(
              `alternative ${selectedAlternativeId} is not in item ${itemEntry.id}'s approved list`,
            );
          }
          macroSet = computeItemValue(
            document,
            snapshotMap,
            alternative.foodId,
            alternative.foodVersion,
            alternative.quantity.value,
            alternative.quantity.unit,
          );
        } else {
          macroSet = computeItemValue(
            document,
            snapshotMap,
            itemEntry.foodId,
            itemEntry.foodVersion,
            itemEntry.quantity.value,
            itemEntry.quantity.unit,
          );
        }
        items[itemEntry.id] = macroSet;
        itemSets.push(macroSet);
      }
      const mealSet = sumMacroSets(itemSets);
      meals[mealEntry.id] = mealSet;
      daySets.push(mealSet);
    }
    const daySet = sumMacroSets(daySets);
    days[group.dayIndex] = daySet;
    dayAccumulator.push({ dayIndex: group.dayIndex, mealSets: daySets });
  }

  // document totals sum the exact day totals (single implicit day for single_day)
  const totals = sumMacroSets(dayAccumulator.map((d) => days[d.dayIndex]!));

  return {
    schemaVersion: 1,
    algorithmVersion: 1,
    items,
    meals,
    days,
    totals,
  };
}

/**
 * Exact values for every coach-configured alternative, derived with the same
 * canonical function (data-model section 2: alternative foods are computed
 * exactly like primary items).
 */
export function computeAlternativeValues(
  document: NutritionDocumentV1,
  snapshotMap: NutritionSnapshotMap,
): Record<string, Record<string, MacroSet>> {
  const out: Record<string, Record<string, MacroSet>> = {};
  for (const group of documentMealGroups(document)) {
    for (const mealEntry of group.meals) {
      for (const itemEntry of mealEntry.items) {
        for (const alternative of itemEntry.alternatives) {
          out[itemEntry.id] ??= {};
          out[itemEntry.id]![alternative.id] = computeItemValue(
            document,
            snapshotMap,
            alternative.foodId,
            alternative.foodVersion,
            alternative.quantity.value,
            alternative.quantity.unit,
          );
        }
      }
    }
  }
  return out;
}
