import { describe, expect, it } from 'vitest';
import {
  buildStaffResetRedirectTo,
  isEligibleStaffRole,
  isSyntacticallyValidStaffResetEmail,
} from '../../lib/auth/staff-reset';

describe('staff self-service reset eligibility', () => {
  it.each(['platform_owner', 'workspace_owner', 'trainer', 'sales'] as const)(
    'allows the approved %s staff role',
    (role) => {
      expect(isEligibleStaffRole(role)).toBe(true);
    },
  );

  it.each([null, 'client', 'unknown'] as const)(
    'does not treat %s as an eligible staff role',
    (role) => {
      expect(isEligibleStaffRole(role)).toBe(false);
    },
  );
});

describe('staff self-service reset email input', () => {
  it.each(['staff@example.test', ' staff@example.test '])(
    'accepts a syntactically valid address: %s',
    (email) => {
      expect(isSyntacticallyValidStaffResetEmail(email)).toBe(true);
    },
  );

  it.each([
    '',
    'not-an-email',
    'staff@',
    '@example.test',
    'a'.repeat(250) + '@x.test',
  ])('rejects a malformed or overlong address: %s', (email) => {
    expect(isSyntacticallyValidStaffResetEmail(email)).toBe(false);
  });
});

describe('staff self-service reset redirect', () => {
  it('builds the recovery URL from the configured app origin only', () => {
    expect(
      buildStaffResetRedirectTo('https://app.example.test', {
        next: 'https://attacker.example',
        query: 'token_hash=attacker',
        headers: { origin: 'https://attacker.example' },
      }),
    ).toBe('https://app.example.test/auth/recovery');
  });

  it.each(['http://app.example.test', 'file:///tmp/app', 'not a URL'])(
    'refuses an unsafe configured origin: %s',
    (origin) => {
      expect(() => buildStaffResetRedirectTo(origin)).toThrow();
    },
  );
});
