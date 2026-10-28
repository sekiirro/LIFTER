import { proof, admit, counts } from './client-accounts-admission-fixture';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  clientContext,
  probe,
  signup,
  signupFixture,
  sql,
  type ClientContext,
} from './client-accounts-fixture';
const db = sql();
let f: ClientContext;
beforeAll(async () => {
  f = await clientContext();
});
afterAll(() => db.end());
it('complete latest F10 audit body is preserved verbatim except the two additive branches', async () => {
  const source = readFileSync(
    'supabase/migrations/20261030120000_registration_links.sql',
    'utf8',
  );
  const original = source.slice(
    source.indexOf('create or replace function app_private.audit_row_change()'),
    source.indexOf('alter function app_private.audit_row_change()'),
  );
  const [row] =
    await db`select pg_get_functiondef('app_private.audit_row_change()'::regprocedure) as body`;
  const before = original
    .slice(original.indexOf('declare'), original.lastIndexOf('$$;'))
    .trim();
  const after = String(row!.body)
    .slice(
      String(row!.body).indexOf('declare'),
      String(row!.body).lastIndexOf('$function$'),
    )
    .replace(/\r/g, '');
  const stripped = after
    .replace(
      /    -- U3 consumption addition begin[\s\S]*?    -- U3 consumption addition end\n/,
      '',
    )
    .replace(
      /  -- U3 client addition begin[\s\S]*?  -- U3 client addition end\n/,
      '',
    )
    .trim();
  expect(stripped).toBe(before.replace(/\r/g, ''));
});
it('success/consumption exactly once, null public actor, allowlisted details, replay emits no success', async () => {
  const s = await signupFixture(f);
  expect(await signup(db, s)).toEqual({ status: 'complete' });
  for (let n = 0; n < 2; n++)
    expect(await signup(db, s)).toEqual({ status: 'invalid' });
  const rows =
    await db`select actor_user_id,action,details from public.audit_events where (target_id=${s.link} or details->>'link_id'=${s.link}) and action in ('client.signup_succeeded','registration_link.consumed') order by action`;
  expect(rows.map((r) => r.action)).toEqual([
    'client.signup_succeeded',
    'registration_link.consumed',
  ]);
  for (const row of rows) {
    expect(row.actor_user_id).toBeNull();
    expect(Object.keys(row.details).sort()).toEqual([
      'link_id',
      'outcome_class',
      'timestamp',
      'workspace_id',
    ]);
  }
});
it('caught failure audit is outside inner rollback and remains append-only', async () => {
  const s = await signupFixture(f);
  await probe(async (tx) => {
    await tx`alter table public.clients add constraint u3_fail check(false) not valid`;
    expect(await signup(tx, s)).toEqual({ status: 'unavailable' });
    // Unknown constraint must remain infrastructure, never silently business.
    expect(
      await tx`select 1 from public.audit_events where target_id=${s.ticket}`,
    ).toHaveLength(0);
  });
  const bad = await signupFixture(f);
  expect(
    await signup(db, { ...bad, fields: { ...bad.fields, email: f.po.email } }),
  ).toEqual({ status: 'duplicate' });
  await expect(
    probe(async (tx) => {
      await tx`update public.audit_events set details='{}' where details->>'link_id'=${bad.link} and action='client.signup_failed'`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    probe(async (tx) => {
      await tx`delete from public.audit_events where details->>'link_id'=${bad.link} and action='client.signup_failed'`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
});

it('U5 admitted evidence survives infrastructure rollback and a new admission counts again', async () => {
  const s = await signupFixture(f),
    p = proof(s.token);
  const a = await admit(db, p);
  expect(a.status).toBe('admitted');
  const before = await counts(db);
  await probe(async (tx) => {
    await tx`alter table public.clients add constraint u5_infra check(false) not valid`;
    expect(
      await signup(tx, {
        ...s,
        ticket: a.admission_ticket,
        request: p.request,
      }),
    ).toEqual({ status: 'unavailable' });
    expect(await counts(tx)).toEqual(before);
    expect(
      (
        await tx`select redeemed_at is null as unused from app_private.signup_admission_tickets where id=${a.admission_ticket}`
      )[0]!.unused,
    ).toBe(true);
  });
  const retry = await admit(db, proof(s.token, { ip: p.ip }));
  expect(retry.status).toBe('admitted');
  const after = await counts(db);
  expect(after!.credits - before!.credits).toBe(2);
  expect(after!.tickets - before!.tickets).toBe(1);
  expect(
    await db`select 1 from public.audit_events where action='client.signup_attempted' and details->>'link_id'=${s.link}`,
  ).toHaveLength(2);
});

it('U5 purge appends counts-only audit and preserves all original audit rows and receipts', async () => {
  await probe(async (tx) => {
    const [old] =
      await tx`insert into app_private.client_signup_attempts(outcome_class,created_at) values('failure',clock_timestamp()-interval '31 days') returning id`;
    await tx`insert into public.audit_events(action,target_table,target_id,details) values('client.signup_failed','client_signup_attempts',${old!.id},'{"outcome_class":"failure"}')`;
    const original =
      await tx`select to_jsonb(a) as row from public.audit_events a order by id`;
    const receipts =
      await tx`select to_jsonb(r) as row from app_private.client_signup_operations r order by id`;
    const [result] =
      await tx`select app_private.purge_client_signup_attempts() as result`;
    expect(result!.result.count).toBeGreaterThanOrEqual(1);
    const surviving =
      await tx`select to_jsonb(a) as row from public.audit_events a order by id`;
    expect(surviving.slice(0, original.length)).toEqual(original);
    expect(surviving.length).toBe(original.length + 1);
    expect(
      JSON.stringify(
        await tx`select to_jsonb(r) as row from app_private.client_signup_operations r order by id`,
      ) === JSON.stringify(receipts),
      'receipts unchanged',
    ).toBe(true);
    expect(
      await tx`select 1 from public.audit_events where target_id=${old!.id}`,
    ).toHaveLength(1);
    expect(
      await tx`select 1 from app_private.client_signup_attempts where id=${old!.id}`,
    ).toHaveLength(0);
    const [cleanup] =
      await tx`select details,target_table,target_id from public.audit_events where action='client.signup_cleanup' order by id desc limit 1`;
    expect(Object.keys(cleanup!.details)).toEqual(['count']);
    expect(cleanup!.target_table).toBe('client_signup_attempts');
    expect(cleanup!.target_id === old!.id).toBe(false);
  });
});
