import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { scheduleDraftAutosave } from '../../lib/forms/autosave-timing';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('saves once when the debounce timer fires before the max-unsaved timer', () => {
  const save = vi.fn();
  scheduleDraftAutosave(save, 0, 0);
  vi.advanceTimersByTime(1_500);
  expect(save).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(10_000);
  expect(save).toHaveBeenCalledTimes(1);
});

it('saves once when the max-unsaved timer fires before the debounce timer', () => {
  const save = vi.fn();
  scheduleDraftAutosave(save, -9_000, 0);
  vi.advanceTimersByTime(1_000);
  expect(save).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(10_000);
  expect(save).toHaveBeenCalledTimes(1);
});

it('cancels both pending saves when the returned cancel function is called', () => {
  const save = vi.fn();
  const cancel = scheduleDraftAutosave(save, 0, 0);
  cancel();
  vi.advanceTimersByTime(10_000);
  expect(save).not.toHaveBeenCalled();
});
