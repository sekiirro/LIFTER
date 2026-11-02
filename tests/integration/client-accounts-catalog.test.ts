import { afterAll, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { admin, anonClient } from './harness';
import {
  clientContext,
  approvalRpcNames,
  approvalDenialRequest,
  modelTables,
  pending,
  pendingHttpAccess,
  pendingRlsAccess,
  probe,
  sql,
} from './client-accounts-fixture';
const db = sql();
afterAll(() => db.end());

for (const table of modelTables) {
  it(`${table}: exists, forces RLS, and has no policies`, async () => {
    const [row] =
      await db`select relrowsecurity,relforcerowsecurity from pg_class where oid=to_regclass(${table})`;
    expect(row).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    expect(
      await db`select 1 from pg_policy where polrelid=to_regclass(${table})`,
    ).toHaveLength(0);
  });
  it(`${table}: zero effective table AND column grants, overriding default ACLs`, async () => {
    expect(
      await db`select to_regclass(${table}) is not null as present`,
    ).toMatchObject([{ present: true }]);
    const grants =
      await db`select r.rolname,a.attname from pg_roles r cross join pg_attribute a where a.attrelid=to_regclass(${table}) and a.attnum>0 and not a.attisdropped and r.rolname in ('anon','authenticated','service_role') and (has_any_column_privilege(r.oid,a.attrelid,'SELECT,INSERT,UPDATE,REFERENCES') or has_table_privilege(r.oid,a.attrelid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'))`;
    expect(grants).toHaveLength(0);
    expect(
      await db`select 1 from pg_class c cross join lateral aclexplode(c.relacl) acl where c.oid=to_regclass(${table}) and acl.grantee=0`,
    ).toHaveLength(0);
    // Inspect the creating owner's actual defaults; effective checks above prove
    // the explicit object revokes defeated any inherited defaults.
    const defaults =
      await db`select defaclobjtype,defaclacl from pg_default_acl where defaclrole=(select relowner from pg_class where oid=to_regclass(${table}))`;
    expect(defaults.length).toBeGreaterThan(0);
  });
  it(`${table}: privileged TRUNCATE is forbidden`, async () => {
    await expect(
      probe(async (tx) => {
        await tx.unsafe(`truncate ${table} cascade`);
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });
}

it('all U2 helpers revoke API/PUBLIC EXECUTE, are postgres owned and use empty search_path', async () => {
  const helpers =
    await db`select p.oid,p.proname,p.proconfig,r.rolname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='app_private' and (p.proname like 'signup_%' or p.proname in ('sync_account_identifier_claims','guard_account_identity_kind','guard_client_signup_insert','check_client_signup_integrity','guard_client_signup_operation','client_signup_limits','client_signup_audit_contract','redeem_signup_admission_ticket','purge_client_signup_attempts'))`;
  expect(helpers.length).toBeGreaterThanOrEqual(17);
  for (const helper of helpers) {
    expect(helper.rolname).toBe('postgres');
    expect(helper.proconfig).toContain('search_path=""');
    expect(
      await db`select 1 from pg_roles where rolname in ('anon','authenticated','service_role') and has_function_privilege(oid,${helper.oid}::oid,'execute')`,
    ).toHaveLength(0);
    expect(
      await db`select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=${helper.oid}::oid and acl.grantee=0`,
    ).toHaveLength(0);
  }
});

it('public signup RPC exact anon/authenticated-only EXECUTE', async () => {
  const [p] =
    await db`select oid,prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid=to_regprocedure('public.client_signup(text,text,uuid,jsonb)')`;
  expect(p, 'bounded signup RPC exists').toBeDefined();
  expect(p).toMatchObject({ prosecdef: true, owner: 'postgres' });
  expect(p!.proconfig).toContain('search_path=""');
  expect(
    await db`select rolname from pg_roles where rolname in ('anon','authenticated','service_role') and has_function_privilege(oid,${p!.oid}::oid,'execute') order by rolname`,
  ).toEqual([{ rolname: 'anon' }, { rolname: 'authenticated' }]);
  expect(
    await db`select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid=${p!.oid}::oid and a.grantee=0`,
  ).toHaveLength(0);
});
it('public admission RPC exact anon/authenticated-only EXECUTE and private enforcement state', async () => {
  const [p] =
    await db`select oid,prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid=to_regprocedure('public.client_signup_admit(text,text,bytea,bytea,timestamptz,uuid,bytea)')`;
  expect(p, 'bounded admission RPC exists').toBeDefined();
  expect(p).toMatchObject({ prosecdef: true, owner: 'postgres' });
  expect(p!.proconfig).toContain('search_path=""');
  expect(
    await db`select rolname from pg_roles where rolname in ('anon','authenticated','service_role') and has_function_privilege(oid,${p!.oid}::oid,'execute') order by rolname`,
  ).toEqual([{ rolname: 'anon' }, { rolname: 'authenticated' }]);
  expect(
    await db`select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid=${p!.oid}::oid and a.grantee=0`,
  ).toHaveLength(0);
  for (const table of ['signup_rate_counters', 'signup_admission_nonces']) {
    const [r] =
      await db`select relrowsecurity,relforcerowsecurity from pg_class where oid=to_regclass(${'app_private.' + table})`;
    expect(r).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    expect(
      await db`select 1 from pg_roles r where r.rolname in ('anon','authenticated','service_role') and (has_any_column_privilege(r.oid,to_regclass(${'app_private.' + table}),'SELECT,INSERT,UPDATE,REFERENCES') or has_table_privilege(r.oid,to_regclass(${'app_private.' + table}),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'))`,
    ).toHaveLength(0);
    expect(
      await db`select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid=to_regclass(${'app_private.' + table}) and a.grantee=0`,
    ).toHaveLength(0);
    const columns =
      await db`select attname from pg_attribute where attrelid=to_regclass(${'app_private.' + table}) and attnum>0 and not attisdropped order by attnum`;
    expect(columns.map((c) => c.attname)).toEqual(
      table === 'signup_rate_counters'
        ? ['scope', 'key', 'window_start', 'count', 'expires_at']
        : ['nonce', 'expires_at'],
    );
    expect(
      await db`select 1 from information_schema.table_privileges where table_schema='app_private' and table_name=${table} and grantee in ('PUBLIC','anon','authenticated','service_role')`,
    ).toHaveLength(0);
    expect(
      await db`select 1 from pg_constraint where conrelid=to_regclass(${'app_private.' + table}) and contype='f'`,
    ).toHaveLength(0);
  }
});
it('narrow 30-day purge removes only old attempts and preserves audit and tickets', async () => {
  await probe(async (tx) => {
    await tx`set transaction isolation level repeatable read`;
    const oldNonce = randomUUID(),
      youngNonce = randomUUID(),
      key = randomBytes(32);
    await tx`insert into app_private.signup_admission_nonces(nonce,expires_at) values(${oldNonce},clock_timestamp()-interval '1 second'),(${youngNonce},clock_timestamp()+interval '60 seconds')`;
    await tx`insert into app_private.signup_rate_counters(scope,key,window_start,count,expires_at) values('ip',${key},clock_timestamp()-interval '2 hours',1,clock_timestamp()-interval '1 hour')`;
    const [old] =
      await tx`insert into app_private.client_signup_attempts(outcome_class,created_at) values('attempt',clock_timestamp()-interval '31 days') returning id`;
    const [young] =
      await tx`insert into app_private.client_signup_attempts(outcome_class) values('attempt') returning id`;
    await tx`insert into public.audit_events(action,target_table,target_id,details) values('client.signup_attempted','client_signup_attempts',${old!.id},'{"outcome_class":"attempt"}')`;
    const audits =
      await tx`select id,details from public.audit_events where action <> 'client.signup_cleanup' order by id`;
    const tickets =
      await tx`select id,redeemed_at from app_private.signup_admission_tickets order by id`;
    await expect(
      tx.savepoint(async (inner) => {
        await inner`delete from app_private.client_signup_attempts where id=${old!.id}`;
      }),
    ).rejects.toMatchObject({ code: '23514' });
    await tx`select set_config('app_private.signup_purge_proof','forged',true)`;
    await expect(
      tx.savepoint(async (inner) => {
        await inner`delete from app_private.client_signup_attempts where id=${young!.id}`;
      }),
    ).rejects.toMatchObject({ code: '23514' });
    const [result] =
      await tx`select app_private.purge_client_signup_attempts() as result`;
    expect(result!.result.count).toBeGreaterThanOrEqual(1);
    expect(
      await tx`select 1 from app_private.signup_admission_nonces where nonce=${oldNonce}`,
    ).toHaveLength(0);
    expect(
      await tx`select 1 from app_private.signup_admission_nonces where nonce=${youngNonce}`,
    ).toHaveLength(1);
    expect(
      await tx`select 1 from app_private.signup_rate_counters where key=${key}`,
    ).toHaveLength(0);

    expect(
      await tx`select 1 from app_private.client_signup_attempts where id=${old!.id}`,
    ).toHaveLength(0);
    expect(
      await tx`select 1 from app_private.client_signup_attempts where id=${young!.id}`,
    ).toHaveLength(1);
    expect(
      await tx`select id,redeemed_at from app_private.signup_admission_tickets order by id`,
    ).toEqual(tickets);
    for (const audit of audits) {
      const [survivor] = await tx`
        select id,details from public.audit_events where id=${audit.id}`;
      expect(
        survivor,
        `preexisting audit row ${audit.id} survives unchanged`,
      ).toEqual(audit);
    }
    expect(
      await tx`select id,details from public.audit_events where action <> 'client.signup_cleanup' order by id`,
      'purge emits no audit rows except client.signup_cleanup',
    ).toEqual(audits);
    const [cleanup] =
      await tx`select target_table,target_id,details from public.audit_events where action='client.signup_cleanup' order by occurred_at desc,id desc limit 1`;
    expect(cleanup!.target_table).toBe('client_signup_attempts');
    expect(
      cleanup!.target_id === old!.id || cleanup!.target_id === young!.id,
    ).toBe(false);
    expect(Object.keys(cleanup!.details)).toEqual(['count']);
    expect(
      await tx`select 1 from pg_roles where rolname in ('anon','authenticated','service_role') and has_function_privilege(oid,'app_private.purge_client_signup_attempts()','execute')`,
    ).toHaveLength(0);
  });
});
it('pending synthetic JWT denies has_workspace_access and every catalog RLS table even with safe fixture grants', async () => {
  const context = await clientContext();
  await probe(async (tx) => {
    const c = await pending(tx, context);
    await pendingRlsAccess(tx, context, {
      sub: c.auth_user_id,
      role: 'authenticated',
    });
  });
});
it('pending client signs in later with real JWT and gets no PostgREST table or RPC access', async () => {
  const context = await clientContext();
  const email = `u2-jwt-${randomUUID()}@example.test`;
  const password = `U2-${randomUUID()}!`;
  const response = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (response.error) throw new Error('Synthetic Auth fixture creation failed');
  const created = response.data;
  if (!created.user) throw new Error('Synthetic Auth fixture missing');
  await db.begin(async (tx) => {
    await pending(tx, context, {}, created.user!.id);
  });
  const client = anonClient();
  const signed = await client.auth.signInWithPassword({ email, password });
  expect(signed.error).toBeNull();
  expect(Boolean(signed.data.session)).toBe(true);
  await pendingHttpAccess(client, context);
  await client.auth.signOut();
});
it('pending synthetic JWT cannot gain client access through ANY catalog public RPC', async () => {
  const context = await clientContext();
  await probe(async (tx) => {
    const c = await pending(tx, context);
    const functions =
      await tx`select p.proname,to_jsonb(array(select format_type(t,null) from unnest(p.proargtypes) t)) as types from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'`;
    expect(functions.length).toBeGreaterThan(0);
    const unauthorizedPaymentRpcResults: Record<string, unknown> = {};
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: c.auth_user_id, role: 'authenticated' })},true)`;
    for (const fn of functions) {
      if (fn.proname === 'client_self_status') {
        await tx.savepoint(async (inner) => {
          await inner`set local role authenticated`;
          const [row] =
            await inner`select public.client_self_status() as result`;
          expect(row!.result, fn.proname).toEqual({
            status: 'ok',
            approval_state: 'pending-approval',
          });
          await inner`reset role`;
        });
        continue;
      }
      if ((approvalRpcNames as readonly string[]).includes(fn.proname)) {
        await tx.savepoint(async (inner) => {
          await inner`set local role authenticated`;
          const value = inner.json(
            approvalDenialRequest(context, fn.proname, c.id as string),
          );
          const [row] =
            fn.proname === 'registration_approve'
              ? await inner`select public.registration_approve(${value}) as result`
              : fn.proname === 'registration_reject'
                ? await inner`select public.registration_reject(${value}) as result`
                : fn.proname === 'registration_reconsider'
                  ? await inner`select public.registration_reconsider(${value}) as result`
                  : fn.proname === 'installment_collect'
                    ? await inner`select public.installment_collect(${value}) as result`
                    : await inner`select public.collection_correct(${value}) as result`;
          expect(row!.result, fn.proname).toEqual({ status: 'not_permitted' });
          await inner`reset role`;
        });
        continue;
      }
      if (
        [
          'registration_approval_queue',
          'registration_approval_review',
          'registration_approval_correction',
          'workspace_payment_queue',
          'subscription_payment_status',
          'subscription_commission',
        ].includes(fn.proname)
      ) {
        const args: string[] = [];
        for (const typeName of fn.types) {
          const value =
            typeName === 'integer' ? '1::integer' : `'${context.wsA.id}'::uuid`;
          args.push(value);
        }
        await tx.savepoint(async (inner) => {
          await inner`set local role authenticated`;
          const [row] = await inner.unsafe(
            `select public."${fn.proname}"(${args.join(',')}) as result`,
          );
          expect(row!.result, fn.proname).toEqual({ status: 'not_permitted' });
          await inner`reset role`;
        });
        continue;
      }
      const args: string[] = [];
      for (const typeName of fn.types) {
        const values: Record<string, string> = {
          uuid: `'${context.wsA.id}'::uuid`,
          text: "'synthetic-invalid'::text",
          jsonb: 'null::jsonb',
          integer: '1::integer',
          smallint: '1::smallint',
          bigint: '1::bigint',
          numeric: '1::numeric',
          boolean: 'false',
          bytea: "decode('00','hex')",
          'timestamp with time zone': 'now()',
          'uuid[]': "'{}'::uuid[]",
        };
        if (!values[typeName])
          throw new Error('Uncovered public RPC argument type');
        args.push(values[typeName]!);
      }
      if (
        ['record_refund', 'record_renewal', 'close_client'].includes(fn.proname)
      ) {
        await tx.savepoint(async (inner) => {
          await inner`set local role authenticated`;
          const [row] = await inner.unsafe(
            `select public."${fn.proname}"(${args.join(',')}) as result`,
          );
          unauthorizedPaymentRpcResults[fn.proname] = row!.result;
          await inner`reset role`;
        });
        continue;
      }
      await tx
        .savepoint(async (inner) => {
          await inner`set local role authenticated`;
          try {
            const rows = await inner.unsafe(
              `select * from public."${fn.proname}"(${args.join(',')})`,
            );
            for (const row of rows)
              for (const value of Object.values(row))
                expect(
                  value === null ||
                    value === false ||
                    (typeof value === 'object' &&
                      value !== null &&
                      'status' in value &&
                      (value.status === 'invalid' ||
                        (fn.proname === 'read_client_form_draft' &&
                          value.status === 'not_found') ||
                        ([
                          'select_intake_form',
                          'submit_form_assignment',
                          'configure_intake_assignment_policy',
                          'materialize_intake_assignment_occurrence',
                        ].includes(fn.proname) &&
                          value.status === 'not_found') ||
                        (['subscription_freeze_operation'].includes(
                          fn.proname,
                        ) &&
                          value.status === 'invalid_input'))),
                  fn.proname,
                ).toBe(true);
          } catch (error) {
            expect((error as { code?: string }).code, fn.proname).toBe('42501');
            throw error;
          }
        })
        .catch((error: { code?: string }) => {
          if (error.code !== '42501') throw error;
        });
    }
    expect(unauthorizedPaymentRpcResults).toEqual({
      record_refund: { status: 'not_permitted' },
      record_renewal: { status: 'not_permitted' },
      close_client: { status: 'not_permitted' },
    });
  });
});
