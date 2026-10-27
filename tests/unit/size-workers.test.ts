import { afterEach, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { main } from '../../scripts/size-report.mjs';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}));
vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn(async () => 'mock-size-directory'),
  readdir: vi.fn(async () => [
    { name: 'worker.js', isDirectory: () => false, isFile: () => true },
  ]),
  readFile: vi.fn(async () => Buffer.alloc(1024)),
  rm: vi.fn(async () => {}),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  process.exitCode = 0;
});

it('dry-runs both Workers and fails if either exceeds the shared limit', async () => {
  vi.stubEnv('WORKER_SIZE_LIMIT_KIB', '1');
  vi.mocked(readFile)
    .mockResolvedValueOnce(Buffer.alloc(2048))
    .mockResolvedValueOnce(Buffer.alloc(512));
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await main();
  expect(spawnSync).toHaveBeenCalledTimes(2);
  const calls = vi.mocked(spawnSync).mock.calls;
  expect(calls[0]?.[1]).toContain('--dry-run');
  expect(calls[1]?.[1]).toEqual(
    expect.arrayContaining([
      '--dry-run',
      '--config',
      'workers/cron/wrangler.jsonc',
    ]),
  );
  expect(calls[0]?.[1]).toContain(join('mock-size-directory', 'web'));
  expect(calls[1]?.[1]).toContain(join('mock-size-directory', 'cron'));
  expect(log.mock.calls[0]?.[0]).toContain('200.00%');
  expect(log.mock.calls[1]?.[0]).toContain('50.00%');
  expect(process.exitCode).toBe(1);
  expect(rm).toHaveBeenCalledWith('mock-size-directory', {
    recursive: true,
    force: true,
  });
});

it('passes when both bundles are within the limit', async () => {
  vi.stubEnv('WORKER_SIZE_LIMIT_KIB', '1');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await main();
  expect(process.exitCode).toBe(0);
});
