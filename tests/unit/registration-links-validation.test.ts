import { describe, expect, it } from 'vitest';
import {
  exactAmount,
  parseSchedule,
} from '../../lib/registration-links/validation';
const BIGINT_MAX = '9223372036854775807';
describe('exact installment contract', () => {
  it('preserves bigint strings and permits a nonzero first offset', () => {
    const rows = [
      { seq: 1, amountMinor: '9007199254740993', dueOffsetDays: 2 },
    ];
    expect(parseSchedule(rows, '9007199254740993')).toEqual(rows);
    expect(parseSchedule(null)).toBeNull();
    const padded = [
      { seq: 1, amountMinor: '00000000000000000000001200', dueOffsetDays: 0 },
    ];
    expect(parseSchedule(padded, '1200')).toEqual(padded);
  });
  it('accepts exact BIGINT_MAX and rejects BIGINT_MAX+1 at the amount boundary', () => {
    expect(exactAmount(BIGINT_MAX)).toBe(true);
    expect(exactAmount('9223372036854775808')).toBe(false);
    const row = [{ seq: 1, amountMinor: BIGINT_MAX, dueOffsetDays: 0 }];
    expect(parseSchedule(row, BIGINT_MAX)).toEqual(row);
    expect(
      parseSchedule(
        [{ seq: 1, amountMinor: '9223372036854775808', dueOffsetDays: 0 }],
        BIGINT_MAX,
      ),
    ).toBeUndefined();
  });
  it('rejects aggregate overflow even when every row fits the amount bound', () => {
    expect(
      parseSchedule(
        [
          { seq: 1, amountMinor: BIGINT_MAX, dueOffsetDays: 0 },
          { seq: 2, amountMinor: BIGINT_MAX, dueOffsetDays: 1 },
        ],
        BIGINT_MAX,
      ),
    ).toBeUndefined();
  });
  it('accepts the technical int offset maximum and rejects overflow', () => {
    const rows = [
      { seq: 1, amountMinor: '1', dueOffsetDays: 0 },
      { seq: 2, amountMinor: '1', dueOffsetDays: 2147483647 },
    ];
    expect(parseSchedule(rows, '2')).toEqual(rows);
    expect(
      parseSchedule(
        [{ seq: 1, amountMinor: '1', dueOffsetDays: 2147483648 }],
        '1',
      ),
    ).toBeUndefined();
  });
  it('requires contiguous sequence and strictly increasing offsets', () => {
    expect(
      parseSchedule(
        [
          { seq: 1, amountMinor: '400', dueOffsetDays: 2 },
          { seq: 2, amountMinor: '800', dueOffsetDays: 12 },
        ],
        '1200',
      ),
    ).toEqual([
      { seq: 1, amountMinor: '400', dueOffsetDays: 2 },
      { seq: 2, amountMinor: '800', dueOffsetDays: 12 },
    ]);
    for (const value of [
      [
        { seq: 1, amountMinor: '1', dueOffsetDays: 0 },
        { seq: 2, amountMinor: '1', dueOffsetDays: 0 },
      ],
      [
        { seq: 1, amountMinor: '1', dueOffsetDays: 2 },
        { seq: 2, amountMinor: '1', dueOffsetDays: 1 },
      ],
      [
        { seq: 1, amountMinor: '1', dueOffsetDays: 0 },
        { seq: 3, amountMinor: '1', dueOffsetDays: 1 },
      ],
      [
        { seq: 2, amountMinor: '1', dueOffsetDays: 0 },
        { seq: 1, amountMinor: '1', dueOffsetDays: 1 },
      ],
    ])
      expect(parseSchedule(value, '2')).toBeUndefined();
  });
  it('distinguishes SQL NULL from empty array and JSON-null text', () => {
    expect(parseSchedule(null)).toBeNull();
    expect(parseSchedule([])).toBeUndefined();
    expect(parseSchedule('null')).toBeUndefined();
    expect(parseSchedule(undefined)).toBeUndefined();
    expect(parseSchedule({})).toBeUndefined();
  });
  it('rejects coercion, fractions and non-string money', () => {
    for (const amountMinor of [
      1200,
      1200n,
      true,
      '1.2',
      '1e3',
      ' 1200',
      '1200 ',
      '-1',
      '+1',
      '',
      '0',
    ])
      expect(
        parseSchedule([{ seq: 1, amountMinor, dueOffsetDays: 0 }], '1200'),
      ).toBeUndefined();
    for (const dueOffsetDays of ['0', null, true, 1.5, -1, NaN, Infinity])
      expect(
        parseSchedule([{ seq: 1, amountMinor: '1200', dueOffsetDays }], '1200'),
      ).toBeUndefined();
    for (const seq of ['1', null, true, 1.5, 0, -1, NaN, Infinity])
      expect(
        parseSchedule([{ seq, amountMinor: '1200', dueOffsetDays: 0 }], '1200'),
      ).toBeUndefined();
  });
  it('requires the exact live sum against the displayed price', () => {
    const rows = [
      { seq: 1, amountMinor: '400', dueOffsetDays: 0 },
      { seq: 2, amountMinor: '800', dueOffsetDays: 12 },
    ];
    expect(parseSchedule(rows, '1200')).toEqual(rows);
    expect(parseSchedule(rows, '1201')).toBeUndefined();
    expect(parseSchedule(rows, '1199')).toBeUndefined();
    expect(parseSchedule(rows, '1200.0')).toBeUndefined();
    expect(parseSchedule(rows, 1200 as unknown as string)).toBeUndefined();
  });
  it.each([
    [],
    {},
    'null',
    [{ seq: 1, amountMinor: 1, dueOffsetDays: 0 }],
    [{ seq: 1, amountMinor: '0', dueOffsetDays: 0 }],
    [{ seq: 1, amountMinor: '9223372036854775808', dueOffsetDays: 0 }],
    [{ seq: 2, amountMinor: '1', dueOffsetDays: 0 }],
    [{ seq: 1, amountMinor: '1.2', dueOffsetDays: 0 }],
    [{ seq: 1, amountMinor: '1', dueOffsetDays: 2147483648 }],
    [{ seq: 1, amountMinor: '1', dueOffsetDays: 0, extra: true }],
    [
      { seq: 1, amountMinor: '1', dueOffsetDays: 0 },
      { seq: 2, amountMinor: '1', dueOffsetDays: 0 },
    ],
  ])('rejects malformed schedule %#', (value) => {
    expect(parseSchedule(value)).toBeUndefined();
  });
  it('rejects unequal exact sum', () =>
    expect(
      parseSchedule([{ seq: 1, amountMinor: '2', dueOffsetDays: 0 }], '3'),
    ).toBeUndefined());
});
