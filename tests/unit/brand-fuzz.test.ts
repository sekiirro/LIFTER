import { describe, expect, it } from 'vitest';
import { contrastRatio, deriveBrand, type Hex } from '../../lib/design/color';
import { modes } from '../../lib/design/tokens';

function seededColors(seed: number, count: number): Hex[] {
  let state = seed >>> 0;
  return Array.from({ length: count }, (): Hex => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return `#${(state >>> 8).toString(16).padStart(6, '0').toUpperCase()}`;
  });
}

describe('seeded brand fuzzing', () => {
  it.each(seededColors(0x4c494654, 500))(
    'derives contrast-safe variants without throwing for %s',
    (input) => {
      expect(() => deriveBrand(input)).not.toThrow();
      const variants = deriveBrand(input);
      for (const mode of ['light', 'dark'] as const) {
        const brand = variants[mode];
        const surface = modes[mode];
        expect(contrastRatio(brand.fill, brand.onFill)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(
          contrastRatio(brand.fillHover, brand.onFill),
        ).toBeGreaterThanOrEqual(4.5);
        expect(brand.fillHover).not.toBe(brand.fill);
        expect(contrastRatio(brand.text, surface.bg)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrastRatio(brand.text, surface.card)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrastRatio(brand.ring, surface.bg)).toBeGreaterThanOrEqual(3);
      }
    },
  );
});
