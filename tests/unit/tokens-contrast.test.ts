import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  DEFAULT_BRAND,
  deriveBrand,
  parseHex,
} from '../../lib/design/color';
import { modes } from '../../lib/design/tokens';

describe.each(['light', 'dark'] as const)('%s contrast', (mode) => {
  const tokens = modes[mode];
  it('keeps body and muted text readable on both surfaces', () => {
    for (const fg of [tokens.text, tokens.textMuted]) {
      for (const bg of [tokens.bg, tokens.card])
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      contrastRatio(tokens.borderStrong, tokens.card),
    ).toBeGreaterThanOrEqual(3);
  });
  it.each(['success', 'warning', 'error', 'info'] as const)(
    'keeps %s text readable',
    (tone) => {
      expect(
        contrastRatio(tokens[tone].fg, tokens[tone].bg),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(tokens[tone].fg, tokens.card),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
  it.each([
    DEFAULT_BRAND,
    '#059669',
    '#FFFF00',
    '#FFFFFF',
    '#000000',
    '#E11D48',
    '#2563EB',
    '#7C3AED',
    '#F59E0B',
    '#14B8A6',
  ])('derives accessible variants for %s', (input) => {
    const brand = deriveBrand(input)[mode];
    for (const hex of Object.values(brand)) expect(parseHex(hex)).toBe(hex);
    expect(contrastRatio(brand.fill, brand.onFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(brand.fillHover, brand.onFill)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(brand.fillHover).not.toBe(brand.fill);
    expect(contrastRatio(brand.text, tokens.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(brand.text, tokens.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(brand.ring, tokens.bg)).toBeGreaterThanOrEqual(3);
    expect(['#FFFFFF', '#0B0C0E']).toContain(brand.onFill);
    // One of the two labels always passes for the raw sRGB sample: no fill change needed.
    expect(brand.fill).toBe(parseHex(input));
  });
});
