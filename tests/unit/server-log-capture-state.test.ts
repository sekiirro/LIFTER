import { describe, expect, it } from 'vitest';
import { hasCapturedServerLogs } from '../../tests/e2e/server-log-capture-state';

describe('server log capture state', () => {
  it('fails closed for bootstrap or reused-server summaries without real capture', () => {
    expect(
      hasCapturedServerLogs({ captureStarted: false, totalLines: 0 }),
    ).toBe(false);
    expect(hasCapturedServerLogs({ captureStarted: true, totalLines: 0 })).toBe(
      false,
    );
    expect(hasCapturedServerLogs({ captureStarted: true, totalLines: 1 })).toBe(
      true,
    );
  });
});
