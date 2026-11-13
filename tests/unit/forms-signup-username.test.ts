import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import {
  isValidSignupUsername,
  normalizeSignupUsername,
} from '../../lib/forms/signup-policy';
import { signupFields } from '../../lib/client-accounts/validation';

it('T080 applies S32-PO-7 to the NFKC-lowercase username without trimming', () => {
  expect(isValidSignupUsername('Ａbc_12.')).toBe(true);
  expect(normalizeSignupUsername('Ａbc_12.')).toBe('abc_12.');
  for (const value of [
    ' abcd',
    'abcd ',
    'abc\u200Bdef',
    'ab',
    'a'.repeat(31),
    'abc-def',
    'عربي',
  ]) {
    expect(isValidSignupUsername(value)).toBe(false);
  }
  expect(isValidSignupUsername('a'.repeat(30))).toBe(true);
});

it('T080 rejects malformed usernames through the signup field boundary', () => {
  const fields = {
    name: 'Client Example Synthetic',
    email: 'client@example.test',
    phone: '+201012345678',
    password: 'Synthetic9!Password',
    dateOfBirth: '1990-04-12',
    username: 'Client.123',
    telegramUsername: '',
  };
  expect(signupFields(fields)?.username).toBe('client.123');
  for (const username of [' Client.123', 'Client.123 ', 'Client\u200B123']) {
    expect(signupFields({ ...fields, username })).toBeNull();
  }
});

it('T080 pins the SQL RPC normalization and allow-list against a synthetic mutation', () => {
  const migration = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20261112025900_f15_signup_username_character_policy.sql',
    ),
    'utf8',
  );
  const hasUsernamePolicy = (sql: string) =>
    sql.includes(
      "normalized_username:=lower(normalize(fields->>'username',NFKC));",
    ) && sql.includes("if normalized_username !~ '^[a-z0-9_.]{3,30}$' then");
  expect(hasUsernamePolicy(migration)).toBe(true);
  const permissiveMutation = migration.replace(
    "if normalized_username !~ '^[a-z0-9_.]{3,30}$' then",
    "if normalized_username !~ '^.*$' then",
  );
  expect(permissiveMutation).not.toBe(migration);
  expect(hasUsernamePolicy(permissiveMutation)).toBe(false);
});
