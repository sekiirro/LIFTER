import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSynthetic,
  packagesFixture,
  sql,
  type PackagesFixture,
} from './packages-fixture';

const db = sql();
const cleanup = readFileSync(
  'supabase/cleanup/20261111_t077_legacy_package_offers.sql',
  'utf8',
);
let f: PackagesFixture;

beforeAll(async () => {
  f = await packagesFixture();
});

afterAll(async () => {
  await db.end();
});

describe('T077 verified legacy offer cleanup', () => {
  it('deletes only a safe verified test offer and restores the no-delete trigger', async () => {
    const pkg = await createSynthetic(f);
    const offerId = randomUUID();
    await db`
      insert into public.package_offers(id,workspace_id,package_id,duration_days,duration_months,tier_rank)
      values (${offerId},${f.wsA.id},${pkg.id},777,null,1)
    `;

    await db.unsafe(cleanup);

    const remaining = await db`
      select id from public.package_offers where id=${offerId}
    `;
    const [trigger] = await db`
      select tgenabled from pg_trigger
      where tgrelid='public.package_offers'::regclass and tgname='package_offers_no_delete'
    `;
    expect(remaining).toEqual([]);
    expect(trigger?.tgenabled).toBe('O');

    const guardedOfferId = randomUUID();
    await db`
      insert into public.package_offers(id,workspace_id,package_id,duration_days,duration_months,tier_rank)
      values (${guardedOfferId},${f.wsA.id},${pkg.id},779,null,2)
    `;
    await expect(
      db`delete from public.package_offers where id=${guardedOfferId}`,
    ).rejects.toThrow();
    expect(
      await db`select id from public.package_offers where id=${guardedOfferId}`,
    ).toHaveLength(1);
  });

  it('refuses a non-test offer atomically and leaves safe candidates intact', async () => {
    const safeOfferId = randomUUID();
    const unsafeOfferId = randomUUID();
    const safePackageId = randomUUID();
    const unsafePackageId = randomUUID();
    const cleanupAttempt = db.begin(async (tx) => {
      await tx`
        insert into public.packages(id,code,created_by)
        values (${safePackageId},${'test-pkg-' + randomUUID()},${f.po.userId}),
               (${unsafePackageId},${'legacy-pkg-' + randomUUID()},${f.po.userId})
      `;
      await tx`
        insert into public.package_offers(id,workspace_id,package_id,duration_days,duration_months,tier_rank)
        values (${safeOfferId},${f.wsA.id},${safePackageId},777,null,1),
               (${unsafeOfferId},${f.wsA.id},${unsafePackageId},778,null,2)
      `;
      await tx.unsafe(cleanup);
    });
    await expect(cleanupAttempt).rejects.toThrow(
      'cleanup_refused_unverified_offer',
    );
    const retained = await db`
      select id from public.package_offers where id in (${safeOfferId},${unsafeOfferId})
    `;
    const packages = await db`
      select id from public.packages where id in (${safePackageId},${unsafePackageId})
    `;
    expect(retained).toEqual([]);
    expect(packages).toEqual([]);
  });

  it('refuses to delete a test offer referenced by audit and preserves that record', async () => {
    const pkg = await createSynthetic(f);
    const offerId = randomUUID();
    await db`
      insert into public.package_offers(id,workspace_id,package_id,duration_days,duration_months,tier_rank)
      values (${offerId},${f.wsA.id},${pkg.id},777,null,1)
    `;
    await db`
      insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
      values (${f.po.userId},'package_offer.test_fixture','package_offers',${offerId},${f.wsA.id},'{}'::jsonb)
    `;
    const beforeAudit = await db`
      select id,action,target_table,target_id,details
      from public.audit_events where target_table='package_offers' and target_id=${offerId}
    `;

    await db.unsafe(cleanup);

    const [offer] = await db`
      select id,current_version_id,tier_rank
      from public.package_offers where id=${offerId}
    `;
    const afterAudit = await db`
      select id,action,target_table,target_id,details
      from public.audit_events where target_table='package_offers' and target_id=${offerId}
    `;
    expect(offer).toEqual({
      id: offerId,
      current_version_id: null,
      tier_rank: 1,
    });
    expect(afterAudit).toEqual(beforeAudit);
  });
});
