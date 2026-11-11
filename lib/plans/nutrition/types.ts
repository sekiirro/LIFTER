/**
 * F18 nutrition document v1 shapes (F18-FR-002).
 *
 * Contract: `specs/018-nutrition-planner/contracts/nutrition-document.md`
 * section 1. Quantities, targets and computed values are decimal strings;
 * structural integers (`schemaVersion`, `dayIndex`, `foodVersion`) are JSON
 * numbers. Every meal is visible on, and counted only in, the day that
 * contains it (the implicit day for `single_day`, its own `days[]` entry for
 * `seven_day`); day type never filters meal visibility or totals.
 */

export type NutritionQuantityUnit =
  { kind: 'basis'; value: 'g' | 'ml' } | { kind: 'serving'; unitKey: string };

export type NutritionQuantity = {
  value: string;
  unit: NutritionQuantityUnit;
};

export type NutritionDayType = {
  id: string;
  name: { ar: string; en: string };
  trainingDay: boolean;
  targets: {
    kcal: string;
    protein: string;
    carbs: string;
    fat: string;
  } | null;
};

export type NutritionAlternative = {
  id: string;
  foodId: string;
  foodVersion: number;
  quantity: NutritionQuantity;
};

export type NutritionItem = {
  id: string;
  foodId: string;
  foodVersion: number;
  quantity: NutritionQuantity;
  /** Food Notes: separate per-item field, independently editable/clearable. */
  note: string | null;
  alternatives: NutritionAlternative[];
};

export type NutritionMeal = {
  id: string;
  name: { ar: string; en: string };
  /** Meal Notes: separate per-meal field, independently editable/clearable. */
  note: string | null;
  /** D18-6 optional recipe/preparation HTTPS link. */
  recipeUrl: string | null;
  items: NutritionItem[];
};

export type NutritionDay = {
  dayIndex: number;
  dayTypeId: string;
  meals: NutritionMeal[];
};

export type NutritionDocumentV1 = {
  schemaVersion: 1;
  structure: 'single_day' | 'seven_day';
  dayTypes: NutritionDayType[];
  /** single_day only: always required, resolves to a declared day type. */
  implicitDayTypeId?: string;
  /** single_day only: the one implicit day's meals. */
  meals?: NutritionMeal[];
  /** seven_day only: exactly 7 entries, dayIndex 0-6 each exactly once. */
  days?: NutritionDay[];
  title: { ar: string; en: string } | null;
  notes: string | null;
};
