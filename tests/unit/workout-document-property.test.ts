import { describe, expect, it } from 'vitest';
import {
  normalizeWorkoutDocument,
  type WorkoutDay,
  type WorkoutDocument,
  type WorkoutExerciseReference,
  type WorkoutItem,
  type WorkoutSet,
} from '../../lib/plans/workout/schema';
import {
  duplicateWorkoutDay,
  duplicateWorkoutItem,
} from '../../lib/plans/workout/id-continuity';
import {
  moveWorkoutItem,
  reorderWorkoutDays,
  reorderWorkoutItems,
} from '../../lib/plans/workout/document-ops';

const SEED = 0x17f041;
const CASE_COUNT = 1_000;
const SEED_LABEL = `seed=0x${SEED.toString(16)}`;

const OP_NAMES = [
  'duplicate-item',
  'duplicate-day',
  'reorder-days',
  'reorder-items',
  'move-item',
] as const;

type OperationName = (typeof OP_NAMES)[number];

type Random = () => number;

function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function nextInt(random: Random, maxExclusive: number): number {
  return Math.floor(random() * maxExclusive);
}

function pick<T>(random: Random, values: readonly T[]): T {
  return values[nextInt(random, values.length)]!;
}

function shuffled<T>(random: Random, values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = nextInt(random, index + 1);
    const current = result[index]!;
    result[index] = result[swapIndex]!;
    result[swapIndex] = current;
  }
  return result;
}

function createIdFactory(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    const suffix = counter.toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${suffix}`;
  };
}

type SetParameters = {
  type: WorkoutSet['type'];
  reps: WorkoutSet['reps'];
  load: WorkoutSet['load'];
  restSec?: number;
  rir?: number;
  notes?: string;
};

type ItemParameters = {
  exercise: WorkoutItem['exercise'];
  notes?: string;
  alternatives?: NonNullable<WorkoutItem['alternatives']>;
};

type TrackedItem = ItemParameters & {
  setIds: readonly string[];
};

type DayParameters = {
  kind: WorkoutDay['kind'];
  title?: string;
  notes?: string;
};

type Tracker = {
  days: Map<string, DayParameters>;
  items: Map<string, TrackedItem>;
  sets: Map<string, SetParameters>;
};

function setParameters(set: WorkoutSet): SetParameters {
  return {
    type: set.type,
    reps: structuredClone(set.reps),
    load: structuredClone(set.load),
    ...(set.restSec === undefined ? {} : { restSec: set.restSec }),
    ...(set.rir === undefined ? {} : { rir: set.rir }),
    ...(set.notes === undefined ? {} : { notes: set.notes }),
  };
}

function itemParameters(item: WorkoutItem): ItemParameters {
  return {
    exercise: structuredClone(item.exercise),
    ...(item.notes === undefined ? {} : { notes: item.notes }),
    ...(item.alternatives === undefined
      ? {}
      : { alternatives: structuredClone(item.alternatives) }),
  };
}

function trackedItem(item: WorkoutItem): TrackedItem {
  return {
    ...itemParameters(item),
    setIds: item.sets.map((set) => set.id),
  };
}

function dayParameters(day: WorkoutDay): DayParameters {
  return {
    kind: day.kind,
    ...(day.title === undefined ? {} : { title: day.title }),
    ...(day.notes === undefined ? {} : { notes: day.notes }),
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

function findItem(
  document: WorkoutDocument,
  dayId: string,
  itemId: string,
): WorkoutItem | undefined {
  const day = document.days.find((candidate) => candidate.id === dayId);
  return (day?.items ?? []).find((item) => item.id === itemId);
}

function recordDocument(tracker: Tracker, document: WorkoutDocument): void {
  for (const day of document.days) {
    tracker.days.set(day.id, dayParameters(day));
    for (const item of day.items ?? []) {
      tracker.items.set(item.id, trackedItem(item));
      for (const set of item.sets) {
        tracker.sets.set(set.id, setParameters(set));
      }
    }
  }
}

function verifyDocument(
  document: WorkoutDocument,
  tracker: Tracker,
  context: string,
): void {
  expect(
    () => normalizeWorkoutDocument(document),
    `${context}: normalizeWorkoutDocument`,
  ).not.toThrow();

  const ids = documentIds(document);
  expect(new Set(ids).size, `${context}: ids must be unique`).toBe(ids.length);

  for (const day of document.days) {
    expect(
      tracker.days.get(day.id),
      `${context}: day ${day.id} must be tracked`,
    ).toEqual(dayParameters(day));
    for (const item of day.items ?? []) {
      expect(
        tracker.items.get(item.id),
        `${context}: item ${item.id} must be tracked`,
      ).toEqual(trackedItem(item));
      for (const set of item.sets) {
        expect(
          tracker.sets.get(set.id),
          `${context}: set ${set.id} must be tracked`,
        ).toEqual(setParameters(set));
      }
    }
  }

  for (const dayId of tracker.days.keys()) {
    expect(
      document.days.some((day) => day.id === dayId),
      `${context}: day ${dayId} must be retained`,
    ).toBe(true);
  }
  for (const itemId of tracker.items.keys()) {
    expect(
      document.days.some((day) =>
        (day.items ?? []).some((item) => item.id === itemId),
      ),
      `${context}: item ${itemId} must be retained`,
    ).toBe(true);
  }
  for (const setId of tracker.sets.keys()) {
    expect(
      document.days.some((day) =>
        (day.items ?? []).some((item) =>
          item.sets.some((set) => set.id === setId),
        ),
      ),
      `${context}: set ${setId} must be retained`,
    ).toBe(true);
  }
}

const EXERCISE_IDS = [
  'bench-press',
  'row',
  'squat',
  'deadlift',
  'overhead-press',
] as const;
const LOAD_VALUES = ['0.5', '2.5', '10.25', '12.25', '20.5', '100'] as const;
const PARAMETER_NOTES = [
  'Pause each rep',
  'Controlled tempo',
  '=SUM(A1:A5)',
  '+1',
  '\u062a\u0645\u0631\u064a\u0646 \u0627\u0644\u0633\u0642\u0648',
] as const;

function randomReference(random: Random): WorkoutExerciseReference {
  const reference: WorkoutExerciseReference = {
    source: pick(random, ['global', 'workspace'] as const),
    id: pick(random, EXERCISE_IDS),
    version: 1 + nextInt(random, 3),
  };
  if (random() < 0.5) {
    reference.variation = {
      id: `variation-${nextInt(random, 3)}`,
      version: 1 + nextInt(random, 2),
    };
  }
  return reference;
}

function randomSet(random: Random, nextId: () => string): WorkoutSet {
  const set: WorkoutSet = {
    id: nextId(),
    type: pick(random, ['warmup', 'working'] as const),
    reps:
      random() < 0.5
        ? { value: 1 + nextInt(random, 20) }
        : (() => {
            const min = 1 + nextInt(random, 12);
            return { min, max: min + nextInt(random, 11) };
          })(),
    load: (() => {
      const mode = pick(random, [
        'bodyweight',
        'added_weight',
        'assisted',
      ] as const);
      if (mode === 'bodyweight') return { mode };
      return {
        mode,
        value: pick(random, LOAD_VALUES),
        unit: pick(random, ['kg', 'lb'] as const),
      };
    })(),
  };
  if (random() < 0.6) set.restSec = nextInt(random, 301);
  if (random() < 0.6) set.rir = nextInt(random, 6);
  if (random() < 0.3) set.notes = pick(random, PARAMETER_NOTES);
  return set;
}

function randomItem(random: Random, nextId: () => string): WorkoutItem {
  const item: WorkoutItem = {
    id: nextId(),
    exercise: randomReference(random),
    sets: Array.from({ length: 1 + nextInt(random, 3) }, () =>
      randomSet(random, nextId),
    ),
  };
  if (random() < 0.4) item.notes = pick(random, PARAMETER_NOTES);
  if (random() < 0.3) {
    item.alternatives = [randomReference(random)];
  }
  return item;
}

function randomDocument(random: Random, nextId: () => string): WorkoutDocument {
  const sessionDayCount = 2 + nextInt(random, 2);
  const days: WorkoutDay[] = Array.from(
    { length: sessionDayCount },
    (_, index) => {
      const day: WorkoutDay = {
        id: nextId(),
        kind: 'session',
        title: `Day ${index + 1}`,
        items: Array.from({ length: 1 + nextInt(random, 3) }, () =>
          randomItem(random, nextId),
        ),
      };
      if (random() < 0.4) day.notes = pick(random, PARAMETER_NOTES);
      return day;
    },
  );
  if (nextInt(random, 2) === 1) {
    days.push({
      id: nextId(),
      kind: 'rest',
      title: 'Rest',
      ...(random() < 0.5 ? { notes: pick(random, PARAMETER_NOTES) } : {}),
    });
  }

  const document: WorkoutDocument = { days };
  if (random() < 0.3) document.notes = pick(random, PARAMETER_NOTES);
  return document;
}

function requireItem(
  document: WorkoutDocument,
  dayId: string,
  itemId: string,
  context: string,
): WorkoutItem {
  const item = findItem(document, dayId, itemId);
  expect(item, `${context}: item ${itemId} must exist`).toBeDefined();
  return item!;
}

function applyOperation(
  name: OperationName,
  document: WorkoutDocument,
  random: Random,
  nextId: () => string,
  tracker: Tracker,
  context: string,
): WorkoutDocument {
  switch (name) {
    case 'duplicate-item': {
      const daysWithItems = document.days.filter(
        (day) => (day.items?.length ?? 0) > 0,
      );
      const sourceDay = pick(random, daysWithItems);
      const sourceItem = pick(random, sourceDay.items!);
      const itemId = nextId();
      const setIds = sourceItem.sets.map(() => nextId());
      const beforeIds = new Set(documentIds(document));
      const expectedItem = itemParameters(sourceItem);
      const expectedSets = sourceItem.sets.map(setParameters);

      const result = duplicateWorkoutItem(
        document,
        { dayId: sourceDay.id, itemId: sourceItem.id },
        { itemId, setIds },
      );
      const duplicate = requireItem(result, sourceDay.id, itemId, context);

      expect(
        itemParameters(duplicate),
        `${context}: duplicated item parameters`,
      ).toEqual(expectedItem);
      expect(
        duplicate.sets.map((set) => set.id),
        `${context}: duplicated set ids`,
      ).toEqual(setIds);
      expect(
        duplicate.sets.map(setParameters),
        `${context}: duplicated set parameters`,
      ).toEqual(expectedSets);
      for (const id of [itemId, ...setIds]) {
        expect(
          beforeIds.has(id),
          `${context}: duplicate id ${id} is fresh`,
        ).toBe(false);
      }

      tracker.items.set(duplicate.id, trackedItem(duplicate));
      for (const set of duplicate.sets) {
        tracker.sets.set(set.id, setParameters(set));
      }
      return result;
    }

    case 'duplicate-day': {
      const sourceDay = pick(random, document.days);
      const dayId = nextId();
      const itemAssignments = (sourceDay.items ?? []).map((item) => ({
        itemId: nextId(),
        setIds: item.sets.map(() => nextId()),
      }));
      const beforeIds = new Set(documentIds(document));

      const result = duplicateWorkoutDay(document, sourceDay.id, {
        dayId,
        items: itemAssignments,
      });
      const duplicate = result.days.find((day) => day.id === dayId);
      expect(duplicate, `${context}: duplicated day must exist`).toBeDefined();
      expect(
        dayParameters(duplicate!),
        `${context}: duplicated day parameters`,
      ).toEqual(dayParameters(sourceDay));
      expect(
        duplicate!.items?.length ?? 0,
        `${context}: duplicated day item count`,
      ).toBe(sourceDay.items?.length ?? 0);

      for (const [index, sourceItem] of (sourceDay.items ?? []).entries()) {
        const duplicateItem = duplicate!.items![index]!;
        const assignment = itemAssignments[index]!;
        expect(
          itemParameters(duplicateItem),
          `${context}: duplicated day item ${index} parameters`,
        ).toEqual(itemParameters(sourceItem));
        expect(
          duplicateItem.sets.map((set) => set.id),
          `${context}: duplicated day item ${index} set ids`,
        ).toEqual(assignment.setIds);
        expect(
          duplicateItem.sets.map(setParameters),
          `${context}: duplicated day item ${index} set parameters`,
        ).toEqual(sourceItem.sets.map(setParameters));
      }

      const newIds = [
        dayId,
        ...itemAssignments.flatMap((assignment) => [
          assignment.itemId,
          ...assignment.setIds,
        ]),
      ];
      for (const id of newIds) {
        expect(
          beforeIds.has(id),
          `${context}: duplicate id ${id} is fresh`,
        ).toBe(false);
      }

      tracker.days.set(duplicate!.id, dayParameters(duplicate!));
      for (const item of duplicate!.items ?? []) {
        tracker.items.set(item.id, trackedItem(item));
        for (const set of item.sets) {
          tracker.sets.set(set.id, setParameters(set));
        }
      }
      return result;
    }

    case 'reorder-days': {
      const order = shuffled(
        random,
        document.days.map((day) => day.id),
      );
      const result = reorderWorkoutDays(document, order);
      expect(
        result.days.map((day) => day.id),
        `${context}: reordered day ids`,
      ).toEqual(order);
      return result;
    }

    case 'reorder-items': {
      const sessionDays = document.days.filter(
        (day) => day.kind === 'session' && (day.items?.length ?? 0) > 0,
      );
      const sourceDay = pick(random, sessionDays);
      const order = shuffled(
        random,
        sourceDay.items!.map((item) => item.id),
      );
      const result = reorderWorkoutItems(document, sourceDay.id, order);
      expect(
        (result.days.find((day) => day.id === sourceDay.id)?.items ?? []).map(
          (item) => item.id,
        ),
        `${context}: reordered item ids`,
      ).toEqual(order);
      return result;
    }

    case 'move-item': {
      const sourceCandidates = document.days.filter(
        (day) => day.kind === 'session' && (day.items?.length ?? 0) > 0,
      );
      const sourceDay = pick(random, sourceCandidates);
      const targetCandidates = document.days.filter(
        (day) => day.kind === 'session' && day.id !== sourceDay.id,
      );
      const targetDay = pick(random, targetCandidates);
      const sourceItem = pick(random, sourceDay.items!);
      const targetIndex = nextInt(random, (targetDay.items?.length ?? 0) + 1);

      const result = moveWorkoutItem(
        document,
        { dayId: sourceDay.id, itemId: sourceItem.id },
        targetDay.id,
        targetIndex,
      );
      const resultSource = result.days.find((day) => day.id === sourceDay.id)!;
      const resultTarget = result.days.find((day) => day.id === targetDay.id)!;
      expect(
        (resultSource.items ?? []).some((item) => item.id === sourceItem.id),
        `${context}: moved item leaves the source day`,
      ).toBe(false);
      expect(
        resultTarget.items![targetIndex]!.id,
        `${context}: moved item lands at the requested index`,
      ).toBe(sourceItem.id);
      expect(
        itemParameters(resultTarget.items![targetIndex]!),
        `${context}: moved item parameters`,
      ).toEqual(itemParameters(sourceItem));
      return result;
    }
  }
}

describe('F17 workout document parameter-preservation property test', () => {
  it(`preserves every parameter across ${CASE_COUNT} seeded reorder/move/duplicate cases`, () => {
    const random = createRandom(SEED);
    const operationCounts = new Map<OperationName, number>(
      OP_NAMES.map((name) => [name, 0]),
    );

    for (let caseIndex = 0; caseIndex < CASE_COUNT; caseIndex += 1) {
      const nextId = createIdFactory();
      const document = randomDocument(random, nextId);
      const tracker: Tracker = {
        days: new Map(),
        items: new Map(),
        sets: new Map(),
      };
      recordDocument(tracker, document);

      const operationCount = 1 + nextInt(random, 6);
      let current = document;
      for (let opIndex = 0; opIndex < operationCount; opIndex += 1) {
        const name =
          opIndex === 0
            ? OP_NAMES[caseIndex % OP_NAMES.length]!
            : pick(random, OP_NAMES);
        const context = `${SEED_LABEL} case=${caseIndex} op=${opIndex} ${name}`;
        operationCounts.set(name, operationCounts.get(name)! + 1);

        const before = structuredClone(current);
        const next = applyOperation(
          name,
          current,
          random,
          nextId,
          tracker,
          context,
        );
        expect(current, `${context}: source document is not mutated`).toEqual(
          before,
        );
        verifyDocument(next, tracker, context);
        current = next;
      }
    }

    for (const name of OP_NAMES) {
      expect(
        operationCounts.get(name)!,
        `${SEED_LABEL} ${name} must be exercised`,
      ).toBeGreaterThan(0);
    }
  });
});
