import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { admin, anonClient, sql } from './harness';

const db = sql();
afterAll(() => db.end());

it('AUTH-SIGNUP-01 rejects anonymous signup without creating an Auth user', async () => {
  const email = `f11-disabled-${randomUUID()}@example.test`;
  const result = await anonClient().auth.signUp({
    email,
    password: `${randomUUID()}aA1!`,
  });
  // Clean a baseline RED success without printing any returned credentials.
  if (result.data.user)
    await admin().auth.admin.deleteUser(result.data.user.id);
  expect(result.error?.code).toBe('signup_disabled');
  expect(result.data.session === null).toBe(true);
  const [row] =
    await db`select count(*)::int from auth.users where email=${email}`;
  expect(row?.count).toBe(0);
});

it('records the two approved Auth configuration backstops', () => {
  const config = readFileSync('supabase/config.toml', 'utf8');
  expect(config).toMatch(/\[auth\][\s\S]*enable_signup = false/);
  expect(config).toMatch(/\[auth\][\s\S]*minimum_password_length = 8/);
});
