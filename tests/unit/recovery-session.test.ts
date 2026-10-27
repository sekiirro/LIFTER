import { describe, expect, it } from 'vitest';
import {
  isRecoverySession,
  RECOVERY_SESSION_MAX_AGE_SECONDS,
} from '../../lib/auth/recovery-session';

describe('isRecoverySession', () => {
  it('uses the 900-second technical default', () => {
    expect(RECOVERY_SESSION_MAX_AGE_SECONDS).toBe(900);
  });
  it.each(['otp', 'recovery'])(
    'enforces age and clock-skew boundaries for %s',
    (method) => {
      const amr = [{ method, timestamp: 1000 }];
      expect(isRecoverySession(amr, 1900)).toBe(true);
      expect(isRecoverySession(amr, 1901)).toBe(false);
      expect(isRecoverySession(amr, 940)).toBe(true);
      expect(isRecoverySession(amr, 939)).toBe(false);
    },
  );
  it.each([NaN, Infinity, -1, 1.5])('rejects a malformed clock %#', (now) => {
    expect(isRecoverySession([{ method: 'otp', timestamp: 100 }], now)).toBe(
      false,
    );
  });
  it('rejects tied latest timestamps even for the same accepted method', () => {
    expect(
      isRecoverySession(
        [
          { method: 'otp', timestamp: 200 },
          { method: 'otp', timestamp: 200 },
        ],
        200,
      ),
    ).toBe(false);
  });
  it.each(['otp', 'recovery'])(
    'accepts recent %s as the latest method',
    (method) => {
      expect(
        isRecoverySession(
          [
            { method: 'password', timestamp: 100 },
            { method, timestamp: 200 },
          ],
          200,
        ),
      ).toBe(true);
    },
  );
  it('uses the highest timestamp rather than array order', () => {
    expect(
      isRecoverySession(
        [
          { method: 'recovery', timestamp: 200 },
          { method: 'password', timestamp: 100 },
        ],
        200,
      ),
    ).toBe(true);
  });
  it('rejects a password session', () => {
    expect(
      isRecoverySession([{ method: 'password', timestamp: 200 }], 200),
    ).toBe(false);
  });
  it.each(['password'])('rejects recovery older than a later %s', (method) => {
    expect(
      isRecoverySession(
        [
          { method, timestamp: 200 },
          { method: 'recovery', timestamp: 100 },
        ],
        200,
      ),
    ).toBe(false);
  });
  it.each([
    undefined,
    null,
    {},
    [],
    'recovery',
    ['recovery'],
    [null],
    [{ method: 'recovery' }],
    [{ timestamp: 100 }],
    [{ method: 'recovery', timestamp: '100' }],
    [{ method: 'recovery', timestamp: NaN }],
    [{ method: 'recovery', timestamp: Infinity }],
    [{ method: 'recovery', timestamp: -1 }],
    [{ method: 'recovery', timestamp: 1.5 }],
    [{ method: 'recovery', timestamp: 200 }, {}],
  ])('rejects missing or malformed claims %#', (amr) => {
    expect(isRecoverySession(amr, 200)).toBe(false);
  });
  it.each([
    [
      { method: 'password', timestamp: 100 },
      { method: 'recovery', timestamp: 100 },
    ],
    [
      { method: 'recovery', timestamp: 100 },
      { method: 'password', timestamp: 100 },
    ],
  ])('rejects ambiguous latest methods %#', (...amr) => {
    expect(isRecoverySession(amr, 200)).toBe(false);
  });
});
