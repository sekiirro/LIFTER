import { describe, expect, it } from 'vitest';

import {
  deriveMealTimingOptions,
  reconcileDerivedChoice,
} from '../../lib/forms/progression';

describe('S14 derived N7 meal timing options', () => {
  it.each([2, 3, 4, 5])(
    'derives 1..N and fixed options for %i meals',
    (count) => {
      expect(deriveMealTimingOptions(count)).toEqual([
        ...Array.from({ length: count }, (_, index) => `meal-${index + 1}`),
        'before-first',
        'no-fixed-time',
      ]);
    },
  );

  it.each([0, 1, 6, 6.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects unsupported meal count %s',
    (count) => {
      expect(deriveMealTimingOptions(count)).toEqual([]);
    },
  );

  it('keeps a valid timing choice and clears one made stale by the parent', () => {
    const allowed = deriveMealTimingOptions(2);
    expect(reconcileDerivedChoice('meal-2', allowed)).toBe('meal-2');
    expect(reconcileDerivedChoice('meal-4', allowed)).toBeUndefined();
  });
});
