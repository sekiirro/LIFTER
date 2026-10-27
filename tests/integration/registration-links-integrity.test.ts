import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  registrationFixture,
  unavailableOfferFixture,
  missingCurrentVersionFixture,
  historicalVersionFixture,
  assertInsertGuardEnabled,
  pgcryptoCheck,
  issue,
  schedule,
  checked,
  secret,
  sql,
  type RegistrationFixture,
} from './registration-links-fixture';
let f: RegistrationFixture;
let id: string;
const db = sql();
type DirectInsertFixture = {
  wsA: { id: string };
  po: { userId: string };
};
function directInsert(
  f: DirectInsertFixture,
  versionId: string,
  overrides: {
    price_minor?: string;
    currency?: string;
    duration_days?: number;
    duration_months?: number | null;
    commission_rate_bp?: number;
    opened_at?: string | null;
    consumed_at?: string | null;
  } = {},
) {
  return db.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
    const [version] =
      await tx`select * from public.package_versions where workspace_id=${f.wsA.id} and id=${versionId}`;
    if (!version) throw new Error('fixture version missing');
    const durationMonths =
      overrides.duration_months === undefined
        ? version.duration_months
        : overrides.duration_months;
    await tx`insert into public.registration_links(workspace_id,package_version_id,token_hash,created_by,created_at,expires_at,opened_at,consumed_at,price_minor,currency,duration_days,duration_months,commission_rate_bp) values(${f.wsA.id},${versionId},${secret().hash},${f.po.userId},now(),now()+interval '24 hours',${overrides.opened_at ?? null},${overrides.consumed_at ?? null},${overrides.price_minor ?? version.price_minor},${overrides.currency ?? version.currency},${overrides.duration_days ?? version.duration_days},${durationMonths},${overrides.commission_rate_bp ?? version.commission_rate_bp})`;
  });
}
beforeAll(async () => {
  f = await registrationFixture();
  await assertInsertGuardEnabled(db);
  id = checked(await issue(f)) as string;
});
afterAll(() => db.end());
it('pgcrypto is installed in extensions with the known SHA-256 vector', async () => {
  expect(await pgcryptoCheck()).toEqual({
    extension: 'pgcrypto',
    schema: 'extensions',
    vector: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  });
});
it('parent and child force RLS with scoped SELECT-only policies', async () => {
  for (const table of [
    'registration_links',
    'registration_link_installments',
  ]) {
    const [row] =
      await db`select relrowsecurity,relforcerowsecurity from pg_class where oid=${'public.' + table}::regclass`;
    expect(row).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const policies =
      await db`select cmd,qual from pg_policies where schemaname='public' and tablename=${table}`;
    expect(policies).toHaveLength(1);
    expect(policies[0]!.cmd).toBe('SELECT');
    expect(policies[0]!.qual).toContain('generate_registration_link');
  }
});
it('fresh insert guard enforces exact snapshot, server time and NULL markers', async () => {
  for (const patch of [
    'price_minor+1 as price_minor',
    "'XXX'::char(3) as currency",
    'duration_days+1 as duration_days',
    '18 as commission_rate_bp',
    'now() as opened_at',
    'now() as consumed_at',
    "now()-interval '1 second' as created_at",
    "now()+interval '23 hours' as expires_at",
    "now()+interval '25 hours' as expires_at",
  ]) {
    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
        const cols = [
          'workspace_id',
          'package_version_id',
          'created_by',
          'created_at',
          'expires_at',
          'opened_at',
          'consumed_at',
          'price_minor',
          'currency',
          'duration_days',
          'duration_months',
          'commission_rate_bp',
        ];
        const target = patch.split(' as ').at(-1)!;
        const expressions = cols.map((c) =>
          c === target
            ? patch
            : c === 'created_at'
              ? 'now()'
              : c === 'expires_at'
                ? "now()+interval '24 hours'"
                : c === 'opened_at' || c === 'consumed_at'
                  ? 'null'
                  : c,
        );
        await tx.unsafe(
          `insert into public.registration_links(${cols.join(',')},token_hash) select ${expressions.join(',')},$2 from public.registration_links where id=$1`,
          [id, secret().hash],
        );
      }),
    ).rejects.toMatchObject({ code: '23514' });
  }
});
it('direct insert rejects duration_months/duration_days snapshot mismatch', async () => {
  for (const [duration_days, duration_months] of [
    [62, null],
    [90, 3],
  ] as const)
    await expect(
      directInsert(f, f.p.versionId, { duration_days, duration_months }),
    ).rejects.toMatchObject({ code: '23514', message: 'invalid_snapshot' });
});
it('direct insert guard rejects non-current, missing-current and unavailable source offers', async () => {
  const superseded = await historicalVersionFixture();
  await expect(
    directInsert(superseded, superseded.historicalVersionId),
  ).rejects.toMatchObject({ code: '22023', message: 'stale_terms' });
  const missingCurrent = await missingCurrentVersionFixture();
  await expect(
    directInsert(missingCurrent, missingCurrent.p.versionId),
  ).rejects.toMatchObject({ code: '22023', message: 'stale_terms' });
  const unavailable = await unavailableOfferFixture();
  await expect(
    directInsert(unavailable, unavailable.p.versionId),
  ).rejects.toMatchObject({ code: '22023', message: 'stale_terms' });
});
it('deferred sequence and offset checks reject shape even with exact totals', async () => {
  for (const [seq, offset] of [
    [3, 2],
    [2, 0],
  ])
    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
        const [row] =
          await tx`select public.issue_registration_link(${f.wsA.id},${f.p.versionId},${secret().hash},null) as id`;
        await tx`insert into public.registration_link_installments values(${f.wsA.id},${row!.id},1,400,0),(${f.wsA.id},${row!.id},${seq!},800,${offset!})`;
      }),
    ).rejects.toMatchObject({ code: '23514' });
});
it('JSON scalar null is not an absent SQL schedule', async () => {
  await expect(
    db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
      await tx`select public.issue_registration_link(${f.wsA.id},${f.p.versionId},${secret().hash},'null'::jsonb)`;
    }),
  ).rejects.toMatchObject({ code: '22023', message: 'invalid_input' });
});
it.each([
  'price_minor=1300',
  "currency='XXX'",
  'duration_days=62',
  'commission_rate_bp=18',
  "created_at=created_at+interval '1 second'",
  'opened_at=opened_at',
])('immutable parent %s including no-op xmin bypass', async (assignment) => {
  await expect(
    db.begin(async (tx) => {
      await tx.unsafe(
        `update public.registration_links set ${assignment} where id=$1`,
        [id],
      );
    }),
  ).rejects.toMatchObject({ code: '23514' });
});
it('populated opened_at overwrite and clear rejected under privileged SQL', async () => {
  const s = secret();
  const link = checked(await issue(f, f.po.client, { token_hash: s.hash }));
  checked(
    await f.actors.anon.client.rpc('registration_link_open', {
      token: s.token,
    }),
  );
  for (const expression of ['now()', 'null'])
    await expect(
      db.begin(async (tx) => {
        await tx.unsafe(
          `update public.registration_links set opened_at=${expression} where id=$1`,
          [link],
        );
      }),
    ).rejects.toMatchObject({ code: '23514' });
});
it('consumed transition is set-once; no F10 consume API', async () => {
  await db`update public.registration_links set consumed_at=now() where id=${id}`;
  for (const expression of ['now()', 'null'])
    await expect(
      db.begin(async (tx) => {
        await tx.unsafe(
          `update public.registration_links set consumed_at=${expression} where id=$1`,
          [id],
        );
      }),
    ).rejects.toMatchObject({ code: '23514' });
});
const roles = [
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
] as const;
it('child installment UPDATE denied for every role', async () => {
  const childLink = checked(
    await issue(f, f.po.client, { installments: schedule }),
  );
  for (const role of roles) {
    const denied = await f.actors[role].client
      .from('registration_link_installments')
      .update({ amount_minor: '1' })
      .eq('workspace_id', f.wsA.id)
      .eq('link_id', childLink)
      .eq('seq', 1);
    expect(denied.error).not.toBeNull();
  }
  const rows =
    await db`select amount_minor::text from public.registration_link_installments where workspace_id=${f.wsA.id} and link_id=${childLink} and seq=1`;
  expect(rows).toEqual([{ amount_minor: '400' }]);
});
it('child installment UPDATE guard rejects postgres and rollback-scoped service_role', async () => {
  const childLink = checked(
    await issue(f, f.po.client, { installments: schedule }),
  );
  await expect(
    db`update public.registration_link_installments set amount_minor=1 where workspace_id=${f.wsA.id} and link_id=${childLink}`,
  ).rejects.toMatchObject({
    code: '23514',
    message: 'Audit events are immutable',
  });
  await expect(
    db.begin(async (tx) => {
      await tx`grant select,update on public.registration_link_installments to service_role`;
      await tx.unsafe('set local role service_role');
      await tx`update public.registration_link_installments set amount_minor=1 where workspace_id=${f.wsA.id} and link_id=${childLink}`;
    }),
  ).rejects.toMatchObject({
    code: '23514',
    message: 'Audit events are immutable',
  });
});
it('all-role parent and child immutability matrix denies writes without grants', async () => {
  const childLink = checked(
    await issue(f, f.po.client, { installments: schedule }),
  );
  for (const role of roles) {
    for (const patch of [
      { price_minor: '1301' },
      { duration_days: 62 },
      { package_version_id: randomUUID() },
    ])
      expect(
        (
          await f.actors[role].client
            .from('registration_links')
            .update(patch)
            .eq('id', id)
        ).error,
      ).not.toBeNull();
    expect(
      (
        await f.actors[role].client
          .from('registration_links')
          .delete()
          .eq('id', id)
      ).error,
    ).not.toBeNull();
    for (const patch of [
      { amount_minor: '1' },
      { due_offset_days: 99 },
      { seq: 99 },
    ])
      expect(
        (
          await f.actors[role].client
            .from('registration_link_installments')
            .update(patch)
            .eq('workspace_id', f.wsA.id)
            .eq('link_id', childLink)
            .eq('seq', 1)
        ).error,
      ).not.toBeNull();
    expect(
      (
        await f.actors[role].client
          .from('registration_link_installments')
          .delete()
          .eq('workspace_id', f.wsA.id)
          .eq('link_id', childLink)
      ).error,
    ).not.toBeNull();
    expect(
      (
        await f.actors[role].client
          .from('registration_link_installments')
          .insert({
            workspace_id: f.wsA.id,
            link_id: childLink,
            seq: 99,
            amount_minor: '1',
            due_offset_days: 99,
          })
      ).error,
    ).not.toBeNull();
  }
  const [parent] =
    await db`select price_minor::text,duration_days from public.registration_links where id=${id}`;
  expect(parent).toEqual({ price_minor: '1200', duration_days: 61 });
  const children =
    await db`select seq,amount_minor::text,due_offset_days from public.registration_link_installments where workspace_id=${f.wsA.id} and link_id=${childLink} order by seq`;
  expect(children).toEqual([
    { seq: 1, amount_minor: '400', due_offset_days: 2 },
    { seq: 2, amount_minor: '800', due_offset_days: 12 },
  ]);
});
it('all-role populated opened_at/consumed_at overwrite and reset denied', async () => {
  const s = secret();
  const markerLink = checked(
    await issue(f, f.po.client, { token_hash: s.hash }),
  );
  checked(
    await f.actors.anon.client.rpc('registration_link_open', {
      token: s.token,
    }),
  );
  await db`update public.registration_links set consumed_at=now() where id=${markerLink}`;
  const [before] =
    await db`select opened_at::text,consumed_at::text from public.registration_links where id=${markerLink}`;
  const stamp = new Date().toISOString();
  for (const role of roles)
    for (const patch of [
      { opened_at: null },
      { opened_at: stamp },
      { consumed_at: null },
      { consumed_at: stamp },
    ])
      expect(
        (
          await f.actors[role].client
            .from('registration_links')
            .update(patch)
            .eq('id', markerLink)
        ).error,
      ).not.toBeNull();
  const [after] =
    await db`select opened_at::text,consumed_at::text from public.registration_links where id=${markerLink}`;
  expect(after).toEqual(before);
});
it('late first schedule row rejected for old unopened and later-opened parents', async () => {
  const s = secret();
  const link = checked(await issue(f, f.po.client, { token_hash: s.hash }));
  const attempt = () =>
    db.begin(async (tx) => {
      await tx`insert into public.registration_link_installments values(${f.wsA.id},${link},1,1200,2)`;
    });
  await expect(attempt()).rejects.toMatchObject({ code: '23514' });
  await expect(
    db.begin(async (tx) => {
      await tx`update public.registration_links set price_minor=price_minor where id=${link}`;
      await tx`insert into public.registration_link_installments values(${f.wsA.id},${link},1,1200,2)`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
  checked(
    await f.actors.anon.client.rpc('registration_link_open', {
      token: s.token,
    }),
  );
  await expect(attempt()).rejects.toMatchObject({ code: '23514' });
});
it('deferred sum rejects privileged invalid creation transaction at COMMIT', async () => {
  await expect(
    db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
      const [row] =
        await tx`select public.issue_registration_link(${f.wsA.id},${f.p.versionId},${secret().hash},null) as id`;
      await tx`insert into public.registration_link_installments values(${f.wsA.id},${row!.id},1,1199,2)`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
});
it('composite foreign workspace version FK independently rejects mismatch', async () => {
  await expect(
    db.begin(async (tx) => {
      await tx`alter table public.registration_links disable trigger registration_links_insert_guard`;
      await tx`insert into public.registration_links(workspace_id,package_version_id,token_hash,created_by,expires_at,price_minor,currency,duration_days,commission_rate_bp) values(${f.wsB.id},${f.p.versionId},${secret().hash},${f.po.userId},now()+interval '24 hours',1200,'XTS',61,17)`;
    }),
  ).rejects.toMatchObject({ code: '23503' });
  await expect(
    db.begin(async (tx) => {
      await tx`alter table public.registration_link_installments disable trigger registration_installments_insert_guard`;
      await tx`insert into public.registration_link_installments values(${f.wsB.id},${id},1,1200,0)`;
    }),
  ).rejects.toMatchObject({ code: '23503' });
});
it('DELETE/TRUNCATE guards independently reject privileged DML without FK masking', async () => {
  for (const privilegedRole of ['postgres', 'service_role'])
    for (const table of [
      'registration_links',
      'registration_link_installments',
    ])
      for (const op of ['delete', 'truncate']) {
        await expect(
          db.begin(async (tx) => {
            if (table === 'registration_links')
              await tx`alter table public.registration_link_installments drop constraint registration_link_installments_workspace_id_link_id_fkey`;
            if (table === 'registration_link_installments' && op === 'delete') {
              await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
              const [row] =
                await tx`select public.issue_registration_link(${f.wsA.id},${f.p.versionId},${secret().hash},null) as id`;
              await tx`insert into public.registration_link_installments values(${f.wsA.id},${row!.id},1,1200,0)`;
            }
            if (privilegedRole === 'service_role') {
              await tx.unsafe(`grant ${op} on public.${table} to service_role`);
              await tx.unsafe('set local role service_role');
            }
            await tx.unsafe(
              `${op === 'delete' ? 'delete from' : 'truncate'} public.${table}`,
            );
          }),
        ).rejects.toMatchObject({ code: '23514' });
      }
});
