import { describe, expect, it } from 'vitest';
import {
  addWorkoutItem,
  moveWorkoutItem,
  parseWorkoutDocumentV1,
  removeWorkoutAlternative,
  updatePlanNotes,
  updateWorkoutDay,
  updateWorkoutItem,
  updateWorkoutSet,
} from '../../lib/workout-planner/document';

const uuid = (tail: string) =>
  `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const ref = { source: 'global', identity_id: uuid('1'), version: 2 };

function doc(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    days: [
      {
        id: uuid('2'),
        kind: 'session',
        items: [
          {
            id: uuid('3'),
            exercise: ref,
            name: 'Squat',
            reps: { min: 8, max: 12 },
            restSec: 90,
            rir: 0,
            alternatives: [],
            sets: [
              { id: uuid('4'), type: 'working', load: { mode: 'bodyweight' } },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('F17 workout document schema v1 (T002)', () => {
  it('accepts a valid session and returns an isolated parsed value', () => {
    const input = doc();
    const parsed = parseWorkoutDocumentV1(input);
    expect(parsed.days[0]!.items).toHaveLength(1);
    parsed.days[0]!.items[0]!.name = 'Changed';
    expect(
      (input.days as { items: { name: string }[] }[])[0]!.items[0]!.name,
    ).toBe('Squat');
  });

  it.each([
    [
      'rest day with item',
      {
        days: [
          {
            id: uuid('2'),
            kind: 'rest',
            items: [
              {
                id: uuid('3'),
                exercise: ref,
                name: 'Squat',
                alternatives: [],
                sets: [],
              },
            ],
          },
        ],
      },
    ],
    [
      'duplicate id',
      {
        days: [{ id: uuid('2'), kind: 'session', items: [{ id: uuid('2') }] }],
      },
    ],
    [
      'invalid reps',
      {
        days: [
          {
            id: uuid('2'),
            kind: 'session',
            items: [
              {
                id: uuid('3'),
                exercise: ref,
                name: 'x',
                reps: { min: 9, max: 8 },
                alternatives: [],
                sets: [],
              },
            ],
          },
        ],
      },
    ],
    [
      'invalid rest step',
      {
        days: [
          {
            id: uuid('2'),
            kind: 'session',
            items: [
              {
                id: uuid('3'),
                exercise: ref,
                name: 'x',
                restSec: 10,
                alternatives: [],
                sets: [],
              },
            ],
          },
        ],
      },
    ],
    [
      'four alternatives',
      {
        days: [
          {
            id: uuid('2'),
            kind: 'session',
            items: [
              {
                id: uuid('3'),
                exercise: ref,
                name: 'x',
                alternatives: [
                  ref,
                  { ...ref, identity_id: uuid('5') },
                  { ...ref, identity_id: uuid('6') },
                  { ...ref, identity_id: uuid('7') },
                ],
                sets: [],
              },
            ],
          },
        ],
      },
    ],
    [
      'variation key',
      {
        days: [
          {
            id: uuid('2'),
            kind: 'session',
            items: [
              {
                id: uuid('3'),
                exercise: { ...ref, variation: 'bad' },
                name: 'x',
                alternatives: [],
                sets: [],
              },
            ],
          },
        ],
      },
    ],
    [
      'assisted without exact decimal',
      {
        days: [
          {
            id: uuid('2'),
            kind: 'session',
            items: [
              {
                id: uuid('3'),
                exercise: ref,
                name: 'x',
                alternatives: [],
                sets: [
                  {
                    id: uuid('4'),
                    type: 'working',
                    load: { mode: 'assisted', value: 3, unit: 'kg' },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  ])('rejects %s with invalid_document', (_label, replacement) => {
    const input = doc(replacement as Record<string, unknown>);
    expect(() => parseWorkoutDocumentV1(input)).toThrowError(
      'invalid_document',
    );
  });

  it('rejects add/move to a rest day before producing a changed document', () => {
    const input = parseWorkoutDocumentV1(
      doc({
        days: [
          {
            id: uuid('2'),
            kind: 'session',
            items: [
              {
                id: uuid('3'),
                exercise: ref,
                name: 'Squat',
                alternatives: [],
                sets: [],
              },
            ],
          },
          { id: uuid('5'), kind: 'rest', items: [] },
        ],
      }),
    );
    const before = structuredClone(input);
    expect(() =>
      addWorkoutItem(input, uuid('5'), input.days[0]!.items[0]!),
    ).toThrowError('invalid_document');
    expect(() => moveWorkoutItem(input, uuid('3'), uuid('5'))).toThrowError(
      'invalid_document',
    );
    expect(input).toEqual(before);
    expect(input.days[0]!.items[0]!.id).toBe(uuid('3'));
  });

  describe('F17 document editable field operations (T043 slice 2)', () => {
    it('updates plan notes and clears empty notes', () => {
      const initial = parseWorkoutDocumentV1(doc());
      const updated = updatePlanNotes(initial, 'Coach general remarks');
      expect(updated.notes).toBe('Coach general remarks');

      const cleared = updatePlanNotes(updated, '');
      expect(cleared.notes).toBeUndefined();
    });

    it('updates day fields and rejects setting a session day with items to rest day', () => {
      const initial = parseWorkoutDocumentV1(doc());
      const updated = updateWorkoutDay(initial, uuid('2'), {
        title: 'Push Day',
        notes: 'Rest 2 mins between compounds',
      });
      expect(updated.days[0]!.title).toBe('Push Day');
      expect(updated.days[0]!.notes).toBe('Rest 2 mins between compounds');

      // Attempting to set day with items to 'rest' throws invalid_document
      expect(() =>
        updateWorkoutDay(updated, uuid('2'), { kind: 'rest' }),
      ).toThrowError('invalid_document');
    });

    it('updates item fields (notes, reps, restSec, rir) with document validation', () => {
      const initial = parseWorkoutDocumentV1(doc());
      const updated = updateWorkoutItem(initial, uuid('3'), {
        notes: 'Strict form',
        reps: { value: 10 },
        restSec: 120,
        rir: 2,
      });
      const item = updated.days[0]!.items[0]!;
      expect(item.notes).toBe('Strict form');
      expect(item.reps).toEqual({ value: 10 });
      expect(item.restSec).toBe(120);
      expect(item.rir).toBe(2);

      // Rejects invalid reps (min > max)
      expect(() =>
        updateWorkoutItem(updated, uuid('3'), {
          reps: { min: 15, max: 10 },
        }),
      ).toThrowError('invalid_document');

      // Rejects invalid restSec (not divisible by 15)
      expect(() =>
        updateWorkoutItem(updated, uuid('3'), { restSec: 50 }),
      ).toThrowError('invalid_document');

      // Rejects invalid rir (> 5)
      expect(() =>
        updateWorkoutItem(updated, uuid('3'), { rir: 6 }),
      ).toThrowError('invalid_document');
    });

    it('updates set type and load variants with document validation', () => {
      const initial = parseWorkoutDocumentV1(doc());
      const updated = updateWorkoutSet(initial, uuid('4'), {
        type: 'warmup',
        load: { mode: 'added_weight', value: '100.5', unit: 'kg' },
      });
      const set = updated.days[0]!.items[0]!.sets[0]!;
      expect(set.type).toBe('warmup');
      expect(set.load).toEqual({
        mode: 'added_weight',
        value: '100.5',
        unit: 'kg',
      });

      // Switch to assisted load
      const assisted = updateWorkoutSet(updated, uuid('4'), {
        load: { mode: 'assisted', value: '15.0', unit: 'lb' },
      });
      expect(assisted.days[0]!.items[0]!.sets[0]!.load).toEqual({
        mode: 'assisted',
        value: '15.0',
        unit: 'lb',
      });

      // Rejects non-positive load value
      expect(() =>
        updateWorkoutSet(assisted, uuid('4'), {
          load: { mode: 'added_weight', value: '0', unit: 'kg' },
        }),
      ).toThrowError('invalid_document');
    });

    it('removes an alternative by index', () => {
      const altRef = {
        source: 'global' as const,
        identity_id: uuid('9'),
        version: 1,
      };
      const initial = parseWorkoutDocumentV1(
        doc({
          days: [
            {
              id: uuid('2'),
              kind: 'session',
              items: [
                {
                  id: uuid('3'),
                  exercise: ref,
                  name: 'Squat',
                  alternatives: [altRef],
                  sets: [],
                },
              ],
            },
          ],
        }),
      );
      expect(initial.days[0]!.items[0]!.alternatives).toHaveLength(1);

      const removed = removeWorkoutAlternative(initial, uuid('3'), 0);
      expect(removed.days[0]!.items[0]!.alternatives).toHaveLength(0);
    });
  });
});
