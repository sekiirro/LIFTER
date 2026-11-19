import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checked,
  packagesFixture,
  publish,
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

const readNames = (client: typeof f.po.client, workspaceId: string) =>
  client.rpc('get_package_tier_names', { workspace_id: workspaceId });
const resolved = async (
  client: typeof f.po.client,
  workspaceId: string,
): Promise<Record<string, string | null>> => {
  const rows = checked(await readNames(client, workspaceId)) as {
    tier_rank: number;
    locale: string;
    name: string | null;
  }[];
  const map: Record<string, string | null> = {};
  for (const row of rows) map[`${row.tier_rank}/${row.locale}`] = row.name;
  return map;
};

describe('package tier display names (T078)', () => {
  it('resolves no stored rows before any rename so defaults stay authoritative', async () => {
    const rows = checked(await readNames(f.po.client, f.wsA.id)) as unknown[];
    expect(rows).toHaveLength(6);
    const map = await resolved(f.po.client, f.wsA.id);
    expect(Object.keys(map).sort()).toEqual(
      ['1/ar', '1/en', '2/ar', '2/en', '3/ar', '3/en'].sort(),
    );
    for (const value of Object.values(map)) expect(value).toBeNull();
    expect(
      await db`select count(*)::int as count from public.package_tier_names`,
    ).toEqual([{ count: 0 }]);
    expect(
      await db`select count(*)::int as count from public.package_tier_name_overrides`,
    ).toEqual([{ count: 0 }]);
  });

  it('lets the PO rename a tier globally per locale for every workspace', async () => {
    const first = await f.po.client.rpc('set_package_tier_name', {
      tier_rank: 2,
      locale: 'en',
      name: 'Global Golden Tier',
    });
    expect(first.error).toBeNull();
    const after = await f.po.client.rpc('set_package_tier_name', {
      tier_rank: 2,
      locale: 'en',
      name: 'Global Gold v2',
    });
    expect(after.error).toBeNull();
    expect(
      await db`select tier_rank,locale,name from public.package_tier_names order by tier_rank,locale`,
    ).toEqual([{ tier_rank: 2, locale: 'en', name: 'Global Gold v2' }]);
    const wsA = await resolved(f.salesA.client, f.wsA.id);
    const wsB = await resolved(f.trainerB.client, f.wsB.id);
    for (const map of [wsA, wsB]) {
      expect(map['2/en']).toBe('Global Gold v2');
      expect(map['2/ar']).toBeNull();
      expect(map['1/en']).toBeNull();
      expect(map['3/en']).toBeNull();
    }
  });

  it('denies the global rename for every non-PO identity', async () => {
    for (const [name, actor] of Object.entries(f.actors))
      if (name !== 'po') {
        const r = await actor.client.rpc('set_package_tier_name', {
          tier_rank: 1,
          locale: 'ar',
          name: `denied-${name}`,
        });
        expect(r.error?.code, name).toBe('42501');
        if (name !== 'anon')
          expect(r.error?.message, name).toBe('not_permitted');
      }
    expect(
      await db`select count(*)::int as count from public.package_tier_names where tier_rank=1 and locale='ar'`,
    ).toEqual([{ count: 0 }]);
  });

  it('rejects invalid global rename inputs after the PO wall', async () => {
    for (const patch of [
      { tier_rank: 0, locale: 'en', name: 'nope' },
      { tier_rank: 4, locale: 'en', name: 'nope' },
      { tier_rank: 2, locale: 'fr', name: 'nope' },
      { tier_rank: 2, locale: 'en', name: '   ' },
      { tier_rank: 2, locale: 'en', name: '' },
      { tier_rank: null, locale: 'en', name: 'nope' },
      { tier_rank: 2, locale: null, name: 'nope' },
      { tier_rank: 2, locale: 'en', name: null },
      { tier_rank: 2, locale: 'en', name: 'x'.repeat(121) },
      { tier_rank: 2, locale: 'en', name: '😀'.repeat(121) },
    ]) {
      const r = await f.po.client.rpc('set_package_tier_name', patch);
      expect(r.error?.code).toBe('22023');
      expect(r.error?.message).toBe('invalid_input');
    }
  });

  it('lets a Workspace Owner override a tier name only inside their own workspace', async () => {
    const own = await f.woA.client.rpc('set_package_tier_name_override', {
      workspace_id: f.wsA.id,
      tier_rank: 2,
      locale: 'en',
      name: 'WSA Gold Special',
    });
    expect(own.error).toBeNull();
    const wsA = await resolved(f.woA.client, f.wsA.id);
    const wsB = await resolved(f.trainerB.client, f.wsB.id);
    expect(wsA['2/en']).toBe('WSA Gold Special');
    expect(wsB['2/en']).toBe('Global Gold v2');
    expect(
      await db`select workspace_id,tier_rank,locale,name from public.package_tier_name_overrides`,
    ).toEqual([
      {
        workspace_id: f.wsA.id,
        tier_rank: 2,
        locale: 'en',
        name: 'WSA Gold Special',
      },
    ]);
  });

  it('lets the PO set a workspace override in any workspace', async () => {
    const name = '😀'.repeat(120);
    const existing = await f.po.client.rpc('set_package_tier_name_override', {
      workspace_id: f.wsA.id,
      tier_rank: 2,
      locale: 'en',
      name: 'PO replaces workspace override',
    });
    expect(existing.error).toBeNull();
    expect((await resolved(f.woA.client, f.wsA.id))['2/en']).toBe(
      'PO replaces workspace override',
    );
    const result = await f.po.client.rpc('set_package_tier_name_override', {
      workspace_id: f.wsB.id,
      tier_rank: 3,
      locale: 'en',
      name,
    });
    expect(result.error).toBeNull();
    expect((await resolved(f.trainerB.client, f.wsB.id))['3/en']).toBe(name);
    expect(
      await db`select workspace_id,tier_rank,locale,name from public.package_tier_name_overrides where workspace_id=${f.wsB.id}`,
    ).toEqual([{ workspace_id: f.wsB.id, tier_rank: 3, locale: 'en', name }]);
  });

  it('denies overrides for foreign workspaces, Sales, Trainer and anonymous', async () => {
    const cases: [string, typeof f.po.client, string][] = [
      ['woA->wsB', f.woA.client, f.wsB.id],
      ['woB->wsA', f.actors.woB.client, f.wsA.id],
      ['salesA->wsA', f.salesA.client, f.wsA.id],
      ['trainerA->wsA', f.trainerA.client, f.wsA.id],
      ['salesB->wsB', f.actors.salesB.client, f.wsB.id],
      ['trainerB->wsB', f.trainerB.client, f.wsB.id],
      ['revoked->wsA', f.actors.revoked.client, f.wsA.id],
      ['noProfile->wsA', f.actors.noProfile.client, f.wsA.id],
      ['client->wsA', f.actors.client.client, f.wsA.id],
      ['anon->wsA', f.actors.anon.client, f.wsA.id],
      ['woA->missing', f.woA.client, randomUUID()],
    ];
    for (const [name, client, workspaceId] of cases) {
      const r = await client.rpc('set_package_tier_name_override', {
        workspace_id: workspaceId,
        tier_rank: 3,
        locale: 'ar',
        name: `denied-${name}`,
      });
      expect(r.error?.code, name).toBe('42501');
      if (!name.startsWith('anon'))
        expect(r.error?.message, name).toBe('not_permitted');
    }
    expect(
      await db`select count(*)::int as count from public.package_tier_name_overrides where tier_rank=3 and name like 'denied-%'`,
    ).toEqual([{ count: 0 }]);
  });

  it('rejects invalid override inputs after the WO wall', async () => {
    for (const patch of [
      { tier_rank: 5, locale: 'en', name: 'nope' },
      { tier_rank: 2, locale: 'de', name: 'nope' },
      { tier_rank: 2, locale: 'en', name: ' \t ' },
      { tier_rank: 2, locale: 'en', name: 'x'.repeat(121) },
    ]) {
      const r = await f.woA.client.rpc('set_package_tier_name_override', {
        workspace_id: f.wsA.id,
        ...patch,
      });
      expect(r.error?.code).toBe('22023');
      expect(r.error?.message).toBe('invalid_input');
    }
  });

  it('enforces the 1–120 name constraint directly in both tables', async () => {
    const longName = '😀'.repeat(121);
    const validName = '😀'.repeat(120);
    await db`insert into public.package_tier_names(tier_rank,locale,name,updated_by) values (1,'en',${validName},${f.po.userId})`;
    await db`insert into public.package_tier_name_overrides(workspace_id,tier_rank,locale,name,updated_by) values (${f.wsA.id},1,'en',${validName},${f.po.userId})`;
    await expect(
      db`insert into public.package_tier_names(tier_rank,locale,name,updated_by) values (1,'en',${longName},${f.po.userId})`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db`insert into public.package_tier_name_overrides(workspace_id,tier_rank,locale,name,updated_by) values (${f.wsA.id},1,'en',${longName},${f.po.userId})`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('scopes the resolved read to active staff of that workspace', async () => {
    const expectations: Record<string, boolean> = {
      po: true,
      woA: false,
      salesA: false,
      trainerA: false,
      woB: true,
      salesB: true,
      trainerB: true,
      revoked: false,
      noProfile: false,
      client: false,
      anon: false,
    };
    for (const [name, actor] of Object.entries(f.actors)) {
      const r = await actor.client.rpc('get_package_tier_names', {
        workspace_id: f.wsB.id,
      });
      if (expectations[name]) expect(r.error, name).toBeNull();
      else expect(r.error?.code, name).toBe('42501');
    }
    expect(
      (
        await f.salesA.client.rpc('get_package_tier_names', {
          workspace_id: randomUUID(),
        })
      ).error?.code,
    ).toBe('42501');
    expect(
      (
        await f.salesA.client.rpc('get_package_tier_names', {
          workspace_id: null,
        })
      ).error?.code,
    ).toBe('42501');
  });

  it('changes no rank, duration, price, currency or version terms row', async () => {
    const category = checked(
      await f.po.client.rpc('create_package_category', {
        workspace_id: f.wsA.id,
        market: 'International',
        category_type: 'Year-round',
      }),
    ) as string;
    checked(await publish(f, category, { tier_rank: 1 }));
    checked(
      await publish(f, category, {
        tier_rank: 1,
        price_minor: '9007199254740994',
      }),
    );
    checked(
      await publish(f, category, {
        tier_rank: 3,
        name_ar: 'terms-ar',
        name_en: 'terms-en',
      }),
    );
    const beforePackages =
      await db`select * from public.packages where workspace_id in (${f.wsA.id},${f.wsB.id}) order by id`;
    const beforeOffers =
      await db`select * from public.package_offers where workspace_id in (${f.wsA.id},${f.wsB.id}) order by id`;
    const beforeVersions = await db`
      select id,workspace_id,offer_id,version,name_ar,name_en,price_minor::text as price_minor,currency,
        commission_rate_bp,duration_days,duration_months,published_by,market,type
      from public.package_versions where workspace_id in (${f.wsA.id},${f.wsB.id}) order by id`;
    const beforeAudit =
      await db`select count(*)::int as count from public.audit_events where actor_user_id in (${f.po.userId},${f.woA.userId},${f.actors.woB.userId})`;

    expect(
      (
        await f.po.client.rpc('set_package_tier_name', {
          tier_rank: 1,
          locale: 'ar',
          name: 'Global Silver AR',
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await f.actors.woB.client.rpc('set_package_tier_name_override', {
          workspace_id: f.wsB.id,
          tier_rank: 3,
          locale: 'en',
          name: 'WSB Platinum Label',
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await f.po.client.rpc('set_package_tier_name_override', {
          workspace_id: f.wsA.id,
          tier_rank: 2,
          locale: 'en',
          name: 'PO Workspace Label',
        })
      ).error,
    ).toBeNull();

    expect(
      await db`select * from public.packages where workspace_id in (${f.wsA.id},${f.wsB.id}) order by id`,
    ).toEqual(beforePackages);
    expect(
      await db`select * from public.package_offers where workspace_id in (${f.wsA.id},${f.wsB.id}) order by id`,
    ).toEqual(beforeOffers);
    expect(
      await db`
      select id,workspace_id,offer_id,version,name_ar,name_en,price_minor::text as price_minor,currency,
        commission_rate_bp,duration_days,duration_months,published_by,market,type
      from public.package_versions where workspace_id in (${f.wsA.id},${f.wsB.id}) order by id`,
    ).toEqual(beforeVersions);
    expect(
      await db`select count(*)::int as count from public.audit_events where actor_user_id in (${f.po.userId},${f.woA.userId},${f.actors.woB.userId})`,
    ).toEqual(beforeAudit);
    expect(
      await db`select count(*)::int as count from public.audit_events where target_table in ('package_tier_names','package_tier_name_overrides')`,
    ).toEqual([{ count: 0 }]);
    const wsB = await resolved(f.trainerB.client, f.wsB.id);
    expect(wsB['3/en']).toBe('WSB Platinum Label');
    const wsA = await resolved(f.salesA.client, f.wsA.id);
    expect(wsA['1/ar']).toBe('Global Silver AR');
    expect(wsA['3/en']).toBeNull();
  });

  it('keeps rank and locale identity immutable and blocks direct table edits and deletes', async () => {
    await expect(
      db`update public.package_tier_names set tier_rank = 3 where tier_rank = 2`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db`update public.package_tier_names set locale = 'ar' where locale = 'en'`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db`update public.package_tier_name_overrides set workspace_id = ${f.wsB.id} where workspace_id = ${f.wsA.id}`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db`update public.package_tier_names set name = 'direct-edit' where tier_rank = 2`,
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db`update public.package_tier_name_overrides set name = 'direct-edit'`,
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db`delete from public.package_tier_names`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db`delete from public.package_tier_name_overrides`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db`truncate table public.package_tier_names`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db`truncate table public.package_tier_name_overrides`,
    ).rejects.toMatchObject({ code: '23514' });
  });
});
