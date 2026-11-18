import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { loadActorRows } from '../../lib/auth/actor';
import { authorize } from '../../lib/auth/authorize';
import {
  FINANCIAL_RESOLUTION_ACKNOWLEDGEMENT,
  FINANCIAL_RESOLUTION_CATEGORIES,
} from '../../lib/client-accounts/deletion-policy';
import { drainAccountDeletions } from '../../workers/cron/src/account-deletion';
import {
  clientContext,
  signup,
  signupFixture,
  type ClientContext,
} from './client-accounts-fixture';
import { withCrashSafeFunctionMutant } from './function-drift-guard';
import {
  admin,
  anonClient,
  checked,
  createStaff,
  loadEnv,
  sql,
} from './harness';
import { publishedFixture } from './packages-fixture';
import {
  checked as linkChecked,
  issue,
  schedule,
} from './registration-links-fixture';

const db = sql();
const env = loadEnv();
const cronEnv = {
  SUPABASE_URL: env.apiUrl,
  SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
};

afterAll(async () => {
  await db.end();
});

async function makeWorkspaceLink(
  context: ClientContext,
  workspaceId: string,
  withSchedule = false,
) {
  const pkg = await publishedFixture(context, {
    tier_rank: 1,
    price_minor: '1200',
    workspace_id: workspaceId,
  });
  linkChecked(
    await context.po.client.rpc('set_package_offer_available', {
      workspace_id: workspaceId,
      offer_id: pkg.offer.id,
      available: true,
    }),
  );
  const linkId = linkChecked(
    await issue(
      {
        ...context,
        p: { ...pkg, offer: pkg.offer, versionId: pkg.versionId },
      },
      context.po.client,
      withSchedule ? { installments: schedule } : {},
    ),
  ) as string;
  return {
    ...context,
    p: { ...pkg, offer: pkg.offer, versionId: pkg.versionId },
    link: linkId,
  };
}

async function signupRealClient(
  context: ClientContext,
  overrides: Partial<{ email: string; phone: string }> = {},
) {
  const f = await signupFixture(context);
  const fields = {
    ...f.fields,
    ...(overrides.email ? { email: overrides.email } : {}),
    ...(overrides.phone ? { phone: overrides.phone } : {}),
  };
  const result = await signup(db, f, fields);
  if (result.status !== 'complete') {
    return {
      ok: false as const,
      status: String(result.status),
      fixture: f,
      fields,
    };
  }
  const [clientRow] = await db`
    select id, workspace_id, auth_user_id, approval_state
    from public.clients
    where registration_link_id = ${f.link}
  `;
  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({
    email: fields.email,
    password: fields.password,
  });
  if (signedIn.error) throw new Error(signedIn.error.message);
  return {
    ok: true as const,
    clientId: clientRow!.id as string,
    workspaceId: clientRow!.workspace_id as string,
    userId: clientRow!.auth_user_id as string,
    email: fields.email,
    phone: fields.phone,
    password: fields.password,
    name: fields.name,
    username: fields.username,
    dob: fields.date_of_birth,
    client,
    fixture: f,
  };
}

async function approveViaRpc(
  actorClient: ClientContext['po']['client'],
  workspaceId: string,
  clientId: string,
  expectedAmountMinor = '1200',
) {
  const todayCairo = new Date().toISOString().slice(0, 10);
  const reqKey = randomUUID();
  const res = await actorClient.rpc('registration_approve', {
    request: {
      workspace_id: workspaceId,
      client_id: clientId,
      request_key: reqKey,
      expected_state: 'pending-approval',
      expected_installment_seq: 1,
      expected_amount_minor: expectedAmountMinor,
      currency: 'USD',
      collected_on: todayCairo,
      payment_confirmed: true,
    },
  });
  expect(res.error).toBeNull();
  expect(res.data).toMatchObject({ status: 'ok' });
  return { reqKey, receipt: res.data };
}

async function waitForLockWait(queryText: string) {
  const observer = sql();
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      const [row] = await observer`
        select count(*)::int as count
        from pg_stat_activity
        where wait_event_type = 'Lock' and query ilike ${`%${queryText}%`}
      `;
      if ((row?.count as number) > 0) return;
      await new Promise((r) => setTimeout(r, 40));
    }
    throw new Error(`Statement did not reach a lock wait: ${queryText}`);
  } finally {
    await observer.end();
  }
}

async function expectMutationKilled(
  identity: string,
  mutate: (definition: string) => string,
  probe: () => Promise<void>,
) {
  let caught: unknown = null;
  try {
    await withCrashSafeFunctionMutant(identity, mutate, probe);
  } catch (error) {
    caught = error;
  }
  expect(caught, `Mutant survived for ${identity}`).not.toBeNull();
  const message = String(caught);
  expect(message).not.toContain('Mutation did not change');
  expect(message).not.toContain('Missing function');
}

describe('F11 T047/T048/T059/T060 account deletion guarded release', () => {
  it('denies non-PO actors, direct table access, and non-service_role continuation calls', async () => {
    const context = await clientContext();
    const target = await signupRealClient(context);
    expect(target.ok).toBe(true);
    if (!target.ok) throw new Error('Expected signup');

    for (const denied of [
      context.woA,
      context.trainerA,
      context.salesA,
      { client: target.client },
    ]) {
      const res = await denied.client.rpc('request_account_deletion', {
        p_target_user_id: target.userId,
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.message).toContain('not_permitted');
    }

    const [intentCount] = await db`
      select count(*)::int as count
      from app_private.account_deletion_intents
      where target_user_id = ${target.userId}
    `;
    expect(intentCount?.count).toBe(0);
    const [clientRow] = await db`
      select deletion_state from public.clients where id = ${target.clientId}
    `;
    expect(clientRow?.deletion_state).toBe('active');

    for (const rpcName of [
      'claim_account_deletion_intents',
      'advance_deletion_step_a',
      'execute_deletion_step_b',
      'begin_deletion_step_c',
      'execute_deletion_step_d',
      'retry_account_deletion_intent',
    ]) {
      const poDenied = await context.po.client.rpc(rpcName, {});
      expect(poDenied.error).not.toBeNull();
      const anonDenied = await anonClient().rpc(rpcName, {});
      expect(anonDenied.error).not.toBeNull();
    }
  });

  it('completes client deletion lifecycle (0)->(A)->(B)->(C)->(D), denies existing JWT, preserves history, clears PII/metadata, and allows cross-workspace re-signup', async () => {
    const context = await clientContext();
    const created = await signupRealClient(context);
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('Expected signup');

    const metaSet = await admin().auth.admin.updateUserById(created.userId, {
      user_metadata: {
        email_verified: true,
        full_name: created.name,
        custom_profile: {
          phone_copy: created.phone,
          nested_note: 'sensitive-client-note',
        },
      },
    });
    expect(metaSet.error).toBeNull();

    const approved = await approveViaRpc(
      context.po.client,
      context.wsA.id,
      created.clientId,
    );
    const preStatus = await created.client.rpc('client_self_status');
    expect(preStatus.data).toEqual({
      status: 'ok',
      approval_state: 'approved',
    });

    const beforeAudit = await db`
      select id, action, target_table, target_id, details
      from public.audit_events
      where target_id = ${created.clientId}
      order by id
    `;
    const [beforeSub] = await db`
      select * from public.subscriptions
      where workspace_id = ${context.wsA.id} and client_id = ${created.clientId}
    `;
    expect(beforeSub).toBeDefined();

    const missingConf = await context.po.client.rpc(
      'request_account_deletion',
      { p_target_user_id: created.userId },
    );
    expect(missingConf.error?.message).toContain(
      'financial_confirmation_required',
    );

    const step0 = await context.po.client.rpc('request_account_deletion', {
      p_target_user_id: created.userId,
      p_financial_confirmation: {
        category: 'refunded_outside_lifter',
        acknowledgement: FINANCIAL_RESOLUTION_ACKNOWLEDGEMENT.en,
      },
    });
    expect(step0.error).toBeNull();
    expect(step0.data).toMatchObject({ status: 'deletion_pending' });
    const intentId = (step0.data as { intent_id: string }).intent_id;

    // Immediately after step (0): pre-deletion JWT denied at app/RLS/RPC/Storage
    const deniedStatus = await created.client.rpc('client_self_status');
    expect(deniedStatus.data).toEqual({ status: 'not_permitted' });

    const [hasAccess] = await db.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: created.userId, role: 'authenticated' })}, true)`;
      return tx`select app_private.client_has_access(${context.wsA.id}, ${created.clientId}) as ok`;
    });
    expect(hasAccess?.ok).toBe(false);

    const storageDeny = await created.client.storage
      .from('branding-staging')
      .upload(`${context.wsA.id}/staging/${randomUUID()}`, new Blob(['x']));
    expect(storageDeny.error).not.toBeNull();

    // Client-row guard amendment refuses unguarded direct updates
    await expect(
      db`update public.clients set deletion_state = 'released' where id = ${created.clientId}`,
    ).rejects.toThrow(/invalid_client_transition/);
    await expect(
      db`update public.clients set approval_state = 'rejected' where id = ${created.clientId}`,
    ).rejects.toThrow(/invalid_client_transition/);

    // Out-of-order continuation guard: step (B) refuses before step (A) ban is confirmed
    const [claimedBeforeBan] = await db<
      { id: string; lease_token: string }[]
    >`select id, lease_token from public.claim_account_deletion_intents(1)`;
    expect(claimedBeforeBan?.id).toBe(intentId);
    const outOfOrderB = await db<
      { ok: boolean }[]
    >`select public.execute_deletion_step_b(${intentId}, ${claimedBeforeBan!.lease_token}) as ok`;
    expect(outOfOrderB[0]?.ok).toBe(false);

    // Pause/failure at step (C) after (A)->(B)->begin_C (auth_release_in_progress)
    await db`
      update app_private.account_deletion_intents
      set lease_token = null, lease_expires_at = null
      where id = ${intentId}
    `;
    const failingFetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/v1/admin/users/') && init?.method === 'PUT') {
        const parsed = JSON.parse(String(init.body)) as Record<string, unknown>;
        if ('email' in parsed) {
          return new Response(null, { status: 503 });
        }
      }
      return fetch(input, init);
    };
    const pausedDrain = await drainAccountDeletions(cronEnv, {
      fetcher: failingFetcher,
    });
    expect(pausedDrain).toMatchObject({ claimed: 1, completed: 0, failed: 1 });

    const [pausedIntent] = await db`
      select state, last_error_code from app_private.account_deletion_intents where id = ${intentId}
    `;
    expect(pausedIntent).toEqual({
      state: 'auth_release_in_progress',
      last_error_code: 'provider_unavailable',
    });

    const wsBContext = await makeWorkspaceLink(context, context.wsB.id);
    const reuseEmailAttempt = await signupRealClient(wsBContext, {
      email: created.email,
    });
    expect(reuseEmailAttempt.ok).toBe(false);
    const reusePhoneAttempt = await signupRealClient(wsBContext, {
      phone: created.phone,
    });
    expect(reusePhoneAttempt.ok).toBe(false);

    await db`
      update app_private.account_deletion_intents
      set next_attempt_at = clock_timestamp() - interval '1 second'
      where id = ${intentId}
    `;
    const finalDrain = await drainAccountDeletions(cronEnv);
    expect(finalDrain).toMatchObject({ claimed: 1, completed: 1, failed: 0 });

    const [releasedClient] = await db`
      select * from public.clients where id = ${created.clientId}
    `;
    expect(releasedClient).toMatchObject({
      id: created.clientId,
      workspace_id: context.wsA.id,
      auth_user_id: created.userId,
      approval_state: 'approved',
      deletion_state: 'released',
      email_normalized: null,
      phone_e164: null,
      name: null,
      date_of_birth: null,
      username_normalized: null,
      telegram_username: null,
    });

    const [retainedAuth] = await db`
      select id, email, phone, raw_user_meta_data, banned_until
      from auth.users
      where id = ${created.userId}
    `;
    expect(retainedAuth?.id).toBe(created.userId);
    expect(retainedAuth?.raw_user_meta_data).toEqual({});
    expect(retainedAuth?.banned_until).not.toBeNull();

    const deletionAudits = await db`
      select action, actor_user_id, details
      from public.audit_events
      where target_id = ${intentId} or target_id = ${created.clientId}
      order by id
    `;
    const serializedScan = JSON.stringify({
      releasedClient,
      retainedAuth,
      deletionAudits: deletionAudits.filter((a) =>
        String(a.action).startsWith('account_deletion.'),
      ),
    }).toLowerCase();
    for (const pii of [
      created.email.toLowerCase(),
      created.phone.toLowerCase(),
      created.name.toLowerCase(),
      created.username.toLowerCase(),
      created.dob.toLowerCase(),
      'sensitive-client-note',
    ]) {
      expect(serializedScan).not.toContain(pii);
    }

    const afterAudit = await db`
      select id, action, target_table, target_id, details
      from public.audit_events
      where target_id = ${created.clientId}
        and action not like 'account_deletion.%'
      order by id
    `;
    expect(afterAudit).toEqual(beforeAudit);
    const [afterSub] = await db`
      select * from public.subscriptions
      where workspace_id = ${context.wsA.id} and client_id = ${created.clientId}
    `;
    expect(afterSub).toEqual(beforeSub);
    await expect(
      db`delete from public.clients where id = ${created.clientId}`,
    ).rejects.toThrow();
    await expect(
      db`delete from public.subscriptions where id = ${beforeSub!.id}`,
    ).rejects.toThrow();

    const replayApprove = await context.po.client.rpc('registration_approve', {
      request: {
        workspace_id: context.wsA.id,
        client_id: created.clientId,
        request_key: approved.reqKey,
        expected_state: 'pending-approval',
        expected_installment_seq: 1,
        expected_amount_minor: '1200',
        currency: 'USD',
        collected_on: new Date().toISOString().slice(0, 10),
        payment_confirmed: true,
      },
    });
    expect(replayApprove.data).toEqual(approved.receipt);

    const postStatus = await created.client.rpc('client_self_status');
    expect(postStatus.data).toEqual({ status: 'not_permitted' });
    const loginAttempt = await anonClient().auth.signInWithPassword({
      email: created.email,
      password: created.password,
    });
    expect(loginAttempt.error).not.toBeNull();

    const reregistered = await signupRealClient(wsBContext, {
      email: created.email,
      phone: created.phone,
    });
    expect(reregistered.ok).toBe(true);
    if (!reregistered.ok) throw new Error('Expected re-registration');
    expect(reregistered.userId).not.toBe(created.userId);
    expect(reregistered.clientId).not.toBe(created.clientId);
    expect(reregistered.workspaceId).toBe(context.wsB.id);
    const [copiedSubs] = await db`
      select count(*)::int as count from public.subscriptions
      where client_id = ${reregistered.clientId}
    `;
    expect(copiedSubs?.count).toBe(0);
  });

  it('enforces F12/F13 deletion_state stale_state guards and FR-025 single-use confirmation lifecycle (T059, 012 T055)', async () => {
    const baseContext = await clientContext();
    const scheduledContext = await makeWorkspaceLink(
      baseContext,
      baseContext.wsA.id,
      true,
    );
    const pendingClient = await signupRealClient(baseContext);
    const rejectedClient = await signupRealClient(baseContext);
    const approvedClient = await signupRealClient(scheduledContext);
    if (!pendingClient.ok || !rejectedClient.ok || !approvedClient.ok) {
      throw new Error('Expected signup fixtures');
    }

    const rejectRes = await baseContext.po.client.rpc('registration_reject', {
      request: {
        workspace_id: baseContext.wsA.id,
        client_id: rejectedClient.clientId,
        request_key: randomUUID(),
        expected_state: 'pending-approval',
        reason_code: 'registration_rejected',
      },
    });
    expect(rejectRes.data).toMatchObject({ status: 'ok' });

    await approveViaRpc(
      baseContext.po.client,
      baseContext.wsA.id,
      approvedClient.clientId,
      '400',
    );
    const [sub] = await db`
      select id from public.subscriptions
      where workspace_id = ${baseContext.wsA.id} and client_id = ${approvedClient.clientId}
    `;

    const delPending = await baseContext.po.client.rpc(
      'request_account_deletion',
      { p_target_user_id: pendingClient.userId },
    );
    expect(delPending.error).toBeNull();
    const delRejected = await baseContext.po.client.rpc(
      'request_account_deletion',
      { p_target_user_id: rejectedClient.userId },
    );
    expect(delRejected.error).toBeNull();

    const approveStale = await baseContext.po.client.rpc(
      'registration_approve',
      {
        request: {
          workspace_id: baseContext.wsA.id,
          client_id: pendingClient.clientId,
          request_key: randomUUID(),
          expected_state: 'pending-approval',
          expected_installment_seq: 1,
          expected_amount_minor: '1200',
          currency: 'USD',
          collected_on: new Date().toISOString().slice(0, 10),
          payment_confirmed: true,
        },
      },
    );
    expect(approveStale.data).toEqual({ status: 'stale_state' });

    const rejectStale = await baseContext.po.client.rpc('registration_reject', {
      request: {
        workspace_id: baseContext.wsA.id,
        client_id: pendingClient.clientId,
        request_key: randomUUID(),
        expected_state: 'pending-approval',
        reason_code: 'registration_rejected',
      },
    });
    expect(rejectStale.data).toEqual({ status: 'stale_state' });

    const reconsiderStale = await baseContext.po.client.rpc(
      'registration_reconsider',
      {
        request: {
          workspace_id: baseContext.wsA.id,
          client_id: rejectedClient.clientId,
          request_key: randomUUID(),
          expected_state: 'rejected',
          expected_installment_seq: 1,
          expected_amount_minor: '1200',
          currency: 'USD',
          collected_on: new Date().toISOString().slice(0, 10),
          payment_confirmed: true,
        },
      },
    );
    expect(reconsiderStale.data).toEqual({ status: 'stale_state' });

    const badAck = await baseContext.po.client.rpc(
      'record_deletion_financial_confirmation',
      {
        p_workspace_id: baseContext.wsA.id,
        p_client_id: approvedClient.clientId,
        p_category: 'forfeited_under_contract',
        p_acknowledgement: 'wrong acknowledgement',
      },
    );
    expect(badAck.error?.message).toContain('invalid_financial_confirmation');

    expect(FINANCIAL_RESOLUTION_CATEGORIES.forfeited_under_contract.ar).toBe(
      'تم التنازل عن المبلغ حسب العقد',
    );
    const conf = await baseContext.po.client.rpc(
      'record_deletion_financial_confirmation',
      {
        p_workspace_id: baseContext.wsA.id,
        p_client_id: approvedClient.clientId,
        p_category: 'forfeited_under_contract',
        p_acknowledgement: FINANCIAL_RESOLUTION_ACKNOWLEDGEMENT.ar,
      },
    );
    expect(conf.error).toBeNull();
    const confAuditId = (conf.data as { confirmation_audit_id: number })
      .confirmation_audit_id;

    const delApproved = await baseContext.po.client.rpc(
      'request_account_deletion',
      {
        p_target_user_id: approvedClient.userId,
        p_financial_confirmation_audit_id: confAuditId,
      },
    );
    expect(delApproved.error).toBeNull();
    const approvedIntentId = (delApproved.data as { intent_id: string })
      .intent_id;

    const renewalStale = await baseContext.po.client.rpc('record_renewal', {
      request: {
        workspace_id: baseContext.wsA.id,
        client_id: approvedClient.clientId,
        predecessor_subscription_id: sub!.id,
        package_offer_id: scheduledContext.p.offer.id,
        request_key: randomUUID(),
        expected_revision: 0,
        renewal_confirmed: true,
      },
    });
    expect(renewalStale.data).toEqual({ status: 'stale_state' });

    // Unpaid seq 2 installment must return stale_state with zero payment_events written
    const [obligation2] = await db`
      select id from public.subscription_installments
      where workspace_id = ${baseContext.wsA.id} and subscription_id = ${sub!.id} and seq = 2
    `;
    const collectStale = await baseContext.po.client.rpc(
      'installment_collect',
      {
        request: {
          workspace_id: baseContext.wsA.id,
          client_id: approvedClient.clientId,
          request_key: randomUUID(),
          subscription_id: sub!.id,
          obligation_id: obligation2!.id,
          expected_installment_seq: 2,
          expected_revision: 0,
          expected_previous_event_id: null,
          expected_amount_minor: '800',
          currency: 'USD',
          collected_on: new Date().toISOString().slice(0, 10),
          payment_confirmed: true,
        },
      },
    );
    expect(collectStale.data).toEqual({ status: 'stale_state' });

    const drained = await drainAccountDeletions(cronEnv);
    expect(drained.failed).toBe(0);
    const [consumedIntent] = await db`
      select state, financial_confirmation_consumed_at
      from app_private.account_deletion_intents where id = ${approvedIntentId}
    `;
    expect(consumedIntent?.state).toBe('completed');
    expect(consumedIntent?.financial_confirmation_consumed_at).not.toBeNull();

    const secondClient = await signupRealClient(baseContext);
    if (!secondClient.ok) throw new Error('Expected second signup');
    await approveViaRpc(
      baseContext.po.client,
      baseContext.wsA.id,
      secondClient.clientId,
    );
    const reuseAttempt = await baseContext.po.client.rpc(
      'request_account_deletion',
      {
        p_target_user_id: secondClient.userId,
        p_financial_confirmation_audit_id: confAuditId,
      },
    );
    expect(reuseAttempt.error?.message).toContain(
      'invalid_financial_confirmation',
    );
  });

  it('supports staff deletions (last WO, Trainer reassignment, membership-grant interleaving, PO self-deletion) and enforces FR-026 last-PO refusal/race', async () => {
    const context = await clientContext();
    const extraPo = await createStaff('platform_owner', 's64-del-po2');

    await admin().auth.admin.updateUserById(context.woA.userId, {
      user_metadata: { staff_tag: { secret: 'wo-pii' } },
    });
    await admin().auth.admin.updateUserById(extraPo.userId, {
      user_metadata: { staff_tag: { secret: 'po2-pii' } },
    });

    // 1. Last active Workspace Owner deletion -> memberships revoked; approvals fall to PO; PO appoints replacement
    const woDel = await context.po.client.rpc('request_account_deletion', {
      p_target_user_id: context.woA.userId,
    });
    expect(woDel.error).toBeNull();
    const woIntentId = (woDel.data as { intent_id: string }).intent_id;

    const woActor = await loadActorRows(context.woA.client, context.woA.userId);
    expect(woActor?.role).toBeNull();
    expect(authorize(woActor!, 'approve_registration', context.wsA.id)).toBe(
      false,
    );

    const grantDuringDel = await context.po.client
      .from('workspace_memberships')
      .insert({
        workspace_id: context.wsB.id,
        user_id: context.woA.userId,
        granted_by: context.po.userId,
      });
    expect(grantDuringDel.error).not.toBeNull();

    const [woClaim] = await db<
      { id: string; lease_token: string }[]
    >`select id, lease_token from public.claim_account_deletion_intents(1)`;
    expect(woClaim?.id).toBe(woIntentId);
    const woBan = await admin().auth.admin.updateUserById(context.woA.userId, {
      ban_duration: '876000h',
    });
    expect(woBan.error).toBeNull();
    expect(
      (
        await db<
          { ok: boolean }[]
        >`select public.advance_deletion_step_a(${woIntentId}, ${woClaim!.lease_token}) as ok`
      )[0]?.ok,
    ).toBe(true);
    expect(
      (
        await db<
          { ok: boolean }[]
        >`select public.execute_deletion_step_b(${woIntentId}, ${woClaim!.lease_token}) as ok`
      )[0]?.ok,
    ).toBe(true);
    expect(
      (
        await db<
          { ok: boolean }[]
        >`select public.begin_deletion_step_c(${woIntentId}, ${woClaim!.lease_token}) as ok`
      )[0]?.ok,
    ).toBe(true);

    const wsBContext = await makeWorkspaceLink(context, context.wsB.id);
    const duringStaffPause = await signupRealClient(wsBContext, {
      email: context.woA.email,
    });
    expect(duringStaffPause.ok).toBe(false);

    await db`
      update app_private.account_deletion_intents
      set lease_token = null, lease_expires_at = null
      where id = ${woIntentId}
    `;
    const woDrained = await drainAccountDeletions(cronEnv);
    expect(woDrained.completed).toBeGreaterThanOrEqual(1);

    const [activeWoCount] = await db`
      select count(*)::int as count
      from public.workspace_memberships m
      join public.staff_profiles p on p.user_id = m.user_id
      where m.workspace_id = ${context.wsA.id}
        and m.revoked_at is null
        and p.role = 'workspace_owner'
    `;
    expect(activeWoCount?.count).toBe(0);
    const woAfterActor = await loadActorRows(
      context.woA.client,
      context.woA.userId,
    );
    expect(woAfterActor?.role).toBeNull();
    expect(
      authorize(woAfterActor!, 'approve_registration', context.wsA.id),
    ).toBe(false);

    const afterStaffRelease = await signupRealClient(wsBContext, {
      email: context.woA.email,
    });
    expect(afterStaffRelease.ok).toBe(true);

    const newWo = await createStaff('workspace_owner', 's64-new-wo');
    checked(
      await context.po.client.from('workspace_memberships').insert({
        workspace_id: context.wsA.id,
        user_id: newWo.userId,
        granted_by: context.po.userId,
      }),
    );

    // 2. Grant-first interleaving with staff deletion step (0) -> step (0) waits and step (B) revokes granted membership
    const salesRacer = await createStaff('sales', 's64-sales-grant-race');
    const grantBlocker = sql();
    let step0Wait!: Promise<unknown>;
    try {
      await grantBlocker.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })}, true)`;
        await tx`insert into public.workspace_memberships(workspace_id, user_id, granted_by)
          values (${context.wsA.id}, ${salesRacer.userId}, ${context.po.userId})`;
        step0Wait = Promise.resolve(
          context.po.client.rpc('request_account_deletion', {
            p_target_user_id: salesRacer.userId,
          }),
        );
        await waitForLockWait('request_account_deletion');
      });
      const step0Res = (await step0Wait) as { error: unknown };
      expect(step0Res.error).toBeNull();
      await drainAccountDeletions(cronEnv);
      const [salesActiveMemberships] = await db`
        select count(*)::int as count
        from public.workspace_memberships
        where user_id = ${salesRacer.userId} and revoked_at is null
      `;
      expect(salesActiveMemberships?.count).toBe(0);
    } finally {
      await grantBlocker.end();
    }

    // 3. Trainer deletion: reassigns client to eligible trainerBackup, keeps ended row
    const trainerBackup = await createStaff('trainer', 's64-trainer-backup');
    checked(
      await context.po.client.from('workspace_memberships').insert({
        workspace_id: context.wsA.id,
        user_id: trainerBackup.userId,
        granted_by: context.po.userId,
      }),
    );
    const activeClient = await signupRealClient(context);
    if (!activeClient.ok) throw new Error('Expected activeClient');
    await approveViaRpc(
      context.po.client,
      context.wsA.id,
      activeClient.clientId,
    );
    const assigned = await context.po.client.rpc(
      'assign_client_responsible_trainer',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: activeClient.clientId,
        p_trainer_user_id: context.trainerA.userId,
      },
    );
    expect(assigned.data).toMatchObject({ status: 'ok' });

    const trDel = await context.po.client.rpc('request_account_deletion', {
      p_target_user_id: context.trainerA.userId,
    });
    expect(trDel.error).toBeNull();
    await drainAccountDeletions(cronEnv);

    const [reassignedRow] = await db`
      select trainer_user_id, assignment_source, source_deletion_intent_id
      from public.client_trainer_assignments
      where workspace_id = ${context.wsA.id}
        and client_id = ${activeClient.clientId}
        and ended_at is null
    `;
    expect(reassignedRow).toEqual({
      trainer_user_id: trainerBackup.userId,
      assignment_source: 'trainer_deletion',
      source_deletion_intent_id: (trDel.data as { intent_id: string })
        .intent_id,
    });

    // 4. PO self-deletion while another valid PO exists (S41-PO-1 MCQ-20 = A)
    const selfDel = await extraPo.client.rpc('request_account_deletion', {
      p_target_user_id: extraPo.userId,
    });
    expect(selfDel.error).toBeNull();
    const selfActor = await loadActorRows(extraPo.client, extraPo.userId);
    expect(selfActor?.role).toBeNull();
    expect(authorize(selfActor!, 'manage_staff_access', context.wsA.id)).toBe(
      false,
    );
    await drainAccountDeletions(cronEnv);
    const [selfIntent] = await db`
      select state from app_private.account_deletion_intents
      where target_user_id = ${extraPo.userId}
    `;
    expect(selfIntent?.state).toBe('completed');

    // 5. FR-026 last-PO refusal & concurrent 2-PO race (T060)
    await db.begin(async (tx) => {
      await tx`update app_private.f3_platform_owner_state set owner_count = 1 where singleton`;
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })}, true)`;
      await expect(
        tx`select public.request_account_deletion(${context.po.userId})`,
      ).rejects.toMatchObject({ code: '42501', message: 'not_permitted' });
    });
    const poRacer = await createStaff('platform_owner', 's64-po-racer');
    await db`
      update app_private.f3_platform_owner_state
      set owner_count = 2
      where singleton
    `;
    try {
      const raceResults = await Promise.allSettled([
        context.po.client.rpc('request_account_deletion', {
          p_target_user_id: poRacer.userId,
        }),
        poRacer.client.rpc('request_account_deletion', {
          p_target_user_id: context.po.userId,
        }),
      ]);
      const fulfilled = raceResults.filter(
        (r) => r.status === 'fulfilled' && r.value.error === null,
      );
      expect(fulfilled).toHaveLength(1);
      const [poState] = await db`
        select owner_count from app_private.f3_platform_owner_state where singleton
      `;
      expect(Number(poState?.owner_count)).toBe(1);
    } finally {
      await db`
        update app_private.f3_platform_owner_state
        set owner_count = (
          select count(*)::bigint
          from public.staff_profiles s
          where s.role = 'platform_owner'
            and not exists (
              select 1 from app_private.account_deletion_intents i
              where i.target_user_id = s.user_id
            )
        )
        where singleton
      `;
    }
  });

  it('kills all seven S64-R46(5) required mutations and restores cleanly', async () => {
    const context = await clientContext();

    // (M1) Skip lease check in execute_deletion_step_b
    const clientM1 = await signupRealClient(context);
    if (!clientM1.ok) throw new Error('Expected clientM1');
    const step0M1 = await context.po.client.rpc('request_account_deletion', {
      p_target_user_id: clientM1.userId,
    });
    const intentM1 = (step0M1.data as { intent_id: string }).intent_id;
    const [claimM1] = await db<
      { lease_token: string }[]
    >`select lease_token from public.claim_account_deletion_intents(1) where id = ${intentM1}`;
    await admin().auth.admin.updateUserById(clientM1.userId, {
      ban_duration: '876000h',
    });
    await db`select public.advance_deletion_step_a(${intentM1}, ${claimM1!.lease_token})`;
    await expectMutationKilled(
      'public.execute_deletion_step_b(uuid,uuid)',
      (def) =>
        def.replace(/IF NOT valid_lease THEN RETURN false; END IF;/i, ''),
      async () => {
        const [res] = await db<
          { ok: boolean }[]
        >`select public.execute_deletion_step_b(${intentM1}, ${randomUUID()}) as ok`;
        expect(res?.ok).toBe(false);
      },
    );

    // (M2) Skip step-order check in deletion_execute_step_b (allowing pending_ban)
    const clientM2 = await signupRealClient(context);
    if (!clientM2.ok) throw new Error('Expected clientM2');
    const step0M2 = await context.po.client.rpc('request_account_deletion', {
      p_target_user_id: clientM2.userId,
    });
    const intentM2 = (step0M2.data as { intent_id: string }).intent_id;
    await expectMutationKilled(
      'app_private.deletion_execute_step_b(uuid)',
      (def) =>
        def
          .replace(
            /IF intent\.state <> 'banned_pending_db' OR intent\.banned_at IS NULL THEN\s*RETURN false;\s*END IF;/i,
            '',
          )
          .replace(
            /IF NOT FOUND OR u\.banned_until IS NULL OR u\.banned_until <= clock_timestamp\(\) THEN\s*RETURN false;\s*END IF;/i,
            '',
          ),
      async () => {
        const [res] = await db<
          { ok: boolean }[]
        >`select app_private.deletion_execute_step_b(${intentM2}) as ok`;
        expect(res?.ok).toBe(false);
      },
    );

    // (M3) Drop last-PO check in request_account_deletion
    await expectMutationKilled(
      'public.request_account_deletion(uuid,jsonb,bigint)',
      (def) =>
        def.replace(
          /IF v_owner_count IS NULL OR v_owner_count < 2 THEN/i,
          'IF false THEN',
        ),
      async () => {
        await db.begin(async (tx) => {
          await tx`update app_private.f3_platform_owner_state set owner_count = 1 where singleton`;
          await tx`select set_config('role', 'authenticated', true)`;
          await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: context.po.userId, role: 'authenticated' })}, true)`;
          await expect(
            tx`select public.request_account_deletion(${context.po.userId})`,
          ).rejects.toMatchObject({ code: '42501' });
        });
      },
    );

    // (M4) Skip Auth ban confirmation before (B)
    await admin().auth.admin.updateUserById(clientM2.userId, {
      ban_duration: 'none',
    });
    await db`update app_private.account_deletion_intents set state = 'banned_pending_db', banned_at = clock_timestamp() where id = ${intentM2}`;
    await expectMutationKilled(
      'app_private.deletion_execute_step_b(uuid)',
      (def) =>
        def.replace(
          /IF NOT FOUND OR u\.banned_until IS NULL OR u\.banned_until <= clock_timestamp\(\) THEN\s*RETURN false;\s*END IF;/i,
          '',
        ),
      async () => {
        const [res] = await db<
          { ok: boolean }[]
        >`select app_private.deletion_execute_step_b(${intentM2}) as ok`;
        expect(res?.ok).toBe(false);
      },
    );

    // (M5) Skip metadata-empty verification before (D)
    const clientM5 = await signupRealClient(context);
    if (!clientM5.ok) throw new Error('Expected clientM5');
    const step0M5 = await context.po.client.rpc('request_account_deletion', {
      p_target_user_id: clientM5.userId,
    });
    const intentM5 = (step0M5.data as { intent_id: string }).intent_id;
    const [claimM5] = await db<
      { lease_token: string }[]
    >`select lease_token from public.claim_account_deletion_intents(1) where id = ${intentM5}`;
    await admin().auth.admin.updateUserById(clientM5.userId, {
      ban_duration: '876000h',
    });
    await db`select public.advance_deletion_step_a(${intentM5}, ${claimM5!.lease_token})`;
    await db`select public.execute_deletion_step_b(${intentM5}, ${claimM5!.lease_token})`;
    await db`select public.begin_deletion_step_c(${intentM5}, ${claimM5!.lease_token})`;
    await admin().auth.admin.updateUserById(clientM5.userId, {
      email: `deleted+${intentM5}@deleted.invalid`,
      email_confirm: true,
      user_metadata: { leaked_key: 'still_present' },
    });
    await expectMutationKilled(
      'app_private.deletion_execute_step_d(uuid)',
      (def) =>
        def.replace(
          /OR coalesce\(u\.raw_user_meta_data, '\{\}'::jsonb\) <> '\{\}'::jsonb/i,
          '',
        ),
      async () => {
        const [res] = await db<
          { ok: boolean }[]
        >`select app_private.deletion_execute_step_d(${intentM5}) as ok`;
        expect(res?.ok).toBe(false);
      },
    );

    // (M6) Allow FR-025 confirmation reuse check bypass in request_account_deletion
    const clientM6a = await signupRealClient(context);
    const clientM6b = await signupRealClient(context);
    if (!clientM6a.ok || !clientM6b.ok) throw new Error('Expected M6 clients');
    await approveViaRpc(context.po.client, context.wsA.id, clientM6a.clientId);
    await approveViaRpc(context.po.client, context.wsA.id, clientM6b.clientId);
    const confM6 = await context.po.client.rpc(
      'record_deletion_financial_confirmation',
      {
        p_workspace_id: context.wsA.id,
        p_client_id: clientM6a.clientId,
        p_category: 'other',
        p_acknowledgement: FINANCIAL_RESOLUTION_ACKNOWLEDGEMENT.en,
      },
    );
    const confIdM6 = (confM6.data as { confirmation_audit_id: number })
      .confirmation_audit_id;
    await context.po.client.rpc('request_account_deletion', {
      p_target_user_id: clientM6a.userId,
      p_financial_confirmation_audit_id: confIdM6,
    });
    await expectMutationKilled(
      'public.request_account_deletion(uuid,jsonb,bigint)',
      (def) => def.replace(/OR v_conf_event\.target_id <> v_cid/i, ''),
      async () => {
        const res = await context.po.client.rpc('request_account_deletion', {
          p_target_user_id: clientM6b.userId,
          p_financial_confirmation_audit_id: confIdM6,
        });
        expect(res.error?.message).toContain('invalid_financial_confirmation');
      },
    );

    // (M7) Drop target denial at step (0) in client_has_access
    await expectMutationKilled(
      'app_private.client_has_access(uuid,uuid)',
      (def) => def.replace(/AND \(c\.deletion_state = 'active'\)/i, ''),
      async () => {
        const [res] = await db.begin(async (tx) => {
          await tx`select set_config('role', 'authenticated', true)`;
          await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: clientM6a.userId, role: 'authenticated' })}, true)`;
          return tx`select app_private.client_has_access(${context.wsA.id}, ${clientM6a.clientId}) as ok`;
        });
        expect(res?.ok).toBe(false);
      },
    );
  });
});
