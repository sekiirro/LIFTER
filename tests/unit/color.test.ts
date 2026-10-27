import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  DEFAULT_BRAND,
  deriveBrand,
  parseHex,
} from '../../lib/design/color';

describe('hex colors', () => {
  it.each([
    ['#aBc', '#AABBCC'],
    ['#abcDEF', '#ABCDEF'],
    ['#000', '#000000'],
    ['#FFFFFF', '#FFFFFF'],
  ])('normalizes %s', (input, expected) => {
    expect(parseHex(input!)).toBe(expected);
  });
  it.each([
    '',
    '059669',
    ' #059669',
    '#059669 ',
    '#12',
    '#1234',
    '#12345678',
    '#gggggg',
    'red',
    'rgb(0,0,0)',
    '#123456\n',
  ])('rejects %j', (input) => {
    expect(parseHex(input)).toBeNull();
  });
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(Math.abs(contrastRatio('#FFFFFF', '#059669') - 3.77)).toBeLessThan(
      0.02,
    );
    expect(contrastRatio('#123456', '#123456')).toBe(1);
    expect(contrastRatio('#fff', '#000')).toBe(21);
  });
});

describe('brand derivation', () => {
  it.each([undefined, null, '', 'invalid', '#1234'])(
    'defaults %j to emerald',
    (input) => {
      expect(deriveBrand(input)).toEqual(deriveBrand(DEFAULT_BRAND));
      expect(deriveBrand(input).source).toBe('#059669');
    },
  );
  it.each(['#059669', '#FFFF00', '#000000', '#fff', '#E11D48'])(
    'is deterministic for %s',
    (input) => {
      expect(deriveBrand(input)).toEqual(deriveBrand(input));
    },
  );
  it('preserves the approved fill with a dark label in both modes', () => {
    const brand = deriveBrand('#059669');
    for (const mode of ['light', 'dark'] as const) {
      expect(brand[mode].fill).toBe('#059669');
      expect(brand[mode].onFill).toBe('#0B0C0E');
    }
  });
});
