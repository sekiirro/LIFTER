import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { signupFields } from '../../lib/client-accounts/validation';
import { RESERVED_SIGNUP_ROLE_NAMES } from '../../lib/forms/signup-policy';
import {
  checkUsername,
  parseUsernameUpdateResult,
  usernameFormatIssue,
} from '../../lib/leaderboard/username';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261117000000_f24_client_leaderboard.sql',
  ),
  'utf8',
);

describe('S55-PO-9 Q14 username rule (FR-022, FR-037)', () => {
  it('accepts 3-20 English letters, digits, underscores and dots, normalized case-insensitively', () => {
    expect(checkUsername('Heba.Sami_9')).toEqual({
      ok: true,
      normalized: 'heba.sami_9',
    });
    expect(checkUsername('abc')).toEqual({ ok: true, normalized: 'abc' });
    expect(checkUsername('a'.repeat(20))).toEqual({
      ok: true,
      normalized: 'a'.repeat(20),
    });
  });

  it('classifies each rejected format with its approved message reason', () => {
    expect(checkUsername('ab')).toEqual({ ok: false, issue: 'too_short' });
    expect(checkUsername('a'.repeat(21))).toEqual({
      ok: false,
      issue: 'too_long',
    });
    for (const value of ['abc-def', 'café', 'عربي1', ' abcd', 'ab cd', 'a@bc'])
      expect(checkUsername(value)).toEqual({
        ok: false,
        issue: 'invalid_chars',
      });
    expect(checkUsername(42)).toEqual({ ok: false, issue: 'invalid_chars' });
  });

  it('blocks the Q14 reserved names case-insensitively (and keeps F15 role names)', () => {
    for (const name of [
      'admin',
      'ADMIN',
      'Support',
      'LIFTER',
      'Trainer',
      'owner',
    ])
      expect(checkUsername(name)).toEqual({ ok: false, issue: 'reserved' });
    expect(checkUsername('platform')).toEqual({ ok: false, issue: 'reserved' });
    expect(checkUsername('___')).toEqual({ ok: false, issue: 'reserved' });
    expect(checkUsername('admin2')).toEqual({ ok: true, normalized: 'admin2' });
    expect(checkUsername('acme', ['Acme'])).toEqual({
      ok: false,
      issue: 'reserved',
    });
  });

  it('applies the same rule at the F11 signup boundary', () => {
    const fields = {
      name: 'Client Example Synthetic',
      email: 'client@example.test',
      phone: '+201012345678',
      password: 'Synthetic9!Password',
      dateOfBirth: '1990-04-12',
      username: 'heba.sami',
      telegramUsername: '',
    };
    expect(signupFields(fields)?.username).toBe('heba.sami');
    for (const username of [
      'a'.repeat(21),
      'Admin',
      'SUPPORT',
      'lifter',
      'owner',
    ])
      expect(signupFields({ ...fields, username })).toBeNull();
  });

  it('reports only format issues for live form feedback', () => {
    expect(usernameFormatIssue('ab')).toBe('too_short');
    expect(usernameFormatIssue('admin')).toBeNull();
    expect(usernameFormatIssue('valid_name')).toBeNull();
  });

  it('keeps the SQL reserved list and length bound in parity with TypeScript', () => {
    const list = /'(\[[^']*"lifter"[^']*\])'::jsonb/u.exec(migration)?.[1];
    expect(list && JSON.parse(list)).toEqual([...RESERVED_SIGNUP_ROLE_NAMES]);
    expect(migration).toContain(
      `if normalized_username !~ '^[a-z0-9_.]{3,20}$' then return '{"status":"invalid"}'::jsonb; end if;`,
    );
    expect(migration).not.toContain('{3,30}');
    expect(migration).toContain(
      "if char_length(normalized) > 20 then return 'too_long'; end if;",
    );
  });

  it('maps only known RPC statuses and fails closed otherwise', () => {
    expect(parseUsernameUpdateResult({ status: 'taken' })).toBe('taken');
    expect(parseUsernameUpdateResult({ status: 'surprise' })).toBe(
      'unavailable',
    );
    expect(parseUsernameUpdateResult(null)).toBe('unavailable');
  });
});

describe('T010 database username controls (static pins for the CI mutation tests)', () => {
  it('guards username-only client updates by owner, transaction marker and format', () => {
    expect(migration).toContain(
      'or old.auth_user_id is distinct from auth.uid()',
    );
    expect(migration).toContain(
      'u.actor_user_id=auth.uid() and u.transaction_id=pg_current_xact_id()',
    );
    expect(migration).toContain(
      "if violated = 'clients_workspace_id_username_normalized_key' then",
    );
  });
});
