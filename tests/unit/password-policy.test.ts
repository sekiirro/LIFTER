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
