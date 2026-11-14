import { randomBytes, createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  packagesFixture,
  publishedFixture,
  checked,
  sql,
  publish,
} from './packages-fixture';
export { checked, sql, publish } from './packages-fixture';
export const schedule = [
  { seq: 1, amount_minor: '400', due_offset_days: 2 },
  { seq: 2, amount_minor: '800', due_offset_days: 12 },
];
export const secret = () => {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: createHash('sha256').update(token).digest('hex') };
};
type RegistrationBaseFixture = Awaited<ReturnType<typeof packagesFixture>>;
async function setOfferAvailable(
  f: RegistrationBaseFixture,
  offerId: string,
  available: boolean,
  workspaceId?: string,
) {
  const targetWorkspace =
    workspaceId ??
    (
      await f.po.client
        .from('package_offers')
        .select('workspace_id')
        .eq('id', offerId)
        .single()
    ).data?.workspace_id;
  if (!targetWorkspace) throw new Error('Offer workspace fixture missing');
  checked(
    await f.po.client.rpc('set_package_offer_available', {
      workspace_id: targetWorkspace,
      offer_id: offerId,
      available,
    }),
  );
}
export async function assertInsertGuardEnabled(
  connection?: ReturnType<typeof sql>,
) {
  const db = connection ?? sql();
  try {
    const [row] =
      await db`select tgenabled from pg_trigger where tgrelid='public.registration_links'::regclass and tgname='registration_links_insert_guard'`;
    if (row?.tgenabled !== 'O')
      throw new Error('registration_links insert guard is not enabled');
  } finally {
    if (!connection) await db.end();
  }
}
export async function pgcryptoCheck() {
  const db = sql();
  try {
    const [extension] =
      await db`select e.extname,n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'`;
    const [vector] =
      await db`select encode(extensions.digest('abc','sha256'),'hex') as hex`;
    return {
      extension: extension?.extname ?? null,
      schema: extension?.nspname ?? null,
      vector: vector?.hex ?? null,
    };
  } finally {
    await db.end();
  }
}
async function offerFixture() {
  const f = await packagesFixture();
  const p = await publishedFixture(f, {
    tier_rank: 1,
    price_minor: '1200',
    workspace_id: f.wsA.id,
  });
  return { ...f, p };
}
export type RegistrationOfferFixture = Awaited<ReturnType<typeof offerFixture>>;
export async function registrationFixture() {
  const f = await offerFixture();
  await setOfferAvailable(f, f.p.offer.id, true);
  return f;
}
export type RegistrationFixture = Awaited<
  ReturnType<typeof registrationFixture>
>;
/**
 * A second available/current offer in the fixture's foreign workspace B. Used
 * by cross-scope issuance/read/commission parity tests; never mutates wsA.
 */
export async function crossWorkspaceOffer(f: RegistrationFixture) {
  const foreign = await publishedFixture(f, {
    tier_rank: 1,
    workspace_id: f.wsB.id,
    price_minor: '1200',
  });
  const versionId = checked(
    await publish(f, foreign.id, { tier_rank: 1, price_minor: '1200' }),
  ) as string;
  const offer = checked(
    await f.po.client
      .from('package_offers')
      .select('id,workspace_id,current_version_id')
      .eq('current_version_id', versionId)
      .single(),
  );
  if (offer.workspace_id !== f.wsB.id)
    throw new Error('cross-workspace offer fixture landed in the wrong scope');
  await setOfferAvailable(f, offer.id, true, f.wsB.id);
  return { versionId, offerId: offer.id };
}
/** Published offer that stays unavailable; never reuse a shared available offer. */
export async function unavailableOfferFixture() {
  const f = await offerFixture();
  if (f.p.offer.available)
    throw new Error('unavailable fixture offer is unexpectedly available');
  return f;
}
/** Current offer whose current_version_id is NULL (F9 permits NULL). */
export async function missingCurrentVersionFixture() {
  const f = await registrationFixture();
  const db = sql();
  try {
    await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
      await tx`update public.package_offers set current_version_id=null where workspace_id=${f.p.offer.workspace_id} and id=${f.p.offer.id}`;
    });
  } finally {
    await db.end();
  }
  return f;
}
/** A superseded (historical) current fixture. p.versionId stays the old version. */
export async function historicalVersionFixture() {
  const f = await registrationFixture();
  const historicalVersionId = f.p.versionId;
  const currentVersionId = checked(
    await publish(f, f.p.id, { tier_rank: 1, price_minor: '1300' }),
  ) as string;
  return { ...f, historicalVersionId, currentVersionId };
}
export function issue(
  f: RegistrationFixture,
  client: SupabaseClient = f.po.client,
  patch: Record<string, unknown> = {},
) {
  return assertInsertGuardEnabled().then(() =>
    client.rpc('issue_registration_link', {
      workspace_id: f.p.offer.workspace_id,
      package_version_id: f.p.versionId,
      token_hash: secret().hash,
      installments: null,
      ...patch,
    }),
  );
}
export async function backdated(
  f: RegistrationFixture,
  expires: string,
  opened: string | null = null,
  consumed: string | null = null,
) {
  const s = secret();
  const db = sql();
  try {
    const id = await db.begin(async (tx) => {
      await tx`alter table public.registration_links disable trigger registration_links_insert_guard`;
      let inserted = false;
      let failure: unknown;
      let linkId: string | undefined;
      try {
        const [row] =
          await tx`insert into public.registration_links(workspace_id,package_version_id,token_hash,created_by,created_at,expires_at,opened_at,consumed_at,price_minor,currency,duration_days,duration_months,commission_rate_bp) values (${f.p.offer.workspace_id},${f.p.versionId},${s.hash},${f.po.userId},${expires}::timestamptz-interval '24 hours',${expires},${opened},${consumed},1200,'USD',61,null,17) returning id`;
        linkId = row!.id as string;
        inserted = true;
        await tx`set constraints all immediate`;
      } catch (error) {
        failure = error;
      } finally {
        try {
          await tx`alter table public.registration_links enable trigger registration_links_insert_guard`;
        } catch (error) {
          // An aborted transaction restores trigger state on rollback; do not mask it.
          if (inserted && failure === undefined) throw error;
        }
      }
      if (failure) throw failure;
      return linkId!;
    });
    await assertInsertGuardEnabled(db);
    return { id, ...s };
  } finally {
    await db.end();
  }
}
