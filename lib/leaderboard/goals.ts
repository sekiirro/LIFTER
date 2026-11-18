import type { MeasurementBaselineRow } from '../progress-coaching/contract';

/**
 * FR-018 goal-relative progress (PO decision 2026-11-14, option A).
 *
 * Trainers set one goal type per client. Progress compares the client's
 * first body weight with this month's latest (spec 023 baselines):
 * - fat loss:    % lost / 10%, capped at 1;
 * - muscle gain: % gained / 5%, capped at 1;
 * - maintenance: 1 - |% change| / 3%, floored at 0.
 * Fat loss and muscle gain are also floored at 0 (moving the wrong way is no
 * progress), so every result is on the [0, 1] scale the 50/50 composite uses.
 * No goal type or no usable weight means no value: the client is omitted.
 *
 * Server-only. Nothing here is rendered, audited or logged.
 */
export const GOAL_TYPES = ['fat_loss', 'muscle_gain', 'maintenance'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export function isGoalType(value: unknown): value is GoalType {
  return (GOAL_TYPES as readonly unknown[]).includes(value);
}

export const FAT_LOSS_TARGET = 0.1;
export const MUSCLE_GAIN_TARGET = 0.05;
export const MAINTENANCE_TOLERANCE = 0.03;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function goalProgress(
  goalType: GoalType,
  baselineWeight: number,
  latestWeight: number,
): number | null {
  if (
    !Number.isFinite(baselineWeight) ||
    !Number.isFinite(latestWeight) ||
    baselineWeight <= 0 ||
    latestWeight <= 0
  )
    return null;
  const change = (latestWeight - baselineWeight) / baselineWeight;
  switch (goalType) {
    case 'fat_loss':
      return clamp01(-change / FAT_LOSS_TARGET);
    case 'muscle_gain':
      return clamp01(change / MUSCLE_GAIN_TARGET);
    case 'maintenance':
      return clamp01(1 - Math.abs(change) / MAINTENANCE_TOLERANCE);
  }
}

/**
 * Body weight in the spec 023 contract. Measurement types are F15 check-in
 * question ids chosen per workspace, so main has no canonical weight id. The
 * rule: the client's one measurement type whose baseline and latest units are
 * both `kg`. When several qualify, the F15 starter weight question id `B04`
 * ("What is your current weight?", kg) wins if present. Anything else is
 * ambiguous and returns null (fail closed for that client).
 */
export const F15_STARTER_WEIGHT_QUESTION_ID = 'B04';

const isKg = (unit: string | null) => unit?.trim().toLowerCase() === 'kg';

export function bodyWeightBaseline(
  baselines: readonly MeasurementBaselineRow[],
): MeasurementBaselineRow | null {
  const kg = baselines.filter(
    (row) => isKg(row.baselineUnitEn) && isKg(row.latestUnitEn),
  );
  if (kg.length === 1) return kg[0]!;
  const starter = kg.filter(
    (row) => row.measurementType === F15_STARTER_WEIGHT_QUESTION_ID,
  );
  return starter.length === 1 ? starter[0]! : null;
}
