import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  anonClient,
  checked as harnessChecked,
  createStaff,
  sql,
  twoWorkspaceFixture,
} from './harness';
export { sql } from './harness';
export function checked<T>(result: {
  data: T;
  error: { message: string } | null;
}): NonNullable<T> {
  const data = harnessChecked(result);
  if (data === null || data === undefined)
    throw new Error('Missing fixture result');
  return data as NonNullable<T>;
}
export const syntheticTerms = {
  duration_months: null,
  duration_days: 61,
  name_ar: 'test-authored-ar',
  name_en: 'test-authored-en',
  price_minor: '9007199254740993',
  currency: 'XTS',
  commission_rate_bp: 17,
};
export async function packagesFixture() {
  const f = await twoWorkspaceFixture();
  const woB = await createStaff('workspace_owner', 'pkg-wo-b');
  const salesB = await createStaff('sales', 'pkg-sales-b');
  const revoked = await createStaff('sales', 'pkg-revoked');
  const noProfile = await createStaff(null, 'pkg-no-profile');
  const client = await createStaff(null, 'pkg-client');
  for (const [staff, workspace] of [
    [woB, f.wsB],
    [salesB, f.wsB],
    [revoked, f.wsA],
  ] as const)
    harnessChecked(
      await f.po.client.from('workspace_memberships').insert({
        user_id: staff.userId,
        workspace_id: workspace.id,
        granted_by: f.po.userId,
      }),
    );
  harnessChecked(
    await f.po.client
      .from('workspace_memberships')
      .update({ revoked_at: new Date().toISOString(), revoked_by: f.po.userId })
      .eq('user_id', revoked.userId)
      .eq('workspace_id', f.wsA.id),
  );
  const actors = {
    po: f.po,
    woA: f.woA,
    salesA: f.salesA,
    trainerA: f.trainerA,
    woB,
    salesB,
    trainerB: f.trainerB,
    revoked,
    noProfile,
    client,
    anon: { client: anonClient(), userId: null },
  };
  return { ...f, actors };
}
export type PackagesFixture = Awaited<ReturnType<typeof packagesFixture>>;
export async function createSynthetic(f: PackagesFixture) {
  const code = `test-pkg-${randomUUID()}`;
  const id = checked(
    await f.po.client.rpc('create_package', { code }),
  ) as string;
  return { id, code };
}
export async function publish(
  f: PackagesFixture,
  packageId: string,
  patch: Record<string, unknown>,
  client: SupabaseClient = f.po.client,
) {
  if (!Object.hasOwn(patch, 'tier_rank'))
    throw new Error(
      'Every package fixture publication requires an explicit tier_rank',
    );
  return client.rpc('publish_package_version', {
    workspace_id: f.wsA.id,
    package_id: packageId,
    ...syntheticTerms,
    ...patch,
  });
}
export async function publishedFixture(
  f: PackagesFixture,
  patch: Record<string, unknown>,
) {
  const p = await createSynthetic(f);
  const versionId = checked(await publish(f, p.id, patch)) as string;
  const offer = checked(
    await f.po.client
      .from('package_offers')
      .select(
        'id,workspace_id,current_version_id,available,duration_days,duration_months,tier_rank,package_id',
      )
      .eq('current_version_id', versionId)
      .single(),
  );
  return { ...p, versionId, offer };
}
// Each invocation opens its own DB connection/transaction, retaining signed user identity.
export async function independentPublish(
  f: PackagesFixture,
  packageId: string,
  tierRank: number,
  price: string,
  startAt?: string,
) {
  const connection = sql();
  try {
    return await connection.begin(async (tx) => {
      await tx`select set_config('role','authenticated',true)`;
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
      if (startAt)
        await tx`select pg_sleep(greatest(0,extract(epoch from (${startAt}::timestamptz-clock_timestamp()))))`;
      const [row] =
        await tx`select public.publish_package_version(${f.wsA.id}::uuid,${packageId}::uuid,null::smallint,61,${tierRank}::smallint,${syntheticTerms.name_ar},${syntheticTerms.name_en},${price}::bigint,'XTS',17) as id`;
      return row!.id as string;
    });
  } finally {
    await connection.end();
  }
}
