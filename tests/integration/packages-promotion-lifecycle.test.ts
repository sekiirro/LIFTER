import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  registrationFixture,
  issue,
  sql,
  checked,
  secret,
  type RegistrationFixture,
} from './registration-links-fixture';
import { publishedFixture } from './packages-fixture';

let f: RegistrationFixture;
let promo: { packageId: string; versionId: string; offerId: string };
const db = sql();

beforeAll(async () => {
  f = await registrationFixture();
  const packageId = checked(
    await f.po.client.rpc('create_package_category', {
      workspace_id: f.wsA.id,
      market: 'International',
      category_type: 'Promotional',
    }),
  ) as string;
  const versionId = checked(
    await f.po.client.rpc('publish_package_version', {
      workspace_id: f.wsA.id,
      package_id: packageId,
      duration_months: null,
      duration_days: 61,
      tier_rank: 1,
      name_ar: 'test-authored-ar',
      name_en: 'test-authored-en',
      price_minor: '1200',
      currency: 'USD',
      commission_rate_bp: 17,
    }),
  ) as string;
  const [offer] =
    await db`select id from public.package_offers where current_version_id=${versionId}`;
  await f.po.client.rpc('set_package_offer_available', {
    workspace_id: f.wsA.id,
    offer_id: offer!.id,
    available: true,
  });
  promo = { packageId, versionId, offerId: offer!.id as string };
});

afterAll(() => db.end());

async function setPeriod(
  startsAt: string | null,
  endsAt: string | null,
  client = f.po.client,
) {
  return client.rpc('set_package_promotion_period', {
    workspace_id: f.wsA.id,
    package_id: promo.packageId,
    starts_at: startsAt,
    ends_at: endsAt,
  });
}

describe('promotional package availability and issued-link snapshots', () => {
  it('missing start is available from creation and missing end remains indefinite', async () => {
    const creationBoundary = await db`select
      app_private.package_promotion_period_active(${promo.packageId},p.created_at - interval '1 microsecond') as before_creation,
      app_private.package_promotion_period_active(${promo.packageId},p.created_at) as at_creation
      from public.packages p where p.id=${promo.packageId}`;
    expect(creationBoundary[0]).toEqual({
      before_creation: false,
      at_creation: true,
    });

    const noPeriod = await issue(f, f.po.client, {
      package_version_id: promo.versionId,
    });
    expect(noPeriod.error).toBeNull();

    const configured = await setPeriod(null, null);
    expect(configured.error).toBeNull();
    expect(
      (await issue(f, f.po.client, { package_version_id: promo.versionId }))
        .error,
    ).toBeNull();
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
    'denies promotion-period edits to %s without audit or mutation',
    async (role) => {
      const before =
        await db`select starts_at,ends_at from public.package_promotion_periods where package_id=${promo.packageId}`;
      const eventsBefore =
        await db`select count(*)::int as n from public.audit_events where target_id=${promo.packageId} and action='package.promotion_period_changed'`;
      const result = await setPeriod('2050-01-01', null, f.actors[role].client);
      expect(result.error?.code).toBe('42501');
      const after =
        await db`select starts_at,ends_at from public.package_promotion_periods where package_id=${promo.packageId}`;
      const eventsAfter =
        await db`select count(*)::int as n from public.audit_events where target_id=${promo.packageId} and action='package.promotion_period_changed'`;
      expect(after).toEqual(before);
      expect(eventsAfter[0]!.n).toBe(eventsBefore[0]!.n);
    },
  );

  it('uses inclusive start and exclusive end at Africa/Cairo calendar-day boundaries', async () => {
    const tzOffsets = await db`select
      extract(epoch from ((timestamp with time zone '2026-01-15 12:00:00+00' at time zone 'Africa/Cairo') - (timestamp with time zone '2026-01-15 12:00:00+00' at time zone 'UTC'))) / 3600 as standard_offset,
      extract(epoch from ((timestamp with time zone '2026-07-15 12:00:00+00' at time zone 'Africa/Cairo') - (timestamp with time zone '2026-07-15 12:00:00+00' at time zone 'UTC'))) / 3600 as daylight_offset`;
    expect(Number(tzOffsets[0]!.standard_offset)).toBe(2);
    expect(Number(tzOffsets[0]!.daylight_offset)).toBe(3);

    expect((await setPeriod('2026-11-10', '2026-11-11')).error).toBeNull();
    const standardTime = await db`select
      app_private.package_promotion_period_active(${promo.packageId},'2026-11-09T21:59:59Z'::timestamptz) as before_start,
      app_private.package_promotion_period_active(${promo.packageId},'2026-11-09T22:00:00Z'::timestamptz) as at_start,
      app_private.package_promotion_period_active(${promo.packageId},'2026-11-10T21:59:59Z'::timestamptz) as before_end,
      app_private.package_promotion_period_active(${promo.packageId},'2026-11-10T22:00:00Z'::timestamptz) as at_end`;
    expect(standardTime[0]).toEqual({
      before_start: false,
      at_start: true,
      before_end: true,
      at_end: false,
    });

    expect((await setPeriod('2026-07-20', '2026-07-21')).error).toBeNull();
    const daylightTime = await db`select
      app_private.package_promotion_period_active(${promo.packageId},'2026-07-19T20:59:59Z'::timestamptz) as before_start,
      app_private.package_promotion_period_active(${promo.packageId},'2026-07-19T21:00:00Z'::timestamptz) as at_start,
      app_private.package_promotion_period_active(${promo.packageId},'2026-07-20T20:59:59Z'::timestamptz) as before_end,
      app_private.package_promotion_period_active(${promo.packageId},'2026-07-20T21:00:00Z'::timestamptz) as at_end`;
    expect(daylightTime[0]).toEqual({
      before_start: false,
      at_start: true,
      before_end: true,
      at_end: false,
    });

    const startAllowed = await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
      await tx`select public.set_package_promotion_period(${f.wsA.id},${promo.packageId},(clock_timestamp() at time zone 'Africa/Cairo')::date,null)`;
      const [row] =
        await tx`select public.issue_registration_link(${f.wsA.id},${promo.versionId},${secret().hash},null) as id`;
      return row!.id;
    });
    expect(startAllowed).toBeTruthy();

    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
        await tx`select public.set_package_promotion_period(${f.wsA.id},${promo.packageId},null,((clock_timestamp() at time zone 'Africa/Cairo')::date))`;
        await tx`select public.issue_registration_link(${f.wsA.id},${promo.versionId},${secret().hash},null)`;
      }),
    ).rejects.toMatchObject({ code: '22023', message: 'stale_terms' });
  });

  it('expired promotions block only new links and preserve every issued snapshot', async () => {
    await setPeriod(null, null);
    const issued = checked(
      await issue(f, f.po.client, { package_version_id: promo.versionId }),
    );
    const [before] =
      await db`select workspace_id,id,package_version_id,created_by,created_at,expires_at,price_minor::text,currency,duration_days,duration_months,commission_rate_bp from public.registration_links where id=${issued}`;
    const [eventBefore] =
      await db`select id,details from public.audit_events where target_id=${issued} and action='registration_link.issued'`;

    const expiry = await setPeriod(null, '2000-01-01');
    expect(expiry.error).toBeNull();
    expect(
      (await issue(f, f.po.client, { package_version_id: promo.versionId }))
        .error,
    ).toMatchObject({ code: '22023', message: 'stale_terms' });

    const [after] =
      await db`select workspace_id,id,package_version_id,created_by,created_at,expires_at,price_minor::text,currency,duration_days,duration_months,commission_rate_bp from public.registration_links where id=${issued}`;
    const [eventAfter] =
      await db`select id,details from public.audit_events where target_id=${issued} and action='registration_link.issued'`;
    expect(after).toEqual(before);
    expect(eventAfter).toEqual(eventBefore);
  });

  it('same period is idempotent; real changes write one allow-listed event', async () => {
    const bounds = ['2050-01-01', '2050-02-01'] as const;
    const [before] =
      await db`select count(*)::int as n from public.audit_events where target_id=${promo.packageId} and action='package.promotion_period_changed'`;
    const concurrent = await Promise.all([
      setPeriod(...bounds),
      setPeriod(...bounds),
    ]);
    expect(concurrent.every((result) => result.error === null)).toBe(true);
    const once =
      await db`select id,details from public.audit_events where target_id=${promo.packageId} and action='package.promotion_period_changed' order by occurred_at,id`;
    expect(once).toHaveLength(before!.n + 1);
    expect((await setPeriod(...bounds)).error).toBeNull();
    const twice =
      await db`select id,details from public.audit_events where target_id=${promo.packageId} and action='package.promotion_period_changed' order by occurred_at,id`;
    expect(twice).toEqual(once);
    expect(twice.at(-1)?.details).toEqual({
      starts_at: bounds[0],
      ends_at: bounds[1],
    });
  });

  it('enforces RLS, owner, search path and execute grants on the period table and RPC', async () => {
    const [table] =
      await db`select c.relrowsecurity,c.relforcerowsecurity from pg_class c where c.oid='public.package_promotion_periods'::regclass`;
    expect(table).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const [grants] =
      await db`select has_table_privilege('authenticated','public.package_promotion_periods','select') as auth_select, has_table_privilege('authenticated','public.package_promotion_periods','insert') as auth_insert, has_table_privilege('service_role','public.package_promotion_periods','select') as service_select`;
    expect(grants).toEqual({
      auth_select: false,
      auth_insert: false,
      service_select: false,
    });
    const boundTypes =
      await db`select column_name,data_type from information_schema.columns where table_schema='public' and table_name='package_promotion_periods' and column_name in ('starts_at','ends_at') order by column_name`;
    expect(boundTypes).toEqual([
      { column_name: 'ends_at', data_type: 'date' },
      { column_name: 'starts_at', data_type: 'date' },
    ]);
    const [rpc] =
      await db`select owner.rolname as owner, p.prosecdef, p.proconfig, has_function_privilege('authenticated',p.oid,'execute') as auth_exec, has_function_privilege('anon',p.oid,'execute') as anon_exec, has_function_privilege('service_role',p.oid,'execute') as service_exec from pg_proc p join pg_roles owner on owner.oid=p.proowner where p.oid='public.set_package_promotion_period(uuid,uuid,date,date)'::regprocedure`;
    expect(rpc).toMatchObject({
      owner: 'postgres',
      prosecdef: true,
      proconfig: ['search_path=""'],
      auth_exec: true,
      anon_exec: false,
      service_exec: false,
    });
  });

  it('mutation control: without the period insert guard an expired promotion issues a link', async () => {
    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
        await tx`select public.set_package_promotion_period(${f.wsA.id},${promo.packageId},null,'2000-01-01'::date)`;
        await tx`alter table public.registration_links disable trigger registration_links_promotion_period_guard`;
        const [row] =
          await tx`select public.issue_registration_link(${f.wsA.id},${promo.versionId},${secret().hash},null) as id`;
        if (!row?.id)
          throw new Error('promotion trigger still blocks the mutant');
        throw new Error('promotion_guard_mutant_reached');
      }),
    ).rejects.toMatchObject({ message: 'promotion_guard_mutant_reached' });
  });

  it('audit failure rolls back the promotion-period update', async () => {
    const before =
      await db`select starts_at,ends_at,changed_by from public.package_promotion_periods where package_id=${promo.packageId}`;
    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
        await tx.unsafe(
          `create function app_private.test_reject_package_promotion_audit() returns trigger language plpgsql set search_path = '' as $$ begin raise exception 'promotion_audit_failure'; end; $$`,
        );
        await tx.unsafe(
          `create trigger test_reject_package_promotion_audit before insert on public.audit_events for each row execute function app_private.test_reject_package_promotion_audit()`,
        );
        await tx`select public.set_package_promotion_period(${f.wsA.id},${promo.packageId},'2051-01-01'::date,null)`;
      }),
    ).rejects.toMatchObject({ message: 'promotion_audit_failure' });
    const after =
      await db`select starts_at,ends_at,changed_by from public.package_promotion_periods where package_id=${promo.packageId}`;
    expect(after).toEqual(before);
  });

  it('rejects bounds for non-promotional packages without changing versions or offers', async () => {
    const yearRound = await publishedFixture(f, {
      workspace_id: f.wsA.id,
      tier_rank: 2,
    });
    const result = await f.po.client.rpc('set_package_promotion_period', {
      workspace_id: f.wsA.id,
      package_id: yearRound.id,
      starts_at: null,
      ends_at: null,
    });
    expect(result.error?.code).toBe('22023');
    expect(
      await db`select current_version_id,available from public.package_offers where id=${yearRound.offer.id}`,
    ).toEqual([{ current_version_id: yearRound.versionId, available: false }]);
  });
});
