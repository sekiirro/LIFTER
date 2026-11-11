import { describe, expect, it } from 'vitest';
import {
  collectIds,
  duplicateDay,
  duplicateItem,
  type WorkoutDay,
} from '../../lib/workout-planner/id-remap';

// T003-note: FR-002 id continuity and duplicate remap (SC-012). RED before
// implementation. Mutation target: skipping one descendant level must collide.

function makeDay(): WorkoutDay {
  return {
    id: 'day-1',
    kind: 'session',
    title: 'Push',
    notes: 'day note',
    items: [
      {
        id: 'item-A',
        exercise: { source: 'global', identity_id: 'ex-1', version: 3 },
        name: 'Bench Press',
        restSec: 90,
        rir: 1,
        reps: { min: 8, max: 12 },
        notes: 'coach note',
        alternatives: [],
        sets: [
          { id: 'set-A1', type: 'warmup', load: { mode: 'bodyweight' } },
          {
            id: 'set-A2',
            type: 'working',
            load: { mode: 'added_weight', value: '60', unit: 'kg' },
          },
        ],
      },
      {
        id: 'item-B',
        exercise: { source: 'global', identity_id: 'ex-2', version: 1 },
        name: 'Overhead Press',
        restSec: 120,
        rir: 2,
        sets: [
          {
            id: 'set-B1',
            type: 'working',
            load: { mode: 'added_weight', value: '40', unit: 'kg' },
          },
        ],
      },
    ],
  };
}

function makeIds(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

describe('F17 id continuity and duplicate remap (FR-002, SC-012)', () => {
  it('preserves unchanged ids when duplicating a single item', () => {
    const day = makeDay();
    const copy = duplicateItem(day.items[0]!, makeIds('x'));
    expect(copy.id).not.toBe('item-A');
    // Sibling untouched: original day keeps every id.
    expect(collectIds(day)).toEqual([
      'day-1',
      'item-A',
      'set-A1',
      'set-A2',
      'item-B',
      'set-B1',
    ]);
  });

  it('duplicate exercise remaps the item and every set field-for-field', () => {
    const day = makeDay();
    const original = day.items[0]!;
    const copy = duplicateItem(original, makeIds('x'));
    expect(copy.id).not.toBe(original.id);
    expect(copy.sets).toHaveLength(original.sets.length);
    const originalSetIds = new Set(original.sets.map((s) => s.id));
    for (const set of copy.sets) {
      expect(originalSetIds.has(set.id)).toBe(false);
    }
    // Field-for-field equality apart from ids.
    expect({
      ...copy,
      id: 'item-A',
      sets: copy.sets.map((s, i) => ({ ...s, id: original.sets[i]!.id })),
    }).toEqual(original);
    // No collisions with the source document.
    const before = new Set(collectIds(day));
    for (const id of collectIds({ ...day, items: [copy] } as WorkoutDay)) {
      if (id.startsWith('x-')) continue;
      expect(before.has(id)).toBe(true);
    }
    const fresh = [copy.id, ...copy.sets.map((s) => s.id)];
    expect(new Set(fresh).size).toBe(fresh.length);
    for (const id of fresh) expect(before.has(id)).toBe(false);
  });

  it('duplicate day remaps the day, all items and all descendant sets', () => {
    const day = makeDay();
    const before = new Set(collectIds(day));
    const copy = duplicateDay(day, makeIds('y'));
    expect(copy.id).not.toBe(day.id);
    expect(copy.kind).toBe(day.kind);
    expect(copy.title).toBe(day.title);
    expect(copy.notes).toBe(day.notes);
    expect(copy.items).toHaveLength(day.items.length);
    const after = collectIds(copy);
    // Every id in the copy is fresh: zero overlap with the source document.
    expect(after).toHaveLength(1 + 2 + 3);
    for (const id of after) expect(before.has(id)).toBe(false);
    // Uniqueness inside the copy: no collisions.
    expect(new Set(after).size).toBe(after.length);
    // Field-for-field equality apart from ids.
    expect(copy.items[0]!.name).toBe('Bench Press');
    expect(copy.items[0]!.sets[1]).toMatchObject({
      type: 'working',
      load: { mode: 'added_weight', value: '60', unit: 'kg' },
    });
    expect(copy.items[0]!.reps).toEqual({ min: 8, max: 12 });
  });
});

describe('F17 id remap load variants and reps (FR-002, SC-012)', () => {
  it('round-trips bodyweight, assisted and single-value reps exactly', () => {
    const item: any = {
      id: 'item-Z',
      exercise: { source: 'global', identity_id: 'ex-9', version: 1 },
      name: 'Pull-up',
      restSec: 60,
      rir: 0,
      reps: { value: 8 },
      notes: '',
      alternatives: [],
      sets: [
        { id: 's1', type: 'working', load: { mode: 'bodyweight' } },
        { id: 's2', type: 'working', load: { mode: 'assisted', value: '20', unit: 'kg' } },
        { id: 's3', type: 'working', load: { mode: 'added_weight', value: '10', unit: 'lb' } },
      ],
    };
    const copy = duplicateItem(item, () => 'nid');
    expect(copy.id).not.toBe(item.id);
    expect({
      ...copy,
      id: item.id,
      sets: copy.sets.map((s: any, i: number) => ({ ...s, id: item.sets[i].id })),
    }).toEqual(item);
    expect(copy.reps).toEqual({ value: 8 });
    expect(copy.sets[0].load).toEqual({ mode: 'bodyweight' });
    expect(copy.sets[1].load).toEqual({ mode: 'assisted', value: '20', unit: 'kg' });
  });
});
