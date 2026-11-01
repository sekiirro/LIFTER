import { describe, expect, it } from 'vitest';
import type { WorkoutDocument } from '../../lib/plans/workout/schema';
import {
  moveWorkoutItem,
  reorderWorkoutDays,
  reorderWorkoutItems,
  WorkoutDocumentOpsError,
} from '../../lib/plans/workout/document-ops';

const PUSH_DAY_ID = '10000000-0000-4000-8000-000000000001';
const PULL_DAY_ID = '10000000-0000-4000-8000-000000000002';
const REST_DAY_ID = '10000000-0000-4000-8000-000000000003';

const BENCH_ITEM_ID = '20000000-0000-4000-8000-000000000001';
const ROW_ITEM_ID = '20000000-0000-4000-8000-000000000002';
const SQUAT_ITEM_ID = '20000000-0000-4000-8000-000000000003';

const BENCH_SET_ID = '30000000-0000-4000-8000-000000000001';
const ROW_SET_ID = '30000000-0000-4000-8000-000000000002';
const SQUAT_SET_ID = '30000000-0000-4000-8000-000000000003';

function baseDocument(): WorkoutDocument {
  return {
    days: [
      {
        id: PUSH_DAY_ID,
        kind: 'session',
        title: 'Push',
        items: [
          {
            id: BENCH_ITEM_ID,
            exercise: { source: 'global', id: 'bench-press', version: 1 },
            notes: 'Pause each rep',
            sets: [
              {
                id: BENCH_SET_ID,
                type: 'working',
                reps: { min: 8, max: 10 },
                load: {
                  mode: 'added_weight',
                  value: '22.5',
                  unit: 'kg',
                },
                restSec: 90,
                rir: 2,
                notes: 'Controlled tempo',
              },
            ],
          },
          {
            id: ROW_ITEM_ID,
            exercise: { source: 'workspace', id: 'row', version: 2 },
            sets: [
              {
                id: ROW_SET_ID,
                type: 'warmup',
                reps: { value: 12 },
                load: { mode: 'bodyweight' },
              },
            ],
          },
        ],
      },
      {
        id: PULL_DAY_ID,
        kind: 'session',
        title: 'Pull',
        items: [
          {
            id: SQUAT_ITEM_ID,
            exercise: { source: 'global', id: 'squat', version: 4 },
            sets: [
              {
                id: SQUAT_SET_ID,
                type: 'working',
                reps: { value: 5 },
                load: { mode: 'assisted', value: '10.25', unit: 'lb' },
                rir: 1,
              },
            ],
          },
        ],
      },
      {
        id: REST_DAY_ID,
        kind: 'rest',
        title: 'Rest',
        notes: 'Sleep and recover',
      },
    ],
  };
}

function itemIds(document: WorkoutDocument, dayId: string): string[] {
  const day = document.days.find((candidate) => candidate.id === dayId);
  return (day?.items ?? []).map((item) => item.id);
}

describe('F17 workout document operations', () => {
  it('reorders days without changing their content', () => {
    const document = baseDocument();
    const original = structuredClone(document);

    const reordered = reorderWorkoutDays(document, [
      REST_DAY_ID,
      PUSH_DAY_ID,
      PULL_DAY_ID,
    ]);

    expect(reordered.days.map((day) => day.id)).toEqual([
      REST_DAY_ID,
      PUSH_DAY_ID,
      PULL_DAY_ID,
    ]);
    expect(reordered.days[1]).toEqual(document.days[0]);
    expect(reordered.days[2]).toEqual(document.days[1]);
    expect(document).toEqual(original);
  });

  it('reorders items within a day without changing their content', () => {
    const document = baseDocument();
    const original = structuredClone(document);

    const reordered = reorderWorkoutItems(document, PUSH_DAY_ID, [
      ROW_ITEM_ID,
      BENCH_ITEM_ID,
    ]);

    expect(itemIds(reordered, PUSH_DAY_ID)).toEqual([
      ROW_ITEM_ID,
      BENCH_ITEM_ID,
    ]);
    expect(reordered.days[0]!.items![0]).toEqual(document.days[0]!.items![1]);
    expect(reordered.days[0]!.items![1]).toEqual(document.days[0]!.items![0]);
    expect(document).toEqual(original);
  });

  it('moves an item to another session day at the requested index', () => {
    const document = baseDocument();
    const original = structuredClone(document);
    const movedItem = document.days[0]!.items![0]!;

    const moved = moveWorkoutItem(
      document,
      { dayId: PUSH_DAY_ID, itemId: BENCH_ITEM_ID },
      PULL_DAY_ID,
      0,
    );

    expect(itemIds(moved, PUSH_DAY_ID)).toEqual([ROW_ITEM_ID]);
    expect(itemIds(moved, PULL_DAY_ID)).toEqual([BENCH_ITEM_ID, SQUAT_ITEM_ID]);
    expect(moved.days[1]!.items![0]).toEqual(movedItem);
    expect(document).toEqual(original);
  });

  it('moves an item to the end of the target day', () => {
    const moved = moveWorkoutItem(
      baseDocument(),
      { dayId: PUSH_DAY_ID, itemId: ROW_ITEM_ID },
      PULL_DAY_ID,
      1,
    );

    expect(itemIds(moved, PULL_DAY_ID)).toEqual([SQUAT_ITEM_ID, ROW_ITEM_ID]);
    expect(itemIds(moved, PUSH_DAY_ID)).toEqual([BENCH_ITEM_ID]);
  });

  it('rejects reorder requests that do not name every id exactly once', () => {
    const document = baseDocument();

    expect(() =>
      reorderWorkoutDays(document, [PUSH_DAY_ID, PULL_DAY_ID]),
    ).toThrow(WorkoutDocumentOpsError);
    expect(() =>
      reorderWorkoutDays(document, [PUSH_DAY_ID, PUSH_DAY_ID, REST_DAY_ID]),
    ).toThrow(WorkoutDocumentOpsError);
    expect(() =>
      reorderWorkoutDays(document, [
        PUSH_DAY_ID,
        PULL_DAY_ID,
        '10000000-0000-4000-8000-000000000099',
      ]),
    ).toThrow(WorkoutDocumentOpsError);
    expect(() =>
      reorderWorkoutItems(document, PUSH_DAY_ID, [BENCH_ITEM_ID]),
    ).toThrow(WorkoutDocumentOpsError);
    expect(() => reorderWorkoutItems(document, REST_DAY_ID, [])).toThrow(
      WorkoutDocumentOpsError,
    );
  });

  it('rejects moves from or to a rest day', () => {
    const document = baseDocument();

    expect(() =>
      moveWorkoutItem(
        document,
        { dayId: PUSH_DAY_ID, itemId: BENCH_ITEM_ID },
        REST_DAY_ID,
        0,
      ),
    ).toThrow(WorkoutDocumentOpsError);
    expect(() =>
      moveWorkoutItem(
        document,
        { dayId: REST_DAY_ID, itemId: BENCH_ITEM_ID },
        PULL_DAY_ID,
        0,
      ),
    ).toThrow(WorkoutDocumentOpsError);
  });

  it('rejects unknown items, unknown days and invalid target indexes', () => {
    const document = baseDocument();

    expect(() =>
      moveWorkoutItem(
        document,
        { dayId: PUSH_DAY_ID, itemId: SQUAT_ITEM_ID },
        PULL_DAY_ID,
        0,
      ),
    ).toThrow(WorkoutDocumentOpsError);
    expect(() =>
      moveWorkoutItem(
        document,
        { dayId: PUSH_DAY_ID, itemId: BENCH_ITEM_ID },
        '10000000-0000-4000-8000-000000000099',
        0,
      ),
    ).toThrow(WorkoutDocumentOpsError);
    expect(() =>
      moveWorkoutItem(
        document,
        { dayId: PUSH_DAY_ID, itemId: BENCH_ITEM_ID },
        PULL_DAY_ID,
        2,
      ),
    ).toThrow(WorkoutDocumentOpsError);
    expect(() =>
      moveWorkoutItem(
        document,
        { dayId: PUSH_DAY_ID, itemId: BENCH_ITEM_ID },
        PULL_DAY_ID,
        -1,
      ),
    ).toThrow(WorkoutDocumentOpsError);
  });

  it('allows a same-day move to a new index', () => {
    const moved = moveWorkoutItem(
      baseDocument(),
      { dayId: PUSH_DAY_ID, itemId: ROW_ITEM_ID },
      PUSH_DAY_ID,
      0,
    );

    expect(itemIds(moved, PUSH_DAY_ID)).toEqual([ROW_ITEM_ID, BENCH_ITEM_ID]);
  });
});
