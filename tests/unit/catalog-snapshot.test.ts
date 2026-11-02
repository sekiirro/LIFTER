import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  toExerciseSnapshot,
  toFoodSnapshot,
  serializeSnapshot,
  parseSnapshot,
} from '../../lib/catalog/snapshot';

const FIXTURE_DIR = join(
  process.cwd(),
  'tests',
  'fixtures',
  'catalog-snapshots',
);

function readFixture(name: string): string {
  const fixture = JSON.parse(
    readFileSync(join(FIXTURE_DIR, name), 'utf8'),
  ) as unknown;
  const canonical = JSON.stringify(fixture, null, 2);
  if (canonical === undefined) {
    throw new Error(`Invalid catalog snapshot fixture: ${name}`);
  }
  return canonical;
}

const exerciseVersion = {
  exerciseId: 'ex-1',
  version: 3,
  names: { ar: 'تمرين', en: 'Exercise' },
  primaryMuscle: 'chest',
  secondaryMuscles: ['biceps', 'triceps'],
  equipment: 'barbell',
  defaults: {
    warmupSets: 1,
    workingSets: 3,
    reps: { kind: 'range', min: 8, max: 12 },
    restSeconds: 90,
    rir: 2,
  },
  // junk that must not leak
  videoUrl: 'https://youtube.com/watch?v=abc',
  workspaceVariationId: 'var-9',
  variation: { id: 'v1', videoUrl: 'https://drive.google.com/x' },
  notes: { ar: 'ملاحظة' },
};

const rawFoodVersion = {
  foodId: 'food-raw',
  version: 1,
  names: { ar: 'أرز خام', en: 'Rice raw' },
  basis: 'g' as const,
  productIdentity: 'rice',
  preparationIdentity: 'raw grain',
  weighingState: 'raw' as const,
  kcal: 360,
  protein: 7,
  carbs: 78,
  fat: 0.7,
  fiber: 1.3,
  servings: [
    { id: 'srv-100', labels: { ar: '100 غ', en: '100 g' }, basisQuantity: 100 },
    { id: 'srv-cup', labels: { ar: 'كوب', en: 'cup' }, basisQuantity: 185 },
  ],
};

const cookedFoodVersion = {
  foodId: 'food-cooked',
  version: 2,
  names: { ar: 'أرز مطبوخ', en: 'Rice cooked' },
  basis: 'g' as const,
  productIdentity: 'rice',
  preparationIdentity: 'boiled',
  weighingState: 'cooked' as const,
  kcal: 130,
  protein: 2.7,
  carbs: 28,
  fat: 0.3,
  fiber: 0.4,
  servings: [
    { id: 'srv-100', labels: { ar: '100 غ', en: '100 g' }, basisQuantity: 100 },
  ],
};

describe('catalog snapshot (T031)', () => {
  it('exercise builder produces golden output byte-for-byte', () => {
    const snapshot = toExerciseSnapshot(exerciseVersion);
    expect(serializeSnapshot(snapshot)).toBe(
      readFixture('exercise-with-secondary-muscles.json').trim(),
    );
  });

  it('raw food builder produces golden output byte-for-byte', () => {
    const snapshot = toFoodSnapshot(rawFoodVersion, 'srv-100');
    expect(serializeSnapshot(snapshot)).toBe(
      readFixture('food-raw.json').trim(),
    );
  });

  it('cooked food builder produces golden output byte-for-byte', () => {
    const snapshot = toFoodSnapshot(cookedFoodVersion, 'srv-100');
    expect(serializeSnapshot(snapshot)).toBe(
      readFixture('food-cooked.json').trim(),
    );
  });

  it('throws for an unknown servingId', () => {
    expect(() => toFoodSnapshot(rawFoodVersion, 'missing-serving')).toThrow(
      'serving not found',
    );
  });

  it('throws when servingId is missing, null, or empty', () => {
    for (const servingId of [undefined, null, '']) {
      expect(() => toFoodSnapshot(rawFoodVersion, servingId)).toThrow(
        'servingId must be a non-empty string',
      );
    }
  });

  it('throws when an exercise is missing names.ar', () => {
    expect(() =>
      toExerciseSnapshot({
        ...exerciseVersion,
        names: { en: 'Exercise' },
      }),
    ).toThrow('name ar must be a non-empty string');
  });

  it('food snapshot contains the selected servingId', () => {
    const snapshot = toFoodSnapshot(rawFoodVersion, 'srv-cup');
    expect(snapshot.serving.servingId).toBe('srv-cup');
  });

  it('serialization is stable across key order', () => {
    const snapshot = toExerciseSnapshot(exerciseVersion);
    const reordered = {
      equipment: snapshot.equipment,
      version: snapshot.version,
      exerciseId: snapshot.exerciseId,
      secondaryMuscles: snapshot.secondaryMuscles,
      names: { en: snapshot.names.en, ar: snapshot.names.ar },
      primaryMuscle: snapshot.primaryMuscle,
      defaults: snapshot.defaults
        ? {
            rir: snapshot.defaults.rir,
            reps: snapshot.defaults.reps,
            workingSets: snapshot.defaults.workingSets,
            warmupSets: snapshot.defaults.warmupSets,
            restSeconds: snapshot.defaults.restSeconds,
          }
        : undefined,
    };
    expect(serializeSnapshot(reordered)).toBe(serializeSnapshot(snapshot));
  });

  it('later catalog edits do not change an existing snapshot', () => {
    const snapshot = toExerciseSnapshot(exerciseVersion);
    const before = serializeSnapshot(snapshot);
    const anotherVersion = { ...exerciseVersion, version: 4, kcal: 999 };
    toExerciseSnapshot(anotherVersion);
    expect(serializeSnapshot(snapshot)).toBe(before);
  });

  it('never includes a video URL or workspace variation from input', () => {
    const snapshot = toExerciseSnapshot(exerciseVersion);
    const out = serializeSnapshot(snapshot);
    expect(out).not.toContain('youtube');
    expect(out).not.toContain('drive.google');
    expect(out).not.toContain('videoUrl');
    expect(out).not.toContain('workspaceVariationId');
    expect(out).not.toContain('variation');
  });

  it('parse rejects an injected URL field', () => {
    const snapshot = toExerciseSnapshot(exerciseVersion);
    const json = serializeSnapshot(snapshot);
    const obj = JSON.parse(json);
    obj.videoUrl = 'https://youtube.com/watch?v=abc';
    expect(() => parseSnapshot(obj)).toThrow();
  });

  it('parse rejects an unknown key', () => {
    const snapshot = toExerciseSnapshot(exerciseVersion);
    const json = serializeSnapshot(snapshot);
    const obj = JSON.parse(json);
    obj.foo = 'bar';
    expect(() => parseSnapshot(obj)).toThrow();
  });

  it('parse rejects missing exercise locales and non-string secondary muscles', () => {
    const snapshot = toExerciseSnapshot(exerciseVersion);
    const missingLocale = JSON.parse(serializeSnapshot(snapshot));
    missingLocale.names = { en: 'Exercise' };
    expect(() => parseSnapshot(missingLocale)).toThrow(/names\.ar/);
    const invalidMuscle = JSON.parse(serializeSnapshot(snapshot));
    invalidMuscle.secondaryMuscles = ['biceps', 7];
    expect(() => parseSnapshot(invalidMuscle)).toThrow(/secondaryMuscles/);
  });

  it('parse and food builder require at least one non-empty food name', () => {
    const snapshot = toFoodSnapshot(rawFoodVersion, 'srv-100');
    const missingNames = JSON.parse(serializeSnapshot(snapshot));
    missingNames.names = {};
    expect(() => parseSnapshot(missingNames)).toThrow(/at least one/);
    expect(() =>
      toFoodSnapshot({ ...rawFoodVersion, names: {} }, 'srv-100'),
    ).toThrow(/at least one/);
  });

  it('parse rejects mistyped nested labels and snapshot values', () => {
    const snapshot = toFoodSnapshot(rawFoodVersion, 'srv-100');
    const invalidLabel = JSON.parse(serializeSnapshot(snapshot));
    invalidLabel.serving.labels.en = 3;
    expect(() => parseSnapshot(invalidLabel)).toThrow(/labels/);
    const invalidNutrition = JSON.parse(serializeSnapshot(snapshot));
    invalidNutrition.kcal = -1;
    expect(() => parseSnapshot(invalidNutrition)).toThrow(/kcal/);
  });

  it('raw and cooked food snapshots stay distinct', () => {
    const raw = serializeSnapshot(toFoodSnapshot(rawFoodVersion, 'srv-100'));
    const cooked = serializeSnapshot(
      toFoodSnapshot(cookedFoodVersion, 'srv-100'),
    );
    expect(raw).not.toBe(cooked);
  });
});
