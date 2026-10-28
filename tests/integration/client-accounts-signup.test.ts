import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { anonClient } from './harness';
import { backdated } from './registration-links-fixture';
import {
  clientContext,
  probe,
  signup,
  signupFixture,
  sql,
  type ClientContext,
} from './client-accounts-fixture';
let f: ClientContext;
let foreign: ClientContext;
const db = sql();
beforeAll(async () => {
  f = await clientContext();
  foreign = await clientContext();
});
afterAll(() => db.end());
async function empty(
  tx: Parameters<Parameters<typeof probe>[0]>[0],
  email: string,
  link: string,
) {
  expect(await tx`select 1 from auth.users where email=${email}`).toHaveLength(
    0,
  );
  expect(
    await tx`select 1 from auth.identities where identity_data->>'email'=${email}`,
  ).toHaveLength(0);
  expect(
    await tx`select 1 from app_private.account_identifier_claims where email_key=${email}`,
  ).toHaveLength(0);
  expect(
    await tx`select 1 from public.clients where registration_link_id=${link}`,
  ).toHaveLength(0);
  expect(
    await tx`select 1 from app_private.client_signup_operations where registration_link_id=${link}`,
  ).toHaveLength(0);
  expect(
    await tx`select 1 from public.registration_links where id=${link} and consumed_at is not null`,
  ).toHaveLength(0);
  expect(
    await tx`select 1 from public.audit_events where (target_id=${link} or details->>'link_id'=${link}) and action in ('client.signup_succeeded','registration_link.consumed')`,
  ).toHaveLength(0);
}
it('atomic confirmed pending signup, no session, real later sign-in and pending denial', async () => {
  const s = await signupFixture(f);
  const result = await anonClient().rpc('client_signup', {
    token: s.token,
    request_secret: s.request,
    admission_ticket: s.ticket,
    fields: s.fields,
  });
  expect(result.error === null, 'anon RPC returns no error details').toBe(true);
  expect(result.data).toEqual({ status: 'complete' });
  const [c] =
    await db`select c.*,u.email_confirmed_at is not null as confirmed from public.clients c join auth.users u on u.id=c.auth_user_id where c.registration_link_id=${s.link}`;
  expect(c).toMatchObject({
    workspace_id: f.wsA.id,
    package_version_id: f.p.versionId,
    approval_state: 'pending-approval',
    confirmed: true,
    name: s.fields.name,
  });
  expect(
    await db`select 1 from auth.sessions where user_id=${c!.auth_user_id}`,
  ).toHaveLength(0);
  expect(
    await db`select 1 from auth.identities where user_id=${c!.auth_user_id} and provider='email' and provider_id=${c!.auth_user_id}::text`,
  ).toHaveLength(1);
  expect(
    await db`select 1 from app_private.client_signup_operations where registration_link_id=${s.link}`,
  ).toHaveLength(1);
  const client = anonClient();
  const login = await client.auth.signInWithPassword({
    email: s.fields.email,
    password: s.fields.password,
  });
  expect(
    login.error === null,
    'later sign-in succeeds without diagnostic disclosure',
  ).toBe(true);
  expect((await client.from('clients').select('id')).data).toBeNull();
  await probe(async (tx) => {
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: c!.auth_user_id, role: 'authenticated' })},true)`;
    expect(
      (
        await tx`select app_private.has_workspace_access(${f.wsA.id}) as allowed`
      )[0]!.allowed,
    ).toBe(false);
  });
  const replay = await signup(db, s);
  expect(replay).toEqual({ status: 'invalid' });
  expect(
    await db`select 1 from public.clients where registration_link_id=${s.link}`,
  ).toHaveLength(1);
});
for (const stage of [
  'auth.users',
  'auth.identities',
  'app_private.account_identifier_claims',
  'public.clients',
  'public.registration_links',
  'app_private.client_signup_operations',
  'public.audit_events',
  'deferred',
])
  it(`rollback after ${stage}: redemption survives business failure, no usable orphan or success audit`, async () => {
    const s = await signupFixture(f);
    await probe(async (tx) => {
      await tx.unsafe(
        `create function pg_temp.u3_fail() returns trigger language plpgsql as $$ begin raise exception 'synthetic business failure' using errcode='P1100'; end $$`,
      );
      const table = stage === 'deferred' ? 'public.clients' : stage;
      const when =
        stage === 'deferred'
          ? 'constraint trigger u3_fault after insert'
          : 'trigger u3_fault after ' +
            (stage === 'public.registration_links' ? 'update' : 'insert');
      const condition =
        stage === 'public.audit_events'
          ? " when (new.action in ('client.signup_succeeded','registration_link.consumed'))"
          : '';
      await tx.unsafe(
        `create ${when} on ${table} ${stage === 'deferred' ? 'deferrable initially deferred ' : ''}for each row${condition} execute function pg_temp.u3_fail()`,
      );
      expect(await signup(tx, s)).toEqual({ status: 'invalid' });
      const login = await anonClient().auth.signInWithPassword({
        email: s.fields.email,
        password: s.fields.password,
      });
      expect(login.error !== null, 'rolled-back user cannot sign in').toBe(
        true,
      );
      await empty(tx, s.fields.email, s.link);
      expect(
        (
          await tx`select redeemed_at is not null as used from app_private.signup_admission_tickets where id=${s.ticket}`
        )[0]!.used,
      ).toBe(true);
      expect(
        await tx`select 1 from public.audit_events where details->>'link_id'=${s.link} and action='client.signup_failed'`,
      ).toHaveLength(1);
    });
  });
it('Q-M08: a committed business rollback leaves no GoTrue-usable Auth orphan', async () => {
  const s = await signupFixture(f);
  const result = await db.begin(async (tx) => {
    await tx.unsafe(
      `create function pg_temp.qm08_fail() returns trigger language plpgsql as $$ begin raise exception 'synthetic business failure' using errcode='P1100'; end $$`,
    );
    await tx.unsafe(
      'create trigger qm08_fail before insert on public.clients for each row execute function pg_temp.qm08_fail()',
    );
    const response = await signup(tx, s);
    await tx.unsafe('drop trigger qm08_fail on public.clients');
    return response;
  });
  expect(result).toEqual({ status: 'invalid' });

  const login = await anonClient().auth.signInWithPassword({
    email: s.fields.email,
    password: s.fields.password,
  });
  expect(login.error !== null, 'rolled-back user cannot sign in').toBe(true);
  expect(
    await db`select 1 from auth.users where email=${s.fields.email}`,
  ).toHaveLength(0);
});
it('zero-row consume RETURNING rolls back all writes', async () => {
  const s = await signupFixture(f);
  await probe(async (tx) => {
    await tx`alter table public.clients disable trigger signup_client_integrity`;
    await tx`alter table app_private.client_signup_operations disable trigger signup_operation_insert_guard`;
    await tx`create function pg_temp.u3_skip() returns trigger language plpgsql as $$ begin return null; end $$`;
    await tx`create trigger u3_skip before update on public.registration_links for each row execute function pg_temp.u3_skip()`;
    expect(await signup(tx, s)).toEqual({ status: 'invalid' });
    await empty(tx, s.fields.email, s.link);
  });
});
it('unknown SQLSTATE is unavailable and rolls redemption back; no diagnostics or secrets escape', async () => {
  const s = await signupFixture(f);
  await probe(async (tx) => {
    await tx`create function pg_temp.u3_infra() returns trigger language plpgsql as $$ begin raise exception 'synthetic infrastructure' using errcode='XX000'; end $$`;
    await tx`create trigger u3_infra after insert on auth.identities for each row execute function pg_temp.u3_infra()`;
    const result = await signup(tx, s);
    expect(result).toEqual({ status: 'unavailable' });
    await empty(tx, s.fields.email, s.link);
    expect(
      (
        await tx`select redeemed_at from app_private.signup_admission_tickets where id=${s.ticket}`
      )[0]!.redeemed_at,
    ).toBeNull();
    expect(
      await tx`select 1 from public.audit_events where target_id=${s.ticket}`,
    ).toHaveLength(0);
  });
});
it('C1 mismatch before all writes leaves ticket and audit unchanged', async () => {
  const s = await signupFixture(f);
  await probe(async (tx) => {
    await tx`create or replace function app_private.signup_auth_schema_compatible() returns boolean language sql stable security definer set search_path='' as $$ select false $$`;
    expect(await signup(tx, s)).toEqual({ status: 'unavailable' });
    await empty(tx, s.fields.email, s.link);
    expect(
      (
        await tx`select redeemed_at from app_private.signup_admission_tickets where id=${s.ticket}`
      )[0]!.redeemed_at,
    ).toBeNull();
    expect(
      await tx`select 1 from public.audit_events where target_id=${s.ticket}`,
    ).toHaveLength(0);
  });
});
it('Vault/proof absence is unavailable with no redemption', async () => {
  const s = await signupFixture(f);
  await probe(async (tx) => {
    await tx`create or replace function app_private.signup_ticket_redemption_proof(ticket uuid) returns text language sql volatile security definer set search_path='' as $$ select null::text $$`;
    expect(await signup(tx, s)).toEqual({ status: 'unavailable' });
    await empty(tx, s.fields.email, s.link);
    expect(
      (
        await tx`select redeemed_at from app_private.signup_admission_tickets where id=${s.ticket}`
      )[0]!.redeemed_at,
    ).toBeNull();
  });
});
it('D-08 collisions are duplicate while link-class failures remain invalid', async () => {
  const first = await signupFixture(f);
  expect(await signup(db, first)).toEqual({ status: 'complete' });
  const s = await signupFixture(f);
  const responses = [];
  for (const fields of [
    { ...s.fields, email: first.fields.email },
    { ...s.fields, phone: first.fields.phone },
    { ...s.fields, email: first.fields.email, phone: first.fields.phone },
  ]) {
    const fresh = await signupFixture(f);
    responses.push(await signup(db, fresh, fields));
  }
  for (const result of responses)
    expect(JSON.stringify(result)).toBe('{"status":"duplicate"}');
  responses.length = 0;
  responses.push(await signup(db, first));
  responses.push(await signup(db, { ...s, token: 'unknown' }));
  responses.push(
    await signup(db, { ...s, token: randomBytes(32).toString('base64url') }),
  );
  responses.push(
    await signup(db, { ...s, request: randomBytes(32).toString('base64url') }),
  );
  const forged = await signupFixture(f);
  responses.push(await signup(db, { ...s, ticket: forged.ticket }));
  responses.push(
    await signup(db, s, {
      ...s.fields,
      workspace_id: f.wsB.id,
    } as typeof s.fields),
  );
  responses.push(await signup(db, { ...s, request: randomUUID() }));
  for (const result of responses) expect(result).toEqual({ status: 'invalid' });
  const payload = JSON.stringify([
    ...responses,
    ...(await db`select details from public.audit_events where action like 'client.signup_%'`),
  ]);
  const forbidden = [
    first.token,
    first.hash,
    first.request,
    first.fields.password,
    s.token,
    s.hash,
    s.request,
    s.fields.password,
  ];
  expect(
    forbidden.some((value) => payload.includes(value)),
    'no secret in return or audit',
  ).toBe(false);
});
for (const [label, password, valid] of [
  ['7', 'Aa1!abc', false],
  ['8', 'Aa1!abcd', true],
  ['multibyte7', '\u00e9'.repeat(5) + '1!', false],
  ['multibyte8', '\u00e9'.repeat(6) + '1!', true],
  ['72bytes', '\u00e9'.repeat(35) + '1!', true],
  ['73bytes', '\u00e9'.repeat(35) + 'a1!', false],
  ['no-digit', 'Abcdefg!', false],
  ['no-symbol', 'Abcdefg1', false],
  ['whitespace-symbol', 'Abcdef1 ', false],
] as const)
  it(`password ${label} boundary`, async () => {
    const s = await signupFixture(f);
    expect(await signup(db, s, { ...s.fields, password })).toEqual({
      status: valid ? 'complete' : 'invalid',
    });
  });
it('NUL cannot cross PostgreSQL jsonb boundary; captured errors exclude plaintext', async () => {
  const s = await signupFixture(f);
  await probe(async (tx) => {
    const before = await tx`select count(*)::int as n from public.audit_events`;
    const [r] =
      await tx`select to_regprocedure('public.client_signup(text,text,uuid,jsonb)') is not null as present`;
    expect(r!.present).toBe(true);
    let safe = false;
    try {
      await tx.savepoint(async (inner) => {
        await inner`select ${inner.json({ ...s.fields, password: s.fields.password + String.fromCodePoint(0) })}::jsonb`;
      });
    } catch (error) {
      const e = error as { code: string; message: string };

      safe =
        ['22P05', '22021'].includes(e.code) &&
        ![s.fields.password, s.request, s.token].some((secret) =>
          e.message.includes(secret),
        );
    }
    expect(safe, 'NUL rejected without echoing credentials').toBe(true);
    expect(
      await tx`select count(*)::int as n from public.audit_events`,
    ).toEqual(before);
  });
});
it('same-link simultaneous requests serialize, exactly one identity and receipt', async () => {
  const s = await signupFixture(f);
  const other = sql();
  try {
    const results = await Promise.all([
      signup(db, s),
      signup(other, {
        ...s,
        fields: { ...s.fields, email: `u3-${randomUUID()}@example.test` },
      }),
    ]);
    expect(results.map((x) => x.status).sort()).toEqual([
      'complete',
      'invalid',
    ]);
    expect(
      await db`select 1 from public.clients where registration_link_id=${s.link}`,
    ).toHaveLength(1);
    expect(
      await db`select 1 from app_private.client_signup_operations where registration_link_id=${s.link}`,
    ).toHaveLength(1);
  } finally {
    await other.end();
  }
});
it('Q-M01/M11: observed row-lock wait crosses strict expiry; fresh post-wait time rejects', async () => {
  const s = await signupFixture(f);
  const expired = await backdated(f, new Date(Date.now() + 1800).toISOString());
  // Bind a new synthetic ticket to this shortly expiring link, preserving token key.
  const [t] =
    await db`insert into app_private.signup_admission_tickets(link_key,request_secret_hash,workspace_id,link_id)
 select extensions.hmac(convert_to('lifter.f11.link.v1','UTF8')||decode('00','hex')||int4send(octet_length(${expired.hash}::text))||convert_to(${expired.hash},'UTF8'),decode(decrypted_secret,'hex'),'sha256'),extensions.digest(${s.request},'sha256'),${f.wsA.id},${expired.id} from vault.decrypted_secrets where name='SIGNUP_RATE_KEY' returning id`;
  const locker = sql(),
    observer = sql(),
    worker = sql();
  await db`create sequence app_private.u3_auth_probe_seq`;
  await db`create function app_private.u3_auth_probe() returns trigger language plpgsql security definer set search_path='' as $$ begin perform nextval('app_private.u3_auth_probe_seq'); return new; end $$`;
  await db`create trigger u3_auth_probe after insert on auth.users for each row execute function app_private.u3_auth_probe()`;
  let pending: Promise<unknown>;
  try {
    await locker.begin(async (tx) => {
      await tx`select 1 from public.registration_links where id=${expired.id} for update`;
      pending = signup(worker, {
        ...s,
        token: expired.token,
        link: expired.id,
        ticket: t!.id,
      });
      let blocked = false;
      for (let n = 0; n < 100; n++) {
        const [r] =
          await observer`select exists(select 1 from pg_stat_activity where wait_event_type='Lock' and query like '%public.client_signup(%') as waiting`;
        if (r!.waiting) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      expect(
        blocked,
        'signup must wait on link FOR UPDATE before inner writes',
      ).toBe(true);
      let ticketUnlocked = true;
      try {
        await observer.begin(async (check) => {
          await check`select id from app_private.signup_admission_tickets where id=${t!.id} for update nowait`;
        });
      } catch {
        ticketUnlocked = false;
      }
      expect(
        ticketUnlocked,
        'link lock must precede redemption, independently of client guard',
      ).toBe(true);
      await tx`select pg_sleep(greatest(0,extract(epoch from (${new Date(Date.now() + 1900).toISOString()}::timestamptz-clock_timestamp()))))`;
      // Commit the lock before awaiting the worker.
    });
    expect(await pending!).toEqual({ status: 'invalid' });
    const [attempt] =
      await observer`select is_called from app_private.u3_auth_probe_seq`;
    expect(
      attempt!.is_called,
      'post-lock expiry rejects before any Auth INSERT, independently of U2 rollback',
    ).toBe(false);
    await probe(async (tx) => empty(tx, s.fields.email, expired.id));
  } finally {
    await Promise.all([locker.end(), observer.end(), worker.end()]);
    await db`drop trigger u3_auth_probe on auth.users`;
    await db`drop function app_private.u3_auth_probe()`;
    await db`drop sequence app_private.u3_auth_probe_seq`;
  }
});

it('privileged consume after strict expiry rejects despite F10 grace', async () => {
  const grace = await backdated(
    f,
    new Date(Date.now() - 1000).toISOString(),
    new Date(Date.now() - 60_000).toISOString(),
  );
  expect(
    (
      await f.actors.anon.client.rpc('registration_link_open', {
        token: grace.token,
      })
    ).data,
  ).toMatchObject({ status: 'valid' });
  await expect(
    probe(async (tx) => {
      await tx`update public.registration_links set consumed_at=now() where id=${grace.id}`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
});

it('C3 caught exceptions containing canary credentials never escape or enter audit', async () => {
  for (const code of ['P1100', 'XX000']) {
    const s = await signupFixture(f);
    await probe(async (tx) => {
      await tx`select set_config('u3.canary',${[s.token, s.hash, s.request, s.fields.password].join(':')},true)`;
      await tx.unsafe(
        `create function pg_temp.u3_secret_failure() returns trigger language plpgsql as $$ begin raise exception using errcode='${code}',message=current_setting('u3.canary'),detail=current_setting('u3.canary'),hint=current_setting('u3.canary'); end $$`,
      );
      await tx`create trigger u3_secret_failure after insert on auth.identities for each row execute function pg_temp.u3_secret_failure()`;
      const messages: string[] = [];
      let result: unknown;
      try {
        result = await signup(tx, s);
      } catch (error) {
        messages.push((error as Error).message);
      }
      expect(result).toEqual({
        status: code === 'P1100' ? 'invalid' : 'unavailable',
      });
      const payload = JSON.stringify([
        result,
        messages,
        await tx`select details from public.audit_events where details->>'link_id'=${s.link}`,
      ]);
      expect(
        [s.token, s.hash, s.request, s.fields.password].some((secret) =>
          payload.includes(secret),
        ),
        'no canary credential escaped',
      ).toBe(false);
    });
  }
});
it('authenticated visitor is denied without linking or mutation', async () => {
  const s = await signupFixture(f);
  await probe(async (tx) => {
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
    expect(await signup(tx, s)).toEqual({ status: 'invalid' });
    await empty(tx, s.fields.email, s.link);
  });
});
for (const fields of [
  { name: '' },
  { email: '' },
  { phone: '201234567890' },
  { phone: '+20 1234567890' },
  { password: '' },
  { role: 'platform_owner' },
  { telegram: 'synthetic' },
])
  it(`field contract rejects ${Object.keys(fields)[0]} override/empty/noncanonical`, async () => {
    const s = await signupFixture(f);
    expect(await signup(db, s, { ...s.fields, ...fields })).toEqual({
      status: 'invalid',
    });
  });

it('Q-M02: strict consume predicate rejects expiry during client work independently of update/deferred guards', async () => {
  const s = await signupFixture(f);
  await probe(async (tx) => {
    await tx`alter table public.registration_links disable trigger registration_links_update_guard`;
    await tx`update public.registration_links set expires_at=statement_timestamp()+interval '500 milliseconds',created_at=statement_timestamp()+interval '500 milliseconds'-interval '24 hours' where id=${s.link}`;
    await tx`create function pg_temp.u3_delay() returns trigger language plpgsql as $$ begin perform pg_sleep(0.6); return new; end $$`;
    await tx`create trigger u3_delay after insert on public.clients for each row execute function pg_temp.u3_delay()`;
    expect(await signup(tx, s)).toEqual({ status: 'invalid' });
    await empty(tx, s.fields.email, s.link);
  });
});
it('lock/hash/clock/guard order is installed in the bounded database function', async () => {
  const [row] =
    await db`select pg_get_functiondef('public.client_signup(text,text,uuid,jsonb)'::regprocedure) as body`;
  const body = String(row!.body);
  const points = [
    'signup_auth_schema_compatible()',
    'signup_password_policy()',
    'extensions.crypt(',
    'for update;',
    'sampled_at:=clock_timestamp();',
    'redeem_signup_admission_ticket(',
    'signup_lock_identity_keys(',
    'insert into auth.users(',
    'insert into auth.identities(',
    'insert into public.clients(',
    'update public.registration_links',
    'insert into app_private.client_signup_operations(',
    'set constraints all immediate;',
  ];
  const offsets = points.map((point) => body.indexOf(point));
  expect(offsets.every((offset) => offset >= 0)).toBe(true);
  expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  expect(body).toContain(
    'l.consumed_at is null and sampled_at<l.expires_at returning l.id into consumed',
  );
  expect(body).toContain('if consumed is null then');
});
it('invalid link precedes canonical collision locking', async () => {
  const s = await signupFixture(f);
  const expired = await backdated(f, new Date(Date.now() - 1000).toISOString());
  await probe(async (tx) => {
    await tx`alter table public.registration_links disable trigger registration_links_update_guard`;
    await tx`update public.registration_links set expires_at=statement_timestamp()-interval '1 second',created_at=statement_timestamp()-interval '1 second'-interval '24 hours' where id=${s.link}`;
    // A canonical duplicate would raise here if locking happened before link validity.
    await tx`create or replace function app_private.signup_lock_identity_keys(identity_id uuid,keys text[]) returns void language plpgsql security definer set search_path='' as $$ begin raise exception 'synthetic infrastructure' using errcode='XX000'; end $$`;
    expect(await signup(tx, s)).toEqual({ status: 'invalid' });
    expect(
      (
        await tx`select redeemed_at is not null as used from app_private.signup_admission_tickets where id=${s.ticket}`
      )[0]!.used,
    ).toBe(true);
  });
  expect(
    (
      await f.actors.anon.client.rpc('registration_link_open', {
        token: expired.token,
      })
    ).data,
  ).toEqual({ status: 'invalid' });
});

it('known GoTrue confirmed email/password markers and captured bcrypt cost are populated', async () => {
  const s = await signupFixture(f);
  expect(await signup(db, s)).toEqual({ status: 'complete' });
  const [r] =
    await db`select u.raw_user_meta_data,u.is_super_admin,u.phone is null as phone_null,substring(u.encrypted_password,5,2)='10' as captured_cost,i.identity_data-'email'-'sub' as identity_flags from auth.users u join auth.identities i on i.user_id=u.id where u.email=${s.fields.email}`;
  expect(r).toEqual({
    raw_user_meta_data: { email_verified: true },
    is_super_admin: null,
    phone_null: true,
    captured_cost: true,
    identity_flags: { email_verified: false, phone_verified: false },
  });
});

for (const [label, password, valid] of [
  ['format-control', 'Abcdef1' + String.fromCodePoint(0x200d), false],
  ['private-use', 'Abcdef1' + String.fromCodePoint(0xe000), false],
  ['unicode-digit', 'Abcdef!' + String.fromCodePoint(0x0661), true],
  ['emoji-symbol', 'Abcdef1' + String.fromCodePoint(0x1f600), true],
] as const)
  it(`Unicode password category ${label}`, async () => {
    const s = await signupFixture(f);
    expect(await signup(db, s, { ...s.fields, password })).toEqual({
      status: valid ? 'complete' : 'invalid',
    });
  });

it('Q-M12: lost-response receipt binds original request/link/client and replay cannot change identity', async () => {
  const s = await signupFixture(f);
  expect(await signup(db, s)).toEqual({ status: 'complete' });
  const [before] =
    await db`select id,auth_user_id,client_id,registration_link_id,request_secret_hash=extensions.digest(${s.request},'sha256') as bound from app_private.client_signup_operations where registration_link_id=${s.link}`;
  expect(before!.bound).toBe(true);
  for (const retry of [
    s,
    { ...s, request: randomUUID() },
    { ...s, fields: { ...s.fields, email: `u3-${randomUUID()}@example.test` } },
  ])
    expect(await signup(db, retry)).toEqual({ status: 'invalid' });
  const [after] =
    await db`select id,auth_user_id,client_id,registration_link_id,request_secret_hash=extensions.digest(${s.request},'sha256') as bound from app_private.client_signup_operations where registration_link_id=${s.link}`;
  expect(after).toEqual(before);
  expect(
    await db`select 1 from public.clients where registration_link_id=${s.link}`,
  ).toHaveLength(1);
  expect(
    await db`select 1 from public.audit_events where details->>'link_id'=${s.link} and action='client.signup_succeeded'`,
  ).toHaveLength(1);
});

for (const kind of ['pending', 'active', 'staff', 'archived'] as const)
  for (const scope of ['same', 'foreign'] as const)
    for (const field of ['email', 'phone', 'both'] as const)
      it(`D-08 ${kind}/${scope}/${field} byte-identical with redeemed ticket and safe audit`, async () => {
        const s = await signupFixture(f);
        const existing = await signupFixture(scope === 'same' ? f : foreign);
        await probe(async (tx) => {
          // Archived state is undefined: exercise its retained canonical claim,
          // without inventing a client state or release policy.
          const id = randomUUID();
          const email =
            field === 'phone' ? existing.fields.email : s.fields.email;
          const phone =
            field === 'email' ? existing.fields.phone : s.fields.phone;
          if (kind === 'pending') {
            expect(
              await signup(tx, existing, { ...existing.fields, email, phone }),
            ).toEqual({ status: 'complete' });
          } else {
            await tx`insert into auth.users(id,email,phone,email_confirmed_at,deleted_at) values(${id},${email},${phone},clock_timestamp(),${kind === 'archived' ? new Date() : null})`;
            if (kind === 'staff') {
              await tx`insert into public.staff_profiles(user_id,role) values(${id},'trainer')`;
              await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by) values(${scope === 'same' ? f.wsA.id : foreign.wsA.id},${id},${f.po.userId})`;
            }
          }
          await tx`set constraints all deferred`;
          expect(JSON.stringify(await signup(tx, s))).toBe(
            '{"status":"duplicate"}',
          );
          expect(
            (
              await tx`select redeemed_at is not null as used from app_private.signup_admission_tickets where id=${s.ticket}`
            )[0]!.used,
          ).toBe(true);
          const audits =
            await tx`select details from public.audit_events where action='client.signup_failed' and details->>'link_id'=${s.link}`;
          expect(audits).toHaveLength(1);
          expect(Object.keys(audits[0]!.details).sort()).toEqual([
            'link_id',
            'outcome_class',
            'timestamp',
            'workspace_id',
          ]);
          expect(audits[0]!.details.outcome_class).toBe('failure');
          await tx`alter table public.registration_links disable trigger registration_links_update_guard`;
          await tx`update public.registration_links set expires_at=statement_timestamp()-interval '1 second',created_at=statement_timestamp()-interval '24 hours 1 second' where id=${s.link}`;
          expect(JSON.stringify(await signup(tx, s))).toBe(
            '{"status":"invalid"}',
          );
        });
      });
