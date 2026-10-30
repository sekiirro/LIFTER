import { describe, expect, it } from 'vitest';
import { contrastRatio, deriveBrand } from '../../lib/design/color';
import { modes } from '../../lib/design/tokens';

describe('workspace brand contrast matrix', () => {
  for (const color of ['#FFFF00', '#111111', '#2563EB', '#FF00FF'] as const) {
    it(`${color} keeps brand text, controls, and focus within light/dark contrast requirements`, () => {
      const brand = deriveBrand(color);
      for (const mode of ['light', 'dark'] as const) {
        const treatment = brand[mode];
        expect(
          contrastRatio(treatment.text, modes[mode].bg),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(treatment.text, modes[mode].card),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(treatment.fill, treatment.onFill),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(treatment.fillHover, treatment.onFill),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(treatment.ring, modes[mode].bg),
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrastRatio(treatment.ring, modes[mode].card),
        ).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
