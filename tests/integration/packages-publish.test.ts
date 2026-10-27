import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checked,
  createSynthetic,
  independentPublish,
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
describe('package publication', () => {
  it('creates once and audits exact code with global PO attribution', async () => {
    const p = await createSynthetic(f);
    expect(
      checked(await f.po.client.rpc('create_package', { code: p.code })),
    ).toBe(p.id);
    const events =
      await db`select actor_user_id,workspace_id,details from public.audit_events where target_id=${p.id}`;
    expect(events).toEqual([
      {
        actor_user_id: f.po.userId,
        workspace_id: null,
        details: { code: p.code },
      },
    ]);
  });
  it('denies create globally for every non-PO including no profile and anon', async () => {
    for (const [name, actor] of Object.entries(f.actors))
      if (name !== 'po') {
        const r = await actor.client.rpc('create_package', {
          code: `test-pkg-${randomUUID()}`,
        });
        expect(r.error?.code, name).toBe('42501');
      }
  });
  it('enforces role x own/foreign publication before target lookup', async () => {
    const p = await createSynthetic(f);
    for (const [name, actor] of Object.entries(f.actors))
      for (const workspace_id of [f.wsA.id, f.wsB.id]) {
        const r = await publish(f, p.id, { workspace_id }, actor.client);
        if (name === 'po') expect(r.error).toBeNull();
        else expect(r.error?.code, `${name}/${workspace_id}`).toBe('42501');
      }
    for (const patch of [
      { workspace_id: randomUUID() },
      { package_id: randomUUID() },
      { package_id: null },
      { workspace_id: null },
    ])
      expect((await publish(f, p.id, patch)).error).toMatchObject({
        code: '42501',
        message: 'not_permitted',
      });
  });
  it('R1: current replay is no-op; v1 -> v2 -> v1 terms appends v3 and moves current', async () => {
    const p = await publishedFixture(f);
    const replay = checked(await publish(f, p.id));
    expect(replay).toBe(p.versionId);
    const v2 = checked(
      await publish(f, p.id, { price_minor: '9007199254740994' }),
    );
    expect(v2).not.toBe(p.versionId);
    const v3 = checked(await publish(f, p.id));
    expect(v3).not.toBe(p.versionId);
    expect(v3).not.toBe(v2);
    expect(checked(await publish(f, p.id))).toBe(v3);
    const versions =
      await db`select id,version,price_minor::text from public.package_versions where offer_id=${p.offer.id} order by version`;
    expect(versions).toEqual([
      { id: p.versionId, version: 1, price_minor: '9007199254740993' },
      { id: v2, version: 2, price_minor: '9007199254740994' },
      { id: v3, version: 3, price_minor: '9007199254740993' },
    ]);
    const [offer] =
      await db`select current_version_id,available from public.package_offers where id=${p.offer.id}`;
    expect(offer).toEqual({ current_version_id: v3, available: false });
    const events =
      await db`select action,details,details->>'price_minor' as exact_price from public.audit_events where target_id in (select id from public.package_versions where offer_id=${p.offer.id}) order by (details->>'version')::int`;
    expect(events).toHaveLength(3);
    for (let n = 0; n < 3; n++)
      expect(events[n]).toEqual({
        action: 'package_version.published',
        exact_price: versions[n]!.price_minor,
        details: {
          offer_id: p.offer.id,
          package_id: p.id,
          version: n + 1,
          price_minor: Number(versions[n]!.price_minor),
          currency: 'XTS',
          commission_rate_bp: 17,
          duration_days: 61,
        },
      });
    expect(
      await db`select id from public.audit_events where target_id=${p.offer.id}`,
    ).toHaveLength(0);
  });
  it.each([
    'name_ar',
    'name_en',
    'currency',
    'commission_rate_bp',
    'price_minor',
  ] as const)('includes %s in replay identity', async (field) => {
    const p = await publishedFixture(f);
    const values = {
      name_ar: 'test-revised-ar',
      name_en: 'test-revised-en',
      currency: 'XXX',
      commission_rate_bp: 0,
      price_minor: '1',
    };
    expect(
      checked(await publish(f, p.id, { [field]: values[field] })),
    ).not.toBe(p.versionId);
  });
  it('keeps fixed representation and immutable copied duration', async () => {
    const p = await publishedFixture(f, {
      duration_months: 3,
      duration_days: 90,
    });
    expect(
      (await publish(f, p.id, { duration_months: null, duration_days: 90 }))
        .error?.code,
    ).toBe('22023');
    const [v] =
      await db`select duration_days,duration_months,published_by from public.package_versions where id=${p.versionId}`;
    expect(v).toEqual({
      duration_days: 90,
      duration_months: 3,
      published_by: f.po.userId,
    });
  });
  it.each([
    ...[null, '', ' '.repeat(4), '\t\n', 'x'.repeat(121)].flatMap((v) => [
      { name_ar: v },
      { name_en: v },
    ]),
    ...[null, '0', '-1', '1.1', '9223372036854775808'].map((price_minor) => ({
      price_minor,
    })),
    ...[null, 'xts', 'XT', 'XTSX', ' XTS'].map((currency) => ({ currency })),
    ...[null, -1, 10001, 1.5].map((commission_rate_bp) => ({
      commission_rate_bp,
    })),
    ...[null, 0, -1, 1.5, 2147483648].map((duration_days) => ({
      duration_days,
    })),
    { duration_months: 2, duration_days: 60 },
    { duration_months: 4, duration_days: 120 },
    { duration_months: 1, duration_days: 31 },
  ])(
    'rejects DB field boundary %# with no partial publication',
    async (patch) => {
      const p = await createSynthetic(f);
      const result = await publish(f, p.id, patch);
      expect(result.error).not.toBeNull();
      expect(
        await db`select id from public.package_offers where package_id=${p.id}`,
      ).toHaveLength(0);
    },
  );
  it('accepts every preset, custom equivalents, Unicode name bounds and bigint ceiling', async () => {
    const p = await createSynthetic(f);
    for (const m of [1, 3, 6, 8, 12])
      expect(
        (
          await publish(f, p.id, {
            duration_months: m,
            duration_days: m * 30,
            price_minor: '9223372036854775807',
            commission_rate_bp: 0,
            name_ar: '\u{1f600}'.repeat(120),
            name_en: 'x',
          })
        ).error,
      ).toBeNull();
    for (const d of [1, 60, 120, 2147483647])
      expect((await publish(f, p.id, { duration_days: d })).error).toBeNull();
  });
  it('serializes independent first/later distinct publications and identical calls', async () => {
    const p = await createSynthetic(f);
    const race = (prices: string[]) => {
      const startAt = new Date(Date.now() + 500).toISOString();
      return Promise.all(
        prices.map((price) => independentPublish(f, p.id, price, startAt)),
      );
    };
    const first = await race(['11', '12', '13', '14']);
    expect(new Set(first).size).toBe(4);
    const later = await race(['21', '22', '23', '24']);
    expect(new Set(later).size).toBe(4);
    const same = await race(Array.from({ length: 6 }, () => '31'));
    expect(new Set(same).size).toBe(1);
    const versions =
      await db`select version from public.package_versions where offer_id in (select id from public.package_offers where package_id=${p.id}) order by version`;
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const events =
      await db`select id from public.audit_events where target_id in (select id from public.package_versions where offer_id in (select id from public.package_offers where package_id=${p.id}))`;
    expect(events).toHaveLength(9);
  });
  it('all DML roles hit update/delete guards independently of grants', async () => {
    const p = await publishedFixture(f);
    checked(await publish(f, p.id, { price_minor: '8' }));
    for (const role of ['postgres', 'service_role', 'authenticated', 'anon'])
      for (const table of ['packages', 'package_versions'])
        for (const op of ['update', 'delete']) {
          const id = table === 'packages' ? p.id : p.versionId;
          await expect(
            db.begin(async (tx) => {
              await tx.unsafe(
                `grant select,update,delete on public.${table} to ${role}`,
              );
              // Service-role and postgres bypass RLS. Authenticated/anon RLS can reject or filter before guards.
              await tx`select set_config('role',${role},true)`;
              if (op === 'update')
                await tx.unsafe(
                  `update public.${table} set id=id where id=$1`,
                  [id],
                );
              else
                await tx.unsafe(`delete from public.${table} where id=$1`, [
                  id,
                ]);
              throw new Error('filtered_by_rls');
            }),
          ).rejects.toSatisfy((e: { code?: string; message: string }) =>
            role === 'postgres' || role === 'service_role'
              ? e.code === '23514'
              : e.code === '23514' ||
                e.code === '42501' ||
                e.message === 'filtered_by_rls',
          );
        }
  });
  it('truncate guards raise 23514 even for postgres/service_role after removing incoming FKs in rollback', async () => {
    for (const table of ['packages', 'package_offers', 'package_versions'])
      for (const role of [
        'postgres',
        'service_role',
        'authenticated',
        'anon',
      ]) {
        await expect(
          db.begin(async (tx) => {
            const constraints =
              await tx`select conrelid::regclass::text as tbl,conname from pg_constraint where contype='f' and confrelid=${`public.${table}`}::regclass`;
            for (const c of constraints)
              await tx.unsafe(
                `alter table ${c.tbl} drop constraint "${c.conname}"`,
              );
            await tx.unsafe(`grant truncate on public.${table} to ${role}`);
            await tx`select set_config('role',${role},true)`;
            await tx.unsafe(`truncate public.${table}`);
            throw new Error('truncate_guard_missing');
          }),
        ).rejects.toMatchObject({ code: '23514' });
      }
  });
  it('rejects cross-workspace FKs, same-workspace wrong-offer pointer and duration snapshot mismatches', async () => {
    const p = await publishedFixture(f);
    const q = await publishedFixture(f);
    const foreign = await publishedFixture(f, { workspace_id: f.wsB.id });
    for (const versionId of [q.versionId, foreign.versionId])
      await expect(
        db.begin(async (tx) => {
          await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId })},true)`;
          await tx`update public.package_offers set current_version_id=${versionId} where id=${p.offer.id}`;
          throw new Error('pointer_fk_missing');
        }),
      ).rejects.toMatchObject({ code: '23503' });
    for (const patch of [
      { workspace: f.wsB.id, days: 61 },
      { workspace: f.wsA.id, days: 62 },
    ])
      await expect(
        db.begin(async (tx) => {
          await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId })},true)`;
          await tx`insert into public.package_versions(workspace_id,offer_id,version,name_ar,name_en,price_minor,currency,commission_rate_bp,duration_days,duration_months,published_by) values (${patch.workspace},${p.offer.id},99,'test-ar','test-en',1,'XTS',0,${patch.days},null,${f.po.userId})`;
          throw new Error('snapshot_guard_missing');
        }),
      ).rejects.toMatchObject({ code: '23514' });
    for (const patch of [
      { id: randomUUID() },
      { workspace_id: f.wsB.id },
      { package_id: q.id },
      { duration_days: 62 },
      { duration_months: 1 },
    ])
      await expect(
        db.begin(async (tx) => {
          await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId })},true)`;
          await tx`update public.package_offers set ${tx(patch)} where id=${p.offer.id}`;
          throw new Error('identity_guard_missing');
        }),
      ).rejects.toMatchObject({ code: '23514' });
  });
  it('rolls back first/later publication when audit insertion fails, preserving legacy audit body', async () => {
    const p = await publishedFixture(f);
    const q = await createSynthetic(f);
    for (const packageId of [p.id, q.id])
      await expect(
        db.begin(async (tx) => {
          await tx`create function pg_temp.reject_package_audit() returns trigger language plpgsql as $$ begin raise exception 'test_audit_failure'; end $$`;
          await tx`create trigger test_package_audit_failure before insert on public.audit_events for each row execute function pg_temp.reject_package_audit()`;
          await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId })},true)`;
          await tx`select public.publish_package_version(${f.wsA.id}::uuid,${packageId}::uuid,null::smallint,61,'test-ar','test-en',2,'XTS',0)`;
          throw new Error('audit_trigger_missing');
        }),
      ).rejects.toMatchObject({ message: 'test_audit_failure' });
    expect(
      await db`select id from public.package_offers where package_id=${q.id}`,
    ).toHaveLength(0);
    const [offer] =
      await db`select current_version_id from public.package_offers where id=${p.offer.id}`;
    expect(offer?.current_version_id).toBe(p.versionId);
    const [fn] =
      await db`select pg_get_functiondef('app_private.audit_row_change()'::regprocedure) as body`;
    for (const event of [
      'workspace.created',
      'staff_role.assigned',
      'membership.granted',
      'job.dead_lettered',
      'recovery_link.generated',
    ])
      expect(fn?.body).toContain(event);
  });
});
