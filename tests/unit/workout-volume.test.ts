import { describe, expect, it } from 'vitest';
import type {
  WorkoutDocument,
  WorkoutExerciseReference,
  WorkoutItem,
  WorkoutSet,
} from '../../lib/plans/workout/schema';
import {
  calculateWorkoutVolume,
  SECONDARY_MUSCLE_CREDIT_BASIS_POINTS,
  WorkoutVolumeError,
  type WorkoutVolumeExerciseSnapshot,
  type WorkoutVolumeSnapshots,
} from '../../lib/plans/workout/volume';

const DAY_ONE_ID = '10000000-0000-4000-8000-000000000001';
const DAY_TWO_ID = '10000000-0000-4000-8000-000000000002';
const REST_DAY_ID = '10000000-0000-4000-8000-000000000003';

const BENCH_PRESS: WorkoutExerciseReference = {
  source: 'global',
  id: 'bench-press',
  version: 1,
};
const PUSH_UP: WorkoutExerciseReference = {
  source: 'global',
  id: 'push-up',
  version: 1,
};
const ROW: WorkoutExerciseReference = {
  source: 'global',
  id: 'row',
  version: 2,
};
const PAUSED_BENCH_PRESS: WorkoutExerciseReference = {
  source: 'global',
  id: 'bench-press',
  version: 1,
  variation: { id: 'paused', version: 3 },
};

function workingSet(id: string): WorkoutSet {
  return {
    id,
    type: 'working',
    reps: { value: 8 },
    load: { mode: 'bodyweight' },
  };
}

function warmupSet(id: string): WorkoutSet {
  return {
    id,
    type: 'warmup',
    reps: { value: 10 },
    load: { mode: 'bodyweight' },
  };
}

function exerciseItem(
  id: string,
  exercise: WorkoutExerciseReference,
  sets: WorkoutSet[],
): WorkoutItem {
  return { id, exercise, sets };
}

function snapshot(
  exercise: WorkoutExerciseReference,
  primaryMuscles: readonly string[],
  secondaryMuscles: readonly string[] = [],
): WorkoutVolumeExerciseSnapshot {
  return { exercise, primaryMuscles, secondaryMuscles };
}

type ExpectedSession = {
  dayId: string;
  title?: string;
  totals: Record<string, number>;
};

type VolumeCase = {
  name: string;
  document: WorkoutDocument;
  snapshots: WorkoutVolumeSnapshots;
  expectedSessions: ExpectedSession[];
  expectedWeekTotals: Record<string, number>;
};

const cases: VolumeCase[] = [
  {
    name: 'excludes warm-up sets',
    document: {
      days: [
        {
          id: DAY_ONE_ID,
          kind: 'session',
          title: 'Warm-up only',
          items: [
            exerciseItem('20000000-0000-4000-8000-000000000001', BENCH_PRESS, [
              warmupSet('30000000-0000-4000-8000-000000000001'),
            ]),
          ],
        },
      ],
    },
    snapshots: [snapshot(BENCH_PRESS, ['chest'], ['triceps'])],
    expectedSessions: [
      { dayId: DAY_ONE_ID, title: 'Warm-up only', totals: {} },
    ],
    expectedWeekTotals: {},
  },
  {
    name: 'credits each primary muscle by 1.0 for a working set',
    document: {
      days: [
        {
          id: DAY_ONE_ID,
          kind: 'session',
          items: [
            exerciseItem('20000000-0000-4000-8000-000000000001', BENCH_PRESS, [
              workingSet('30000000-0000-4000-8000-000000000001'),
            ]),
          ],
        },
      ],
    },
    snapshots: [snapshot(BENCH_PRESS, ['chest'])],
    expectedSessions: [{ dayId: DAY_ONE_ID, totals: { chest: 1 } }],
    expectedWeekTotals: { chest: 1 },
  },
  {
    name: 'credits each secondary muscle by 0.5 for a working set',
    document: {
      days: [
        {
          id: DAY_ONE_ID,
          kind: 'session',
          items: [
            exerciseItem('20000000-0000-4000-8000-000000000001', BENCH_PRESS, [
              workingSet('30000000-0000-4000-8000-000000000001'),
            ]),
          ],
        },
      ],
    },
    snapshots: [snapshot(BENCH_PRESS, ['chest'], ['triceps', 'shoulders'])],
    expectedSessions: [
      {
        dayId: DAY_ONE_ID,
        totals: { chest: 1, shoulders: 0.5, triceps: 0.5 },
      },
    ],
    expectedWeekTotals: { chest: 1, shoulders: 0.5, triceps: 0.5 },
  },
  {
    name: 'aggregates every working set within a session',
    document: {
      days: [
        {
          id: DAY_ONE_ID,
          kind: 'session',
          title: 'Chest',
          items: [
            exerciseItem('20000000-0000-4000-8000-000000000001', BENCH_PRESS, [
              workingSet('30000000-0000-4000-8000-000000000001'),
              warmupSet('30000000-0000-4000-8000-000000000002'),
              workingSet('30000000-0000-4000-8000-000000000003'),
            ]),
            exerciseItem('20000000-0000-4000-8000-000000000002', PUSH_UP, [
              workingSet('30000000-0000-4000-8000-000000000004'),
            ]),
          ],
        },
      ],
    },
    snapshots: [
      snapshot(BENCH_PRESS, ['chest'], ['triceps']),
      snapshot(PUSH_UP, ['chest'], ['triceps']),
    ],
    expectedSessions: [
      { dayId: DAY_ONE_ID, title: 'Chest', totals: { chest: 3, triceps: 1.5 } },
    ],
    expectedWeekTotals: { chest: 3, triceps: 1.5 },
  },
  {
    name: 'aggregates session totals into weekly totals',
    document: {
      days: [
        {
          id: DAY_ONE_ID,
          kind: 'session',
          title: 'Push',
          items: [
            exerciseItem('20000000-0000-4000-8000-000000000001', BENCH_PRESS, [
              workingSet('30000000-0000-4000-8000-000000000001'),
              workingSet('30000000-0000-4000-8000-000000000002'),
            ]),
          ],
        },
        {
          id: DAY_TWO_ID,
          kind: 'session',
          title: 'Pull',
          items: [
            exerciseItem('20000000-0000-4000-8000-000000000002', ROW, [
              workingSet('30000000-0000-4000-8000-000000000003'),
            ]),
          ],
        },
      ],
    },
    snapshots: [
      snapshot(BENCH_PRESS, ['chest'], ['triceps']),
      snapshot(ROW, ['back'], ['biceps']),
    ],
    expectedSessions: [
      {
        dayId: DAY_ONE_ID,
        title: 'Push',
        totals: { chest: 2, triceps: 1 },
      },
      {
        dayId: DAY_TWO_ID,
        title: 'Pull',
        totals: { back: 1, biceps: 0.5 },
      },
    ],
    expectedWeekTotals: { back: 1, biceps: 0.5, chest: 2, triceps: 1 },
  },
  {
    name: 'keeps rest days out of sessions and reports an empty session',
    document: {
      days: [
        { id: REST_DAY_ID, kind: 'rest' },
        {
          id: DAY_ONE_ID,
          kind: 'session',
          title: 'Empty session',
          items: [],
        },
      ],
    },
    snapshots: [],
    expectedSessions: [
      { dayId: DAY_ONE_ID, title: 'Empty session', totals: {} },
    ],
    expectedWeekTotals: {},
  },
  {
    name: 'matches the selected exercise variation snapshot',
    document: {
      days: [
        {
          id: DAY_ONE_ID,
          kind: 'session',
          items: [
            exerciseItem(
              '20000000-0000-4000-8000-000000000001',
              PAUSED_BENCH_PRESS,
              [workingSet('30000000-0000-4000-8000-000000000001')],
            ),
          ],
        },
      ],
    },
    snapshots: [
      snapshot(BENCH_PRESS, ['chest']),
      snapshot(PAUSED_BENCH_PRESS, ['shoulders']),
    ],
    expectedSessions: [{ dayId: DAY_ONE_ID, totals: { shoulders: 1 } }],
    expectedWeekTotals: { shoulders: 1 },
  },
];

describe('F17 workout volume', () => {
  it.each(cases)('$name', (testCase) => {
    expect(
      calculateWorkoutVolume(testCase.document, testCase.snapshots),
    ).toEqual({
      sessions: testCase.expectedSessions,
      weekTotals: testCase.expectedWeekTotals,
    });
  });

  it('uses the fixed 5,000-basis-point secondary-muscle credit', () => {
    expect(SECONDARY_MUSCLE_CREDIT_BASIS_POINTS).toBe(5_000);
  });

  it('fails closed with a typed error when a working exercise has no snapshot', () => {
    const document: WorkoutDocument = {
      days: [
        {
          id: DAY_ONE_ID,
          kind: 'session',
          items: [
            exerciseItem('20000000-0000-4000-8000-000000000001', BENCH_PRESS, [
              workingSet('30000000-0000-4000-8000-000000000001'),
            ]),
          ],
        },
      ],
    };

    expect(() => calculateWorkoutVolume(document, [])).toThrow(
      WorkoutVolumeError,
    );
  });

  it('does not require a snapshot when the exercise has no working sets', () => {
    const document: WorkoutDocument = {
      days: [
        {
          id: DAY_ONE_ID,
          kind: 'session',
          items: [
            exerciseItem('20000000-0000-4000-8000-000000000001', BENCH_PRESS, [
              warmupSet('30000000-0000-4000-8000-000000000001'),
            ]),
          ],
        },
      ],
    };

    expect(calculateWorkoutVolume(document, [])).toEqual({
      sessions: [{ dayId: DAY_ONE_ID, totals: {} }],
      weekTotals: {},
    });
  });

  it('does not mutate the document or snapshot inputs', () => {
    const document: WorkoutDocument = {
      days: [
        {
          id: DAY_ONE_ID,
          kind: 'session',
          items: [
            exerciseItem('20000000-0000-4000-8000-000000000001', BENCH_PRESS, [
              workingSet('30000000-0000-4000-8000-000000000001'),
            ]),
          ],
        },
      ],
    };
    const snapshots: WorkoutVolumeSnapshots = [
      snapshot(BENCH_PRESS, ['chest'], ['triceps']),
    ];
    const originalDocument = structuredClone(document);
    const originalSnapshots = structuredClone(snapshots);

    calculateWorkoutVolume(document, snapshots);

    expect(document).toEqual(originalDocument);
    expect(snapshots).toEqual(originalSnapshots);
  });
});
