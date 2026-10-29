import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { admin, anonClient } from './harness';
import {
  clientContext,
  createRecoveryClientTarget,
} from './client-accounts-fixture';
import { loadEnv, sql } from './harness';
vi.mock('server-only', () => ({}));
import { runAuthLockout } from '../../lib/payments/refund-auth-lockout';

const db = sql();
afterAll(() => db.end());

async function commitRefundDeactivation(clientId: string, authUserId: string) {
  await db.begin(async (tx) => {
    await tx`insert into app_private.client_deactivation_state(client_id,auth_user_id) values(${clientId},${authUserId})`;
    await tx`insert into app_private.refund_auth_lockouts(client_id,auth_user_id) values(${clientId},${authUserId})`;
  });
}

async function authPost(path: string, body: Record<string, string>) {
  const { apiUrl, anonKey } = loadEnv();
  const response = await fetch(`${apiUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

it('denies client sign-in and refresh immediately after committed deactivation, even while lockout worker is unavailable', async () => {
  const client = await createRecoveryClientTarget(await clientContext());
  const signed = await anonClient().auth.signInWithPassword({
    email: client.email,
    password: client.password,
  });
  expect(signed.error).toBeNull();
  const refreshToken = signed.data.session!.refresh_token;

  // This committed marker is the refund transaction's deactivation write. The
  // Auth Admin worker is intentionally never called during these probes.
  const [clientRow] =
    await db`select id from public.clients where auth_user_id=${client.userId}`;
  const committedAt = performance.now();
  await commitRefundDeactivation(clientRow!.id as string, client.userId);
  const worker = await runAuthLockout(
    {
      id: '00000000-0000-4000-8000-000000000001',
      authUserId: client.userId,
      attempts: 0,
      status: 'pending',
    },
    {
      authAdmin: {
        updateUserById: async () => ({
          error: { code: 'provider_unavailable' },
        }),
      },
      store: {
        markSucceeded: async () => undefined,
        markRetry: async () => undefined,
      },
      now: () => new Date(),
      alertAfterAttempts: 3,
    },
  );
  expect(worker.status).toBe('retry_scheduled');
  if (process.env.PO1_AUTH_WINDOW_MODE === 'before-hook')
    await new Promise((resolve) => setTimeout(resolve, 1000));
  const firstAttemptAt = performance.now();
  const deniedSignIn = await authPost('token?grant_type=password', {
    email: client.email,
    password: client.password,
  });
  const deniedRefresh = await authPost('token?grant_type=refresh_token', {
    refresh_token: refreshToken,
  });
  if (process.env.PO1_AUTH_WINDOW_MODE === 'before-hook') {
    expect(deniedSignIn.status).toBe(200);
    expect(deniedRefresh.status).toBe(200);
    const lockout = await admin().auth.admin.updateUserById(client.userId, {
      ban_duration: '876000h',
    });
    const lockoutCompletedAt = performance.now();
    expect(lockout.error).toBeNull();
    const afterBanSignIn = await authPost('token?grant_type=password', {
      email: client.email,
      password: client.password,
    });
    const afterBanRefresh = await authPost('token?grant_type=refresh_token', {
      refresh_token: deniedRefresh.body.refresh_token as string,
    });
    expect(afterBanSignIn.status).toBe(400);
    expect(afterBanRefresh.status).toBe(400);
    process.stdout.write(
      `PO1_WINDOW before-hook commit_to_first_attempt_ms=${(firstAttemptAt - committedAt).toFixed(3)} commit_to_ban_success_ms=${(lockoutCompletedAt - committedAt).toFixed(3)} sign_in=${deniedSignIn.status} refresh=${deniedRefresh.status} ban=${lockout.error ? 'failed' : '200'} after_sign_in=${afterBanSignIn.status} after_refresh=${afterBanRefresh.status}\n`,
    );
    return;
  }
  expect(deniedSignIn.status).toBe(403);
  expect(deniedRefresh.status).toBe(403);
  expect(deniedSignIn.body.msg).toBe('account_unavailable');
  expect(deniedRefresh.body.msg).toBe('account_unavailable');
  expect(deniedSignIn.body.access_token).toBeUndefined();
  expect(deniedRefresh.body.access_token).toBeUndefined();
  expect(JSON.stringify(deniedSignIn.body)).not.toContain(client.email);
  expect(JSON.stringify(deniedRefresh.body)).not.toContain(client.userId);
  process.stdout.write(
    `PO1_WINDOW after-hook commit_to_first_attempt_ms=${(firstAttemptAt - committedAt).toFixed(3)} sign_in=${deniedSignIn.status} refresh=${deniedRefresh.status} worker=retry_scheduled\n`,
  );
});

it('keeps sign-in allowed when deactivation is rolled back', async () => {
  const client = await createRecoveryClientTarget(await clientContext());
  try {
    await db.begin(async (tx) => {
      const [clientRow] =
        await tx`select id from public.clients where auth_user_id=${client.userId}`;
      await tx`insert into app_private.client_deactivation_state(client_id,auth_user_id) values(${clientRow!.id},${client.userId})`;
      await tx`insert into app_private.refund_auth_lockouts(client_id,auth_user_id) values(${clientRow!.id},${client.userId})`;
      const signed = await anonClient().auth.signInWithPassword({
        email: client.email,
        password: client.password,
      });
      expect(signed.error).toBeNull();
      expect(signed.data.session).not.toBeNull();
      throw new Error('rollback marker');
    });
  } catch (error) {
    if ((error as Error).message !== 'rollback marker') throw error;
  }
  const states =
    await db`select count(*)::integer as count from app_private.client_deactivation_state where auth_user_id=${client.userId}`;
  const jobs =
    await db`select count(*)::integer as count from app_private.refund_auth_lockouts where auth_user_id=${client.userId}`;
  expect(states[0]!.count).toBe(0);
  expect(jobs[0]!.count).toBe(0);
});

it('does not change staff sign-in and restricts hook execution to supabase_auth_admin', async () => {
  const email = `po1-hook-${randomUUID()}@example.test`;
  const password = `F3-${randomUUID()}-aA1!`;
  const created = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  expect(created.data.user).not.toBeNull();
  const profile = await admin().from('staff_profiles').insert({
    user_id: created.data.user!.id,
    role: 'platform_owner',
  });
  expect(profile.error).toBeNull();
  const signed = await anonClient().auth.signInWithPassword({
    email,
    password,
  });
  expect(signed.error).toBeNull();
  expect(signed.data.session).not.toBeNull();
  const [acl] = await db`
    select p.prosecdef as security_definer, p.proconfig,
      has_function_privilege('supabase_auth_admin','public.custom_access_token_hook(jsonb)','execute') as auth_admin,
      has_function_privilege('authenticated','public.custom_access_token_hook(jsonb)','execute') as authenticated,
      has_function_privilege('anon','public.custom_access_token_hook(jsonb)','execute') as anon,
      has_function_privilege('public','public.custom_access_token_hook(jsonb)','execute') as public,
      has_function_privilege('service_role','public.custom_access_token_hook(jsonb)','execute') as service_role,
      has_column_privilege('supabase_auth_admin','app_private.client_deactivation_state','auth_user_id','select') as state_read_auth_admin,
      has_column_privilege('authenticated','app_private.client_deactivation_state','auth_user_id','select') as state_read_authenticated,
      has_column_privilege('anon','app_private.client_deactivation_state','auth_user_id','select') as state_read_anon,
      has_column_privilege('service_role','app_private.client_deactivation_state','auth_user_id','select') as state_read_service_role
    from pg_proc p where p.oid='public.custom_access_token_hook(jsonb)'::regprocedure
  `;
  expect(acl!.security_definer).toBe(false);
  expect(acl!.proconfig).toEqual(['search_path=""']);
  expect(acl).toMatchObject({
    auth_admin: true,
    authenticated: false,
    anon: false,
    public: false,
    service_role: false,
    state_read_auth_admin: true,
    state_read_authenticated: false,
    state_read_anon: false,
    state_read_service_role: false,
  });
});

it('denies issuance for a client whose deactivation check is bypassed by the hook', async () => {
  const client = await createRecoveryClientTarget(await clientContext());
  const [clientRow] =
    await db`select id from public.clients where auth_user_id=${client.userId}`;
  await commitRefundDeactivation(clientRow!.id as string, client.userId);
  const result = await admin().auth.admin.updateUserById(client.userId, {
    ban_duration: 'none',
  });
  expect(result.error).toBeNull();
  const signed = await authPost('token?grant_type=password', {
    email: client.email,
    password: client.password,
  });
  expect(signed.status).toBe(403);
  expect(signed.body.access_token).toBeUndefined();
});
