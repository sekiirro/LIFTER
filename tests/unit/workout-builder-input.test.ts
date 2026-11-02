import { describe, expect, it } from 'vitest';
import {
  parseBuilderNumber,
  type BuilderNumberKind,
} from '../../lib/plans/workout/builder-input';

const invalidInputs = ['abc', '-1', '1e3', '١٢x'] as const;

describe('workout builder numeric input parsing', () => {
  it.each(invalidInputs)(
    'rejects invalid input %s for rest, RIR, and load without replacing the previous value',
    (input) => {
      for (const kind of ['rest', 'rir', 'load'] as const) {
        const previous = 42;
        const parsed = parseBuilderNumber(input, kind);
        expect(parsed).toBeNull();
        expect(parsed === null ? previous : parsed).toBe(previous);
      }
    },
  );

  it.each([
    ['reps', '١٢', 12],
    ['rest', '١٢.٥', 12.5],
    ['rir', '2', 2],
    ['load', '١٢.٥', '12.5'],
  ] as const)(
    'stores the canonical value for valid Arabic-Indic %s input',
    (kind, input, expected) => {
      expect(parseBuilderNumber(input, kind as BuilderNumberKind)).toBe(
        expected,
      );
    },
  );

  it.each([
    ['reps', '12', 12],
    ['rest', '12.5', 12.5],
    ['rir', '2', 2],
    ['load', '12.5', '12.5'],
  ] as const)(
    'stores the canonical value for valid Latin %s input',
    (kind, input, expected) => {
      expect(parseBuilderNumber(input, kind as BuilderNumberKind)).toBe(
        expected,
      );
    },
  );

  it('clears optional rest and RIR fields when input is empty', () => {
    expect(parseBuilderNumber('', 'rest')).toBeUndefined();
    expect(parseBuilderNumber('', 'rir')).toBeUndefined();
  });

  it('uses the workout schema bounds: positive reps, non-negative rest/RIR, and positive load', () => {
    expect(parseBuilderNumber('0', 'reps')).toBeNull();
    expect(parseBuilderNumber('0', 'rest')).toBe(0);
    expect(parseBuilderNumber('0', 'rir')).toBe(0);
    expect(parseBuilderNumber('0', 'load')).toBeNull();
    expect(parseBuilderNumber('-1', 'rest')).toBeNull();
    expect(parseBuilderNumber('-1', 'rir')).toBeNull();
  });
});
