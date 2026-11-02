import { describe, expect, it } from 'vitest';
import {
  duplicateMeal,
  assignDayType,
  moveMeal,
  nutritionTotalsForDay,
  updateItemQuantity,
  visibleMealsForDay,
} from '../../components/plans/NutritionPlanEditorModel';
import type { NutritionDocument } from '../../lib/plans/nutrition/schema';
import type { NutritionFoodSnapshot } from '../../lib/plans/nutrition/macros';

const trainingTypeId = '00000000-0000-4000-8000-000000000001';
const restTypeId = '00000000-0000-4000-8000-000000000002';
const foodId = '00000000-0000-4000-8000-000000000003';
const doc: NutritionDocument = {
  structure: { kind: 'seven_day', days: Array.from({ length: 7 }, (_, dayIndex) => ({ dayIndex, dayTypeId: dayIndex === 0 ? trainingTypeId : restTypeId })) },
  dayTypes: [
    { id: trainingTypeId, name: 'Training', trainingDay: true },
    { id: restTypeId, name: 'Rest', trainingDay: false },
  ],
  meals: [
    { id: '00000000-0000-4000-8000-000000000010', conditional: 'always', items: [{ id: '00000000-0000-4000-8000-000000000011', foodVersionId: foodId, quantity: { value: '100', unit: 'g' }, alternatives: [{ id: '00000000-0000-4000-8000-000000000012', foodVersionId: foodId, quantity: { value: '50', unit: 'g' } }] }] },
    { id: '00000000-0000-4000-8000-000000000020', conditional: 'training_days_only', items: [{ id: '00000000-0000-4000-8000-000000000021', foodVersionId: foodId, quantity: { value: '25', unit: 'g' }, alternatives: [] }] },
  ],
};
const snapshots: readonly NutritionFoodSnapshot[] = [{
  foodVersionId: foodId,
  basis: 'g',
  per100: { calories: '100.00', protein: '10.00', carbs: '20.00', fat: '5.00' },
  servingEquivalences: { g: '1' },
}];

describe('nutrition editor model', () => {
  it('shows conditional meals only when the assigned day type is a training day', () => {
    expect(visibleMealsForDay(doc, 0).map((meal) => meal.id)).toHaveLength(2);
    expect(visibleMealsForDay(doc, 1).map((meal) => meal.id)).toEqual([doc.meals[0]!.id]);
  });

  it('moves meals without changing stable ids and duplicates with fresh descendant ids', () => {
    const moved = moveMeal(doc, doc.meals[1]!.id, 'up');
    expect(moved.meals.map((meal) => meal.id)).toEqual([doc.meals[1]!.id, doc.meals[0]!.id]);
    expect(moved.meals[0]!.items[0]!.id).toBe(doc.meals[1]!.items[0]!.id);
    let id = 0;
    const duplicated = duplicateMeal(doc, doc.meals[0]!.id, () => `new-${++id}`);
    const clone = duplicated.meals[1]!;
    expect(clone.id).not.toBe(doc.meals[0]!.id);
    expect(clone.items[0]!.id).not.toBe(doc.meals[0]!.items[0]!.id);
    expect(clone.items[0]!.alternatives[0]!.id).not.toBe(doc.meals[0]!.items[0]!.alternatives[0]!.id);
  });

  it('sums exact per-meal and per-day macros using canonical macro calculations', () => {
    expect(nutritionTotalsForDay(doc, 0, snapshots)).toEqual({ calories: '125.0000', protein: '12.5000', carbs: '25.0000', fat: '6.2500' });
    expect(nutritionTotalsForDay(doc, 1, snapshots)).toEqual({ calories: '100.0000', protein: '10.0000', carbs: '20.0000', fat: '5.0000' });
  });

  it('assigns day types and edits exact quantities while retaining item ids', () => {
    const assigned = assignDayType(doc, 1, trainingTypeId);
    expect(visibleMealsForDay(assigned, 1)).toHaveLength(2);
    const itemId = doc.meals[0]!.items[0]!.id;
    const edited = updateItemQuantity(doc, itemId, { value: '12.345', unit: 'g' });
    expect(edited.meals[0]!.items[0]).toMatchObject({ id: itemId, quantity: { value: '12.345', unit: 'g' } });
    expect(doc.meals[0]!.items[0]!.quantity.value).toBe('100');
  });
});
