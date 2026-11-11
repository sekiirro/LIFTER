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
