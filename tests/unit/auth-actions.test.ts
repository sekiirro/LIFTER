import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn } from '../../app/login/actions';
import { signOut } from '../../app/(app)/actions';
import {
  verifyRecovery,
  setNewPassword,
} from '../../app/auth/recovery/actions';

const mocks = vi.hoisted(() => ({
  factory: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
  getClaims: vi.fn(),
  updateUser: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.factory,
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation(() => {
    throw new Error('redirect');
  });
  mocks.factory.mockResolvedValue({
    auth: {
      signInWithPassword: mocks.signIn,
      signOut: mocks.signOut,
      verifyOtp: mocks.verifyOtp,
      getUser: mocks.getUser,
      getClaims: mocks.getClaims,
      updateUser: mocks.updateUser,
    },
  });
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'verified-user' } },
    error: null,
  });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.getClaims.mockResolvedValue({
    data: {
      claims: {
        amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) }],
      },
    },
    error: null,
  });
});

describe('sign-in and sign-out actions', () => {
  it.each(['unknown-user', 'wrong-password'])(
    'returns the same result for %s',
    async () => {
      mocks.signIn.mockResolvedValue({
        error: { message: 'sensitive provider detail' },
      });
      expect(
        await signIn(
          null,
          form({ email: 'fixture@example.test', password: 'bad' }),
        ),
      ).toEqual({ status: 'invalid_credentials' });
    },
  );
  it.each([false, true])(
    'returns unavailable on env/network failure %#',
    async (network) => {
      if (network)
        mocks.signIn.mockRejectedValue(new Error('sensitive provider detail'));
      else mocks.factory.mockResolvedValue(null);
      expect(
        await signIn(
          null,
          form({ email: 'fixture@example.test', password: 'bad' }),
        ),
      ).toEqual({ status: 'unavailable' });
    },
  );
  it('maps a provider fetch failure to unavailable', async () => {
    mocks.signIn.mockResolvedValue({
      error: { name: 'AuthRetryableFetchError' },
    });
    expect(
      await signIn(
        null,
        form({ email: 'fixture@example.test', password: 'bad' }),
      ),
    ).toEqual({ status: 'unavailable' });
  });
  it.each([
    ['//evil.example', '/'],
    ['/a?b=1', '/a?b=1'],
  ])('sanitizes %s on successful sign-in', async (next, destination) => {
    await expect(
      signIn(
        null,
        form({ email: 'fixture@example.test', password: 'test', next }),
      ),
    ).rejects.toThrow('redirect');
    expect(mocks.redirect).toHaveBeenCalledWith(destination);
  });
  it('signs out of the current browser only', async () => {
    await expect(signOut()).rejects.toThrow('redirect');
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.redirect).toHaveBeenCalledWith('/login');
  });
  it('does not expose a thrown sign-out provider error', async () => {
    mocks.signOut.mockRejectedValue(new Error('sensitive provider detail'));
    await expect(signOut()).rejects.toThrow('redirect');
    expect(mocks.redirect).toHaveBeenCalledWith('/login');
  });
});

describe('recovery actions', () => {
  it('does not call the provider without a hash', async () => {
    expect(await verifyRecovery(null, form({}))).toEqual({
      status: 'invalid_link',
    });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it('verifies only the recovery OTP type', async () => {
    expect(
      await verifyRecovery(
        null,
        form({ token_hash: 'fixture-hash', type: 'signup' }),
      ),
    ).toEqual({ status: 'ok' });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'fixture-hash',
      type: 'recovery',
    });
  });
  it.each(['provider', 'network', 'env'])(
    'hides %s verification failures',
    async (kind) => {
      if (kind === 'provider')
        mocks.verifyOtp.mockResolvedValue({
          error: { message: 'fixture-hash expired' },
        });
      if (kind === 'network')
        mocks.verifyOtp.mockRejectedValue(new Error('fixture-hash'));
      if (kind === 'env') mocks.factory.mockResolvedValue(null);
      expect(
        await verifyRecovery(null, form({ token_hash: 'fixture-hash' })),
      ).toEqual({ status: 'invalid_link' });
    },
  );
  it('requires a verified session before setting a password', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(
      await setNewPassword(
        null,
        form({ password: 'secret', confirm: 'secret', userId: 'forged' }),
      ),
    ).toEqual({ status: 'invalid_link' });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it('rejects mismatch before updating', async () => {
    expect(
      await setNewPassword(null, form({ password: 'one', confirm: 'two' })),
    ).toEqual({ status: 'mismatch' });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it('rejects an ordinary signed-in session without updating the password', async () => {
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [
            { method: 'password', timestamp: Math.floor(Date.now() / 1000) },
          ],
        },
      },
      error: null,
    });
    expect(
      await setNewPassword(
        null,
        form({ password: 'secret', confirm: 'secret' }),
      ),
    ).toEqual({ status: 'invalid_link' });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it('rejects stale OTP claims without updating the password', async () => {
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [
            { method: 'otp', timestamp: Math.floor(Date.now() / 1000) - 901 },
          ],
        },
      },
      error: null,
    });
    expect(
      await setNewPassword(
        null,
        form({ password: 'secret', confirm: 'secret' }),
      ),
    ).toEqual({ status: 'invalid_link' });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it.each(['missing', 'error', 'network'])(
    'rejects %s claims without updating the password',
    async (kind) => {
      if (kind === 'missing')
        mocks.getClaims.mockResolvedValue({ data: null, error: null });
      if (kind === 'error')
        mocks.getClaims.mockResolvedValue({
          data: null,
          error: { message: 'sensitive provider detail' },
        });
      if (kind === 'network')
        mocks.getClaims.mockRejectedValue(
          new Error('sensitive provider detail'),
        );
      expect(
        await setNewPassword(
          null,
          form({ password: 'secret', confirm: 'secret' }),
        ),
      ).toEqual({ status: 'invalid_link' });
      expect(mocks.updateUser).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['weak_password', 'weak_password'],
    ['other', 'invalid_link'],
  ])('maps %s without provider text', async (code, status) => {
    mocks.updateUser.mockResolvedValue({
      error: { code, message: 'sensitive provider detail' },
    });
    expect(
      await setNewPassword(
        null,
        form({ password: 'secret', confirm: 'secret' }),
      ),
    ).toEqual({ status });
  });
  it('updates the session user and redirects on success', async () => {
    await expect(
      setNewPassword(
        null,
        form({ password: 'secret', confirm: 'secret', userId: 'forged' }),
      ),
    ).rejects.toThrow('redirect');
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'secret' });
    expect(mocks.redirect).toHaveBeenCalledWith('/');
  });
});
