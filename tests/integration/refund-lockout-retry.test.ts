import { afterAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SupabaseAuthLockoutStore } from '../../lib/payments/refund-auth-lockout-store';
import { runAuthLockout } from '../../lib/payments/refund-auth-lockout';
import { admin } from './harness';
import { clientContext, graph, sql } from './registration-approval-fixture';

vi.mock('server-only', () => ({}));

const db = sql();
let authUserId: string | undefined;
afterAll(async () => {
  if (authUserId) await admin().auth.admin.deleteUser(authUserId);
  await db.end();
});

it('retains the committed refund outbox row and retries that same row after Auth Admin failure', async () => {
  const authUser = await admin().auth.admin.createUser({
    email: `refund-lockout-${randomUUID()}@example.test`,
    password: randomUUID(),
    email_confirm: true,
  });
  expect(authUser.error).toBeNull();
  if (!authUser.data.user)
    throw new Error('Auth user creation returned no user');
  authUserId = authUser.data.user.id;

  const f = await clientContext();
  const ids = await db.begin((tx) => graph(tx, f, { authUserId: authUserId! }));
  const refund = await f.po.client.rpc('record_refund', {
    request: {
      workspace_id: f.wsA.id,
      client_id: ids.client,
      purchase_id: ids.subscription,
      request_key: '00000000-0000-4000-8000-000000000096',
      amount_minor: '600',
      external_confirmation: true,
    },
  });
  expect(refund.error).toBeNull();
  expect(refund.data).toMatchObject({ status: 'ok' });

  const [before] = await db`
    select id,auth_user_id,status,attempts,safe_error_code
    from app_private.refund_auth_lockouts where client_id=${ids.client}`;
  expect(before).toMatchObject({
    auth_user_id: authUserId,
    status: 'pending',
    attempts: 0,
    safe_error_code: null,
  });
  const outboxId = before!.id as string;

  const store = new SupabaseAuthLockoutStore(
    admin() as unknown as ConstructorParameters<
      typeof SupabaseAuthLockoutStore
    >[0],
  );
  const claimed = await store.claimDue(100);
  const job = claimed.find((candidate) => candidate.id === outboxId);
  expect(job).toMatchObject({
    id: outboxId,
    authUserId,
    attempts: 0,
    status: 'pending',
  });

  const now = new Date();
  const providerFailure = 'private Auth Admin failure details';
  const updateUserById = vi.fn(async () => ({
    error: { code: 'provider_unavailable', message: providerFailure },
  }));
  const result = await runAuthLockout(job!, {
    authAdmin: { updateUserById },
    store,
    now: () => now,
    alertAfterAttempts: 3,
  });

  expect(updateUserById).toHaveBeenCalledWith(authUserId, {
    ban_duration: '876000h',
  });
  expect(result).toEqual({ status: 'retry_scheduled', attempt: 1 });
  const [after] = await db`
    select id,client_id,auth_user_id,status,attempts,safe_error_code,
      next_attempt_at,completed_at
    from app_private.refund_auth_lockouts where client_id=${ids.client}`;
  expect(after).toMatchObject({
    id: outboxId,
    client_id: ids.client,
    auth_user_id: authUserId,
    status: 'retry',
    attempts: 1,
    safe_error_code: 'provider_unavailable',
    completed_at: null,
  });
  expect(new Date(after!.next_attempt_at as Date).getTime()).toBe(
    now.getTime() + 120_000,
  );

  const [madeDue] = await db`
    update app_private.refund_auth_lockouts
    set next_attempt_at=clock_timestamp()-interval '1 second'
    where id=${outboxId} and status='retry'
    returning id`;
  expect(madeDue?.id).toBe(outboxId);
  const reclaimed = await store.claimDue(100);
  const retryJob = reclaimed.find((candidate) => candidate.id === outboxId);
  expect(retryJob).toMatchObject({
    id: outboxId,
    authUserId,
    attempts: 1,
    status: 'retry',
  });

  const completionAt = new Date(now.getTime() + 180_000);
  const completed = await runAuthLockout(retryJob!, {
    authAdmin: admin().auth.admin,
    store,
    now: () => completionAt,
    alertAfterAttempts: 3,
  });
  expect(completed).toEqual({ status: 'succeeded' });
  const [succeeded] = await db`
    select id,client_id,auth_user_id,status,attempts,safe_error_code,completed_at
    from app_private.refund_auth_lockouts where client_id=${ids.client}`;
  expect(succeeded).toMatchObject({
    id: outboxId,
    client_id: ids.client,
    auth_user_id: authUserId,
    status: 'succeeded',
    attempts: 1,
    safe_error_code: null,
  });
  expect(new Date(succeeded!.completed_at as Date).getTime()).toBe(
    completionAt.getTime(),
  );

  const [facts] = await db`
    select
      (select count(*)::int from public.refund_operations where client_id=${ids.client}) as refunds,
      (select count(*)::int from public.refund_allocation_events where subscription_id=${ids.subscription}) as allocations,
      (select count(*)::int from app_private.refund_auth_lockouts where client_id=${ids.client}) as lockouts,
      (select deactivated_at is not null from public.clients where id=${ids.client}) as inactive`;
  expect(facts).toEqual({
    refunds: 1,
    allocations: 1,
    lockouts: 1,
    inactive: true,
  });
  expect(JSON.stringify(after)).not.toContain(providerFailure);
});
