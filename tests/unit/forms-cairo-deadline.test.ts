import { describe, expect, it } from 'vitest';

import { calculateCairoD03Deadline } from '../../lib/forms/cairo-deadline';

describe('calculateCairoD03Deadline', () => {
  it('counts Thursday before 18:00 as day one and excludes Friday only', () => {
    expect(calculateCairoD03Deadline('2026-10-29T12:00:00.000Z')).toEqual({
      ruleId: 'cairo-d03-v1',
      startDate: '2026-10-29',
      dayFiveDate: '2026-11-03',
      deadlineAt: '2026-11-03T22:00:00.000Z',
    });
  });

  it('starts on Saturday when submitted Friday', () => {
    expect(calculateCairoD03Deadline('2026-10-30T10:00:00.000Z')).toEqual({
      ruleId: 'cairo-d03-v1',
      startDate: '2026-10-31',
      dayFiveDate: '2026-11-04',
      deadlineAt: '2026-11-04T22:00:00.000Z',
    });
  });

  it('starts the next working day at exactly 18:00 Cairo', () => {
    expect(calculateCairoD03Deadline('2026-11-05T16:00:00.000Z')).toMatchObject(
      {
        startDate: '2026-11-07',
        dayFiveDate: '2026-11-11',
      },
    );
  });

  it('counts across a month and year boundary', () => {
    expect(calculateCairoD03Deadline('2026-12-27T10:00:00.000Z')).toMatchObject(
      {
        startDate: '2026-12-27',
        dayFiveDate: '2026-12-31',
        deadlineAt: '2026-12-31T22:00:00.000Z',
      },
    );
  });

  it('counts the leap day and treats a public holiday as a working day', () => {
    expect(calculateCairoD03Deadline('2028-02-25T10:00:00.000Z')).toMatchObject(
      {
        startDate: '2028-02-26',
        dayFiveDate: '2028-03-01',
      },
    );
    expect(calculateCairoD03Deadline('2027-01-07T10:00:00.000Z')).toMatchObject(
      {
        startDate: '2027-01-07',
        dayFiveDate: '2027-01-12',
      },
    );
  });

  it('uses the first valid instant when Cairo skips midnight at spring forward', () => {
    expect(calculateCairoD03Deadline('2023-04-23T10:00:00.000Z')).toEqual({
      ruleId: 'cairo-d03-v1',
      startDate: '2023-04-23',
      dayFiveDate: '2023-04-27',
      deadlineAt: '2023-04-27T22:00:00.000Z',
    });
  });

  it('uses the first occurrence of deadline midnight around Cairo fall overlap', () => {
    expect(calculateCairoD03Deadline('2023-10-21T10:00:00.000Z')).toEqual({
      ruleId: 'cairo-d03-v1',
      startDate: '2023-10-21',
      dayFiveDate: '2023-10-25',
      deadlineAt: '2023-10-25T21:00:00.000Z',
    });
  });

  it('rejects invalid instants', () => {
    expect(() => calculateCairoD03Deadline('not-a-date')).toThrow();
  });
});
