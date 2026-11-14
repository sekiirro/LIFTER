import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { packagesFixture, sql, type PackagesFixture } from './packages-fixture';
import { admin } from './harness';

const db = sql();
let f: PackagesFixture;
const category = (workspaceId: string, market: string, type: string) =>
  f.po.client.rpc('create_package_category', {
    workspace_id: workspaceId,
    market,
    category_type: type,
  });
const publish = (workspaceId: string, packageId: string, currency: string) =>
  f.po.client.rpc('publish_package_version', {
    workspace_id: workspaceId,
    package_id: packageId,
    duration_months: null,
    duration_days: 61,
    tier_rank: 1,
    name_ar: 'test-authored-ar',
    name_en: 'test-authored-en',
    price_minor: '9007199254740993',
    currency,
    commission_rate_bp: 17,
  });

beforeAll(async () => {
  f = await packagesFixture();
});
afterAll(async () => {
  await db.end();
});

describe('package market and type identity', () => {
  it('creates each fixed immutable pair independently in each workspace', async () => {
    const before =
      await db`select id,workspace_id,market,type,code from public.packages where workspace_id in (${f.wsA.id},${f.wsB.id})`;
    const pairs = [
      ['Egypt', 'Year-round'],
      ['Egypt', 'Promotional'],
      ['International', 'Year-round'],
      ['International', 'Promotional'],
    ] as const;
    const ids = new Map<string, string>();
    for (const workspaceId of [f.wsA.id, f.wsB.id]) {
      for (const [market, type] of pairs) {
        const result = await category(workspaceId, market, type);
        expect(result.error).toBeNull();
        expect(typeof result.data).toBe('string');
        ids.set(`${workspaceId}:${market}:${type}`, result.data as string);
      }
    }
    expect(new Set(ids.values()).size).toBe(8);
    const duplicate = await category(f.wsA.id, 'Egypt', 'Year-round');
    expect(duplicate.error).toBeNull();
    expect(duplicate.data).toBe(ids.get(`${f.wsA.id}:Egypt:Year-round`));
    const created = (
      await Promise.all(
        [...ids.values()].map(
          (id) =>
            db`select workspace_id,market,type,code from public.packages where id=${id}`,
        ),
      )
    ).flat();
    expect(created).toHaveLength(8);
    expect(created.every((row) => row.code === null)).toBe(true);
    expect(
      before.every(
        (row) =>
          row.market === null && row.type === null && row.workspace_id === null,
      ),
    ).toBe(true);
    const categoryEvents = (
      await Promise.all(
        [...ids.values()].map(
          (id) =>
            db`select target_id,workspace_id,details from public.audit_events where target_id=${id} and action='package.created'`,
        ),
      )
    ).flat();
    expect(categoryEvents).toHaveLength(8);
    expect(
      categoryEvents.every(
        (event) =>
          event.workspace_id !== null &&
          Object.keys(event.details).sort().join(',') === 'market,type',
      ),
    ).toBe(true);
    for (const id of ids.values()) {
      await expect(
        db`update public.packages set market='International' where id=${id}`,
      ).rejects.toMatchObject({ code: '23514' });
    }
  });

  it('denies category creation to every non-PO role before validating parameters', async () => {
    for (const actor of Object.values(f.actors).filter(
      (actor) => actor !== f.actors.po,
    )) {
      const denied = await actor.client.rpc('create_package_category', {
        workspace_id: null,
        market: 'unknown',
        category_type: 'unknown',
      });
      expect(denied.error?.code).toBe('42501');
    }
    const malformed = await f.po.client.rpc('create_package_category', {
      workspace_id: f.wsA.id,
      market: 'unknown',
      category_type: 'unknown',
    });
    expect(malformed.error?.code).toBe('22023');
  });

  it.each([
    ['Egypt', 'EGP', true],
    ['Egypt', 'USD', false],
    ['Egypt', 'SAR', false],
    ['International', 'EGP', true],
    ['International', 'USD', true],
    ['International', 'SAR', true],
    ['International', 'EUR', false],
  ] as const)(
    'applies the DB market/currency matrix: %s / %s',
    async (market, currency, allowed) => {
      const target = await category(f.wsB.id, market, 'Year-round');
      expect(target.error).toBeNull();
      const before =
        await db`select count(*)::int as count from public.package_offers where package_id=${target.data}`;
      const priorVersions =
        await db`select count(*)::int as count from public.package_versions where offer_id in (select id from public.package_offers where package_id=${target.data})`;
      const priorEvents =
        await db`select count(*)::int as count from public.audit_events where target_id=${target.data}`;
      const result = await publish(f.wsB.id, target.data as string, currency);
      if (allowed) {
        expect(result.error).toBeNull();
        expect(typeof result.data).toBe('string');
        const snapshot =
          await db`select market,type,currency,price_minor::text as price_minor from public.package_versions where id=${result.data}`;
        expect(snapshot).toEqual([
          {
            market,
            type: 'Year-round',
            currency,
            price_minor: '9007199254740993',
          },
        ]);
      } else {
        expect(result.error?.code).toBe('22023');
        expect(result.error?.message).toBe('invalid_input');
      }
      const afterOffers =
        await db`select count(*)::int as count from public.package_offers where package_id=${target.data}`;
      const afterVersions =
        await db`select count(*)::int as count from public.package_versions where offer_id in (select id from public.package_offers where package_id=${target.data})`;
      const afterEvents =
        await db`select count(*)::int as count from public.audit_events where target_id=${target.data}`;
      if (!allowed) {
        expect(afterOffers).toEqual(before);
        expect(afterVersions).toEqual(priorVersions);
        expect(afterEvents).toEqual(priorEvents);
      }
    },
  );

  it('does not rewrite existing package version identifiers or terms', async () => {
    const before =
      await db`select id,workspace_id,offer_id,version,name_ar,name_en,price_minor::text,currency,commission_rate_bp,duration_days,duration_months from public.package_versions order by id`;
    await category(f.wsA.id, 'International', 'Year-round');
    const after =
      await db`select id,workspace_id,offer_id,version,name_ar,name_en,price_minor::text,currency,commission_rate_bp,duration_days,duration_months from public.package_versions order by id`;
    expect(after).toEqual(before);
  });

  it('replays only the current payload and serializes concurrent identical publication', async () => {
    const packageId = (await category(f.wsA.id, 'International', 'Promotional'))
      .data as string;
    const first = await publish(f.wsA.id, packageId, 'USD');
    expect(first.error).toBeNull();
    const replay = await publish(f.wsA.id, packageId, 'USD');
    expect(replay.data).toBe(first.data);
    const concurrent = await Promise.all([
      publish(f.wsA.id, packageId, 'USD'),
      publish(f.wsA.id, packageId, 'USD'),
    ]);
    expect(concurrent.every((result) => result.error === null)).toBe(true);
    expect(new Set(concurrent.map((result) => result.data)).size).toBe(1);
    expect(concurrent[0]?.data).toBe(first.data);
    const versions =
      await db`select version from public.package_versions where offer_id in (select id from public.package_offers where package_id=${packageId}) order by version`;
    expect(versions).toEqual([{ version: 1 }]);
    for (const actor of Object.values(f.actors)) {
      const denied = await actor.client
        .from('package_versions')
        .update({ price_minor: 1 })
        .eq('id', first.data);
      expect(denied.error).not.toBeNull();
    }
  });

  it('PO-wall mutation allows a non-PO category creation, then rolls back the mutation', async () => {
    const workspaceResult = await admin()
      .from('workspaces')
      .insert({
        name: 'Fixture market mutation',
        slug: `fm-${randomUUID()}`,
        created_by: f.po.userId,
      })
      .select('id')
      .single();
    if (workspaceResult.error)
      throw new Error(
        `Workspace fixture setup failed: ${workspaceResult.error.code}`,
      );
    const workspace = workspaceResult.data;
    expect(workspace?.id).toBeDefined();
    let bypassed = false;
    await expect(
      db.begin(async (tx) => {
        await tx`create or replace function public.create_package_category(workspace_id uuid, market text, category_type text) returns uuid language plpgsql security definer set search_path = '' as $$ declare result uuid; begin insert into public.packages(workspace_id,market,type,created_by) values (create_package_category.workspace_id,create_package_category.market,create_package_category.category_type,auth.uid()) returning id into result; return result; end; $$`;
        await tx`select set_config('role','authenticated',true)`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.actors.woA.userId, role: 'authenticated' })},true)`;
        const [row] =
          await tx`select public.create_package_category(${workspace!.id}::uuid,'Egypt','Year-round') as id`;
        bypassed = Boolean(row?.id);
        throw new Error('rollback_po_wall_mutation');
      }),
    ).rejects.toMatchObject({ message: 'rollback_po_wall_mutation' });
    expect(bypassed).toBe(true);
  });

  it('market/currency guard mutation permits an Egypt/USD version, then rolls it back', async () => {
    const packageId = (await category(f.wsA.id, 'Egypt', 'Promotional'))
      .data as string;
    const versionId = (await publish(f.wsA.id, packageId, 'EGP'))
      .data as string;
    expect(versionId).toBeDefined();
    const [offer] =
      await db`select id,duration_days,duration_months from public.package_offers where current_version_id=${versionId}`;
    expect(offer).toBeDefined();
    let bypassed = false;
    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
        await tx`alter table public.package_versions disable trigger package_versions_market_guard`;
        await tx`insert into public.package_versions(workspace_id,offer_id,version,name_ar,name_en,price_minor,currency,commission_rate_bp,duration_days,duration_months,published_by) values (${f.wsA.id},${offer!.id},999,'test-authored-ar','test-authored-en',1,'USD',17,${offer!.duration_days},${offer!.duration_months},${f.po.userId})`;
        bypassed = true;
        await tx`alter table public.package_versions enable trigger package_versions_market_guard`;
        throw new Error('rollback_market_currency_mutation');
      }),
    ).rejects.toMatchObject({ message: 'rollback_market_currency_mutation' });
    expect(bypassed).toBe(true);
  });
});
