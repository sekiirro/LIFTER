import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('DB integer ranges exhaustively match the runtime Unicode password categories', () => {
  expect(() =>
    execFileSync(process.execPath, [
      'scripts/generate-password-unicode-ranges.mjs',
      '--check',
    ]),
  ).not.toThrow();
});
