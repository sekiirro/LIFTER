import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { isMain } from '../../scripts/free-tier/lib/cli.mjs';

vi.mock('node:fs', () => ({ realpathSync: vi.fn() }));
const originalArgv = process.argv;
afterEach(() => {
  process.argv = originalArgv;
  vi.resetAllMocks();
});

it('compares the resolved entry point for junction or symlink invocations', () => {
  const target = join(process.cwd(), 'scripts', 'free-tier', 'parse-tail.mjs');
  process.argv = [process.execPath, 'linked-entry.mjs'];
  vi.mocked(realpathSync).mockReturnValue(target);
  expect(isMain(pathToFileURL(target).href)).toBe(true);
  expect(realpathSync).toHaveBeenCalledWith('linked-entry.mjs');
  expect(isMain(pathToFileURL(join(process.cwd(), 'other.mjs')).href)).toBe(
    false,
  );
});

it('returns false for absent or unresolvable entry points', () => {
  process.argv = [process.execPath];
  expect(isMain(import.meta.url)).toBe(false);
  expect(realpathSync).not.toHaveBeenCalled();
  process.argv = [process.execPath, 'missing-entry.mjs'];
  vi.mocked(realpathSync).mockImplementation(() => {
    throw new Error('unavailable');
  });
  expect(isMain(import.meta.url)).toBe(false);
});
