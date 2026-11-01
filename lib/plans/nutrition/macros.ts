export type NutritionMacroValues = {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
};

export type NutritionMacroUnit = 'g' | 'ml';

export type NutritionFoodSnapshot = {
  foodVersionId: string;
  basis: NutritionMacroUnit;
  per100: NutritionMacroValues;
  servingEquivalences: Record<string, string>;
};

export type NutritionMacroQuantity = {
  value: string;
  unit: string;
};

export type NutritionMacroInput = {
  snapshot: NutritionFoodSnapshot;
  quantity: NutritionMacroQuantity;
};

export type NutritionMacroCalculation = {
  basisQuantity: string;
  macros: NutritionMacroValues;
};

export class NutritionMacroError extends Error {
  readonly code = 'invalid_nutrition_macro';

  constructor(message: string) {
    super(message);
    this.name = 'NutritionMacroError';
  }
}

type NutrientName = keyof NutritionMacroValues;

type ExactDecimal = {
  coefficient: bigint;
  scale: number;
};

type ExactMacroValues = Record<NutrientName, ExactDecimal>;

type ValidatedSnapshot = {
  foodVersionId: string;
  basis: NutritionMacroUnit;
  per100: ExactMacroValues;
  servingEquivalences: Map<string, ExactDecimal>;
};

const NUTRIENT_NAMES: readonly NutrientName[] = [
  'calories',
  'protein',
  'carbs',
  'fat',
];
const QUANTITY_MAX_SCALE = 3;
const SERVING_EQUIVALENCE_MAX_SCALE = 4;
const PER_100_SCALE = 2;
const STORAGE_SCALE = 4;
const STORAGE_MAX_SCALED = 999_999_999_999n;
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseExactDecimal(
  value: unknown,
  label: string,
  maximumScale: number,
  positive: boolean,
): ExactDecimal {
  if (typeof value !== 'string') {
    throw new NutritionMacroError(`${label} must be a decimal string`);
  }

  const match = DECIMAL_PATTERN.exec(value);
  if (!match) {
    throw new NutritionMacroError(
      `${label} must be a non-negative canonical decimal string`,
    );
  }

  const fraction = match[1] ?? '';
  if (fraction.length > maximumScale) {
    throw new NutritionMacroError(
      `${label} must have at most ${maximumScale} decimal places`,
    );
  }

  const [whole = '0', fractionalPart = ''] = value.split('.');
  const coefficient =
    BigInt(whole) * 10n ** BigInt(fractionalPart.length) +
    BigInt(fractionalPart || '0');

  if (positive && coefficient === 0n) {
    throw new NutritionMacroError(`${label} must be greater than zero`);
  }

  return { coefficient, scale: fractionalPart.length };
}

function parsePer100Decimal(value: unknown, label: string): ExactDecimal {
  const parsed = parseExactDecimal(value, label, PER_100_SCALE, false);
  if (parsed.scale !== PER_100_SCALE) {
    throw new NutritionMacroError(
      `${label} must use the F16 per-100 scale of ${PER_100_SCALE} decimal places`,
    );
  }
  return parsed;
}

function multiplyExact(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  return {
    coefficient: left.coefficient * right.coefficient,
    scale: left.scale + right.scale,
  };
}

function addExact(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  const scale = left.scale > right.scale ? left.scale : right.scale;
  const leftCoefficient = left.coefficient * 10n ** BigInt(scale - left.scale);
  const rightCoefficient =
    right.coefficient * 10n ** BigInt(scale - right.scale);
  return {
    coefficient: leftCoefficient + rightCoefficient,
    scale,
  };
}

function divideByHundred(value: ExactDecimal): ExactDecimal {
  return {
    coefficient: value.coefficient,
    scale: value.scale + 2,
  };
}

function serializeExactDecimal(value: ExactDecimal): string {
  if (value.scale === 0) return value.coefficient.toString();

  const digits = value.coefficient.toString().padStart(value.scale + 1, '0');
  const whole = digits.slice(0, -value.scale);
  const fraction = digits.slice(-value.scale).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function roundToStorageScale(value: ExactDecimal): bigint {
  if (value.scale <= STORAGE_SCALE) {
    return value.coefficient * 10n ** BigInt(STORAGE_SCALE - value.scale);
  }

  const divisor = 10n ** BigInt(value.scale - STORAGE_SCALE);
  const quotient = value.coefficient / divisor;
  const remainder = value.coefficient % divisor;
  const comparison = remainder * 2n - divisor;

  if (comparison > 0n || (comparison === 0n && quotient % 2n !== 0n)) {
    return quotient + 1n;
  }
  return quotient;
}

function serializeStorageValue(value: bigint): string {
  if (value > STORAGE_MAX_SCALED) {
    throw new NutritionMacroError(
      'computed macro value exceeds numeric(12,4) storage precision',
    );
  }

  const whole = value / 10n ** BigInt(STORAGE_SCALE);
  const fraction = value % 10n ** BigInt(STORAGE_SCALE);
  return `${whole}.${fraction.toString().padStart(STORAGE_SCALE, '0')}`;
}

function isExactOne(value: ExactDecimal): boolean {
  return value.coefficient === 10n ** BigInt(value.scale);
}

function validateSnapshot(input: unknown): ValidatedSnapshot {
  if (!isRecord(input)) {
    throw new NutritionMacroError('food snapshot must be an object');
  }
  if (
    typeof input.foodVersionId !== 'string' ||
    input.foodVersionId.trim().length === 0
  ) {
    throw new NutritionMacroError('food snapshot foodVersionId is required');
  }
  if (input.basis !== 'g' && input.basis !== 'ml') {
    throw new NutritionMacroError('food snapshot basis must be g or ml');
  }
  if (!isRecord(input.per100)) {
    throw new NutritionMacroError('food snapshot per100 must be an object');
  }
  if (!isRecord(input.servingEquivalences)) {
    throw new NutritionMacroError(
      'food snapshot servingEquivalences must be an object',
    );
  }

  const per100: ExactMacroValues = {
    calories: parsePer100Decimal(input.per100.calories, 'per100.calories'),
    protein: parsePer100Decimal(input.per100.protein, 'per100.protein'),
    carbs: parsePer100Decimal(input.per100.carbs, 'per100.carbs'),
    fat: parsePer100Decimal(input.per100.fat, 'per100.fat'),
  };
  const servingEquivalences = new Map<string, ExactDecimal>();

  for (const [unit, equivalence] of Object.entries(input.servingEquivalences)) {
    if (unit.trim().length === 0) {
      throw new NutritionMacroError(
        'food snapshot serving equivalence unit is required',
      );
    }
    const parsed = parseExactDecimal(
      equivalence,
      `servingEquivalences.${unit}`,
      SERVING_EQUIVALENCE_MAX_SCALE,
      true,
    );
    servingEquivalences.set(unit, parsed);
  }

  const basisEquivalence = servingEquivalences.get(input.basis);
  if (basisEquivalence && !isExactOne(basisEquivalence)) {
    throw new NutritionMacroError(
      `the ${input.basis} basis serving equivalence must be exactly 1`,
    );
  }

  return {
    foodVersionId: input.foodVersionId,
    basis: input.basis,
    per100,
    servingEquivalences,
  };
}

function validateQuantity(input: unknown): {
  value: ExactDecimal;
  unit: string;
} {
  if (!isRecord(input)) {
    throw new NutritionMacroError('macro quantity must be an object');
  }
  if (typeof input.unit !== 'string' || input.unit.trim().length === 0) {
    throw new NutritionMacroError('macro quantity unit is required');
  }

  return {
    value: parseExactDecimal(
      input.value,
      'quantity.value',
      QUANTITY_MAX_SCALE,
      true,
    ),
    unit: input.unit,
  };
}

function computeExactMacro(input: NutritionMacroInput): {
  basisQuantity: ExactDecimal;
  macros: ExactMacroValues;
} {
  const snapshot = validateSnapshot(input.snapshot);
  const quantity = validateQuantity(input.quantity);
  const basisEquivalence =
    quantity.unit === snapshot.basis
      ? { coefficient: 1n, scale: 0 }
      : snapshot.servingEquivalences.get(quantity.unit);

  if (!basisEquivalence) {
    throw new NutritionMacroError(
      `unit ${quantity.unit} has no declared ${snapshot.basis} basis equivalence`,
    );
  }

  const basisQuantity = multiplyExact(quantity.value, basisEquivalence);
  const macros: ExactMacroValues = {
    calories: divideByHundred(
      multiplyExact(snapshot.per100.calories, basisQuantity),
    ),
    protein: divideByHundred(
      multiplyExact(snapshot.per100.protein, basisQuantity),
    ),
    carbs: divideByHundred(multiplyExact(snapshot.per100.carbs, basisQuantity)),
    fat: divideByHundred(multiplyExact(snapshot.per100.fat, basisQuantity)),
  };

  return { basisQuantity, macros };
}

function roundMacroValues(values: ExactMacroValues): NutritionMacroValues {
  return {
    calories: serializeStorageValue(roundToStorageScale(values.calories)),
    protein: serializeStorageValue(roundToStorageScale(values.protein)),
    carbs: serializeStorageValue(roundToStorageScale(values.carbs)),
    fat: serializeStorageValue(roundToStorageScale(values.fat)),
  };
}

export function computeNutritionMacro(
  input: NutritionMacroInput,
): NutritionMacroCalculation {
  const exact = computeExactMacro(input);
  return {
    basisQuantity: serializeExactDecimal(exact.basisQuantity),
    macros: roundMacroValues(exact.macros),
  };
}

export function computeNutritionMacroTotals(
  inputs: readonly NutritionMacroInput[],
): NutritionMacroValues {
  const totals: ExactMacroValues = {
    calories: { coefficient: 0n, scale: 0 },
    protein: { coefficient: 0n, scale: 0 },
    carbs: { coefficient: 0n, scale: 0 },
    fat: { coefficient: 0n, scale: 0 },
  };

  for (const input of inputs) {
    const exact = computeExactMacro(input);
    for (const nutrient of NUTRIENT_NAMES) {
      totals[nutrient] = addExact(totals[nutrient], exact.macros[nutrient]);
    }
  }

  return roundMacroValues(totals);
}
