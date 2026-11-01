import { describe, expect, it } from 'vitest';
import { normalizeWorkoutTemplateDocument } from '../../lib/plans/workout/template-schema';
import { WorkoutValidationError } from '../../lib/plans/workout/schema';

const dayId = '10000000-0000-4000-8000-000000000001';
const itemId = '20000000-0000-4000-8000-000000000001';
const setId = '30000000-0000-4000-8000-000000000001';
const exercise = { source: 'global', id: 'bench-press', version: 1 };

type FixtureLoad = { mode: string; value?: string; unit?: string };
type FixtureSet = {
  id?: string;
  type?: string;
  reps?: { min?: number; max?: number; value?: number };
  load?: FixtureLoad;
  restSec?: number;
  rir?: number;
  notes?: string;
  [key: string]: unknown;
};
type FixtureItem = {
  id?: string;
  exercise?: {
    source: string;
    id: string;
    version: number;
    variation?: { id: string; version: number };
  };
  alternatives?: Array<{ source: string; id: string; version: number }>;
  sets?: FixtureSet[];
  [key: string]: unknown;
};
type FixtureDay = {
  id?: string;
  kind?: string;
  title?: string;
  notes?: string;
  items?: FixtureItem[];
  [key: string]: unknown;
};
type FixtureDocument = {
  days?: FixtureDay[];
  notes?: string;
  [key: string]: unknown;
};

function validDocument(): FixtureDocument {
  return {
    days: [
      {
        id: dayId,
        kind: 'session',
        title: 'Push',
        items: [
          {
            id: itemId,
            exercise,
            sets: [
              {
                id: setId,
                type: 'working',
                reps: { min: 8, max: 10 },
                load: { mode: 'added_weight', value: '20.5', unit: 'kg' },
                restSec: 90,
                rir: 2,
                notes: 'Controlled tempo',
              },
            ],
          },
        ],
      },
      { id: '10000000-0000-4000-8000-000000000002', kind: 'rest' },
    ],
    notes: 'Week one',
  };
}

describe('workout template document schema', () => {
  it('accepts ordered sessions, rest days, references, sets, and document notes', () => {
    expect(normalizeWorkoutTemplateDocument(validDocument())).toEqual(
      validDocument(),
    );
  });

  it('accepts variation references, alternatives, fixed reps, and all load variants', () => {
    const document = validDocument();
    const item = document.days![0]!.items![0]!;
    item.exercise = { ...exercise, variation: { id: 'paused', version: 2 } };
    item.alternatives = [{ source: 'workspace', id: 'db-press', version: 3 }];
    item.sets = [
      {
        id: setId,
        type: 'warmup',
        reps: { value: 5 },
        load: { mode: 'bodyweight' },
      },
      {
        id: '30000000-0000-4000-8000-000000000002',
        type: 'working',
        reps: { value: 8 },
        load: { mode: 'assisted', value: '12', unit: 'lb' },
      },
    ];
    expect(normalizeWorkoutTemplateDocument(document)).toEqual(document);
  });

  it.each([
    'clientId',
    'subscriptionId',
    'planId',
    'start_date',
    'clientNotes',
  ])('rejects client-bound key at top level: %s', (field) => {
    const document = { ...validDocument(), [field]: 'x' } as FixtureDocument;
    expect(() => normalizeWorkoutTemplateDocument(document)).toThrow(
      WorkoutValidationError,
    );
  });

  it.each([
    'clientId',
    'subscriptionId',
    'planId',
    'start_date',
    'clientNotes',
  ])('rejects client-bound key on a day: %s', (field) => {
    const document = validDocument();
    (document.days![0] as Record<string, unknown>)[field] = 'x';
    expect(() => normalizeWorkoutTemplateDocument(document)).toThrow(
      WorkoutValidationError,
    );
  });

  it.each([
    'clientId',
    'subscriptionId',
    'planId',
    'start_date',
    'clientNotes',
  ])('rejects client-bound key on an item: %s', (field) => {
    const document = validDocument();
    (document.days![0]!.items![0] as Record<string, unknown>)[field] = 'x';
    expect(() => normalizeWorkoutTemplateDocument(document)).toThrow(
      WorkoutValidationError,
    );
  });

  it.each([
    'clientId',
    'subscriptionId',
    'planId',
    'start_date',
    'clientNotes',
  ])('rejects client-bound key on a set: %s', (field) => {
    const document = validDocument();
    (document.days![0]!.items![0]!.sets![0] as Record<string, unknown>)[field] =
      'x';
    expect(() => normalizeWorkoutTemplateDocument(document)).toThrow(
      WorkoutValidationError,
    );
  });

  it.each([
    ['missing days', (d: FixtureDocument) => delete d.days],
    ['missing day id', (d: FixtureDocument) => delete d.days![0]!.id],
    ['missing day kind', (d: FixtureDocument) => delete d.days![0]!.kind],
    ['missing session items', (d: FixtureDocument) => delete d.days![0]!.items],
    [
      'missing item id',
      (d: FixtureDocument) => delete d.days![0]!.items![0]!.id,
    ],
    [
      'missing exercise reference',
      (d: FixtureDocument) => delete d.days![0]!.items![0]!.exercise,
    ],
    [
      'missing sets',
      (d: FixtureDocument) => delete d.days![0]!.items![0]!.sets,
    ],
    [
      'missing set id',
      (d: FixtureDocument) => delete d.days![0]!.items![0]!.sets![0]!.id,
    ],
    [
      'missing set type',
      (d: FixtureDocument) => delete d.days![0]!.items![0]!.sets![0]!.type,
    ],
    [
      'missing reps',
      (d: FixtureDocument) => delete d.days![0]!.items![0]!.sets![0]!.reps,
    ],
    [
      'missing load',
      (d: FixtureDocument) => delete d.days![0]!.items![0]!.sets![0]!.load,
    ],
  ])('rejects %s', (_label, mutate) => {
    const document = validDocument();
    mutate(document);
    expect(() => normalizeWorkoutTemplateDocument(document)).toThrow(
      WorkoutValidationError,
    );
  });

  it.each([
    [
      'invalid reps range',
      (d: FixtureDocument) =>
        (d.days![0]!.items![0]!.sets![0]!.reps = { min: 10, max: 8 }),
    ],
    [
      'bodyweight with value',
      (d: FixtureDocument) =>
        (d.days![0]!.items![0]!.sets![0]!.load = {
          mode: 'bodyweight',
          value: '2',
        }),
    ],
    [
      'added weight without unit',
      (d: FixtureDocument) =>
        delete d.days![0]!.items![0]!.sets![0]!.load!.unit,
    ],
    [
      'assisted with zero load',
      (d: FixtureDocument) =>
        (d.days![0]!.items![0]!.sets![0]!.load = {
          mode: 'assisted',
          value: '0',
          unit: 'kg',
        }),
    ],
    [
      'negative rest',
      (d: FixtureDocument) => (d.days![0]!.items![0]!.sets![0]!.restSec = -1),
    ],
    [
      'negative RIR',
      (d: FixtureDocument) => (d.days![0]!.items![0]!.sets![0]!.rir = -1),
    ],
  ])('rejects %s', (_label, mutate) => {
    const document = validDocument();
    mutate(document);
    expect(() => normalizeWorkoutTemplateDocument(document)).toThrow(
      WorkoutValidationError,
    );
  });
});
