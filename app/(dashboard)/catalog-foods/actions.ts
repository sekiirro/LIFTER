'use server';

import {
  createFood,
  foodDuplicateCandidates,
  type CatalogResult,
} from '../../../lib/catalog/server';
import {
  buildFoodEditorInput,
  type DuplicateCandidate,
  type FoodEditorDraft,
} from '../../../lib/catalog/food-editor';
import { MAX_FOOD_ALTERNATIVES } from '../../../lib/catalog/schemas';
import { isUuid } from '../../../lib/catalog/uuid';

export type FoodDuplicateReviewResult =
  | { status: 'none'; candidates: [] }
  | { status: 'exact' | 'near'; candidates: DuplicateCandidate[] }
  | { status: 'unavailable' | 'not_permitted' | 'invalid'; candidates: [] };
export type CatalogFoodSaveResult =
  CatalogResult | { status: 'unsupported_alternatives' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

const FOOD_DRAFT_STRING_FIELDS = [
  'nameAr',
  'nameEn',
  'basis',
  'productIdentity',
  'preparationIdentity',
  'weighingState',
  'kcal',
  'protein',
  'carbs',
  'fat',
  'fiber',
] as const;
function isFoodDraft(value: unknown): value is FoodEditorDraft {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      ...FOOD_DRAFT_STRING_FIELDS,
      'servings',
      'alternatives',
    ]) ||
    !FOOD_DRAFT_STRING_FIELDS.every(
      (field) => typeof value[field] === 'string',
    ) ||
    !Array.isArray(value.servings) ||
    !Array.isArray(value.alternatives) ||
    value.alternatives.length > MAX_FOOD_ALTERNATIVES
  )
    return false;

  const servingsValid = value.servings.every(
    (serving) =>
      isRecord(serving) &&
      hasExactKeys(serving, ['labelAr', 'labelEn', 'basisQuantity']) &&
      typeof serving.labelAr === 'string' &&
      typeof serving.labelEn === 'string' &&
      typeof serving.basisQuantity === 'string',
  );
  const alternativesValid = value.alternatives.every(
    (alternative) =>
      isRecord(alternative) &&
      hasExactKeys(alternative, ['foodId', 'portionQuantity', 'portionUnit']) &&
      typeof alternative.foodId === 'string' &&
      typeof alternative.portionQuantity === 'string' &&
      typeof alternative.portionUnit === 'string',
  );
  return servingsValid && alternativesValid;
}

export async function reviewFoodDuplicatesAction(
  draft: unknown,
): Promise<FoodDuplicateReviewResult> {
  if (!isFoodDraft(draft)) return { status: 'invalid', candidates: [] };
  const food = buildFoodEditorInput(draft);
  if (!food) return { status: 'invalid', candidates: [] };
  const names = (['ar', 'en'] as const).flatMap((language) => {
    const name = food.names[language];
    return name ? [{ name, language }] : [];
  });
  const responses = await Promise.all(
    names.map(({ name, language }) =>
      foodDuplicateCandidates({
        name,
        language,
        basis: food.basis,
        productIdentity: food.productIdentity,
        preparationIdentity: food.preparationIdentity,
        weighingState: food.weighingState,
        kcal: food.kcal,
      }),
    ),
  );
  const failed = responses.find((result) => result.status !== 'ok');
  if (failed)
    return {
      status: failed.status as 'unavailable' | 'not_permitted' | 'invalid',
      candidates: [],
    };
  const rows = responses.flatMap((result) =>
    result.status === 'ok' && Array.isArray(result.data)
      ? (result.data as Record<string, unknown>[])
      : [],
  );
  const unique = new Map<string, DuplicateCandidate>();
  let exact = false;
  for (const row of rows) {
    if (
      typeof row.food_id !== 'string' ||
      typeof row.match_type !== 'string' ||
      typeof row.kcal !== 'number' ||
      !Number.isFinite(row.kcal)
    )
      continue;
    if (row.match_type === 'exact') exact = true;
    const names = {
      ...(typeof row.name_ar === 'string' ? { ar: row.name_ar } : {}),
      ...(typeof row.name_en === 'string' ? { en: row.name_en } : {}),
    };
    unique.set(row.food_id, {
      id: row.food_id,
      names,
      basis: food.basis,
      kcal: row.kcal,
    });
  }
  const candidates = [...unique.values()];
  return candidates.length
    ? { status: exact ? 'exact' : 'near', candidates }
    : { status: 'none', candidates: [] };
}

export async function saveCatalogFoodAction(
  draft: unknown,
  workspaceId: unknown,
  confirmNearMatch: unknown,
  operationKey: unknown,
): Promise<CatalogFoodSaveResult> {
  if (
    !isFoodDraft(draft) ||
    (workspaceId !== null && !isUuid(workspaceId)) ||
    typeof confirmNearMatch !== 'boolean' ||
    !isUuid(operationKey)
  )
    return { status: 'invalid' };
  const food = buildFoodEditorInput(draft);
  if (!food) return { status: 'invalid' };
  if (food.alternatives?.length) return { status: 'unsupported_alternatives' };
  const request = {
    ...(food.names.ar ? { name_ar: food.names.ar } : {}),
    ...(food.names.en ? { name_en: food.names.en } : {}),
    basis: food.basis,
    product_identity_norm: food.productIdentity,
    preparation_identity_norm: food.preparationIdentity,
    weighing_state: food.weighingState,
    kcal: food.kcal,
    protein_g: food.protein,
    carbohydrate_g: food.carbs,
    fat_g: food.fat,
    fiber_g: food.fiber ?? null,
    servings: food.servings.map((serving, index) => ({
      unit_key: `serving_${index + 1}`,
      ...(serving.labels.ar ? { label_ar: serving.labels.ar } : {}),
      ...(serving.labels.en ? { label_en: serving.labels.en } : {}),
      basis: food.basis,
      basis_qty: serving.basisQuantity,
    })),
    confirm_near_match: confirmNearMatch,
  };
  return createFood({
    operationKey,
    workspaceId: workspaceId ?? undefined,
    request,
  });
}
