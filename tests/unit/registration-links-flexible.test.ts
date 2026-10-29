import { expect, it } from 'vitest';
import {
  createDefaultPaymentTerms,
  parsePaymentTerms,
} from '../../lib/registration-links/validation';

const custom = {
  upfrontAmountMinor: '400',
  totalPaymentCount: 3,
  installments: [
    { seq: 1, amountMinor: '400', dueOffsetDays: 2 },
    { seq: 2, amountMinor: '301', dueOffsetDays: 17 },
    { seq: 3, amountMinor: '499', dueOffsetDays: 62 },
  ],
};

it('preserves explicit custom amounts and all issued offsets without mutation', () => {
  const before = JSON.stringify(custom);
  expect(parsePaymentTerms(custom, '1200')).toEqual(custom);
  expect(JSON.stringify(custom)).toBe(before);
});

it('count includes upfront and must equal the row count', () => {
  for (const totalPaymentCount of [0, 2, 4, 3.5, '3', NaN, Infinity])
    expect(
      parsePaymentTerms({ ...custom, totalPaymentCount }, '1200'),
    ).toBeUndefined();
});

it('requires explicit positive canonical upfront equal to row one', () => {
  for (const upfrontAmountMinor of [
    undefined,
    '0',
    '401',
    400,
    '0400',
    '1.2',
    '9223372036854775808',
  ])
    expect(
      parsePaymentTerms({ ...custom, upfrontAmountMinor }, '1200'),
    ).toBeUndefined();
});

it('requires exact price totals, including bigint extremes', () => {
  expect(parsePaymentTerms(custom, '1201')).toBeUndefined();
  expect(parsePaymentTerms(custom, '1199')).toBeUndefined();
  const terms = createDefaultPaymentTerms(
    '9223372036854775807',
    '9007199254740993',
  );
  expect(terms).toEqual({
    upfrontAmountMinor: '9007199254740993',
    totalPaymentCount: 2,
    installments: [
      { seq: 1, amountMinor: '9007199254740993', dueOffsetDays: 0 },
      { seq: 2, amountMinor: '9214364837600034814', dueOffsetDays: 30 },
    ],
  });
  expect(parsePaymentTerms(terms, '9223372036854775807')).toEqual(terms);
});

it('constructs chosen upfront at approval and exact positive residual at activation offset 30', () => {
  expect(createDefaultPaymentTerms('1200', '401')).toEqual({
    upfrontAmountMinor: '401',
    totalPaymentCount: 2,
    installments: [
      { seq: 1, amountMinor: '401', dueOffsetDays: 0 },
      { seq: 2, amountMinor: '799', dueOffsetDays: 30 },
    ],
  });
  // Offsets are Cairo calendar days from activation, through that Cairo day-end.
  // Issuance has no activation fact: no absolute date may be invented here.
  const terms = createDefaultPaymentTerms('1200', '1199');
  expect(terms?.installments[1]?.amountMinor).toBe('1');
  expect(terms?.installments[1]).not.toHaveProperty('dueOn');
  expect(terms?.installments[1]).not.toHaveProperty('dueAt');
});

it('full-price upfront is one payment without a zero remainder', () => {
  expect(createDefaultPaymentTerms('1200', '1200')).toEqual({
    upfrontAmountMinor: '1200',
    totalPaymentCount: 1,
    installments: [{ seq: 1, amountMinor: '1200', dueOffsetDays: 0 }],
  });
});

it.each([
  ['1200', undefined],
  ['1200', '0'],
  ['1200', '1201'],
  ['1200', 400],
  [1200, '400'],
  ['1200', '0400'],
  ['9223372036854775808', '400'],
  ['0', '1'],
])(
  'never invents an upfront amount or split for invalid input %#',
  (price, upfront) => {
    expect(createDefaultPaymentTerms(price, upfront)).toBeUndefined();
  },
);

it('null retains full upfront/no schedule; malformed or inferred custom rows fail', () => {
  expect(parsePaymentTerms(null)).toBeNull();
  for (const value of [
    undefined,
    [],
    {},
    { ...custom, extra: true },
    { ...custom, installments: [] },
    {
      ...custom,
      installments: custom.installments.map(({ seq, dueOffsetDays }) => ({
        seq,
        dueOffsetDays,
      })),
    },
    {
      ...custom,
      installments: [{ seq: 1, amountMinor: '1200', dueOffsetDays: -1 }],
    },
    {
      ...custom,
      installments: custom.installments.map((row) => ({
        ...row,
        dueOffsetDays: 0,
      })),
    },
  ])
    expect(parsePaymentTerms(value, '1200')).toBeUndefined();
});
