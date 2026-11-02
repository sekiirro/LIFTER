import {
  validateFoodInput,
  type FoodInput,
  type FoodValidationWarning,
  type ServingInput,
} from './schemas';

export type FoodEditorDraft = {
  nameAr: string;
  nameEn: string;
  basis: 'g' | 'ml';
  productIdentity: string;
  preparationIdentity: string;
  weighingState: 'raw' | 'cooked' | 'not_applicable';
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  servings: { labelAr: string; labelEn: string; basisQuantity: string }[];
  alternatives: {
    foodId: string;
    portionQuantity: string;
    portionUnit: string;
  }[];
};

export type FoodEditorErrors = {
  name?: 'required';
  productIdentity?: 'required';
  preparationIdentity?: 'required';
  kcal?: 'required' | 'nonnegative';
  protein?: 'required' | 'nonnegative' | 'macros_exceed_basis';
  carbs?: 'required' | 'nonnegative' | 'macros_exceed_basis';
  fat?: 'required' | 'nonnegative' | 'macros_exceed_basis';
  fiber?: 'nonnegative';
  serving?: 'required' | 'positive';
  servingLabel?: 'required';
  alternatives?: 'too_many';
  alternativePortions?: ('positive' | undefined)[];
};

function number(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

export function validateFoodEditorDraft(
  draft: FoodEditorDraft,
): FoodEditorErrors {
  const errors: FoodEditorErrors = {};
  if (!draft.nameAr.trim() && !draft.nameEn.trim()) errors.name = 'required';
  if (!draft.productIdentity.trim()) errors.productIdentity = 'required';
  if (!draft.preparationIdentity.trim())
    errors.preparationIdentity = 'required';
  for (const key of ['kcal', 'protein', 'carbs', 'fat'] as const) {
    const value = number(draft[key]);
    if (!Number.isFinite(value)) errors[key] = 'required';
    else if (value < 0) errors[key] = 'nonnegative';
  }
  const macros = ['protein', 'carbs', 'fat'] as const;
  if (
    macros.every(
      (key) => Number.isFinite(number(draft[key])) && number(draft[key]) >= 0,
    ) &&
    macros.reduce((sum, key) => sum + number(draft[key]), 0) > 100
  ) {
    for (const key of macros) errors[key] = 'macros_exceed_basis';
  }
  if (
    draft.fiber.trim() &&
    (!Number.isFinite(number(draft.fiber)) || number(draft.fiber) < 0)
  )
    errors.fiber = 'nonnegative';
  if (!draft.servings.length) errors.serving = 'required';
  else if (
    draft.servings.some(
      (serving) =>
        !Number.isFinite(number(serving.basisQuantity)) ||
        number(serving.basisQuantity) <= 0,
    )
  )
    errors.serving = 'positive';
  if (
    draft.servings.some(
      (serving) => !serving.labelAr.trim() && !serving.labelEn.trim(),
    )
  ) {
    errors.servingLabel = 'required';
  }
  if (draft.alternatives.length > 3) errors.alternatives = 'too_many';
  const portions = draft.alternatives.map((item) =>
    Number.isFinite(number(item.portionQuantity)) &&
    number(item.portionQuantity) > 0
      ? undefined
      : 'positive',
  );
  if (portions.some(Boolean)) errors.alternativePortions = portions;
  return errors;
}

export function buildFoodEditorInput(draft: FoodEditorDraft): FoodInput | null {
  if (Object.keys(validateFoodEditorDraft(draft)).length) return null;
  const input: FoodInput = {
    names: {
      ...(draft.nameAr.trim() ? { ar: draft.nameAr.trim() } : {}),
      ...(draft.nameEn.trim() ? { en: draft.nameEn.trim() } : {}),
    },
    basis: draft.basis,
    productIdentity: draft.productIdentity.trim(),
    preparationIdentity: draft.preparationIdentity.trim(),
    weighingState: draft.weighingState,
    kcal: number(draft.kcal),
    protein: number(draft.protein),
    carbs: number(draft.carbs),
    fat: number(draft.fat),
    ...(draft.fiber.trim() ? { fiber: number(draft.fiber) } : {}),
    servings: draft.servings.map((serving): ServingInput => ({
      labels: {
        ...(serving.labelAr.trim() ? { ar: serving.labelAr.trim() } : {}),
        ...(serving.labelEn.trim() ? { en: serving.labelEn.trim() } : {}),
      },
      basisQuantity: number(serving.basisQuantity),
    })),
    alternatives: draft.alternatives.map((item) => ({
      alternativeFoodId: item.foodId,
      portionQuantity: number(item.portionQuantity),
      ...(item.portionUnit.trim()
        ? { portionUnit: item.portionUnit.trim() }
        : {}),
    })),
  };
  try {
    return validateFoodInput(input).food;
  } catch {
    return null;
  }
}

export function foodWarnings(draft: FoodEditorDraft): FoodValidationWarning[] {
  const input = buildFoodEditorInput(draft);
  if (!input) return [];
  return validateFoodInput(input).warnings;
}

export type DuplicateCandidate = {
  id: string;
  names: Partial<Record<'ar' | 'en', string>>;
  basis: 'g' | 'ml';
  kcal: number;
};
