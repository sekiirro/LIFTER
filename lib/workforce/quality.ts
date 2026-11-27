/**
 * Workforce quality mathematics and formatting helpers (FR-006, FR-009, FR-020, FR-023).
 * Scale 2 exact decimal canonical representation, non-negative counts, per-Trainer defaults.
 */

export function formatExactDecimal(val: number | string): string {
  const str = String(val).trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Invalid decimal format: ${str}`);
  }
  const parts = str.split('.');
  if (parts[1] && parts[1].length > 2) {
    throw new Error(`Value ${str} has more than two decimal places`);
  }
  const num = Number(str);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid numeric value: ${str}`);
  }
  const normalized = num === 0 ? 0 : num;
  return normalized.toFixed(2);
}

export function validateQualityWeights(weights: {
  positiveWeight?: string | number | null;
  negativeWeight?: string | number | null;
}): void {
  if (weights.positiveWeight !== undefined && weights.positiveWeight !== null) {
    const s = String(weights.positiveWeight).trim();
    const parts = s.split('.');
    if (parts[1] && parts[1].length > 2) {
      throw new Error(
        `Positive weight ${s} has at most two decimal places allowed`,
      );
    }
  }
  if (weights.negativeWeight !== undefined && weights.negativeWeight !== null) {
    const s = String(weights.negativeWeight).trim();
    const parts = s.split('.');
    if (parts[1] && parts[1].length > 2) {
      throw new Error(
        `Negative weight ${s} has at most two decimal places allowed`,
      );
    }
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

  if (!Number.isInteger(positiveCount) || positiveCount < 0) {
    throw new Error(
      `positiveCount must be a non-negative integer: ${positiveCount}`,
    );
  }
  if (!Number.isInteger(negativeCount) || negativeCount < 0) {
    throw new Error(
      `negativeCount must be a non-negative integer: ${negativeCount}`,
    );
  }

  if (category === 'transformation' && negativeCount > 0) {
    throw new Error('transformation does not support negative count');
  }

  validateQualityWeights({
    positiveWeight: params.positiveWeight,
    negativeWeight: params.negativeWeight,
  });

  let posWeight: number;
  let negWeight: number;

  if (category === 'transformation') {
    posWeight =
      params.positiveWeight !== undefined && params.positiveWeight !== null
        ? Number(params.positiveWeight)
        : 1.0;
    negWeight = 0.0;
  } else {
    posWeight =
      params.positiveWeight !== undefined && params.positiveWeight !== null
        ? Number(params.positiveWeight)
        : 1.0;
    negWeight =
      params.negativeWeight !== undefined && params.negativeWeight !== null
        ? Number(params.negativeWeight)
        : -1.0;
  }

  const posCents = Math.round(posWeight * 100);
  const negCents = Math.round(negWeight * 100);
  const totalCents = positiveCount * posCents + negativeCount * negCents;
  const netNumeric = totalCents / 100;
  const netPoints = (netNumeric === 0 ? 0 : netNumeric).toFixed(2);

  return {
    positiveCount,
    negativeCount,
    positiveWeight: formatExactDecimal(posWeight),
    negativeWeight: formatExactDecimal(negWeight),
    netPoints,
  };
}
