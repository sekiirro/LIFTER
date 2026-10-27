import { expect, it, vi } from 'vitest';
import { teardownRestoreStack } from '../../scripts/backup/lib/restore.mjs';

it('stops without backup and then removes the temp workdir on the failure cleanup path', async () => {
  const calls: string[] = [];
  const stop = vi.fn(async () => {
    calls.push('stop');
  });
  const remove = vi.fn(async () => {
    calls.push('remove');
  });
  await teardownRestoreStack('C:\\temp with spaces\\restore', false, {
    stop,
    remove,
  });
  expect(stop).toHaveBeenCalledWith([
    'stop',
    '--no-backup',
    '--workdir',
    'C:\\temp with spaces\\restore',
  ]);
  expect(remove).toHaveBeenCalledWith('C:\\temp with spaces\\restore', {
    recursive: true,
    force: true,
  });
  expect(calls).toEqual(['stop', 'remove']);
});

it('leaves containers, volumes and workdir when keep-stack is requested', async () => {
  const stop = vi.fn();
  const remove = vi.fn();
  await teardownRestoreStack('temp', true, { stop, remove });
  expect(stop).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

it('preserves the workdir for a retry when stop fails', async () => {
  const stop = vi.fn(async () => {
    throw new Error('docker unavailable');
  });
  const remove = vi.fn();
  await expect(
    teardownRestoreStack('temp', false, { stop, remove }),
  ).rejects.toThrow('docker unavailable');
  expect(remove).not.toHaveBeenCalled();
});
