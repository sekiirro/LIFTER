import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('T021 admission builders have a server-only boundary and no logging', () => {
  const path = 'lib/client-accounts/admission.ts';
  expect(existsSync(path), 'server-only admission builder exists').toBe(true);
  const body = readFileSync(path, 'utf8');
  expect(body.startsWith("import 'server-only';")).toBe(true);
  expect(
    /console\.|NEXT_PUBLIC_|export\s+(const|function)\s+.*[Kk]ey/.test(body),
  ).toBe(false);
  const pure = readFileSync('lib/client-accounts/trusted-ip.ts', 'utf8');
  expect(/process\.|node:|console\./.test(pure)).toBe(false);
});
