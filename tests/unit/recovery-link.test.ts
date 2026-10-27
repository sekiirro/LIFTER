import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateRecoveryLink,
  buildRecoveryUrl,
} from '../../lib/auth/recovery-link';
import { mapRpcError } from '../../lib/auth/results';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  session: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
  getUserById: vi.fn(),
  generateLink: vi.fn(),
  env: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.actor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.session,
}));
vi.mock('../../lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('../../lib/supabase/env', async (original) => ({
  ...(await original<typeof import('../../lib/supabase/env')>()),
  readServerEnv: mocks.env,
}));

const target = '00000000-0000-0000-0000-000000000001';
const email = 'secret@example.test';
const token = 'secret-recovery-hash';
let logs: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  vi.resetAllMocks();
  logs = (['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map(
    (method) => vi.spyOn(console, method).mockImplementation(() => {}),
  );
  mocks.env.mockReturnValue({ appOrigin: 'https://lifter.example' });
  mocks.actor.mockResolvedValue({
    userId: 'actor',
    role: 'workspace_owner',
    activeWorkspaceIds: ['A'],
  });
  mocks.session.mockResolvedValue({ rpc: mocks.rpc });
  mocks.admin.mockReturnValue({
    auth: {
      admin: {
        getUserById: mocks.getUserById,
        generateLink: mocks.generateLink,
      },
    },
  });
  mocks.rpc
    .mockResolvedValueOnce({ data: 'A', error: null })
    .mockResolvedValue({ data: 'issuance', error: null });
  mocks.getUserById.mockResolvedValue({
    data: { user: { email } },
    error: null,
  });
  mocks.generateLink.mockResolvedValue({
    data: { properties: { hashed_token: token } },
    error: null,
  });
});
afterEach(() => {
  for (const log of logs) expect(log).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('recovery generation', () => {
  it('returns a link only after authorize, app wall, provider and record', async () => {
    expect(await generateRecoveryLink(target)).toEqual({
      status: 'ok',
      link: `https://lifter.example/auth/recovery?token_hash=${token}&type=recovery`,
    });
    expect(mocks.rpc.mock.calls).toEqual([
      ['recovery_link_authorize', { target }],
      ['recovery_link_record', { target }],
    ]);
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getUserById.mock.invocationCallOrder[0]!,
    );
    expect(mocks.getUserById.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.generateLink.mock.invocationCallOrder[0]!,
    );
    expect(mocks.generateLink.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder[1]!,
    );
    expect(mocks.generateLink).toHaveBeenCalledWith({
      type: 'recovery',
      email,
    });
  });
  it.each([
    [{ code: '42501', message: 'not_permitted' }, 'denied'],
    [{ code: 'P0001', message: 'rate_limited' }, 'rate_limited'],
    [{ code: '500', message: `${email} ${token}` }, 'unavailable'],
  ])(
    'does not reach the provider when preflight fails %#',
    async (error, status) => {
      mocks.rpc.mockReset().mockResolvedValue({ error });
      expect(await generateRecoveryLink(target)).toEqual({ status });
      expect(mocks.generateLink).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );
  it.each(['trainer', 'sales', null])(
    'app wall denies role %s despite forged RPC workspace',
    async (role) => {
      mocks.actor.mockResolvedValue({
        userId: 'actor',
        role,
        activeWorkspaceIds: ['A'],
      });
      expect(await generateRecoveryLink(target)).toEqual({ status: 'denied' });
      expect(mocks.generateLink).not.toHaveBeenCalled();
    },
  );
  it('denies a foreign workspace despite a successful preflight', async () => {
    mocks.actor.mockResolvedValue({
      userId: 'actor',
      role: 'workspace_owner',
      activeWorkspaceIds: ['B'],
    });
    expect(await generateRecoveryLink(target)).toEqual({ status: 'denied' });
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });
  it.each([
    [{ code: '42501', message: 'not_permitted' }, 'denied'],
    [{ code: 'P0001', message: 'rate_limited' }, 'rate_limited'],
    [{ message: `${email} ${token}` }, 'unavailable'],
  ])('discards the link on record failure %#', async (error, status) => {
    mocks.rpc
      .mockReset()
      .mockResolvedValueOnce({ data: 'A', error: null })
      .mockResolvedValue({ error });
    expect(await generateRecoveryLink(target)).toEqual({ status });
    expect(mocks.generateLink).toHaveBeenCalledOnce();
  });
  it('rejects invalid UUIDs before doing work', async () => {
    expect(await generateRecoveryLink(email)).toEqual({ status: 'denied' });
    expect(mocks.actor).not.toHaveBeenCalled();
  });
  it('denies anonymous callers', async () => {
    mocks.actor.mockResolvedValue(null);
    expect(await generateRecoveryLink(target)).toEqual({ status: 'denied' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(['env', 'session', 'admin'] as const)(
    'fails closed for missing %s',
    async (factory) => {
      mocks[factory].mockReturnValue(null);
      expect(await generateRecoveryLink(target)).toEqual({
        status: 'unavailable',
      });
      expect(mocks.generateLink).not.toHaveBeenCalled();
    },
  );
  it.each(['getUserById', 'generateLink'] as const)(
    'hides provider errors from %s',
    async (method) => {
      mocks[method].mockResolvedValue({
        data: {},
        error: { message: `${email} ${token}` },
      });
      expect(await generateRecoveryLink(target)).toEqual({
        status: 'unavailable',
      });
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
    },
  );
  it('hides thrown provider errors', async () => {
    mocks.generateLink.mockRejectedValue(new Error(`${token} ${email}`));
    expect(await generateRecoveryLink(target)).toEqual({
      status: 'unavailable',
    });
  });
});

describe('recovery URL and errors', () => {
  it.each(['http://evil', 'javascript:alert(1)', 'invalid'])(
    'rejects %s',
    (origin) => {
      expect(() => buildRecoveryUrl(origin, token)).toThrow('invalid_origin');
    },
  );
  it.each([
    'https://example.test/base',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
  ])('encodes the hash on %s', (origin) => {
    const url = new URL(buildRecoveryUrl(origin, 'a+b/&=?'));
    expect(url.pathname).toBe('/auth/recovery');
    expect(url.searchParams.get('token_hash')).toBe('a+b/&=?');
    expect(url.searchParams.get('type')).toBe('recovery');
  });
  it('requires both exact RPC code and message', () => {
    expect(mapRpcError({ code: '42501', message: token })).toBe('unavailable');
    expect(mapRpcError({ code: 'P0001', message: 'not_permitted' })).toBe(
      'unavailable',
    );
  });
});
