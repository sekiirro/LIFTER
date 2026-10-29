import { expect, it, vi } from 'vitest';
import { authorize } from '../../lib/auth/authorize';
import { CAPABILITIES } from '../../lib/auth/capabilities';
import vectors from '../fixtures/f11-attestation-vectors.json';
import { trustedIp } from '../../lib/client-accounts/trusted-ip';
import {
  buildAdmission,
  attestAdmission,
  newRequestSecret,
} from '../../lib/client-accounts/admission';
import { authorizePublicClientSignup } from '../../lib/client-accounts/validation';
vi.mock('server-only', () => ({}));

it('trusts only CF, canonicalizes full addresses, and gates overrides explicitly', () => {
  const get = (values: Record<string, string>) => ({
    get: (key: string) => values[key] ?? null,
  });
  expect(trustedIp(get({ 'CF-Connecting-IP': '2001:0DB8:0:0:0:0:0:1' }))).toBe(
    '2001:db8::1',
  );
  expect(trustedIp(get({ 'CF-Connecting-IP': '::ffff:192.0.2.1' }))).toBe(
    '192.0.2.1',
  );
  for (const value of [
    '',
    'bad',
    '127.1',
    '01.2.3.4',
    '1.2.3.999',
    '::1%eth0',
    '1.2.3.4, 5.6.7.8',
  ])
    expect(
      trustedIp(
        get({ 'CF-Connecting-IP': value, 'X-Forwarded-For': '192.0.2.1' }),
      ) === null,
    ).toBe(true);
  expect(
    trustedIp(
      get({ 'X-Forwarded-For': '192.0.2.1', 'X-Real-IP': '192.0.2.1' }),
    ),
  ).toBeNull();
  for (const mode of ['production', 'test'] as const)
    for (const allowTestOverride of [false, true])
      expect(
        trustedIp(get({}), { mode, allowTestOverride, testIp: '192.0.2.1' }) !==
          null,
      ).toBe(mode !== 'production' && allowTestOverride);
  expect(
    trustedIp(get({ 'CF-Connecting-IP': '2001:db8::2' })) !==
      trustedIp(get({ 'CF-Connecting-IP': '2001:db8::1' })),
  ).toBe(true);
});

it('shared vectors reproduce every byte and every signed-field mutation changes the MAC', async () => {
  vi.stubEnv('SIGNUP_RATE_KEY', vectors.rateKey);
  vi.stubEnv('SIGNUP_ATTEST_KEY', vectors.attestKey);
  try {
    for (const v of vectors.vectors) {
      const input = {
        ip: v.ip,
        token: v.token,
        issuedAt: Number(v.issuedAt),
        nonce: v.nonce,
      };
      const actual = await buildAdmission(input);
      expect(actual !== null).toBe(true);
      for (const key of ['ipKey', 'linkKey', 'attestation'] as const)
        expect(actual![key] === v[key], key).toBe(true);
      for (const patch of [
        { ip: '192.0.2.99' },
        { token: 'Z'.repeat(43) },
        { issuedAt: Number(v.issuedAt) + 1 },
        { nonce: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
      ])
        expect(
          (await buildAdmission({ ...input, ...patch }))!.attestation ===
            v.attestation,
        ).toBe(false);
      expect(Object.keys(actual!).sort()).toEqual([
        'attestation',
        'ipKey',
        'issuedAt',
        'linkKey',
        'nonce',
      ]);
    }
    for (const mutation of vectors.mutations) {
      const v = vectors.vectors[mutation.vectorIndex]!;
      const fields = {
        ipKey: v.ipKey,
        linkKey: v.linkKey,
        issuedAt: v.issuedAt,
        nonce: v.nonce,
        [mutation.field]: mutation.value,
      };
      expect(
        (await attestAdmission({
          ...fields,
          issuedAt: Number(fields.issuedAt),
        })) === v.attestation,
        mutation.field,
      ).toBe(false);
    }
    vi.stubEnv('SIGNUP_RATE_KEY', '');
    expect(
      await buildAdmission({ ip: '192.0.2.1', token: 'A'.repeat(43) }),
    ).toBeNull();
  } finally {
    vi.unstubAllEnvs();
  }
});
it('request secrets have at least 32 random bytes and are fresh', () => {
  const values = Array.from({ length: 100 }, () => newRequestSecret());
  expect(values.every((v) => /^[A-Za-z0-9_-]{43}$/.test(v))).toBe(true);
  expect(new Set(values.map((v) => v.length))).toEqual(new Set([43]));
  expect(new Set(values).size).toBe(100);
});

it('independent app wall denies before an accepting RPC; allowed requests need fresh admission', async () => {
  const fields = {
    name: 'Synthetic',
    email: 'USER@example.test',
    phone: '+201234567890',
    password: 'Synthetic9!',
  };
  const base = {
    token: 'A'.repeat(43),
    requestSecret: 'B'.repeat(43),
    fields,
    origin: 'https://example.test',
    expectedOrigin: 'https://example.test',
    signedIn: false,
  };
  const admit = vi.fn(async () => ({
    status: 'admitted' as const,
    admission_ticket: 'synthetic-ticket',
  }));
  for (const patch of [
    { token: 'bad' },
    { requestSecret: 'B'.repeat(42) },
    { requestSecret: 'B'.repeat(44) },
    { workspace_id: 'forged' },
    { requestSecret: 'bad' },
    { origin: 'https://foreign.test' },
    { origin: null },
    { signedIn: true },
    { fields: { ...fields, role: 'trainer' } },
    { fields: { ...fields, password: 'short' } },
    { fields: { ...fields, phone: '020123' } },
    { fields: { ...fields, name: '' } },
    { fields: { ...fields, email: 'bad' } },
  ]) {
    admit.mockClear();
    expect(
      (await authorizePublicClientSignup({ ...base, ...patch }, admit))
        .status === 'admitted',
    ).toBe(false);
    expect(admit).not.toHaveBeenCalled();
  }
  expect((await authorizePublicClientSignup(base, admit)).status).toBe(
    'admitted',
  );
  expect((await authorizePublicClientSignup(base, admit)).status).toBe(
    'admitted',
  );
  expect(admit).toHaveBeenCalledTimes(2);
});

it.each(CAPABILITIES)(
  'pending client cannot %s even when the backend accepts',
  (capability) => {
    const backend = vi.fn(() => true);
    const pendingClient = {
      userId: 'synthetic-pending',
      role: null,
      activeWorkspaceIds: ['synthetic-workspace'],
    };
    const result =
      authorize(pendingClient, capability, 'synthetic-workspace') && backend();
    expect(result).toBe(false);
    expect(backend).not.toHaveBeenCalled();
  },
);

it('PO decision 2026-10-28: IPv6 /64 grouping and mapped IPv4 preserve rate-key boundaries', async () => {
  vi.stubEnv('SIGNUP_RATE_KEY', vectors.rateKey);
  vi.stubEnv('SIGNUP_ATTEST_KEY', vectors.attestKey);
  try {
    const keys = await Promise.all(
      vectors.vectors.map(
        async (v) =>
          (await buildAdmission({ ip: v.ip, token: v.token }))!.ipKey,
      ),
    );
    expect(keys[1] === keys[3], 'same /64 shares a key').toBe(true);
    expect(keys[1] === keys[4], 'adjacent /64 separates keys').toBe(false);
    expect(keys[0] === keys[5], 'mapped IPv4 keeps full-address key').toBe(
      true,
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
