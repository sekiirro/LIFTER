import { copyWorkoutDocument } from '../workout-planner/copy';
import type { WorkoutDocumentV1 } from '../workout-planner/document';
import type { PlanContent, PlanKind } from './client-contract';
import type { NutritionDocumentV1 } from './nutrition/types';

const EXCLUDED_COPY_KEYS = new Set([
  'video',
  'videoUrl',
  'video_url',
  'ownership',
  'authorship',
  'authored_by',
  'created_by',
  'updated_by',
  'history',
  'audit_history',
  'subscription',
  'subscription_id',
  'delivery',
  'delivery_id',
  'plan_deliveries',
  'activation',
  'activation_id',
  'selection',
  'selections',
  'selection_id',
  'client_nutrition_alternative_selections',
]);

/** Recursively clone a JSON value while omitting excluded metadata/video keys. */
export function stripExcludedCopyFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripExcludedCopyFields(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (EXCLUDED_COPY_KEYS.has(k)) continue;
      out[k] = stripExcludedCopyFields(v);
    }
    return out as T;
  }
  return value;
}

function copyNutritionDocument(
  document: NutritionDocumentV1,
  newId: () => string,
): NutritionDocumentV1 {
  const copy = stripExcludedCopyFields(structuredClone(document));
  const dayTypeIds = new Map<string, string>();
  if (Array.isArray(copy.dayTypes)) {
    for (const dt of copy.dayTypes) {
      const fresh = newId();
      dayTypeIds.set(dt.id, fresh);
      dt.id = fresh;
    }
  }
  if (copy.implicitDayTypeId && dayTypeIds.has(copy.implicitDayTypeId)) {
    copy.implicitDayTypeId = dayTypeIds.get(copy.implicitDayTypeId);
  }
  const remapMeals = (meals: NutritionDocumentV1['meals']) => {
    if (!Array.isArray(meals)) return;
    for (const meal of meals) {
      meal.id = newId();
      if (!Array.isArray(meal.items)) continue;
      for (const item of meal.items) {
        item.id = newId();
        if (!Array.isArray(item.alternatives)) continue;
        for (const alt of item.alternatives) {
          alt.id = newId();
        }
      }
    }
  };
  remapMeals(copy.meals);
  if (Array.isArray(copy.days)) {
    for (const day of copy.days) {
      if (dayTypeIds.has(day.dayTypeId)) {
        day.dayTypeId = dayTypeIds.get(day.dayTypeId)!;
      }
      remapMeals(day.meals);
    }
  }
  return copy;
}

/**
 * Copy plan content into an independent destination document, preserving
 * planner-entry settings while excluding ownership, history, subscription,
 * delivery, activation, and live-resolved Video fields.
 */
export function copyPlanContent<TDocument = unknown>(
  content: PlanContent<TDocument>,
  newId: () => string = () => crypto.randomUUID(),
): PlanContent<TDocument> {
  if (content.kind === 'workout') {
    const cleaned = stripExcludedCopyFields(content.document);
    const copied = copyWorkoutDocument(cleaned as WorkoutDocumentV1, newId);
    return {
      kind: 'workout',
      schemaVersion: content.schemaVersion,
      document: copied as unknown as TDocument,
    };
  }
  if (content.kind === 'nutrition') {
    const copied = copyNutritionDocument(
      content.document as unknown as NutritionDocumentV1,
      newId,
    );
    return {
      kind: 'nutrition',
      schemaVersion: content.schemaVersion,
      document: copied as unknown as TDocument,
    };
  }
  throw new Error('invalid_plan_kind');
}

/** Copy an immutable workout template version into a new plan content payload. */
export function copyFromTemplateVersion(
  template: { schemaVersion: number; document: WorkoutDocumentV1 },
  newId: () => string = () => crypto.randomUUID(),
): PlanContent<WorkoutDocumentV1> {
  return copyPlanContent<WorkoutDocumentV1>(
    {
      kind: 'workout',
      schemaVersion: template.schemaVersion,
      document: template.document,
    },
    newId,
  );
}

/** Copy an immutable nutrition template version into a new plan content payload. */
export function copyFromNutritionTemplateVersion(
  template: { schemaVersion: number; document: NutritionDocumentV1 },
  newId: () => string = () => crypto.randomUUID(),
): PlanContent<NutritionDocumentV1> {
  return copyPlanContent<NutritionDocumentV1>(
    {
      kind: 'nutrition',
      schemaVersion: template.schemaVersion,
      document: template.document,
    },
    newId,
  );
}

/** Copy a source plan's latest published revision into a new plan content payload. */
export function copyFromPublishedRevision<TDocument = unknown>(
  revision: { planKind: PlanKind; content: PlanContent<TDocument> },
  newId: () => string = () => crypto.randomUUID(),
): PlanContent<TDocument> {
  if (revision.content.kind !== revision.planKind) {
    throw new Error('invalid_plan_kind_mismatch');
  }
  return copyPlanContent(revision.content, newId);
}
