import { describe, expect, it } from 'vitest';
import { exerciseInput } from '../../lib/catalog/exercise-input';
import { normalizeExerciseInput } from '../../lib/catalog/schemas';

const validRow = () => ({
  name_ar: 'تمرين',
  name_en: 'Exercise',
  payload: {
    name_ar: 'تمرين',
    name_en: 'Exercise',
    primary_muscle_code: 'chest',
    secondary_muscle_codes: [],
    equipment_codes: ['barbell'],
    description: 'Press description',
    effective_fields: {
      name: {
        value: { name_ar: 'تمرين', name_en: 'Exercise' },
        source: 'canonical',
      },
      description: { value: 'Press description', source: 'canonical' },
      notes: { value: 'Coach note', source: 'canonical' },
      video: { value: null, source: 'none' },
      alternatives: {
        value: [{ global_exercise_id: 'mock-alternative' }],
        source: 'canonical',
      },
      default_rest_time: { value: 90, source: 'canonical' },
      default_rir: { value: 2, source: 'canonical' },
      default_reps: { value: { min: 8, max: 12 }, source: 'canonical' },
    },
  },
  lifecycle_state: 'active',
});

describe('exercise row input mapping', () => {
  it('reads the eight resolved fields from the staff read projection', () => {
    expect(exerciseInput(validRow())).toMatchObject({
      names: { ar: 'تمرين', en: 'Exercise' },
      description: 'Press description',
      notes: 'Coach note',
      primaryMuscle: 'chest',
      equipment: 'barbell',
      defaults: {
        reps: { kind: 'range', min: 8, max: 12 },
        restSeconds: 90,
        rir: 2,
        alternativeExerciseIds: ['mock-alternative'],
      },
    });
  });

  it('allows an English-only resolved name without inventing Arabic text', () => {
    const row = validRow();
    row.payload.effective_fields.name.value = {
      name_ar: null,
      name_en: 'English only',
    } as never;
    row.payload.name_ar = undefined as never;
    row.name_ar = undefined as never;
    expect(exerciseInput(row)).toMatchObject({
      names: { en: 'English only' },
    });
  });

  it.each([
    ['name_en', undefined],
    ['name_en', null],
    ['name_en', { malformed: true }],
  ] as const)(
    'rejects a non-string %s instead of coercing it',
    (field, value) => {
      const row = validRow();
      row.payload.name_en = value as never;
      row.name_en = value as never;
      (
        row.payload.effective_fields.name.value as Record<string, unknown>
      ).name_en = value;
      expect(() => normalizeExerciseInput(exerciseInput(row)!)).toThrow();
    },
  );

  it('does not coerce malformed array members into catalog identifiers', () => {
    const row = validRow();
    (row.payload as Record<string, unknown>).secondary_muscle_codes = [null];
    expect(exerciseInput(row)).toBeNull();
  });
});
