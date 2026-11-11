import { describe, expect, it } from 'vitest';
import {
  buildOverrideRequest,
  overrideDraftFromExercise,
  overrideSources,
  validateOverrideDraft,
  type OverrideField,
} from '../../lib/catalog/exercise-override';
import { normalizeExerciseInput } from '../../lib/catalog/schemas';

const exercise = normalizeExerciseInput({
  names: { ar: 'ضغط الصدر', en: 'Bench press' },
  primaryMuscle: 'chest',
  equipment: 'barbell',
  description: 'Resolved description',
  notes: 'Resolved note',
  videoUrl: 'https://youtu.be/abcdef',
  defaults: {
    reps: { kind: 'range', min: 8, max: 12 },
    restSeconds: 90,
    rir: 2,
    alternativeExerciseIds: ['g:global-1'],
  },
});

const dirty = (...fields: OverrideField[]) => new Set(fields);
const currentId = '55555555-5555-4555-8555-555555555555';

describe('workspace exercise override', () => {
  it('starts from the resolved eight fields', () => {
    const draft = overrideDraftFromExercise(exercise);
    expect(draft).toMatchObject({
      names: { ar: 'ضغط الصدر', en: 'Bench press' },
      description: 'Resolved description',
      notes: 'Resolved note',
      videoUrl: 'https://youtu.be/abcdef',
      repsMode: 'range',
      repsMin: '8',
      repsMax: '12',
      restSeconds: '90',
      rir: '2',
      alternativeExerciseIds: ['g:global-1'],
    });
  });

  it('reads per-field sources from the effective projection', () => {
    expect(
      overrideSources({
        name: { source: 'override' },
        description: { source: 'canonical' },
        notes: { source: 'none' },
        video: { source: 'override' },
        alternatives: { source: 'override' },
        default_rest_time: { source: 'canonical' },
        default_rir: { source: 'canonical' },
        default_reps: { source: 'canonical' },
      }),
    ).toEqual({
      name: 'override',
      description: 'inherited',
      notes: 'inherited',
      video: 'override',
      alternatives: 'override',
      default_rest_time: 'inherited',
      default_rir: 'inherited',
      default_reps: 'inherited',
    });
  });

  it('validates only the fields the user touched', () => {
    const draft = {
      ...overrideDraftFromExercise(exercise),
      description: 'x'.repeat(2001),
      repsValue: '',
      repsMin: '',
      repsMax: '',
    };
    expect(
      validateOverrideDraft(draft, dirty('description'), currentId),
    ).toEqual({ description: 'description_too_long' });
    expect(validateOverrideDraft(draft, dirty('notes'), currentId)).toEqual({});
  });

  it('rejects duplicate and self alternatives', () => {
    const base = overrideDraftFromExercise(exercise);
    expect(
      validateOverrideDraft(
        { ...base, alternativeExerciseIds: ['g:same', 'g:same'] },
        dirty('alternatives'),
        currentId,
      ).alternatives,
    ).toBe('duplicate_alternative');
    expect(
      validateOverrideDraft(
        { ...base, alternativeExerciseIds: [`g:${currentId}`] },
        dirty('alternatives'),
        currentId,
      ).alternatives,
    ).toBe('self_alternative');
    expect(
      validateOverrideDraft(
        { ...base, alternativeExerciseIds: [] },
        dirty('alternatives'),
        currentId,
      ),
    ).toEqual({});
  });

  it('builds only touched fields and writes null for cleared values', () => {
    const draft = {
      ...overrideDraftFromExercise(exercise),
      description: '  ',
      notes: 'New note',
      videoUrl: '',
      restSeconds: '120',
    };
    expect(
      buildOverrideRequest(
        draft,
        dirty('description', 'notes', 'video', 'default_rest_time'),
      ),
    ).toEqual({
      description: null,
      notes: 'New note',
      video_url: null,
      default_rest_time: 120,
    });
  });

  it('builds typed Alternative targets for both scopes', () => {
    const draft = {
      ...overrideDraftFromExercise(exercise),
      alternativeExerciseIds: ['g:global-1', 'w:private-1'],
    };
    expect(buildOverrideRequest(draft, dirty('alternatives'))).toEqual({
      alternatives: [
        { global_exercise_id: 'global-1' },
        { workspace_exercise_id: 'private-1' },
      ],
    });
  });

  it('writes null for a cleared Arabic name and Default Reps', () => {
    const draft = {
      ...overrideDraftFromExercise(exercise),
      names: { ar: '', en: 'Bench press' },
      repsMode: 'fixed' as const,
      repsValue: '',
      repsMin: '',
      repsMax: '',
    };
    expect(buildOverrideRequest(draft, dirty('name', 'default_reps'))).toEqual({
      name_en: 'Bench press',
      name_ar: null,
      default_reps: null,
    });
  });
});
