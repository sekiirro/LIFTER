import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

it('runtime Unicode version equals the immutable DB migration pin', () => {
  const header = readFileSync(
    'supabase/migrations/20261031123000_signup_password_parity.sql',
    'utf8',
  ).split('\n')[0]!;
  const pinned = header.match(/Unicode (\d+\.\d+)/)?.[1];
  expect(pinned).toBeDefined();
  expect(
    process.versions.unicode,
    'runtime drift requires architect review',
  ).toBe(pinned);
});

it('DB integer ranges exhaustively match the runtime Unicode password categories', () => {
  expect(() =>
    execFileSync(process.execPath, [
      'scripts/generate-password-unicode-ranges.mjs',
      '--check',
    ]),
  ).not.toThrow();
});
