import { describe, expect, it } from 'vitest';
import { exerciseInput } from '../../lib/catalog/exercise-input';
import { normalizeExerciseInput } from '../../lib/catalog/schemas';

const validRow = () => ({
  name_ar: 'تمرين',
  name_en: 'Exercise',
  payload: {
    primary_muscle_code: 'chest',
    secondary_muscle_codes: [],
    equipment_codes: ['barbell'],
    defaults: {},
  },
  lifecycle_state: 'active',
});

describe('exercise row input mapping', () => {
  it.each([
    ['name_ar', undefined],
    ['name_ar', null],
    ['name_ar', { malformed: true }],
    ['name_en', undefined],
    ['name_en', null],
    ['name_en', { malformed: true }],
  ] as const)(
    'rejects non-string %s instead of coercing it',
    (field, value) => {
      const row = { ...validRow(), [field]: value };
      expect(() => normalizeExerciseInput(exerciseInput(row)!)).toThrow();
    },
  );
});
