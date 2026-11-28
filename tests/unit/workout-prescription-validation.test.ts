// S60-D3: the prescription bounds (reps 1..100, rest 0..600 on the 15s grid,
// RIR 0..5) are the same values the merged document validator accepts. This
// table pins those accepted/rejected values: it passes before the
// EntryPrescriptionFields reuse refactor and must pass identically after it.

import { describe, expect, it } from 'vitest';
import {
  parseWorkoutDocumentV1,
  type WorkoutDocumentV1,
} from '../../lib/workout-planner/document';
import {
  isValidReps,
  isValidRir,
  isValidRestSec,
} from '../../lib/workout-planner/entry-prescriptions';

const uuid = (tail: string) =>
  `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const DAY_ID = uuid('2');
const ITEM_ID = uuid('3');
const REF = { source: 'global' as const, identity_id: uuid('1'), version: 2 };

function documentWith(item: Record<string, unknown>): unknown {
  return {
    schema_version: 1,
    days: [
      {
        id: DAY_ID,
        kind: 'session',
        items: [
          {
            id: ITEM_ID,
            exercise: REF,
            name: 'Squat',
            alternatives: [],
            sets: [],
            ...item,
          },
        ],
      },
    ],
  };
}

function documentAccepts(item: Record<string, unknown>): boolean {
  try {
    parseWorkoutDocumentV1(documentWith(item));
    return true;
  } catch {
    return false;
  }
}

type RepsCase = { reps: unknown; valid: boolean };
type ScalarCase = { value: unknown; valid: boolean };

const REPS_CASES: RepsCase[] = [
  { reps: { value: 0 }, valid: false },
  { reps: { value: 1 }, valid: true },
  { reps: { value: 100 }, valid: true },
  { reps: { value: 101 }, valid: false },
  { reps: { value: 1.5 }, valid: false },
  { reps: { value: '10' }, valid: false },
  { reps: { min: 1, max: 100 }, valid: true },
  { reps: { min: 5, max: 5 }, valid: true },
  { reps: { min: 0, max: 10 }, valid: false },
  { reps: { min: 1, max: 101 }, valid: false },
  { reps: { min: 8, max: 5 }, valid: false },
  { reps: { min: 1.5, max: 10 }, valid: false },
  { reps: {}, valid: false },
  { reps: { min: 5 }, valid: false },
  { reps: { value: 10, min: 1 }, valid: false },
  { reps: { value: 10, extra: 1 }, valid: false },
];

const REST_CASES: ScalarCase[] = [
  { value: -15, valid: false },
  { value: 0, valid: true },
  { value: 15, valid: true },
  { value: 30, valid: true },
  { value: 600, valid: true },
  { value: 615, valid: false },
  { value: 7, valid: false },
  { value: 601, valid: false },
  { value: 45.5, valid: false },
  { value: '90', valid: false },
];

const RIR_CASES: ScalarCase[] = [
  { value: -1, valid: false },
  { value: 0, valid: true },
  { value: 5, valid: true },
  { value: 6, valid: false },
  { value: 2.5, valid: false },
  { value: '3', valid: false },
];

describe('S60-D3 prescription bounds (reps/rest/RIR)', () => {
  it.each(REPS_CASES)('reps %j is %s', ({ reps, valid }) => {
    expect(isValidReps(reps)).toBe(valid);
    expect(documentAccepts({ reps })).toBe(valid);
  });

  it.each(REST_CASES)('restSec %j is %s', ({ value, valid }) => {
    expect(isValidRestSec(value)).toBe(valid);
    expect(documentAccepts({ restSec: value })).toBe(valid);
  });

  it.each(RIR_CASES)('rir %j is %s', ({ value, valid }) => {
    expect(isValidRir(value)).toBe(valid);
    expect(documentAccepts({ rir: value })).toBe(valid);
  });

  it('accepts a fully prescribed entry at every boundary', () => {
    const parsed: WorkoutDocumentV1 = parseWorkoutDocumentV1(
      documentWith({
        reps: { min: 1, max: 100 },
        restSec: 600,
        rir: 5,
      }),
    );
    const item = parsed.days[0]!.items[0]!;
    expect(item.reps).toEqual({ min: 1, max: 100 });
    expect(item.restSec).toBe(600);
    expect(item.rir).toBe(5);
  });
});
