import { expect, it } from 'vitest';
import {
  selectRetained,
  shouldPrune,
} from '../../scripts/backup/lib/retention.mjs';

it('keeps future folders, retained backups and incomplete folders up to 24 hours old', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  for (const complete of [false, true]) {
    expect(
      shouldPrune(new Date('2026-10-28T12:00:00Z'), false, complete, now),
    ).toBe(false);
    expect(
      shouldPrune(new Date('2025-01-01T00:00:00Z'), true, complete, now),
    ).toBe(false);
  }
  expect(shouldPrune(new Date('2026-10-26T12:00:00Z'), false, false, now)).toBe(
    false,
  );
  expect(shouldPrune(new Date('2026-10-26T11:59:59Z'), false, false, now)).toBe(
    true,
  );
  expect(shouldPrune(new Date('2026-10-27T11:00:00Z'), false, false, now)).toBe(
    false,
  );
  expect(shouldPrune(new Date('2026-10-27T11:00:00Z'), false, true, now)).toBe(
    true,
  );
  expect(shouldPrune(new Date('invalid'), false, true, now)).toBe(false);
});

it('retains the exact union over eighteen months, two backups per day', () => {
  const now = new Date('2026-10-27T23:00:00Z');
  const dates: Date[] = [];
  for (
    let t = Date.parse('2025-04-01T00:00:00Z');
    t <= now.getTime();
    t += 86400000
  ) {
    dates.push(new Date(t + 3600000), new Date(t + 7200000));
  }
  const result = selectRetained(dates, now);
  const expectedDays = [
    '2026-10-27',
    '2026-10-26',
    '2026-10-25',
    '2026-10-24',
    '2026-10-23',
    '2026-10-22',
    '2026-10-21',
    '2026-10-20',
    '2026-10-19',
    '2026-10-18',
    '2026-10-17',
    '2026-10-16',
    '2026-10-15',
    '2026-10-14',
    '2026-10-11',
    '2026-10-04',
    '2026-09-27',
    '2026-09-20',
    '2026-09-13',
    '2026-09-30',
    '2026-08-31',
    '2026-07-31',
    '2026-06-30',
    '2026-05-31',
    '2026-04-30',
    '2026-03-31',
    '2026-02-28',
    '2026-01-31',
    '2025-12-31',
    '2025-11-30',
  ];
  expect(result.size).toBe(30);
  expect(result).toEqual(
    new Set(expectedDays.map((date) => Date.parse(`${date}T02:00:00Z`))),
  );
  expect(result.has(Date.parse('2026-10-14T02:00:00Z'))).toBe(true); // day 14
  expect(result.has(Date.parse('2026-10-13T02:00:00Z'))).toBe(false); // day 15
  expect(result.has(Date.parse('2026-09-13T02:00:00Z'))).toBe(true); // week 8
  expect(result.has(Date.parse('2026-09-06T02:00:00Z'))).toBe(false); // week 9
  expect(result.has(Date.parse('2025-11-30T02:00:00Z'))).toBe(true); // month 12
  expect(result.has(Date.parse('2025-10-31T02:00:00Z'))).toBe(false); // month 13
});
it('uses Monday ISO weeks across a year boundary and ignores future dates', () => {
  const now = new Date('2027-01-20T23:00:00Z');
  const dates = ['2026-12-28', '2027-01-03', '2027-01-04', '2027-01-21'].map(
    (date) => new Date(`${date}T02:00:00Z`),
  );
  const result = selectRetained(dates, now);
  // December's newest is retained monthly; Jan 3 wins the week spanning New Year.
  expect(result).toEqual(new Set(dates.slice(0, 3).map(Number)));
  expect(selectRetained([], now)).toEqual(new Set());
});
