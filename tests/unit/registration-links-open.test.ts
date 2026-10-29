import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ create: vi.fn(), rpc: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.create }));
import {
  openRegistrationLink,
  parseOpenResult,
} from '../../lib/registration-links/open';
let logs: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  mocks.create.mockImplementation(() => ({ rpc: mocks.rpc }));
  logs = (['log', 'info', 'error', 'warn', 'debug', 'trace'] as const).map(
    (key) => vi.spyOn(console, key).mockImplementation(() => {}),
  );
});
afterEach(() => {
  for (const log of logs) expect(log).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
it.each([
  null,
  {},
  [],
  { status: 'expired' },
  { status: 'valid', workspace_name: 'A', price: '1' },
  { status: 'valid', workspace_name: '' },
  { status: 'invalid', reason: 'consumed' },
])('generic invalid payload %#', (v) =>
  expect(parseOpenResult(v)).toEqual({ status: 'invalid' }),
);
it('accepts only the exact valid payload', () => {
  expect(parseOpenResult({ status: 'valid', workspace_name: 'A' })).toEqual({
    status: 'valid',
    workspace_name: 'A',
  });
  expect(parseOpenResult({ status: 'invalid' })).toEqual({ status: 'invalid' });
});
it('accepts only a canonical optional branding handle without widening the payload allowlist', () => {
  const render_handle = 'A'.repeat(43);
  const value = { status: 'valid', workspace_name: 'A', render_handle };
  expect(parseOpenResult(value)).toEqual(value);
  expect(parseOpenResult({ ...value, render_handle: 'bad' })).toEqual({
    status: 'invalid',
  });
  expect(parseOpenResult({ ...value, history: 'forged' })).toEqual({
    status: 'invalid',
  });
});
it('valid name only allowlist and no actor/service dependency', async () => {
  vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'sentinel-service-key');
  mocks.rpc.mockResolvedValue({
    data: { status: 'valid', workspace_name: 'A' },
    error: null,
  });
  const token = 'A'.repeat(43);
  expect(await openRegistrationLink(token)).toEqual({
    status: 'valid',
    workspace_name: 'A',
  });
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
    'http://localhost:54321',
    'test-anon',
    expect.objectContaining({
      auth: expect.objectContaining({
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      }),
    }),
  );
  expect(JSON.stringify(mocks.create.mock.calls)).not.toContain(
    'sentinel-service-key',
  );
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('registration_link_open', {
    token,
  });
  mocks.rpc.mockRejectedValue(new Error('private'));
  expect(await openRegistrationLink(token)).toEqual({
    status: 'invalid',
  });
});
it('forces no-store on the public RPC transport', async () => {
  vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon');
  const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchSpy);
  mocks.rpc.mockResolvedValue({
    data: { status: 'valid', workspace_name: 'A' },
    error: null,
  });
  await openRegistrationLink('A'.repeat(43));
  const options = mocks.create.mock.calls[0]![2] as {
    global: { fetch: (input: string, init: RequestInit) => Promise<unknown> };
  };
  await options.global.fetch('https://example.test/rpc', {
    method: 'POST',
    cache: 'force-cache',
  });
  expect(fetchSpy).toHaveBeenCalledExactlyOnceWith('https://example.test/rpc', {
    method: 'POST',
    cache: 'no-store',
  });
});
it('malformed token never reaches env, client or RPC', async () => {
  vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon');
  for (const token of ['bad', '', null, 42, 'A'.repeat(42)])
    expect(await openRegistrationLink(token)).toEqual({ status: 'invalid' });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
  ['missing url', ''],
  ['missing anon key', ''],
  ['insecure url', 'http://example.com'],
])('env/provider failure is generic invalid: %s', async (kind, url) => {
  if (kind === 'missing url') {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon');
  } else if (kind === 'missing anon key') {
    vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
  } else {
    vi.stubEnv('SUPABASE_URL', url);
    vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon');
  }
  expect(await openRegistrationLink('A'.repeat(43))).toEqual({
    status: 'invalid',
  });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
  [{ data: null, error: { message: 'private' } }],
  [{ data: { status: 'valid', workspace_name: 'A', extra: 'x' }, error: null }],
  [{ data: { status: 'valid', workspace_name: '' }, error: null }],
])('provider payload/error is generic invalid %#', async (response) => {
  vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon');
  mocks.rpc.mockResolvedValue(response);
  expect(await openRegistrationLink('A'.repeat(43))).toEqual({
    status: 'invalid',
  });
});
it('catches a thrown provider exception generically', async () => {
  vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon');
  mocks.rpc.mockRejectedValue(new Error('private provider detail'));
  expect(await openRegistrationLink('A'.repeat(43))).toEqual({
    status: 'invalid',
  });
});
