import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  crossWorkspaceOffer,
  historicalVersionFixture,
  issue,
  registrationFixture,
  schedule,
  secret,
  sql,
  type RegistrationFixture,
} from './registration-links-fixture';

let f: RegistrationFixture;
const db = sql();
const flexibleTerms = {
  upfront_amount_minor: '400',
  total_payment_count: 2,
  installments: schedule,
};

function issueFlexible(
  fixture: RegistrationFixture,
  client: RegistrationFixture['po']['client'] = fixture.po.client,
  patch: Record<string, unknown> = {},
) {
  return client.rpc('issue_flexible_registration_link', {
    workspace_id: fixture.wsA.id,
    package_version_id: fixture.p.versionId,
    token_hash: secret().hash,
    ...flexibleTerms,
    ...patch,
  });
}

beforeAll(async () => {
  f = await registrationFixture();
});
afterAll(() => db.end());

it('T050 flexible RPC delegates exact terms and preserves previously issued rows', async () => {
  const legacyId = (await issue(f, f.salesA.client)).data as string;
  const [oldLink] =
    await db`select to_jsonb(l) as value from public.registration_links l where id=${legacyId}`;
  const oldRows =
    await db`select to_jsonb(i) as value from public.registration_link_installments i where link_id=${legacyId} order by seq`;

  const result = await issueFlexible(f, f.salesA.client);
  expect(result.error).toBeNull();
  expect(result.data).toMatch(/^[0-9a-f-]{36}$/i);

  const [link] =
    await db`select price_minor::text,currency,package_version_id from public.registration_links where id=${result.data as string}`;
  const rows =
    await db`select seq,amount_minor::text,due_offset_days from public.registration_link_installments where link_id=${result.data as string} order by seq`;
  expect(link).toEqual({
    price_minor: '1200',
    currency: 'XTS',
    package_version_id: f.p.versionId,
  });
  expect(rows).toEqual(schedule);
  expect(
    await db`select details from public.audit_events where target_id=${result.data as string} and action='registration_link.issued'`,
  ).toEqual([
    {
      details: {
        package_version_id: f.p.versionId,
        offer_id: f.p.offer.id,
        installment_count: 2,
        price_minor: '1200',
        currency: 'XTS',
      },
    },
  ]);
  const [oldLinkAfter] =
    await db`select to_jsonb(l) as value from public.registration_links l where id=${legacyId}`;
  const oldRowsAfter =
    await db`select to_jsonb(i) as value from public.registration_link_installments i where link_id=${legacyId} order by seq`;
  expect(oldLinkAfter).toEqual(oldLink);
  expect(oldRowsAfter).toEqual(oldRows);
});

it.each([
  ['upfront does not equal row one', { upfront_amount_minor: '401' }],
  ['count does not equal row count', { total_payment_count: 1 }],
  [
    'row sum does not equal authoritative price',
    {
      installments: [
        { seq: 1, amount_minor: '400', due_offset_days: 2 },
        { seq: 2, amount_minor: '799', due_offset_days: 12 },
      ],
    },
  ],
])('T050 rejects %s without an issued row or audit', async (_label, patch) => {
  const beforeLinks =
    await db`select count(*)::int as n from public.registration_links where workspace_id=${f.wsA.id}`;
  const beforeAudits =
    await db`select count(*)::int as n from public.audit_events where workspace_id=${f.wsA.id} and action='registration_link.issued'`;
  const result = await issueFlexible(f, f.salesA.client, patch);
  expect(result.error).toMatchObject({
    code: '22023',
    message: 'invalid_input',
  });
  expect(
    await db`select count(*)::int as n from public.registration_links where workspace_id=${f.wsA.id}`,
  ).toEqual(beforeLinks);
  expect(
    await db`select count(*)::int as n from public.audit_events where workspace_id=${f.wsA.id} and action='registration_link.issued'`,
  ).toEqual(beforeAudits);
});

it('T050 requires schedule capability and same-workspace current terms', async () => {
  expect((await issueFlexible(f, f.trainerA.client)).error).toMatchObject({
    code: '42501',
    message: 'not_permitted',
  });

  const foreign = await crossWorkspaceOffer(f);
  expect(
    (
      await issueFlexible(f, f.woA.client, {
        workspace_id: f.wsB.id,
        package_version_id: foreign.versionId,
      })
    ).error,
  ).toMatchObject({ code: '42501', message: 'not_permitted' });

  const historical = await historicalVersionFixture();
  expect(
    (
      await issueFlexible(historical, historical.po.client, {
        package_version_id: historical.historicalVersionId,
      })
    ).error,
  ).toMatchObject({ code: '22023', message: 'stale_terms' });
});
