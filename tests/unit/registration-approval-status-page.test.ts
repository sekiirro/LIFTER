import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStatusPoller,
  performApprovedStatusRedirect,
  type ClientStatusResult,
} from '../../components/registration-approval/status-polling';

type Listener = () => void;
function runtime() {
  let visible = true;
  let online = true;
  const listeners = new Set<Listener>();
  return {
    visible: () => visible,
    online: () => online,
    listen: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setVisible(value: boolean) {
      visible = value;
      listeners.forEach((listener) => listener());
    },
    setOnline(value: boolean) {
      online = value;
      listeners.forEach((listener) => listener());
    },
    focus() {
      listeners.forEach((listener) => listener());
    },
    setTimeout: (callback: () => void, delay: number) =>
      globalThis.setTimeout(callback, delay),
    clearTimeout: (timer: unknown) =>
      globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
  };
}

const pending = { status: 'ok', approval_state: 'pending-approval' } as const;

describe('client registration status refresh', () => {
  afterEach(() => vi.useRealTimers());

  it('waits at least 15 seconds before the first automatic request', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue(pending);
    const poller = createStatusPoller({ runtime: runtime(), load });
    poller.start();

    await vi.advanceTimersByTimeAsync(14_999);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('pauses while hidden or offline and resumes after a full interval without an immediate request', async () => {
    vi.useFakeTimers();
    const env = runtime();
    const load = vi.fn().mockResolvedValue(pending);
    const poller = createStatusPoller({ runtime: env, load });
    poller.start();
    env.setVisible(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(load).not.toHaveBeenCalled();
    env.setVisible(true);
    env.setOnline(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(load).not.toHaveBeenCalled();
    env.setOnline(true);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('does not make focus trigger an immediate request or reset the current interval', async () => {
    vi.useFakeTimers();
    const env = runtime();
    const load = vi.fn().mockResolvedValue(pending);
    const poller = createStatusPoller({ runtime: env, load });
    poller.start();
    await vi.advanceTimersByTimeAsync(5_000);
    env.focus();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledOnce();
    poller.stop();
  });

  it('keeps one request in flight across automatic and manual refresh', async () => {
    vi.useFakeTimers();
    let resolve!: (value: typeof pending) => void;
    const load = vi.fn(
      () =>
        new Promise<typeof pending>((done) => {
          resolve = done;
        }),
    );
    const poller = createStatusPoller({ runtime: runtime(), load });
    poller.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(load).toHaveBeenCalledTimes(1);
    await expect(poller.refresh()).resolves.toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
    resolve(pending);
    await Promise.resolve();
    poller.stop();
  });

  it('counts failed automatic attempts toward the 12-attempt budget while keeping manual refresh available', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue({ status: 'unavailable' });
    const poller = createStatusPoller({ runtime: runtime(), load });
    poller.start();
    for (let attempt = 0; attempt < 12; attempt += 1)
      await vi.advanceTimersByTimeAsync(15_000);
    expect(load).toHaveBeenCalledTimes(12);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(12);
    await expect(poller.refresh()).resolves.toBe(true);
    expect(load).toHaveBeenCalledTimes(13);
    poller.stop();
  });

  it('resumes bounded automatic polling when an unavailable initial state refreshes to pending', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue(pending);
    const poller = createStatusPoller({
      runtime: runtime(),
      load,
      initialState: 'unavailable',
    });
    poller.start();
    await expect(poller.refresh()).resolves.toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(poller.attempts).toBe(1);
    poller.stop();
  });

  it.each(['approved', 'rejected'] as const)(
    'stops automatic checks on %s',
    async (approval_state) => {
      vi.useFakeTimers();
      const load = vi
        .fn()
        .mockResolvedValueOnce({ status: 'ok', approval_state });
      const poller = createStatusPoller({ runtime: runtime(), load });
      poller.start();
      await vi.advanceTimersByTimeAsync(15_000);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(load).toHaveBeenCalledTimes(1);
      poller.stop();
    },
  );

  it('redirects once after the live pending-to-approved transition without another sign-in', async () => {
    vi.useFakeTimers();
    const load = vi
      .fn()
      .mockResolvedValueOnce({ status: 'ok', approval_state: 'approved' });
    const navigate = vi.fn();
    let current: ClientStatusResult = pending;
    const poller = createStatusPoller({
      runtime: runtime(),
      load,
      onResult: async (result) => {
        if (
          current.status === 'ok' &&
          current.approval_state === 'pending-approval' &&
          result.status === 'ok' &&
          result.approval_state === 'approved'
        ) {
          await performApprovedStatusRedirect({
            preflight: async () => ({ status: 'ok', destination: '/' }),
            navigate,
          });
        }
        if (result.status === 'ok') current = result;
      },
    });
    poller.start();
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/');
    poller.stop();
  });
});
