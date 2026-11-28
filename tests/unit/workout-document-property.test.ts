import { describe, expect, it } from 'vitest';
import {
  addWorkoutItem,
  moveWorkoutItem,
  parseWorkoutDocumentV1,
  type WorkoutDocumentV1,
} from '../../lib/workout-planner/document';
import { duplicateItem } from '../../lib/workout-planner/id-remap';

// The sequence runs 1,000 generated operations while resetting its deterministic
// fixture every 25 operations, so validation remains bounded and repeatable.
const uuid = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

function makeItem(seed: number) {
  return {
    id: uuid(seed),
    exercise: {
      source: 'global' as const,
      identity_id: uuid(50_000),
      version: 3,
    },
    name: `Exercise ${seed}`,
    description: `Description ${seed}`,
    reps: { min: 5 + (seed % 5), max: 10 + (seed % 5) },
    restSec: 60 + (seed % 5) * 15,
    rir: seed % 6,
    notes: `Coach note ${seed}`,
    alternatives: [],
    sets: [
      {
        id: uuid(seed + 100_000),
        type: 'warmup' as const,
        load: { mode: 'bodyweight' as const },
      },
      {
        id: uuid(seed + 200_000),
        type: 'working' as const,
        load: {
          mode: 'added_weight' as const,
          value: `${seed + 1}.25`,
          unit: 'kg' as const,
        },
      },
      {
        id: uuid(seed + 300_000),
        type: 'working' as const,
        load: {
          mode: 'assisted' as const,
          value: `${seed + 2}.5`,
          unit: 'lb' as const,
        },
      },
    ],
  };
}

function parameters(item: WorkoutDocumentV1['days'][number]['items'][number]) {
  const entry = structuredClone(item) as Record<string, unknown>;
  delete entry.id;
  const sets = entry.sets as Record<string, unknown>[];
  return {
    ...entry,
    sets: sets.map((set) => {
      const parameterSet = { ...set };
      delete parameterSet.id;
      return parameterSet;
    }),
  };
}

function itemLocations(document: WorkoutDocumentV1) {
  return document.days.flatMap((day) =>
    day.items.map((item) => ({ dayId: day.id, item })),
  );
}

function deterministicRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function allIds(document: WorkoutDocumentV1) {
  return [
    ...document.days.flatMap((day) => [
      day.id,
      ...day.items.flatMap((item) => [
        item.id,
        ...item.sets.map((set) => set.id),
      ]),
    ]),
  ];
}

describe('F17 schema-v1 document property operations (T048)', () => {
  it('runs 1,000 generated reorder/move/duplicate and rest-day rejection operations without corruption', () => {
    const initialDocument = () =>
      parseWorkoutDocumentV1({
        schema_version: 1,
        notes: 'Workout note stays unchanged',
        days: [
          {
            id: uuid(1),
            kind: 'session',
            title: 'Day 1',
            notes: 'Day note 1',
            items: [makeItem(10), makeItem(11)],
          },
          {
            id: uuid(2),
            kind: 'session',
            title: 'Day 2',
            notes: 'Day note 2',
            items: [makeItem(20), makeItem(21)],
          },
          {
            id: uuid(3),
            kind: 'session',
            title: 'Day 3',
            notes: 'Day note 3',
            items: [makeItem(30), makeItem(31)],
          },
          { id: uuid(4), kind: 'rest', title: 'Rest day', items: [] },
        ],
      });
    let document = initialDocument();
    const random = deterministicRandom(0x17f048);
    let nextId = 1_000_000;
    const counts = {
      reorder: 0,
      move: 0,
      duplicate: 0,
      addRest: 0,
      moveRest: 0,
    };

    for (let operation = 0; operation < 1_000; operation += 1) {
      // Keep the generated document bounded while retaining all 1,000
      // operations and their per-operation corruption assertions.
      if (operation > 0 && operation % 25 === 0) document = initialDocument();
      const before = document;
      const beforeText = JSON.stringify(before);
      const beforeLocations = itemLocations(before);
      const beforeParameters = new Map(
        beforeLocations.map(({ item }) => [item.id, parameters(item)]),
      );
      const sessions = before.days.filter((day) => day.kind === 'session');
      const active = beforeLocations.filter(
        ({ dayId }) =>
          before.days.find((day) => day.id === dayId)?.kind === 'session',
      );

      switch (operation % 5) {
        case 0: {
          const day = sessions[random() % sessions.length]!;
          const from = random() % day.items.length;
          let to = random() % day.items.length;
          if (to === from) to = (to + 1) % day.items.length;
          const reordered = structuredClone(before);
          const [item] = reordered.days
            .find((entry) => entry.id === day.id)!
            .items.splice(from, 1);
          reordered.days
            .find((entry) => entry.id === day.id)!
            .items.splice(to, 0, item!);
          document = parseWorkoutDocumentV1(reordered);
          expect(
            document.days.find((entry) => entry.id === day.id)!.items[to]!.id,
          ).toBe(item!.id);
          counts.reorder += 1;
          break;
        }
        case 1: {
          const movable = active.filter(
            ({ dayId }) =>
              before.days.find((day) => day.id === dayId)!.items.length > 1,
          );
          const source = movable[random() % movable.length]!;
          const destinations = sessions.filter(
            (day) => day.id !== source.dayId,
          );
          const destination = destinations[random() % destinations.length]!;
          document = moveWorkoutItem(before, source.item.id, destination.id);
          expect(
            document.days
              .find((day) => day.id === destination.id)
              ?.items.some((item) => item.id === source.item.id),
          ).toBe(true);
          counts.move += 1;
          break;
        }
        case 2: {
          const source = active[random() % active.length]!;
          const destination = before.days.find(
            (day) => day.id === source.dayId,
          )!;
          const duplicate = duplicateItem(source.item, () => uuid(nextId++));
          document = addWorkoutItem(before, destination.id, duplicate);
          expect(
            document.days
              .find((day) => day.id === destination.id)
              ?.items.some((item) => item.id === duplicate.id),
          ).toBe(true);
          expect(duplicate.id).not.toBe(source.item.id);
          expect(duplicate.sets.map((set) => set.id)).not.toEqual(
            source.item.sets.map((set) => set.id),
          );
          expect(parameters(duplicate)).toEqual(parameters(source.item));
          counts.duplicate += 1;
          break;
        }
        case 3: {
          const restDay = before.days.find((day) => day.kind === 'rest')!;
          const source = active[random() % active.length]!;
          const candidate = makeItem(nextId++);
          expect(() =>
            addWorkoutItem(before, restDay.id, candidate),
          ).toThrowError('invalid_document');
          expect(JSON.stringify(before)).toBe(beforeText);
          expect(
            before.days.find((day) => day.id === source.dayId)?.items,
          ).toContainEqual(source.item);
          counts.addRest += 1;
          break;
        }
        default: {
          const restDay = before.days.find((day) => day.kind === 'rest')!;
          const source = active[random() % active.length]!;
          expect(() =>
            moveWorkoutItem(before, source.item.id, restDay.id),
          ).toThrowError('invalid_document');
          expect(JSON.stringify(before)).toBe(beforeText);
          expect(
            before.days.find((day) => day.id === source.dayId)?.items,
          ).toContainEqual(source.item);
          counts.moveRest += 1;
          break;
        }
      }

      if (operation % 5 < 3) {
        expect(document.schema_version).toBe(1);
        const ids = allIds(document);
        expect(ids.length).toBe(new Set(ids).size);
        const afterLocations = itemLocations(document);
        const afterById = new Map(
          afterLocations.map(({ item }) => [item.id, item]),
        );
        for (const { item } of beforeLocations) {
          const result = afterById.get(item.id);
          expect(result).toBeDefined();
          expect(parameters(result!)).toEqual(beforeParameters.get(item.id));
        }
        if (operation % 5 === 2) {
          const added = afterLocations.filter(
            ({ item }) => !beforeParameters.has(item.id),
          );
          expect(added).toHaveLength(1);
        }
      }
    }

    expect(counts).toEqual({
      reorder: 200,
      move: 200,
      duplicate: 200,
      addRest: 200,
      moveRest: 200,
    });
  });
});
