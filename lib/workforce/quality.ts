/**
 * Workforce quality mathematics and formatting helpers (FR-006, FR-009, FR-020, FR-023).
 * Scale 2 exact decimal canonical representation, non-negative counts, per-Trainer defaults.
 */

import { decimalToMinorUnits, minorUnitsToDecimal } from './payroll-money';

const DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;
const MAX_COUNT = 2_147_483_647;
const MAX_MINOR_UNITS = 9_999_999_999n;
const MIN_MINOR_UNITS = -MAX_MINOR_UNITS;

function parseQualityDecimal(value: string | number, label: string): bigint {
  const text = String(value).trim();
  if (!DECIMAL_REGEX.test(text)) {
    throw new Error(`Invalid decimal format: ${text}`);
  }
  const fraction = text.split('.')[1];
  if (fraction && fraction.length > 2) {
    throw new Error(`${label} has at most two decimal places allowed`);
  }
  const minor = decimalToMinorUnits(text);
  if (minor === null) {
    throw new Error(`Invalid decimal format: ${text}`);
  }
  if (minor < MIN_MINOR_UNITS || minor > MAX_MINOR_UNITS) {
    throw new Error(`${label} is outside the numeric(10,2) range`);
  }
  return minor;
}

export function formatExactDecimal(val: number | string): string {
  return minorUnitsToDecimal(parseQualityDecimal(val, 'Value'));
}

export function validateQualityWeights(weights: {
  positiveWeight?: string | number | null;
  negativeWeight?: string | number | null;
}): void {
  if (weights.positiveWeight !== undefined && weights.positiveWeight !== null) {
    parseQualityDecimal(weights.positiveWeight, 'Positive weight');
  }
  if (weights.negativeWeight !== undefined && weights.negativeWeight !== null) {
    parseQualityDecimal(weights.negativeWeight, 'Negative weight');
  }
}

export function validateMonthFormat(month: string): boolean {
  if (typeof month !== 'string') return false;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

export interface QualityPointsParams {
  category: 'transformation' | 'feedback';
  positiveCount: number;
  negativeCount?: number;
  positiveWeight?: string | number | null;
  negativeWeight?: string | number | null;
}

export interface QualityPointsResult {
  positiveCount: number;
  negativeCount: number;
  positiveWeight: string;
  negativeWeight: string;
  netPoints: string;
}

export function calculateQualityPoints(
  params: QualityPointsParams,
): QualityPointsResult {
  const { category, positiveCount, negativeCount = 0 } = params;

  if (
    !Number.isSafeInteger(positiveCount) ||
    positiveCount < 0 ||
    positiveCount > MAX_COUNT
  ) {
    throw new Error(
      `positiveCount must be a non-negative integer within PostgreSQL integer range: ${positiveCount}`,
    );
  }
  if (
    !Number.isSafeInteger(negativeCount) ||
    negativeCount < 0 ||
    negativeCount > MAX_COUNT
  ) {
    throw new Error(
      `negativeCount must be a non-negative integer within PostgreSQL integer range: ${negativeCount}`,
    );
  }
  if (category !== 'transformation' && category !== 'feedback') {
    throw new Error(`Invalid quality category: ${String(category)}`);
  }
  if (category === 'transformation' && negativeCount > 0) {
    throw new Error('transformation does not support negative count');
  }

  validateQualityWeights({
    positiveWeight: params.positiveWeight,
    negativeWeight: params.negativeWeight,
  });

  const positiveWeightMinor =
    params.positiveWeight !== undefined && params.positiveWeight !== null
      ? parseQualityDecimal(params.positiveWeight, 'Positive weight')
      : 100n;
  const negativeWeightMinor =
    category === 'transformation'
      ? 0n
      : params.negativeWeight !== undefined && params.negativeWeight !== null
        ? parseQualityDecimal(params.negativeWeight, 'Negative weight')
        : -100n;

  const totalMinor =
    BigInt(positiveCount) * positiveWeightMinor +
    BigInt(negativeCount) * negativeWeightMinor;
  if (totalMinor < MIN_MINOR_UNITS || totalMinor > MAX_MINOR_UNITS) {
    throw new Error('Net points are outside the numeric(10,2) range');
  }

  return {
    positiveCount,
    negativeCount,
    positiveWeight: minorUnitsToDecimal(positiveWeightMinor),
    negativeWeight: minorUnitsToDecimal(negativeWeightMinor),
    netPoints: minorUnitsToDecimal(totalMinor),
  };
}
