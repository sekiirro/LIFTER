import { describe, expect, it } from 'vitest';
import {
  hasCapturedServerLogs,
  isReusedServerWithoutCapture,
} from '../../tests/e2e/server-log-capture-state';

describe('server log capture state', () => {
  it('distinguishes captured logs from a reused healthy server', () => {
    expect(
      hasCapturedServerLogs({ captureStarted: false, totalLines: 0 }),
    ).toBe(false);
    expect(hasCapturedServerLogs({ captureStarted: true, totalLines: 0 })).toBe(
      false,
    );
    expect(hasCapturedServerLogs({ captureStarted: true, totalLines: 1 })).toBe(
      true,
    );
    expect(
      isReusedServerWithoutCapture({ captureStarted: false, totalLines: 0 }),
    ).toBe(true);
    expect(
      isReusedServerWithoutCapture({ captureStarted: false, totalLines: 1 }),
    ).toBe(false);
    expect(
      isReusedServerWithoutCapture({ captureStarted: true, totalLines: 0 }),
    ).toBe(false);
  });
});
