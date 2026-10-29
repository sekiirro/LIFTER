import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../integration/client-accounts-fixture', () => ({}));
import { proof } from '../integration/client-accounts-admission-fixture';

afterEach(() => vi.unstubAllEnvs());

it.each(['SIGNUP_RATE_KEY', 'SIGNUP_ATTEST_KEY'])(
  'explains missing %s without exposing the other key',
  (missing) => {
    vi.stubEnv('SIGNUP_RATE_KEY', 'ab'.repeat(32));
    vi.stubEnv('SIGNUP_ATTEST_KEY', 'cd'.repeat(32));
    vi.stubEnv(missing, undefined);
    expect(() => proof('synthetic token')).toThrow(
      /^SIGNUP_\* env missing; run provisioning$/,
    );
  },
);
