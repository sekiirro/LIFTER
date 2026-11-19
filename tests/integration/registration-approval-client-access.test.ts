import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createRecoveryClientTarget } from './client-accounts-fixture';
import { admin, loadEnv } from './harness';
import { FINANCIAL_RESOLUTION_ACKNOWLEDGEMENT } from '../../lib/client-accounts/deletion-policy';
import { drainAccountDeletions } from '../../workers/cron/src/account-deletion';
import {
  clientContext,
  probe,
  sql,
  type Context,
} from './registration-approval-fixture';
import {
  call,
  request as decisionRequest,
  sqlCall,
} from './registration-approval-operations-fixture';
import {
  registered,
  request as approvalRequest,
} from './registration-approval-operations-fixture';

const db = sql();
let f: Context;
afterAll(() => db.end());
beforeAll(async () => {
  f = await clientContext();
});

it('T042 real F11 client JWT is limited to self-status and denied client data and private Storage', async () => {
  const client = await createRecoveryClientTarget(f);
  const session = await client.client.auth.getSession();
  expect(session.data.session?.user.id).toBe(client.userId);
  expect(session.data.session?.access_token).toBeTruthy();

  await db.unsafe(
    'grant select on public.clients, public.subscriptions, public.payment_events to authenticated',
  );
  try {
    const status = await client.client.rpc('client_self_status');
    expect(status.error).toBeNull();
    expect(status.data).toEqual({
      status: 'ok',
      approval_state: 'pending-approval',
    });
    for (const table of ['clients', 'subscriptions', 'payment_events']) {
      const read = await client.client.from(table).select('*').limit(1);
      expect(read.error).toBeNull();
      expect(read.data).toEqual([]);
    }

    const bucket = `t042-${randomUUID().replaceAll('-', '')}`;
    const objectPath = 'private/probe.txt';
    const created = await admin().storage.createBucket(bucket, {
      public: false,
    });
    expect(created.error).toBeNull();
    try {
      const uploaded = await admin()
        .storage.from(bucket)
        .upload(objectPath, new Uint8Array([84, 52, 50]), {
          contentType: 'text/plain',
        });
      expect(uploaded.error).toBeNull();
      const downloaded = await client.client.storage
        .from(bucket)
        .download(objectPath);
      expect(downloaded.error).not.toBeNull();
      const deniedUpload = await client.client.storage
        .from(bucket)
        .upload('private/client.txt', new Uint8Array([120]));
      expect(deniedUpload.error).not.toBeNull();
    } finally {
      await admin().storage.deleteBucket(bucket);
    }
  } finally {
    await db.unsafe(
      'revoke select on public.clients, public.subscriptions, public.payment_events from authenticated',
    );
  }
});

it('T024 zero-argument self status returns only the signed client state', async () => {
  await probe(async (tx) => {
    const client = await (
      await import('./client-accounts-fixture')
    ).pending(tx, f);
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.auth_user_id, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    const [state] = await tx`select public.client_self_status() as result`;
    expect(state!.result).toEqual({
      status: 'ok',
      approval_state: 'pending-approval',
    });
    await tx`reset role`;
    const [helper] =
      await tx`select app_private.client_has_access(${f.wsA.id},${client.id}) as allowed`;
    expect(helper!.allowed).toBe(false);
    const target = {
      id: client.id as string,
      userId: client.auth_user_id as string,
      link: f.link,
      rows: null,
    };
    const rejected = await sqlCall(
      tx,
      f.po.userId,
      'reject',
      decisionRequest(f, target, 'reject'),
    );
    expect(rejected.status).toBe('ok');
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.auth_user_id, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    const [rejection] = await tx`select public.client_self_status() as result`;
    expect(rejection!.result).toEqual({
      status: 'ok',
      approval_state: 'rejected',
    });
    await tx`reset role`;
    const [rejectedAccess] =
      await tx`select app_private.client_has_access(${f.wsA.id},${client.id}) as allowed`;
    expect(rejectedAccess!.allowed).toBe(false);
    for (const table of [
      'subscriptions',
      'subscription_installments',
      'payment_events',
      'subscription_activations',
    ]) {
      await tx.unsafe(`grant select on public.${table} to authenticated`);
      await tx`set local role authenticated`;
      expect(await tx.unsafe(`select * from public.${table}`)).toEqual([]);
      await tx`reset role`;
    }
  });
});

it('T024 self helper uses auth.uid association, has no caller target input, and is not executable by browser roles', async () => {
  const [status] =
    await db`select oid::regprocedure::text as signature,pronargs,prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid='public.client_self_status()'::regprocedure`;
  expect(status).toMatchObject({
    signature: 'client_self_status()',
    pronargs: 0,
    prosecdef: true,
    proconfig: ['search_path=""'],
    owner: 'postgres',
  });
  const indexes =
    await db`select indexdef from pg_indexes where schemaname='public' and tablename='clients'`;
  expect(
    indexes.some((row) => /\(auth_user_id\)/.test(row.indexdef as string)),
  ).toBe(true);
  const overloads =
    await db`select oid::regprocedure::text as signature from pg_proc where pronamespace='public'::regnamespace and proname='client_self_status'`;
  expect(overloads).toEqual([{ signature: 'client_self_status()' }]);
  const [helper] =
    await db`select oid::regprocedure::text as signature,prosrc,prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid='app_private.client_has_access(uuid,uuid)'::regprocedure`;
  expect(helper!.prosrc).toMatch(/auth\.uid\(\)/);
  expect(helper).toMatchObject({
    prosecdef: true,
    proconfig: ['search_path=""'],
    owner: 'postgres',
  });
  for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
    const [a] =
      await db`select has_function_privilege(${role},'public.client_self_status()','EXECUTE') as allowed`;
    expect(a!.allowed).toBe(role === 'authenticated');
    const [b] =
      await db`select has_function_privilege(${role},'app_private.client_has_access(uuid,uuid)','EXECUTE') as allowed`;
    expect(b!.allowed).toBe(false);
  }
});

it('T024 approved self status adds no base-table or activation access', async () => {
  await probe(async (tx) => {
    const target = await registered(f);
    const approval = await sqlCall(
      tx,
      f.po.userId,
      'approve',
      approvalRequest(f, target),
    );
    expect(approval.status).toBe('ok');
    const [identity] =
      await tx`select auth_user_id from public.clients where id=${target.id}`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: identity!.auth_user_id, role: 'authenticated' })},true)`;
    const [status] = await tx`select public.client_self_status() as result`;
    expect(status!.result).toEqual({
      status: 'ok',
      approval_state: 'approved',
    });
    const [access] =
      await tx`select app_private.client_has_access(${f.wsA.id},${target.id}) as allowed`;
    expect(access!.allowed).toBe(true);
    for (const table of [
      'subscriptions',
      'subscription_installments',
      'payment_events',
      'subscription_activations',
    ])
      await tx.unsafe(`grant select on public.${table} to authenticated`);
    await tx`set local role authenticated`;
    for (const table of [
      'subscriptions',
      'subscription_installments',
      'payment_events',
      'subscription_activations',
    ])
      expect(await tx.unsafe(`select * from public.${table}`)).toEqual([]);
    await tx`reset role`;
  });
});

it('T024 foreign and nonexistent users receive the same denial; no target can be supplied', async () => {
  await probe(async (tx) => {
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: randomUUID(), role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    const [result] = await tx`select public.client_self_status() as result`;
    expect(result!.result).toEqual({ status: 'not_permitted' });
    await tx`reset role`;
  });
});

async function transitionClientDeletion(
  context: Context,
  authUserId: string,
  targetState: 'deletion_pending' | 'release_pending' | 'released',
) {
  const req = await context.po.client.rpc('request_account_deletion', {
    p_target_user_id: authUserId,
    p_financial_confirmation: {
      category: 'other',
      acknowledgement: FINANCIAL_RESOLUTION_ACKNOWLEDGEMENT.en,
    },
  });
  if (req.error || req.data?.status !== 'deletion_pending') {
    throw new Error(`request_account_deletion failed: ${JSON.stringify(req)}`);
  }
  const intentId = (req.data as { intent_id: string }).intent_id;
  if (targetState === 'deletion_pending') {
    return intentId;
  }

  await db`
    update auth.users
    set banned_until = '9999-12-31T23:59:59Z'::timestamptz
    where id = ${authUserId}
  `;
  const claimed = await admin().rpc('claim_account_deletion_intents', {
    p_limit: 100,
  });
  const leased = (
    claimed.data as Array<{ id: string; lease_token: string }>
  )?.find((item) => item.id === intentId);
  if (!leased) {
    throw new Error(
      `claim_account_deletion_intents failed to find intent ${intentId}`,
    );
  }
  const adv = await admin().rpc('advance_deletion_step_a', {
    p_intent_id: intentId,
    p_lease_token: leased.lease_token,
  });
  if (adv.error || adv.data !== true) {
    throw new Error(`advance_deletion_step_a failed: ${JSON.stringify(adv)}`);
  }
  const execB = await admin().rpc('execute_deletion_step_b', {
    p_intent_id: intentId,
    p_lease_token: leased.lease_token,
  });
  if (execB.error || execB.data !== true) {
    throw new Error(`execute_deletion_step_b failed: ${JSON.stringify(execB)}`);
  }
  if (targetState === 'release_pending') {
    return intentId;
  }

  await db`
    update app_private.account_deletion_intents
    set lease_token = null, lease_expires_at = null
    where id = ${intentId}
  `;
  const env = loadEnv();
  await drainAccountDeletions(
    {
      SUPABASE_URL: env.apiUrl,
      SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    },
    { limit: 100 },
  );
  return intentId;
}

describe('T055 deletion-state client access cases', () => {
  it.each(['deletion_pending', 'release_pending', 'released'] as const)(
    'T055 client in %s is denied self-status and has no client access',
    async (lifecycleState) => {
      const target = await registered(f);
      const approval = await call(
        f.po.client,
        'approve',
        approvalRequest(f, target),
      );
      expect(approval.status).toBe('ok');

      await transitionClientDeletion(f, target.userId, lifecycleState);

      await probe(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: target.userId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const [status] = await tx`select public.client_self_status() as result`;
        expect(status!.result).toEqual({ status: 'not_permitted' });
        await tx`reset role`;

        const [access] =
          await tx`select app_private.client_has_access(${f.wsA.id},${target.id}) as allowed`;
        expect(access!.allowed).toBe(false);

        for (const table of [
          'subscriptions',
          'subscription_installments',
          'payment_events',
          'subscription_activations',
        ]) {
          await tx.unsafe(`grant select on public.${table} to authenticated`);
          await tx`set local role authenticated`;
          expect(await tx.unsafe(`select * from public.${table}`)).toEqual([]);
          await tx`reset role`;
        }
      });
    },
  );

  it('T055 deleted rejected client is denied self-status and has no access', async () => {
    const target = await registered(f);
    const rej = await call(
      f.po.client,
      'reject',
      decisionRequest(f, target, 'reject'),
    );
    expect(rej.status).toBe('ok');

    await transitionClientDeletion(f, target.userId, 'released');

    await probe(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: target.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [status] = await tx`select public.client_self_status() as result`;
      expect(status!.result).toEqual({ status: 'not_permitted' });
      await tx`reset role`;

      const [access] =
        await tx`select app_private.client_has_access(${f.wsA.id},${target.id}) as allowed`;
      expect(access!.allowed).toBe(false);
    });
  });
});
