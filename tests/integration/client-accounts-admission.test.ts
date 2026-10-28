import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { proof, admit, counts, mac } from './client-accounts-admission-fixture';
import { anonClient } from './harness';
import { spawnSync } from 'node:child_process';
import { localSupabaseContainer } from './local-docker';

it('admission uses only its single limits owner and unresolved limits roll back every write', async () => {
  const a = await signupFixture(f),
    b = await signupFixture(f),
    ip = randomBytes(32);
  await probe(async (tx) => {
    await tx`create or replace function app_private.client_signup_limits() returns jsonb language sql immutable security definer set search_path='' as $$select '{"link_limit":2,"ip_limit":3,"link_window_seconds":900,"ip_window_seconds":3600,"fixed_windows":true,"every_admission_counts":true}'::jsonb$$`;
    for (let i = 0; i < 2; i++)
      expect((await admit(tx, proof(a.token, { ip }))).status).toBe('admitted');
    expect((await admit(tx, proof(b.token, { ip }))).status).toBe('admitted');
    expect(await admit(tx, proof(a.token, { ip }))).toEqual({
      status: 'invalid',
    });
    expect(await admit(tx, proof(b.token, { ip }))).toEqual({
      status: 'invalid',
    });
  });
  await probe(async (tx) => {
    const before = await counts(tx);
    await tx`create or replace function app_private.client_signup_limits() returns jsonb language sql immutable security definer set search_path='' as $$select null::jsonb$$`;
    expect(await admit(tx, proof(a.token))).toEqual({ status: 'unavailable' });
    expect(await counts(tx)).toEqual(before);
  });
});

it('expired, consumed and malformed-request submissions still count both windows and issue no ticket', async () => {
  for (const state of ['expired', 'consumed', 'request'] as const) {
    const s = await signupFixture(f),
      p = proof(s.token);
    await probe(async (tx) => {
      if (state === 'expired') {
        await tx`alter table public.registration_links disable trigger registration_links_update_guard`;
        await tx`update public.registration_links set expires_at=statement_timestamp()-interval '1 second',created_at=statement_timestamp()-interval '24 hours 1 second' where id=${s.link}`;
      }
      if (state === 'consumed')
        expect(await signup(tx, s)).toEqual({ status: 'complete' });
      const before = await counts(tx);
      expect(
        await admit(tx, state === 'request' ? { ...p, request: 'short' } : p),
      ).toEqual({ status: 'invalid' });
      const after = await counts(tx);
      expect(after!.credits - before!.credits).toBe(2);
      expect(after!.tickets).toBe(before!.tickets);
      expect(after!.attempts - before!.attempts).toBe(1);
      expect(after!.audits - before!.audits).toBe(2);
    });
  }
});

it('C1 mismatch emits a code/timestamp-only server event with zero database writes', async () => {
  const s = await signupFixture(f),
    p = proof(s.token),
    since = new Date().toISOString();
  await probe(async (tx) => {
    const before = await counts(tx);
    await tx`create or replace function app_private.signup_auth_schema_compatible() returns boolean language sql stable security definer set search_path='' as $$select false$$`;
    expect(await admit(tx, p)).toEqual({ status: 'unavailable' });
    expect(await counts(tx)).toEqual(before);
  });
  const capture = spawnSync(
    'docker',
    ['logs', '--since', since, localSupabaseContainer('db')],
    { encoding: 'utf8', windowsHide: true, timeout: 10000 },
  );
  expect(capture.status === 0, 'DB log capture succeeded').toBe(true);
  expect(
    [p.token, p.request, p.ip.toString('hex'), p.link.toString('hex')].some(
      (value) => (capture.stdout + capture.stderr).includes(value),
    ),
    'C1 event has no attribution or credentials',
  ).toBe(false);

  const match = (capture.stdout + capture.stderr).match(
    /\{[^\r\n]*AUTH_COMPAT_GUARD_FAILED[^\r\n]*\}/,
  );
  expect(Boolean(match), 'structured C1 server event exists').toBe(true);
  const event = JSON.parse(match![0]);
  expect(Object.keys(event).sort()).toEqual(['code', 'timestamp']);
  expect(event.code).toBe('AUTH_COMPAT_GUARD_FAILED');
  expect(Number.isFinite(Date.parse(event.timestamp))).toBe(true);
});

it('C1 privacy: attribution and credentials never enter operational/audit evidence or captured local logs', async () => {
  const since = new Date().toISOString(),
    s = await signupFixture(f),
    p = proof(s.token);
  expect((await admit(db, p)).status).toBe('admitted');
  const [r] =
    await db`select jsonb_build_object('attempts',(select jsonb_agg(t) from app_private.client_signup_attempts t),'audit',(select jsonb_agg(a) from public.audit_events a where action like 'client.signup_%')) as evidence`;
  const forbidden = [
    p.ip.toString('hex'),
    p.link.toString('hex'),
    p.token,
    p.request,
    s.fields.password,
    s.fields.email,
    s.fields.phone,
    s.hash,
    process.env.SIGNUP_RATE_KEY!,
    process.env.SIGNUP_ATTEST_KEY!,
  ];
  const safe = (body: string) => !forbidden.some((v) => body.includes(v));
  expect(
    safe(JSON.stringify(r!.evidence)),
    'no attribution, PII or credential in evidence',
  ).toBe(true);
  for (const container of [
    localSupabaseContainer('db'),
    localSupabaseContainer('auth'),
  ]) {
    const result = spawnSync('docker', ['logs', '--since', since, container], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 8 * 1024 * 1024,
    });
    expect(result.status === 0, 'local log capture succeeded').toBe(true);
    expect(
      safe(result.stdout + result.stderr),
      'no attribution, PII or credential in local logs',
    ).toBe(true);
  }
});

it('direct RPC cannot bypass ticket/request/link binding; real admitted ticket succeeds once', async () => {
  const s = await signupFixture(f),
    p = proof(s.token),
    other = await signupFixture(f);
  const a = await admit(db, p);
  expect(a.status).toBe('admitted');
  const anon = anonClient();
  for (const patch of [
    { admission_ticket: randomUUID() },
    { request_secret: randomBytes(32).toString('base64url') },
    { token: other.token },
  ]) {
    const result = await anon.rpc('client_signup', {
      token: s.token,
      request_secret: p.request,
      admission_ticket: a.admission_ticket,
      fields: s.fields,
      ...patch,
    });
    expect(result.error === null).toBe(true);
    expect(result.data).toEqual({ status: 'invalid' });
  }
  expect(
    await signup(db, { ...s, request: p.request, ticket: a.admission_ticket }),
  ).toEqual({ status: 'complete' });
  expect(
    await signup(db, { ...s, request: p.request, ticket: a.admission_ticket }),
  ).toEqual({ status: 'invalid' });
});

it('expired fixed windows and nonces are removed without touching one-use ticket state', async () => {
  const s = await signupFixture(f),
    p = proof(s.token),
    oldNonce = randomUUID();
  await probe(async (tx) => {
    await tx`insert into app_private.signup_rate_counters(scope,key,window_start,count,expires_at) values('link',${p.link},date_bin(interval '15 minutes',clock_timestamp(),'1970-01-01'::timestamptz)-interval '15 minutes',99,date_bin(interval '15 minutes',clock_timestamp(),'1970-01-01'::timestamptz))`;
    await tx`insert into app_private.signup_admission_nonces(nonce,expires_at) values(${oldNonce},clock_timestamp()-interval '1 second')`;
    expect((await admit(tx, p)).status).toBe('admitted');
    expect(
      await tx`select 1 from app_private.signup_admission_nonces where nonce=${oldNonce}`,
    ).toHaveLength(0);
    const rows =
      await tx`select count::int as count from app_private.signup_rate_counters where scope='link' and key=${p.link}`;
    expect(rows).toEqual([{ count: 1 }]);
    await tx`select app_private.purge_client_signup_attempts()`;
    expect(await admit(tx, p)).toEqual({ status: 'invalid' });
  });
});
import { afterAll, beforeAll, expect, it } from 'vitest';
import vectors from '../fixtures/f11-attestation-vectors.json';
import {
  clientContext,
  probe,
  signup,
  signupFixture,
  sql,
  type ClientContext,
} from './client-accounts-fixture';

const db = sql();
let f: ClientContext, foreign: ClientContext;
beforeAll(async () => {
  f = await clientContext();
  foreign = await clientContext();
});
afterAll(() => db.end());
it('T019 admission contract exists before public issuance', async () => {
  const [r] =
    await db`select to_regprocedure('public.client_signup_admit(text,text,bytea,bytea,timestamptz,uuid,bytea)') is not null as present`;
  expect(r!.present, 'bounded attested admission RPC exists').toBe(true);
});
it('shared vectors: DB verifier accepts exact bytes and rejects every single-field mutation', async () => {
  await probe(async (tx) => {
    await tx`select vault.update_secret(id,${vectors.attestKey}) from vault.secrets where name='SIGNUP_ATTEST_KEY'`;
    await tx`select vault.update_secret(id,${vectors.rateKey}) from vault.secrets where name='SIGNUP_RATE_KEY'`;
    for (const v of vectors.vectors) {
      const ip = Buffer.from(v.ipKey, 'hex'),
        link = Buffer.from(v.linkKey, 'hex'),
        signature = Buffer.from(v.attestation, 'hex');
      for (const mutation of [
        'valid',
        'ipKey',
        'linkKey',
        'issuedAt',
        'nonce',
      ]) {
        const changed = Buffer.from(ip);
        changed[0] = changed[0]! ^ 1;
        const changedLink = Buffer.from(link);
        changedLink[0] = changedLink[0]! ^ 1;
        const [r] =
          await tx`select app_private.signup_attestation_matches(${mutation === 'ipKey' ? changed : ip},${mutation === 'linkKey' ? changedLink : link},${new Date(Number(v.issuedAt) + (mutation === 'issuedAt' ? 1 : 0)).toISOString()},${mutation === 'nonce' ? randomUUID() : v.nonce},${signature},decode(${vectors.attestKey},'hex')) as valid`;
        expect(r!.valid, mutation).toBe(mutation === 'valid');
      }
      expect(
        (
          await tx`select app_private.signup_link_key_matches(${v.tokenHash},${link}) as valid`
        )[0]!.valid,
      ).toBe(true);
    }
    for (const mutation of vectors.mutations) {
      const v = vectors.vectors[mutation.vectorIndex]!;
      const changed = {
        ipKey: v.ipKey,
        linkKey: v.linkKey,
        issuedAt: v.issuedAt,
        nonce: v.nonce,
        [mutation.field]: mutation.value,
      };
      const [r] =
        await tx`select app_private.signup_attestation_matches(${Buffer.from(changed.ipKey, 'hex')},${Buffer.from(changed.linkKey, 'hex')},${new Date(Number(changed.issuedAt)).toISOString()},${changed.nonce},${Buffer.from(v.attestation, 'hex')},decode(${vectors.attestKey},'hex')) as valid`;
      expect(r!.valid, mutation.field).toBe(false);
    }
  });
});
it('C1 guard then missing keys: unavailable with zero writes', async () => {
  const s = await signupFixture(f),
    p = proof(s.token);
  await probe(async (tx) => {
    const before = await counts(tx);
    await tx`create or replace function app_private.signup_auth_schema_compatible() returns boolean language sql stable security definer set search_path='' as $$select false$$`;
    expect(await admit(tx, p)).toEqual({ status: 'unavailable' });
    expect(await counts(tx)).toEqual(before);
  });
  for (const name of ['SIGNUP_ATTEST_KEY', 'SIGNUP_RATE_KEY'])
    await probe(async (tx) => {
      const before = await counts(tx);
      await tx`select vault.update_secret(id,'',${'MISSING_' + name}) from vault.secrets where name=${name}`;
      expect(await admit(tx, p)).toEqual({ status: 'unavailable' });
      expect(await counts(tx)).toEqual(before);
    });
});
for (const kind of [
  'forged',
  'missing',
  'stale',
  'future',
  'binding',
  'rate-key',
  'attest-key',
] as const)
  it(`${kind} proof fails invalid with no counter credit or ticket`, async () => {
    const s = await signupFixture(f);
    let p = proof(
      s.token,
      kind === 'stale'
        ? { ms: Date.now() - 61000 }
        : kind === 'future'
          ? { ms: Date.now() + 60000 }
          : kind === 'binding'
            ? { link: randomBytes(32) }
            : {},
    );
    if (kind === 'forged' || kind === 'missing')
      p = {
        ...p,
        attestation: kind === 'missing' ? Buffer.alloc(0) : randomBytes(32),
      };
    await probe(async (tx) => {
      if (kind === 'rate-key' || kind === 'attest-key')
        await tx`select vault.update_secret(id,${randomBytes(32).toString('hex')}) from vault.secrets where name=${kind === 'rate-key' ? 'SIGNUP_RATE_KEY' : 'SIGNUP_ATTEST_KEY'}`;
      const before = await counts(tx);
      expect(await admit(tx, p)).toEqual({ status: 'invalid' });
      const after = await counts(tx);
      expect(after!.credits).toBe(before!.credits);
      expect(after!.tickets).toBe(before!.tickets);
      expect(after!.attempts).toBe(before!.attempts);
      expect(after!.audits).toBe(before!.audits);
    });
  });
it('nonce is single-use; valid issuance redeems through U3 and attempt audit survives failure', async () => {
  const s = await signupFixture(f),
    p = proof(s.token);
  const a = await admit(db, p);
  expect(a.status).toBe('admitted');
  const before = await counts(db);
  expect(await admit(db, p)).toEqual({ status: 'invalid' });
  expect(await counts(db)).toEqual(before);
  expect(
    await signup(db, {
      ...s,
      request: p.request,
      ticket: a.admission_ticket,
      fields: { ...s.fields, email: f.po.email },
    }),
  ).toEqual({ status: 'duplicate' });
  const [used] =
    await db`select redeemed_at is not null as used,request_secret_hash=extensions.digest(${p.request},'sha256') as bound from app_private.signup_admission_tickets where id=${a.admission_ticket}`;
  expect(used).toEqual({ used: true, bound: true });
  const rows =
    await db`select a.action,a.target_id=t.id as target_ok,a.details from public.audit_events a join app_private.client_signup_attempts t on t.id=a.target_id where t.link_id=${s.link} order by a.action`;
  expect(rows.map((r) => r.action)).toEqual([
    'client.signup_attempted',
    'client.signup_failed',
  ]);
  for (const r of rows) {
    expect(r.target_ok).toBe(true);
    expect(Object.keys(r.details).sort()).toEqual([
      'link_id',
      'outcome_class',
      'timestamp',
      'workspace_id',
    ]);
  }
});
it('unknown and malformed tokens count both windows, log no identifiers and disclose no scope', async () => {
  for (const token of [randomBytes(32).toString('base64url'), 'malformed']) {
    const p = proof(token);
    await probe(async (tx) => {
      const before = await counts(tx);
      expect(await admit(tx, p)).toEqual({ status: 'invalid' });
      const after = await counts(tx);
      expect(after!.credits - before!.credits).toBe(2);
      expect(after!.tickets).toBe(before!.tickets);
      const rows =
        await tx`select a.action,a.details,a.target_id=t.id as target_ok from public.audit_events a join app_private.client_signup_attempts t on t.id=a.target_id where t.workspace_id is null and t.link_id is null and t.created_at>=transaction_timestamp()`;
      expect(rows.length).toBeGreaterThanOrEqual(2);
      for (const r of rows) {
        expect(r.target_ok).toBe(true);
        expect(Object.keys(r.details).sort()).toEqual([
          'outcome_class',
          'timestamp',
        ]);
      }
    });
  }
});
it('5/link exact under separate-connection races, regardless of caller IP; all submissions count', async () => {
  const s = await signupFixture(f),
    connections = Array.from({ length: 12 }, () => sql());
  try {
    const results = await Promise.all(
      connections.map((c) => admit(c, proof(s.token))),
    );
    expect(results.filter((r) => r.status === 'admitted')).toHaveLength(5);
    expect(results.filter((r) => r.status === 'invalid')).toHaveLength(7);
    const p = proof(s.token);
    const [r] =
      await db`select count::int as count,expires_at=window_start+interval '15 minutes' as aligned from app_private.signup_rate_counters where scope='link' and key=${p.link}`;
    expect(r).toEqual({ count: 12, aligned: true });
  } finally {
    await Promise.all(connections.map((c) => c.end()));
  }
});
it('30/IP exact across different links and workspaces under separate-connection races', async () => {
  const links: Awaited<ReturnType<typeof signupFixture>>[] = [];
  for (let i = 0; i < 8; i++)
    links.push(await signupFixture(i % 2 ? f : foreign));
  const ip = randomBytes(32),
    connections = Array.from({ length: 36 }, () => sql());
  try {
    const results = await Promise.all(
      connections.map((c, i) => admit(c, proof(links[i % 8]!.token, { ip }))),
    );
    expect(results.filter((r) => r.status === 'admitted')).toHaveLength(30);
    expect(results.filter((r) => r.status === 'invalid')).toHaveLength(6);
    const [r] =
      await db`select count::int as count,expires_at=window_start+interval '1 hour' as aligned from app_private.signup_rate_counters where scope='ip' and key=${ip}`;
    expect(r).toEqual({ count: 36, aligned: true });
  } finally {
    await Promise.all(connections.map((c) => c.end()));
  }
});
it('fixed-window expiry and coordinated rate-key rotation ignore old counters; expire naturally', async () => {
  const s = await signupFixture(f),
    p = proof(s.token, {
      ip: mac(
        process.env.SIGNUP_RATE_KEY!,
        'lifter.f11.ip.v1',
        Buffer.from('192.0.2.1'),
      ),
    });
  await probe(async (tx) => {
    for (let i = 0; i < 5; i++)
      expect((await admit(tx, proof(s.token, { ip: p.ip }))).status).toBe(
        'admitted',
      );
    expect(await admit(tx, proof(s.token, { ip: p.ip }))).toEqual({
      status: 'invalid',
    });
    await tx`update app_private.signup_rate_counters set count=30 where scope='ip' and key=${p.ip}`;
    const old = (
      await tx`select count from app_private.signup_rate_counters where key=${p.link}`
    )[0]!.count;
    const rate = randomBytes(32).toString('hex');
    await tx`select vault.update_secret(id,${rate}) from vault.secrets where name='SIGNUP_RATE_KEY'`;
    const hash = createHash('sha256').update(s.token).digest('hex');
    const next = proof(s.token, {
      ip: mac(rate, 'lifter.f11.ip.v1', Buffer.from('192.0.2.1')),
      link: mac(rate, 'lifter.f11.link.v1', Buffer.from(hash)),
    });
    expect((await admit(tx, next)).status).toBe('admitted');
    expect(
      (
        await tx`select count from app_private.signup_rate_counters where key=${p.link}`
      )[0]!.count,
    ).toBe(old);
    expect(
      (
        await tx`select count::int as n from app_private.signup_rate_counters where scope='ip' and key=${p.ip}`
      )[0]!.n,
    ).toBe(30);
    await tx`update app_private.signup_rate_counters set window_start=window_start-interval '2 hours',expires_at=expires_at-interval '2 hours' where key in (${p.link},${p.ip})`;
    expect(
      (await admit(tx, proof(s.token, { ...next, nonce: randomUUID() })))
        .status,
    ).toBe('admitted');
    expect(
      await tx`select 1 from app_private.signup_rate_counters where key in (${p.link},${p.ip})`,
    ).toHaveLength(0);
  });
});

// Freeze only this RPC's sampled clock inside a rolled-back owner probe.
// No caller-controlled clock seam is installed by a production migration.
for (const [offset, accepted] of [
  [5000, true],
  [5001, false],
  [-60000, true],
  [-60001, false],
] as const)
  it(`PO clock boundary ${offset} ms: ${accepted ? 'accepted once' : 'rejected without writes'}`, async () => {
    const s = await signupFixture(f);
    await probe(async (tx) => {
      const [clock] =
        await tx`select floor(extract(epoch from clock_timestamp())*1000)::bigint::text as ms`;
      const sampled = Number(clock!.ms);
      const freeze = async (ms: number) => {
        for (const name of [
          'public.client_signup_admit(text,text,bytea,bytea,timestamptz,uuid,bytea)',
          'app_private.purge_client_signup_attempts()',
        ]) {
          const [r] =
            await tx`select pg_get_functiondef(${name}::regprocedure) as body`;
          await tx.unsafe(
            (r!.body as string).replaceAll(
              'clock_timestamp()',
              `'${new Date(ms).toISOString()}'::timestamptz`,
            ),
          );
        }
      };
      await freeze(sampled);
      const p = proof(s.token, { ms: sampled + offset });
      const before = await counts(tx);
      expect((await admit(tx, p)).status).toBe(
        accepted ? 'admitted' : 'invalid',
      );
      if (!accepted) {
        expect(await counts(tx)).toEqual(before);
        return;
      }
      const [expiry] =
        await tx`select expires_at=${new Date(p.ms + 60000).toISOString()}::timestamptz as covered from app_private.signup_admission_nonces where nonce=${p.nonce}`;
      expect(expiry!.covered, 'nonce covers issued_at + freshness').toBe(true);
      const after = await counts(tx);
      expect(await admit(tx, p)).toEqual({ status: 'invalid' });
      expect(await counts(tx)).toEqual(after);
      // Advance the frozen body to the last accepted instant and run cleanup.
      for (const name of [
        'public.client_signup_admit(text,text,bytea,bytea,timestamptz,uuid,bytea)',
        'app_private.purge_client_signup_attempts()',
      ]) {
        const [r] =
          await tx`select pg_get_functiondef(${name}::regprocedure) as body`;
        await tx.unsafe(
          (r!.body as string).replaceAll(
            new Date(sampled).toISOString(),
            new Date(p.ms + 60000).toISOString(),
          ),
        );
      }
      await tx`select app_private.purge_client_signup_attempts()`;
      const afterPurge = await counts(tx);
      expect(await admit(tx, p)).toEqual({ status: 'invalid' });
      expect(await counts(tx)).toEqual(afterPurge);
    });
  });

it('shared IP vectors agree with PostgreSQL canonical /64 text and HMAC encoding', async () => {
  for (const v of vectors.vectors) {
    const [r] =
      await db`select host(case when family(${v.ip}::inet)=4 then ${v.ip}::inet when ${v.ip}::inet <<= '::ffff:0:0/96'::inet then ('0.0.0.0'::inet + (${v.ip}::inet - '::ffff:0:0'::inet)) else network(set_masklen(${v.ip}::inet,64))::inet end) as canonical`;
    expect(r!.canonical === v.ipKeyInput, 'canonical HMAC input agrees').toBe(
      true,
    );
    const [digest] =
      await db`select extensions.hmac(convert_to('lifter.f11.ip.v1','UTF8') || decode('00','hex') || int4send(octet_length(${v.ipKeyInput}::text)) || convert_to(${v.ipKeyInput},'UTF8'),decode(${vectors.rateKey},'hex'),'sha256') = ${Buffer.from(v.ipKey, 'hex')} as valid`;
    expect(digest!.valid, 'DB rate HMAC matches shared vector').toBe(true);
  }
});
