import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('tests/e2e/forms-authorized-route.spec.ts', 'utf8');

describe('S34 T03/N07 rendered evidence contract', () => {
  it('captures only the required states at each locale/theme/viewport tuple', () => {
    expect(source).toContain("join(tmpdir(), 'lifter-s34-f15-r2')");
    expect(source).toContain('[390, 1024, 1440] as const');
    expect(source).toContain("['T03', 'N07-meal-count', 'N07-timing']");
    expect(source).toContain('expect(screenshotPaths).toHaveLength(24)');
    expect(source).toContain('# S34 F15 T03/N07 rendered evidence');
  });
});
