/**
 * T076 [FR-023] integration tests: future real-package retirement.
 *
 * PO decision S65-PO-15 (runs/s65-po/s65-po-15.verbatim.txt) settles the
 * contract: retirement IS the existing reversible
 * `set_package_offer_available(false)` - the offer is hidden from new sales,
 * history/snapshots are untouched and the PO can make it available again.
 * No new RPC, column, audit action or actor rule is introduced here.
 *
 * RED-first result: every T076 clause below was executed on origin/main and is
 * GREEN against the settled S65-PO-15 contract, so all cases are regular `it`
 * gates. No clause required the T058/T067 `it.fails` + *_RED_STRICT planned-RED
 * convention; if an implementing task later changes this behavior, these
 * regression gates will surface it directly.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checked,
  packagesFixture,
  publishedFixture,
  sql,
  type PackagesFixture,
} from './packages-fixture';
import { pending } from './client-accounts-fixture';
import {
  issue,
  registrationFixture,
  type RegistrationFixture,
} from './registration-links-fixture';
import { call, request } from './registration-approval-operations-fixture';

const db = sql();
let f: PackagesFixture;
let reg: RegistrationFixture;

beforeAll(async () => {
  f = await packagesFixture();
  reg = await registrationFixture();
});
afterAll(() => db.end());

const setAvailable = (
  client: SupabaseClient,
  workspaceId: string,
  offerId: string,
  available: boolean,
) =>
  client.rpc('set_package_offer_available', {
    workspace_id: workspaceId,
    offer_id: offerId,
    available,
  });

describe('T076 FR-023 retirement operation, audit and history', () => {
  it('PO retires a future real package with the reversible offer-level operation; audit, history and reversibility are exact', async () => {
    const p = await publishedFixture(f, { tier_rank: 1, price_minor: '1200' });
    checked(
      await setAvailable(f.po.client, p.offer.workspace_id, p.offer.id, true),
    );
    const packagesBefore =
      await db`select * from public.packages where id=${p.id}`;
    const versionsBefore =
      await db`select * from public.package_versions where offer_id=${p.offer.id} order by version`;
    const offerBefore =
      await db`select id,workspace_id,package_id,current_version_id,duration_days,duration_months,tier_rank from public.package_offers where id=${p.offer.id}`;
    const eventsBefore =
      await db`select count(*)::int as n from public.audit_events where target_id=${p.offer.id}`;
    expect(offerBefore[0]?.current_version_id).toBe(p.versionId);

    expect(
      checked(
        await setAvailable(
          f.po.client,
          p.offer.workspace_id,
          p.offer.id,
          false,
        ),
      ),
    ).toBe(p.offer.id);
    expect(
      await db`select available,current_version_id from public.package_offers where id=${p.offer.id}`,
    ).toEqual([{ available: false, current_version_id: p.versionId }]);

    const events =
      await db`select action,actor_user_id,workspace_id,details from public.audit_events where target_id=${p.offer.id} order by occurred_at,id`;
    expect(events).toHaveLength(eventsBefore[0]!.n + 1);
    expect(events.at(-1)).toEqual({
      action: 'package_offer.availability_changed',
      actor_user_id: f.po.userId,
      workspace_id: p.offer.workspace_id,
      details: { available: false },
    });
    expect(await db`select * from public.packages where id=${p.id}`).toEqual(
      packagesBefore,
    );
    expect(
      await db`select * from public.package_versions where offer_id=${p.offer.id} order by version`,
    ).toEqual(versionsBefore);
    expect(
      await db`select id,workspace_id,package_id,current_version_id,duration_days,duration_months,tier_rank from public.package_offers where id=${p.offer.id}`,
    ).toEqual(offerBefore);

    checked(
      await setAvailable(f.po.client, p.offer.workspace_id, p.offer.id, true),
    );
    expect(
      await db`select available from public.package_offers where id=${p.offer.id}`,
    ).toEqual([{ available: true }]);
  });

  it.each([
    'woA',
    'salesA',
    'trainerA',
    'woB',
    'salesB',
    'trainerB',
    'revoked',
    'noProfile',
    'client',
    'anon',
  ] as const)(
    'denies %s retirement with no mutation or audit',
    async (role) => {
      const p = await publishedFixture(f, { tier_rank: 1 });
      const before =
        await db`select available,current_version_id from public.package_offers where id=${p.offer.id}`;
      const result = await setAvailable(
        f.actors[role].client,
        p.offer.workspace_id,
        p.offer.id,
        false,
      );
      expect(result.error?.code, role).toBe('42501');
      expect(
        await db`select available,current_version_id from public.package_offers where id=${p.offer.id}`,
      ).toEqual(before);
      expect(
        await db`select id from public.audit_events where target_id=${p.offer.id}`,
      ).toHaveLength(0);
    },
  );

  it('denies a PO retirement attempt against a foreign workspace offer', async () => {
    const p = await publishedFixture(f, {
      tier_rank: 1,
      workspace_id: f.wsA.id,
    });
    const result = await setAvailable(f.po.client, f.wsB.id, p.offer.id, false);
    expect(result.error).toMatchObject({
      code: '42501',
      message: 'not_permitted',
    });
    expect(
      await db`select available from public.package_offers where id=${p.offer.id}`,
    ).toEqual([{ available: false }]);
  });
});

describe('T076 FR-023 hidden from new sales, history preserved', () => {
  it('retirement refuses new registration links for PO, WO and Sales and writes no issuance row or audit', async () => {
    const p = await publishedFixture(reg, {
      tier_rank: 1,
      price_minor: '1200',
      workspace_id: reg.wsA.id,
    });
    checked(
      await setAvailable(reg.po.client, p.offer.workspace_id, p.offer.id, true),
    );
    expect(
      checked(
        await issue(reg, reg.po.client, { package_version_id: p.versionId }),
      ),
    ).toEqual(expect.any(String));
    const issuedBefore =
      await db`select count(*)::int as n from public.audit_events where action='registration_link.issued' and workspace_id=${p.offer.workspace_id}`;
    const linksBefore =
      await db`select count(*)::int as n from public.registration_links where workspace_id=${p.offer.workspace_id}`;

    checked(
      await setAvailable(
        reg.po.client,
        p.offer.workspace_id,
        p.offer.id,
        false,
      ),
    );
    for (const role of ['po', 'woA', 'salesA'] as const) {
      const result = await issue(reg, reg.actors[role].client, {
        package_version_id: p.versionId,
      });
      expect(result.error, role).toMatchObject({
        code: '22023',
        message: 'stale_terms',
      });
    }
    expect(
      await db`select count(*)::int as n from public.audit_events where action='registration_link.issued' and workspace_id=${p.offer.workspace_id}`,
    ).toEqual(issuedBefore);
    expect(
      await db`select count(*)::int as n from public.registration_links where workspace_id=${p.offer.workspace_id}`,
    ).toEqual(linksBefore);
  });

  it('offer reads for PO, WO and Sales report the retired offer unavailable and keep its original version snapshot', async () => {
    const p = await publishedFixture(reg, { tier_rank: 1 });
    checked(
      await setAvailable(reg.po.client, p.offer.workspace_id, p.offer.id, true),
    );
    checked(
      await setAvailable(
        reg.po.client,
        p.offer.workspace_id,
        p.offer.id,
        false,
      ),
    );
    for (const role of ['po', 'woA', 'salesA'] as const) {
      const offer = checked(
        await reg.actors[role].client
          .from('package_offers')
          .select('id,workspace_id,available,current_version_id')
          .eq('id', p.offer.id)
          .single(),
      );
      expect(offer, role).toMatchObject({
        id: p.offer.id,
        workspace_id: p.offer.workspace_id,
        available: false,
        current_version_id: p.versionId,
      });
    }
    expect(
      await db`select id,version,name_en,price_minor::text from public.package_versions where offer_id=${p.offer.id} order by version`,
    ).toHaveLength(1);
  });

  it('retirement leaves existing client, assignment, issued-link and financial snapshots byte-identical', async () => {
    const ctx = await approvedClientContext();
    const [membership] =
      await db`select id from public.workspace_memberships where workspace_id=${ctx.wsA.id} and user_id=${ctx.trainerA.userId} and revoked_at is null`;
    await db`insert into public.client_trainer_assignments(
      workspace_id,client_id,trainer_user_id,assignment_source,assigned_by,workspace_membership_id
    ) values (
      ${ctx.wsA.id},${ctx.target.id},${ctx.trainerA.userId},'po_manual',${ctx.po.userId},${membership!.id}
    )`;

    const snapshot = async () => ({
      client: await db`select * from public.clients where id=${ctx.target.id}`,
      assignment:
        await db`select * from public.client_trainer_assignments where client_id=${ctx.target.id}`,
      link: await db`select workspace_id,id,package_version_id,created_by,created_at,expires_at,opened_at,consumed_at,price_minor::text,currency,duration_days,duration_months,commission_rate_bp from public.registration_links where id=${ctx.target.link}`,
      financial:
        await db`select workspace_id,id,client_id,registration_link_id,package_version_id,price_minor::text,currency,duration_days,duration_months,commission_rate_bp from public.subscriptions where client_id=${ctx.target.id}`,
    });

    const before = await snapshot();
    expect(before.client).toHaveLength(1);
    expect(before.assignment).toHaveLength(1);
    expect(before.link).toHaveLength(1);
    expect(before.financial).toHaveLength(1);
    expect(before.financial[0]).toMatchObject({
      price_minor: '1200',
      currency: 'USD',
      duration_days: 61,
      commission_rate_bp: 17,
      package_version_id: ctx.p.versionId,
    });

    checked(
      await setAvailable(
        ctx.po.client,
        ctx.p.offer.workspace_id,
        ctx.p.offer.id,
        false,
      ),
    );
    expect(await snapshot()).toEqual(before);
  });
});

/** A pending + approved client with a real issued-link and subscription graph. */
async function approvedClientContext() {
  const base = await registrationFixture();
  const link = checked(await issue(base, base.po.client)) as string;
  const withLink = { ...base, link };
  const connection = sql();
  let clientId: string;
  let clientUserId: string;
  try {
    await connection.begin(async (tx) => {
      const client = await pending(tx, withLink);
      clientId = client.id as string;
      clientUserId = client.auth_user_id as string;
    });
  } finally {
    await connection.end();
  }
  const target = { id: clientId!, userId: clientUserId!, link, rows: null };
  const approved = await call(
    base.po.client,
    'approve',
    request(withLink, target),
  );
  if (approved.status !== 'ok')
    throw new Error(`approval fixture failed: ${approved.status}`);
  return { ...base, target };
}
