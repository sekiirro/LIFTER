import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.actor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.session,
}));
vi.mock('../../lib/supabase/admin', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
import { issueRegistrationLinkAction } from '../../app/(app)/registration-links/actions';
import { hashToken } from '../../lib/registration-links/token';
import { issueRegistrationLink } from '../../lib/registration-links/service';
const ws = '00000000-0000-0000-0000-000000000001',
  version = '00000000-0000-0000-0000-000000000002';
const input = {
  workspaceId: ws,
  packageVersionId: version,
  installments: null,
};
const paymentTerms = {
  upfrontAmountMinor: '400',
  totalPaymentCount: 2,
  installments: [
    { seq: 1, amountMinor: '400', dueOffsetDays: 2 },
    { seq: 2, amountMinor: '800', dueOffsetDays: 17 },
  ],
};
const flexibleInput = {
  workspaceId: ws,
  packageVersionId: version,
  paymentTerms,
};

it.each([issueRegistrationLink, issueRegistrationLinkAction])(
  'v2 service/action uses authenticated flexible wrapper with exact custom transport %#',
  async (issue) => {
    const r = await issue(flexibleInput);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') throw new Error('missing result');
    const token = r.link.split('/').at(-1)!;
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      'issue_flexible_registration_link',
      {
        workspace_id: ws,
        package_version_id: version,
        token_hash: hashToken(token),
        upfront_amount_minor: '400',
        total_payment_count: 2,
        installments: [
          { seq: 1, amount_minor: '400', due_offset_days: 2 },
          { seq: 2, amount_minor: '800', due_offset_days: 17 },
        ],
      },
    );
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(token);
    expect(mocks.session).toHaveBeenCalledTimes(1);
    expect(mocks.revalidate).toHaveBeenCalledTimes(
      issue === issueRegistrationLinkAction ? 1 : 0,
    );
  },
);

it('v2 null keeps Trainer full-payment issuance on the legacy RPC', async () => {
  mocks.actor.mockResolvedValue({
    userId: version,
    role: 'trainer',
    activeWorkspaceIds: [ws],
  });
  expect(
    (
      await issueRegistrationLinkAction({
        ...flexibleInput,
        paymentTerms: null,
      })
    ).status,
  ).toBe('ok');
  expect(mocks.rpc).toHaveBeenCalledWith(
    'issue_registration_link',
    expect.objectContaining({ installments: null }),
  );
});

it('Trainer cannot configure v2 terms even with an accepting backend', async () => {
  mocks.actor.mockResolvedValue({
    userId: version,
    role: 'trainer',
    activeWorkspaceIds: [ws],
  });
  for (const terms of [paymentTerms, {}, [], undefined])
    expect(
      await issueRegistrationLinkAction({
        ...flexibleInput,
        paymentTerms: terms,
      }),
    ).toEqual({ status: 'not_permitted' });
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([
  { ...paymentTerms, upfrontAmountMinor: '401' },
  { ...paymentTerms, totalPaymentCount: 3 },
  { ...paymentTerms, upfrontAmountMinor: 400 },
  { ...paymentTerms, installments: [] },
])('v2 rejects incoherent terms before session/RPC %#', async (terms) => {
  expect(
    await issueRegistrationLinkAction({
      ...flexibleInput,
      paymentTerms: terms,
    }),
  ).toEqual({ status: 'invalid_input' });
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it.each([{ installments: null }, { priceMinor: '1200' }, { actorId: version }])(
  'v2 rejects mixed legacy fields and overrides %#',
  async (extra) => {
    expect(
      await issueRegistrationLinkAction({ ...flexibleInput, ...extra }),
    ).toEqual({ status: 'invalid_input' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);

it('v2 wrapper authoritative-price rejection yields no URL or revalidation', async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: '22023', message: 'invalid_input' },
  });
  expect(await issueRegistrationLinkAction(flexibleInput)).toEqual({
    status: 'invalid_input',
  });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it.each(['platform_owner', 'workspace_owner', 'sales'])(
  'v2 permits authorized %s without widening the capability matrix',
  async (role) => {
    mocks.actor.mockResolvedValue({
      userId: version,
      role,
      activeWorkspaceIds: [ws],
    });
    expect((await issueRegistrationLinkAction(flexibleInput)).status).toBe(
      'ok',
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  },
);

it.each([null, { userId: version, role: 'sales', activeWorkspaceIds: [] }])(
  'v2 rejects missing/foreign actors before target disclosure %#',
  async (actor) => {
    mocks.actor.mockResolvedValue(actor);
    expect(await issueRegistrationLinkAction(flexibleInput)).toEqual({
      status: 'not_permitted',
    });
    expect(mocks.session).not.toHaveBeenCalled();
  },
);

it('v2 missing wrapper fails safely without retrying through legacy issuance', async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: 'PGRST202', message: 'missing wrapper' },
  });
  expect(await issueRegistrationLinkAction(flexibleInput)).toEqual({
    status: 'unavailable',
  });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
let logs: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('APP_ORIGIN', 'https://example.test');
  mocks.actor.mockResolvedValue({
    userId: version,
    role: 'sales',
    activeWorkspaceIds: [ws],
  });
  mocks.session.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: version, error: null });
  logs = (['log', 'info', 'error', 'warn', 'debug', 'trace'] as const).map(
    (k) => vi.spyOn(console, k).mockImplementation(() => {}),
  );
});
afterEach(() => {
  for (const log of logs) expect(log).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it('returns show-once URL after signed hash-only commit and revalidates once', async () => {
  const r = await issueRegistrationLinkAction(input);
  expect(r.status).toBe('ok');
  if (r.status !== 'ok') throw new Error('missing result');
  const token = r.link.split('/').at(-1)!;
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('issue_registration_link', {
    workspace_id: ws,
    package_version_id: version,
    token_hash: hashToken(token),
    installments: null,
  });
  expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(token);
  expect(mocks.actor).toHaveBeenCalledTimes(1);
  expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith(
    '/registration-links',
  );
});
it('issues a schedule with exact transport and hash-only material', async () => {
  const installments = [
    { seq: 1, amountMinor: '400', dueOffsetDays: 2 },
    { seq: 2, amountMinor: '800', dueOffsetDays: 12 },
  ];
  const r = await issueRegistrationLinkAction({ ...input, installments });
  expect(r.status).toBe('ok');
  if (r.status !== 'ok') throw new Error('missing result');
  const token = r.link.split('/').at(-1)!;
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('issue_registration_link', {
    workspace_id: ws,
    package_version_id: version,
    token_hash: hashToken(token),
    installments: [
      { seq: 1, amount_minor: '400', due_offset_days: 2 },
      { seq: 2, amount_minor: '800', due_offset_days: 12 },
    ],
  });
  const call = JSON.stringify(mocks.rpc.mock.calls);
  expect(call).not.toContain(token);
  expect(call).not.toContain('/register/');
  expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith(
    '/registration-links',
  );
});
it.each([
  null,
  { userId: version, role: 'sales', activeWorkspaceIds: [] },
  { userId: version, role: null, activeWorkspaceIds: [ws] },
])('first app wall %#', async (actor) => {
  mocks.actor.mockResolvedValue(actor);
  expect(await issueRegistrationLinkAction(input)).toEqual({
    status: 'not_permitted',
  });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('Trainer second app wall denies valid, empty and malformed schedules even against accepting RPC', async () => {
  mocks.actor.mockResolvedValue({
    userId: version,
    role: 'trainer',
    activeWorkspaceIds: [ws],
  });
  for (const installments of [
    [{ seq: 1, amountMinor: '1200', dueOffsetDays: 0 }],
    [],
    {},
  ])
    expect(
      await issueRegistrationLinkAction({ ...input, installments }),
    ).toEqual({ status: 'not_permitted' });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
  'createdBy',
  'priceMinor',
  'offerId',
  'commissionRateBp',
  'expiresAt',
])('rejects forged field %s', async (key) => {
  expect(
    await issueRegistrationLinkAction({ ...input, [key]: 'forged' }),
  ).toEqual({ status: 'invalid_input' });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('bad origin stops before mutation', async () => {
  vi.stubEnv('APP_ORIGIN', 'https://example.test/path');
  expect(await issueRegistrationLinkAction(input)).toEqual({
    status: 'unavailable',
  });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
  { code: '22023', message: 'stale_terms', status: 'stale_terms' },
  { code: '42501', message: 'private', status: 'not_permitted' },
  { code: '22023', message: 'invalid_input', status: 'invalid_input' },
  { code: '23514', message: 'private', status: 'unavailable' },
])(
  'sanitizes errors including deferred failures %#',
  async ({ status, ...error }) => {
    mocks.rpc.mockResolvedValue({ data: null, error });
    const r = await issueRegistrationLinkAction(input);
    expect(r).toEqual({ status });
    expect(r).not.toHaveProperty('link');
    expect(JSON.stringify(r)).not.toContain('/register/');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  },
);
it.each(['forged', '00000000-0000-0000-0000-00000000000g', '', null, 42])(
  'rejects invalid/forged packageVersionId %#',
  async (packageVersionId) => {
    expect(
      await issueRegistrationLinkAction({ ...input, packageVersionId }),
    ).toEqual({ status: 'invalid_input' });
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  },
);
it('denies a forged foreign workspace even with an accepting RPC mock', async () => {
  expect(
    await issueRegistrationLinkAction({
      ...input,
      workspaceId: '00000000-0000-0000-0000-000000000099',
    }),
  ).toEqual({ status: 'not_permitted' });
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
  null,
  { userId: version, role: 'sales', activeWorkspaceIds: [ws], actorId: 'x' },
])(
  'derives identity only from getActor and ignores forged actor fields %#',
  async (forged) => {
    if (forged)
      expect(
        await issueRegistrationLinkAction({
          ...input,
          ...forged,
        }),
      ).toEqual({ status: 'invalid_input' });
    else {
      mocks.actor.mockResolvedValue(null);
      expect(await issueRegistrationLinkAction(input)).toEqual({
        status: 'not_permitted',
      });
    }
    expect(mocks.actor).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  },
);
it('stops before mutation when the origin env is missing', async () => {
  vi.stubEnv('APP_ORIGIN', '');
  const r = await issueRegistrationLinkAction(input);
  expect(r).toEqual({ status: 'unavailable' });
  expect(r).not.toHaveProperty('link');
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it('stops before mutation when the session client is null', async () => {
  mocks.session.mockResolvedValue(null);
  const r = await issueRegistrationLinkAction(input);
  expect(r).toEqual({ status: 'unavailable' });
  expect(r).not.toHaveProperty('link');
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it('maps thrown actor/session/rpc failures generically without a URL', async () => {
  mocks.actor.mockRejectedValue(new Error('private actor'));
  expect(await issueRegistrationLinkAction(input)).toEqual({
    status: 'unavailable',
  });
  expect(mocks.session).not.toHaveBeenCalled();
  mocks.actor.mockResolvedValue({
    userId: version,
    role: 'sales',
    activeWorkspaceIds: [ws],
  });
  mocks.session.mockRejectedValue(new Error('private session'));
  expect(await issueRegistrationLinkAction(input)).toEqual({
    status: 'unavailable',
  });
  mocks.session.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockRejectedValue(new Error('private rpc'));
  expect(await issueRegistrationLinkAction(input)).toEqual({
    status: 'unavailable',
  });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it('rejects a non-UUID RPC result without constructing a URL', async () => {
  mocks.rpc.mockResolvedValue({ data: 'forged', error: null });
  const r = await issueRegistrationLinkAction(input);
  expect(r).toEqual({ status: 'unavailable' });
  expect(r).not.toHaveProperty('link');
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
const malformedSchedules: unknown[] = [
  [],
  [{ seq: 1, amountMinor: '1.2', dueOffsetDays: 0 }],
  [{ seq: 1, amountMinor: '1', dueOffsetDays: 0, extra: true }],
  [
    { seq: 1, amountMinor: '1', dueOffsetDays: 0 },
    { seq: 3, amountMinor: '1', dueOffsetDays: 1 },
  ],
];
it.each(malformedSchedules.map((installments) => [installments]))(
  'Sales rejects malformed schedule before mutation %#',
  async (installments) => {
    expect(
      await issueRegistrationLinkAction({ ...input, installments }),
    ).toEqual({ status: 'invalid_input' });
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);
