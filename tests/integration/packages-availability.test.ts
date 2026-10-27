import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checked,
  packagesFixture,
  publish,
  publishedFixture,
  sql,
  type PackagesFixture,
} from './packages-fixture';
const db = sql();
let f: PackagesFixture;
beforeAll(async () => {
  f = await packagesFixture();
});
afterAll(async () => {
  await db.end();
});
describe('package availability', () => {
  it('denies non-PO x workspace; missing and foreign offers are generic', async () => {
    const p = await publishedFixture(f);
    for (const [name, actor] of Object.entries(f.actors))
      for (const workspace_id of [f.wsA.id, f.wsB.id])
        if (name !== 'po') {
          expect(
            (
              await actor.client.rpc('set_package_offer_available', {
                workspace_id,
                offer_id: p.offer.id,
                available: true,
              })
            ).error?.code,
            name,
          ).toBe('42501');
        }
    for (const [workspace_id, offer_id] of [
      [f.wsB.id, p.offer.id],
      [f.wsA.id, randomUUID()],
      [randomUUID(), p.offer.id],
    ])
      expect(
        (
          await f.po.client.rpc('set_package_offer_available', {
            workspace_id,
            offer_id,
            available: true,
          })
        ).error,
      ).toMatchObject({ code: '42501', message: 'not_permitted' });
    expect(
      await db`select id from public.audit_events where target_id=${p.offer.id}`,
    ).toHaveLength(0);
  });
  it('confirms false -> true -> false with exact events, no-op retry and unchanged history', async () => {
    const p = await publishedFixture(f);
    expect(p.offer.available).toBe(false);
    const before =
      await db`select * from public.package_versions where offer_id=${p.offer.id}`;
    const toggle = (available: boolean) =>
      f.po.client.rpc('set_package_offer_available', {
        workspace_id: f.wsA.id,
        offer_id: p.offer.id,
        available,
      });
    for (const state of [false, true, true, false, false])
      expect(checked(await toggle(state))).toBe(p.offer.id);
    const events =
      await db`select action,actor_user_id,workspace_id,details from public.audit_events where target_id=${p.offer.id} order by occurred_at,id`;
    expect(events).toEqual(
      [true, false].map((available) => ({
        action: 'package_offer.availability_changed',
        actor_user_id: f.po.userId,
        workspace_id: f.wsA.id,
        details: { available },
      })),
    );
    expect(
      await db`select * from public.package_versions where offer_id=${p.offer.id}`,
    ).toEqual(before);
    const [offer] =
      await db`select current_version_id,duration_days,duration_months,available from public.package_offers where id=${p.offer.id}`;
    expect(offer).toEqual({
      current_version_id: p.versionId,
      duration_days: 61,
      duration_months: null,
      available: false,
    });
  });
  it('requires explicit boolean; no silent re-enable on publication', async () => {
    const p = await publishedFixture(f);
    expect(
      (
        await f.po.client.rpc('set_package_offer_available', {
          workspace_id: f.wsA.id,
          offer_id: p.offer.id,
          available: null,
        })
      ).error?.code,
    ).toBe('22023');
    for (const available of [true, false]) {
      checked(
        await f.po.client.rpc('set_package_offer_available', {
          workspace_id: f.wsA.id,
          offer_id: p.offer.id,
          available,
        }),
      );
      checked(await publish(f, p.id, { price_minor: available ? '20' : '21' }));
      const [offer] =
        await db`select available from public.package_offers where id=${p.offer.id}`;
      expect(offer?.available).toBe(available);
    }
  });
  it('serializes publication with toggle without losing either state', async () => {
    const p = await publishedFixture(f);
    const results = await Promise.all([
      publish(f, p.id, { price_minor: '22' }),
      f.po.client.rpc('set_package_offer_available', {
        workspace_id: f.wsA.id,
        offer_id: p.offer.id,
        available: true,
      }),
    ]);
    results.forEach(checked);
    const [offer] =
      await db`select available,current_version_id from public.package_offers where id=${p.offer.id}`;
    expect(offer).toEqual({
      available: true,
      current_version_id: results[0]!.data,
    });
  });
  it('audit failure rolls back availability', async () => {
    const p = await publishedFixture(f);
    await expect(
      db.begin(async (tx) => {
        await tx`create function pg_temp.reject_availability_audit() returns trigger language plpgsql as $$ begin raise exception 'test_audit_failure'; end $$`;
        await tx`create trigger test_availability_audit_failure before insert on public.audit_events for each row execute function pg_temp.reject_availability_audit()`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId })},true)`;
        await tx`select public.set_package_offer_available(${f.wsA.id}::uuid,${p.offer.id}::uuid,true)`;
        throw new Error('audit_trigger_missing');
      }),
    ).rejects.toMatchObject({ message: 'test_audit_failure' });
    const [offer] =
      await db`select available,current_version_id from public.package_offers where id=${p.offer.id}`;
    expect(offer).toEqual({
      available: false,
      current_version_id: p.versionId,
    });
    expect(
      await db`select id from public.audit_events where target_id=${p.offer.id}`,
    ).toHaveLength(0);
  });
});
