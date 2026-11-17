import { afterAll, expect, it } from 'vitest';
import {
  registrationFixture,
  crossWorkspaceOffer,
  issue,
  secret,
  sql,
  checked,
  type RegistrationFixture,
} from './registration-links-fixture';

// F10 T035 / S31-PO-3 / FR-006: 50 links per authorized issuing account per
// rolling 24 hours, Trainer/WO/PO included, atomic under real parallelism.
const LIMIT = 50;
const T = 180_000;
const db = sql();
afterAll(() => db.end());

type Client = Parameters<typeof issue>[1];
const count = async (userId: string) => {
  const [r] =
    await db`select count(*)::int as n from public.registration_links where created_by=${userId}`;
  return r!.n;
};
const events = async (workspaceId: string, userId: string) => {
  const [r] =
    await db`select count(*)::int as n from public.audit_events where workspace_id=${workspaceId} and action='registration_link.issued' and actor_user_id=${userId}`;
  return r!.n;
};
const burst = (
  fx: RegistrationFixture,
  client: Client,
  n: number,
  patch: Record<string, unknown> = {},
) => Promise.all(Array.from({ length: n }, () => issue(fx, client, patch)));
const expectSplit = (
  results: Awaited<ReturnType<typeof burst>>,
  ok: number,
) => {
  expect(results.filter((r) => !r.error)).toHaveLength(ok);
  const refused = results.filter((r) => r.error);
  expect(refused).toHaveLength(results.length - ok);
  for (const r of refused)
    expect(r.error).toMatchObject({ code: 'P0001', message: 'unavailable' });
};
const orphanInstallments = async () => {
  const [r] =
    await db`select count(*)::int as n from public.registration_link_installments i where not exists (select 1 from public.registration_links l where l.workspace_id=i.workspace_id and l.id=i.link_id)`;
  return r!.n;
};

it('configuration: effective limit is exactly 50 per rolling 24 hours, immutable and private', async () => {
  const [l] =
    await db`select per_actor, extract(epoch from win)::int as secs from app_private.registration_link_limits()`;
  expect(l!.per_actor).toBe(LIMIT);
  expect(l!.secs).toBe(24 * 3600);
  const [meta] =
    await db`select p.provolatile as vol, p.pronargs as args, pg_get_userbyid(p.proowner) as owner,
      has_function_privilege('anon','app_private.registration_link_limits()','execute') as anon,
      has_function_privilege('authenticated','app_private.registration_link_limits()','execute') as authed,
      has_function_privilege('service_role','app_private.registration_link_limits()','execute') as service
      from pg_proc p where p.oid='app_private.registration_link_limits()'::regprocedure`;
  // No role/workspace input: one value for every role, no exceptions.
  expect(meta).toMatchObject({
    vol: 'i',
    args: 0,
    owner: 'postgres',
    anon: false,
    authed: false,
    service: false,
  });
});

it(
  '60 parallel issuances by one account commit exactly 50; the rest are the generic failure and leave no partial rows',
  async () => {
    const fx = await registrationFixture();
    const results = await burst(fx, fx.salesA.client, LIMIT + 10);
    expectSplit(results, LIMIT);
    expect(await count(fx.salesA.userId)).toBe(LIMIT);
    expect(await events(fx.wsA.id, fx.salesA.userId)).toBe(LIMIT);
    const [h] =
      await db`select count(distinct token_hash)::int as n from public.registration_links where created_by=${fx.salesA.userId}`;
    expect(h!.n).toBe(LIMIT);
    // The 51st sequential attempt is still refused with the same generic failure.
    const r = await issue(fx, fx.salesA.client);
    expect(r.error).toMatchObject({ code: 'P0001', message: 'unavailable' });
    expect(await count(fx.salesA.userId)).toBe(LIMIT);
    expect(await events(fx.wsA.id, fx.salesA.userId)).toBe(LIMIT);
    expect(await orphanInstallments()).toBe(0);
  },
  T,
);

for (const role of ['po', 'woA', 'trainerA'] as const)
  it(
    `no exception: ${role} is limited to 50 under parallel issuance`,
    async () => {
      const fx = await registrationFixture();
      const actor = fx.actors[role];
      expectSplit(await burst(fx, actor.client, LIMIT + 1), LIMIT);
      expect(await count(actor.userId)).toBe(LIMIT);
    },
    T,
  );

it(
  'limit is per account across workspaces: PO 25 in A + 26 in B yields 50 commits and 1 refusal',
  async () => {
    const fx = await registrationFixture();
    const foreign = await crossWorkspaceOffer(fx);
    const results = await Promise.all([
      ...Array.from({ length: 25 }, () => issue(fx, fx.po.client)),
      ...Array.from({ length: 26 }, () =>
        issue(fx, fx.po.client, {
          workspace_id: fx.wsB.id,
          package_version_id: foreign.versionId,
        }),
      ),
    ]);
    expectSplit(results, LIMIT);
    expect(await count(fx.po.userId)).toBe(LIMIT);
  },
  T,
);

it(
  'rolled-back attempts consume no quota: duplicate hash and invalid input leave 49, then exactly one more commits',
  async () => {
    const fx = await registrationFixture();
    expectSplit(await burst(fx, fx.salesA.client, LIMIT - 2), LIMIT - 2);
    const hash = secret().hash;
    checked(await issue(fx, fx.salesA.client, { token_hash: hash }));
    expect(await count(fx.salesA.userId)).toBe(LIMIT - 1);
    // Below the limit, so this is a real duplicate-hash rollback, not a limit refusal.
    const dup = await issue(fx, fx.salesA.client, { token_hash: hash });
    expect(dup.error?.message).toBe('unavailable');
    const bad = await burst(fx, fx.salesA.client, 3, {
      token_hash: 'not-a-valid-hash',
    });
    for (const r of bad) expect(r.error?.code).toBe('22023');
    expect(await count(fx.salesA.userId)).toBe(LIMIT - 1);
    expect(await events(fx.wsA.id, fx.salesA.userId)).toBe(LIMIT - 1);
    checked(await issue(fx, fx.salesA.client));
    expect((await issue(fx, fx.salesA.client)).error).toMatchObject({
      code: 'P0001',
      message: 'unavailable',
    });
    expect(await count(fx.salesA.userId)).toBe(LIMIT);
    expect(await orphanInstallments()).toBe(0);
  },
  T,
);

it(
  'negative: an at-limit account does not affect others; foreign-workspace attempts neither commit nor consume quota',
  async () => {
    const fx = await registrationFixture();
    expectSplit(await burst(fx, fx.salesA.client, LIMIT), LIMIT);
    // Another account in the same workspace is unaffected.
    checked(await issue(fx, fx.woA.client));
    // Foreign-workspace staff cannot issue into workspace A: authorization
    // precedes the limit and nothing is written or counted.
    for (const r of await burst(fx, fx.actors.salesB.client, 3))
      expect(r.error).toMatchObject({
        code: '42501',
        message: 'not_permitted',
      });
    expect(await count(fx.actors.salesB.userId)).toBe(0);
    // An at-limit account is not_permitted (never "unavailable") in a foreign workspace.
    const r = await issue(fx, fx.salesA.client, { workspace_id: fx.wsB.id });
    expect(r.error).toMatchObject({ code: '42501', message: 'not_permitted' });
    expect(await count(fx.salesA.userId)).toBe(LIMIT);
    expect((await issue(fx, fx.actors.anon.client)).error?.code).toBe('42501');
  },
  T,
);
