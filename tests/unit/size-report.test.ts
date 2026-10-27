import { describe, expect, it } from 'vitest';
import { evaluate } from '../../scripts/size-limit.mjs';

describe('Worker size limit', () => {
  it.each([
    { sizeKiB: 1536, pct: 50, over: false, exitCode: 0 },
    { sizeKiB: 3072, pct: 100, over: false, exitCode: 0 },
    { sizeKiB: 4608, pct: 150, over: true, exitCode: 1 },
    {
      sizeKiB: 3072.001,
      pct: (3072.001 / 3072) * 100,
      over: true,
      exitCode: 1,
    },
  ])(
    'compares $sizeKiB KiB with a 3072 KiB limit',
    ({ sizeKiB, pct, over, exitCode }) => {
      const result = evaluate(sizeKiB, 3072);
      expect(result).toEqual({ pct, over });
      expect(result.over ? 1 : 0).toBe(exitCode);
    },
  );

  it('accepts an empty bundle size', () => {
    expect(evaluate(0, 1)).toEqual({ pct: 0, over: false });
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid limit %s', (limit) => {
    expect(() => evaluate(1, limit)).toThrow(RangeError);
  });

  it.each([-1, NaN, Infinity])('rejects invalid size %s', (size) => {
    expect(() => evaluate(size, 1)).toThrow(RangeError);
  });
});
