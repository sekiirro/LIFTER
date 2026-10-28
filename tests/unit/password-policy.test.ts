import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

import vectors from '../fixtures/password-policy-vectors.json';
import { validatePassword } from '../../lib/auth/password-policy';

for (const { label, input, valid } of vectors) {
  it(`password policy: ${label}`, () => {
    expect(validatePassword(input).valid).toBe(valid);
  });
}

it('password policy returns bilingual messages without reflecting the input', async () => {
  const { validatePassword } = await import('../../lib/auth/password-policy');
  const result = validatePassword('short');
  expect(result.valid).toBe(false);
  expect(result.message?.en.length).toBeGreaterThan(0);
  expect(result.message?.ar).toMatch(/[\u0600-\u06ff]/);
  expect(JSON.stringify(result).includes('short')).toBe(false);
});

it('password vector source spells every whitespace and invisible input code point as a Unicode escape', () => {
  const source = readFileSync(
    'tests/fixtures/password-policy-vectors.json',
    'utf8',
  );
  const literals = [...source.matchAll(/"input"\s*:\s*"((?:\\.|[^"\\])*)"/gs)];
  const rawCodePoints = literals.flatMap((literal, vectorIndex) =>
    Array.from(literal[1]!, (character) => character).flatMap((character) =>
      /[\p{White_Space}\p{Cc}\p{Cf}\p{M}\p{Cn}\p{Co}\p{Default_Ignorable_Code_Point}]/u.test(
        character,
      )
        ? [
            `${vectorIndex}:U+${character.codePointAt(0)!.toString(16).toUpperCase()}`,
          ]
        : [],
    ),
  );
  expect(rawCodePoints).toEqual([]);
});
