import { expect, it } from 'vitest';

const cases = [
  ['seven code points', 'abcde1!', false],
  ['eight code points', 'abcdef1!', true],
  ['seven multibyte code points', 'ééééé1!', false],
  ['eight multibyte code points', 'éééééé1!', true],
  ['astral code points', '😀😀😀😀😀😀1a', true],
  ['72 bytes', 'é'.repeat(35) + '1!', true],
  ['73 bytes', 'é'.repeat(35) + 'a1!', false],
  ['NUL', 'abcdef1!\0', false],
  ['missing digit', 'abcdefgh!', false],
  ['missing symbol', 'abcdefg1', false],
  ['whitespace is no symbol', 'abcdef1 ', false],
  ['control is no symbol', 'abcdef1\u0007', false],
  ['format is no symbol', 'abcdef1\u200b', false],
  ['Unicode digit and symbol', 'abcdef١€', true],
  ['printable combining mark is a symbol', 'abcdef1\u0301', true],
  ['printable non-digit number is a symbol', 'abcdef1\u2163', true],
  ['no normalization', 'e\u0301abcd1!', true],
] as const;

for (const [label, input, valid] of cases) {
  it(`password policy: ${label}`, async () => {
    const { validatePassword } = await import('../../lib/auth/password-policy');
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
