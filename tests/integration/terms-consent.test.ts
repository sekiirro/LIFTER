import { afterAll, expect, it, vi } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  clientContext,
  graph,
  type Context,
} from './registration-approval-fixture';
import { sql } from './harness';

const db = sql();

async function runTermsMutation<T>(
  signature: string,
  mutate: (definition: string) => string,
  run: (tx: TransactionSql) => Promise<T>,
) {
  const rollback = new Error('rollback Terms mutation');
  let result: T | undefined;
  try {
    await db.begin(async (tx) => {
      const [row] = await tx`
        select pg_get_functiondef(to_regprocedure(${signature})) as definition`;
      const changed = mutate(row!.definition as string);
      if (changed === row!.definition)
        throw new Error('Mutation did not apply');
      await tx.unsafe(changed);
      result = await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return result;
}

afterAll(() => db.end());

async function approvedClient(context: Context) {
  const ids = await db.begin(async (tx) => graph(tx, context));
  const [client] = await db`
    select c.id, c.auth_user_id, c.workspace_id
    from public.clients c where c.id=${ids.client}`;
  if (!client) throw new Error('Approved synthetic client missing');
  return client;
}

async function asClient<T>(
  authUserId: string,
  work: (tx: TransactionSql) => Promise<T>,
) {
  return db.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: authUserId, role: 'authenticated' })},true)`;
    return work(tx);
  });
}

it('requires affirmative terms acceptance and records an immutable server-time receipt with independent marketing consent', async () => {
  const client = await approvedClient(await clientContext());
  const termsVersion = `terms-published-${client.id}`;
  const marketingVersion = `marketing-published-${client.id}`;
  await db`
    insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${termsVersion},'terms','published'),(${marketingVersion},'marketing','published')`;

  const missing = await asClient(
    client.auth_user_id,
    async (tx) =>
      tx`select public.client_accept_terms(null,null,false,'2001-01-01T00:00:00Z'::timestamptz) as result`,
  );
  expect(missing[0]?.result).toMatchObject({ status: 'invalid' });

  const accepted = await asClient(
    client.auth_user_id,
    async (tx) =>
      tx`select public.client_accept_terms(${termsVersion},null,false,'2001-01-01T00:00:00Z'::timestamptz) as result`,
  );
  expect(accepted[0]?.result).toMatchObject({ status: 'accepted' });
  const [receipt] = await db`
    select id,workspace_id,policy_version,accepted_at
    from app_private.terms_consent_receipts
    where client_id=${client.id} and policy_version=${termsVersion}`;
  expect(receipt).toMatchObject({
    workspace_id: client.workspace_id,
    policy_version: termsVersion,
  });
  expect(new Date(receipt!.accepted_at as string).getTime()).toBeGreaterThan(
    Date.parse('2001-01-02T00:00:00Z'),
  );
  expect(
    await db`select 1 from app_private.marketing_consent_receipts where client_id=${client.id}`,
  ).toHaveLength(0);

  const retry = await asClient(
    client.auth_user_id,
    async (tx) =>
      tx`select public.client_accept_terms(${termsVersion},null,false,'2002-01-01T00:00:00Z'::timestamptz) as result`,
  );
  expect(retry[0]?.result).toEqual(accepted[0]?.result);
  expect(
    await db`select count(*)::integer as count from app_private.terms_consent_receipts where client_id=${client.id}`,
  ).toMatchObject([{ count: 1 }]);
  const completion = await asClient(
    client.auth_user_id,
    async (tx) =>
      tx`select public.client_has_accepted_terms(${termsVersion}) as accepted`,
  );
  expect(completion[0]?.accepted).toBe(true);

  await asClient(
    client.auth_user_id,
    async (tx) =>
      tx`select public.client_accept_terms(${termsVersion},${marketingVersion},true,null)`,
  );
  expect(
    await db`select policy_version from app_private.marketing_consent_receipts where client_id=${client.id}`,
  ).toMatchObject([{ policy_version: marketingVersion }]);
  expect(
    await db`select count(*)::integer as count from app_private.terms_consent_receipts where client_id=${client.id}`,
  ).toMatchObject([{ count: 1 }]);
  expect(
    await db`select action from public.audit_events where target_table='terms_consent_receipts' and target_id=${receipt!.id}`,
  ).toMatchObject([{ action: 'client.terms_accepted' }]);
  expect(
    await db`select action from public.audit_events where target_table='marketing_consent_receipts' and target_id=(select id from app_private.marketing_consent_receipts where client_id=${client.id})`,
  ).toMatchObject([{ action: 'client.marketing_consent_recorded' }]);
  await expect(
    db`update app_private.terms_consent_receipts set accepted_at=clock_timestamp() where id=${receipt!.id}`,
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    db`delete from app_private.terms_consent_receipts where id=${receipt!.id}`,
  ).rejects.toMatchObject({ code: '23514' });
});

it('rejects DRAFT policy receipts in production, ignores client timestamps, and keeps tenant reads private', async () => {
  const clientA = await approvedClient(await clientContext());
  const contextB = await clientContext();
  const clientBApproved = await approvedClient(contextB);
  const clientB = clientBApproved;
  const draftVersion = `terms-draft-${clientA.id}`;
  const clientBTermsVersion = `terms-published-${clientB.id}`;
  await db`
    insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${draftVersion},'terms','draft'),(${clientBTermsVersion},'terms','published')`;

  const acceptedForB = await asClient(
    clientB.auth_user_id,
    async (tx) =>
      tx`select public.client_accept_terms(${clientBTermsVersion},null,false,null) as result`,
  );
  expect(acceptedForB[0]?.result).toMatchObject({ status: 'accepted' });

  const draft = await asClient(
    clientA.auth_user_id,
    async (tx) =>
      tx`select public.client_accept_terms(${draftVersion},null,false,null) as result`,
  );
  expect(draft[0]?.result).toMatchObject({ status: 'unavailable' });

  const crossTenant = await asClient(
    clientA.auth_user_id,
    async (tx) =>
      tx`select public.client_has_accepted_terms(${clientBTermsVersion}) as accepted`,
  );
  expect(crossTenant[0]?.accepted).toBe(false);
  expect(
    await db`select relrowsecurity,relforcerowsecurity from pg_class where oid='app_private.terms_consent_receipts'::regclass`,
  ).toMatchObject([{ relrowsecurity: true, relforcerowsecurity: true }]);
  expect(
    await db`select has_table_privilege('authenticated','app_private.terms_consent_receipts','select') as can_read`,
  ).toMatchObject([{ can_read: false }]);
  expect(
    await db`select has_function_privilege('anon','public.client_accept_terms(text,text,boolean,timestamp with time zone)','execute') as anon_can_accept`,
  ).toMatchObject([{ anon_can_accept: false }]);
});

it('catalog enforces forced RLS, minimal grants, definer hygiene, and the workspace username key', async () => {
  for (const table of [
    'app_private.terms_policy_versions',
    'app_private.terms_consent_receipts',
    'app_private.marketing_consent_receipts',
  ]) {
    const [row] = await db`
      select c.relrowsecurity,c.relforcerowsecurity,
        has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon_access,
        has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as auth_access,
        has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') as service_access
      from pg_class c where c.oid=to_regclass(${table})`;
    expect(row).toEqual({
      relrowsecurity: true,
      relforcerowsecurity: true,
      anon_access: false,
      auth_access: false,
      service_access: false,
    });
    expect(
      await db`select 1 from pg_policy where polrelid=to_regclass(${table})`,
    ).toHaveLength(0);
  }

  for (const [signature, grants] of [
    [
      'public.client_accept_terms(text,text,boolean,timestamp with time zone)',
      ['authenticated'],
    ],
    ['public.client_has_accepted_terms(text)', ['authenticated']],
  ] as const) {
    const [fn] = await db`
      select p.oid,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner
      from pg_proc p where p.oid=to_regprocedure(${signature})`;
    expect(fn).toMatchObject({ prosecdef: true, owner: 'postgres' });
    expect(fn?.proconfig).toContain('search_path=""');
    expect(
      await db`select r.rolname from pg_roles r where r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.oid,${fn!.oid}::oid,'execute') order by r.rolname`,
    ).toEqual(grants.map((rolname) => ({ rolname })));
  }

  expect(
    await db`select 1 from pg_indexes where schemaname='public' and indexname='clients_workspace_id_username_normalized_key' and indexdef ilike '%unique%' and indexdef ilike '%workspace_id%' and indexdef ilike '%username_normalized%'`,
  ).toHaveLength(1);
  expect(
    await db`select 1 from pg_class where oid='public.clients'::regclass and relrowsecurity and relforcerowsecurity`,
  ).toHaveLength(1);
});

it('mutation: removing the production DRAFT persistence gate is caught', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  try {
    const client = await approvedClient(await clientContext());
    const version = `mutation-draft-${client.id}`;
    const result = await runTermsMutation(
      'public.client_accept_terms(text,text,boolean,timestamp with time zone)',
      (definition) =>
        definition.replace(
          /if policy_status is distinct from 'published' then/u,
          'if false then',
        ),
      async (tx) => {
        await tx`
          insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${version},'terms','draft')`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.auth_user_id, role: 'authenticated' })},true)`;
        return tx`select public.client_accept_terms(${version},null,false,null) as result`;
      },
    );
    expect(result?.[0]?.result).toMatchObject({ status: 'accepted' });
  } finally {
    vi.unstubAllEnvs();
  }
});

it('mutation: trusting the caller timestamp is caught', async () => {
  const client = await approvedClient(await clientContext());
  const version = `timestamp-published-${client.id}`;
  const result = await runTermsMutation(
    'public.client_accept_terms(text,text,boolean,timestamp with time zone)',
    (definition) =>
      definition.replace(
        /insert into app_private\.terms_consent_receipts\(workspace_id,client_id,policy_version\)\s+values\(client_row\.workspace_id,client_row\.id,p_terms_policy_version\)/u,
        'insert into app_private.terms_consent_receipts(workspace_id,client_id,policy_version,accepted_at) values(client_row.workspace_id,client_row.id,p_terms_policy_version,p_client_timestamp)',
      ),
    async (tx) => {
      await tx`
        insert into app_private.terms_policy_versions(version,policy_kind,status)
        values(${version},'terms','published')`;
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.auth_user_id, role: 'authenticated' })},true)`;
      return tx`select public.client_accept_terms(${version},null,false,'2001-01-01T00:00:00Z'::timestamptz) as result`;
    },
  );
  expect(result?.[0]?.result.accepted_at).toBe('2001-01-01T00:00:00+00:00');
});

it('mutation: coupling marketing to Terms is caught', async () => {
  const client = await approvedClient(await clientContext());
  const version = `marketing-coupled-${client.id}`;
  const result = await runTermsMutation(
    'public.client_accept_terms(text,text,boolean,timestamp with time zone)',
    (definition) =>
      definition.replace(
        "if p_terms_policy_version is null or p_terms_policy_version='' or p_marketing_opt_in is null then",
        "if not p_marketing_opt_in or p_terms_policy_version is null or p_terms_policy_version='' or p_marketing_opt_in is null then",
      ),
    async (tx) => {
      await tx`
        insert into app_private.terms_policy_versions(version,policy_kind,status)
        values(${version},'terms','published')`;
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.auth_user_id, role: 'authenticated' })},true)`;
      return tx`select public.client_accept_terms(${version},null,false,null) as result`;
    },
  );
  expect(result?.[0]?.result).toMatchObject({ status: 'invalid' });
});

it('mutation: cross-tenant Terms receipt reads are caught', async () => {
  const clientA = await approvedClient(await clientContext());
  const clientB = await approvedClient(await clientContext());
  const versionB = `cross-tenant-${clientB.id}`;
  await db`
    insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${versionB},'terms','published')`;
  const accepted = await asClient(
    clientB.auth_user_id,
    async (tx) =>
      tx`select public.client_accept_terms(${versionB},null,false,null) as result`,
  );
  expect(accepted[0]?.result).toMatchObject({ status: 'accepted' });

  const crossTenant = await runTermsMutation(
    'public.client_has_accepted_terms(text)',
    (definition) =>
      definition.replace(
        /where c\.auth_user_id=auth\.uid\(\) and c\.approval_state='approved'/u,
        "where c.approval_state='approved'",
      ),
    async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: clientA.auth_user_id, role: 'authenticated' })},true)`;
      return tx`select public.client_has_accepted_terms(${versionB}) as accepted`;
    },
  );
  expect(crossTenant?.[0]?.accepted).toBe(true);
});
