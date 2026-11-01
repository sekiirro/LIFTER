import type { WorkoutDocument, WorkoutExerciseReference } from './schema';

export type WorkoutVolumeExerciseSnapshot = {
  exercise: WorkoutExerciseReference;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
};

export type WorkoutVolumeSnapshots = readonly WorkoutVolumeExerciseSnapshot[];

export type WorkoutMuscleTotals = Readonly<Record<string, number>>;

export type WorkoutVolumeSession = {
  readonly dayId: string;
  readonly title?: string;
  readonly totals: WorkoutMuscleTotals;
};

export type WorkoutVolumeReport = {
  readonly sessions: readonly WorkoutVolumeSession[];
  readonly weekTotals: WorkoutMuscleTotals;
};

export class WorkoutVolumeError extends Error {
  readonly code = 'invalid_workout_volume';

  constructor(message: string) {
    super(message);
    this.name = 'WorkoutVolumeError';
  }
}

export const SECONDARY_MUSCLE_CREDIT_BASIS_POINTS = 5_000;

const PRIMARY_MUSCLE_CREDIT_BASIS_POINTS = 10_000;
const BASIS_POINTS_PER_CREDIT = 10_000;

type IndexedExerciseSnapshot = {
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new WorkoutVolumeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new WorkoutVolumeError(`${label} must be a positive integer`);
  }
  return value as number;
}

function normalizeExerciseReference(
  value: unknown,
  label: string,
): WorkoutExerciseReference {
  if (!isRecord(value)) {
    throw new WorkoutVolumeError(`${label} must be an object`);
  }
  if (value.source !== 'global' && value.source !== 'workspace') {
    throw new WorkoutVolumeError(
      `${label}.source must be one of: global, workspace`,
    );
  }

  const reference: WorkoutExerciseReference = {
    source: value.source,
    id: requireNonEmptyString(value.id, `${label}.id`),
    version: requirePositiveInteger(value.version, `${label}.version`),
  };

  if (value.variation !== undefined) {
    if (!isRecord(value.variation)) {
      throw new WorkoutVolumeError(`${label}.variation must be an object`);
    }
    reference.variation = {
      id: requireNonEmptyString(value.variation.id, `${label}.variation.id`),
      version: requirePositiveInteger(
        value.variation.version,
        `${label}.variation.version`,
      ),
    };
  }

  return reference;
}

function normalizeMuscleCodes(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new WorkoutVolumeError(`${label} must be an array`);
  }

  const muscles: string[] = [];
  for (const [index, muscle] of value.entries()) {
    const code = requireNonEmptyString(muscle, `${label}[${index}]`);
    if (muscles.includes(code)) {
      throw new WorkoutVolumeError(`${label}[${index}] must be unique`);
    }
    muscles.push(code);
  }
  return muscles;
}

function exerciseIdentity(reference: WorkoutExerciseReference): string {
  return JSON.stringify([
    reference.source,
    reference.id,
    reference.version,
    reference.variation?.id ?? null,
    reference.variation?.version ?? null,
  ]);
}

function indexSnapshots(
  snapshots: WorkoutVolumeSnapshots,
): Map<string, IndexedExerciseSnapshot> {
  if (!Array.isArray(snapshots)) {
    throw new WorkoutVolumeError('Volume snapshots must be an array');
  }

  const indexed = new Map<string, IndexedExerciseSnapshot>();
  snapshots.forEach((snapshot, index) => {
    if (!isRecord(snapshot)) {
      throw new WorkoutVolumeError(
        `Volume snapshots[${index}] must be an object`,
      );
    }

    const exercise = normalizeExerciseReference(
      snapshot.exercise,
      `Volume snapshots[${index}].exercise`,
    );
    const primaryMuscles = normalizeMuscleCodes(
      snapshot.primaryMuscles,
      `Volume snapshots[${index}].primaryMuscles`,
    );
    const secondaryMuscles = normalizeMuscleCodes(
      snapshot.secondaryMuscles,
      `Volume snapshots[${index}].secondaryMuscles`,
    );
    const primarySet = new Set(primaryMuscles);
    const overlappingMuscle = secondaryMuscles.find((muscle) =>
      primarySet.has(muscle),
    );
    if (overlappingMuscle !== undefined) {
      throw new WorkoutVolumeError(
        `Volume snapshots[${index}] cannot credit "${overlappingMuscle}" as both primary and secondary`,
      );
    }

    const identity = exerciseIdentity(exercise);
    if (indexed.has(identity)) {
      throw new WorkoutVolumeError(
        `Volume snapshots[${index}] duplicates an earlier exercise snapshot`,
      );
    }
    indexed.set(identity, { primaryMuscles, secondaryMuscles });
  });

  return indexed;
}

function addBasisPoints(
  totals: Map<string, number>,
  muscle: string,
  basisPoints: number,
): void {
  totals.set(muscle, (totals.get(muscle) ?? 0) + basisPoints);
}

function toMuscleTotals(totals: Map<string, number>): WorkoutMuscleTotals {
  const result: Record<string, number> = {};
  for (const [muscle, basisPoints] of totals) {
    result[muscle] = basisPoints / BASIS_POINTS_PER_CREDIT;
  }
  return result;
}

function describeExercise(reference: WorkoutExerciseReference): string {
  const variation = reference.variation
    ? ` variation "${reference.variation.id}" version ${reference.variation.version}`
    : '';
  return `${reference.source} exercise "${reference.id}" version ${reference.version}${variation}`;
}

export function calculateWorkoutVolume(
  document: WorkoutDocument,
  snapshots: WorkoutVolumeSnapshots,
): WorkoutVolumeReport {
  const indexedSnapshots = indexSnapshots(snapshots);
  const sessions: WorkoutVolumeSession[] = [];
  const weekBasisPoints = new Map<string, number>();

  for (const day of document.days) {
    if (day.kind !== 'session') continue;

    const sessionBasisPoints = new Map<string, number>();
    for (const item of day.items ?? []) {
      const workingSetCount = item.sets.reduce(
        (count, set) => count + (set.type === 'working' ? 1 : 0),
        0,
      );
      if (workingSetCount === 0) continue;

      const identity = exerciseIdentity(item.exercise);
      const snapshot = indexedSnapshots.get(identity);
      if (snapshot === undefined) {
        throw new WorkoutVolumeError(
          `Missing volume snapshot for ${describeExercise(item.exercise)}`,
        );
      }

      for (let setIndex = 0; setIndex < workingSetCount; setIndex += 1) {
        for (const muscle of snapshot.primaryMuscles) {
          addBasisPoints(
            sessionBasisPoints,
            muscle,
            PRIMARY_MUSCLE_CREDIT_BASIS_POINTS,
          );
        }
        for (const muscle of snapshot.secondaryMuscles) {
          addBasisPoints(
            sessionBasisPoints,
            muscle,
            SECONDARY_MUSCLE_CREDIT_BASIS_POINTS,
          );
        }
      }
    }

    const totals = toMuscleTotals(sessionBasisPoints);
    for (const [muscle, basisPoints] of sessionBasisPoints) {
      addBasisPoints(weekBasisPoints, muscle, basisPoints);
    }
    sessions.push({
      dayId: day.id,
      ...(day.title === undefined ? {} : { title: day.title }),
      totals,
    });
  }

  return {
    sessions,
    weekTotals: toMuscleTotals(weekBasisPoints),
  };
}
