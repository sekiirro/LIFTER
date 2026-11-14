import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { anonClient, loadEnv } from './harness';
import {
  registrationFixture,
  issue,
  secret,
  checked,
  backdated,
  assertInsertGuardEnabled,
  sql,
  type RegistrationFixture,
} from './registration-links-fixture';
import { registrationLinkValidity } from '../../lib/registration-links/grace';
import {
  graceClockRows,
  graceExpiry,
} from '../fixtures/registration-links-clock';
let f: RegistrationFixture;
const db = sql();
beforeAll(async () => {
  f = await registrationFixture();
  await assertInsertGuardEnabled(db);
});
afterAll(() => db.end());
it('valid anonymous/concurrent/repeated opens set first marker and emit one anonymous event', async () => {
  const s = secret();
  const id = checked(await issue(f, f.salesA.client, { token_hash: s.hash }));
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      anonClient().rpc('registration_link_open', { token: s.token }),
    ),
  );
  for (const r of results)
    expect(r.data).toEqual({ status: 'valid', workspace_name: f.wsA.name });
  const [first] =
    await db`select opened_at,consumed_at from public.registration_links where id=${id}`;
  expect(first!.opened_at).not.toBeNull();
  expect(first!.consumed_at).toBeNull();
  expect(
    (await f.trainerB.client.rpc('registration_link_open', { token: s.token }))
      .data,
  ).toEqual({ status: 'valid', workspace_name: f.wsA.name });
  const [later] =
    await db`select opened_at,consumed_at from public.registration_links where id=${id}`;
  expect(later).toEqual(first);
  const events =
    await db`select actor_user_id,details from public.audit_events where target_id=${id} and action='registration_link.opened'`;
  expect(events).toEqual([{ actor_user_id: null, details: {} }]);
});
it('all unusable states return identical exact JSON and no opened audit', async () => {
  const expired = await backdated(
    f,
    new Date(Date.now() - 7200000).toISOString(),
  );
  const pastGrace = await backdated(
    f,
    new Date(Date.now() - 3600000).toISOString(),
    new Date(Date.now() - 4200000).toISOString(),
  );
  const consumed = await backdated(
    f,
    new Date(Date.now() + 3600000).toISOString(),
    null,
    new Date().toISOString(),
  );
  for (const token of [
    null,
    'bad',
    secret().token,
    expired.token,
    pastGrace.token,
    consumed.token,
  ]) {
    const r = await anonClient().rpc('registration_link_open', { token });
    expect(r.error).toBeNull();
    expect(r.data).toEqual({ status: 'invalid' });
  }
  const rows =
    await db`select id from public.audit_events where target_id in (${expired.id},${pastGrace.id},${consumed.id}) and action='registration_link.opened'`;
  expect(rows).toHaveLength(0);
});
it('pre-expiry open grants remaining grace without sliding, early opening never shortens expiry', async () => {
  const now = Date.now();
  const grace = await backdated(
    f,
    new Date(now - 60000).toISOString(),
    new Date(now - 600000).toISOString(),
  );
  const early = await backdated(
    f,
    new Date(now + 3600000).toISOString(),
    new Date(now - 7200000).toISOString(),
  );
  for (const s of [grace, early]) {
    const [before] =
      await db`select expires_at,opened_at from public.registration_links where id=${s.id}`;
    expect(
      (await anonClient().rpc('registration_link_open', { token: s.token }))
        .data,
    ).toEqual({ status: 'valid', workspace_name: f.wsA.name });
    const [after] =
      await db`select expires_at,opened_at from public.registration_links where id=${s.id}`;
    expect(after).toEqual(before);
  }
});
it('SQL/TS strict clock matrix parity including microsecond equality', async () => {
  const E = graceExpiry;
  for (const [opened, now] of graceClockRows)
    for (const consumed of [null, E - 1]) {
      const [r] =
        await db`select app_private.registration_link_is_valid(${new Date(E).toISOString()},${opened === null ? null : new Date(opened).toISOString()},${consumed === null ? null : new Date(consumed).toISOString()},${new Date(now).toISOString()}) as valid`;
      expect(r!.valid).toBe(
        registrationLinkValidity(
          { expiresAt: E, openedAt: opened, consumedAt: consumed },
          now,
        ).valid,
      );
    }
  const [r] =
    await db`select app_private.registration_link_is_valid('2026-10-20 00:00:00.000001Z',null,null,'2026-10-20 00:00:00Z') as before, app_private.registration_link_is_valid('2026-10-20 00:00:00.000001Z',null,null,'2026-10-20 00:00:00.000001Z') as equal, app_private.registration_link_is_valid('2026-10-20 00:00:00Z','2026-10-19 23:50:00Z',null,'2026-10-20 00:19:59.999999Z') as grace_before, app_private.registration_link_is_valid('2026-10-20 00:00:00Z','2026-10-19 23:50:00Z',null,'2026-10-20 00:20:00Z') as grace_equal`;
  expect(r).toEqual({
    before: true,
    equal: false,
    grace_before: true,
    grace_equal: false,
  });
});
it('hashes the same encoded token with node:crypto and SQL digest', async () => {
  const s = secret();
  const [row] =
    await db`select encode(extensions.digest(${s.token},'sha256'),'hex') as hash`;
  expect(row!.hash).toBe(s.hash);
  expect(createHash('sha256').update(s.token).digest('hex')).toBe(s.hash);
});
it('denies anonymous and direct secret-column base-table SELECT', async () => {
  expect(
    (await anonClient().from('registration_links').select('id')).error,
  ).not.toBeNull();
  expect(
    (
      await anonClient()
        .from('registration_link_installments')
        .select('link_id')
    ).error,
  ).not.toBeNull();
  for (const name of ['po', 'woA', 'salesA', 'trainerA'] as const) {
    const client = f.actors[name].client;
    for (const column of ['token_hash', 'commission_rate_bp', '*'])
      expect(
        (await client.from('registration_links').select(column)).error,
      ).not.toBeNull();
  }
  for (const table of [
    'registration_links',
    'registration_link_installments',
  ]) {
    const [grant] =
      await db`select has_table_privilege('authenticated',${'public.' + table},'SELECT') as allowed`;
    expect(grant!.allowed).toBe(false);
    const [anonGrant] =
      await db`select has_table_privilege('anon',${'public.' + table},'SELECT') as allowed`;
    expect(anonGrant!.allowed).toBe(false);
  }
});
it('first open at expiry is refused and strictly-before-expiry is accepted at microsecond precision', async () => {
  async function boundaryOpen(offset: string) {
    const s = secret();
    const id = await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
      await tx`alter table public.registration_links disable trigger registration_links_insert_guard`;
      const [row] =
        await tx`insert into public.registration_links(workspace_id,package_version_id,token_hash,created_by,created_at,expires_at,price_minor,currency,duration_days,duration_months,commission_rate_bp) values(${f.wsA.id},${f.p.versionId},${s.hash},${f.po.userId},now()+${offset}::interval-interval '24 hours',now()+${offset}::interval,1200,'USD',61,null,17) returning id`;
      await tx`set constraints all immediate`;
      await tx`alter table public.registration_links enable trigger registration_links_insert_guard`;
      const [opened] =
        await tx`select public.registration_link_open(${s.token}) as result`;
      return { id: row!.id as string, result: opened!.result };
    });
    await assertInsertGuardEnabled(db);
    return id;
  }
  const before = await boundaryOpen('1 microsecond');
  expect(before.result).toEqual({
    status: 'valid',
    workspace_name: f.wsA.name,
  });
  const [opened] =
    await db`select opened_at is not null as opened, consumed_at from public.registration_links where id=${before.id}`;
  expect(opened!.opened).toBe(true);
  expect(opened!.consumed_at).toBeNull();
  const at = await boundaryOpen('0 microseconds');
  expect(at.result).toEqual({ status: 'invalid' });
  const [row] =
    await db`select opened_at,consumed_at from public.registration_links where id=${at.id}`;
  expect(row!.opened_at).toBeNull();
  expect(row!.consumed_at).toBeNull();
});
it('has no IP dependency for valid or invalid opens', async () => {
  const env = loadEnv();
  const clientFor = (ip: string) =>
    createClient(env.apiUrl, env.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { headers: { 'x-forwarded-for': ip, 'x-real-ip': ip } },
    });
  const s = secret();
  const id = checked(await issue(f, f.salesA.client, { token_hash: s.hash }));
  const first = await clientFor('203.0.113.7').rpc('registration_link_open', {
    token: s.token,
  });
  const [opened] =
    await db`select opened_at from public.registration_links where id=${id}`;
  const second = await clientFor('198.51.100.42').rpc(
    'registration_link_open',
    { token: s.token },
  );
  expect(first.data).toEqual({
    status: 'valid',
    workspace_name: f.wsA.name,
  });
  expect(second.data).toEqual(first.data);
  const [same] =
    await db`select opened_at from public.registration_links where id=${id}`;
  expect(same).toEqual(opened);
  for (const client of [clientFor('203.0.113.7'), clientFor('198.51.100.42')])
    expect(
      (await client.rpc('registration_link_open', { token: secret().token }))
        .data,
    ).toEqual({ status: 'invalid' });
});
