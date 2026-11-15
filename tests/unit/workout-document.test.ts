import { describe, expect, it } from 'vitest';
import {
  addWorkoutItem,
  moveWorkoutItem,
  parseWorkoutDocumentV1,
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
});
