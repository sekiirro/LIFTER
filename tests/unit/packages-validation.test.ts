import { describe, expect, it } from 'vitest';
import { parseCode, parseTerms, isUuid } from '../../lib/packages/validation';
const valid = {
  tierRank: 1,
  durationMonths: 1,
  durationDays: 30,
  nameAr: 'test-ar',
  nameEn: 'test-en',
  priceMinor: '9223372036854775807',
  currency: 'XTS',
  commissionRateBp: 0,
};
describe('package validation', () => {
  it.each(['test-pkg-a', 'a', 'a1-b2'])('accepts synthetic slug %s', (code) =>
    expect(parseCode(code)).toBe(code),
  );
  it.each(['', 'A', '-a', 'a-', 'a--b', 'a b', null, true, 12])(
    'rejects code %#',
    (code) => expect(parseCode(code)).toBeNull(),
  );
  it('preserves authored content and exact ceiling', () => {
    expect(parseTerms({ ...valid, nameAr: ' test ' })).toEqual({
      ...valid,
      nameAr: ' test ',
    });
    expect(isUuid('00000000-0000-0000-0000-000000000001')).toBe(true);
    expect(isUuid('forged')).toBe(false);
  });
  it.each([1, 2, 3])('accepts immutable tier rank %s', (tierRank) =>
    expect(parseTerms({ ...valid, tierRank })).toMatchObject({ tierRank }),
  );
  it.each([1, 3, 6, 8, 12])('maps preset %s', (m) =>
    expect(
      parseTerms({
        ...valid,
        durationMonths: String(m),
        durationDays: String(m * 30),
      }),
    ).toMatchObject({ durationMonths: m, durationDays: m * 30 }),
  );
  it.each([1, 60, 120, 2147483647])('accepts custom days %s', (d) =>
    expect(
      parseTerms({ ...valid, durationMonths: null, durationDays: d }),
    ).not.toBeNull(),
  );
  it.each([1, 120])('counts Unicode code points %s', (n) =>
    expect(
      parseTerms({ ...valid, nameEn: '\u{1f600}'.repeat(n) }),
    ).not.toBeNull(),
  );
  it.each([
    ...[undefined, null, 0, 4, 1.5, '1x', true].map((tierRank) => ({
      tierRank,
    })),
    { nameAr: '' },
    { nameEn: 'x'.repeat(121) },
    { nameAr: '\u{1f600}'.repeat(121) },
    { nameEn: ' \t\n' },
    { nameAr: null },
    { durationMonths: 2, durationDays: 60 },
    { durationMonths: 4, durationDays: 120 },
    { durationMonths: 1, durationDays: 31 },
    { durationMonths: '' },
    { durationMonths: undefined },
    ...[0, -1, 1.5, 2147483648, NaN, Infinity, true, null, ''].map(
      (durationDays) => ({ durationDays }),
    ),
    ...[
      '0',
      '-1',
      '1.1',
      '9223372036854775808',
      9007199254740992,
      NaN,
      true,
      null,
      '',
    ].map((priceMinor) => ({ priceMinor })),
    ...['xts', 'XT', 'XTSX', ' XTS', '1TS', null].map((currency) => ({
      currency,
    })),
    ...[undefined, null, '', false, NaN, -1, 10001, 1.1].map(
      (commissionRateBp) => ({ commissionRateBp }),
    ),
  ])('rejects malformed terms %#', (patch) =>
    expect(parseTerms({ ...valid, ...patch })).toBeNull(),
  );
  it.each(['1', '9007199254740993', 1n])(
    'accepts exact positive prices %#',
    (priceMinor) =>
      expect(parseTerms({ ...valid, priceMinor })?.priceMinor).toBe(
        String(priceMinor),
      ),
  );
  it('requires all fields', () => expect(parseTerms({})).toBeNull());
});
