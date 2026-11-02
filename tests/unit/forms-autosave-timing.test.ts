import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  nextAutosaveRetryDelay,
  scheduleDraftAutosave,
  withAutosaveTimeout,
} from '../../lib/forms/autosave-timing';
import { createAuthorizedFormsClientAdapter } from '../../lib/forms/authorized-client-adapter';

describe('client draft autosave timing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('debounces until 1,500 ms after the latest edit', () => {
    const save = vi.fn();
    const cancelFirst = scheduleDraftAutosave(save, 0, 0);
    vi.advanceTimersByTime(1_000);
    cancelFirst();
    const cancelLatest = scheduleDraftAutosave(save, 0, 1_000);
    vi.advanceTimersByTime(1_499);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    cancelLatest();
  });

  it('forces a save at ten seconds from the first unsaved edit despite later debounce resets', () => {
    const save = vi.fn();
    let cancel = scheduleDraftAutosave(save, 0, 0);
    for (let elapsed = 1_000; elapsed <= 9_000; elapsed += 1_000) {
      vi.advanceTimersByTime(1_000);
      cancel();
      cancel = scheduleDraftAutosave(save, 0, elapsed);
    }
    vi.advanceTimersByTime(999);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    cancel();
  });

  it('uses the 2/4/8 second retry schedule, then 30 seconds', () => {
    expect([1, 2, 3, 4, 8].map(nextAutosaveRetryDelay)).toEqual([
      2_000, 4_000, 8_000, 30_000, 30_000,
    ]);
  });

  it('times out a save request after ten seconds', async () => {
    const pending = withAutosaveTimeout(new Promise<never>(() => undefined));
    const assertion = expect(pending).rejects.toThrow('autosave_timeout');
    await vi.advanceTimersByTimeAsync(9_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  it('reuses the supplied intent key for a retried route save', async () => {
    const keys: string[] = [];
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls += 1;
        keys.push(JSON.parse(String(init.body)).intent_key);
        return new Response(
          JSON.stringify(
            calls === 1
              ? { status: 'error' }
              : { status: 'saved', revision: 2 },
          ),
          {
            status: calls === 1 ? 503 : 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }),
    );
    const adapter = createAuthorizedFormsClientAdapter();
    const request = {
      assignmentId: 'assignment',
      expectedRevision: 1,
      answers: { goal: 'build strength' },
      intentKey: '8ef56ab7-5f4a-42cf-98e8-2b0ea0a00123',
    };
    expect(await adapter.saveDraft(request)).toEqual({ status: 'retryable' });
    expect(await adapter.saveDraft(request)).toEqual({
      status: 'saved',
      revision: 2,
    });
    expect(keys).toEqual([request.intentKey, request.intentKey]);
  });
});
