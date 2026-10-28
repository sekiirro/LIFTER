import { describe, expect, it } from 'vitest';

import { storageReadinessDisposition } from '../e2e/storage-readiness';

describe('local Storage readiness', () => {
  it('runs the Storage assertions when the API responds', () => {
    expect(storageReadinessDisposition(200)).toBe('ready');
    expect(storageReadinessDisposition(401)).toBe('ready');
    expect(
      storageReadinessDisposition(400, 0, false, 'Invalid Compact JWS'),
    ).toBe('ready');
    expect(
      storageReadinessDisposition(400, 0, false, 'Unexpected response'),
    ).toBe('retry');
  });

  it('skips only after the excluded-upstream response is stable', () => {
    expect(storageReadinessDisposition(503, 1)).toBe('retry');
    expect(storageReadinessDisposition(503, 2)).toBe('retry');
    expect(storageReadinessDisposition(503, 3)).toBe('excluded');
  });

  it('never skips when the isolated runner requires Storage to be available', () => {
    expect(storageReadinessDisposition(503, 3, true)).toBe('retry');
  });

  it('retries transient and unreachable gateway responses', () => {
    expect(storageReadinessDisposition(null)).toBe('retry');
    expect(storageReadinessDisposition(500)).toBe('retry');
    expect(storageReadinessDisposition(502)).toBe('retry');
  });
});
