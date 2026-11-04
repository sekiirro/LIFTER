import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_APP_PORTS,
  FORBIDDEN_APP_RANGES,
  HOSTED_APP_PORT,
  SELF_HOSTED_APP_PORT,
  isForbiddenAppPort,
  selectAppPort,
} from '../../scripts/ci-app-port.mjs';

describe('CI app port selection', () => {
  it('keeps the hosted origin on 3000 and selects an isolated self-hosted port', () => {
    expect(selectAppPort(false)).toBe(HOSTED_APP_PORT);
    expect(HOSTED_APP_PORT).toBe(3000);
    expect(selectAppPort(true)).toBe(SELF_HOSTED_APP_PORT);
    expect(SELF_HOSTED_APP_PORT).toBe(3990);
    expect(isForbiddenAppPort(SELF_HOSTED_APP_PORT)).toBe(false);
  });

  it('marks lane, Windows, and configured Stack A-D ports as forbidden', () => {
    for (const port of FORBIDDEN_APP_PORTS)
      expect(isForbiddenAppPort(port)).toBe(true);
    for (const [start, end] of FORBIDDEN_APP_RANGES) {
      for (let port = start; port <= end; port += 1)
        expect(isForbiddenAppPort(port)).toBe(true);
    }
    expect(FORBIDDEN_APP_RANGES).toContainEqual([25420, 25429]);
    expect(FORBIDDEN_APP_RANGES).toContainEqual([35420, 35429]);
    expect(FORBIDDEN_APP_RANGES).toContainEqual([45420, 45429]);
  });
});
