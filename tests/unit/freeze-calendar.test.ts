import { describe, expect, it } from 'vitest';
import {
  addCairoDays,
  cairoDateAt,
  cairoDateStart,
  compareCairoDates,
} from '../../lib/time/cairo-calendar';
import { countFreezeDays } from '../../lib/subscriptions/freeze-dates';

describe('Cairo calendar', () => {
  it('resolves the first valid instant after the Cairo spring midnight gap', () => {
    expect(cairoDateStart('2026-04-24')).toBe('2026-04-23T22:00:00.000Z');
  });

  it('resolves the date boundary before the Cairo fall-back repeated hour', () => {
    expect(cairoDateStart('2026-10-30')).toBe('2026-10-29T22:00:00.000Z');
    expect(cairoDateAt('2026-10-29T20:00:00Z')).toBe('2026-10-29');
    expect(cairoDateAt('2026-10-29T21:00:00Z')).toBe('2026-10-29');
  });

  it('keeps calendar arithmetic independent of elapsed hours over DST', () => {
    expect(cairoDateStart('2026-11-01')).toBe('2026-10-31T22:00:00.000Z');
    expect(cairoDateStart('2026-11-04')).toBe('2026-11-03T22:00:00.000Z');
    expect(cairoDateStart('2026-06-01')).toBe('2026-05-31T21:00:00.000Z');
  });

  it('handles leap day, month end and ordering as calendar dates', () => {
    expect(addCairoDays('2028-02-28', 2)).toBe('2028-03-01');
    expect(addCairoDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(compareCairoDates('2026-04-23', '2026-04-24')).toBe(-1);
  });

  it('rejects invalid dates and non-integer day adjustments', () => {
    expect(() => cairoDateStart('2026-02-30')).toThrow(RangeError);
    expect(() => addCairoDays('2026-04-24', 1.5)).toThrow(RangeError);
  });
});

describe('freeze counted days', () => {
  it('counts Apply and excludes Stop', () => {
    expect(countFreezeDays('2026-11-01', '2026-11-03')).toBe(2);
  });

  it('credits the Apply day when Apply and Stop occur on the same Cairo date', () => {
    expect(countFreezeDays('2026-11-01', '2026-11-01')).toBe(1);
  });

  it('counts leap-day and month-end intervals without 24-hour assumptions', () => {
    expect(countFreezeDays('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('rejects a Stop date before Apply', () => {
    expect(() => countFreezeDays('2026-11-02', '2026-11-01')).toThrow(
      RangeError,
    );
  });
});
