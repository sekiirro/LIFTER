import { describe, expect, it } from 'vitest';
import type {
  WorkoutDocument,
  WorkoutItem,
  WorkoutSet,
} from '../../lib/plans/workout/schema';
import {
  duplicateWorkoutDay,
  duplicateWorkoutItem,
  retainWorkoutDocumentIds,
  WorkoutIdContinuityError,
  type WorkoutDayIdAssignment,
  type WorkoutItemIdAssignment,
} from '../../lib/plans/workout/id-continuity';

const PUSH_DAY_ID = '10000000-0000-4000-8000-000000000001';
const PULL_DAY_ID = '10000000-0000-4000-8000-000000000002';
const REST_DAY_ID = '10000000-0000-4000-8000-000000000003';

const BENCH_ITEM_ID = '20000000-0000-4000-8000-000000000001';
const ROW_ITEM_ID = '20000000-0000-4000-8000-000000000002';
const SQUAT_ITEM_ID = '20000000-0000-4000-8000-000000000003';

const BENCH_WARMUP_SET_ID = '30000000-0000-4000-8000-000000000001';
const BENCH_WORKING_SET_ID = '30000000-0000-4000-8000-000000000002';
const ROW_SET_ID = '30000000-0000-4000-8000-000000000003';
const SQUAT_SET_ID = '30000000-0000-4000-8000-000000000004';

const DUPLICATE_DAY_ID = '40000000-0000-4000-8000-000000000001';
const DUPLICATE_ITEM_ID = '50000000-0000-4000-8000-000000000001';
const DUPLICATE_ITEM_SET_IDS = [
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000002',
] as const;

const DUPLICATE_DAY_ITEM_IDS = [
  '50000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000003',
] as const;

const DUPLICATE_DAY_SET_IDS = [
  '70000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000003',
] as const;

function workingSet(id: string): WorkoutSet {
  return {
    id,
    type: 'working',
    reps: { min: 8, max: 10 },
    load: { mode: 'added_weight', value: '20.5', unit: 'kg' },
    restSec: 90,
    rir: 2,
    notes: 'Controlled tempo',
  };
}

function benchItem(): WorkoutItem {
  return {
    id: BENCH_ITEM_ID,
    exercise: {
      source: 'global',
      id: 'bench-press',
      version: 1,
      variation: { id: 'paused', version: 2 },
    },
    notes: 'Pause each rep',
    alternatives: [
      {
        source: 'workspace',
        id: 'db-press',
        version: 3,
      },
    ],
    sets: [
      {
        id: BENCH_WARMUP_SET_ID,
        type: 'warmup',
        reps: { value: 8 },
        load: { mode: 'bodyweight' },
      },
      workingSet(BENCH_WORKING_SET_ID),
    ],
  };
}

function rowItem(): WorkoutItem {
  return {
    id: ROW_ITEM_ID,
    exercise: { source: 'global', id: 'row', version: 2 },
    sets: [workingSet(ROW_SET_ID)],
  };
}

function squatItem(): WorkoutItem {
  return {
    id: SQUAT_ITEM_ID,
    exercise: { source: 'workspace', id: 'squat', version: 4 },
    notes: 'Full depth',
    sets: [workingSet(SQUAT_SET_ID)],
  };
}

function baseDocument(): WorkoutDocument {
  return {
    days: [
      {
        id: PUSH_DAY_ID,
        kind: 'session',
        title: 'Push',
        notes: 'Focus on pressing',
        items: [benchItem(), rowItem()],
      },
      {
        id: PULL_DAY_ID,
        kind: 'session',
        title: 'Pull',
        items: [squatItem()],
      },
      {
        id: REST_DAY_ID,
        kind: 'rest',
        title: 'Rest',
        notes: 'Sleep and recover',
      },
    ],
    notes: 'Week one',
  };
}

type WorkoutSetValues = {
  type: WorkoutSet['type'];
  reps: WorkoutSet['reps'];
  load: WorkoutSet['load'];
  restSec?: number;
  rir?: number;
  notes?: string;
};

type WorkoutItemValues = {
  exercise: WorkoutItem['exercise'];
  notes?: string;
  alternatives?: NonNullable<WorkoutItem['alternatives']>;
  sets: WorkoutSetValues[];
};

function setValues(set: WorkoutSet): WorkoutSetValues {
  return {
    type: set.type,
    reps: { ...set.reps },
    load: { ...set.load },
    ...(set.restSec === undefined ? {} : { restSec: set.restSec }),
    ...(set.rir === undefined ? {} : { rir: set.rir }),
    ...(set.notes === undefined ? {} : { notes: set.notes }),
  };
}

function itemValues(item: WorkoutItem): WorkoutItemValues {
  return {
    exercise: structuredClone(item.exercise),
    ...(item.notes === undefined ? {} : { notes: item.notes }),
    ...(item.alternatives === undefined
      ? {}
      : { alternatives: structuredClone(item.alternatives) }),
    sets: item.sets.map((set) => setValues(set)),
  };
}

function documentIds(document: WorkoutDocument): string[] {
  return document.days.flatMap((day) => [
    day.id,
    ...(day.items ?? []).flatMap((item) => [
      item.id,
      ...item.sets.map((set) => set.id),
    ]),
  ]);
}

function duplicateItemAssignment(): WorkoutItemIdAssignment {
  return {
    itemId: DUPLICATE_ITEM_ID,
    setIds: DUPLICATE_ITEM_SET_IDS,
  };
}

function duplicateDayAssignment(): WorkoutDayIdAssignment {
  return {
    dayId: DUPLICATE_DAY_ID,
    items: [
      {
        itemId: DUPLICATE_DAY_ITEM_IDS[0],
        setIds: DUPLICATE_DAY_SET_IDS.slice(0, 2),
      },
      {
        itemId: DUPLICATE_DAY_ITEM_IDS[1],
        setIds: DUPLICATE_DAY_SET_IDS.slice(2),
      },
    ],
  };
}

describe('F17 workout id continuity and duplicate remapping', () => {
  it('retains day, item, and set ids for moved and reordered unchanged objects', () => {
    const previous = baseDocument();
    const candidate = structuredClone(previous);

    const candidatePush = candidate.days[0]!;
    const candidatePull = candidate.days[1]!;
    candidatePull.items = [squatItem(), benchItem()];
    candidatePush.items = [rowItem()];
    candidate.days = [candidatePull, candidatePush, candidate.days[2]!];

    candidate.days[0]!.id = '80000000-0000-4000-8000-000000000001';
    candidate.days[1]!.id = '80000000-0000-4000-8000-000000000002';
    candidate.days[2]!.id = '80000000-0000-4000-8000-000000000003';
    candidate.days[0]!.items![0]!.id = '90000000-0000-4000-8000-000000000001';
    candidate.days[0]!.items![1]!.id = '90000000-0000-4000-8000-000000000002';
    candidate.days[1]!.items![0]!.id = '90000000-0000-4000-8000-000000000003';
    candidate.days[0]!.items![0]!.sets![0]!.id =
      'a0000000-0000-4000-8000-000000000001';
    candidate.days[0]!.items![1]!.sets![0]!.id =
      'a0000000-0000-4000-8000-000000000002';
    candidate.days[0]!.items![1]!.sets![1]!.id =
      'a0000000-0000-4000-8000-000000000003';
    candidate.days[1]!.items![0]!.sets![0]!.id =
      'a0000000-0000-4000-8000-000000000004';

    const retained = retainWorkoutDocumentIds(previous, candidate);

    expect(retained.days.map((day) => day.id)).toEqual([
      PULL_DAY_ID,
      PUSH_DAY_ID,
      REST_DAY_ID,
    ]);
    expect(retained.days[0]!.items!.map((item) => item.id)).toEqual([
      SQUAT_ITEM_ID,
      BENCH_ITEM_ID,
    ]);
    expect(retained.days[1]!.items!.map((item) => item.id)).toEqual([
      ROW_ITEM_ID,
    ]);
    expect(
      retained.days.flatMap((day) =>
        (day.items ?? []).flatMap((item) => item.sets.map((set) => set.id)),
      ),
    ).toEqual([
      SQUAT_SET_ID,
      BENCH_WARMUP_SET_ID,
      BENCH_WORKING_SET_ID,
      ROW_SET_ID,
    ]);
  });

  it('drops removed items without changing the ids of retained items', () => {
    const previous = baseDocument();
    const candidate = structuredClone(previous);
    candidate.days[0]!.items = [benchItem()];

    const retained = retainWorkoutDocumentIds(previous, candidate);

    expect(retained.days[0]!.items!.map((item) => item.id)).toEqual([
      BENCH_ITEM_ID,
    ]);
    expect(retained.days[0]!.items![0]!.sets.map((set) => set.id)).toEqual([
      BENCH_WARMUP_SET_ID,
      BENCH_WORKING_SET_ID,
    ]);
  });

  it('retains known ids when the same day or item is edited', () => {
    const previous = baseDocument();
    const candidate = structuredClone(previous);
    candidate.days[0]!.title = 'Push A';
    candidate.days[0]!.items![0]!.notes = 'Updated cue';
    candidate.days[0]!.items![0]!.sets![1]!.load = {
      mode: 'added_weight',
      value: '22.5',
      unit: 'kg',
    };

    const retained = retainWorkoutDocumentIds(previous, candidate);

    expect(retained.days[0]!.id).toBe(PUSH_DAY_ID);
    expect(retained.days[0]!.items![0]!.id).toBe(BENCH_ITEM_ID);
    expect(retained.days[0]!.items![0]!.sets![1]!.id).toBe(
      BENCH_WORKING_SET_ID,
    );
    expect(retained.days[0]!.items![0]!.sets![1]!.load).toEqual({
      mode: 'added_weight',
      value: '22.5',
      unit: 'kg',
    });
  });

  it('keeps deliberate duplicate ids distinct while retaining the source ids', () => {
    const previous = baseDocument();
    const candidate = structuredClone(previous);
    const duplicate = structuredClone(candidate.days[0]!.items![0]!);
    duplicate.id = '90000000-0000-4000-8000-000000000010';
    duplicate.sets[0]!.id = 'a0000000-0000-4000-8000-000000000001';
    duplicate.sets[1]!.id = 'a0000000-0000-4000-8000-000000000002';
    candidate.days[0]!.items!.push(duplicate);

    const retained = retainWorkoutDocumentIds(previous, candidate);
    const ids = documentIds(retained);

    expect(retained.days[0]!.items![0]!.id).toBe(BENCH_ITEM_ID);
    expect(
      retained.days[0]!.items!.some((item) => item.id === duplicate.id),
    ).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not mutate either revision while retaining continuity', () => {
    const previous = baseDocument();
    const candidate = structuredClone(previous);
    candidate.days[0]!.title = 'Edited push';
    const originalPrevious = structuredClone(previous);
    const originalCandidate = structuredClone(candidate);

    retainWorkoutDocumentIds(previous, candidate);

    expect(previous).toEqual(originalPrevious);
    expect(candidate).toEqual(originalCandidate);
  });

  it('duplicates an exercise with a new item id and new ids for every set', () => {
    const document = baseDocument();
    const original = structuredClone(document);
    const sourceItem = document.days[0]!.items![0]!;

    const duplicated = duplicateWorkoutItem(
      document,
      { dayId: PUSH_DAY_ID, itemId: BENCH_ITEM_ID },
      duplicateItemAssignment(),
    );

    expect(document).toEqual(original);
    expect(duplicated.days[0]!.items).toHaveLength(3);
    expect(duplicated.days[0]!.items![0]).toEqual(sourceItem);
    expect(duplicated.days[0]!.items![1]!.id).toBe(DUPLICATE_ITEM_ID);
    expect(itemValues(duplicated.days[0]!.items![1]!)).toEqual(
      itemValues(sourceItem),
    );
    expect(duplicated.days[0]!.items![1]!.sets.map((set) => set.id)).toEqual(
      DUPLICATE_ITEM_SET_IDS,
    );
    expect(duplicated.notes).toBe(document.notes);
    expect(new Set(documentIds(duplicated)).size).toBe(
      documentIds(duplicated).length,
    );
  });

  it('duplicates a day with a new day id and new ids for every descendant item and set', () => {
    const document = baseDocument();
    const original = structuredClone(document);
    const sourceDay = document.days[0]!;

    const duplicated = duplicateWorkoutDay(
      document,
      PUSH_DAY_ID,
      duplicateDayAssignment(),
    );

    expect(document).toEqual(original);
    expect(duplicated.days).toHaveLength(4);
    expect(duplicated.days[0]).toEqual(sourceDay);
    expect(duplicated.days[1]!.id).toBe(DUPLICATE_DAY_ID);
    expect(duplicated.days[1]!.kind).toBe(sourceDay.kind);
    expect(duplicated.days[1]!.title).toBe(sourceDay.title);
    expect(duplicated.days[1]!.notes).toBe(sourceDay.notes);
    expect(duplicated.days[1]!.items!.map((item) => item.id)).toEqual(
      DUPLICATE_DAY_ITEM_IDS,
    );
    expect(
      duplicated.days[1]!.items!.flatMap((item) =>
        item.sets.map((set) => set.id),
      ),
    ).toEqual(DUPLICATE_DAY_SET_IDS);
    expect(duplicated.days[1]!.items!.map((item) => itemValues(item))).toEqual(
      sourceDay.items!.map((item) => itemValues(item)),
    );
    expect(new Set(documentIds(duplicated)).size).toBe(
      documentIds(duplicated).length,
    );
  });

  it('does not introduce id collisions when duplicating a day', () => {
    const duplicated = duplicateWorkoutDay(
      baseDocument(),
      PUSH_DAY_ID,
      duplicateDayAssignment(),
    );
    const ids = documentIds(duplicated);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('duplicates a rest day without inventing descendants', () => {
    const document = baseDocument();

    const duplicated = duplicateWorkoutDay(document, REST_DAY_ID, {
      dayId: '40000000-0000-4000-8000-000000000002',
      items: [],
    });

    expect(duplicated.days[3]).toEqual({
      id: '40000000-0000-4000-8000-000000000002',
      kind: 'rest',
      title: 'Rest',
      notes: 'Sleep and recover',
    });
  });

  it('rejects duplicate ids that collide with the source document', () => {
    const document = baseDocument();

    expect(() =>
      duplicateWorkoutItem(
        document,
        { dayId: PUSH_DAY_ID, itemId: BENCH_ITEM_ID },
        {
          itemId: ROW_ITEM_ID,
          setIds: DUPLICATE_ITEM_SET_IDS,
        },
      ),
    ).toThrow(WorkoutIdContinuityError);

    expect(() =>
      duplicateWorkoutItem(
        document,
        { dayId: PUSH_DAY_ID, itemId: BENCH_ITEM_ID },
        {
          itemId: DUPLICATE_ITEM_ID,
          setIds: [BENCH_WORKING_SET_ID, DUPLICATE_ITEM_SET_IDS[1]],
        },
      ),
    ).toThrow(WorkoutIdContinuityError);
  });

  it('rejects duplicate descendant ids that collide within the copied day', () => {
    const document = baseDocument();
    const assignment: WorkoutDayIdAssignment = {
      dayId: DUPLICATE_DAY_ID,
      items: [
        {
          itemId: DUPLICATE_DAY_ITEM_IDS[0],
          setIds: DUPLICATE_DAY_SET_IDS.slice(0, 2),
        },
        {
          itemId: DUPLICATE_DAY_ITEM_IDS[1],
          setIds: DUPLICATE_DAY_SET_IDS.slice(0, 2),
        },
      ],
    };

    expect(() =>
      duplicateWorkoutDay(document, PUSH_DAY_ID, assignment),
    ).toThrow(WorkoutIdContinuityError);
  });

  it('rejects incomplete duplicate id assignments', () => {
    const document = baseDocument();

    expect(() =>
      duplicateWorkoutItem(
        document,
        { dayId: PUSH_DAY_ID, itemId: BENCH_ITEM_ID },
        {
          itemId: DUPLICATE_ITEM_ID,
          setIds: [DUPLICATE_ITEM_SET_IDS[0]],
        },
      ),
    ).toThrow(WorkoutIdContinuityError);

    expect(() =>
      duplicateWorkoutDay(document, PUSH_DAY_ID, {
        dayId: DUPLICATE_DAY_ID,
        items: [],
      }),
    ).toThrow(WorkoutIdContinuityError);
  });

  it('rejects a revision that already contains colliding ids', () => {
    const previous = baseDocument();
    const candidate = structuredClone(previous);
    candidate.days[0]!.items![1]!.id = BENCH_ITEM_ID;

    expect(() => retainWorkoutDocumentIds(previous, candidate)).toThrow(
      WorkoutIdContinuityError,
    );
  });
});
