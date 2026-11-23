import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checked,
  packagesFixture,
  sql,
  type PackagesFixture,
} from './packages-fixture';
import { admin } from './harness';
import { bought, clientContext } from './registration-approval-payment-fixture';

const db = sql();
let f: PackagesFixture;

beforeAll(async () => {
  f = await packagesFixture();
});

afterAll(async () => {
  await db.end();
});

async function createIsolatedWorkspace(name: string) {
  const result = await admin()
    .from('workspaces')
    .insert({
      name,
      slug: `f9t055-${randomUUID()}`,
      created_by: f.po.userId,
    })
    .select('id')
    .single();
  if (result.error || !result.data) {
    throw new Error(
      `Workspace setup failed: ${result.error?.code ?? 'missing'}`,
    );
  }
  const workspaceId = result.data.id as string;
  const members = await admin()
    .from('workspace_memberships')
    .insert(
      [f.actors.woA, f.actors.salesA, f.actors.trainerA].map((actor) => ({
        workspace_id: workspaceId,
        user_id: actor.userId,
        granted_by: f.po.userId,
      })),
    );
  if (members.error) {
    throw new Error(`Membership setup failed: ${members.error.message}`);
  }
  return workspaceId;
}

async function snapshotDeniedSurfaces(workspaceId: string) {
  const packages = await db`
    select id,workspace_id,market,type,code
    from public.packages
    where workspace_id=${workspaceId}
    order by market,type,id
  `;
  const offers = await db`
    select id,workspace_id,package_id,available,current_version_id,duration_days,duration_months,tier_rank
    from public.package_offers
    where workspace_id=${workspaceId}
    order by id
  `;
  const versions = await db`
    select id,workspace_id,offer_id,version,name_ar,name_en,price_minor::text as price_minor,currency,commission_rate_bp,duration_days,duration_months,market,type
    from public.package_versions
    where workspace_id=${workspaceId}
    order by id
  `;
  const promotions = await db`
    select workspace_id,package_id,starts_at,ends_at
    from public.package_promotion_periods
    where workspace_id=${workspaceId}
    order by package_id
  `;
  const audits = await db`
    select action,actor_user_id,workspace_id,target_id,details
    from public.audit_events
    where workspace_id=${workspaceId}
    order by occurred_at,id
  `;
  return { packages, offers, versions, promotions, audits };
}

describe('T055 four-category initialization (S34-PO-6 / S35-PO-1)', () => {
  it('initializes exactly four empty category package rows per workspace without fabricated commercial values', async () => {
    const ws = await createIsolatedWorkspace('T055 init workspace');
    const init = await f.po.client.rpc(
      'initialize_workspace_package_categories',
      { workspace_id: ws },
    );
    expect(init.error).toBeNull();
    expect(init.data).toEqual([
      {
        package_id: expect.any(String),
        market: 'Egypt',
        category_type: 'Promotional',
      },
      {
        package_id: expect.any(String),
        market: 'Egypt',
        category_type: 'Year-round',
      },
      {
        package_id: expect.any(String),
        market: 'International',
        category_type: 'Promotional',
      },
      {
        package_id: expect.any(String),
        market: 'International',
        category_type: 'Year-round',
      },
    ]);

    const rows = await db`
      select id,workspace_id,market,type,code
      from public.packages
      where workspace_id=${ws}
      order by market,type
    `;
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.code === null)).toBe(true);

    const offers =
      await db`select id from public.package_offers where workspace_id=${ws}`;
    const versions =
      await db`select id from public.package_versions where workspace_id=${ws}`;
    expect(offers).toEqual([]);
    expect(versions).toEqual([]);

    const events = await db`
      select action,target_id,workspace_id,details
      from public.audit_events
      where workspace_id=${ws} and action='package.created'
    `;
    expect(events).toHaveLength(4);
    expect(
      events.every(
        (event) =>
          Object.keys(event.details).sort().join(',') === 'market,type',
      ),
    ).toBe(true);

    // Re-running initialization is idempotent and emits no duplicate events.
    const replay = await f.po.client.rpc(
      'initialize_workspace_package_categories',
      { workspace_id: ws },
    );
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(init.data);
    const eventsAfterReplay = await db`
      select id from public.audit_events
      where workspace_id=${ws} and action='package.created'
    `;
    expect(eventsAfterReplay).toHaveLength(4);
  });

  it('fills in only missing categories when one category was created beforehand', async () => {
    const ws = await createIsolatedWorkspace('T055 partial init workspace');
    const existingId = checked(
      await f.po.client.rpc('create_package_category', {
        workspace_id: ws,
        market: 'Egypt',
        category_type: 'Year-round',
      }),
    ) as string;
    const init = await f.po.client.rpc(
      'initialize_workspace_package_categories',
      { workspace_id: ws },
    );
    expect(init.error).toBeNull();
    expect(init.data).toHaveLength(4);
    expect(
      (
        init.data as {
          package_id: string;
          market: string;
          category_type: string;
        }[]
      ).find(
        (row) => row.market === 'Egypt' && row.category_type === 'Year-round',
      )?.package_id,
    ).toBe(existingId);
  });

  it('denies category initialization for every non-PO actor and rejects null/foreign workspace', async () => {
    const ws = await createIsolatedWorkspace('T055 auth workspace');
    const before = await snapshotDeniedSurfaces(ws);
    expect(before.packages).toEqual([]);
    expect(before.offers).toEqual([]);
    expect(before.versions).toEqual([]);
    expect(before.promotions).toEqual([]);
    // `createIsolatedWorkspace` setup itself writes workspace.created +
    // membership.granted audit rows for this workspace; the denied calls
    // below must add nothing, so `after` must equal `before` exactly.
    for (const [name, actor] of Object.entries(f.actors)) {
      if (name === 'po') continue;
      const denied = await actor.client.rpc(
        'initialize_workspace_package_categories',
        { workspace_id: ws },
      );
      expect(denied.error?.code, name).toBe('42501');
    }
    expect(
      (
        await f.po.client.rpc('initialize_workspace_package_categories', {
          workspace_id: null,
        })
      ).error,
    ).toMatchObject({ code: '22023', message: 'invalid_input' });
    expect(
      (
        await f.po.client.rpc('initialize_workspace_package_categories', {
          workspace_id: randomUUID(),
        })
      ).error,
    ).toMatchObject({ code: '42501', message: 'not_permitted' });
    const after = await snapshotDeniedSurfaces(ws);
    expect(after).toEqual(before);
  });

  it('rejects a 5th category and duplicate (workspace_id, market, type) rows at DB level', async () => {
    const ws = await createIsolatedWorkspace('T055 4-slot invariant');
    checked(
      await f.po.client.rpc('initialize_workspace_package_categories', {
        workspace_id: ws,
      }),
    );
    await expect(
      db`insert into public.packages(workspace_id,market,type,created_by)
         values (${ws},'MENA','Year-round',${f.po.userId})`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db`insert into public.packages(workspace_id,market,type,created_by)
         values (${ws},'Egypt','Seasonal',${f.po.userId})`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db`insert into public.packages(workspace_id,market,type,created_by)
         values (${ws},'Egypt','Year-round',${f.po.userId})`,
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      db`insert into public.packages(code,workspace_id,market,type,created_by)
         values (null,null,null,null,${f.po.userId})`,
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('T054 PO/WO commercial terms, immutable version history, snapshots, and market/type immutability', () => {
  it('allows PO to configure terms across both markets simultaneously while denying WO (even in own workspace) and all other non-PO roles', async () => {
    const ws = await createIsolatedWorkspace('T054 PO/WO role workspace');
    const categories = checked(
      await f.po.client.rpc('initialize_workspace_package_categories', {
        workspace_id: ws,
      }),
    ) as { package_id: string; market: string; category_type: string }[];
    const egyptYr = categories.find(
      (c) => c.market === 'Egypt' && c.category_type === 'Year-round',
    )!;
    const intlPromo = categories.find(
      (c) => c.market === 'International' && c.category_type === 'Promotional',
    )!;

    const egyptV1 = checked(
      await f.po.client.rpc('publish_package_version', {
        workspace_id: ws,
        package_id: egyptYr.package_id,
        duration_months: 3,
        duration_days: 90,
        tier_rank: 1,
        name_ar: 'باقة مصر v1',
        name_en: 'Egypt Year-round v1',
        price_minor: '150000',
        currency: 'EGP',
        commission_rate_bp: 1000,
      }),
    ) as string;
    const intlV1 = checked(
      await f.po.client.rpc('publish_package_version', {
        workspace_id: ws,
        package_id: intlPromo.package_id,
        duration_months: null,
        duration_days: 45,
        tier_rank: 2,
        name_ar: 'باقة دولي v1',
        name_en: 'Intl Promo v1',
        price_minor: '9900',
        currency: 'USD',
        commission_rate_bp: 1500,
      }),
    ) as string;

    expect(egyptV1).not.toBe(intlV1);
    const [egyptOffer] =
      await db`select id from public.package_offers where current_version_id=${egyptV1}`;
    const [intlOffer] =
      await db`select id from public.package_offers where current_version_id=${intlV1}`;
    expect(
      checked(
        await f.po.client.rpc('set_package_offer_available', {
          workspace_id: ws,
          offer_id: egyptOffer!.id,
          available: true,
        }),
      ),
    ).toBe(egyptOffer!.id);
    expect(
      checked(
        await f.po.client.rpc('set_package_offer_available', {
          workspace_id: ws,
          offer_id: intlOffer!.id,
          available: true,
        }),
      ),
    ).toBe(intlOffer!.id);

    // WO in own workspace + all other non-PO roles cannot rename, reprice, set commission, toggle availability, or set promo periods.
    // Refusal must write nothing: snapshot category/package, offer, version,
    // promotion-period and audit rows before the denied calls and require
    // byte-identical state afterward (covers own-workspace WO denial).
    const deniedBefore = await snapshotDeniedSurfaces(ws);
    for (const [name, actor] of Object.entries(f.actors)) {
      if (name === 'po') continue;
      const pubDenied = await actor.client.rpc('publish_package_version', {
        workspace_id: ws,
        package_id: egyptYr.package_id,
        duration_months: 3,
        duration_days: 90,
        tier_rank: 1,
        name_ar: 'محاولة غير مصرح بها',
        name_en: 'Unauthorized edit',
        price_minor: '999999',
        currency: 'EGP',
        commission_rate_bp: 9000,
      });
      expect(pubDenied.error?.code, `${name}:publish`).toBe('42501');

      const availDenied = await actor.client.rpc(
        'set_package_offer_available',
        {
          workspace_id: ws,
          offer_id: egyptOffer!.id,
          available: false,
        },
      );
      expect(availDenied.error?.code, `${name}:avail`).toBe('42501');

      const promoDenied = await actor.client.rpc(
        'set_package_promotion_period',
        {
          workspace_id: ws,
          package_id: intlPromo.package_id,
          starts_at: '2026-12-01',
          ends_at: '2026-12-31',
        },
      );
      expect(promoDenied.error?.code, `${name}:promo`).toBe('42501');
    }
    const deniedAfter = await snapshotDeniedSurfaces(ws);
    expect(deniedAfter).toEqual(deniedBefore);
  });

  it('appends immutable commercial versions and preserves prior versions, client, link, subscription, and trainer assignment snapshots', async () => {
    const context = await clientContext();
    const purchase = await bought(context);
    const assignResult = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: purchase.t.id,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(assignResult.error).toBeNull();
    expect(assignResult.data).toMatchObject({ status: 'ok' });

    const [v1Before] = await db`
      select id,workspace_id,offer_id,version,name_ar,name_en,price_minor::text,currency,commission_rate_bp,duration_days,duration_months,market,type
      from public.package_versions where id=${context.p.versionId}
    `;
    const [clientBefore] = await db`
      select id,workspace_id,registration_link_id,package_version_id,approval_state
      from public.clients where id=${purchase.t.id}
    `;
    const [linkBefore] = await db`
      select id,package_version_id,price_minor::text,currency,commission_rate_bp,duration_days,duration_months
      from public.registration_links where id=${clientBefore!.registration_link_id}
    `;
    const [subBefore] = await db`
      select id,package_version_id,price_minor::text,currency,commission_rate_bp,duration_days,duration_months
      from public.subscriptions where id=${purchase.sid}
    `;
    const [assignmentBefore] = await db`
      select id,workspace_id,client_id,trainer_user_id,assignment_source,assigned_by,assigned_at,workspace_membership_id,ended_at,ended_by
      from public.client_trainer_assignments where client_id=${purchase.t.id} and ended_at is null
    `;
    const assignmentRowsBefore =
      await db`select * from public.client_trainer_assignments where client_id=${purchase.t.id} and ended_at is null`;
    expect(assignmentBefore?.trainer_user_id).toBe(context.trainerA.userId);

    // PO edits name, price, currency, and commission -> appends v2 then v3.
    const v2 = checked(
      await context.po.client.rpc('publish_package_version', {
        workspace_id: context.p.workspace_id,
        package_id: context.p.id,
        duration_months: null,
        duration_days: 61,
        tier_rank: 1,
        name_ar: 'اسم معدل v2',
        name_en: 'Edited terms v2',
        price_minor: '2500',
        currency: 'SAR',
        commission_rate_bp: 900,
      }),
    ) as string;
    const v3 = checked(
      await context.po.client.rpc('publish_package_version', {
        workspace_id: context.p.workspace_id,
        package_id: context.p.id,
        duration_months: null,
        duration_days: 61,
        tier_rank: 1,
        name_ar: 'اسم معدل v3',
        name_en: 'Edited terms v3',
        price_minor: '3000',
        currency: 'EGP',
        commission_rate_bp: 1200,
      }),
    ) as string;
    expect(new Set([context.p.versionId, v2, v3]).size).toBe(3);

    const [v1After] = await db`
      select id,workspace_id,offer_id,version,name_ar,name_en,price_minor::text,currency,commission_rate_bp,duration_days,duration_months,market,type
      from public.package_versions where id=${context.p.versionId}
    `;
    const [clientAfter] = await db`
      select id,workspace_id,registration_link_id,package_version_id,approval_state
      from public.clients where id=${purchase.t.id}
    `;
    const [linkAfter] = await db`
      select id,package_version_id,price_minor::text,currency,commission_rate_bp,duration_days,duration_months
      from public.registration_links where id=${clientBefore!.registration_link_id}
    `;
    const [subAfter] = await db`
      select id,package_version_id,price_minor::text,currency,commission_rate_bp,duration_days,duration_months
      from public.subscriptions where id=${purchase.sid}
    `;
    const [assignmentAfter] = await db`
      select id,workspace_id,client_id,trainer_user_id,assignment_source,assigned_by,assigned_at,workspace_membership_id,ended_at,ended_by
      from public.client_trainer_assignments where client_id=${purchase.t.id} and ended_at is null
    `;
    const assignmentRowsAfter =
      await db`select * from public.client_trainer_assignments where client_id=${purchase.t.id} and ended_at is null`;
    expect(v1After).toEqual(v1Before);
    expect(clientAfter).toEqual(clientBefore);
    expect(linkAfter).toEqual(linkBefore);
    expect(subAfter).toEqual(subBefore);
    expect(assignmentAfter).toEqual(assignmentBefore);
    expect(assignmentRowsAfter).toEqual(assignmentRowsBefore);

    const allVersions = await db`
      select version,market,type,currency,price_minor::text,commission_rate_bp
      from public.package_versions where offer_id=${v1Before!.offer_id} order by version
    `;
    expect(allVersions).toEqual([
      {
        version: 1,
        market: 'International',
        type: 'Year-round',
        currency: 'USD',
        price_minor: '1200',
        commission_rate_bp: 17,
      },
      {
        version: 2,
        market: 'International',
        type: 'Year-round',
        currency: 'SAR',
        price_minor: '2500',
        commission_rate_bp: 900,
      },
      {
        version: 3,
        market: 'International',
        type: 'Year-round',
        currency: 'EGP',
        price_minor: '3000',
        commission_rate_bp: 1200,
      },
    ]);
  });

  it('rejects market and type edits on packages and package_versions', async () => {
    const ws = await createIsolatedWorkspace('T054 immutable market/type');
    const categories = checked(
      await f.po.client.rpc('initialize_workspace_package_categories', {
        workspace_id: ws,
      }),
    ) as { package_id: string; market: string; category_type: string }[];
    const egyptYr = categories.find(
      (c) => c.market === 'Egypt' && c.category_type === 'Year-round',
    )!;
    const versionId = checked(
      await f.po.client.rpc('publish_package_version', {
        workspace_id: ws,
        package_id: egyptYr.package_id,
        duration_months: 1,
        duration_days: 30,
        tier_rank: 1,
        name_ar: 'اسم',
        name_en: 'Name',
        price_minor: '500',
        currency: 'EGP',
        commission_rate_bp: 0,
      }),
    ) as string;

    await expect(
      db`update public.packages set market='International' where id=${egyptYr.package_id}`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db`update public.packages set type='Promotional' where id=${egyptYr.package_id}`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db`update public.package_versions set market='International', type='Promotional' where id=${versionId}`,
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('T054/T055 DB mutation controls (killed and rolled back)', () => {
  it('mutation 1 (allow 5th category): dropping market check permits a 5th category row, then rolls back', async () => {
    const ws = await createIsolatedWorkspace('T055 mutation 5th category');
    checked(
      await f.po.client.rpc('initialize_workspace_package_categories', {
        workspace_id: ws,
      }),
    );
    let inserted = false;
    await expect(
      db.begin(async (tx) => {
        await tx`alter table public.packages drop constraint packages_market_check`;
        await tx`insert into public.packages(workspace_id,market,type,created_by)
                 values (${ws},'MENA','Year-round',${f.po.userId})`;
        inserted = true;
        throw new Error('rollback_5th_category_mutation');
      }),
    ).rejects.toMatchObject({ message: 'rollback_5th_category_mutation' });
    expect(inserted).toBe(true);
    const count =
      await db`select count(*)::int as n from public.packages where workspace_id=${ws}`;
    expect(count[0]?.n).toBe(4);
  });

  it('mutation 2 (allow duplicate (ws,market,type)): dropping unique constraint permits duplicate category, then rolls back', async () => {
    const ws = await createIsolatedWorkspace('T055 mutation duplicate key');
    checked(
      await f.po.client.rpc('initialize_workspace_package_categories', {
        workspace_id: ws,
      }),
    );
    let duplicated = false;
    await expect(
      db.begin(async (tx) => {
        await tx`alter table public.packages drop constraint packages_workspace_market_type_key`;
        await tx`insert into public.packages(workspace_id,market,type,created_by)
                 values (${ws},'Egypt','Year-round',${f.po.userId})`;
        duplicated = true;
        throw new Error('rollback_duplicate_category_mutation');
      }),
    ).rejects.toMatchObject({
      message: 'rollback_duplicate_category_mutation',
    });
    expect(duplicated).toBe(true);
    const count =
      await db`select count(*)::int as n from public.packages where workspace_id=${ws} and market='Egypt' and type='Year-round'`;
    expect(count[0]?.n).toBe(1);
  });

  it('mutation 3 (allow non-PO terms): removing PO check in publish_package_version permits WO publication, then rolls back', async () => {
    const ws = await createIsolatedWorkspace('T054 mutation non-PO terms');
    const categories = checked(
      await f.po.client.rpc('initialize_workspace_package_categories', {
        workspace_id: ws,
      }),
    ) as { package_id: string; market: string; category_type: string }[];
    const egyptYr = categories.find(
      (c) => c.market === 'Egypt' && c.category_type === 'Year-round',
    )!;
    let bypassed = false;
    await expect(
      db.begin(async (tx) => {
        await tx`create or replace function public.publish_package_version(workspace_id uuid, package_id uuid, duration_months smallint, duration_days integer, tier_rank smallint, name_ar text, name_en text, price_minor bigint, currency text, commission_rate_bp integer) returns uuid language plpgsql security definer set search_path = '' as $$ declare o_id uuid; v_id uuid; begin insert into public.package_offers(workspace_id,package_id,duration_days,duration_months,tier_rank) values (workspace_id,package_id,duration_days,duration_months,tier_rank) returning id into o_id; alter table public.package_versions disable trigger package_versions_insert_guard; insert into public.package_versions(workspace_id,offer_id,version,name_ar,name_en,price_minor,currency,commission_rate_bp,duration_days,duration_months,published_by) values (workspace_id,o_id,1,name_ar,name_en,price_minor,currency,commission_rate_bp,duration_days,duration_months,auth.uid()) returning id into v_id; alter table public.package_versions enable trigger package_versions_insert_guard; alter table public.package_offers disable trigger package_offers_guard; update public.package_offers set current_version_id=v_id where id=o_id; alter table public.package_offers enable trigger package_offers_guard; return v_id; end; $$`;
        await tx`select set_config('role','authenticated',true)`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.actors.woA.userId, role: 'authenticated' })},true)`;
        const [row] =
          await tx`select public.publish_package_version(${ws}::uuid,${egyptYr.package_id}::uuid,1::smallint,30,1::smallint,'اسم غير مصرح','Unauthorized',500,'EGP',100) as id`;
        bypassed = Boolean(row?.id);
        throw new Error('rollback_non_po_terms_mutation');
      }),
    ).rejects.toMatchObject({ message: 'rollback_non_po_terms_mutation' });
    expect(bypassed).toBe(true);
  });

  it('mutation 4 (write without auth check): removing the PO check lets a WO initialization call write category rows, which the no-write snapshot comparison detects, then rolls back', async () => {
    const ws = await createIsolatedWorkspace(
      'T055 mutation no-auth-check write',
    );
    const before = await snapshotDeniedSurfaces(ws);
    expect(before.packages).toEqual([]);
    await expect(
      db.begin(async (tx) => {
        await tx`create or replace function public.initialize_workspace_package_categories(workspace_id uuid) returns table(package_id uuid, market text, category_type text) language plpgsql security definer set search_path = '' as $$ begin insert into public.packages (workspace_id, market, type, created_by) select workspace_id, m.market, t.category_type, auth.uid() from (values ('Egypt'), ('International')) as m(market) cross join (values ('Year-round'), ('Promotional')) as t(category_type) on conflict on constraint packages_workspace_market_type_key do nothing; return query select p.id as package_id, p.market, p.type as category_type from public.packages p where p.workspace_id = initialize_workspace_package_categories.workspace_id order by p.market, p.type; end; $$`;
        await tx`select set_config('role','authenticated',true)`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.actors.woA.userId, role: 'authenticated' })},true)`;
        const rows =
          await tx`select public.initialize_workspace_package_categories(${ws}::uuid)`;
        expect(rows.length).toBe(4);
        // Observe as the table owner: the WO observation role is RLS-filtered
        // for direct package reads, so reset role before snapshotting.
        await tx`select set_config('role','postgres',true)`;
        const after =
          await tx`select id,workspace_id,market,type,code from public.packages where workspace_id=${ws} order by market,type,id`;
        // The new no-write assertion (after == before) FAILS against this
        // mutant: the WO call wrote rows, proving the snapshot detects it.
        expect([{ packages: after }]).not.toEqual([
          { packages: before.packages },
        ]);
        throw new Error('rollback_no_auth_check_write_mutation');
      }),
    ).rejects.toMatchObject({
      message: 'rollback_no_auth_check_write_mutation',
    });
    const restored = await snapshotDeniedSurfaces(ws);
    expect(restored).toEqual(before);
  });
});
