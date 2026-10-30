import { afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, anonClient, createStaff } from './harness';
import { clientContext, graph, sql } from './registration-approval-fixture';

const db = sql();
afterAll(async () => db.end());

async function lockoutFixture() {
  const email = `refund-alert-${randomUUID()}@example.test`;
  const password = randomUUID();
  const authUser = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(authUser.error).toBeNull();
  const authUserId = authUser.data.user?.id;
  if (!authUserId) throw new Error('Auth user creation returned no user');

  const f = await clientContext();
  const ids = await db.begin((tx) => graph(tx, f, { authUserId }));
  const refund = await f.po.client.rpc('record_refund', {
    request: {
      workspace_id: f.wsA.id,
      client_id: ids.client,
      purchase_id: ids.subscription,
      request_key: randomUUID(),
      amount_minor: '600',
      external_confirmation: true,
    },
  });
  expect(refund.error).toBeNull();
  expect(refund.data).toMatchObject({ status: 'ok' });
  const [row] = await db`
    select q.id,c.deactivated_at from app_private.refund_auth_lockouts q
    join public.clients c on c.id=q.client_id where q.client_id=${ids.client}`;
  if (!row) throw new Error('Refund lockout row not created');
  return {
    workspaceId: f.wsA.id,
    workspaceBId: f.wsB.id,
    po: f.po,
    clientId: ids.client,
    outboxId: row.id as string,
    deactivatedAt: row.deactivated_at as Date,
  };
}

it('fails closed for a non-staff client even when a crafted alert names them as recipient', async () => {
  const f = await lockoutFixture();
  const alertId = randomUUID();
  const clientEmail = `refund-alert-reader-${randomUUID()}@example.test`;
  const clientPassword = randomUUID();
  const clientUser = await admin().auth.admin.createUser({
    email: clientEmail,
    password: clientPassword,
    email_confirm: true,
  });
  expect(clientUser.error).toBeNull();
  const clientUserId = clientUser.data.user!.id;

  // This deliberately violates normal recipient policy to exercise the reader boundary.
  await db`insert into app_private.refund_auth_lockout_alerts(
    id,lockout_id,workspace_id,recipient_user_ids,reason,safe_error_code,attempts
  ) values(
    ${alertId},${f.outboxId},${f.workspaceId},array[${clientUserId}]::uuid[],
    'failure_threshold','provider_unavailable',3
  )`;

  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({
    email: clientEmail,
    password: clientPassword,
  });
  expect(signedIn.error).toBeNull();
  const result = await client.rpc('read_refund_auth_lockout_alerts', {
    p_limit: 10,
  });
  expect(result.error).toBeNull();
  expect(result.data).toEqual([]);

  const [definition] = await db`
    select pg_catalog.pg_get_functiondef(
      'public.read_refund_auth_lockout_alerts(integer)'::regprocedure
    ) as body`;
  expect(definition!.body).toMatch(
    /actor_role\s+is\s+null\s+or\s+actor_role\s+not\s+in\s*\(/i,
  );
});

async function addWorkspaceOwner(workspaceId: string, revoked = false) {
  const staff = await createStaff(
    'workspace_owner',
    `refund-alert-wo-${randomUUID()}`,
  );
  const userId = staff.userId;
  const [po] =
    await db`select user_id from public.staff_profiles where role='platform_owner' limit 1`;
  await db.begin(async (tx) => {
    await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by,revoked_at,revoked_by)
      values(${workspaceId},${userId},${po!.user_id},${revoked ? new Date() : null},${revoked ? po!.user_id : null})`;
  });
  return { userId, client: staff.client };
}

it('alerts exactly on the third failure, snapshots current PO/WO recipients, deduplicates, and resolves on success', async () => {
  const f = await lockoutFixture();
  const activeWo = await addWorkspaceOwner(f.workspaceId);
  const revokedWo = await addWorkspaceOwner(f.workspaceId, true);
  const foreignWo = await addWorkspaceOwner(f.workspaceBId);
  const checkedAt = new Date();

  for (const attempt of [1, 2]) {
    const result = await admin().rpc('retry_refund_auth_lockout_job', {
      p_id: f.outboxId,
      p_attempt: attempt,
      p_retry_at: new Date(
        checkedAt.getTime() + attempt * 60_000,
      ).toISOString(),
      p_safe_error_code: 'provider_unavailable',
    });
    expect(result.error).toBeNull();
    expect(result.data).toBe(true);
    const [count] =
      await db`select count(*)::int as count from app_private.refund_auth_lockout_alerts where lockout_id=${f.outboxId}`;
    expect(count!.count).toBe(0);
  }

  const third = await admin().rpc('retry_refund_auth_lockout_job', {
    p_id: f.outboxId,
    p_attempt: 3,
    p_retry_at: new Date(checkedAt.getTime() + 180_000).toISOString(),
    p_safe_error_code: 'provider_unavailable',
  });
  expect(third.error).toBeNull();
  expect(third.data).toBe(true);
  const [alert] =
    await db`select id,workspace_id,recipient_user_ids,reason,safe_error_code,attempts,resolved_at
    from app_private.refund_auth_lockout_alerts where lockout_id=${f.outboxId}`;
  expect(alert).toMatchObject({
    workspace_id: f.workspaceId,
    reason: 'failure_threshold',
    safe_error_code: 'provider_unavailable',
    attempts: 3,
    resolved_at: null,
  });
  expect(alert!.recipient_user_ids).toContain(activeWo.userId);
  expect(alert!.recipient_user_ids).not.toContain(revokedWo.userId);
  expect(alert!.recipient_user_ids).not.toContain(foreignWo.userId);
  expect(alert!.recipient_user_ids).toContain(
    (
      await db`select user_id from public.staff_profiles where role='platform_owner' limit 1`
    )[0]?.user_id,
  );
  const [audit] =
    await db`select action,target_table,workspace_id,details from public.audit_events
    where action='refund_auth_lockout.alerted' and target_id=${alert!.id}`;
  expect(audit).toMatchObject({
    action: 'refund_auth_lockout.alerted',
    target_table: 'refund_auth_lockout_alerts',
    workspace_id: f.workspaceId,
    details: {
      lockout_id: f.outboxId,
      reason: 'failure_threshold',
      attempts: 3,
      safe_error_code: 'provider_unavailable',
    },
  });
  expect(Object.keys(audit!.details as object).sort()).toEqual([
    'attempts',
    'lockout_id',
    'reason',
    'safe_error_code',
  ]);

  const fourth = await admin().rpc('retry_refund_auth_lockout_job', {
    p_id: f.outboxId,
    p_attempt: 4,
    p_retry_at: new Date(checkedAt.getTime() + 240_000).toISOString(),
    p_safe_error_code: 'provider_unavailable',
  });
  expect(fourth.error).toBeNull();
  const [deduped] =
    await db`select count(*)::int as count from app_private.refund_auth_lockout_alerts where lockout_id=${f.outboxId}`;
  expect(deduped!.count).toBe(1);

  const poRead = await f.po.client.rpc('read_refund_auth_lockout_alerts', {
    p_limit: 10,
  });
  const woRead = await activeWo.client.rpc('read_refund_auth_lockout_alerts', {
    p_limit: 10,
  });
  const revokedRead = await revokedWo.client.rpc(
    'read_refund_auth_lockout_alerts',
    { p_limit: 10 },
  );
  const foreignRead = await foreignWo.client.rpc(
    'read_refund_auth_lockout_alerts',
    { p_limit: 10 },
  );
  expect(poRead.error).toBeNull();
  expect(poRead.data).toHaveLength(1);
  expect(woRead.error).toBeNull();
  expect(woRead.data).toHaveLength(1);
  expect(revokedRead.error).toBeNull();
  expect(revokedRead.data).toEqual([]);
  expect(foreignRead.error).toBeNull();
  expect(foreignRead.data).toEqual([]);
  const completed = await admin().rpc('complete_refund_auth_lockout_job', {
    p_id: f.outboxId,
    p_completed_at: new Date().toISOString(),
  });
  expect(completed.error).toBeNull();
  const [resolved] =
    await db`select resolved_at from app_private.refund_auth_lockout_alerts where lockout_id=${f.outboxId}`;
  expect(resolved!.resolved_at).not.toBeNull();
  expect(JSON.stringify(alert)).not.toMatch(
    /email|auth_user_id|provider text|secret/i,
  );
});

it('exposes the alert table only through narrow SECURITY DEFINER functions', async () => {
  const expected = new Map([
    [
      'public.alert_expired_refund_auth_lockouts(integer,timestamp with time zone)',
      true,
    ],
    [
      'public.retry_refund_auth_lockout_job(uuid,integer,timestamp with time zone,text)',
      true,
    ],
    [
      'public.complete_refund_auth_lockout_job(uuid,timestamp with time zone)',
      true,
    ],
    ['public.read_refund_auth_lockout_alerts(integer)', false],
  ]);
  for (const [signature, serviceRole] of expected) {
    const [row] = await db`
      select p.prosecdef as security_definer,
        has_function_privilege('service_role',p.oid,'execute') as service_role,
        has_function_privilege('authenticated',p.oid,'execute') as authenticated,
        has_function_privilege('anon',p.oid,'execute') as anon,
        has_function_privilege('public',p.oid,'execute') as public
      from pg_proc p where p.oid=to_regprocedure(${signature})`;
    expect(row).toEqual({
      security_definer: true,
      service_role: serviceRole,
      authenticated: signature.includes('read_refund_auth_lockout_alerts'),
      anon: false,
      public: false,
    });
  }
  for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    const [row] = await db`
      select has_table_privilege('service_role','app_private.refund_auth_lockout_alerts',${privilege}) as allowed`;
    expect(row!.allowed).toBe(false);
  }
});

it('alerts at five minutes even when fewer than three failures are due for retry', async () => {
  const f = await lockoutFixture();
  const activeWo = await addWorkspaceOwner(f.workspaceId);
  const syntheticDeactivationAt = new Date('2000-01-01T00:00:00.000Z');
  await db`update app_private.client_deactivation_state
    set deactivated_at=${syntheticDeactivationAt} where client_id=${f.clientId}`;
  const threshold = new Date(
    syntheticDeactivationAt.getTime() + 5 * 60_000 + 2,
  );
  await db`update app_private.refund_auth_lockouts set attempts=1,next_attempt_at=${new Date(threshold.getTime() + 60_000)} where id=${f.outboxId}`;

  const sweep = await admin().rpc('alert_expired_refund_auth_lockouts', {
    p_limit: 10,
    p_checked_at: threshold.toISOString(),
  });
  expect(sweep.error).toBeNull();
  expect(sweep.data).toBeGreaterThanOrEqual(1);
  const [alert] =
    await db`select recipient_user_ids,reason,attempts from app_private.refund_auth_lockout_alerts where lockout_id=${f.outboxId}`;
  expect(alert).toEqual({
    recipient_user_ids: expect.arrayContaining([activeWo.userId]),
    reason: 'time_threshold',
    attempts: 1,
  });
  const secondSweep = await admin().rpc('alert_expired_refund_auth_lockouts', {
    p_limit: 10,
    p_checked_at: threshold.toISOString(),
  });
  expect(secondSweep.error).toBeNull();
  const [deduped] =
    await db`select count(*)::int as count from app_private.refund_auth_lockout_alerts where lockout_id=${f.outboxId}`;
  expect(deduped!.count).toBe(1);
});

it('rolls back a third-failure alert when its audit insert fails', async () => {
  const f = await lockoutFixture();
  await admin().rpc('retry_refund_auth_lockout_job', {
    p_id: f.outboxId,
    p_attempt: 1,
    p_retry_at: new Date().toISOString(),
    p_safe_error_code: 'provider_unavailable',
  });
  await admin().rpc('retry_refund_auth_lockout_job', {
    p_id: f.outboxId,
    p_attempt: 2,
    p_retry_at: new Date().toISOString(),
    p_safe_error_code: 'provider_unavailable',
  });
  const triggerName = `fail_refund_alert_audit_${randomUUID().replaceAll('-', '')}`;
  await db.unsafe(
    `create function app_private.${triggerName}() returns trigger language plpgsql set search_path='' as $body$ begin if new.action='refund_auth_lockout.alerted' and new.details->>'lockout_id'='${f.outboxId}' then raise exception 'test audit failure'; end if; return new; end $body$`,
  );
  await db.unsafe(
    `create trigger ${triggerName} before insert on public.audit_events for each row execute function app_private.${triggerName}()`,
  );
  try {
    const failed = await admin().rpc('retry_refund_auth_lockout_job', {
      p_id: f.outboxId,
      p_attempt: 3,
      p_retry_at: new Date().toISOString(),
      p_safe_error_code: 'provider_unavailable',
    });
    expect(failed.error).not.toBeNull();
    const [state] =
      await db`select attempts from app_private.refund_auth_lockouts where id=${f.outboxId}`;
    const [alerts] =
      await db`select count(*)::int as count from app_private.refund_auth_lockout_alerts where lockout_id=${f.outboxId}`;
    expect(state!.attempts).toBe(2);
    expect(alerts!.count).toBe(0);
  } finally {
    await db.unsafe(`drop trigger ${triggerName} on public.audit_events`);
    await db.unsafe(`drop function app_private.${triggerName}()`);
  }
});
