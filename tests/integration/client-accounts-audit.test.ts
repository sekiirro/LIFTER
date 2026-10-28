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
  ).toEqual({ status: 'invalid' });
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
