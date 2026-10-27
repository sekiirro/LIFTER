import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  registrationFixture,
  unavailableOfferFixture,
  historicalVersionFixture,
  missingCurrentVersionFixture,
  crossWorkspaceOffer,
  issue,
  schedule,
  sql,
  checked,
  publish,
  secret,
  type RegistrationFixture,
} from './registration-links-fixture';
import { syntheticTerms } from './packages-fixture';
let f: RegistrationFixture;
const db = sql();
beforeAll(async () => {
  f = await registrationFixture();
});
afterAll(() => db.end());
for (const role of [
  'po',
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
] as const)
  for (const scheduled of [false, true])
    it(`issue matrix ${role} schedule=${scheduled}`, async () => {
      const allowed = [
        'po',
        'woA',
        'salesA',
        ...(!scheduled ? ['trainerA'] : []),
      ].includes(role);
      const r = await issue(f, f.actors[role].client, {
        installments: scheduled ? schedule : null,
      });
      expect(r.error?.code ?? null).toBe(allowed ? null : '42501');
    });
it.each([
  [],
  {},
  [{ seq: 1, amount_minor: '1199', due_offset_days: 0 }],
  [{ seq: 1, amount_minor: 1200, due_offset_days: 0 }],
  [{ seq: 2, amount_minor: '1200', due_offset_days: 0 }],
  [{ seq: 1, amount_minor: '1200', due_offset_days: -1 }],
  [{ seq: 1, amount_minor: '9223372036854775808', due_offset_days: 0 }],
])('invalid schedule %#', async (installments) =>
  expect((await issue(f, f.salesA.client, { installments })).error?.code).toBe(
    '22023',
  ),
);
it('Trainer rejects malformed and empty non-null schedules before parsing', async () => {
  for (const installments of [[], {}, 'bad'])
    expect(
      (await issue(f, f.trainerA.client, { installments })).error?.code,
    ).toBe('42501');
});
it('R10-1 superseded displayed version returns stale_terms, no row or event', async () => {
  const fresh = await historicalVersionFixture();
  const r = await issue(fresh);
  expect(r.error).toMatchObject({ code: '22023', message: 'stale_terms' });
  const [count] =
    await db`select count(*)::int as n from public.registration_links where workspace_id=${fresh.wsA.id}`;
  expect(count!.n).toBe(0);
  const events =
    await db`select id from public.audit_events where workspace_id=${fresh.wsA.id} and action='registration_link.issued'`;
  expect(events).toHaveLength(0);
  expect((await issue(fresh, fresh.actors.woB.client)).error?.code).toBe(
    '42501',
  );
});
it('R10-1 unavailable terms returns stale_terms; foreign and unknown version not_permitted', async () => {
  const fresh = await unavailableOfferFixture();
  expect((await issue(fresh)).error).toMatchObject({
    code: '22023',
    message: 'stale_terms',
  });
  expect(
    (await issue(fresh, fresh.po.client, { package_version_id: randomUUID() }))
      .error?.code,
  ).toBe('42501');
  expect(
    (await issue(fresh, fresh.po.client, { workspace_id: fresh.wsB.id })).error
      ?.code,
  ).toBe('42501');
});
it('R10-1 offer without a current version returns stale_terms, no row or event', async () => {
  const fresh = await missingCurrentVersionFixture();
  expect((await issue(fresh)).error).toMatchObject({
    code: '22023',
    message: 'stale_terms',
  });
  const [count] =
    await db`select count(*)::int as n from public.registration_links where workspace_id=${fresh.wsA.id}`;
  expect(count!.n).toBe(0);
  const events =
    await db`select id from public.audit_events where workspace_id=${fresh.wsA.id} and action='registration_link.issued'`;
  expect(events).toHaveLength(0);
});
it('accepts the exact bigint maximum price and rejects overflow', async () => {
  const fresh = await registrationFixture(),
    max = '9223372036854775807';
  const version = checked(
    await publish(fresh, fresh.p.id, { price_minor: max }),
  );
  const single = checked(
    await issue(fresh, fresh.po.client, {
      package_version_id: version,
      installments: [{ seq: 1, amount_minor: max, due_offset_days: 0 }],
    }),
  );
  const split = checked(
    await issue(fresh, fresh.po.client, {
      package_version_id: version,
      installments: [
        { seq: 1, amount_minor: '9223372036854775806', due_offset_days: 0 },
        { seq: 2, amount_minor: '1', due_offset_days: 1 },
      ],
    }),
  );
  const rows =
    await db`select id,price_minor::text from public.registration_links where id in (${single},${split}) order by price_minor desc`;
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.price_minor === max)).toBe(true);
  for (const installments of [
    [{ seq: 1, amount_minor: '9223372036854775808', due_offset_days: 0 }],
    [
      { seq: 1, amount_minor: max, due_offset_days: 0 },
      { seq: 2, amount_minor: '1', due_offset_days: 1 },
    ],
  ])
    expect(
      (
        await issue(fresh, fresh.po.client, {
          package_version_id: version,
          installments,
        })
      ).error,
    ).toMatchObject({ code: '22023', message: 'invalid_input' });
  const [count] =
    await db`select count(*)::int as n from public.registration_links where workspace_id=${fresh.wsA.id} and package_version_id=${version}`;
  expect(count!.n).toBe(2);
});
it('accepts the technical int offset maximum and rejects its overflow', async () => {
  const fresh = await registrationFixture(),
    max = 2147483647;
  const id = checked(
    await issue(fresh, fresh.salesA.client, {
      installments: [{ seq: 1, amount_minor: '1200', due_offset_days: max }],
    }),
  );
  const [row] =
    await db`select due_offset_days from public.registration_link_installments where link_id=${id} and seq=1`;
  expect(row).toEqual({ due_offset_days: max });
  expect(
    (
      await issue(fresh, fresh.salesA.client, {
        installments: [
          { seq: 1, amount_minor: '1200', due_offset_days: max + 1 },
        ],
      })
    ).error,
  ).toMatchObject({ code: '22023', message: 'invalid_input' });
});
it('PO issues cross-scope without a workspace membership', async () => {
  const fresh = await registrationFixture(),
    foreign = await crossWorkspaceOffer(fresh);
  const [membership] =
    await db`select count(*)::int as n from public.workspace_memberships where workspace_id=${fresh.wsB.id} and user_id=${fresh.po.userId}`;
  expect(membership!.n).toBe(0);
  const id = checked(
    await issue(fresh, fresh.po.client, {
      workspace_id: fresh.wsB.id,
      package_version_id: foreign.versionId,
      installments: schedule,
    }),
  );
  const [row] =
    await db`select workspace_id,package_version_id,created_by,price_minor::text from public.registration_links where id=${id}`;
  expect(row).toEqual({
    workspace_id: fresh.wsB.id,
    package_version_id: foreign.versionId,
    created_by: fresh.po.userId,
    price_minor: '1200',
  });
  expect(
    await db`select actor_user_id,workspace_id,details from public.audit_events where target_id=${id} and action='registration_link.issued'`,
  ).toEqual([
    {
      actor_user_id: fresh.po.userId,
      workspace_id: fresh.wsB.id,
      details: {
        package_version_id: foreign.versionId,
        offer_id: foreign.offerId,
        installment_count: 2,
        price_minor: '1200',
        currency: 'XTS',
      },
    },
  ]);
});
it('workspace-A staff are denied in foreign workspace B for NULL and schedule', async () => {
  const fresh = await registrationFixture(),
    foreign = await crossWorkspaceOffer(fresh);
  for (const name of ['woA', 'salesA', 'trainerA'] as const)
    for (const installments of [null, schedule]) {
      const r = await issue(fresh, fresh.actors[name].client, {
        workspace_id: fresh.wsB.id,
        package_version_id: foreign.versionId,
        installments,
      });
      expect(r.error).toMatchObject({
        code: '42501',
        message: 'not_permitted',
      });
    }
  const [count] =
    await db`select count(*)::int as n from public.registration_links where workspace_id=${fresh.wsB.id}`;
  expect(count!.n).toBe(0);
});
it('a foreign-workspace version remains unknown in workspace A', async () => {
  const fresh = await registrationFixture(),
    foreign = await crossWorkspaceOffer(fresh);
  expect(
    (
      await issue(fresh, fresh.po.client, {
        package_version_id: foreign.versionId,
      })
    ).error,
  ).toMatchObject({ code: '42501', message: 'not_permitted' });
  const [count] =
    await db`select count(*)::int as n from public.registration_links where workspace_id=${fresh.wsA.id}`;
  expect(count!.n).toBe(0);
});
it('R10-1 validates the schedule against the exact displayed version', async () => {
  const fresh = await historicalVersionFixture();
  expect(
    (
      await issue(fresh, fresh.po.client, {
        package_version_id: fresh.historicalVersionId,
        installments: [{ seq: 1, amount_minor: '1300', due_offset_days: 0 }],
      })
    ).error,
  ).toMatchObject({ code: '22023', message: 'stale_terms' });
  expect(
    (
      await issue(fresh, fresh.po.client, {
        package_version_id: fresh.currentVersionId,
        installments: [{ seq: 1, amount_minor: '1200', due_offset_days: 0 }],
      })
    ).error,
  ).toMatchObject({ code: '22023', message: 'invalid_input' });
  const [count] =
    await db`select count(*)::int as n from public.registration_links where workspace_id=${fresh.wsA.id}`;
  expect(count!.n).toBe(0);
  expect(
    await db`select id from public.audit_events where workspace_id=${fresh.wsA.id} and action='registration_link.issued'`,
  ).toHaveLength(0);
});
it('duplicate hash fails generically and concurrent distinct requests commit once each', async () => {
  const fresh = await registrationFixture();
  const hash = secret().hash;
  checked(await issue(fresh, fresh.po.client, { token_hash: hash }));
  expect(
    (await issue(fresh, fresh.po.client, { token_hash: hash })).error?.message,
  ).toBe('unavailable');
  const results = await Promise.all(
    Array.from({ length: 4 }, () => issue(fresh, fresh.salesA.client)),
  );
  expect(results.every((r) => !r.error)).toBe(true);
  expect(new Set(results.map((r) => r.data)).size).toBe(4);
});
it('global actor limit serializes concurrent calls across workspaces', async () => {
  const fresh = await registrationFixture();
  const version = checked(
    await publish(fresh, fresh.p.id, {
      workspace_id: fresh.wsB.id,
      price_minor: '1200',
    }),
  );
  const offer = checked(
    await fresh.po.client
      .from('package_offers')
      .select('id')
      .eq('current_version_id', version)
      .single(),
  );
  checked(
    await fresh.po.client.rpc('set_package_offer_available', {
      workspace_id: fresh.wsB.id,
      offer_id: offer.id,
      available: true,
    }),
  );
  const [limits] =
    await db`select per_actor from app_private.registration_link_limits()`;
  for (let i = 0; i < limits!.per_actor - 1; i++) checked(await issue(fresh));
  const barrier = sql();
  // Local fixture DDL only. Pause INSERT after the limit read, without altering capabilities.
  // Different offers prevent offer-row serialization from hiding a missing actor lock.
  await db.unsafe(
    `create function app_private.f10_test_issue_barrier() returns trigger language plpgsql security definer set search_path='' as $$ begin if new.created_by='${fresh.po.userId}'::uuid then perform pg_catalog.pg_advisory_xact_lock_shared(20261030,10); end if; return new; end $$`,
  );
  await db`revoke execute on function app_private.f10_test_issue_barrier() from public,anon,authenticated,service_role`;
  await db`create trigger f10_test_issue_barrier before insert on public.registration_links for each row execute function app_private.f10_test_issue_barrier()`;
  await barrier`select pg_advisory_lock(20261030,10)`;
  const requests = Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      issue(
        fresh,
        fresh.po.client,
        i % 2
          ? { workspace_id: fresh.wsB.id, package_version_id: version }
          : {},
      ),
    ),
  );
  try {
    let waiting = 0;
    for (let i = 0; i < 50; i++) {
      const [r] =
        await db`select count(*)::int as n from pg_locks where locktype='advisory' and classid=20261030 and objid=10 and objsubid=2 and not granted`;
      waiting = r!.n;
      if (waiting >= 2) break;
      await db`select pg_sleep(0.02)`;
    }
    expect(waiting).toBeGreaterThan(0);
    await barrier`select pg_advisory_unlock(20261030,10)`;
    const results = await requests;
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(
      results.filter((r) => r.error?.message === 'unavailable'),
    ).toHaveLength(3);
  } finally {
    await barrier`select pg_advisory_unlock_all()`;
    await requests;
    await db`drop trigger f10_test_issue_barrier on public.registration_links`;
    await db`drop function app_private.f10_test_issue_barrier()`;
    await barrier.end();
  }
});
it('actor at limit returns unavailable for a valid own-workspace version and writes no row', async () => {
  const fresh = await registrationFixture();
  const [limits] =
    await db`select per_actor from app_private.registration_link_limits()`;
  for (let i = 0; i < limits!.per_actor; i++)
    checked(await issue(fresh, fresh.salesA.client));
  const [before] =
    await db`select count(*)::int as n from public.registration_links where workspace_id=${fresh.wsA.id} and created_by=${fresh.salesA.userId}`;
  expect(before!.n).toBe(limits!.per_actor);
  const r = await issue(fresh, fresh.salesA.client);
  expect(r.error).toMatchObject({ code: 'P0001', message: 'unavailable' });
  const [after] =
    await db`select count(*)::int as n from public.registration_links where workspace_id=${fresh.wsA.id} and created_by=${fresh.salesA.userId}`;
  expect(after!.n).toBe(before!.n);
  const events =
    await db`select id from public.audit_events where workspace_id=${fresh.wsA.id} and action='registration_link.issued'`;
  expect(events).toHaveLength(limits!.per_actor);
});
it('authorization precedes the actor limit for an unauthorized workspace', async () => {
  const fresh = await registrationFixture();
  const [limits] =
    await db`select per_actor from app_private.registration_link_limits()`;
  for (let i = 0; i < limits!.per_actor; i++)
    checked(await issue(fresh, fresh.salesA.client));
  const r = await issue(fresh, fresh.salesA.client, {
    workspace_id: fresh.wsB.id,
  });
  expect(r.error).toMatchObject({ code: '42501', message: 'not_permitted' });
  const [count] =
    await db`select count(*)::int as n from public.registration_links where workspace_id=${fresh.wsB.id}`;
  expect(count!.n).toBe(0);
});
it('actor limit precedes same-workspace version resolution after authorization', async () => {
  const fresh = await registrationFixture();
  const [limits] =
    await db`select per_actor from app_private.registration_link_limits()`;
  for (let i = 0; i < limits!.per_actor; i++)
    checked(await issue(fresh, fresh.salesA.client));
  const r = await issue(fresh, fresh.salesA.client, {
    package_version_id: randomUUID(),
  });
  expect(r.error).toMatchObject({ code: 'P0001', message: 'unavailable' });
  const [count] =
    await db`select count(*)::int as n from public.registration_links where workspace_id=${fresh.wsA.id} and created_by=${fresh.salesA.userId}`;
  expect(count!.n).toBe(limits!.per_actor);
});
it('exact snapshot and text reads preserve price above 2^53 and old terms after publish/disable', async () => {
  const fresh = await registrationFixture(),
    amount = '9007199254740993';
  const version = checked(
    await publish(fresh, fresh.p.id, { price_minor: amount }),
  );
  const id = checked(
    await issue(fresh, fresh.salesA.client, {
      package_version_id: version,
      installments: [{ seq: 1, amount_minor: amount, due_offset_days: 2 }],
    }),
  );
  checked(await publish(fresh, fresh.p.id, { price_minor: '1300' }));
  checked(
    await fresh.po.client.rpc('set_package_offer_available', {
      workspace_id: fresh.wsA.id,
      offer_id: fresh.p.offer.id,
      available: false,
    }),
  );
  const row = checked(
    await fresh.salesA.client
      .from('registration_links_safe')
      .select('price_minor,package_version_id,duration_days,duration_months')
      .eq('id', id)
      .single(),
  );
  expect(row).toEqual({
    price_minor: amount,
    package_version_id: version,
    duration_days: 61,
    duration_months: null,
  });
});
it('offer lock coordinates publication and issuance without mixed snapshots', async () => {
  const fresh = await registrationFixture(),
    publisher = sql();
  let publisherPid = 0,
    successorVersionId = '';
  let holding!: () => void, release!: () => void;
  const holdingPublication = new Promise<void>((resolve) => {
      holding = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  // Connection A: the real F9 publication, left uncommitted while it holds the
  // offer row. The RPC runs inside this transaction exactly as it does through
  // PostgREST, so the uncommitted UPDATE is invisible to B but its row lock is not.
  const publication = publisher.begin(async (tx) => {
    await tx`select set_config('role','authenticated',true)`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fresh.po.userId, role: 'authenticated' })},true)`;
    const [published] = await tx`select public.publish_package_version(
      ${fresh.wsA.id}::uuid,${fresh.p.id}::uuid,null::smallint,${syntheticTerms.duration_days},
      ${syntheticTerms.name_ar},${syntheticTerms.name_en},${'1300'}::bigint,${syntheticTerms.currency},
      ${syntheticTerms.commission_rate_bp}) as id`;
    successorVersionId = published!.id as string;
    const [backend] = await tx`select pg_backend_pid() as pid`;
    publisherPid = backend!.pid as number;
    holding();
    await gate;
  });
  let issuance: ReturnType<typeof issue> | undefined;
  let issuanceSettled = false,
    blockedPids: number[] = [],
    linksWhilePublicationOpen = -1,
    settledWhilePublicationOpen = true;
  try {
    await holdingPublication;
    issuance = Promise.resolve(issue(fresh));
    issuance.then(
      () => {
        issuanceSettled = true;
      },
      () => {
        issuanceSettled = true;
      },
    );
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const rows = await db`select pid from pg_stat_activity
        where datname=current_database() and wait_event_type='Lock'
          and ${publisherPid}=any(pg_blocking_pids(pid))
          and query like '%issue_registration_link%'`;
      blockedPids = rows.map((row) => row.pid as number);
      if (blockedPids.length > 0) break;
      await db`select pg_sleep(0.05)`;
    }
    settledWhilePublicationOpen = issuanceSettled;
    const [links] =
      await db`select count(*)::int as n from public.registration_links where workspace_id=${fresh.wsA.id} and package_version_id=${fresh.p.versionId}`;
    linksWhilePublicationOpen = links!.n;
  } finally {
    release();
    try {
      await publication;
      if (issuance) await issuance;
    } finally {
      await publisher.end();
    }
  }
  expect(
    blockedPids,
    'issuance backend was never observed waiting on the uncommitted publication lock',
  ).not.toHaveLength(0);
  expect(settledWhilePublicationOpen).toBe(false);
  expect(linksWhilePublicationOpen).toBe(0);
  const issued = await issuance!;
  expect(issued.error).toMatchObject({
    code: '22023',
    message: 'stale_terms',
  });
  const [links] =
    await db`select count(*)::int as n from public.registration_links where workspace_id=${fresh.wsA.id}`;
  expect(links!.n).toBe(0);
  const installments =
    await db`select 1 as found from public.registration_link_installments i join public.registration_links l on l.id=i.link_id where l.workspace_id=${fresh.wsA.id}`;
  expect(installments).toHaveLength(0);
  const events =
    await db`select id from public.audit_events where workspace_id=${fresh.wsA.id} and action='registration_link.issued'`;
  expect(events).toHaveLength(0);
  const [offer] =
    await db`select current_version_id from public.package_offers where id=${fresh.p.offer.id}`;
  expect(offer).toEqual({ current_version_id: successorVersionId });
  const versions =
    await db`select id from public.package_versions where offer_id=${fresh.p.offer.id}`;
  expect(versions).toHaveLength(2);
});
