import { beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  publicClient: vi.fn(),
  buildAdmission: vi.fn(),
  signupRpc: vi.fn(),
  headers: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: m.headers, cookies: m.cookies }));
vi.mock('../../lib/supabase/public-session', () => ({
  createPublicSessionClient: m.publicClient,
}));
vi.mock('../../lib/client-accounts/admission', () => ({
  buildAdmission: m.buildAdmission,
}));
vi.mock('@supabase/supabase-js', async () => {
  const actual = await vi.importActual<typeof import('@supabase/supabase-js')>(
    '@supabase/supabase-js',
  );
  return {
    ...actual,
    createClient: vi.fn(() => ({ rpc: m.signupRpc })),
  };
});

import { AuthSessionMissingError } from '@supabase/supabase-js';
import { submitClientSignup } from '../../app/register/[token]/actions';
import { signupResult } from '../../lib/client-accounts/results';

const token = 'A'.repeat(43);
const requestSecret = 'B'.repeat(43);

function signupForm() {
  const form = new FormData();
  form.set('request_secret', requestSecret);
  form.set('name', 'Example Middle Person');
  form.set('dateOfBirth', '1990-04-12');
  form.set('username', 'example_client');
  form.set('telegramUsername', '');
  form.set('email', 'client@example.test');
  form.set(
    'phone',
    JSON.stringify({ country: 'EG', nationalNumber: '01012345678' }),
  );
  form.set('password', 'Complex!2345');
  return form;
}

function setSessionLookup(
  getUser: () => Promise<{
    data: { user: { id: string } | null };
    error: unknown;
  }>,
) {
  m.publicClient.mockResolvedValue({ auth: { getUser } });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('APP_ORIGIN', 'https://signup.example.test');
  vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'unit-test-anon-key');
  vi.stubEnv('NODE_ENV', 'test');
  m.headers.mockResolvedValue({
    get: (name: string) =>
      name === 'origin'
        ? 'https://signup.example.test'
        : name === 'CF-Connecting-IP'
          ? '192.0.2.1'
          : null,
  });
  m.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
  m.buildAdmission.mockResolvedValue({
    ipKey: 'a'.repeat(64),
    linkKey: 'b'.repeat(64),
    issuedAt: Date.now(),
    nonce: '00000000-0000-4000-8000-000000000001',
    attestation: 'c'.repeat(64),
  });
  m.signupRpc
    .mockResolvedValueOnce({
      data: {
        status: 'admitted',
        admission_ticket: '00000000-0000-4000-8000-000000000002',
      },
      error: null,
    })
    .mockResolvedValueOnce({ data: { status: 'complete' }, error: null });
});

it('fails closed on a non-session getUser error before admission and RPC', async () => {
  setSessionLookup(async () => ({
    data: { user: null },
    error: new Error('temporary auth service failure'),
  }));

  const result = await submitClientSignup(
    token,
    signupResult('invalid_input', 'en'),
    signupForm(),
  );

  expect(result).toEqual(signupResult('unavailable', 'en'));
  expect(m.buildAdmission).not.toHaveBeenCalled();
  expect(m.signupRpc).not.toHaveBeenCalled();
});

it('fails closed when getUser throws before admission and RPC', async () => {
  setSessionLookup(async () => {
    throw new Error('temporary auth service failure');
  });

  const result = await submitClientSignup(
    token,
    signupResult('invalid_input', 'en'),
    signupForm(),
  );

  expect(result).toEqual(signupResult('unavailable', 'en'));
  expect(m.buildAdmission).not.toHaveBeenCalled();
  expect(m.signupRpc).not.toHaveBeenCalled();
});

it('treats the public AuthSessionMissingError as anonymous and continues signup', async () => {
  setSessionLookup(async () => ({
    data: { user: null },
    error: new AuthSessionMissingError(),
  }));

  const result = await submitClientSignup(
    token,
    signupResult('invalid_input', 'en'),
    signupForm(),
  );

  expect(result).toEqual(signupResult('complete', 'en'));
  expect(m.buildAdmission).toHaveBeenCalledOnce();
  expect(m.signupRpc).toHaveBeenCalledTimes(2);
});

it('keeps the signed-in visitor outcome and stops before admission', async () => {
  setSessionLookup(async () => ({
    data: { user: { id: 'user-1' } },
    error: null,
  }));

  const result = await submitClientSignup(
    token,
    signupResult('invalid_input', 'en'),
    signupForm(),
  );

  expect(result).toEqual(signupResult('sign_out_required', 'en'));
  expect(m.buildAdmission).not.toHaveBeenCalled();
  expect(m.signupRpc).not.toHaveBeenCalled();
});

it('fails closed when the public session client is unavailable', async () => {
  m.publicClient.mockResolvedValue(null);

  const result = await submitClientSignup(
    token,
    signupResult('invalid_input', 'en'),
    signupForm(),
  );

  expect(result).toEqual(signupResult('unavailable', 'en'));
  expect(m.buildAdmission).not.toHaveBeenCalled();
  expect(m.signupRpc).not.toHaveBeenCalled();
});
